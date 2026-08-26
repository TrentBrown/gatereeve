import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

import { PROTOCOL_VERSION } from './constants.js';
import { compareVersions } from './compatibility.js';
import { ContractError, ProtocolError } from './errors.js';
import { buildModelMigrationImpact } from './feature.js';
import { modelGraph } from './graph.js';
import { createModelLock, hashModel, loadDefaultModel } from './model.js';

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
    const info = await stat(absolutePath);
    return {
      exists: info.isFile(),
      unsafe: false,
      absolutePath,
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
    command === 'feature finalize' ||
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
  assertObject(snapshot.active, 'Snapshot active context');
  assertObject(snapshot.sources, 'Snapshot sources');
  for (const name of ['local', 'git', 'github']) {
    if (!SOURCE_STATUSES.has(snapshot.sources[name]?.status)) {
      throw new ContractError(`Snapshot source ${name} has an invalid status`);
    }
  }
  for (const field of ['blockers', 'actions', 'milestones', 'artifacts', 'warnings']) {
    if (!Array.isArray(snapshot[field])) throw new ContractError(`Snapshot ${field} must be an array`);
  }
  for (const action of snapshot.actions) {
    if (
      !READINESS_STATES.has(action.readiness) ||
      typeof action.command !== 'string' ||
      typeof action.commandTemplate !== 'string' ||
      !Array.isArray(action.inputs)
    ) {
      throw new ContractError('Snapshot action has an invalid readiness contract');
    }
  }
  for (const artifact of snapshot.artifacts) {
    if (!ARTIFACT_STATUSES.has(artifact.status) || typeof artifact.id !== 'string') {
      throw new ContractError('Snapshot artifact has an invalid status contract');
    }
  }
  return snapshot;
}

async function safeArtifactContent(featureHome, artifact) {
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
    const attempt = snapshot.projection.boundaryAttempts.find((item) => item.id === id);
    if (!attempt) {
      throw new ProtocolError('ATTEMPT_UNKNOWN', `Unknown boundary attempt: ${id}`);
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
  if (!DETAIL_KINDS.has(detail.kind) || !('data' in detail)) {
    throw new ContractError('Detail result has an invalid kind or data contract');
  }
  return detail;
}
