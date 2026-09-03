import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

import {
  BOUNDARY_SCOPES,
  GATE_FRESHNESS,
  GATE_OUTCOMES,
  PROTOCOL_VERSION,
} from './constants.js';
import { compareVersions } from './compatibility.js';
import { ContractError, ProtocolError } from './errors.js';
import { buildModelMigrationImpact } from './feature.js';
import { modelGraph } from './graph.js';
import {
  createModelLock,
  hashModel,
  loadDefaultModel,
  validateEvent,
  validateModelLock,
} from './model.js';
import { assessModuleReadiness, MODULE_SLOTS } from './modules.js';

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const DETAIL_SCHEMA_VERSION = 1;

const SOURCE_STATUSES = new Set(['current', 'unavailable', 'not-checked', 'incomplete']);
const READINESS_STATES = new Set(['available', 'ready', 'blocked']);
const ARTIFACT_STATUSES = new Set([
  'present',
  'pending',
  'missing',
  'changed',
  'stale',
  'optional',
  'not-applicable',
]);
const DETAIL_KINDS = new Set(['artifact', 'events', 'attempt', 'model']);
const PREREQUISITE_STATUSES = new Set(['pass', 'fail', 'unknown']);
const BOUNDARY_SCOPE_SET = new Set(BOUNDARY_SCOPES);
const GATE_EVALUATION_SCOPES = new Set(['SLICE', 'FEATURE']);
const GATE_OUTCOME_SET = new Set(GATE_OUTCOMES);
const GATE_FRESHNESS_SET = new Set(GATE_FRESHNESS);
const MILESTONE_STATUSES = new Set([
  'complete', 'active', 'pending', 'available', 'ready', 'blocked',
]);
const ARTIFACT_EXPECTATIONS = new Set([
  'required', 'pending', 'optional', 'not-applicable',
]);
const ARTIFACT_FORMATS = new Set(['markdown', 'json', 'jsonl', 'html', 'text']);
const MODULE_LIVE_STATUSES = new Set(['pending', 'running', 'waiting', 'blocked', 'unavailable']);
const MAX_TEXT_ARTIFACT_BYTES = 10 * 1024 * 1024;

