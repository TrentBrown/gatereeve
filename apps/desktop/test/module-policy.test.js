import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  initializeFeature,
  migrateFeatureModel,
  readFeatureRecord,
} from '../../../plugin-src/shared/resources/protocol/feature.js';
import { recordFeatureTransition } from '../../../plugin-src/shared/resources/protocol/transitions.js';
import { loadDefaultModel } from '../../../plugin-src/shared/resources/protocol/model.js';
import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';
import { createModulePolicyManager } from '../main/module-policy.js';

test('ordering-only policy preview/apply preserves definitions, requires confirmation and retains links on later enablement edits', async () => {
  const context = await fixture('ordering');const manager = createModulePolicyManager();
  const settings = await manager.inspect(context.repositoryRoot, context.featureHome);
  const enabled = settings.modules.filter(m => m.enabled).map(m => m.id);
  const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };
  const before = await readFeatureRecord(context.featureHome);
  const preview = await manager.preview(context.repositoryRoot, context.featureHome, enabled, ordering);
  assert.equal(preview.valid, true);assert.deepEqual(preview.diff, []);assert.equal(preview.orderingChanged, true);
  assert(preview.edges.some(e => e.from === 'gatereeve/code-review' && e.to === 'gatereeve/judge' && e.kind === 'owner'));
  assert(preview.migrationImpact.modulesChanged.includes('gatereeve/judge'));
  assert.deepEqual((await readFeatureRecord(context.featureHome)).events, before.events);
  await assert.rejects(manager.apply(context.repositoryRoot, context.featureHome, enabled, { ordering }), /confirmation/);
  assert.deepEqual((await readFeatureRecord(context.featureHome)).events, before.events);
  await manager.apply(context.repositoryRoot, context.featureHome, enabled, { ordering, confirmedMigration: true, confirmationLabel: 'Owner confirmed exact ordering change', expectedPreviewFingerprint: preview.previewFingerprint });
  const after = await manager.inspect(context.repositoryRoot, context.featureHome);assert.deepEqual(after.ordering, ordering);assert.equal(after.migrationRequired, false);
  const eventCount = (await readFeatureRecord(context.featureHome)).events.length;
  await assert.rejects(manager.apply(context.repositoryRoot, context.featureHome, enabled, { ordering: {}, confirmedMigration: true, confirmationLabel: 'Stale owner preview', expectedPolicyDigest: settings.policyDigest }), /changed since preview/);
  assert.equal((await readFeatureRecord(context.featureHome)).events.length, eventCount);
  assert.deepEqual((await manager.inspect(context.repositoryRoot, context.featureHome)).ordering, ordering);
  const record = await readFeatureRecord(context.featureHome);assert.equal(record.modelLock.model.coreCompatibility.minimum, '1.4.0');
  assert.deepEqual(record.modelLock.model.moduleGraph.modules.find(m => m.id === 'gatereeve/judge'), before.modelLock.model.moduleGraph.modules.find(m => m.id === 'gatereeve/judge'));
  const disableCode = enabled.filter(id => id !== 'gatereeve/code-review');
  const next = await manager.preview(context.repositoryRoot, context.featureHome, disableCode);assert.deepEqual(next.ordering, ordering);assert.equal(next.valid, true);assert(!next.edges.some(e => e.kind === 'owner'));
  await manager.apply(context.repositoryRoot, context.featureHome, disableCode, { confirmedMigration: true, confirmationLabel: 'Owner disabled Code Review', expectedPreviewFingerprint: next.previewFingerprint });
  const saved = JSON.parse(await readFile(join(context.repositoryRoot, '.gatereeve/workflow.json')));assert.deepEqual(saved.ordering, ordering);assert.equal(saved.schemaVersion, 2);
  const restored = await manager.preview(context.repositoryRoot, context.featureHome, enabled);assert(restored.edges.some(e => e.kind === 'owner'));
  const invalid = await manager.preview(context.repositoryRoot, context.featureHome, enabled, { ...ordering, 'gatereeve/code-review': { after: ['gatereeve/judge'] } });assert.equal(invalid.valid, false);assert.match(invalid.error, /cycle/);
});

