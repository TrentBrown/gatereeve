import { withScratch } from '../storage/scratch.js';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validateModuleProviderRequest } from '../protocol/module-runtime.js';
import { discoverConductorState } from './release-conductor-discovery.js';
import { observeSharedRelease } from './release-receipt.js';
import { retryTransient } from './recovery.js';

const execFile = promisify(execFileCallback);
const PROVIDER = Object.freeze({ id: 'gatereeve/release-conductor', version: '1.0.0' });
const TAG_FROM_ARTIFACT = /^gatereeve-(v\d+\.\d+\.\d+-rc\.\d+)-release-conductor-/u;

async function command(executable, args, options = {}) {
  const attempted = await retryTransient(async () => {
  try {
    const result = await execFile(executable, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      timeout: options.timeout ?? 30_000,
      maxBuffer: 10_000_000,
      env: process.env,
    });
    return result.stdout;
  } catch (error) {
    const wrapped = new Error((error.stderr || error.stdout || error.message || String(error)).trim());
    wrapped.code = typeof error.code === 'string' ? error.code : null;
    wrapped.status = Number(/\bHTTP (429|502|503|504|401|403)\b/u.exec(error.stderr ?? '')?.[1]) || null;
    throw wrapped;
  }
  }, { budgetMs: options.retryBudgetMs ?? 120000, onAttempt: options.onAttempt });
  return attempted.value;
}

async function jsonCommand(executable, args, options) {
  const output = await command(executable, args, options);
  try { return JSON.parse(output); }
  catch { throw new Error(`Command returned malformed JSON: ${executable} ${args.join(' ')}`); }
}

async function findStateFile(root) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.shift();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name === 'release-state.json') return path;
    }
  }
  throw new Error('Downloaded conductor artifact does not contain release-state.json');
}

function pages(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((page) => Array.isArray(page?.artifacts) ? page.artifacts : []);
}

function tagFor(artifact) {
  return TAG_FROM_ARTIFACT.exec(artifact.name ?? '')?.[1] ?? null;
}

function compareTags(left, right) {
  const numbers = (tag) => tag.slice(1).split(/\.|-rc\./u).map(Number);
  const leftParts = numbers(left);
  const rightParts = numbers(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index];
  }
  return 0;
}

function liveStatus(discovery, failure = null) {
  const status = discovery?.status ?? null;
  const effectiveFailure = failure ?? status?.failure ?? null;
  const repository = discovery?.repository ?? 'TrentBrown/gatereeve';
  const current = status?.stage ?? 'UNAVAILABLE';
  const complete = current === 'COMPLETE' && effectiveFailure === null;
  return {
    status: failure ? 'unavailable' : effectiveFailure ? 'blocked' : 'waiting',
    detail: effectiveFailure
      ? effectiveFailure.message
      : complete
        ? `${status.release.tag} completed every Release Conductor stage and contains this feature.`
        : status
          ? `${status.release.tag} is at ${current}; next action is ${status.nextAction}.`
          : 'No retained Release Conductor evidence currently contains this feature.',
    updatedAt: new Date().toISOString(),
    stages: status?.history?.map((entry) => ({
      id: entry.stage,
      label: entry.stage.replaceAll('_', ' '),
      status: entry.condition,
      detail: `Sequence ${entry.sequence}`,
    })) ?? [],
    actions: complete ? [] : [{
      id: status?.nextAction ?? 'START_RELEASE',
      label: status?.nextAction?.replaceAll('_', ' ') ?? 'Open Release Conductor',
      detail: 'Release mutations remain in the protected GitHub workflow.',
      available: true,
      url: `https://github.com/${repository}/actions/workflows/release-conductor.yml`,
    }],
    attempts: status?.history?.map((entry) => ({
      id: `sequence-${entry.sequence}`,
      label: entry.stage,
      status: entry.condition,
      recordedAt: entry.recordedAt,
    })) ?? [],
    evidence: discovery ? [{
      label: 'Release Conductor state',
      tag: status.release.tag,
      sourceCommit: status.release.sourceCommit,
      stateSha256: status.stateSha256,
      artifactIds: discovery.artifacts.map((entry) => entry.artifact.id),
    }] : [],
    links: [{
      label: 'Release Conductor',
      url: `https://github.com/${repository}/actions/workflows/release-conductor.yml`,
    }],
    failure: effectiveFailure,
  };
}