const FEATURE_ARTIFACTS = Object.freeze([
  {
    id: 'interview',
    label: 'Design interview',
    path: 'interview.md',
    format: 'markdown',
    pendingStates: [],
    requiredStates: [
      'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES',
      'FINALIZING', 'COMPLETE', 'ABANDONED_FEATURE',
    ],
  },
  {
    id: 'design',
    label: 'Approved design',
    path: 'design.md',
    format: 'markdown',
    pendingStates: ['DESIGNING'],
    requiredStates: [
      'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES', 'FINALIZING', 'COMPLETE',
    ],
  },
  {
    id: 'spec',
    label: 'Validated specification',
    path: 'spec.md',
    format: 'markdown',
    pendingStates: ['SPECIFYING'],
    requiredStates: ['PLANNING', 'DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'plan',
    label: 'Authorized implementation plan',
    path: 'plan.md',
    format: 'markdown',
    pendingStates: ['PLANNING'],
    requiredStates: ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'issues',
    label: 'Operational issues',
    path: 'issues.md',
    format: 'markdown',
    pendingStates: ['PLANNING'],
    requiredStates: ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'tracker',
    label: 'Rubric tracker',
    path: 'tracker.md',
    format: 'markdown',
    pendingStates: ['PLANNING'],
    requiredStates: ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'scratchpad',
    label: 'Decision scratchpad',
    path: 'scratchpad.md',
    format: 'markdown',
    pendingStates: ['PLANNING'],
    requiredStates: ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'decisions',
    label: 'Permanent decisions',
    path: 'decisions.md',
    format: 'markdown',
    pendingStates: ['PLANNING'],
    requiredStates: ['DELIVERING_SLICES', 'FINALIZING', 'COMPLETE'],
  },
  {
    id: 'completion-report',
    label: 'Feature completion report',
    path: 'completion-report.md',
    format: 'markdown',
    pendingStates: [
      'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES', 'FINALIZING',
    ],
    requiredStates: ['COMPLETE'],
  },
]);

const GATE_ARTIFACT_NAMES = Object.freeze({
  pinContext: 'boundary.json',
  verification: 'verification.md',
  specEvaluation: 'spec-evaluation.md',
  patternReview: 'pattern-review.md',
  judge: 'judge.md',
  codeReview: 'code-review.md',
  explainDiff: 'explain-diff.html',
  packetValidation: 'boundary.json',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) throw new ContractError(`${label} must be an object`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new ContractError(`${label} must be an array`);
}

function assertString(value, label, { nullable = false, allowEmpty = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new ContractError(
      `${label} must be ${nullable ? 'null or ' : ''}a${allowEmpty ? '' : ' nonempty'} string`
    );
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') throw new ContractError(`${label} must be boolean`);
}

function assertInteger(value, label, { nullable = false, minimum = 0 } = {}) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < minimum) {
    throw new ContractError(
      `${label} must be ${nullable ? 'null or ' : ''}an integer of at least ${minimum}`
    );
  }
}

function assertStringArray(value, label) {
  assertArray(value, label);
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function assertNullableObject(value, label) {
  if (value !== null) assertObject(value, label);
}

function assertOneOf(value, allowed, label) {
  if (!allowed.has(value)) throw new ContractError(`${label} has invalid value ${value}`);
}

function validateModuleLive(value, label) {
  if (value === null) return;
  assertObject(value, label);
  assertOneOf(value.status, MODULE_LIVE_STATUSES, `${label}.status`);
  if (value.detail !== undefined) assertString(value.detail, `${label}.detail`, { nullable: true });
  if (value.updatedAt !== undefined) assertString(value.updatedAt, `${label}.updatedAt`, { nullable: true });
  for (const field of ['stages', 'actions', 'attempts', 'evidence', 'links']) {
    if (value[field] === undefined) continue;
    assertArray(value[field], `${label}.${field}`);
    value[field].forEach((item, index) => assertObject(item, `${label}.${field}[${index}]`));
  }
  if (value.failure !== undefined) assertNullableObject(value.failure, `${label}.failure`);
}

function validateActor(actor, label) {
  assertObject(actor, label);
  assertString(actor.kind, `${label}.kind`);
  assertString(actor.label, `${label}.label`);
}

function validateGate(gate, label) {
  assertObject(gate, label);
  assertString(gate.id, `${label}.id`);
  assertStringArray(gate.dependsOn, `${label}.dependsOn`);
  assertInteger(gate.dependencyStage, `${label}.dependencyStage`, { minimum: 1 });
  assertString(gate.dependencyBranch, `${label}.dependencyBranch`, { nullable: true });
  assertString(gate.orderLabel, `${label}.orderLabel`);
  assertOneOf(gate.evaluationScope, GATE_EVALUATION_SCOPES, `${label}.evaluationScope`);
  assertBoolean(gate.optional, `${label}.optional`);
  assertBoolean(gate.waiverAllowed, `${label}.waiverAllowed`);
  assertOneOf(gate.outcome, GATE_OUTCOME_SET, `${label}.outcome`);
  assertOneOf(gate.freshness, GATE_FRESHNESS_SET, `${label}.freshness`);
  assertBoolean(gate.eligible, `${label}.eligible`);
  assertArray(gate.blockers, `${label}.blockers`);
  gate.blockers.forEach((blocker, index) => assertObject(blocker, `${label}.blockers[${index}]`));
  assertNullableObject(gate.evidence, `${label}.evidence`);
  assertString(gate.inputFingerprint, `${label}.inputFingerprint`, { nullable: true });
  assertString(gate.recordedEventId, `${label}.recordedEventId`, { nullable: true });
  assertInteger(gate.recordedSequence, `${label}.recordedSequence`, {
    nullable: true,
    minimum: 1,
  });
  assertInteger(gate.invalidatedSequence, `${label}.invalidatedSequence`, {
    nullable: true,
    minimum: 1,
  });
  assertString(gate.reason, `${label}.reason`, { nullable: true });
}

function validateAttempt(attempt, label) {
  assertObject(attempt, label);
  assertString(attempt.id, `${label}.id`);
  assertString(attempt.sliceId, `${label}.sliceId`);
  assertOneOf(attempt.scope, BOUNDARY_SCOPE_SET, `${label}.scope`);
  assertNullableObject(attempt.context, `${label}.context`);
  assertString(attempt.startedBy, `${label}.startedBy`);
  assertInteger(attempt.startedSequence, `${label}.startedSequence`, { minimum: 1 });
  assertString(attempt.state, `${label}.state`);
  assertArray(attempt.gates, `${label}.gates`);
  attempt.gates.forEach((gate, index) => validateGate(gate, `${label}.gates[${index}]`));
  assertBoolean(attempt.requiredCurrentAndNonblocking, `${label}.requiredCurrentAndNonblocking`);
}

function validateFinalizationAttempt(attempt, label) {
  assertObject(attempt, label);
  assertString(attempt.id, `${label}.id`);
  assertString(attempt.mergeInputSha, `${label}.mergeInputSha`);
  assertString(attempt.startedBy, `${label}.startedBy`);
  assertInteger(attempt.startedSequence, `${label}.startedSequence`, { minimum: 1 });
  assertString(attempt.state, `${label}.state`);
  assertArray(attempt.modules, `${label}.modules`);
  attempt.modules.forEach((module, index) => {
    const item = `${label}.modules[${index}]`;
    assertObject(module, item);
    for (const field of ['id', 'moduleId', 'moduleVersion', 'moduleDigest', 'orderLabel']) {
      assertString(module[field], `${item}.${field}`);
    }
    assertStringArray(module.dependsOn, `${item}.dependsOn`);
    assertInteger(module.dependencyStage, `${item}.dependencyStage`, { minimum: 1 });
    assertString(module.dependencyBranch, `${item}.dependencyBranch`, { nullable: true });
    for (const field of ['optional', 'locked', 'waiverAllowed', 'eligible']) {
      assertBoolean(module[field], `${item}.${field}`);
    }
    assertOneOf(module.outcome, GATE_OUTCOME_SET, `${item}.outcome`);
    assertOneOf(module.freshness, GATE_FRESHNESS_SET, `${item}.freshness`);
    assertArray(module.blockers, `${item}.blockers`);
    assertNullableObject(module.evidence, `${item}.evidence`);
    assertString(module.inputFingerprint, `${item}.inputFingerprint`, { nullable: true });
    assertString(module.recordedEventId, `${item}.recordedEventId`, { nullable: true });
    assertInteger(module.recordedSequence, `${item}.recordedSequence`, { nullable: true, minimum: 1 });
    assertInteger(module.invalidatedSequence, `${item}.invalidatedSequence`, { nullable: true, minimum: 1 });
    assertString(module.reason, `${item}.reason`, { nullable: true });
  });
  assertBoolean(attempt.requiredCurrentAndNonblocking, `${label}.requiredCurrentAndNonblocking`);
}

function validateProjection(projection, label) {
  assertObject(projection, label);
  assertInteger(projection.schemaVersion, `${label}.schemaVersion`, { minimum: 1 });
  assertString(projection.mode, `${label}.mode`);
  assertString(projection.featureId, `${label}.featureId`);
  assertObject(projection.model, `${label}.model`);
  for (const field of ['id', 'version', 'hash']) {
    assertString(projection.model[field], `${label}.model.${field}`);
  }
  assertObject(projection.feature, `${label}.feature`);
  assertString(projection.feature.state, `${label}.feature.state`);
  assertObject(projection.suspension, `${label}.suspension`);
  assertBoolean(projection.suspension.paused, `${label}.suspension.paused`);
  assertObject(projection.implementationAuthorization, `${label}.implementationAuthorization`);
  assertBoolean(
    projection.implementationAuthorization.current,
    `${label}.implementationAuthorization.current`
  );
  assertArray(projection.slices, `${label}.slices`);
  projection.slices.forEach((slice, index) => {
    const item = `${label}.slices[${index}]`;
    assertObject(slice, item);
    assertInteger(slice.deliveryOrdinal, `${item}.deliveryOrdinal`, { minimum: 1 });
    for (const field of ['id', 'state', 'name', 'proposedBy', 'latestEventId']) {
      assertString(slice[field], `${item}.${field}`);
    }
    assertString(slice.branch, `${item}.branch`, { nullable: true });
    assertString(slice.scope, `${item}.scope`, { nullable: true });
    assertStringArray(slice.planSteps, `${item}.planSteps`);
    assertStringArray(slice.rubricCriteria, `${item}.rubricCriteria`);
    assertString(slice.activeAttemptId, `${item}.activeAttemptId`, { nullable: true });
  });
  assertString(projection.activeSliceId, `${label}.activeSliceId`, { nullable: true });
  assertArray(projection.boundaryAttempts, `${label}.boundaryAttempts`);
  projection.boundaryAttempts.forEach((attempt, index) => {
    validateAttempt(attempt, `${label}.boundaryAttempts[${index}]`);
  });
  assertArray(projection.finalizationAttempts, `${label}.finalizationAttempts`);
  projection.finalizationAttempts.forEach((attempt, index) => {
    validateFinalizationAttempt(attempt, `${label}.finalizationAttempts[${index}]`);
  });
  assertInteger(projection.finalizationModuleCount, `${label}.finalizationModuleCount`);
  assertArray(projection.changes, `${label}.changes`);
  projection.changes.forEach((change, index) => {
    const item = `${label}.changes[${index}]`;
    assertObject(change, item);
    for (const field of ['id', 'target', 'state']) assertString(change[field], `${item}.${field}`);
  });
  assertStringArray(projection.blockingChangeIds, `${label}.blockingChangeIds`);
  assertStringArray(projection.acceptedReviewSliceIds, `${label}.acceptedReviewSliceIds`);
  assertObject(projection.journal, `${label}.journal`);
  assertInteger(projection.journal.eventCount, `${label}.journal.eventCount`);
  assertString(projection.journal.lastEventId, `${label}.journal.lastEventId`);
  assertInteger(projection.journal.lastSequence, `${label}.journal.lastSequence`, { minimum: 1 });
}

function validateModelProvenance(model, label) {
  assertObject(model, label);
  for (const section of ['pinned', 'bundled', 'catalog', 'migration']) {
    assertObject(model[section], `${label}.${section}`);
  }
  for (const field of ['id', 'version', 'hash', 'coreVersion', 'createdAt']) {
    assertString(model.pinned[field], `${label}.pinned.${field}`);
  }
  for (const field of ['id', 'version', 'hash', 'protocolVersion']) {
    assertString(model.bundled[field], `${label}.bundled.${field}`);
  }
  assertBoolean(model.catalog.supported, `${label}.catalog.supported`);
  assertInteger(model.catalog.version, `${label}.catalog.version`, { nullable: true, minimum: 1 });
  assertBoolean(model.migration.available, `${label}.migration.available`);
  assertString(model.migration.relationship, `${label}.migration.relationship`);
  assertNullableObject(model.migration.impact, `${label}.migration.impact`);
}

function validateArtifact(artifact, label) {
  assertObject(artifact, label);
  assertString(artifact.id, `${label}.id`);
  assertString(artifact.label, `${label}.label`);
  assertObject(artifact.context, `${label}.context`);
  assertString(artifact.context.kind, `${label}.context.kind`);
  assertString(artifact.path, `${label}.path`, { nullable: true });
  assertString(artifact.absolutePath, `${label}.absolutePath`, { nullable: true });
  if (artifact.format !== null) assertOneOf(artifact.format, ARTIFACT_FORMATS, `${label}.format`);
  assertOneOf(artifact.expectation, ARTIFACT_EXPECTATIONS, `${label}.expectation`);
  assertOneOf(artifact.status, ARTIFACT_STATUSES, `${label}.status`);
  assertBoolean(artifact.exists, `${label}.exists`);
  assertBoolean(artifact.unsafe, `${label}.unsafe`);
  assertInteger(artifact.size, `${label}.size`, { nullable: true });
  assertString(artifact.modifiedAt, `${label}.modifiedAt`, { nullable: true });
  assertNullableObject(artifact.evidence, `${label}.evidence`);
}

function validateGraph(graph, label) {
  assertObject(graph, label);
  assertInteger(graph.schemaVersion, `${label}.schemaVersion`, { minimum: 1 });
  assertString(graph.kind, `${label}.kind`);
  assertArray(graph.nodes, `${label}.nodes`);
  graph.nodes.forEach((node, index) => {
    const item = `${label}.nodes[${index}]`;
    assertObject(node, item);
    for (const field of ['id', 'label', 'group']) assertString(node[field], `${item}.${field}`);
    if (node.status !== undefined) assertString(node.status, `${item}.status`);
  });
  assertArray(graph.edges, `${label}.edges`);
  graph.edges.forEach((edge, index) => {
    const item = `${label}.edges[${index}]`;
    assertObject(edge, item);
    for (const field of ['id', 'from', 'to', 'label']) assertString(edge[field], `${item}.${field}`);
    if (edge.authority !== undefined) assertString(edge.authority, `${item}.authority`);
  });
  assertString(graph.mermaid, `${label}.mermaid`);
}

function validateFullEvent(event, label) {
  try {
    validateEvent(event);
  } catch (error) {
    throw new ContractError(`${label} is invalid: ${error.message}`);
  }
}

function isWithin(root, target) {
  const child = relative(resolve(root), resolve(target));
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function formatForPath(path) {
  switch (extname(path).toLowerCase()) {
    case '.md': return 'markdown';
    case '.json': return 'json';
    case '.jsonl': return 'jsonl';
    case '.html': return 'html';
    default: return 'text';
  }
}

function factResult(value) {
  if (value === undefined) return { status: 'unknown', evidence: null };
  if (isObject(value)) {
    return {
      status: value.passed === true ? 'pass' : 'fail',
      evidence: value.evidence ?? null,
    };
  }
  return { status: value === true ? 'pass' : 'fail', evidence: null };
}

function sourceStatus(name, input, fallback) {
  const value = isObject(input) ? input : {};
  const status = value.status ?? fallback;
  if (!SOURCE_STATUSES.has(status)) {
    throw new ContractError(`Source ${name} has invalid status ${status}`);
  }
  return {
    status,
    detail: typeof value.detail === 'string' ? value.detail : null,
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : null,
  };
}

export function normalizeSourceStatuses(mode, sources = {}) {
  if (!isObject(sources)) throw new ContractError('Snapshot sources must be an object');
  return {
    local: sourceStatus(
      'local',
      sources.local,
      mode === 'governed' ? 'current' : mode === 'missing' ? 'unavailable' : 'incomplete'
    ),
    git: sourceStatus('git', sources.git, 'not-checked'),
    github: sourceStatus('github', sources.github, 'not-checked'),
  };
}

async function fileMetadata(featureHome, path) {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(featureHome, path);
  if (!isWithin(featureHome, absolutePath)) {
    return { exists: false, unsafe: true, absolutePath: null, size: null, modifiedAt: null };
  }
  try {
    const [rootPath, artifactPath] = await Promise.all([
      realpath(featureHome),
      realpath(absolutePath),
    ]);
    if (!isWithin(rootPath, artifactPath)) {
      return { exists: false, unsafe: true, absolutePath: null, size: null, modifiedAt: null };
    }
    const info = await stat(artifactPath);
    return {
      exists: info.isFile(),
      unsafe: false,
      absolutePath: artifactPath,
      size: info.isFile() ? info.size : null,
      modifiedAt: info.isFile() ? info.mtime.toISOString() : null,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, unsafe: false, absolutePath, size: null, modifiedAt: null };
    }
    throw error;
  }
}

function expectationFor(definition, state) {
  if (definition.requiredStates.includes(state)) return 'required';
  if (definition.pendingStates.includes(state)) return 'pending';
  return 'not-applicable';
}

function artifactStatus(expectation, metadata, override) {
  if (metadata.unsafe) return 'missing';
  if (metadata.exists) {
    if (['changed', 'stale'].includes(override)) return override;
    return 'present';
  }
  if (expectation === 'required') return 'missing';
  if (expectation === 'pending') return 'pending';
  if (expectation === 'optional') return 'optional';
  return 'not-applicable';
}

async function featureArtifacts(featureHome, state, facts) {
  const supplied = isObject(facts.artifacts) ? facts.artifacts : {};
  return Promise.all(FEATURE_ARTIFACTS.map(async (definition) => {
    const metadata = await fileMetadata(featureHome, definition.path);
    const expectation = expectationFor(definition, state);
    const override = supplied[definition.id]?.status ?? supplied[definition.path]?.status;
    if (override !== undefined && !ARTIFACT_STATUSES.has(override)) {
      throw new ContractError(`Artifact ${definition.id} has invalid supplied status ${override}`);
    }
    return {
      id: definition.id,
      label: definition.label,
      context: { kind: 'feature', state },
      path: definition.path,
      absolutePath: metadata.absolutePath,
      format: definition.format,
      expectation,
      status: artifactStatus(expectation, metadata, override),
      exists: metadata.exists,
      unsafe: metadata.unsafe,
      size: metadata.size,
      modifiedAt: metadata.modifiedAt,
      evidence: supplied[definition.id]?.evidence ?? supplied[definition.path]?.evidence ?? null,
    };
  }));
}

function packetPath(attempt) {
  for (const key of ['packetPath', 'activePacketPath', 'packet']) {
    if (typeof attempt.context?.[key] === 'string') return attempt.context[key];
  }
  return null;
}

async function boundaryArtifacts(featureHome, projection, facts) {
  const supplied = isObject(facts.artifacts) ? facts.artifacts : {};
  const artifacts = [];
  for (const attempt of projection.boundaryAttempts) {
    for (const gate of attempt.gates) {
      const id = `attempt:${attempt.id}:gate:${gate.id}`;
      const fallbackName = GATE_ARTIFACT_NAMES[gate.id] ?? null;
      const base = packetPath(attempt);
      const path = typeof gate.evidence?.path === 'string'
        ? gate.evidence.path
        : base && fallbackName
          ? resolve(base, fallbackName)
          : null;
      const expectation = gate.outcome === 'NOT_APPLICABLE'
        ? 'not-applicable'
        : gate.optional
          ? 'optional'
          : 'required';
      const metadata = path
        ? await fileMetadata(featureHome, path)
        : { exists: false, unsafe: false, absolutePath: null, size: null, modifiedAt: null };
      let status;
      if (gate.outcome === 'NOT_APPLICABLE') status = 'not-applicable';
      else if (metadata.exists && gate.freshness === 'STALE') status = 'stale';
      else if (metadata.exists) status = 'present';
      else if (gate.outcome !== 'UNSET' && path) status = 'missing';
      else status = gate.optional ? 'optional' : 'pending';
      const override = supplied[id]?.status;
      if (override !== undefined) {
        if (!ARTIFACT_STATUSES.has(override)) {
          throw new ContractError(`Artifact ${id} has invalid supplied status ${override}`);
        }
        status = override;
      }
      artifacts.push({
        id,
        label: `${gate.id} evidence`,
        context: { kind: 'gate', attemptId: attempt.id, gateId: gate.id },
        path,
        absolutePath: metadata.absolutePath,
        format: path ? formatForPath(path) : fallbackName ? formatForPath(fallbackName) : null,
        expectation,
        status,
        exists: metadata.exists,
        unsafe: metadata.unsafe,
        size: metadata.size,
        modifiedAt: metadata.modifiedAt,
        evidence: supplied[id]?.evidence ?? gate.evidence ?? null,
      });
    }
  }
  return artifacts;
}

function artifactById(artifacts, id) {
  return artifacts.find((artifact) => artifact.id === id) ?? null;
}

async function markdownStatus(artifact) {
  if (!artifact?.exists || !artifact.absolutePath) return null;
  const content = await readFile(artifact.absolutePath, 'utf8');
  const match = /^\*\*Status:\*\*\s*([^\n]+)$/im.exec(content);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function stateIndex(model, state) {
  const order = model.presentation?.featureOrder ?? model.feature.states;
  const presented = order.indexOf(state);
  return presented === -1 ? model.feature.states.indexOf(state) : presented;
}

async function buildMilestones(record, projection, artifacts, actions) {
  const current = projection.feature.state;
  const index = stateIndex(record.modelLock.model, current);
  const after = (state) => index > stateIndex(record.modelLock.model, state);
  const action = (command) => actions.find((item) => item.command === command);
  const interview = artifactById(artifacts, 'interview');
  const design = artifactById(artifacts, 'design');
  const spec = artifactById(artifacts, 'spec');
  const plan = artifactById(artifacts, 'plan');
  const interviewComplete = (await markdownStatus(interview))?.startsWith('complete') === true;
  const milestone = (id, label, state, status, evidence = null) => ({
    id, label, state, status, evidence,
  });
  const approval = action('feature approve-design');
  const validation = action('feature validate-spec');
  const authorization = action('feature authorize-plan');
  return [
    milestone(
      'design.interview', 'Interview concluded', 'DESIGNING',
      after('DESIGNING') || interviewComplete ? 'complete' : 'active',
      { artifactId: 'interview' }
    ),
    milestone(
      'design.synthesized', 'Design synthesized', 'DESIGNING',
      after('DESIGNING') || design?.exists ? 'complete' : 'pending',
      { artifactId: 'design' }
    ),
    milestone(
      'design.approved', 'Human design approval', 'DESIGNING',
      after('DESIGNING') ? 'complete' : approval?.readiness ?? 'pending',
      { action: 'feature approve-design' }
    ),
    milestone(
      'spec.drafted', 'Specification drafted', 'SPECIFYING',
      after('SPECIFYING') || spec?.exists ? 'complete' : index === stateIndex(record.modelLock.model, 'SPECIFYING') ? 'active' : 'pending',
      { artifactId: 'spec' }
    ),
    milestone(
      'spec.validated', 'Specification validated', 'SPECIFYING',
      after('SPECIFYING') ? 'complete' : validation?.readiness ?? 'pending',
      { action: 'feature validate-spec' }
    ),
    milestone(
      'plan.drafted', 'Implementation plan drafted', 'PLANNING',
      after('PLANNING') || plan?.exists ? 'complete' : index === stateIndex(record.modelLock.model, 'PLANNING') ? 'active' : 'pending',
      { artifactId: 'plan' }
    ),
    milestone(
      'plan.authorized', 'Implementation authorized', 'PLANNING',
      projection.implementationAuthorization.current || after('PLANNING')
        ? 'complete'
        : authorization?.readiness ?? 'pending',
      { action: 'feature authorize-plan' }
    ),
    milestone(
      'delivery.slice-active', 'Delivery slice active', 'DELIVERING_SLICES',
      projection.activeSliceId ? 'active' : projection.slices.length > 0 ? 'pending' : 'pending',
      { sliceId: projection.activeSliceId }
    ),
    milestone(
      'delivery.boundary', 'PR boundary active', 'DELIVERING_SLICES',
      projection.boundaryAttempts.some((attempt) => attempt.state === 'ACTIVE') ? 'active' : 'pending',
      { attemptId: projection.boundaryAttempts.find((attempt) => attempt.state === 'ACTIVE')?.id ?? null }
    ),
  ];
}

function prerequisite(id, status, message, evidence = null) {
  return { id, status, message, evidence };
}

function readinessFrom(prerequisites, structurallyEligible) {
  if (!structurallyEligible || prerequisites.some((item) => item.status === 'fail')) {
    return 'blocked';
  }
  if (prerequisites.some((item) => item.status === 'unknown')) return 'available';
  return 'ready';
}

function input(id, label, { required = true, placeholder = null } = {}) {
  return { id, label, required, placeholder };
}

function actionInputs(command, authority) {
  const inputs = [];
  if (authority === 'human-confirmation') {
    inputs.push(input('humanConfirmation', 'Human confirmation label', {
      placeholder: '<confirmation-label>',
    }));
  }
  if (command === 'slice propose') {
    inputs.push(
      input('sliceId', 'Stable slice ID', { placeholder: '<slice-id>' }),
      input('name', 'Human-readable slice name', { placeholder: '<slice-name>' }),
      input('branch', 'Expected delivery branch', { placeholder: '<branch>' }),
      input('scope', 'Boundary scope', { placeholder: '<SLICE|FEATURE_FINAL>' }),
      input('planSteps', 'Covered plan-step IDs', { placeholder: '<P1 P2 ...>' }),
      input('rubricCriteria', 'Covered rubric IDs', { placeholder: '<R1 R2 ...>' })
    );
  }
  if (
    command === 'feature validate-spec' ||
    /^slice start /.test(command) ||
    /^slice record-merge /.test(command)
  ) {
    inputs.push(input('factsFile', 'Fresh guard-facts JSON', { placeholder: '<facts.json>' }));
  }
  if (/^slice begin-boundary /.test(command)) {
    inputs.push(input('payloadFile', 'Boundary attempt and pinned-context JSON', {
      placeholder: '<boundary-passage.json>',
    }));
  }
  if (/^gate record /.test(command)) {
    inputs.push(
      input('outcome', 'Gate outcome', { placeholder: '<PASS|FAIL|NOT_APPLICABLE>' }),
      input('inputsFile', 'Current gate inputs JSON', { placeholder: '<inputs.json>' }),
      input('fingerprintsFile', 'Current gate fingerprints JSON', { placeholder: '<fingerprints.json>' }),
      input('evidenceFile', 'Evidence reference JSON', { placeholder: '<evidence.json>' })
    );
  }
  if (command === 'finalization start') {
    inputs.push(
      input('attemptId', 'Finalization attempt ID', { placeholder: '<attempt-id>' }),
      input('mergeInput', 'Recorded feature-final merge SHA', { placeholder: '<merge-sha>' }),
    );
  }
  if (/^finalization record /.test(command)) {
    inputs.push(
      input('outcome', 'Module outcome', { placeholder: '<PASS|FAIL|NOT_APPLICABLE>' }),
      input('evidenceFile', 'Evidence reference JSON', { placeholder: '<evidence.json>' }),
    );
  }
  if (/^boundary request-review /.test(command)) {
    inputs.push(input('fingerprintsFile', 'Current gate fingerprints JSON', {
      placeholder: '<fingerprints.json>',
    }));
  }
  return inputs;
}

function actionCommandTemplate(command, featureHome, inputs) {
  let value = `gatereeve ${command}`;
  const byId = new Map(inputs.map((item) => [item.id, item]));
  if (command === 'slice propose') {
    value += ` ${byId.get('sliceId').placeholder}`;
    value += ` --name ${JSON.stringify(byId.get('name').placeholder)}`;
    value += ` --branch ${byId.get('branch').placeholder}`;
    value += ` --scope ${byId.get('scope').placeholder}`;
    value += ` --plan-steps ${byId.get('planSteps').placeholder}`;
    value += ` --rubric-criteria ${byId.get('rubricCriteria').placeholder}`;
  }
  if (command === 'finalization start') {
    value += ` ${byId.get('attemptId').placeholder}`;
    value += ` --merge-input ${byId.get('mergeInput').placeholder}`;
  }
  if (byId.has('humanConfirmation')) {
    value += ` --human-confirmed ${JSON.stringify(byId.get('humanConfirmation').placeholder)}`;
  }
  if (byId.has('factsFile')) {
    value += ` --facts-file ${JSON.stringify(byId.get('factsFile').placeholder)}`;
  }
  if (byId.has('payloadFile')) {
    value += ` --payload-file ${JSON.stringify(byId.get('payloadFile').placeholder)}`;
  }
  if (byId.has('outcome')) value += ` --outcome ${byId.get('outcome').placeholder}`;
  if (byId.has('inputsFile')) {
    value += ` --inputs-file ${JSON.stringify(byId.get('inputsFile').placeholder)}`;
  }
  if (byId.has('fingerprintsFile')) {
    value += ` --fingerprints-file ${JSON.stringify(byId.get('fingerprintsFile').placeholder)}`;
  }
  if (byId.has('evidenceFile')) {
    value += ` --evidence-file ${JSON.stringify(byId.get('evidenceFile').placeholder)}`;
  }
  return `${value} --feature-home ${JSON.stringify(resolve(featureHome))}`;
}

async function actionReadiness(featureHome, structuralActions, artifacts, facts) {
  const interviewStatus = await markdownStatus(artifactById(artifacts, 'interview'));
  return structuralActions.map((item) => {
    const prerequisites = [];
    if (item.eligible === false) {
      for (const reason of item.reasons ?? []) {
        prerequisites.push(prerequisite('protocol.eligibility', 'fail', reason));
      }
      if (prerequisites.length === 0) {
        prerequisites.push(prerequisite('protocol.eligibility', 'fail', 'Protocol prerequisites are not satisfied'));
      }
    }
    if (item.command === 'feature approve-design') {
      prerequisites.push(prerequisite(
        'design.interview.complete',
        interviewStatus?.startsWith('complete') ? 'pass' : 'fail',
        interviewStatus?.startsWith('complete')
          ? 'Design interview is complete'
          : 'Complete the design interview first',
        { artifactId: 'interview' }
      ));
      const design = artifactById(artifacts, 'design');
      prerequisites.push(prerequisite(
        'design.artifact.present',
        design?.exists ? 'pass' : 'fail',
        design?.exists ? 'Design is available for approval' : 'Synthesize design.md first',
        { artifactId: 'design' }
      ));
    }
    if (item.command === 'feature validate-spec') {
      const spec = artifactById(artifacts, 'spec');
      prerequisites.push(prerequisite(
        'spec.artifact.present',
        spec?.exists ? 'pass' : 'fail',
        spec?.exists ? 'Specification exists' : 'Draft spec.md first',
        { artifactId: 'spec' }
      ));
      const result = factResult(facts.specValidationCurrent);
      prerequisites.push(prerequisite(
        'spec.validation.current', result.status,
        result.status === 'pass'
          ? 'Specification validation is current'
          : result.status === 'fail'
            ? 'Specification validation failed'
            : 'Run the trusted specification validator',
        result.evidence
      ));
    }
    if (item.command === 'feature authorize-plan') {
      for (const id of ['plan', 'issues', 'tracker', 'scratchpad', 'decisions']) {
        const artifact = artifactById(artifacts, id);
        prerequisites.push(prerequisite(
          `plan.${id}.present`, artifact?.exists ? 'pass' : 'fail',
          artifact?.exists ? `${artifact.label} exists` : `Create ${artifact?.path ?? id} first`,
          { artifactId: id }
        ));
      }
    }
    if (/^slice start /.test(item.command)) {
      const result = factResult(facts.sliceReadinessCurrent);
      prerequisites.push(prerequisite(
        'slice.readiness.current', result.status,
        result.status === 'pass'
          ? 'Slice readiness is current'
          : result.status === 'fail'
            ? 'Slice readiness failed'
            : 'Infer and verify slice readiness',
        result.evidence
      ));
    }
    if (/^slice record-merge /.test(item.command)) {
      const result = factResult(facts.reviewedContentMerged);
      prerequisites.push(prerequisite(
        'merge.reviewedContent.verified', result.status,
        result.status === 'pass'
          ? 'Reviewed content is verified on the integration branch'
          : result.status === 'fail'
            ? 'Reviewed content is not the merged content'
            : 'Verify the reviewed content on the integration branch',
        result.evidence
      ));
    }
    if (item.command === 'feature finalize') {
      const result = factResult(facts.featureCloseoutCurrent);
      prerequisites.push(prerequisite(
        'feature.closeout.current', result.status,
        result.status === 'pass'
          ? 'Feature closeout evidence is current'
          : result.status === 'fail'
            ? 'Feature closeout verification failed'
            : 'Run complete feature closeout verification',
        result.evidence
      ));
    }
    const readiness = readinessFrom(prerequisites, item.eligible !== false);
    const inputs = actionInputs(item.command, item.authority);
    const commandTemplate = actionCommandTemplate(item.command, featureHome, inputs);
    return {
      id: item.command.replaceAll(/[^A-Za-z0-9]+/g, '.').replace(/^\.|\.$/g, ''),
      command: item.command,
      copyCommand: commandTemplate,
      commandTemplate,
      authority: item.authority,
      availability: 'available',
      readiness,
      eligible: readiness === 'ready',
      inputs,
      blockers: prerequisites.filter((entry) => entry.status !== 'pass'),
      prerequisites,
      reasons: prerequisites.filter((entry) => entry.status !== 'pass').map((entry) => entry.message),
    };
  });
}

function governanceWarnings(facts) {
  const warnings = [];
  if (facts.worktree?.journalDirty === true) {
    warnings.push({ type: 'journal-uncommitted', severity: 'warning' });
  }
  if (facts.worktree?.modelDirty === true) {
    warnings.push({ type: 'model-uncommitted', severity: 'warning' });
  }
  if (facts.worktree?.sourceDirty === true) {
    warnings.push({ type: 'source-uncommitted', severity: 'activity' });
  }
  return warnings;
}

async function modelProvenance(record) {
  const bundledModel = await loadDefaultModel();
  const bundledHash = hashModel(bundledModel);
  const catalogSupported =
    record.modelLock.modelId === 'gatereeve/workflow' &&
    /^1\./.test(record.modelLock.modelVersion);
  const modelsDiffer = bundledHash !== record.modelLock.modelHash;
  const versionComparison = compareVersions(
    bundledModel.modelVersion,
    record.modelLock.modelVersion
  );
  const migrationAvailable = modelsDiffer && versionComparison > 0;
  let migrationImpact = null;
  if (migrationAvailable) {
    const bundledLock = createModelLock(bundledModel, {
      createdAt: record.modelLock.createdAt,
      coreVersion: PROTOCOL_VERSION,
    });
    migrationImpact = buildModelMigrationImpact(record.modelLock, bundledLock);
  }
  return {
    pinned: {
      id: record.modelLock.modelId,
      version: record.modelLock.modelVersion,
      hash: record.modelLock.modelHash,
      coreVersion: record.modelLock.coreVersion,
      createdAt: record.modelLock.createdAt,
    },
    bundled: {
      id: bundledModel.modelId,
      version: bundledModel.modelVersion,
      hash: bundledHash,
      protocolVersion: PROTOCOL_VERSION,
    },
    catalog: {
      version: catalogSupported ? 1 : null,
      supported: catalogSupported,
    },
    migration: {
      available: migrationAvailable,
      relationship: !modelsDiffer
        ? 'same'
        : versionComparison > 0
          ? 'bundled-newer'
          : versionComparison < 0
            ? 'pinned-newer'
            : 'same-version-different-hash',
      impact: migrationImpact,
    },
  };
}

function eventSummaries(events, limit = 20) {
  return events.slice(-limit).map((event) => ({
    sequence: event.sequence,
    eventId: event.eventId,
    recordedAt: event.recordedAt,
    type: event.type,
    actor: event.actor,
    modelHash: event.modelHash,
  }));
}

function moduleInventory(record, projection, facts) {
  const graph = record.modelLock.model.moduleGraph;
  if (!graph) return null;
  const enabled = new Set(graph.enabledModuleIds);
  const availability = facts.moduleAvailability ?? null;
  const live = isObject(facts.moduleLive) ? facts.moduleLive : {};
  const finalizationAttempt = projection.finalizationAttempts.find((attempt) => attempt.state === 'ACTIVE')
    ?? projection.finalizationAttempts.at(-1)
    ?? null;
  return {
    schemaVersion: 1,
    policyDigest: graph.policyDigest,
    slots: MODULE_SLOTS.map((slot) => ({
      id: slot,
      modules: graph.modules.filter((module) => module.slot === slot).map((module) => {
        const result = slot === 'feature.finalization'
          ? finalizationAttempt?.modules.find((item) => item.id === module.id) ?? null
          : null;
        return ({
        id: module.id,
        version: module.version,
        digest: module.digest,
        label: module.label,
        description: module.description,
        slot: module.slot,
        enabled: enabled.has(module.id),
        locked: module.locked,
        disposition: module.disposition,
        waiverAllowed: module.waiverAllowed,
        dependsOn: [...module.dependsOn],
        after: [...(module.after ?? [])],
        boundaryGateId: module.boundary?.gateId ?? null,
        run: module.run ? structuredClone(module.run) : null,
        observe: module.observe ? structuredClone(module.observe) : null,
        readiness: assessModuleReadiness(module, availability),
        live: live[module.id] === undefined ? null : structuredClone(live[module.id]),
        ...(result ? {
          attemptId: finalizationAttempt.id,
          orderLabel: result.orderLabel,
          outcome: result.outcome,
          freshness: result.freshness,
          evidence: result.evidence,
          reason: result.reason,
          eligible: result.eligible,
          blockers: structuredClone(result.blockers),
        } : {}),
      }); }),
    })),
  };
}

export async function buildGovernedSnapshot(
  featureHome,
  record,
  projection,
  structuralActions,
  { facts = {}, sources = {}, blockers = [] } = {}
) {
  if (!isObject(facts)) throw new ContractError('Snapshot facts must be an object');
  const feature = await featureArtifacts(featureHome, projection.feature.state, facts);
  const boundary = await boundaryArtifacts(featureHome, projection, facts);
  const artifacts = [...feature, ...boundary];
  const actions = await actionReadiness(featureHome, structuralActions, artifacts, facts);
  const model = await modelProvenance(record);
  const mode = model.catalog.supported ? 'governed' : 'incompatible';
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    mode,
    featureHome: resolve(featureHome),
    featureId: projection.featureId,
    protocol: {
      version: PROTOCOL_VERSION,
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      detailSchemaVersion: DETAIL_SCHEMA_VERSION,
    },
    model,
    modules: moduleInventory(record, projection, facts),
    projection,
    active: {
      sliceId: projection.activeSliceId,
      boundaryAttemptId: projection.boundaryAttempts.find(
        (attempt) => attempt.id === projection.slices.find(
          (slice) => slice.id === projection.activeSliceId
        )?.activeAttemptId
      )?.id ?? null,
    },
    blockers: model.catalog.supported
      ? blockers
      : [
        ...blockers,
        {
          type: 'model-observation-incompatible',
          reason: `No artifact and milestone catalog supports ${model.pinned.id}@${model.pinned.version}`,
        },
      ],
    actions,
    milestones: await buildMilestones(record, projection, artifacts, actions),
    artifacts,
    sources: normalizeSourceStatuses(mode, sources),
    warnings: governanceWarnings(facts),
    events: {
      count: record.events.length,
      lastEventId: record.events.at(-1).eventId,
      lastSequence: record.events.at(-1).sequence,
      recent: eventSummaries(record.events),
    },
  };
  return validateSnapshot(snapshot);
}

export function buildDiagnosticSnapshot(mode, featureHome, { reason = null, sources = {} } = {}) {
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    mode,
    featureHome: resolve(featureHome),
    featureId: null,
    protocol: {
      version: PROTOCOL_VERSION,
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      detailSchemaVersion: DETAIL_SCHEMA_VERSION,
    },
    model: null,
    modules: null,
    projection: null,
    active: { sliceId: null, boundaryAttemptId: null },
    blockers: [{ type: mode, reason }],
    actions: [],
    milestones: [],
    artifacts: [],
    sources: normalizeSourceStatuses(mode, sources),
    warnings: [],
    events: { count: 0, lastEventId: null, lastSequence: null, recent: [] },
  };
  return validateSnapshot(snapshot);
}

export function validateSnapshot(snapshot) {
  assertObject(snapshot, 'Snapshot');
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new ContractError(`Snapshot schemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (!['governed', 'legacy', 'missing', 'inconsistent', 'incompatible'].includes(snapshot.mode)) {
    throw new ContractError(`Snapshot has invalid mode ${snapshot.mode}`);
  }
  assertObject(snapshot.protocol, 'Snapshot protocol');
  assertString(snapshot.protocol.version, 'Snapshot protocol.version');
  if (snapshot.protocol.snapshotSchemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new ContractError(
      `Snapshot protocol.snapshotSchemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}`
    );
  }
  if (snapshot.protocol.detailSchemaVersion !== DETAIL_SCHEMA_VERSION) {
    throw new ContractError(
      `Snapshot protocol.detailSchemaVersion must be ${DETAIL_SCHEMA_VERSION}`
    );
  }
  assertString(snapshot.featureHome, 'Snapshot featureHome');
  assertString(snapshot.featureId, 'Snapshot featureId', { nullable: true });
  if (snapshot.model !== null) validateModelProvenance(snapshot.model, 'Snapshot model');
  if (snapshot.modules !== null) {
    assertObject(snapshot.modules, 'Snapshot modules');
    if (snapshot.modules.schemaVersion !== 1) {
      throw new ContractError('Snapshot modules.schemaVersion must be 1');
    }
    assertString(snapshot.modules.policyDigest, 'Snapshot modules.policyDigest');
    assertArray(snapshot.modules.slots, 'Snapshot modules.slots');
    const slotIds = snapshot.modules.slots.map((slot, index) => {
      assertObject(slot, `Snapshot modules.slots[${index}]`);
      return slot.id;
    });
    if (JSON.stringify(slotIds) !== JSON.stringify(MODULE_SLOTS)) {
      throw new ContractError('Snapshot modules.slots must contain each canonical slot exactly once');
    }
    const moduleIds = new Set();
    for (const [slotIndex, slot] of snapshot.modules.slots.entries()) {
      const slotLabel = `Snapshot modules.slots[${slotIndex}]`;
      assertObject(slot, slotLabel);
      assertOneOf(slot.id, new Set(MODULE_SLOTS), `${slotLabel}.id`);
      assertArray(slot.modules, `${slotLabel}.modules`);
      for (const [moduleIndex, module] of slot.modules.entries()) {
        const moduleLabel = `${slotLabel}.modules[${moduleIndex}]`;
        assertObject(module, moduleLabel);
        for (const field of ['id', 'version', 'digest', 'label', 'description', 'slot', 'disposition']) {
          assertString(module[field], `${moduleLabel}.${field}`);
        }
        if (module.slot !== slot.id) {
          throw new ContractError(`${moduleLabel}.slot must match its containing slot`);
        }
        if (moduleIds.has(module.id)) {
          throw new ContractError(`Snapshot modules contain duplicate module ${module.id}`);
        }
        moduleIds.add(module.id);
        for (const field of ['enabled', 'locked', 'waiverAllowed']) {
          assertBoolean(module[field], `${moduleLabel}.${field}`);
        }
        assertStringArray(module.dependsOn, `${moduleLabel}.dependsOn`);
        assertStringArray(module.after, `${moduleLabel}.after`);
        assertString(module.boundaryGateId, `${moduleLabel}.boundaryGateId`, { nullable: true });
        assertNullableObject(module.run, `${moduleLabel}.run`);
        assertNullableObject(module.observe, `${moduleLabel}.observe`);
        assertObject(module.readiness, `${moduleLabel}.readiness`);
        assertOneOf(
          module.readiness.status,
          new Set(['unchecked', 'available', 'unavailable']),
          `${moduleLabel}.readiness.status`,
        );
        assertArray(module.readiness.missing, `${moduleLabel}.readiness.missing`);
        for (const [missingIndex, missing] of module.readiness.missing.entries()) {
          const missingLabel = `${moduleLabel}.readiness.missing[${missingIndex}]`;
          assertObject(missing, missingLabel);
          assertOneOf(missing.kind, new Set(['skill', 'provider']), `${missingLabel}.kind`);
          assertString(missing.id, `${missingLabel}.id`);
        }
        validateModuleLive(module.live, `${moduleLabel}.live`);
        if (module.attemptId !== undefined) assertString(module.attemptId, `${moduleLabel}.attemptId`);
        if (module.orderLabel !== undefined) assertString(module.orderLabel, `${moduleLabel}.orderLabel`);
        if (module.outcome !== undefined) assertOneOf(module.outcome, GATE_OUTCOME_SET, `${moduleLabel}.outcome`);
        if (module.freshness !== undefined) assertOneOf(module.freshness, GATE_FRESHNESS_SET, `${moduleLabel}.freshness`);
        if (module.evidence !== undefined) assertNullableObject(module.evidence, `${moduleLabel}.evidence`);
        if (module.reason !== undefined) assertString(module.reason, `${moduleLabel}.reason`, { nullable: true });
        if (module.eligible !== undefined) assertBoolean(module.eligible, `${moduleLabel}.eligible`);
        if (module.blockers !== undefined) {
          assertArray(module.blockers, `${moduleLabel}.blockers`);
          module.blockers.forEach((blocker, index) => assertObject(blocker, `${moduleLabel}.blockers[${index}]`));
        }
      }
    }
  }
  if (snapshot.projection !== null) validateProjection(snapshot.projection, 'Snapshot projection');
  if (snapshot.mode === 'governed') {
    if (snapshot.model === null || snapshot.projection === null || snapshot.featureId === null) {
      throw new ContractError('Governed snapshot requires model, projection, and featureId');
    }
    if (snapshot.projection.featureId !== snapshot.featureId) {
      throw new ContractError('Snapshot featureId must match projection.featureId');
    }
  }
  assertObject(snapshot.active, 'Snapshot active context');
  assertString(snapshot.active.sliceId, 'Snapshot active.sliceId', { nullable: true });
  assertString(
    snapshot.active.boundaryAttemptId,
    'Snapshot active.boundaryAttemptId',
    { nullable: true }
  );
  assertObject(snapshot.sources, 'Snapshot sources');
  for (const name of ['local', 'git', 'github']) {
    const source = snapshot.sources[name];
    assertObject(source, `Snapshot source ${name}`);
    assertOneOf(source.status, SOURCE_STATUSES, `Snapshot source ${name}.status`);
    assertString(source.detail, `Snapshot source ${name}.detail`, { nullable: true });
    assertString(source.checkedAt, `Snapshot source ${name}.checkedAt`, { nullable: true });
  }
  for (const field of ['blockers', 'actions', 'milestones', 'artifacts', 'warnings']) {
    assertArray(snapshot[field], `Snapshot ${field}`);
  }
  snapshot.blockers.forEach((blocker, index) => {
    assertObject(blocker, `Snapshot blockers[${index}]`);
    assertString(blocker.type, `Snapshot blockers[${index}].type`);
  });
  snapshot.actions.forEach((action, index) => {
    const label = `Snapshot actions[${index}]`;
    assertObject(action, label);
    for (const field of ['id', 'command', 'copyCommand', 'commandTemplate', 'authority']) {
      assertString(action[field], `${label}.${field}`);
    }
    assertString(action.availability, `${label}.availability`);
    assertOneOf(action.readiness, READINESS_STATES, `${label}.readiness`);
    assertBoolean(action.eligible, `${label}.eligible`);
    if (action.eligible !== (action.readiness === 'ready')) {
      throw new ContractError(`${label}.eligible must be true exactly when readiness is ready`);
    }
    assertArray(action.inputs, `${label}.inputs`);
    action.inputs.forEach((item, inputIndex) => {
      const inputLabel = `${label}.inputs[${inputIndex}]`;
      assertObject(item, inputLabel);
      assertString(item.id, `${inputLabel}.id`);
      assertString(item.label, `${inputLabel}.label`);
      assertBoolean(item.required, `${inputLabel}.required`);
      assertString(item.placeholder, `${inputLabel}.placeholder`, { nullable: true });
    });
    assertArray(action.blockers, `${label}.blockers`);
    action.blockers.forEach((blocker, blockerIndex) => {
      assertObject(blocker, `${label}.blockers[${blockerIndex}]`);
    });
    assertArray(action.prerequisites, `${label}.prerequisites`);
    action.prerequisites.forEach((item, prerequisiteIndex) => {
      const prerequisiteLabel = `${label}.prerequisites[${prerequisiteIndex}]`;
      assertObject(item, prerequisiteLabel);
      assertString(item.id, `${prerequisiteLabel}.id`);
      assertOneOf(item.status, PREREQUISITE_STATUSES, `${prerequisiteLabel}.status`);
      assertString(item.message, `${prerequisiteLabel}.message`);
    });
    assertStringArray(action.reasons, `${label}.reasons`);
  });
  snapshot.milestones.forEach((milestone, index) => {
    const label = `Snapshot milestones[${index}]`;
    assertObject(milestone, label);
    for (const field of ['id', 'label', 'state']) assertString(milestone[field], `${label}.${field}`);
    assertOneOf(milestone.status, MILESTONE_STATUSES, `${label}.status`);
    assertNullableObject(milestone.evidence, `${label}.evidence`);
  });
  snapshot.artifacts.forEach((artifact, index) => {
    validateArtifact(artifact, `Snapshot artifacts[${index}]`);
  });
  snapshot.warnings.forEach((warning, index) => {
    const label = `Snapshot warnings[${index}]`;
    assertObject(warning, label);
    assertString(warning.type, `${label}.type`);
    assertString(warning.severity, `${label}.severity`);
  });
  assertObject(snapshot.events, 'Snapshot events');
  assertInteger(snapshot.events.count, 'Snapshot events.count');
  assertString(snapshot.events.lastEventId, 'Snapshot events.lastEventId', { nullable: true });
  assertInteger(snapshot.events.lastSequence, 'Snapshot events.lastSequence', {
    nullable: true,
    minimum: 1,
  });
  assertArray(snapshot.events.recent, 'Snapshot events.recent');
  snapshot.events.recent.forEach((event, index) => {
    const label = `Snapshot events.recent[${index}]`;
    assertObject(event, label);
    assertInteger(event.sequence, `${label}.sequence`, { minimum: 1 });
    for (const field of ['eventId', 'recordedAt', 'type', 'modelHash']) {
      assertString(event[field], `${label}.${field}`);
    }
    validateActor(event.actor, `${label}.actor`);
  });
  return snapshot;
}

async function safeArtifactContent(featureHome, artifact) {
  if (artifact.unsafe) {
    throw new ProtocolError('ARTIFACT_OUTSIDE_FEATURE', 'Artifact resolves outside the feature record');
  }
  if (!artifact.exists || !artifact.absolutePath) {
    throw new ProtocolError('ARTIFACT_UNAVAILABLE', `Artifact ${artifact.id} is not available`, {
      artifactId: artifact.id,
      status: artifact.status,
    });
  }
  const [rootPath, artifactPath] = await Promise.all([
    realpath(featureHome),
    realpath(artifact.absolutePath),
  ]);
  if (!isWithin(rootPath, artifactPath)) {
    throw new ProtocolError('ARTIFACT_OUTSIDE_FEATURE', 'Artifact resolves outside the feature record');
  }
  const info = await stat(artifactPath);
  if (info.size > MAX_TEXT_ARTIFACT_BYTES) {
    throw new ProtocolError(
      'ARTIFACT_TOO_LARGE',
      `Artifact exceeds the ${MAX_TEXT_ARTIFACT_BYTES}-byte read limit`,
      { artifactId: artifact.id, size: info.size }
    );
  }
  return readFile(artifactPath, 'utf8');
}

function structuredArtifactContent(artifact, content) {
  try {
    if (artifact.format === 'json') return JSON.parse(content);
    if (artifact.format === 'jsonl') {
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    }
    return null;
  } catch (error) {
    throw new ProtocolError(
      'ARTIFACT_INVALID_JSON',
      `Artifact ${artifact.id} is not valid ${artifact.format}`,
      { artifactId: artifact.id, cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

export async function buildDetail(snapshot, record, kind, id = null) {
  if (!DETAIL_KINDS.has(kind)) {
    throw new ProtocolError('DETAIL_KIND_UNKNOWN', `Unknown detail kind: ${kind}`);
  }
  let data;
  if (kind === 'artifact') {
    const artifact = snapshot.artifacts.find((item) => item.id === id);
    if (!artifact) {
      throw new ProtocolError('ARTIFACT_UNKNOWN', `Unknown artifact ID: ${id}`);
    }
    const content = await safeArtifactContent(snapshot.featureHome, artifact);
    data = {
      artifact,
      content,
      structured: structuredArtifactContent(artifact, content),
    };
  } else if (kind === 'events') {
    const events = id === null
      ? record.events
      : record.events.filter(
        (event) => event.eventId === id || String(event.sequence) === String(id)
      );
    if (id !== null && events.length === 0) {
      throw new ProtocolError('EVENT_UNKNOWN', `Unknown event: ${id}`);
    }
    data = { events };
  } else if (kind === 'attempt') {
    const attempt = snapshot.projection.boundaryAttempts.find((item) => item.id === id)
      ?? snapshot.projection.finalizationAttempts.find((item) => item.id === id);
    if (!attempt) {
      throw new ProtocolError('ATTEMPT_UNKNOWN', `Unknown workflow attempt: ${id}`);
    }
    data = { attempt };
  } else {
    data = {
      lock: record.modelLock,
      graph: modelGraph(record.modelLock.model),
      provenance: snapshot.model,
    };
  }
  return validateDetail({
    schemaVersion: DETAIL_SCHEMA_VERSION,
    kind,
    featureId: snapshot.featureId,
    id,
    data,
  });
}

export function validateDetail(detail) {
  assertObject(detail, 'Detail result');
  if (detail.schemaVersion !== DETAIL_SCHEMA_VERSION) {
    throw new ContractError(`Detail schemaVersion must be ${DETAIL_SCHEMA_VERSION}`);
  }
  assertOneOf(detail.kind, DETAIL_KINDS, 'Detail result kind');
  assertString(detail.featureId, 'Detail result featureId');
  assertString(detail.id, 'Detail result id', { nullable: true });
  assertObject(detail.data, 'Detail result data');
  if (detail.kind === 'artifact') {
    validateArtifact(detail.data.artifact, 'Detail result data.artifact');
    assertString(detail.data.content, 'Detail result data.content', { allowEmpty: true });
    if (!Object.hasOwn(detail.data, 'structured')) {
      throw new ContractError('Detail result data.structured is required');
    }
  } else if (detail.kind === 'events') {
    assertArray(detail.data.events, 'Detail result data.events');
    detail.data.events.forEach((event, index) => {
      validateFullEvent(event, `Detail result data.events[${index}]`);
    });
  } else if (detail.kind === 'attempt') {
    if (Array.isArray(detail.data.attempt?.gates)) {
      validateAttempt(detail.data.attempt, 'Detail result data.attempt');
    } else {
      validateFinalizationAttempt(detail.data.attempt, 'Detail result data.attempt');
    }
  } else {
    validateModelLock(detail.data.lock);
    validateGraph(detail.data.graph, 'Detail result data.graph');
    validateModelProvenance(detail.data.provenance, 'Detail result data.provenance');
  }
  return detail;
}
