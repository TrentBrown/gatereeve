import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { realpath, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fingerprint } from './fingerprint.js';
import { readFeatureRecord } from './feature.js';
import { projectRecord } from './projection.js';
import { resolveWorkflowContext } from './context.js';
import {
  buildCompactReviewInput,
  isReviewHistoryPath,
} from './review-input.js';
import { createPinnedRepositorySnapshot } from './pinned-snapshot.js';
import { runAgentWorkflow } from './agent-workflow-runtime.js';
import {
  createCodexAgentAdapter,
  createClaudeCodeAgentAdapter,
} from './local-agent-adapters.js';
import { createPluginResourceAccess } from './agent-workflow-resources.js';
import { validateJsonSchema } from './json-schema.js';
import { validateAgentWorkflowReceipt } from './agent-workflow.js';
import { formalAdvisoryFindings } from './advisory-history.js';
import { opaqueAdvisoryInputIdentity } from './advisory-inputs.js';
import {
  advisoryFile,
  advisoryHash,
  advisoryHistory,
  validateAdvisoryReuse,
  existingAdvisoryJSON,
  immutableAdvisoryJSON,
} from './advisory-storage.js';
import {
  ADVISORY_ID,
  advisoryAssert,
  advisoryText,
  validateAdvisoryResult,
  validateDefectClassReview,
  validateAdvisoryRecord,
  validateAdvisoryReadiness,
  validateAdvisoryBoundaryProof,
} from './advisory-contract.js';

const exec = promisify(execFile);
const pluginRoot = resolve(import.meta.dirname, '..', '..');
const git = async (root, args) =>
  (
    await exec('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024,
    })
  ).stdout;
