import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, utimes, stat, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { planSweep, sweep, systemTools, discoverRepositories, REGENERABLE, parseStatus } from '../src/worktree-sweep.js';

const run = promisify(execFile);
const OLD = '2026-01-01T00:00:00Z';
async function git(cwd, ...args) {
  return (await run('git', args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } })).stdout;
}
async function commitAt(cwd, message, date) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) };
  await run('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd, env });
}

// One repository with an origin and a worktree per case.
async function world(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'sweep-test-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const origin = join(base, 'origin.git'), code = join(base, 'Code'), repo = join(code, 'app');
  await git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  await mkdir(code); await git(code, 'clone', '-q', origin, 'app');
  await writeFile(join(repo, '.gitignore'), 'node_modules/\n.env\nlocal-cache/\n');
  await git(repo, 'add', '.gitignore'); await commitAt(repo, 'init');
  await git(repo, 'push', '-q', 'origin', 'HEAD:main'); await git(repo, 'remote', 'set-head', 'origin', 'main');
  const add = async (name, { from = 'main' } = {}) => { const path = join(base, name); await git(repo, 'worktree', 'add', '-q', '-b', name, path, from); return path; };
  return { base, code, repo, origin, add };
}
const prs = map => ({ git: systemTools.git, gh: async (_repo, args) => JSON.stringify(Object.entries(map).map(([headRefName, state], number) => ({ headRefName, state, number }))
  .filter(row => !args?.includes('open') || row.state === 'OPEN')) });
const byName = (plan, name) => plan.worktrees.find(item => item.path.endsWith(`/${name}`));

test('discovery finds main checkouts under the root and their worktrees through git', async t => {
  const w = await world(t);
  await w.add('merged-one');
  assert.deepEqual(await discoverRepositories(w.code), [w.repo]);
  const plan = await planSweep({ root: w.code, cwd: w.base, tools: prs({}) });
  assert.equal(byName(plan, 'app').reason, 'main checkout');
  assert.equal(byName(plan, 'merged-one').status, 'candidate');
  assert.deepEqual(byName(plan, 'merged-one').reasons, ['merged into origin/main']);
});

test('candidate rules: merged branch, merged or closed PR, complete GateReeve run, and stale shown separately', async t => {
  const w = await world(t);
  const prMerged = await w.add('pr-merged'); await commitAt(prMerged, 'work'); await git(prMerged, 'push', '-q', '-u', 'origin', 'pr-merged');
  const prClosed = await w.add('pr-closed'); await commitAt(prClosed, 'work'); await git(prClosed, 'push', '-q', '-u', 'origin', 'pr-closed');
  const done = await w.add('run-done'); await commitAt(done, 'work'); await git(done, 'push', '-q', '-u', 'origin', 'run-done');
  const state = join(done, 'docs/issues/f/.gatereeve-current'); await mkdir(state, { recursive: true });
  const db = new DatabaseSync(join(state, 'workflow.sqlite.current-8'));
  db.exec('CREATE TABLE events(run_id TEXT, sequence INTEGER, operation_id TEXT, body TEXT)');
  db.prepare('INSERT INTO events VALUES (?,?,?,?)').run('r', 1, 'o', JSON.stringify({ type: 'MILESTONE', payload: { name: 'completion' } })); db.close();
  await writeFile(join(state, 'harvested.json'), JSON.stringify({ harvestedAt: new Date(Date.now() + 60000).toISOString() }));
  const old = await w.add('stale-one'); await commitAt(old, 'old work', OLD); await git(old, 'push', '-q', '-u', 'origin', 'stale-one');
  const active = await w.add('active-one'); await commitAt(active, 'fresh'); await git(active, 'push', '-q', '-u', 'origin', 'active-one');
  const plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ 'pr-merged': 'MERGED', 'pr-closed': 'CLOSED' }) });
  assert.deepEqual(byName(plan, 'pr-merged').reasons, ['pull request merged']);
  assert.deepEqual(byName(plan, 'pr-closed').reasons, ['pull request closed']);
  assert.deepEqual(byName(plan, 'run-done').reasons, ['GateReeve run complete']);
  assert.deepEqual(byName(plan, 'run-done').matters, [], 'a current harvest marker means the workflow state is not listed');
  assert.equal(byName(plan, 'stale-one').status, 'stale');
  assert.equal(byName(plan, 'active-one').status, 'active');
});

test('always skipped with reasons: main checkout, own directory, open PR, unknown PR state, unpushed development branch', async t => {
  const w = await world(t);
  const mine = await w.add('mine');
  const open = await w.add('has-open-pr');
  const dev = await w.add('development-feature'); await commitAt(dev, 'local only');
  let plan = await planSweep({ repositories: [w.repo], cwd: join(mine, 'sub'), tools: prs({ 'has-open-pr': 'OPEN' }) });
  assert.equal(byName(plan, 'app').reason, 'main checkout');
  assert.equal(byName(plan, 'mine').reason, 'contains the current working directory');
  assert.equal(byName(plan, 'has-open-pr').reason, 'open pull request');
  assert.equal(byName(plan, 'development-feature').reason, 'development branch with commits not on the remote');
  plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: { git: systemTools.git, gh: async () => { throw new Error('gh: not logged in'); } } });
  for (const name of ['mine', 'has-open-pr', 'development-feature']) assert.equal(byName(plan, name).reason, 'pr-state-unknown');
  assert.ok(open);
});

