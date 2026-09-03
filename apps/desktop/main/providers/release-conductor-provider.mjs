import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validateModuleProviderRequest } from '../../resources/protocol/module-runtime.js';
import { discoverConductorState } from '../../resources/release/release-conductor-discovery.js';

const execFile = promisify(execFileCallback);
const PROVIDER = Object.freeze({ id: 'gatereeve/release-conductor', version: '1.0.0' });
const TAG_FROM_ARTIFACT = /^gatereeve-(v\d+\.\d+\.\d+-rc\.\d+)-release-conductor-/u;

async function command(executable, args, options = {}) {
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
    throw new Error((error.stderr || error.stdout || error.message || String(error)).trim());
  }
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
} = {}) {
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
  const listed = pages(await runJson(gh, [
    'api', '--paginate', '--slurp', `/repos/${repository}/actions/artifacts?per_page=100`,
  ], { cwd: repositoryRoot }));
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
  const temporary = await mkdtemp(join(tmpdir(), 'gatereeve-release-provider-'));
  try {
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
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const complete = candidates.find((candidate) => candidate.latest.stage === 'COMPLETE');
  const selected = complete ?? candidates[0] ?? null;
  const failure = selected === null && firstFailure ? firstFailure : null;
  return {
    schemaVersion: 1,
    requestId: request.requestId,
    provider: PROVIDER,
    module: request.module,
    observedInputFingerprint: request.input.inputFingerprint,
    live: liveStatus(selected, failure),
    outcome: complete ? 'PASS' : null,
    evidence: complete ? {
      releaseTag: complete.latest.release.tag,
      releaseSourceCommit: complete.latest.release.sourceCommit,
      featureMergeInputSha: mergeInputSha,
      stateSha256: complete.status.stateSha256,
      artifactIds: complete.artifacts.map((entry) => entry.artifact.id),
    } : null,
  };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const lines = input.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length !== 1) throw new Error('Provider requires exactly one JSON request line');
  const request = validateModuleProviderRequest(JSON.parse(lines[0]));
  if (request.provider.id !== PROVIDER.id || request.provider.version !== PROVIDER.version) {
    throw new Error('Provider request identity does not match this executable');
  }
  process.stdout.write(`${JSON.stringify(await observeReleaseConductor(request))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