test('host confirmation rejects newly discovered modules and changed feature models even when saved policy digest is unchanged', async () => {
  for (const drift of ['catalog', 'feature']) {
    const context = await fixture(`preview-${drift}`);const manager = createModulePolicyManager();
    const settings = await manager.inspect(context.repositoryRoot, context.featureHome);const enabled = settings.modules.filter(m => m.enabled).map(m => m.id);
    const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };
    const preview = await manager.preview(context.repositoryRoot, context.featureHome, enabled, ordering);
    if (drift === 'catalog') {
      const base = await loadDefaultModel();const module = structuredClone(base.moduleGraph.modules.find(m => m.id === 'gatereeve/code-review'));
      module.id = 'test/new-review';module.label = 'New review';module.version = '1.0.0';module.boundary.gateId = 'newReview';module.enabledByDefault = false;module.digest = hashModuleDefinition(module);
      await mkdir(join(context.repositoryRoot, '.gatereeve/modules'), { recursive: true });await writeFile(join(context.repositoryRoot, '.gatereeve/modules/new-review.json'), JSON.stringify(module));
    } else {
      const other = await manager.preview(context.repositoryRoot, context.featureHome, enabled, { 'gatereeve/code-review': { after: ['gatereeve/pattern-review'] } });
      await migrateFeatureModel({ featureHome: context.featureHome, nextModel: other.nextModel, confirmedBy: { kind: 'human-confirmed', label: 'Separate owner migration' } });
    }
    const before = await readFeatureRecord(context.featureHome);
    assert.equal((await manager.inspect(context.repositoryRoot, context.featureHome)).policyDigest, settings.policyDigest);
    await assert.rejects(manager.apply(context.repositoryRoot, context.featureHome, enabled, { ordering, confirmedMigration: true, confirmationLabel: 'Old preview confirmation', expectedPolicyDigest: settings.policyDigest, expectedPreviewFingerprint: preview.previewFingerprint }), /Current preview confirmation/);
    assert.deepEqual((await readFeatureRecord(context.featureHome)).events, before.events);
    await assert.rejects(readFile(join(context.repositoryRoot, '.gatereeve/workflow.json')), { code: 'ENOENT' });
  }
});

test('pre-publication feature progress invalidates confirmation without publishing, and late guarded conflicts restore policy', async () => {
  for (const timing of ['prepare', 'migration']) {
    const context = await fixture(`late-${timing}`);let calls = 0;let changeAt = null;
    const progress = () => recordFeatureTransition(context.featureHome, 'approve-design', { actor: { kind: 'human-confirmed', label: 'Independent owner progress' } });
    const manager = createModulePolicyManager({
      async getAvailability() { calls += 1;if (calls === changeAt) await progress();return null; },
      async migrate(input) { if (timing === 'migration') await progress();return migrateFeatureModel(input); },
    });
    const settings = await manager.inspect(context.repositoryRoot, context.featureHome);const enabled = settings.modules.filter(m => m.enabled).map(m => m.id);
    const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };const preview = await manager.preview(context.repositoryRoot, context.featureHome, enabled, ordering);
    if (timing === 'prepare') changeAt = calls + 2;
    await assert.rejects(manager.apply(context.repositoryRoot, context.featureHome, enabled, { ordering, confirmedMigration: true, confirmationLabel: 'Earlier snapshot', expectedPreviewFingerprint: preview.previewFingerprint }), /changed during policy preparation|baseline changed/);
    await assert.rejects(readFile(join(context.repositoryRoot, '.gatereeve/workflow.json')), { code: 'ENOENT' });
    const after = await readFeatureRecord(context.featureHome);assert.equal(after.events.length, 2);assert.equal(after.events.at(-1).type, 'DESIGN_APPROVED');assert(!after.events.some(e => e.type === 'MODEL_MIGRATED'));
  }
});