export async function observeReleaseConductor(request, {
  run = command,
  runJson = jsonCommand,
  sharedRuntime = {},
} = {}) {
  const attempts = [];
  const originalRun = run, originalJson = runJson;
  const optionsFor = options => ({ ...options, retryBudgetMs: request.input.evidence?.retryBudgetMs,
    onAttempt: attempt => attempts.push(attempt) });
  run = (executable, args, options) => originalRun(executable, args, optionsFor(options));
  runJson = (executable, args, options) => originalJson(executable, args, optionsFor(options));
  const evidence = request.input.evidence;
  const repositoryRoot = evidence?.repositoryRoot;
  const mergeInputSha = evidence?.mergeInputSha;
  if (request.module.id !== 'gatereeve/release' || request.input.scope !== 'FEATURE') {
    throw new Error('Release Conductor provider accepts only the GateReeve feature-finalization module');
  }
  if (typeof repositoryRoot !== 'string' || !/^[0-9a-f]{40}$/u.test(mergeInputSha ?? '')) {
    throw new Error('Release Conductor observation requires a repository and exact final merge input');
  }
  const gh = process.env.GATEREEVE_GH_EXECUTABLE || 'gh';
  const git = process.env.GATEREEVE_GIT_EXECUTABLE || 'git';
  const repository = (await runJson(gh, [
    'repo', 'view', '--json', 'nameWithOwner', '--jq', '{nameWithOwner:.nameWithOwner}',
  ], { cwd: repositoryRoot })).nameWithOwner;
  if (repository !== 'TrentBrown/gatereeve') {
    throw new Error(`GateReeve Release provider does not recognize repository ${repository}`);
  }
  await run(git, ['-C', repositoryRoot, 'cat-file', '-e', `${mergeInputSha}^{commit}`]);
  const shared = async artifactId => {
    const receipt = await observeSharedRelease({ root: evidence.workspaceRoot ?? repositoryRoot,
      repository, artifactId, mergeInputSha, runJson: args => runJson(gh, args, { cwd: repositoryRoot }), ...sharedRuntime });
    const live = liveStatus({ repository, status: { release: receipt.release, stage: 'COMPLETE', nextAction: 'NONE',
      stateSha256: receipt.stateSha256, history: receipt.history }, artifacts: [{ artifact: { id: receipt.artifactId } }] });
    live.attempts.push(...attempts.map((attempt, index) => ({ id: `transport-${index}`, ...attempt })));
    return { schemaVersion: 1, requestId: request.requestId, provider: PROVIDER, module: request.module,
      observedInputFingerprint: request.input.inputFingerprint, outcome: 'PASS', live,
      evidence: { releaseTag: receipt.release.tag, releaseSourceCommit: receipt.release.sourceCommit,
        featureMergeInputSha: mergeInputSha, sharedReceipt: receipt,
        retainedDiscovery: { latest: { stage: 'COMPLETE', release: receipt.release } } } };
  };
  if (evidence.releaseArtifactId !== undefined) return shared(evidence.releaseArtifactId);
  const listed = pages(await runJson(gh, [
    'api', '--paginate', '--slurp', `/repos/${repository}/actions/artifacts?per_page=100`,
  ], { cwd: repositoryRoot }));
  // A completed Conductor bundle includes its verified chain. Import it once,
  // rather than downloading every historical stage for each included feature.
  for (const artifact of listed.filter(item => /-release-conductor-\d+-complete$/u.test(item.name ?? ''))
    .sort((a, b) => b.id - a.id)) {
    try { return await shared(artifact.id); }
    catch { /* Older releases may not contain the feature; retain normal live discovery. */ }
  }
  const tags = [...new Set(listed.map(tagFor).filter(Boolean))].sort(compareTags);
  const runCache = new Map();
  const compare = async (ancestor, descendant) => {
    const result = await runJson(
      gh,
      ['api', `/repos/${repository}/compare/${ancestor}...${descendant}`],
      { cwd: repositoryRoot },
    );
    return ['ahead', 'identical'].includes(result.status);
  };
  const candidates = [];
  let firstFailure = null;
  await withScratch({ purpose: 'release-provider-download' }, async ({ path: temporary }) => {
    for (const tag of tags) {
      const tagged = listed.filter((artifact) => tagFor(artifact) === tag);
      const normalized = [];
      const states = new Map();
      try {
        for (const artifact of tagged) {
          const runId = String(artifact.workflow_run?.id ?? '');
          if (!runCache.has(runId)) {
            runCache.set(runId, await runJson(
              gh,
              ['api', `/repos/${repository}/actions/runs/${runId}`],
              { cwd: repositoryRoot },
            ));
          }
          const workflowRun = runCache.get(runId);
          const destination = resolve(temporary, String(artifact.id));
          await run(gh, [
            'run', 'download', runId, '--repo', repository,
            '--name', artifact.name, '--dir', destination,
          ], { cwd: repositoryRoot, timeout: 60_000 });
          states.set(artifact.id, JSON.parse(await readFile(await findStateFile(destination), 'utf8')));
          normalized.push({
            id: artifact.id,
            name: artifact.name,
            expired: artifact.expired,
            workflowRun: {
              id: workflowRun.id,
              headSha: workflowRun.head_sha,
              headBranch: workflowRun.head_branch,
              event: workflowRun.event,
              path: workflowRun.path,
              conclusion: workflowRun.conclusion,
            },
          });
        }
        const discovery = await discoverConductorState({
          tag,
          listArtifacts: async () => normalized,
          readArtifactState: async (artifact) => states.get(artifact.id),
          isAncestor: compare,
        });
        discovery.repository = repository;
        if (await compare(mergeInputSha, discovery.latest.release.sourceCommit)) {
          candidates.push(discovery);
          if (discovery.latest.stage === 'COMPLETE') break;
        }
      } catch (error) {
        firstFailure ??= { code: 'CONDUCTOR_EVIDENCE_INVALID', message: error.message ?? String(error) };
      }
    }
  });
  const complete = candidates.find((candidate) => candidate.latest.stage === 'COMPLETE');
  const selected = complete ?? candidates[0] ?? null;
  const failure = complete ? { code: 'SHARED_RECEIPT_REQUIRED', message: 'Completed release needs a verifiable shared artifact receipt; refresh its provider evidence.' }
    : selected === null && firstFailure ? firstFailure : null;
  return {
    schemaVersion: 1,
    requestId: request.requestId,
    provider: PROVIDER,
    module: request.module,
    observedInputFingerprint: request.input.inputFingerprint,
    live: liveStatus(selected, failure),
    outcome: null,
    evidence: null,
  };
}
