import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadHistoricalModel } from './helpers/historical-model.js';
import { boundaryGateDefinitions, hashWorkflowPolicy, moduleDependencyEdges, resolveModuleGraph, validateResolvedModuleGraph } from '../../plugin-src/shared/resources/protocol/modules.js';
import { buildModelMigrationImpact, createModelLock, fingerprint, initializeFeature, loadDefaultModel, loadDefaultWorkflowPolicy, migrateFeatureModel, projectRecord, proposeSlice, readFeatureRecord, recordFeatureTransition, recordGateOutcome, recordSliceTransition } from '../../plugin-src/shared/resources/protocol/index.js';

const ordering = { 'gatereeve/judge': { after: ['gatereeve/code-review'] } };
function graphModel(base, policy) {
  const { readiness, ...moduleGraph } = resolveModuleGraph({ definitions: base.moduleGraph.modules, policy });
  return { ...structuredClone(base), moduleGraph, coreCompatibility: { ...base.coreCompatibility, minimum: '1.4.0' } };
}
async function policyFixture() {
  return { base: await loadDefaultModel(), policy: { ...await loadDefaultWorkflowPolicy(), schemaVersion: 2, ordering } };
}

test('schema-2 ordering preserves exact definitions and schema-1 hashes and round-trips independently', async () => {
  const { base, policy } = await policyFixture();const original = JSON.stringify(base);
  const resolved = resolveModuleGraph({ definitions: base.moduleGraph.modules, policy });
  const { readiness, ...graph } = resolved;
  assert.equal(validateResolvedModuleGraph(graph), graph);
  assert.equal(graph.schemaVersion, 2);assert.deepEqual(graph.ordering, ordering);
  for (const module of graph.modules) assert.deepEqual(module, base.moduleGraph.modules.find(m => m.id === module.id));
  assert.equal(JSON.stringify(base), original);
  assert.equal(hashWorkflowPolicy(await loadDefaultWorkflowPolicy()), base.moduleGraph.policyDigest);
  const reversed = { ...policy, modules: [...policy.modules].reverse() };
  assert.equal(hashWorkflowPolicy(reversed), hashWorkflowPolicy(policy));
  assert(moduleDependencyEdges(graph).some(e => e.from === 'gatereeve/code-review' && e.to === 'gatereeve/judge' && e.kind === 'owner'));
});

test('invalid shapes, endpoints, protected duplicates, cross-slot and cyclic owner links reject', async () => {
  const { base, policy } = await policyFixture();
  const cases = [null, [], { 'gatereeve/judge': { after: null } }, { 'gatereeve/judge': { after: ['gatereeve/judge'] } },
    { 'gatereeve/judge': { after: ['gatereeve/code-review', 'gatereeve/code-review'] } },
    { 'gatereeve/judge': { after: ['example/missing'] } }, { 'example/missing': { after: ['gatereeve/judge'] } },
    { 'gatereeve/judge': { after: ['gatereeve/verification'] } },
    { 'gatereeve/judge': { after: ['gatereeve/release'] } },
    { 'gatereeve/judge': { after: ['gatereeve/code-review'], priority: 1 } },
    { 'gatereeve/judge': { after: ['gatereeve/code-review'] }, 'gatereeve/code-review': { after: ['gatereeve/judge'] } }];
  for (const bad of cases) assert.throws(() => resolveModuleGraph({ definitions: base.moduleGraph.modules, policy: { ...policy, ordering: bad } }));
  assert.throws(() => resolveModuleGraph({ definitions: base.moduleGraph.modules, policy: { ...policy, schemaVersion: 1 } }), /unknown fields/);
  for (const id of ['gatereeve/pin-context', 'gatereeve/verification', 'gatereeve/explain-diff']) {
    assert.throws(() => resolveModuleGraph({ definitions: base.moduleGraph.modules, policy: { ...policy, modules: policy.modules.map(m => ({ ...m, enabled: m.id === id ? false : m.enabled })) } }), /Locked module|requires disabled/);
  }
});

test('owner links become dormant at either disabled endpoint and return on re-enablement', async () => {
  const { base, policy } = await policyFixture();
  for (const disabled of ['gatereeve/code-review', 'gatereeve/judge']) {
    const graph = resolveModuleGraph({ definitions: base.moduleGraph.modules, policy: { ...policy, modules: policy.modules.map(m => ({ ...m, enabled: m.id === disabled ? false : m.enabled })) } });
    assert.deepEqual(graph.ordering, ordering);assert(!moduleDependencyEdges(graph).some(e => e.kind === 'owner'));
  }
  assert(moduleDependencyEdges(resolveModuleGraph({ definitions: base.moduleGraph.modules, policy })).some(e => e.kind === 'owner'));
});