test('competing policy application cannot overlap publication, core migration or rollback ownership', async () => {
  const context = await fixture('exclusive-publication');let release;let entered;
  const migrationStarted = new Promise(resolve => { entered = resolve; });
  const continueMigration = new Promise(resolve => { release = resolve; });
  const first = createModulePolicyManager({ async migrate(input) { entered();await continueMigration;return migrateFeatureModel(input); } });
  const second = createModulePolicyManager();
  const settings = await first.inspect(context.repositoryRoot, context.featureHome);const enabled = settings.modules.filter(m => m.enabled).map(m => m.id);
  const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };const preview = await first.preview(context.repositoryRoot, context.featureHome, enabled, ordering);
  const options = { ordering, confirmedMigration: true, confirmationLabel: 'Owner confirmed exact preview', expectedPreviewFingerprint: preview.previewFingerprint };
  const application = first.apply(context.repositoryRoot, context.featureHome, enabled, options);await migrationStarted;
  try {
    await assert.rejects(second.apply(context.repositoryRoot, context.featureHome, enabled, options), /locked by another operation/);
    assert.deepEqual(JSON.parse(await readFile(join(context.repositoryRoot, '.gatereeve/workflow.json'))).ordering, ordering);
  } finally { release(); }
  await application;
  assert.deepEqual((await first.inspect(context.repositoryRoot, context.featureHome)).ordering, ordering);
  assert.equal((await readFeatureRecord(context.featureHome)).events.filter(e => e.type === 'MODEL_MIGRATED').length, 1);
  await assert.rejects(readFile(join(context.repositoryRoot, '.gatereeve/workflow.json.lock')), { code: 'ENOENT' });
});

test('a confirmation fingerprint cannot move to another repository with identical catalog and model/journal IDs', async () => {
  const first = await fixture('identical-context');const second = await fixture('identical-context');const manager = createModulePolicyManager();
  const settings = await manager.inspect(first.repositoryRoot, first.featureHome);const enabled = settings.modules.filter(m => m.enabled).map(m => m.id);const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };
  const preview = await manager.preview(first.repositoryRoot, first.featureHome, enabled, ordering);
  await assert.rejects(manager.apply(second.repositoryRoot, second.featureHome, enabled, { ordering, confirmedMigration: true, confirmationLabel: 'Owner confirmed first context', expectedPreviewFingerprint: preview.previewFingerprint }), /Current preview confirmation/);
  assert.equal((await readFeatureRecord(second.featureHome)).events.length, 1);await assert.rejects(readFile(join(second.repositoryRoot, '.gatereeve/workflow.json')), { code: 'ENOENT' });
});

async function fixture(name) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `gatereeve-module-${name}-`));
  const featureHome = join(repositoryRoot, 'docs/issues/module-policy');
  await initializeFeature({
    featureHome,
    featureId: 'module-policy',
    actor: { kind: 'agent', label: 'module policy test' },
    eventId: `evt-${name}-init`,
    recordedAt: '2026-09-03T00:00:00.000Z',
  });
  return { repositoryRoot, featureHome };
}

test('module settings stage a complete policy and require explicit active-feature migration', async () => {
  const context = await fixture('apply');
  let sequence = 0;
  const manager = createModulePolicyManager({ randomId: () => `test-${sequence += 1}` });
  const before = await manager.inspect(context.repositoryRoot, context.featureHome);
  const judge = before.modules.find((module) => module.id === 'gatereeve/judge');
  assert.equal(before.policyExists, false);
  assert.equal(judge.enabled, true);
  assert.equal(judge.locked, false);

  const enabled = before.modules.filter((module) => module.enabled && module.id !== judge.id)
    .map((module) => module.id);
  const preview = await manager.preview(context.repositoryRoot, context.featureHome, enabled);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.autoEnabled, []);
  assert.deepEqual(preview.diff, [{ id: judge.id, before: true, after: false }]);
  assert(preview.migrationImpact.modulesChanged.includes(judge.id));

  await assert.rejects(
    manager.apply(context.repositoryRoot, context.featureHome, enabled),
    /migration confirmation is required/i,
  );
  await manager.apply(context.repositoryRoot, context.featureHome, enabled, {
    confirmedMigration: true,
    confirmationLabel: 'Trent',
  });

  const policy = JSON.parse(await readFile(
    join(context.repositoryRoot, '.gatereeve/workflow.json'),
    'utf8',
  ));
  assert.equal(policy.modules.find((module) => module.id === judge.id).enabled, false);
  const after = await manager.inspect(context.repositoryRoot, context.featureHome);
  assert.equal(after.policyExists, true);
  assert.equal(after.migrationRequired, false);
  assert.equal(after.modules.find((module) => module.id === judge.id).enabled, false);
  const record = await readFeatureRecord(context.featureHome);
  assert.equal(record.events.at(-1).type, 'MODEL_MIGRATED');
  assert.deepEqual(record.events.at(-1).actor, { kind: 'human-confirmed', label: 'Trent' });
});

