import { loadHistoricalModel } from './helpers/historical-model.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { acceptHumanReview, completeFinalizedFeature, fingerprint, initializeFeature,
  migrateFeatureModel, pauseFeature, preflightFeatureFinalizationRecovery,
  projectRecord, proposeSlice, proposeChange, readFeatureRecord, recordFeatureTransition, recordFinalizationOutcome,
  recordGateOutcome, recordSliceTransition, recoverFeatureFinalization, requestBoundaryHumanReview,
  startFeatureFinalization, serializeJournal } from '../../plugin-src/shared/resources/protocol/index.js';
import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';
const cli = new URL('../bin/workflow.js', import.meta.url).pathname;

const exec = promisify(execFile);
const agent = { kind: 'agent', label: 'recovery fixture' };
const human = { kind: 'human-confirmed', label: 'explicit fixture user confirmation' };
const hash = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

async function fixture(t, { oldModel = false, finalScope = false, checkFalseFinal = false, badRecoveryTarget = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve recovery '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args])).stdout.trim();
  await git('init', '-b', 'main'); await git('config', 'user.name', 'Fixture');
  await git('config', 'user.email', 'fixture@example.invalid');
  await writeFile(join(root, '.git/info/exclude'), '.agentic-workflow.json\n');
  const home = join(root, 'docs/issues/recovery');
  let model = await loadHistoricalModel();
  if (badRecoveryTarget) model.feature.transitions.find((item) => item.id === 'recover-finalization').to = 'COMPLETE';
  if (oldModel) model = { ...model, modelVersion: '1.5.0', coreCompatibility: { minimum: '1.1.0', maximumExclusive: '2.0.0' },
    guardIds: model.guardIds.filter((id) => id !== 'feature.recovery.validated'),
    feature: { ...model.feature, transitions: model.feature.transitions.filter((item) => item.id !== 'recover-finalization') } };
  await initializeFeature({ featureHome: home, featureId: 'recovery', model, actor: agent, eventId: 'evt-init' });

  const spec = '# Spec\n| R1 | Value | Pass | Fail | Evidence |\n| R2 | Mode | Pass | Fail | Evidence |\n';
  const design = '# Design\n**Status:** approved\n';
  await writeFile(join(home, 'spec.md'), spec); await writeFile(join(home, 'design.md'), design);
  await writeFile(join(root, 'app.mjs'), 'export const value = 1; export const mode = "old";\n');
  const commit = async (message = 'fixture') => { await git('add', '.'); await git('commit', '-m', message); return git('rev-parse', 'HEAD'); };
  const base = await commit('Original feature base');
  await writeFile(join(root, '.agentic-workflow.json'), JSON.stringify({ schemaVersion: 1, featureId: 'recovery',
    repositories: { product: { path: '.', remote: 'origin', integrationBranch: 'main', featureBaseSha: base } } }));
  await git('switch', '-c', 'delivery');
  await recordFeatureTransition(home, 'approve-design', { actor: human, eventId: 'evt-design' });
  await recordFeatureTransition(home, 'validate-spec', { actor: agent, facts: { specValidationCurrent: true }, eventId: 'evt-spec' });
  await recordFeatureTransition(home, 'authorize-plan', { actor: human, eventId: 'evt-plan' });
  await proposeSlice(home, { sliceId: 'one', scope: finalScope ? 'FEATURE_FINAL' : 'SLICE', rubricCriteria: ['R1', 'R2'], actor: agent, eventId: 'evt-propose' });
  await recordSliceTransition(home, 'plan-slice', 'one', { actor: agent, eventId: 'evt-plan-slice' });
  await recordSliceTransition(home, 'start-slice', 'one', { actor: agent, facts: { sliceReadinessCurrent: true }, eventId: 'evt-start' });
  await writeFile(join(root, 'app.mjs'), 'export const value = 2; export const mode = "ready";\n');
  await writeFile(join(root, 'smoke.test.mjs'), 'import test from "node:test"; import assert from "node:assert/strict"; import { value, mode } from "./app.mjs"; test("contract", () => { assert.equal(value,2); assert.equal(mode,"ready"); });\n');
  const evaluated = await commit('Implemented source');
  await recordSliceTransition(home, 'begin-boundary', 'one', { actor: agent, eventId: 'evt-boundary', payload: {
    attemptId: 'a1', scope: finalScope ? 'FEATURE_FINAL' : 'SLICE', criteria: ['R1', 'R2'],
    context: { schemaVersion: 1, repositoryAlias: 'product', mergeBaseSha: base,
      evaluatedSourceSha: evaluated, featureBaseSha: base } } });
  const fingerprints = {};
  for (const gate of projectRecord(await readFeatureRecord(home)).boundaryAttempts[0].gates) {
    const outcome = gate.id === 'patternReview' ? 'NOT_APPLICABLE' : 'PASS';
    const r = await recordGateOutcome(home, { attemptId: 'a1', gateId: gate.id, outcome, inputs: { gateId: gate.id },
      currentFingerprints: fingerprints, evidence: outcome === 'PASS' ? { path: gate.id + '.md', hash: fingerprint(gate.id) } : null,
      reason: outcome === 'NOT_APPLICABLE' ? 'Fixture pattern scope not configured' : null, actor: agent, eventId: 'evt-' + gate.id });
    fingerprints[gate.id] = r.inputFingerprint;
  }
  await requestBoundaryHumanReview(home, { attemptId: 'a1', currentFingerprints: fingerprints, actor: agent, eventId: 'evt-request' });
  await acceptHumanReview(home, 'one', { actor: human, eventId: 'evt-accepted' });
  const reviewed = await commit('Retain accepted review');
  await git('switch', 'main'); await git('merge', '--no-ff', 'delivery', '-m', 'Merge fixture delivery');
  const integrated = await git('rev-parse', 'HEAD');
  await git('update-ref', 'refs/remotes/origin/main', integrated);
  if (checkFalseFinal) {
    const before = (await readFeatureRecord(home)).events.length;
    await assert.rejects(recordSliceTransition(home, 'record-merge', 'one', { actor: agent,
      facts: { reviewedContentMerged: true }, currentFingerprints: fingerprints,
      payload: { integrationSha: integrated, featureFinal: true } }), /actual FEATURE_FINAL/);
    assert.equal((await readFeatureRecord(home)).events.length, before);
  }
  await recordSliceTransition(home, 'record-merge', 'one', { actor: agent, facts: { reviewedContentMerged: true },
    currentFingerprints: fingerprints, eventId: 'evt-merge', payload: { integrationSha: integrated,
      reviewedBaseSha: base, reviewedHeadSha: reviewed, ...(finalScope ? { featureFinal: true } : {}) } });
  const requirements = { spec: { path: 'docs/issues/recovery/spec.md', hash: hash(spec) },
    design: { path: 'docs/issues/recovery/design.md', hash: hash(design) }, rubricIds: ['R1', 'R2'] };
  const source = { featureBaseSha: base, integrationSha: integrated, requirementsIdentity: fingerprint(requirements) };
  await mkdir(join(home, 'runtime/recovery'), { recursive: true });
  const save = async (name, value) => {
    const path = 'runtime/recovery/' + name;
    const bytes = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    await writeFile(join(home, path), bytes); return { path, hash: hash(bytes) };
  };
  const run = await exec(process.execPath, ['--test', 'smoke.test.mjs'], { cwd: root });
  const log = await save('checks.log', 'Selected FEATURE source ' + integrated + '\n' + run.stdout);
  const quote = 'Waive the whole-feature Judge for feature recovery at integrated source ' + integrated
    + ' with approved requirements ' + source.requirementsIdentity;
  const observed = await save('confirmation.md', quote + '\n');
  const common = { schemaVersion: 1, featureId: 'recovery', scope: 'FEATURE', source };
  const reports = {
    waiver: { ...common, kind: 'whole-feature-judge-waiver', obligation: 'whole-feature-judge',
      reason: 'Explicit fixture waiver, not a tooling failure or slice PASS.', confirmedBy: human,
      confirmation: { kind: 'observed-confirmation', quote, evidence: observed } },
    verification: { ...common, kind: 'feature-verification', outcome: 'PASS', checks:
      ['build', 'lint', 'unit', 'integration', 'endToEnd', 'runtime'].map((category) => category === 'unit'
        ? { category, outcome: 'PASS', command: 'node --test smoke.test.mjs', evidence: [log] }
        : { category, outcome: 'NOT_APPLICABLE', reason: 'This scratch fixture has only the executable unit contract.' }) },
    specEvaluation: { ...common, kind: 'feature-spec-evaluation', outcome: 'PASS', criteria:
      ['R1', 'R2'].map((id) => ({ id, result: 'PASS', explanation: 'Executed contract verifies the approved fixture behavior.', evidence: [log] })) },
    retention: { ...common, kind: 'feature-retention', outcome: 'TRACKED' },
  };
  const refs = {};
  for (const [key, report] of Object.entries(reports)) refs[key] = await save(key + '.json', report);
  await commit('Retain source-bound completion evidence');
  const input = { recoveryId: 'recovery-one', repositoryRoot: root, integrationSha: integrated, actor: agent,
    waiver: refs.waiver, evidence: { verification: refs.verification, specEvaluation: refs.specEvaluation, retention: refs.retention } };
  const refresh = async (key) => { const ref = await save(key + '.json', reports[key]); if (key === 'waiver') input.waiver = ref; else input.evidence[key] = ref; await commit('Revised evidence'); };
  return { root, home, input, reports, refs, source, save, refresh, commit, git, integrated, model };
}

async function rejectsWithoutWriting(f, expression = /recovery|scope|feature|source|waiver|evidence|delivery|retention|model|confirmation|integration|guard|review|merge|identity/iu) {
  const before = await readFile(join(f.home, 'events.jsonl'));
  const preflight = await preflightFeatureFinalizationRecovery(f.home, f.input);
  assert.equal(preflight.eligible, false); assert.ok(preflight.blockers.length);
  await assert.rejects(recoverFeatureFinalization(f.home, f.input), expression);
  assert.deepEqual(await readFile(join(f.home, 'events.jsonl')), before);
}

test('source-bound recovery appends one dedicated event, preserves merges and requires configured finalization', async (t) => {
  const f = await fixture(t); const before = (await readFeatureRecord(f.home)).events;
  const preflight = await preflightFeatureFinalizationRecovery(f.home, f.input); assert.equal(preflight.eligible, true, JSON.stringify(preflight));
  const result = await recoverFeatureFinalization(f.home, f.input);
  assert.equal(result.event.type, 'FEATURE_FINALIZATION_RECOVERED');
  assert.equal(result.projection.feature.state, 'FINALIZING');
  assert.deepEqual((await readFeatureRecord(f.home)).events.slice(0, before.length), before);
  const repeated = await recoverFeatureFinalization(f.home, f.input);
  assert.equal(repeated.alreadyRecorded, true); assert.equal(repeated.event.eventId, result.event.eventId);
  assert.equal((await readFeatureRecord(f.home)).events.length, before.length + 1);
  await assert.rejects(startFeatureFinalization(f.home, { attemptId: 'closeout', mergeInputSha: 'f'.repeat(40), actor: agent }), /match/);
  const started = await startFeatureFinalization(f.home, { attemptId: 'closeout', mergeInputSha: f.integrated, actor: agent });
  assert.equal(started.projection.finalizationAttempts[0].mergeInputSha, f.integrated);
  await assert.rejects(completeFinalizedFeature(f.home, { attemptId: 'closeout', actor: agent }), /not current/);
  for (const module of started.projection.finalizationAttempts[0].modules) await recordFinalizationOutcome(f.home, {
    attemptId: 'closeout', moduleId: module.id, outcome: 'PASS', evidence: { path: 'fixture-release.json', hash: fingerprint('fixture release') }, actor: agent });
  assert.equal((await completeFinalizedFeature(f.home, { attemptId: 'closeout', actor: agent })).projection.feature.state, 'COMPLETE');
  assert.equal((await recoverFeatureFinalization(f.home, f.input)).alreadyRecorded, true);
});

test('recovery preflight rejects invalid authority, scope, evidence and delivery without writing', async (t) => {
  const cases = {
    'general proceed is not a waiver': async (f) => { const ref = await f.save('confirmation.md', 'Proceed with work.\n'); f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote: 'Proceed with work.', evidence: ref }; await f.refresh('waiver'); },
    'ambiguous historical waiver': async (f) => { f.reports.waiver.confirmation.kind = 'historical-confirmation'; await f.refresh('waiver'); },
    'ambiguous observed Judge waiver': async (f) => {
      const quote = 'Waive the Judge';
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'wrong observed feature applicability': async (f) => {
      const quote = f.reports.waiver.confirmation.quote.replace('feature recovery', 'feature another');
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'feature name prefix is not applicability': async (f) => {
      const quote = f.reports.waiver.confirmation.quote.replace('feature recovery', 'feature recovery-other');
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'observed source without whole-feature scope': async (f) => {
      const quote = f.reports.waiver.confirmation.quote.replace('whole-feature', 'formal');
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'historical scope without source applicability': async (f) => {
      const quote = 'Proceed, waving the judge issue';
      const context = 'The whole-feature Judge was unavailable.';
      f.reports.waiver.confirmation = { kind: 'historical-confirmation', quote, context,
        evidence: await f.save('confirmation.md', context + '\n' + quote) };
      await f.refresh('waiver');
    },
    'wrong observed requirements applicability': async (f) => {
      const quote = f.reports.waiver.confirmation.quote.replace(f.source.requirementsIdentity, fingerprint('other requirements'));
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'unobserved approval context': async (f) => {
      const context = f.reports.waiver.confirmation.quote;
      const quote = 'Waive the Judge';
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, context, evidence: await f.save('confirmation.md', quote) };
      await f.refresh('waiver');
    },
    'nonhuman waiver': async (f) => { f.reports.waiver.confirmedBy = agent; await f.refresh('waiver'); },
    'wrong feature': async (f) => { f.reports.waiver.featureId = 'another'; await f.refresh('waiver'); },
    'changed requirement identity': async (f) => { f.reports.verification.source = { ...f.source, requirementsIdentity: fingerprint('wrong') }; await f.refresh('verification'); },
    'waiver quote for another source': async (f) => {
      const quote = 'Waive whole-feature Judge at ' + 'f'.repeat(40);
      f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote,
        evidence: await f.save('confirmation.md', quote) }; await f.refresh('waiver');
    },
    'slice report cannot be relabeled': async (f) => { f.reports.specEvaluation.criteria.pop(); await f.refresh('specEvaluation'); },
    'slice verification scope': async (f) => { f.reports.verification.scope = 'SLICE'; await f.refresh('verification'); },
    'missing verification category': async (f) => { f.reports.verification.checks.pop(); await f.refresh('verification'); },
    'unresolved spec criterion': async (f) => { f.reports.specEvaluation.criteria[0].result = 'FAIL'; await f.refresh('specEvaluation'); },
    'changed bound evidence': async (f) => { await writeFile(join(f.home, 'runtime/recovery/checks.log'), 'changed'); await f.commit(); },
    'empty matching evidence': async (f) => {
      const ref = await f.save('checks.log', '');
      f.reports.verification.checks.find((check) => check.outcome === 'PASS').evidence = [ref];
      for (const criterion of f.reports.specEvaluation.criteria) criterion.evidence = [ref];
      await f.refresh('verification'); await f.refresh('specEvaluation');
    },
    'unsafe evidence alias': async (f) => { await rm(join(f.home, 'runtime/recovery/checks.log')); await symlink(join(f.root, 'app.mjs'), join(f.home, 'runtime/recovery/checks.log')); await f.commit(); },
    'untracked retained file': async (f) => { await writeFile(join(f.home, 'untracked.md'), 'untracked feature record'); },
    'ignored untracked retained file': async (f) => {
      await writeFile(join(f.root, '.git/info/exclude'), '.agentic-workflow.json\ndocs/issues/recovery/ignored.md\n');
      await writeFile(join(f.home, 'ignored.md'), 'Ignored feature record is not retained in Git.');
    },
    'paused feature': async (f) => { await pauseFeature(f.home, { actor: agent }); },
    'unresolved delivery': async (f) => { await proposeSlice(f.home, { sliceId: 'pending', actor: agent }); },
    'blocking change': async (f) => { await proposeChange(f.home, { changeId: 'blocked', target: 'plan', rationale: 'Unresolved obligation', actor: agent }); },
    'missing stable identity': async (f) => { delete f.input.recoveryId; },
    'verification waiver without its own confirmation': async (f) => {
      f.reports.verification.outcome = 'WAIVED';
      f.reports.verification.waiver = { confirmedBy: human, obligation: 'feature-verification', reason: 'Do not run checks', evidence: [f.reports.waiver.confirmation.evidence] };
      await f.refresh('verification');
    },
    'verification waiver with ambiguous applicability': async (f) => {
      const quote = 'Waive whole-feature verification';
      const reference = await f.save('verification-confirmation.md', quote);
      f.reports.verification.outcome = 'WAIVED';
      f.reports.verification.waiver = { confirmedBy: human, obligation: 'feature-verification', reason: 'Fixture waiver',
        evidence: [reference], confirmation: { quote, evidence: reference } };
      await f.refresh('verification');
    },
    'workspace retention with ambiguous applicability': async (f) => {
      const quote = 'Keep the workspace for whole-feature completion';
      const reference = await f.save('retention-confirmation.md', quote);
      f.reports.retention = { ...f.reports.retention, outcome: 'HUMAN_RETAINED', confirmedBy: human,
        decision: 'retain-workspace', reason: 'Fixture retention', evidence: [reference], confirmation: { quote, evidence: reference } };
      await f.refresh('retention');
    },
    'unintegrated source': async (f) => { f.input.integrationSha = await f.git('rev-parse', 'HEAD'); },
    'missing accepted review': async (f) => {
      const r = await readFeatureRecord(f.home); const events = r.events.filter((e) => e.type !== 'HUMAN_REVIEW_ACCEPTED');
      events.forEach((e, i) => { e.sequence = i + 1; });
      await writeFile(join(f.home, 'events.jsonl'), serializeJournal(events)); await f.commit();
    },
    'forged integration claim': async (f) => {
      const r = await readFeatureRecord(f.home); r.events.find((e) => e.type === 'SLICE_MERGE_RECORDED')
        .payload.integrationSha = await f.git('rev-parse', 'HEAD');
      await writeFile(join(f.home, 'events.jsonl'), serializeJournal(r.events)); await f.commit();
    },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async (t) => { const f = await fixture(t); await mutate(f); await rejectsWithoutWriting(f); });
});

test('TRACKED recovery rejects ignored untracked reports, supporting evidence and confirmations', async (t) => {
  for (const name of ['verification.json', 'checks.log', 'confirmation.md']) await t.test(name, async (t) => {
    const f = await fixture(t);
    const path = 'docs/issues/recovery/runtime/recovery/' + name;
    await f.git('rm', '--cached', '--', path);
    await writeFile(join(f.root, '.git/info/exclude'), '.agentic-workflow.json\n' + path + '\n');
    await f.commit('Remove ignored evidence from retained Git record');
    // All source bindings and hashes remain valid, and ordinary status is clean.
    assert.equal(await f.git('status', '--porcelain=v1', '--untracked-files=all', '--', 'docs/issues/recovery'), '');
    await rejectsWithoutWriting(f, /tracked retention/);
  });
});

test('replay rejects altered receipts, merge provenance and human authority', async (t) => {
  const f = await fixture(t); await recoverFeatureFinalization(f.home, f.input);
  const record = await readFeatureRecord(f.home);
  const mutations = [
    (receipt) => { receipt.merges[0].eventHash = fingerprint('forged merge'); },
    (receipt) => { receipt.verification.checks.pop(); },
    (receipt) => { receipt.waiver.confirmedBy = agent; },
    (receipt) => { delete receipt.waiver.confirmation.evidence; },
    (receipt) => { receipt.waiver.confirmation.evidence.hash = 'not-a-digest'; },
    (receipt) => { receipt.waiver.confirmation.evidence.path = '../outside.md'; },
    (receipt) => { receipt.verification.checks.find((check) => check.outcome === 'PASS').evidence[0].path = '/outside.log'; },
    (receipt) => { receipt.specEvaluation.criteria[0].evidence[0].path = 'runtime/../outside.log'; },
    (receipt) => { delete receipt.references; },
    (receipt) => { delete receipt.references.waiver; },
    (receipt) => { receipt.references.waiver.hash = fingerprint('different waiver report'); },
    (receipt) => { [receipt.references.verification, receipt.references.specEvaluation] = [receipt.references.specEvaluation, receipt.references.verification]; },
    (receipt) => { receipt.references.other = { path: 'unbound.json', hash: fingerprint('unbound') }; },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(record); const event = forged.events.at(-1);
    mutate(event.payload.receipt); event.payload.receiptHash = fingerprint(event.payload.receipt);
    assert.throws(() => projectRecord(forged), /recovery/iu);
  }
  const forged = structuredClone(record);
  forged.events.at(-1).payload.requestIdentity = fingerprint('another request');
  assert.throws(() => projectRecord(forged), /recovery/iu);
});

test('explicit retention decision can preserve untracked records without claiming archival', async (t) => {
  const f = await fixture(t); f.reports.retention.outcome = 'HUMAN_RETAINED';
  f.reports.retention.confirmedBy = human; f.reports.retention.decision = 'retain-workspace';
  f.reports.retention.reason = 'Keep the workspace and its untracked notes for later retention.';
  const quote = 'Keep this workspace and its untracked records for whole-feature completion of feature recovery at '
    + f.integrated + ' with approved requirements ' + f.source.requirementsIdentity;
  const reference = await f.save('retention-confirmation.md', quote);
  f.reports.retention.evidence = [reference]; f.reports.retention.confirmation = { quote, evidence: reference };
  await f.refresh('retention');
  await writeFile(join(f.home, 'untracked.md'), 'User chose to retain this record.');
  assert.equal((await recoverFeatureFinalization(f.home, f.input)).projection.feature.state, 'FINALIZING');
  assert.equal(await readFile(join(f.home, 'untracked.md'), 'utf8'), 'User chose to retain this record.');
});

test('remaining verification waiver follows its own pinned policy and explicit confirmation', async (t) => {
  const f = await fixture(t); const quote = 'Waive whole-feature verification for feature recovery at ' + f.integrated
    + ' with approved requirements ' + f.source.requirementsIdentity;
  const reference = await f.save('verification-confirmation.md', quote);
  f.reports.verification.outcome = 'WAIVED';
  f.reports.verification.waiver = { confirmedBy: human, obligation: 'feature-verification',
    reason: 'Explicit fixture risk acceptance under the configured waiver policy.', evidence: [reference],
    confirmation: { quote, evidence: reference } };
  await f.refresh('verification');
  const r = await recoverFeatureFinalization(f.home, f.input);
  assert.equal(r.event.payload.receipt.verification.outcome, 'WAIVED');
  assert.equal(r.event.payload.receipt.specEvaluation.outcome, 'PASS');
});

test('plugin-local preflight and optional CLI share source identity, blockers and repeat-safe passage', async (t) => {
  const f = await fixture(t); const before = (await readFeatureRecord(f.home)).events.length;
  const result = await executePluginRequest({ operation: 'feature.recovery-preflight', cwd: f.root, input: f.input });
  assert.equal(result.ok, true); assert.equal(result.data.eligible, true);
  const path = join(f.root, 'recovery-input.json'); await writeFile(path, JSON.stringify(f.input));
  const run = await exec(process.execPath, [cli, 'feature', 'recovery-preflight', '--cwd', f.root, '--input-file', path, '--json']);
  const parsed = JSON.parse(run.stdout); assert.equal(parsed.data.eligible, true);
  assert.equal(parsed.data.requestIdentity, result.data.requestIdentity);
  assert.equal((await readFeatureRecord(f.home)).events.length, before);
  const recorded = await executePluginRequest({ operation: 'feature.recover-finalization', cwd: f.root, input: f.input });
  assert.equal(recorded.ok, true);
  const repeat = await exec(process.execPath, [cli, 'feature', 'recover-finalization', '--cwd', f.root, '--input-file', path, '--json']);
  assert.equal(JSON.parse(repeat.stdout).data.alreadyRecorded, true);
  assert.equal((await readFeatureRecord(f.home)).events.length, before + 1);
  await writeFile(path, JSON.stringify({ ...f.input, recoveryId: '' }));
  await assert.rejects(exec(process.execPath, [cli, 'feature', 'recovery-preflight', '--cwd', f.root, '--input-file', path, '--json']),
    (error) => error.code === 1 && JSON.parse(error.stdout).data.eligible === false);
});

test('completion accounts for every accepted slice in the selected assembled source', async (t) => {
  const f = await fixture(t); const sliceBase = await f.git('rev-parse', 'HEAD');
  await f.git('update-ref', 'refs/remotes/origin/main', sliceBase);
  await f.git('switch', '-c', 'delivery-two');
  await proposeSlice(f.home, { sliceId: 'two', scope: 'SLICE', rubricCriteria: ['R1', 'R2'], actor: agent });
  await recordSliceTransition(f.home, 'plan-slice', 'two', { actor: agent });
  await recordSliceTransition(f.home, 'start-slice', 'two', { actor: agent, facts: { sliceReadinessCurrent: true } });
  await writeFile(join(f.root, 'extra.txt'), 'assembled additional source\\n'); const evaluated = await f.commit();
  await recordSliceTransition(f.home, 'begin-boundary', 'two', { actor: agent, payload: { attemptId: 'a2', scope: 'SLICE',
    criteria: ['R1', 'R2'], context: { mergeBaseSha: sliceBase, evaluatedSourceSha: evaluated,
      featureBaseSha: f.source.featureBaseSha, repositoryAlias: 'product' } } });
  const fps = {}; const attempt = projectRecord(await readFeatureRecord(f.home)).boundaryAttempts.at(-1);
  for (const gate of attempt.gates) {
    const r = await recordGateOutcome(f.home, { attemptId: 'a2', gateId: gate.id, outcome: 'PASS',
      inputs: { gateId: gate.id }, currentFingerprints: fps, evidence: { path: gate.id + '.md', hash: fingerprint(gate.id) }, actor: agent });
    fps[gate.id] = r.inputFingerprint;
  }
  await requestBoundaryHumanReview(f.home, { attemptId: 'a2', actor: agent, currentFingerprints: fps });
  await acceptHumanReview(f.home, 'two', { actor: human }); const reviewed = await f.commit();
  await f.git('switch', 'main'); await f.git('merge', '--no-ff', 'delivery-two', '-m', 'Merge second fixture delivery');
  const source = await f.git('rev-parse', 'HEAD'); await f.git('update-ref', 'refs/remotes/origin/main', source);
  await recordSliceTransition(f.home, 'record-merge', 'two', { actor: agent, currentFingerprints: fps,
    facts: { reviewedContentMerged: true }, payload: { integrationSha: source, reviewedBaseSha: sliceBase, reviewedHeadSha: reviewed } });
  f.input.integrationSha = source;
  for (const report of Object.values(f.reports)) report.source = { ...f.source, integrationSha: source };
  const quote = 'Waive whole-feature Judge for feature recovery at ' + source
    + ' with approved requirements ' + f.source.requirementsIdentity;
  f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, evidence: await f.save('confirmation.md', quote) };
  const run = await exec(process.execPath, ['--test', 'smoke.test.mjs'], { cwd: f.root });
  const log = await f.save('checks.log', 'FEATURE source ' + source + '\\n' + run.stdout);
  f.reports.verification.checks.find((check) => check.outcome === 'PASS').evidence = [log];
  for (const criterion of f.reports.specEvaluation.criteria) criterion.evidence = [log];
  for (const key of Object.keys(f.reports)) await f.refresh(key);
  const r = await recoverFeatureFinalization(f.home, f.input);
  assert.deepEqual(r.event.payload.receipt.merges.map((merge) => merge.sliceId), ['one', 'two']);
  assert.ok(r.event.payload.receipt.merges.every((merge) => merge.proof.integrationSha === source));
});

test('historical whole-feature waiver can be explicitly bound without rewriting its source', async (t) => {
  const f = await fixture(t); const quote = 'Proceed, waving the judge issue';
  const context = 'The whole-feature Judge could not be constructed; waiver requested for feature recovery at '
    + f.integrated + ' with approved requirements ' + f.source.requirementsIdentity + '.';
  const original = context + '\nUser: ' + quote + '\n';
  const ref = await f.save('historical-decision.md', original);
  f.reports.waiver.confirmation = { kind: 'historical-confirmation', quote, context, evidence: ref }; await f.refresh('waiver');
  await recoverFeatureFinalization(f.home, f.input);
  assert.equal(await readFile(join(f.home, ref.path), 'utf8'), original);
});

test('an observed short waiver can use the exact bound approval context', async (t) => {
  const f = await fixture(t);
  const context = f.reports.waiver.confirmation.quote;
  const quote = 'Waive the Judge';
  const original = context + '\nUser: ' + quote + '\n';
  const ref = await f.save('observed-approval.md', original);
  f.reports.waiver.confirmation = { kind: 'observed-confirmation', quote, context, evidence: ref };
  await f.refresh('waiver');
  assert.equal((await recoverFeatureFinalization(f.home, f.input)).projection.feature.state, 'FINALIZING');
  assert.equal(await readFile(join(f.home, ref.path), 'utf8'), original);
});

test('older locks need explicit adoption and retain their historical attempts', async (t) => {
  const f = await fixture(t, { oldModel: true });
  const before = await readFeatureRecord(f.home); await rejectsWithoutWriting(f);
  await migrateFeatureModel({ featureHome: f.home, nextModel: await loadHistoricalModel(), confirmedBy: human, eventId: 'evt-adopt-recovery' });
  await f.commit('Explicit recovery model adoption');
  const current = await readFeatureRecord(f.home); assert.deepEqual(current.events.slice(0, before.events.length), before.events);
  assert.equal(projectRecord(current).boundaryAttempts[0].state, 'MERGED');
  assert.equal((await recoverFeatureFinalization(f.home, f.input)).projection.feature.state, 'FINALIZING');
});

test('ordinary feature-final merge stays on its original finalization path', async (t) => {
  const f = await fixture(t, { finalScope: true }); await rejectsWithoutWriting(f);
  assert.equal((await startFeatureFinalization(f.home, { attemptId: 'normal', mergeInputSha: f.integrated, actor: agent })).projection.feature.state, 'FINALIZING');
});

test('generic transitions cannot manufacture recovery and conflicting repeat identities reject', async (t) => {
  const f = await fixture(t, { checkFalseFinal: true }); const before = (await readFeatureRecord(f.home)).events.length;
  for (const id of ['begin-finalizing', 'recover-finalization']) await assert.rejects(recordFeatureTransition(f.home, id, {
    actor: agent, facts: { featureRecoveryValidated: true, reviewedContentMerged: true } }), /requires|Use/);
  assert.equal((await readFeatureRecord(f.home)).events.length, before);
  await recoverFeatureFinalization(f.home, f.input); f.input.waiver = { ...f.input.waiver, hash: fingerprint('another') };
  await rejectsWithoutWriting(f, /conflicts/);
});

test('an unsupported recovery target cannot bypass finalization modules', async (t) => {
  const f = await fixture(t, { badRecoveryTarget: true }); await rejectsWithoutWriting(f);
});
