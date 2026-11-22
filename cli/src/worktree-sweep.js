// `gatereeve worktree sweep` (spec AC10, design D17, D18, D31): find finished
// git worktrees, show anything in them that might matter, and remove the ones
// the human confirms. Standalone: it reads git, GitHub PR state and workflow
// databases, and never changes a workflow run, a remote or a branch elsewhere.
import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, rm, chmod, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep, basename, relative } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const run = promisify(execFile);
export const STALE_DAYS = 30;
// Spec AC10: exact git-ignored directory names that are regenerable and never
// listed; a repository extends this only through local git configuration.
export const REGENERABLE = Object.freeze(['node_modules', 'dist', 'build', 'out', '.next', '.turbo', '.cache', 'coverage', '__pycache__', '.pytest_cache', '.venv', 'target']);
const DEVELOPMENT = /^development(?:-.*)?$/u;

export const systemTools = Object.freeze({
  async git(cwd, args) { return (await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout; },
  async gh(cwd, args) { return (await run('gh', args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 60_000 })).stdout; },
});

const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

// Main checkouts directly under the root or one level below it. Worktrees are
// then discovered through `git worktree list`, never by scanning folders.
export async function discoverRepositories(root) {
  const found = [];
  const visit = async (dir, depth) => {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      const git = await lstat(join(path, '.git')).catch(() => null);
      if (git?.isDirectory()) found.push(path);
      else if (!git && depth < 2) await visit(path, depth + 1);
    }
  };
  await visit(resolve(root), 1);
  return found.sort();
}

function parseWorktrees(text) {
  const items = [];
  let item = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) { item = { path: line.slice(9), branch: null, head: null, detached: false, locked: false }; items.push(item); }
    else if (!item) continue;
    else if (line.startsWith('HEAD ')) item.head = line.slice(5);
    else if (line.startsWith('branch ')) item.branch = line.slice(7).replace(/^refs\/heads\//u, '');
    else if (line === 'detached') item.detached = true;
    else if (line.startsWith('locked')) item.locked = true;
    else if (line.startsWith('prunable')) item.prunable = true;
  }
  return items;
}

