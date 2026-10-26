import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const check = (condition, reason) => { if (!condition) throw new Error(reason); };
const json = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10_000_000 }));

// PR rehearsals follow the released version in the trusted base manifest. A
// later smoke failure does not undo an already published, verified Cask packet.
// The downloaded packet's publication/integrity checks still run on each host.
export async function selectCaskBaseline({ repository, version, artifacts, readRun }) {
  check(/^0\.\d+\.\d+-rc\.\d+$/u.test(version ?? ''), 'Base manifest lacks a canonical released RC version');
  const tag = `v${version}`, name = `gatereeve-${tag}-linked-homebrew-cask-result`;
  const candidates = artifacts.filter(a => a.name === name && !a.expired)
    .sort((a, b) => Number(b.id) - Number(a.id));
  for (const artifact of candidates) {
    const run = await readRun(artifact.workflow_run?.id);
    if (run.repository?.full_name !== repository || run.path !== '.github/workflows/release-conductor.yml'
      || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.status !== 'completed'
      || !['success', 'failure', 'cancelled'].includes(run.conclusion)
      || Number(run.id) !== Number(artifact.workflow_run?.id)
      || run.head_sha !== artifact.workflow_run?.head_sha) continue;
    return { runId: String(run.id), tag, artifactId: artifact.id };
  }
  throw new Error(`No retained protected publication packet for ${tag}; inspect release retention before retrying Cask smoke`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let baseline;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const base = process.env.PR_BASE_SHA;
    check(/^[a-f0-9]{40}$/u.test(base ?? ''), 'PR baseline requires the exact trusted base commit');
    const manifest = JSON.parse(execFileSync('git', ['show', `${base}:workflow-site/releases/desktop.json`], { encoding: 'utf8' }));
    const version = manifest.channels?.rc?.version, repository = process.env.GITHUB_REPOSITORY;
    check(/^0\.\d+\.\d+-rc\.\d+$/u.test(version ?? ''), 'Base manifest lacks a canonical released RC version');
    const pages = json(['api', '--paginate', '--slurp', `repos/${repository}/actions/artifacts?name=gatereeve-v${version}-linked-homebrew-cask-result&per_page=100`]);
    baseline = await selectCaskBaseline({ repository, version, artifacts: pages.flatMap(page => page.artifacts),
      readRun: id => { check(Number.isSafeInteger(Number(id)) && Number(id) > 0, 'Artifact lacks a valid producer run'); return json(['api', `repos/${repository}/actions/runs/${id}`]); } });
  } else {
    check(/^\d+$/u.test(process.env.CASK_PUBLICATION_RUN_ID ?? '') && /^v0\.\d+\.\d+-rc\.\d+$/u.test(process.env.RELEASE_TAG ?? ''),
      'Release smoke requires its explicit publication run and tag');
    baseline = { runId: process.env.CASK_PUBLICATION_RUN_ID, tag: process.env.RELEASE_TAG };
  }
  await appendFile(process.env.GITHUB_OUTPUT, `cask_run_id=${baseline.runId}\nrelease_tag=${baseline.tag}\n`);
  console.log(JSON.stringify(baseline));
}