test('completion ordering blocks only its dependent and binds predecessor events for freshness; migration retains history', async () => {
  const base = await loadHistoricalModel();
  const policy = { schemaVersion: 2, modules: base.moduleGraph.modules.map(m => ({ id: m.id, version: m.version, digest: m.digest, enabled: base.moduleGraph.enabledModuleIds.includes(m.id) })), ordering };
  const model = graphModel(base, policy);const home = join(await mkdtemp(join(tmpdir(), 'gatereeve-ordering-')), 'feature');
  const agent = { kind: 'agent', label: 'ordering test' };const human = { kind: 'human-confirmed', label: 'owner approval' };
  await initializeFeature({ featureHome: home, featureId: 'ordering', actor: agent, model });
  for (const [transitionId, actor, facts] of [['approve-design', human, {}], ['validate-spec', agent, { specValidationCurrent: true }], ['authorize-plan', human, {}]]) await recordFeatureTransition(home, transitionId, { actor, facts });
  await proposeSlice(home, { sliceId: 's1', actor: agent });
  await recordSliceTransition(home, 'plan-slice', 's1', { actor: agent });await recordSliceTransition(home, 'start-slice', 's1', { actor: agent, facts: { sliceReadinessCurrent: true } });
  await recordSliceTransition(home, 'begin-boundary', 's1', { actor: agent, payload: { attemptId: 'a1', scope: 'SLICE', context: { headSha: 'a'.repeat(40) } } });
  const current = {};const record = async (gateId, revision = 1) => {
    const result = await recordGateOutcome(home, { attemptId: 'a1', gateId, outcome: 'PASS', inputs: { gateId, revision }, currentFingerprints: current, evidence: { path: `${gateId}.md`, hash: fingerprint({ gateId, revision }) }, actor: agent });current[gateId] = result.inputFingerprint;
  };
  for (const id of ['pinContext', 'reconcile', 'verification']) await record(id);
  const project = async () => projectRecord(await readFeatureRecord(home), { gateFingerprints: { a1: current } });
  let attempt = (await project()).boundaryAttempts[0];
  assert.equal(attempt.gates.find(g => g.id === 'judge').eligible, false);
  assert.equal(attempt.gates.find(g => g.id === 'specEvaluation').eligible, true);
  const before = (await readFeatureRecord(home)).events.length;
  await assert.rejects(record('judge'), /not eligible/);assert.equal((await readFeatureRecord(home)).events.length, before);
  await record('codeReview');await record('judge');await record('specEvaluation');
  await record('codeReview', 2);attempt = (await project()).boundaryAttempts[0];
  assert.equal(attempt.gates.find(g => g.id === 'judge').freshness, 'STALE');assert.equal(attempt.gates.find(g => g.id === 'specEvaluation').freshness, 'CURRENT');
  const judge = model.moduleGraph.modules.find(m => m.id === 'gatereeve/judge');assert.deepEqual(judge.dependsOn, ['gatereeve/verification']);
  assert(boundaryGateDefinitions(model).find(g => g.id === 'judge').dependsOn.includes('codeReview'));
  const createdAt = '2026-10-14T12:00:00.000Z';
  const impact = buildModelMigrationImpact(createModelLock(base, { createdAt }), createModelLock(model, { createdAt }));assert(impact.modulesChanged.includes('gatereeve/judge'));assert(impact.boundaryGateIdsInvalidated.includes('judge'));
  const baseline = await readFeatureRecord(home);
  await assert.rejects(migrateFeatureModel({ featureHome: home, nextModel: base, confirmedBy: human, expectedModelHash: `sha256:${'0'.repeat(64)}`, expectedJournalSequence: baseline.events.length }), /baseline changed/);
  assert.deepEqual((await readFeatureRecord(home)).events, baseline.events);
  await migrateFeatureModel({ featureHome: home, nextModel: base, confirmedBy: human, expectedModelHash: baseline.modelLock.modelHash, expectedJournalSequence: baseline.events.length });
  const historical = projectRecord(await readFeatureRecord(home)).boundaryAttempts[0];assert(historical.gates.find(g => g.id === 'judge').dependsOn.includes('codeReview'));
});
