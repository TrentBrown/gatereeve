import { execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile, appendFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir, release } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { retryTransient } from '../plugin-src/shared/resources/release/recovery.js';

const execFile = promisify(execute);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const command = async (executable, args) => (await execFile(executable, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).stdout;
async function provider(args) {
  return (await retryTransient(async () => {
    try { return JSON.parse(await command('gh', args)); }
    catch (error) { error.status = Number(/\bHTTP (429|502|503|504|401|403)\b/u.exec(error.stderr ?? '')?.[1]) || null; throw error; }
  })).value;
}
export function reusableMatrixReceipt(receipt, expected, bytes) {
  return receipt?.policy === 'matrix-check/1' && receipt.outcome === 'PASS'
    && json(receipt.identity) === json(expected) && receipt.outputSha256 === hash(bytes);
}

export async function matrixCheck({ artifactName, evidence, inputs, priorRunId, commandLine, investigation = '',
  repository = process.env.GITHUB_REPOSITORY, runId = process.env.GITHUB_RUN_ID, runtime = {} }) {
  const runCommand = runtime.command ?? command, readProvider = runtime.provider ?? provider;
  assert(/^[a-zA-Z0-9_.-]+$/u.test(artifactName) && commandLine.length && inputs.length, 'Invalid matrix check identity/command');
  const source = (await runCommand('git', ['rev-parse', 'HEAD'])).trim();
  const identity = { source, inputs: await Promise.all(inputs.map(async path => hash(await readFile(path)))),
    platform: process.platform, architecture: process.arch, release: release(), node: process.versions.node,
    command: commandLine.map(value => process.env.RUNNER_TEMP ? value.replaceAll(process.env.RUNNER_TEMP, '$RUNNER_TEMP') : value),
    tool: artifactName.includes('cask') ? (await runCommand('brew', ['--version'])).trim() : null };
  const sidecar = `${evidence}.reuse.json`;
  await mkdir(dirname(evidence), { recursive: true });
  let previous = null, previousReference = null;
  if (priorRunId && priorRunId !== runId && !artifactName.startsWith('public-')) {
    assert(/^\d+$/u.test(priorRunId), 'Invalid prior matrix run');
    const run = await readProvider(['api', `repos/${repository}/actions/runs/${priorRunId}`]);
    assert(run.repository?.full_name === repository && run.event === 'workflow_dispatch' && run.head_branch === 'main'
      && run.path === '.github/workflows/release-conductor.yml' && ['success', 'failure', 'cancelled'].includes(run.conclusion),
    'Prior matrix evidence is not from a completed protected Conductor run');
    // Checker code is part of the source identity; never trust only a sidecar's assertion.
    const artifacts = await readProvider(['api', `repos/${repository}/actions/runs/${priorRunId}/artifacts?per_page=100`]);
    const matching = artifacts.artifacts.filter(item => run.head_sha === source && item.name === artifactName && !item.expired);
    assert(matching.length <= 1, 'Ambiguous prior matrix artifact');
    if (matching.length) {
      previousReference = { runId: priorRunId, artifactId: matching[0].id, digest: matching[0].digest ?? null };
      const temporary = await mkdtemp(join(tmpdir(), 'gr-matrix-'));
      try {
        await runCommand('gh', ['run', 'download', priorRunId, '--repo', repository, '--name', artifactName, '--dir', temporary]);
        try { previous = JSON.parse(await readFile(join(temporary, basename(sidecar)), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (previous?.policy === 'matrix-check/1' && json(previous.identity) === json(identity)) {
          if (previous.outcome === 'PASS') {
            const bytes = await readFile(join(temporary, basename(evidence)));
            assert(reusableMatrixReceipt(previous, identity, bytes), 'Retained passing matrix bytes are corrupt');
            await copyFile(join(temporary, basename(evidence)), evidence);
            const receipt = { ...previous, reusedFrom: previousReference, observedAt: new Date().toISOString() };
            await writeFile(sidecar, json(receipt));
            return receipt;
          }
          assert(investigation.trim(), 'Prior check failed substantively; provide the model investigation before retrying these unchanged inputs');
        }
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
  }
  const startedAt = new Date().toISOString();
  try {
    const attempted = await retryTransient(() => runCommand(commandLine[0], commandLine.slice(1)));
    const receipt = { policy: 'matrix-check/1', identity, outcome: 'PASS', outputSha256: hash(await readFile(evidence)),
      origin: { runId, artifactName }, startedAt, completedAt: new Date().toISOString(), attempts: attempted.attempts,
      previous: previous ? { ...previousReference, outcome: previous.outcome, investigation } : null };
    await writeFile(sidecar, json(receipt));
    return receipt;
  } catch (error) {
    await writeFile(sidecar, json({ policy: 'matrix-check/1', identity, outcome: 'FAIL', origin: { runId, artifactName },
      startedAt, completedAt: new Date().toISOString(), attempts: error.attempts ?? [],
      diagnostic: (error.stderr || error.message).slice(0, 65536), investigation,
      previous: previous ? { ...previousReference, outcome: previous.outcome, investigation } : null }));
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), separator = args.indexOf('--');
  const value = name => args[args.indexOf(name) + 1];
  const values = name => args.slice(0, separator).flatMap((arg, index) => arg === name ? [args[index + 1]] : []);
  assert(separator > 0 && args.includes('--artifact') && args.includes('--evidence'), 'Matrix check needs --artifact, --evidence, --input and -- command');
  const result = await matrixCheck({ artifactName: value('--artifact'), evidence: value('--evidence'), inputs: values('--input'),
    priorRunId: process.env.PRIOR_MATRIX_RUN_ID ?? '', investigation: process.env.RETRY_ASSESSMENT ?? '', commandLine: args.slice(separator + 1) });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `\n${result.origin.artifactName}: ${result.reusedFrom ? 'reused qualified passing evidence' : 'executed'}; ${result.outcome}.\n`);
}
