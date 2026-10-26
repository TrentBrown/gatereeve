import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const SOURCE_POLICY = 'gatereeve-source-acceptance/1';
export const SOURCE_ARTIFACT = 'gatereeve-source-acceptance';
const execute = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 10_000_000 });
const git = args => execute('git', args).trim();
const gh = args => JSON.parse(execute('gh', args));
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function qualifySourceReceipt(receipt, { repository, source, tree, run, artifact }) {
  check(run.repository?.full_name === repository && run.path === '.github/workflows/plugin-ci.yml'
    && run.event === 'push' && run.head_branch === 'main' && run.status === 'completed'
    && run.conclusion === 'success' && run.head_sha === source, 'Source CI is not successful exact-source main CI');
  check(artifact.name === SOURCE_ARTIFACT && !artifact.expired
    && Number(artifact.workflow_run?.id) === Number(run.id), 'Source receipt is unavailable or from another run');
  check(receipt.policy === SOURCE_POLICY && receipt.repository === repository && receipt.source === source
    && receipt.tree === tree && String(receipt.runId) === String(run.id)
    && receipt.attempt === run.run_attempt && receipt.scope === 'full'
    && receipt.outcome === 'PASS', 'Source receipt does not qualify for this release');
  return { ...receipt, artifactId: artifact.id, artifactDigest: artifact.digest,
    observedAt: new Date().toISOString(), observation: 'Fresh completed GitHub run and retained artifact' };
}

export async function reuseSourceAcceptance({ repository, source, output, runJson = gh, run = execute, tree = git(['rev-parse', `${source}^{tree}`]) }) {
  const list = await runJson(['api', `repos/${repository}/actions/workflows/plugin-ci.yml/runs?head_sha=${source}&event=push&status=success&per_page=100`]);
  const candidate = list.workflow_runs.find(item => item.head_sha === source && item.head_branch === 'main');
  check(candidate, 'No qualifying source CI yet; wait for exact-source Plugin CI before release preparation');
  const live = await runJson(['api', `repos/${repository}/actions/runs/${candidate.id}`]);
  const artifacts = await runJson(['api', `repos/${repository}/actions/runs/${candidate.id}/artifacts?per_page=100`]);
  const found = artifacts.artifacts.filter(item => item.name === SOURCE_ARTIFACT && !item.expired);
  check(found.length === 1, 'Expected one retained source acceptance receipt');
  const directory = await mkdtemp(join(tmpdir(), 'gatereeve-source-'));
  try {
    await run('gh', ['run', 'download', String(candidate.id), '--repo', repository, '--name', SOURCE_ARTIFACT, '--dir', directory]);
    const receipt = JSON.parse(await readFile(join(directory, 'source-acceptance.json'), 'utf8'));
    const verified = qualifySourceReceipt(receipt, { repository, source, tree, run: live, artifact: { ...found[0], workflow_run: { id: candidate.id } } });
    await writeFile(output, JSON.stringify(verified, null, 2));
    return verified;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, output] = process.argv.slice(2);
  if (mode === 'record') {
    check(process.env.CI_SCOPE === 'full' && process.env.GITHUB_EVENT_NAME === 'push'
      && process.env.GITHUB_REF === 'refs/heads/main', 'Only full main source CI can publish source acceptance');
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'source-acceptance.json'), JSON.stringify({ policy: SOURCE_POLICY,
      repository: process.env.GITHUB_REPOSITORY, source: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']),
      runId: process.env.GITHUB_RUN_ID, attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      scope: 'full', outcome: 'PASS', completedAt: new Date().toISOString() }));
  } else if (mode === 'reuse') {
    await reuseSourceAcceptance({ repository: process.env.GITHUB_REPOSITORY, source: git(['rev-parse', 'HEAD']), output });
  } else throw new Error('Use record <directory> or reuse <receipt-path>');
}