test('the list names what might matter and leaves out exactly the regenerable set', async t => {
  const w = await world(t);
  const path = await w.add('messy');
  await writeFile(join(path, 'notes.txt'), 'keep me');
  await writeFile(join(path, '.gitignore'), 'changed\n');
  await writeFile(join(path, '.env'), 'TOKEN=1');
  await mkdir(join(path, 'node_modules/x'), { recursive: true }); await writeFile(join(path, 'node_modules/x/i.js'), '');
  await mkdir(join(path, 'local-cache')); await writeFile(join(path, 'local-cache/a'), '');
  await mkdir(join(path, 'docs/issues/f/.gatereeve-current'), { recursive: true }); await git(path, 'add', '.gitignore');
  await writeFile(join(path, 'docs/issues/f/keep.md'), 'tracked'); await git(path, 'add', 'docs/issues/f/keep.md'); await commitAt(path, 'docs');
  await writeFile(join(path, '.gitignore'), 'node_modules/\n.env\nlocal-cache/\nlater\n');
  await writeFile(join(path, 'docs/issues/f/.gatereeve-current/workflow.sqlite.current-8'), 'db');
  let plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ messy: 'CLOSED' }) });
  let kinds = byName(plan, 'messy').matters.map(item => `${item.kind}:${item.path ?? item.branch ?? item.count}`);
  assert.ok(kinds.includes('untracked:notes.txt'));
  assert.ok(kinds.includes('modified:.gitignore'));
  assert.ok(kinds.includes('ignored:.env'));
  assert.ok(kinds.includes('ignored:local-cache/'));
  assert.ok(kinds.includes('unharvested-workflow-state:docs/issues/f/.gatereeve-current/'));
  assert.ok(kinds.includes('commits-not-on-remote:1'));
  assert.ok(kinds.includes('branch-without-remote:messy'));
  assert.ok(!kinds.some(item => item.includes('node_modules')));
  await git(path, 'config', '--add', 'gatereeve.sweepRegenerable', 'local-cache');
  const marker = join(path, 'docs/issues/f/.gatereeve-current/harvested.json');
  await writeFile(marker, JSON.stringify({ harvestedAt: new Date(Date.now() + 60000).toISOString() }));
  plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ messy: 'CLOSED' }) });
  kinds = byName(plan, 'messy').matters.map(item => `${item.kind}:${item.path ?? ''}`);
  assert.ok(!kinds.includes('ignored:local-cache/'), 'a git-config extension joins the regenerable set');
  assert.ok(!kinds.some(item => item.startsWith('unharvested')), 'a newer harvest marker clears the workflow state');
  // A change after the harvest makes the state unharvested again.
  const later = new Date(Date.now() + 120000);
  await utimes(join(path, 'docs/issues/f/.gatereeve-current/workflow.sqlite.current-8'), later, later);
  plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ messy: 'CLOSED' }) });
  assert.ok(byName(plan, 'messy').matters.some(item => item.kind === 'unharvested-workflow-state'));
});

test('apply removes only confirmed worktrees, prunes, deletes only merged local branches and never touches remotes', async t => {
  const w = await world(t);
  const clean = await w.add('clean-merged');
  const pushed = await w.add('pushed-closed'); await commitAt(pushed, 'unmerged work'); await git(pushed, 'push', '-q', '-u', 'origin', 'pushed-closed');
  const declined = await w.add('declined-merged');
  const tools = prs({ 'pushed-closed': 'CLOSED' });
  const result = await sweep({ repositories: [w.repo], cwd: w.base, tools, apply: true, confirm: async item => !item.path.endsWith('declined-merged') });
  assert.deepEqual(result.removed.map(item => [item.path.split('/').pop(), item.branchDeleted]).sort(), [['clean-merged', true], ['pushed-closed', false]]);
  await assert.rejects(stat(clean)); await assert.rejects(stat(pushed));
  assert.ok(await stat(declined));
  const worktrees = await git(w.repo, 'worktree', 'list', '--porcelain');
  assert.ok(!worktrees.includes('clean-merged') && worktrees.includes('declined-merged'));
  assert.match(await git(w.repo, 'branch', '--list', 'pushed-closed'), /pushed-closed/u, 'an unmerged local branch is kept');
  assert.match(await git(w.origin, 'branch', '--list', 'pushed-closed'), /pushed-closed/u, 'the remote branch is untouched');
});

