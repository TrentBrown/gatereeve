import { createHash, randomUUID } from 'node:crypto';
import { execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, lstat, readFile, writeFile, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { validateConductorStateChain, releaseStateSha256, conductorStateArtifactName } from './release-conductor-state.js';

const execFile = promisify(execute);
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const RELEASE_RECEIPT_POLICY = 'shared-release-receipt/1';

// One content-addressed provider artifact is shared by features in a workspace.
// The cache is evidence, not authority: bytes are checked against GitHub's digest
// and mutable provider facts and feature inclusion are freshly observed each time.
export async function observeSharedRelease({ root, repository, artifactId, mergeInputSha, runJson,
  download = async id => (await execFile(process.env.GATEREEVE_GH_EXECUTABLE || 'gh',
    ['api', `repos/${repository}/actions/artifacts/${id}/zip`], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })).stdout,
  readChain = async path => JSON.parse((await execFile('unzip', ['-p', path, 'release-state-chain.json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })).stdout),
}) {
  check(Number.isSafeInteger(artifactId) && artifactId > 0, 'Release receipt requires an exact artifact ID');
  check(/^[^/\s]+\/[^/\s]+$/u.test(repository) && /^[a-f0-9]{40}$/u.test(mergeInputSha), 'Invalid release inclusion identity');
  const artifact = await runJson(['api', `repos/${repository}/actions/artifacts/${artifactId}`]);
  check(!artifact.expired && artifact.id === artifactId && /^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '')
    && artifact.size_in_bytes <= 16 * 1024 * 1024, 'Release receipt artifact is unavailable or has no verifiable digest');
  const run = await runJson(['api', `repos/${repository}/actions/runs/${artifact.workflow_run?.id}`]);
  check(run.repository?.full_name === repository && run.event === 'workflow_dispatch' && run.head_branch === 'main'
    && run.path === '.github/workflows/release-conductor.yml' && run.status === 'completed'
    && run.conclusion === 'success', 'Release receipt is not from a successful protected Conductor run');
  const directory = join(root, '.gatereeve-release-receipts');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  check(!(await lstat(directory)).isSymbolicLink(), 'Unsafe shared release directory');
  const path = join(directory, `${artifact.digest.slice(7)}.zip`);
  let bytes;
  try { check((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink(), 'Unsafe release receipt'); bytes = await readFile(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes) {
    bytes = await download(artifactId);
    check(digest(bytes) === artifact.digest, 'Downloaded release evidence differs from provider digest');
    const pending = `${path}.${randomUUID()}.pending`;
    await writeFile(pending, bytes, { flag: 'wx', mode: 0o600 });
    try { await link(pending, path).catch(error => { if (error.code !== 'EEXIST') throw error; }); }
    finally { await rm(pending, { force: true }); }
  }
  check(digest(bytes) === artifact.digest, 'Retained shared release evidence changed');
  const chain = validateConductorStateChain(await readChain(path)), latest = chain.at(-1);
  check(latest.stage === 'COMPLETE' && latest.failure === null && latest.run.repository === repository
    && String(latest.run.id) === String(run.id) && latest.run.attempt === run.run_attempt
    && artifact.name === conductorStateArtifactName(latest), 'Artifact is not the completed release receipt');
  for (const ancestor of new Set([mergeInputSha, latest.release.sourceCommit])) {
    const descendant = ancestor === mergeInputSha ? latest.release.sourceCommit : run.head_sha;
    const comparison = await runJson(['api', `repos/${repository}/compare/${ancestor}...${descendant}`]);
    check(['ahead', 'identical'].includes(comparison.status), 'Feature or workflow is not included in the release source');
  }
  return { policy: RELEASE_RECEIPT_POLICY, repository, artifactId, digest: artifact.digest,
    stateSha256: releaseStateSha256(latest), release: latest.release, stage: latest.stage,
    history: chain.map(record => ({ sequence: record.sequence, stage: record.stage, condition: record.condition,
      recordedAt: record.recordedAt, sha256: releaseStateSha256(record) })),
    distributedEvidence: latest.evidence, featureMergeInputSha: mergeInputSha,
    observation: { observedAt: new Date().toISOString(), policy: 'fresh-at-protected-passage', runId: run.id, attempt: run.run_attempt },
    retained: { path, bytes: bytes.length } };
}