test('module settings disclose dependents instead of silently cascading removals', async () => {
  const context = await fixture('dependencies');
  const manager = createModulePolicyManager();
  const settings = await manager.inspect(context.repositoryRoot, context.featureHome);
  const enabled = settings.modules
    .filter((module) => module.enabled && module.id !== 'gatereeve/verification')
    .map((module) => module.id);
  const preview = await manager.preview(context.repositoryRoot, context.featureHome, enabled);
  assert.equal(preview.valid, false);
  assert.match(preview.error, /Disable dependent modules too/);
  assert.deepEqual(
    preview.blockingDependents.map((module) => module.id).sort(),
    [
      'gatereeve/code-review',
      'gatereeve/judge',
      'gatereeve/pattern-review',
      'gatereeve/spec-evaluation',
    ],
  );
  assert.equal(preview.suggestedEnabledModuleIds.includes('gatereeve/verification'), false);
});

test('module policy writes refuse symlink targets', async () => {
  const context = await fixture('symlink');
  const outside = join(context.repositoryRoot, 'outside.json');
  await writeFile(outside, '{}\n');
  await mkdir(join(context.repositoryRoot, '.gatereeve'));
  await symlink(outside, join(context.repositoryRoot, '.gatereeve/workflow.json'));
  const manager = createModulePolicyManager();
  const settings = await manager.inspect(context.repositoryRoot, context.featureHome)
    .catch((error) => error);
  assert.match(settings.message, /regular file, not a symlink/);
});

test('newly enabled modules fail closed when their local implementation is unavailable', async () => {
  const context = await fixture('unavailable');
  const definition = {
    schemaVersion: 1,
    id: 'example/security-scan',
    version: '1.0.0',
    digest: `sha256:${'0'.repeat(64)}`,
    label: 'Security Scan',
    description: 'Project security scan.',
    slot: 'boundary.evaluation',
    dependsOn: ['gatereeve/verification'],
    disposition: 'optional',
    locked: false,
    enabledByDefault: false,
    waiverAllowed: true,
    evidence: { kind: 'reference', requiredFor: ['PASS', 'FAIL'] },
    fingerprint: { kind: 'boundary-gate-v1', dependencyBinding: 'event-ids' },
    boundary: {
      gateId: 'securityScan',
      evaluationScope: { SLICE: 'SLICE', FEATURE_FINAL: 'FEATURE' },
      guards: ['boundary.context.current'],
    },
    run: { kind: 'skill', skillId: 'example:security-scan' },
  };
  definition.digest = hashModuleDefinition(definition);
  await mkdir(join(context.repositoryRoot, '.gatereeve/modules'), { recursive: true });
  await writeFile(
    join(context.repositoryRoot, '.gatereeve/modules/security-scan.json'),
    `${JSON.stringify(definition, null, 2)}\n`,
  );
  const manager = createModulePolicyManager({
    getAvailability: async () => ({ skills: [], providers: [] }),
  });
  const settings = await manager.inspect(context.repositoryRoot, context.featureHome);
  const projectModule = settings.modules.find((module) => module.id === definition.id);
  assert.equal(projectModule.enabled, false);
  assert.deepEqual(projectModule.readiness, {
    status: 'unavailable', missing: [{ kind: 'skill', id: 'example:security-scan' }],
  });
  assert.deepEqual((await manager.preview(
    context.repositoryRoot,
    context.featureHome,
    settings.modules.filter((module) => module.enabled).map((module) => module.id),
  )).diff, []);
  const preview = await manager.preview(
    context.repositoryRoot,
    context.featureHome,
    [...settings.modules.filter((module) => module.enabled).map((module) => module.id), definition.id],
  );
  assert.equal(preview.valid, false);
  assert.match(preview.error, /Implementation unavailable: Security Scan/);
});