async function defaultBranch(tools, repo) {
  try { return (await tools.git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim(); }
  catch { for (const name of ['origin/main', 'origin/master']) { try { await tools.git(repo, ['rev-parse', '--verify', '--quiet', name]); return name; } catch { /* next */ } } return null; }
}

async function pullRequests(tools, repo) {
  try {
    const rows = JSON.parse(await tools.gh(repo, ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName,state,number']));
    const byBranch = new Map();
    for (const row of rows) (byBranch.get(row.headRefName) ?? byBranch.set(row.headRefName, []).get(row.headRefName)).push(row);
    return byBranch;
  } catch { return null; }
}

// A GateReeve run is complete when any workflow database in the worktree
// records the completion milestone.
async function completedRun(path) {
  const issues = join(path, 'docs', 'issues');
  let features; try { features = await readdir(issues); } catch { return false; }
  for (const feature of features) {
    const dir = join(issues, feature, '.gatereeve-current');
    let names; try { names = await readdir(dir); } catch { continue; }
    for (const name of names.filter(item => /^workflow\.sqlite\.current-\d+$/u.test(item))) {
      try {
        const db = new DatabaseSync(join(dir, name), { readOnly: true });
        try {
          for (const row of db.prepare("SELECT body FROM events WHERE body LIKE '%MILESTONE%'").all()) {
            const event = JSON.parse(row.body);
            if (event.type === 'MILESTONE' && event.payload?.name === 'completion') return true;
          }
        } finally { db.close(); }
      } catch { /* unreadable: not evidence of completion */ }
    }
  }
  return false;
}

async function newestChange(tools, path) {
  let newest = 0;
  try { newest = Number((await tools.git(path, ['log', '-1', '--format=%ct'])).trim()) * 1000 || 0; } catch { /* no commits */ }
  return newest;
}

async function newestFile(dir, skip) {
  let newest = 0;
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop();
    let entries; try { entries = await readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (path === skip) continue;
      if (entry.isDirectory()) pending.push(path);
      else { const info = await lstat(path).catch(() => null); if (info) newest = Math.max(newest, info.mtimeMs); }
    }
  }
  return newest;
}

// D31: workflow state is listed unless a harvest marker is newer than every
// other file in it.
export async function harvested(stateDir) {
  try {
    const marker = join(stateDir, 'harvested.json');
    const at = Date.parse(JSON.parse(await readFile(marker, 'utf8')).harvestedAt);
    return Number.isFinite(at) && at >= await newestFile(stateDir, marker);
  } catch { return false; }
}

async function containsState(dir) {
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop();
    let entries; try { entries = await readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) if (entry.isDirectory()) { if (entry.name === '.gatereeve-current') return true; pending.push(join(current, entry.name)); }
  }
  return false;
}

async function regenerableSet(tools, path) {
  let extra = [];
  try { extra = (await tools.git(path, ['config', '--get-all', 'gatereeve.sweepRegenerable'])).split('\n').map(item => item.trim()).filter(Boolean); } catch { /* none */ }
  return new Set([...REGENERABLE, ...extra.filter(name => !name.includes('/'))]);
}

// The D17 list: everything in the worktree that might matter, by name.
export async function mattersList(tools, worktree) {
  const items = [];
  const regenerable = await regenerableSet(tools, worktree.path);
  const status = (await tools.git(worktree.path, ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'])).split('\0').filter(Boolean);
  // git collapses a wholly untracked folder to one entry; expand any that hold
  // workflow state so the state is judged by its harvest marker (D31).
  const records = [];
  for (const record of status) {
    const path = record.slice(3);
    if (record.startsWith('??') && path.endsWith('/') && await containsState(join(worktree.path, path))) {
      records.push(...(await tools.git(worktree.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path])).split('\0').filter(Boolean));
    } else records.push(record);
  }
  const states = new Set();
  for (const record of records) {
    const code = record.slice(0, 2), path = record.slice(3);
    if (/^R|^C/u.test(code)) continue;
    const parts = path.replace(/\/$/u, '').split('/');
    const stateAt = parts.indexOf('.gatereeve-current');
    if (stateAt >= 0) { states.add(join(worktree.path, ...parts.slice(0, stateAt + 1))); continue; }
    if (code === '!!') { if (!regenerable.has(parts[parts.length - 1])) items.push({ kind: 'ignored', path }); }
    else if (code === '??') { if (!items.some(item => item.kind === 'untracked' && path.startsWith(item.path) && item.path.endsWith('/'))) items.push({ kind: 'untracked', path }); }
    else items.push({ kind: 'modified', path });
  }
  for (const state of [...states].sort()) if (!await harvested(state)) items.push({ kind: 'unharvested-workflow-state', path: relative(worktree.path, state) + '/' });
  if (worktree.head) {
    const unpushed = (await tools.git(worktree.path, ['rev-list', '--count', worktree.head, '--not', '--remotes'])).trim();
    if (Number(unpushed) > 0) items.push({ kind: 'commits-not-on-remote', count: Number(unpushed) });
  }
  if (worktree.branch) {
    const upstream = await tools.git(worktree.path, ['rev-parse', '--abbrev-ref', `${worktree.branch}@{upstream}`]).then(() => true, () => false);
    const remote = upstream || (await tools.git(worktree.path, ['branch', '-r', '--list', `*/${worktree.branch}`])).trim().length > 0;
    if (!remote) items.push({ kind: 'branch-without-remote', branch: worktree.branch });
  }
  return items;
}

export async function planSweep({ repositories, root = join(homedir(), 'Code'), cwd = process.cwd(), now = Date.now(), tools = systemTools } = {}) {
  const repos = repositories?.length ? repositories.map(item => resolve(item)) : await discoverRepositories(root);
  const here = resolve(cwd);
  const results = [];
  const seen = new Set();
  for (const repo of repos) {
    let worktrees;
    try { worktrees = parseWorktrees(await tools.git(repo, ['worktree', 'list', '--porcelain'])); }
    catch (error) { results.push({ repository: repo, path: repo, status: 'skipped', reason: `git worktree list failed: ${error.message.split('\n')[0]}` }); continue; }
    const base = await defaultBranch(tools, repo);
    const prs = await pullRequests(tools, repo);
    worktrees.forEach((worktree, index) => { worktree.main = index === 0; });
    for (const worktree of worktrees) {
      if (seen.has(worktree.path)) continue;
      seen.add(worktree.path);
      const entry = { repository: repo, path: worktree.path, branch: worktree.branch, head: worktree.head };
      results.push(entry);
      const skip = reason => Object.assign(entry, { status: 'skipped', reason });
      try {
        if (worktree.main) { skip('main checkout'); continue; }
        if (inside(here, resolve(worktree.path))) { skip('contains the current working directory'); continue; }
        if (worktree.prunable || !(await stat(worktree.path).catch(() => null))) { skip('missing on disk (git worktree prune clears it)'); continue; }
        if (worktree.locked) { skip('locked'); continue; }
        const branchPrs = worktree.branch ? prs?.get(worktree.branch) ?? [] : [];
        if (worktree.branch && prs === null) { skip('pr-state-unknown'); continue; }
        if (branchPrs.some(pr => pr.state === 'OPEN')) { skip('open pull request'); continue; }
        const matters = await mattersList(tools, worktree);
        if (worktree.branch && DEVELOPMENT.test(worktree.branch) && matters.some(item => item.kind === 'commits-not-on-remote')) { skip('development branch with commits not on the remote'); continue; }
        const reasons = [];
        if (base && worktree.head && await tools.git(repo, ['merge-base', '--is-ancestor', worktree.head, base]).then(() => true, () => false)) reasons.push(`merged into ${base}`);
        if (branchPrs.some(pr => pr.state === 'MERGED')) reasons.push('pull request merged');
        else if (branchPrs.some(pr => pr.state === 'CLOSED')) reasons.push('pull request closed');
        if (await completedRun(worktree.path)) reasons.push('GateReeve run complete');
        const last = await newestChange(tools, worktree.path);
        const stale = !reasons.length && last > 0 && last < now - STALE_DAYS * 86400000 && !matters.some(item => ['modified', 'untracked'].includes(item.kind));
        if (!reasons.length && !stale) { Object.assign(entry, { status: 'active', reason: 'not merged, no merged or closed PR, run not complete' }); continue; }
        Object.assign(entry, { status: stale ? 'stale' : 'candidate', reasons: stale ? [`no commits or changes for ${STALE_DAYS} days`] : reasons, matters });
      } catch (error) { skip(`could not be inspected: ${error.message.split('\n')[0]}`); }
    }
  }
  return { root: repositories?.length ? null : resolve(root), worktrees: results };
}

async function writable(path) {
  const info = await lstat(path).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) return;
  await chmod(path, info.mode | 0o700).catch(() => {});
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) await writable(join(path, entry.name));
}