const clone = (value) => structuredClone(value);
const sourceSha = /^[0-9a-f]{40}$/u;
function normalizedDescriptor(value) {
  return Object.fromEntries(
    [
      'id',
      'version',
      'provider',
      'model',
      'reasoningEffort',
      'capabilityProfiles',
      'isolationMethods',
    ].map((k) => [k, value?.[k] ?? null])
  );
}
function nativeAdapter(execution) {
  if (
    !['codex', 'claude-code'].includes(execution.provider) ||
    !execution.model
  )
    return null;
  return execution.provider === 'codex'
    ? createCodexAgentAdapter(execution)
    : createClaudeCodeAgentAdapter(execution);
}
function classifyUnavailable(failure) {
  const code = failure?.code ?? 'ADVISORY_UNAVAILABLE';
  const transient = [
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN',
    'AGENT_PROVIDER_TIMEOUT',
    'AGENT_PROVIDER_TRANSIENT',
  ].includes(code);
  return {
    code,
    category: transient ? 'TRANSIENT' : 'PERSISTENT',
    message: transient
      ? 'The isolated provider did not complete because of a transient execution error.'
      : 'Advisory configuration, isolation, input schema or publication could not be established.',
  };
}
async function assertTracked(root, home, refs, headSha) {
  const prefix = relative(root, home).split(sep).join('/');
  for (const ref of refs) {
    const path = prefix + '/' + ref.path;
    const entry = (await git(root, ['ls-tree', headSha, '--', path])).trim();
    advisoryAssert(
      /^(100644|100755) blob /u.test(entry),
      'commit each advisory record and bound evidence before entering the formal boundary'
    );
    const actual = await new Promise((resolveDigest, reject) => {
      const digest = createHash('sha256');
      const child = spawn('git', ['-C', root, 'show', headSha + ':' + path], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      child.stdout.on('data', (chunk) => digest.update(chunk));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolveDigest('sha256:' + digest.digest('hex'))
          : reject(new Error('Tracked advisory evidence could not be read'))
      );
    });
    advisoryAssert(
      actual === ref.hash,
      'tracked advisory evidence differs from its current bytes'
    );
  }
}
async function preparedAdvisory(
  featureHome,
  input,
  { adapter = null, resources = null, omitReadinessId = input.readinessId } = {}
) {
  advisoryAssert(
    ADVISORY_ID.test(input.readinessId ?? ''),
    'an explicit stable readiness ID is required'
  );
  advisoryAssert(
    typeof input.repositoryRoot === 'string',
    'selected repository root is required'
  );
  const record = await readFeatureRecord(featureHome),
    projection = projectRecord(record);
  const policy = record.modelLock.model.advisory;
  advisoryAssert(
    policy?.schemaVersion === 1,
    'explicit compatible advisory model adoption is required'
  );
  const slice = projection.slices.find((s) => s.id === input.sliceId);
  advisoryAssert(
    slice?.state === 'IMPLEMENTING' &&
      projection.activeSliceId === slice.id &&
      !projection.suspension.paused &&
      !projection.blockingChangeIds.length &&
      projection.implementationAuthorization?.current,
    'readiness requires the active authorized implementing slice without pause or blockers'
  );
  advisoryAssert(
    ['agent', 'human-confirmed'].includes(input.actor?.kind),
    'readiness must be declared by the implementer'
  );
  advisoryText(input.actor.label, 'implementer identity');
  const root = await realpath(input.repositoryRoot),
    home = await realpath(record.featureHome);
  const context = await resolveWorkflowContext({
    cwd: root,
    repository: input.repositoryAlias ?? null,
  });
  advisoryAssert(
    (await realpath(context.featureHome)) === home &&
      context.featureId === record.events[0].featureId,
    'selected repository/feature identity differs'
  );
  const headSha = (await git(root, ['rev-parse', 'HEAD'])).trim();
  const boundaryScope = input.scope ?? slice.scope ?? 'SLICE';
  advisoryAssert(
    ['SLICE', 'FEATURE_FINAL'].includes(boundaryScope),
    'advisory scope must match a formal boundary scope'
  );
  const judge = record.modelLock.model.moduleGraph.modules.find(
    (m) => m.boundary?.gateId === 'judge'
  );
  const applicable = Boolean(
    judge &&
      record.modelLock.model.moduleGraph.enabledModuleIds.includes(judge.id)
  );
  const scope =
    judge?.boundary.evaluationScope[boundaryScope] ??
    (boundaryScope === 'FEATURE_FINAL' ? 'FEATURE' : 'SLICE');
  const sliceBaseSha =
    input.sliceBaseSha ??
    input.baseSha ??
    (
      await git(root, [
        'merge-base',
        context.repository.remote + '/' + context.repository.integrationBranch,
        headSha,
      ])
    ).trim();
  const baseSha =
    scope === 'FEATURE' ? context.repository.featureBaseSha : sliceBaseSha;
  advisoryAssert(
    sourceSha.test(headSha) &&
      sourceSha.test(baseSha ?? '') &&
      sourceSha.test(sliceBaseSha),
    'full source and original feature/slice bases are required'
  );
  await git(root, ['merge-base', '--is-ancestor', baseSha, headSha]);
  await git(root, ['merge-base', '--is-ancestor', sliceBaseSha, headSha]);
  const dirty = (
    await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  )
    .split('\0')
    .filter(Boolean);
  advisoryAssert(
    dirty.every((item) => isReviewHistoryPath(item.slice(3))),
    'commit intended source/test/config changes before declaring readiness'
  );
  const criteria =
    input.criteria ??
    (scope === 'SLICE' && slice.rubricCriteria.length
      ? slice.rubricCriteria
      : null);
  if (scope === 'SLICE' && slice.rubricCriteria.length && criteria)
    advisoryAssert(
      fingerprint([...criteria].sort()) ===
        fingerprint([...slice.rubricCriteria].sort()),
      'advisory criteria must cover the complete declared slice scope'
    );
  const compact = await buildCompactReviewInput({
    repositoryRoot: root,
    featureHome: home,
    baseSha,
    headSha,
    scope,
    sliceBaseSha: scope === 'FEATURE' ? sliceBaseSha : null,
    criteria,
  });
  try {
    // Record namespaces are reserved for typed workflow data. A production JSON
    // file cannot become "evidence-only" merely by moving into advisory/.
    for (const path of compact.excludedPaths.filter(
      (p) => /\/advisory\//u.test(p) && p.endsWith('.json')
    )) {
      const name = path.split('/').at(-1);
      advisoryAssert(
        [
          'readiness.json',
          'review.json',
          'claim.json',
          'proceed.json',
        ].includes(name),
        'unclassified JSON in advisory record namespace'
      );
      const value = JSON.parse(
        await git(root, ['show', headSha + ':' + path]).catch(() =>
          git(root, ['show', baseSha + ':' + path])
        )
      );
      advisoryAssert(
        typeof value.kind === 'string' &&
          value.kind.startsWith('slice-advisory-'),
        'mislabelled advisory record requires reconciliation'
      );
    }
    advisoryAssert(
      Array.isArray(input.checks) &&
        input.checks.some((c) => c.kind === 'fast') &&
        input.checks.some((c) => c.kind === 'focused'),
      'readiness needs completed fast and focused checks'
    );
    const refs = [];
    for (const check of input.checks) {
      advisoryAssert(
        ['fast', 'focused'].includes(check.kind) &&
          check.outcome === 'PASS' &&
          Array.isArray(check.evidence) &&
          check.evidence.length,
        'fast/focused checks must pass with bound evidence'
      );
      advisoryText(check.command, 'fast/focused command');
      for (const ref of check.evidence) {
        await advisoryFile(home, ref);
        refs.push(ref);
      }
    }
    const history = await advisoryHistory(home, slice.id, { omitReadinessId });
    const priorFindings = [
      ...history.findings,
      ...(await formalAdvisoryFindings(record, slice.id)),
    ].sort((a, b) => a.id.localeCompare(b.id));
    let remediation = clone(input.remediation ?? null);
    const execution = clone(input.execution ?? {});
    const runtimeAdapter = adapter ?? nativeAdapter(execution);
    let preparationUnavailable = null;
    let description = null;
    try {
      description = runtimeAdapter ? await runtimeAdapter.describe() : null;
    } catch {
      preparationUnavailable = classifyUnavailable({
        code: 'ADVISORY_CONFIGURATION',
      });
    }
    const descriptor = normalizedDescriptor(description);
    const resourceAccess =
      resources ??
      createPluginResourceAccess({
        pluginRoots: { 'agentic-development-workflow': pluginRoot },
      });
    const module = clone(policy.module);
    const resourcesDigest = {};
    for (const path of [
      module.run.stages[0].promptResource,
      module.run.stages[0].inputSchema,
      module.run.stages[0].outputSchema,
      module.run.evaluator.resource,
    ]) {
      try {
        resourcesDigest[path] = advisoryHash(
          await resourceAccess.loadResource({
            pluginId: module.run.resourcePlugin,
            path,
          })
        );
      } catch {
        resourcesDigest[path] = 'UNAVAILABLE';
        preparationUnavailable = classifyUnavailable({
          code: 'ADVISORY_RESOURCE_UNAVAILABLE',
        });
      }
    }
    const opaqueHistoryIdentity = await opaqueAdvisoryInputIdentity(
      root,
      compact
    );
    const inputManifest = {
      schemaVersion: 1,
      kind: 'slice-advisory-inputs',
      modelHash: record.modelLock.modelHash,
      opaqueHistoryIdentity,
      reviewInputIdentity: compact.change.reviewView.inputIdentity,
      scope,
      boundaryScope,
      criteria: compact.change.criteria,
      formalJudge: judge
        ? {
            id: judge.id,
            version: judge.version,
            digest: judge.digest,
            scope,
            capabilityProfile: judge.run.capabilityProfile,
            isolation: judge.run.isolation,
            repositoryAccess: judge.run.repositoryAccess,
            networkAccess: judge.run.networkAccess,
          }
        : null,
      advisoryModule: {
        id: module.id,
        version: module.version,
        digest: module.digest,
      },
      applicable,
      resources: resourcesDigest,
      adapter: descriptor,
      checks: clone(input.checks),
      priorFindingsIdentity: fingerprint(priorFindings),
      governance: {
        featureId: context.featureId,
        repositoryAlias: context.repository.alias,
        remote: context.repository.remote,
        integrationBranch: context.repository.integrationBranch,
        releaseBranch: context.repository.releaseBranch ?? null,
        featureBaseSha: context.repository.featureBaseSha,
        keepPullRequestsClosed: context.repository.keepPullRequestsClosed,
      },
    };
    const inputIdentity = fingerprint(inputManifest);
    if (remediation === null && priorFindings.length) {
      const reusable = history.records.find(
        (r) =>
          r.outcome === 'READY_FOR_FORMAL_REVIEW' &&
          r.inputIdentity === inputIdentity
      );
      if (reusable) remediation = clone(reusable.declaration.remediation);
    }
    validateDefectClassReview(remediation, priorFindings, history.declarations);
    for (const review of remediation ?? [])
      for (const regression of review.regressions)
        for (const ref of regression.evidence) {
          await advisoryFile(home, ref);
          refs.push(ref);
        }
    const requestIdentity = fingerprint({
      readinessId: input.readinessId,
      sliceId: slice.id,
      inputIdentity,
      remediation,
    });
    const source = { baseSha, headSha, sliceBaseSha, scope, boundaryScope };
    return {
      record,
      projection,
      policy,
      module,
      root,
      home,
      context,
      slice,
      compact,
      applicable,
      source,
      priorFindings,
      history,
      remediation,
      inputManifest,
      inputIdentity,
      requestIdentity,
      adapter: runtimeAdapter,
      resources: resourceAccess,
      preparationUnavailable,
      refs,
    };
  } catch (error) {
    await compact.cleanup();
    throw error;
  }
}
function reviewRecord(p, ready, outcome, extra = {}) {
  return {
    schemaVersion: 1,
    kind: 'slice-advisory-review',
    featureId: p.context.featureId,
    sliceId: p.slice.id,
    readinessId: ready.value.readinessId,
    source: ready.value.source,
    inputIdentity: p.inputIdentity,
    requestIdentity: p.requestIdentity,
    readiness: ready.reference,
    fullVerification: 'PENDING',
    outcome,
    result: null,
    receipts: [],
    operationalErrors: [],
    ...extra,
  };
}
export async function declareAdvisoryReadiness(
  featureHome,
  input,
  dependencies = {}
) {
  const p = await preparedAdvisory(featureHome, input, dependencies);
  const directory = 'advisory/' + input.readinessId + '/';
  try {
    let ready = await existingAdvisoryJSON(
      p.home,
      directory + 'readiness.json'
    );
    if (ready) {
      validateAdvisoryReadiness(ready.value);
      advisoryAssert(
        ready.value.requestIdentity === p.requestIdentity,
        'readiness ID conflicts with changed review inputs or remediation'
      );
    } else {
      const value = {
        schemaVersion: 1,
        kind: 'slice-advisory-readiness',
        featureId: p.context.featureId,
        sliceId: p.slice.id,
        readinessId: input.readinessId,
        declaredAt: new Date().toISOString(),
        scope: p.source.boundaryScope,
        baseSha: p.source.baseSha,
        sliceBaseSha: p.source.sliceBaseSha,
        criteria: p.compact.change.criteria,
        source: p.source,
        inputIdentity: p.inputIdentity,
        requestIdentity: p.requestIdentity,
        inputManifest: p.inputManifest,
        checks: clone(input.checks),
        remediation: p.remediation,
        priorFindings: p.priorFindings,
        execution: clone(input.execution ?? {}),
        declaredBy: clone(input.actor),
      };
      ready = {
        value,
        reference: await immutableAdvisoryJSON(
          p.home,
          directory + 'readiness.json',
          value
        ),
      };
    }
    const existing = await existingAdvisoryJSON(
      p.home,
      directory + 'review.json'
    );
    if (existing) {
      validateAdvisoryRecord(existing.value, ready.value);
      await validateAdvisoryReuse(p.home, existing.value);
      advisoryAssert(
        existing.value.requestIdentity === p.requestIdentity,
        'retained review differs from its request'
      );
      return {
        schemaVersion: 1,
        outcome: existing.value.outcome,
        alreadyRecorded: true,
        review: existing.reference,
        record: existing.value,
        currentSource: p.source,
      };
    }
    const reused = p.history.records.find(
      (r) =>
        r.outcome === 'READY_FOR_FORMAL_REVIEW' &&
        r.inputIdentity === p.inputIdentity
    );
    if (!p.applicable || reused) {
      const value = reviewRecord(
        p,
        ready,
        !p.applicable ? 'NOT_APPLICABLE' : 'READY_FOR_FORMAL_REVIEW',
        reused
          ? {
              result: clone(reused.result),
              receipts: clone(reused.receipts),
              reusedFrom: reused.reference,
              reviewedSource: clone(reused.reviewedSource ?? reused.source),
            }
          : {}
      );
      const ref = await immutableAdvisoryJSON(
        p.home,
        directory + 'review.json',
        value
      );
      return {
        schemaVersion: 1,
        outcome: value.outcome,
        alreadyRecorded: false,
        reused: Boolean(reused),
        review: ref,
        record: value,
      };
    }
    const claim = await existingAdvisoryJSON(p.home, directory + 'claim.json');
    if (claim)
      return {
        schemaVersion: 1,
        outcome: 'IN_PROGRESS',
        alreadyRecorded: true,
        reason:
          'Execution was claimed; reconcile its outcome before attempting another provider launch.',
        readiness: ready.reference,
      };
    try {
      await immutableAdvisoryJSON(p.home, directory + 'claim.json', {
        schemaVersion: 1,
        kind: 'slice-advisory-claim',
        readinessId: input.readinessId,
        requestIdentity: p.requestIdentity,
      });
    } catch (error) {
      if (error.code === 'EEXIST')
        return {
          schemaVersion: 1,
          outcome: 'IN_PROGRESS',
          alreadyRecorded: true,
        };
      throw error;
    }
    if (!p.adapter || p.preparationUnavailable) {
      const value = reviewRecord(p, ready, 'UNAVAILABLE', {
        operationalErrors: [
          p.preparationUnavailable ??
            classifyUnavailable({ code: 'ADVISORY_CONFIGURATION' }),
        ],
      });
      return {
        schemaVersion: 1,
        outcome: value.outcome,
        review: await immutableAdvisoryJSON(
          p.home,
          directory + 'review.json',
          value
        ),
        record: value,
      };
    }
    const evidenceFiles = { ...p.compact.evidenceFiles };
    const checks = [];
    for (const [index, check] of input.checks.entries()) {
      const evidence = [];
      for (const [j, ref] of check.evidence.entries()) {
        const descriptor = await advisoryFile(p.home, ref);
        const path =
          '.gatereeve-agent-evidence/fast-checks/' +
          index +
          '-' +
          j +
          '-' +
          ref.path.split('/').at(-1);
        evidenceFiles[path] = descriptor;
        evidence.push({
          kind: 'snapshot-file',
          path,
          hash: descriptor.hash,
          bytes: descriptor.bytes,
        });
      }
      checks.push({
        kind: check.kind,
        command: check.command,
        outcome: 'PASS',
        evidence,
      });
    }
    let snapshot;
    try {
      snapshot = await (
        dependencies.createSnapshot ?? createPinnedRepositorySnapshot
      )({
        repositoryRoot: p.root,
        headSha: p.source.headSha,
        evidenceFiles,
        excludedPaths: p.compact.excludedPaths,
        expectedEntries: p.compact.expectedEntries,
        reviewView: p.compact.change.reviewView,
      });
    } catch {
      const value = reviewRecord(p, ready, 'UNAVAILABLE', {
        operationalErrors: [
          classifyUnavailable({ code: 'ADVISORY_ISOLATION_UNAVAILABLE' }),
        ],
      });
      return {
        schemaVersion: 1,
        outcome: value.outcome,
        review: await immutableAdvisoryJSON(
          p.home,
          directory + 'review.json',
          value
        ),
        record: value,
        providerAttempts: 0,
      };
    }
    try {
      const errors = [];
      for (let index = 0; index < 2; index += 1) {
        const runId = 'advisory-' + input.readinessId + '-' + (index + 1);
        let validatedOutput = null;
        const result = await runAgentWorkflow({
          module: p.module,
          attemptId: 'advisory-' + input.readinessId,
          runId,
          snapshotDigest: snapshot.digest,
          repositoryPath: snapshot.repositoryPath,
          input: {
            schemaVersion: 1,
            kind: 'slice-advisory-input',
            source: p.source,
            change: p.compact.change,
            inputIdentity: p.inputIdentity,
            fullVerification: 'PENDING',
            fastFocusedEvidence: checks,
            priorFindings: p.priorFindings,
          },
          adapter: p.adapter,
          loadResource: p.resources.loadResource,
          validateOutput: async (ref, value) =>
            validateJsonSchema(
              JSON.parse(await p.resources.loadResource(ref)),
              value,
              { label: ref.path }
            ),
          evaluate: async ({ outputs, receipts }) => {
            const evaluator = await p.resources.loadEvaluator({
              pluginId: p.module.run.resourcePlugin,
              ...p.module.run.evaluator,
            });
            const evaluated = await evaluator({
              input: {
                change: p.compact.change,
                priorFindings: p.priorFindings,
              },
              outputs,
              receipts,
            });
            const output = validateAdvisoryResult(
              evaluated.result,
              p.compact.change.criteria,
              p.priorFindings
            );
            validatedOutput = output;
            const value = reviewRecord(p, ready, output.outcome, {
              result: output,
              receipts,
              operationalErrors: clone(errors),
            });
            return {
              outcome:
                output.outcome === 'READY_FOR_FORMAL_REVIEW' ? 'PASS' : 'FAIL',
              files: { 'review.json': value },
            };
          },
          publishArtifacts: async ({ evaluation }) => {
            const ref = await (
              dependencies.publishReview ?? immutableAdvisoryJSON
            )(
              p.home,
              directory + 'review.json',
              evaluation.files['review.json']
            );
            return [{ path: 'review.json', hash: ref.hash }];
          },
        });
        if (result.status === 'completed') {
          const saved = await existingAdvisoryJSON(
            p.home,
            directory + 'review.json'
          );
          return {
            schemaVersion: 1,
            outcome: saved.value.outcome,
            review: saved.reference,
            record: saved.value,
            providerAttempts: index + 1,
          };
        }
        const error = classifyUnavailable(result.failure);
        errors.push(error);
        if (validatedOutput?.outcome === 'FINDINGS') {
          const value = reviewRecord(p, ready, 'FINDINGS', {
            result: validatedOutput,
            receipts: result.receipts,
            operationalErrors: errors,
          });
          return {
            schemaVersion: 1,
            outcome: 'FINDINGS',
            review: await immutableAdvisoryJSON(
              p.home,
              directory + 'review.json',
              value
            ),
            record: value,
            providerAttempts: index + 1,
          };
        }
        if (error.category !== 'TRANSIENT' || index === 1) {
          const value = reviewRecord(p, ready, 'UNAVAILABLE', {
            operationalErrors: errors,
          });
          return {
            schemaVersion: 1,
            outcome: value.outcome,
            review: await immutableAdvisoryJSON(
              p.home,
              directory + 'review.json',
              value
            ),
            record: value,
            providerAttempts: index + 1,
          };
        }
      }
    } finally {
      await snapshot.cleanup();
    }
  } finally {
    await p.compact.cleanup();
  }
}
export async function proceedWithoutCleanAdvisory(featureHome, input) {
  advisoryAssert(
    ADVISORY_ID.test(input.readinessId ?? ''),
    'stable readiness ID is required'
  );
  advisoryText(input.reason, 'recorded reason for proceeding');
  const ready = await existingAdvisoryJSON(
    featureHome,
    'advisory/' + input.readinessId + '/readiness.json'
  );
  advisoryAssert(
    ready,
    'declare the revised slice ready before recording a proceed reason'
  );
  const p = await preparedAdvisory(featureHome, {
    ...ready.value,
    repositoryRoot: input.repositoryRoot,
    repositoryAlias: input.repositoryAlias,
    actor: input.actor,
  });
  try {
    advisoryAssert(
      p.inputIdentity === ready.value.inputIdentity,
      'proceed reason cannot bypass changed reviewed inputs; declare revised readiness'
    );
    const value = {
      schemaVersion: 1,
      kind: 'slice-advisory-proceed',
      featureId: p.context.featureId,
      sliceId: p.slice.id,
      readinessId: input.readinessId,
      checkedSource: p.source,
      inputIdentity: p.inputIdentity,
      readiness: ready.reference,
      reason: input.reason,
      recordedBy: clone(input.actor),
    };
    const path = 'advisory/' + input.readinessId + '/proceed.json';
    const old = await existingAdvisoryJSON(p.home, path);
    if (old) {
      advisoryAssert(
        old.value.inputIdentity === value.inputIdentity &&
          old.value.reason === value.reason,
        'proceed record is immutable; use a new readiness declaration'
      );
      return {
        schemaVersion: 1,
        alreadyRecorded: true,
        proceed: old.reference,
      };
    }
    return {
      schemaVersion: 1,
      alreadyRecorded: false,
      proceed: await immutableAdvisoryJSON(p.home, path, value),
    };
  } finally {
    await p.compact.cleanup();
  }
}
export async function checkAdvisoryDisposition(
  featureHome,
  input,
  { requireTracked = false, ...dependencies } = {}
) {
  try {
    advisoryAssert(
      ADVISORY_ID.test(input.readinessId ?? ''),
      'stable readiness ID is required'
    );
    const ready = await existingAdvisoryJSON(
      featureHome,
      'advisory/' + input.readinessId + '/readiness.json'
    );
    advisoryAssert(ready, 'readiness declaration is missing');
    validateAdvisoryReadiness(ready.value);
    const p = await preparedAdvisory(
      featureHome,
      {
        ...ready.value,
        repositoryRoot: input.repositoryRoot,
        repositoryAlias: input.repositoryAlias,
        actor: input.actor ?? {
          kind: 'agent',
          label: 'read-only advisory disposition check',
        },
      },
      dependencies
    );
    try {
      advisoryAssert(
        p.inputIdentity === ready.value.inputIdentity &&
          p.requestIdentity === ready.value.requestIdentity,
        'reviewed inputs changed; declare the revised slice ready'
      );
      const review = await existingAdvisoryJSON(
        p.home,
        'advisory/' + input.readinessId + '/review.json'
      );
      const proceed = await existingAdvisoryJSON(
        p.home,
        'advisory/' + input.readinessId + '/proceed.json'
      );
      if (review) {
        validateAdvisoryRecord(review.value, ready.value);
        advisoryAssert(
          review.value.requestIdentity === p.requestIdentity &&
            review.value.readiness.hash === ready.reference.hash,
          'review/readiness binding changed'
        );
      }
      const reusedReferences = review
        ? await validateAdvisoryReuse(p.home, review.value)
        : [];
      const outcome = review?.value.outcome ?? 'IN_PROGRESS';
      const clean = ['READY_FOR_FORMAL_REVIEW', 'NOT_APPLICABLE'].includes(
        outcome
      );
      advisoryAssert(
        clean || proceed,
        'proceeding without a clean advisory requires a nonempty source-bound reason'
      );
      if (proceed)
        advisoryAssert(
          proceed.value.kind === 'slice-advisory-proceed' &&
            proceed.value.inputIdentity === p.inputIdentity &&
            proceed.value.readiness.hash === ready.reference.hash,
          'proceed reason is stale or unbound'
        );
      const proof = {
        schemaVersion: 1,
        featureId: p.context.featureId,
        sliceId: p.slice.id,
        readinessId: input.readinessId,
        checkedSourceSha: p.source.headSha,
        checkedSliceBaseSha: p.source.sliceBaseSha,
        checkedFeatureBaseSha: p.context.repository.featureBaseSha ?? null,
        boundaryScope: p.source.boundaryScope,
        criteria: p.compact.change.criteria,
        inputIdentity: p.inputIdentity,
        readiness: ready.reference,
        review:
          review?.reference ??
          (
            await existingAdvisoryJSON(
              p.home,
              'advisory/' + input.readinessId + '/claim.json'
            )
          )?.reference,
        outcome,
        ...(!clean
          ? { proceed: proceed.reference, reason: proceed.value.reason }
          : {}),
      };
      validateAdvisoryBoundaryProof(proof, {
        sliceId: p.slice.id,
        context: { evaluatedSourceSha: p.source.headSha },
      });
      if (input.boundaryContext) {
        const c = input.boundaryContext;
        advisoryAssert(
          c.repositoryAlias === p.context.repository.alias &&
            (c.evaluatedSourceSha ?? c.headSha) === p.source.headSha &&
            c.mergeBaseSha === p.source.sliceBaseSha,
          'advisory differs from the exact selected formal boundary'
        );
        if (p.source.scope === 'FEATURE')
          advisoryAssert(
            c.featureBaseSha === p.source.baseSha,
            'advisory differs from the original feature range'
          );
        advisoryAssert(
          !input.scope || input.scope === p.source.boundaryScope,
          'advisory and formal boundary scopes differ'
        );
        if (input.criteria)
          advisoryAssert(
            fingerprint([...input.criteria].sort()) ===
              fingerprint([...proof.criteria].sort()),
            'formal criterion scope differs from advisory readiness'
          );
      }
      if (requireTracked)
        await assertTracked(
          p.root,
          p.home,
          [
            ready.reference,
            proof.review,
            ...(!clean ? [proceed.reference] : []),
            ...p.refs,
            ...reusedReferences,
          ],
          p.source.headSha
        );
      return {
        schemaVersion: 1,
        eligible: true,
        blockers: [],
        outcome,
        fullVerification: 'PENDING',
        proof,
      };
    } finally {
      await p.compact.cleanup();
    }
  } catch (error) {
    return {
      schemaVersion: 1,
      eligible: false,
      blockers: [
        { code: error.code ?? 'ADVISORY_INVALID', message: error.message },
      ],
    };
  }
}