test('non-interactive apply removes only worktrees with nothing listed, and preview never removes', async t => {
  const w = await world(t);
  const empty = await w.add('empty-merged'); await git(empty, 'push', '-q', '-u', 'origin', 'empty-merged');
  const listed = await w.add('listed-merged'); await writeFile(join(listed, 'notes.txt'), 'keep');
  const tools = prs({});
  const preview = await sweep({ repositories: [w.repo], cwd: w.base, tools });
  assert.equal(preview.applied, false);
  assert.ok(await stat(empty));
  const result = await sweep({ repositories: [w.repo], cwd: w.base, tools, apply: true, yes: true });
  assert.deepEqual(result.removed.map(item => item.path.split('/').pop()), ['empty-merged']);
  assert.ok(result.declined.some(item => item.path === listed));
  assert.ok(await stat(listed));
});

test('every regenerable directory name is omitted at any depth; an ignored file with such a name and .env are listed', async t => {
  // Pinned to the spec's exact list: iterating the constant alone would not
  // notice a name added to or dropped from it.
  assert.deepEqual([...REGENERABLE], ['node_modules', 'dist', 'build', 'out', '.next', '.turbo', '.cache', 'coverage', '__pycache__', '.pytest_cache', '.venv', 'target']);
  const w = await world(t);
  const path = await w.add('regen');
  await writeFile(join(path, '.gitignore'), [...REGENERABLE, '.env', ''].join('\n'));
  await git(path, 'add', '.gitignore'); await commitAt(path, 'ignore');
  for (const name of REGENERABLE) { await mkdir(join(path, 'pkg', 'deep', name), { recursive: true }); await writeFile(join(path, 'pkg', 'deep', name, 'f'), 'x'); }
  await writeFile(join(path, '.env'), 'TOKEN=1');
  await writeFile(join(path, 'dist'), 'a regular file named dist is not regenerable');
  const plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ regen: 'CLOSED' }) });
  const ignored = byName(plan, 'regen').matters.filter(item => item.kind === 'ignored').map(item => item.path).sort();
  assert.deepEqual(ignored, ['.env', 'dist']);
});

test('a staged rename is listed by its new path and its original path is not misparsed', async t => {
  assert.deepEqual(parseStatus('R  new.txt\0old.txt\0?? notes.txt\0'), [{ code: 'R ', path: 'new.txt' }, { code: '??', path: 'notes.txt' }]);
  const w = await world(t);
  const path = await w.add('renamed');
  await writeFile(join(path, 'old.txt'), 'content'); await git(path, 'add', 'old.txt'); await commitAt(path, 'old');
  await git(path, 'mv', 'old.txt', 'new.txt');
  const plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ renamed: 'CLOSED' }) });
  const modified = byName(plan, 'renamed').matters.filter(item => item.kind === 'modified').map(item => item.path);
  assert.deepEqual(modified, ['new.txt']);
});

test('an unreadable part of workflow state is never covered by a harvest marker', { skip: process.getuid?.() === 0 }, async t => {
  const w = await world(t);
  const path = await w.add('unreadable');
  const state = join(path, 'docs/issues/f/.gatereeve-current');
  await mkdir(join(state, 'objects'), { recursive: true }); await writeFile(join(state, 'objects', 'a'), 'x');
  await writeFile(join(state, 'harvested.json'), JSON.stringify({ harvestedAt: new Date(Date.now() + 60000).toISOString() }));
  await chmod(join(state, 'objects'), 0o000);
  let plan;
  try { plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ unreadable: 'CLOSED' }) }); }
  finally { await chmod(join(state, 'objects'), 0o700); }
  assert.ok(byName(plan, 'unreadable').matters.some(item => item.kind === 'unharvested-workflow-state'));
});

test('an open PR outside the all-states listing still protects its worktree; a full open listing is unknown', async t => {
  const w = await world(t);
  await w.add('old-open');
  const tools = rows => ({ git: systemTools.git, gh: async (_repo, args) => JSON.stringify(args.includes('open') ? rows : []) });
  let plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: tools([{ headRefName: 'old-open', state: 'OPEN', number: 1 }]) });
  assert.equal(byName(plan, 'old-open').reason, 'open pull request');
  plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: tools(Array.from({ length: 10000 }, (_, number) => ({ headRefName: `b${number}`, state: 'OPEN', number }))) });
  assert.equal(byName(plan, 'old-open').reason, 'pr-state-unknown');
});

test('only repository-local git config extends the regenerable set', async t => {
  const w = await world(t);
  const path = await w.add('global-ext');
  await mkdir(join(path, 'local-cache')); await writeFile(join(path, 'local-cache/a'), 'secret');
  const globalConfig = join(w.base, 'global.gitconfig');
  await writeFile(globalConfig, '[gatereeve]\n\tsweepRegenerable = local-cache\n');
  const previous = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = globalConfig;
  try {
    const plan = await planSweep({ repositories: [w.repo], cwd: w.base, tools: prs({ 'global-ext': 'CLOSED' }) });
    assert.ok(byName(plan, 'global-ext').matters.some(item => item.kind === 'ignored' && item.path === 'local-cache/'));
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; }
});