// Removes one planned worktree after re-planning it, then prunes and deletes
// the local branch only when git confirms it is fully merged.
export async function removeWorktree(entry, { tools = systemTools } = {}) {
  await writable(entry.path);
  await rm(entry.path, { recursive: true, force: true });
  await tools.git(entry.repository, ['worktree', 'prune']);
  let branchDeleted = false;
  // "Fully merged" means merged into the remote default branch, not merely into
  // the branch's own upstream (which `git branch -d` also accepts).
  const base = await defaultBranch(tools, entry.repository);
  if (entry.branch && base && await tools.git(entry.repository, ['merge-base', '--is-ancestor', `refs/heads/${entry.branch}`, base]).then(() => true, () => false)) {
    branchDeleted = await tools.git(entry.repository, ['branch', '-d', entry.branch]).then(() => true, () => false);
  }
  return { path: entry.path, branchDeleted };
}

export async function sweep({ apply = false, yes = false, confirm = null, ...options } = {}) {
  const plan = await planSweep(options);
  const removable = plan.worktrees.filter(item => item.status === 'candidate' || item.status === 'stale');
  if (!apply) return { ...plan, applied: false, removed: [] };
  const removed = [], declined = [], errors = [];
  for (const item of removable) {
    if (yes) { if (item.matters.length) { declined.push({ path: item.path, reason: 'non-interactive mode removes only worktrees with nothing listed' }); continue; } }
    else if (!confirm || !await confirm(item)) { declined.push({ path: item.path, reason: 'not confirmed' }); continue; }
    // Re-check immediately before deleting: state may have changed since the preview.
    const current = (await planSweep({ ...options, repositories: [item.repository] })).worktrees.find(row => row.path === item.path);
    if (!current || !['candidate', 'stale'].includes(current.status) || JSON.stringify(current.matters) !== JSON.stringify(item.matters)) {
      declined.push({ path: item.path, reason: 'changed since the preview' }); continue;
    }
    try { removed.push(await removeWorktree(current, options)); } catch (error) { errors.push({ path: item.path, reason: error.message }); }
  }
  return { ...plan, applied: true, removed, declined, errors };
}

export function describe(item) {
  const lines = [`${item.status}: ${item.path}${item.branch ? ` [${item.branch}]` : ''}${item.reason ? ` — ${item.reason}` : ''}${item.reasons ? ` — ${item.reasons.join(', ')}` : ''}`];
  for (const matter of item.matters ?? []) lines.push(`  ${matter.kind}: ${matter.path ?? matter.branch ?? `${matter.count} commit(s)`}`);
  if (item.matters && !item.matters.length) lines.push('  nothing listed');
  return lines.join('\n');
}
export { basename };
