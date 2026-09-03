import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  initializeFeature,
  readFeatureRecord,
} from '../../../plugin-src/shared/resources/protocol/feature.js';
import { hashModuleDefinition } from '../../../plugin-src/shared/resources/protocol/modules.js';
import { createModulePolicyManager } from '../main/module-policy.js';

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