test('failed atomic creation neither writes policy nor deletes a colliding file', async () => {
  const context = await fixture('atomic');
  await mkdir(join(context.repositoryRoot, '.gatereeve'));
  const collision = join(context.repositoryRoot, '.gatereeve/workflow.json.collision.tmp');
  await writeFile(collision, 'owned by somebody else\n');
  const manager = createModulePolicyManager({ randomId: () => 'collision' });
  const settings = await manager.inspect(context.repositoryRoot, context.featureHome);
  const enabled = settings.modules
    .filter((module) => module.enabled && module.id !== 'gatereeve/judge')
    .map((module) => module.id);
  const before = await readFeatureRecord(context.featureHome);
  await assert.rejects(
    manager.apply(context.repositoryRoot, context.featureHome, enabled, {
      confirmedMigration: true,
      confirmationLabel: 'Trent',
    }),
    /EEXIST/,
  );
  assert.equal(await readFile(collision, 'utf8'), 'owned by somebody else\n');
  await assert.rejects(
    readFile(join(context.repositoryRoot, '.gatereeve/workflow.json'), 'utf8'),
    /ENOENT/,
  );
  assert.equal((await readFeatureRecord(context.featureHome)).events.length, before.events.length);
});


test('journal lock refusal restores the previous policy and leaves the confirmed change retryable',async()=>{
 for(const saved of [false,true]) {
  const context=await fixture('journal-lock');const manager=createModulePolicyManager();
  const path=join(context.repositoryRoot,'.gatereeve/workflow.json');
  if(saved){await mkdir(join(context.repositoryRoot,'.gatereeve'),{recursive:true});const {loadDefaultWorkflowPolicy}=await import('../../../plugin-src/shared/resources/protocol/model.js');await writeFile(path,JSON.stringify(await loadDefaultWorkflowPolicy())+'\n');}
  const before=saved?await readFile(path,'utf8'):null;
  const settings=await manager.inspect(context.repositoryRoot,context.featureHome);const enabled=settings.modules.filter(m=>m.enabled).map(m=>m.id);
  const ordering={'gatereeve/judge':{after:['gatereeve/code-review']}};
  const preview=await manager.preview(context.repositoryRoot,context.featureHome,enabled,ordering);
  const options={ordering,confirmedMigration:true,confirmationLabel:'Exact preview',expectedPreviewFingerprint:preview.previewFingerprint};
  const lock=join(context.featureHome,'events.jsonl.lock');await writeFile(lock,'busy');
  await assert.rejects(manager.apply(context.repositoryRoot,context.featureHome,enabled,options),error=>error.code==='JOURNAL_LOCKED');
  if(saved)assert.equal(await readFile(path,'utf8'),before);else await assert.rejects(readFile(path),{code:'ENOENT'});
  assert.equal((await readFeatureRecord(context.featureHome)).events.length,1);
  await assert.rejects(readFile(path+'.lock'),{code:'ENOENT'});
  await unlink(lock);const reloaded=await manager.preview(context.repositoryRoot,context.featureHome,enabled,ordering);
  assert.equal(reloaded.previewFingerprint,preview.previewFingerprint);
  await manager.apply(context.repositoryRoot,context.featureHome,enabled,options);
  assert.equal((await manager.inspect(context.repositoryRoot,context.featureHome)).migrationRequired,false);
 }
});
