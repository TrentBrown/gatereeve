import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative, sep, isAbsolute, join } from 'node:path';
import { realpath, lstat } from 'node:fs/promises';
import { CONTRACT, identity, requireThat, text } from './contracts.js';
import { localPath, readSafe } from './store.js';

const exec = promisify(execFile);
export async function git(root, args, options = {}) {
  const { stdout } = await exec('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  return stdout;
}
const DOCUMENTS = new Set(['interview.md', 'design.md', 'spec.md', 'plan.md', 'issues.md', 'tracker.md',
  'scratchpad.md', 'decisions.md', 'completion-report.md', 'events.jsonl', 'model-lock.json', 'workflow-model.lock.json', 'feature.json']);
const REPORTS = new Set(['code-review.md', 'spec-evaluation.md', 'judge.md', 'pattern-review.md', 'verification.md',
  'spec-validation.md', 'planning-verification.md', 'explain-diff.html', 'decision-triage.md']);
function recordLocal(path, featureRelative) {
  if (featureRelative && path.startsWith(`${featureRelative}/`)) return path.slice(featureRelative.length + 1);
  return /^docs\/issues\/[^/]+\/(.+)$/u.exec(path)?.[1] ?? null;
}
function artifactArea(local) {
  return /^(?:pr-\d+|review-[^/]+|advisory|verification|evidence|runtime|learning-events)(?:\/|$)/u.test(local);
}
export function excluded(path, featureRelative, bytes) {
  if (path === '.agentic-workflow.json') return true;
  if (/^CHECKPOINT\.md$/iu.test(path) || /^\.checkpoints\/CHECKPOINT-[^/]+\.md$/iu.test(path)
      || /^\.handoffs\/HANDOFF-[^/]+\.md$/iu.test(path)) return true;
  const local = recordLocal(path, featureRelative);
  if (!local) return false;
  // Reserved records are separate from application inputs. A directory label
  // never exempts executable code or arbitrary configuration from source checks.
  if (local.endsWith('.md') || DOCUMENTS.has(local) || REPORTS.has(local) || local.startsWith('.gatereeve-current/')) return true;
  if (!artifactArea(local)) return false;
  if (REPORTS.has(local.split('/').at(-1))) return true;
  if (/\.(?:md|txt|log|jsonl|png|jpg|jpeg|webp|svg|pdf)$/iu.test(local)) return true;
  if (!local.endsWith('.json') || !bytes) return false;
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return false; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const leaf = local.split('/').at(-1);
  if (value.schemaVersion === 1 && value.kind === 'feature-verification'
      && Object.keys(value).sort().join(',') === 'kind,payload,schemaVersion') return true;
  if (['readiness.json', 'claim.json', 'proceed.json', 'review.json', 'discovery.json'].includes(leaf)
      && /^slice-advisory-(?:readiness|claim|proceed|review)$/u.test(value.kind ?? '') && value.schemaVersion === 1) return true;
  if (leaf === 'judge.json' && value.kind === 'workflow-judge') return true;
  if (leaf === 'judge-view-audit.json' && value.kind === 'review-view-audit') return true;
  if (leaf === 'judge-receipt.json' && value.kind === 'gatereeve-agent-workflow-receipt') return true;
  if (leaf === 'judge-result.json' && ['PASS', 'FAIL'].includes(value.verdict) && Array.isArray(value.criteria)) return true;
  if (['context.json', 'boundary.json'].includes(leaf) && Number.isInteger(value.schemaVersion)
      && value.pullRequest && /^[a-f0-9]{40,64}$/u.test(value.evaluatedSourceSha ?? '')
      && /^[a-f0-9]{40,64}$/u.test(value.mergeBaseSha ?? '')) return true;
  return false;
}
export async function assertRepositoryRoot(repository) {
  const root = await realpath(repository.path);
  const top = await realpath((await git(root, ['rev-parse', '--show-toplevel'])).trim());
  requireThat(root === top, `Configured repository must identify its Git working-tree root: ${repository.alias}`);
  return root;
}
async function tree(store, repository, revision) {
  await assertRepositoryRoot(repository);
  requireThat(/^[a-f0-9]{40,64}$/u.test(revision), 'Source must use a full Git object identity');
  requireThat((await git(repository.path, ['rev-parse', `${revision}^{commit}`])).trim() === revision, 'Pinned source is not a commit');
  const local = relative(await realpath(repository.path), store.home).split(sep).join('/');
  const featureRelative = local.split('/')[0] !== '..' && !isAbsolute(local) ? local : null;
  const entries = (await git(repository.path, ['ls-tree', '--full-tree', '-r', '-z', revision])).split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t');
    const [mode, type, oid] = line.slice(0, tab).split(' ');
    const path = line.slice(tab + 1);
    localPath(path);
    return { mode, type, oid, path };
  });
  for (const entry of entries) requireThat(entry.type === 'blob' && ['100644', '100755', '120000'].includes(entry.mode) || entry.type === 'commit' && entry.mode === '160000', 'Review source contains an unsupported Git entry');
  const links = entries.filter(entry => entry.mode === '160000');
  const blobs = entries.filter(entry => entry.type === 'blob');
  const files = [];
  for (const entry of links) requireThat(!excluded(entry.path, featureRelative), 'Lifecycle records cannot be Git links');
  for (const entry of links) files.push({ path: entry.path, mode: entry.mode, entryKind: 'gitlink', ...await store.put(JSON.stringify({ kind: 'gitlink', commit: entry.oid, coverage: 'Contents are not in this repository snapshot; assess the separately selected repository or report a coverage limitation.' })) });
  if (!blobs.length) return files;
  // One Git process for all blobs. Parse byte lengths, never split binary contents.
  const { spawn } = await import('node:child_process');
  const bytes = await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', repository.path, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let size = 0; let errorText = '';
    child.on('error', reject);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 64 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
    child.stderr.on('data', chunk => { errorText += chunk.toString(); });
    child.on('close', code => code === 0 && size <= 64 * 1024 * 1024
      ? resolve(Buffer.concat(chunks)) : reject(new Error(errorText || 'Source capture exceeded its supported size or failed')));
    child.stdin.on('error', reject);
    child.stdin.end(blobs.map(entry => entry.oid).join('\n') + '\n');
  });
  let offset = 0;
  for (const entry of blobs) {
    const end = bytes.indexOf(10, offset);
    requireThat(end >= offset, 'Incomplete Git blob response');
    const [oid, type, length] = bytes.subarray(offset, end).toString().split(' ');
    const count = Number(length);
    requireThat(oid === entry.oid && type === 'blob' && Number.isSafeInteger(count) && count >= 0
      && end + 1 + count < bytes.length && bytes[end + 1 + count] === 10, 'Invalid Git blob response');
    const blob = bytes.subarray(end + 1, end + 1 + count);
    const history = excluded(entry.path, featureRelative, blob);
    requireThat(!history || entry.mode === '100644', 'Lifecycle records must be regular non-executable files');
    if (!history) files.push({ path: entry.path, mode: entry.mode, ...(entry.mode === '120000' ? { entryKind: 'symlink' } : {}), ...await store.put(blob) });
    offset = end + count + 2;
  }
  requireThat(offset === bytes.length, 'Unexpected Git blob data');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function requirements(store, names = ['design.md', 'spec.md'], { capture = true } = {}) {
  const refs = {};
  for (const name of names) refs[name] = await (capture ? store.capture(name) : store.fingerprint(name));
  return refs;
}
export function repositoryIdentity(repository) {
  return { alias: repository.alias, path: repository.path, remote: repository.remote ?? 'origin',
    integrationBranch: repository.integrationBranch ?? null, releaseBranch: repository.releaseBranch ?? repository.integrationBranch ?? null,
    keepPullRequestsClosed: repository.keepPullRequestsClosed ?? false, featureBaseSha: repository.featureBaseSha ?? null };
}
export async function assertClean(repository, store) {
  await assertRepositoryRoot(repository);
  const local = relative(await realpath(repository.path), store.home).split(sep).join('/');
  const home = local.split('/')[0] !== '..' && !isAbsolute(local) ? local : null;
  const entries = (await git(repository.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0');
  const bookkeeping = async path => {
    if (!excluded(path, home) && (!artifactArea(recordLocal(path, home) ?? '') || !path.endsWith('.json'))) return false;
    // Deleted records are classified from HEAD, existing ones through the same
    // no-symlink reader used for retained inputs. Neither path follows links.
    let bytes;
    try {
      bytes = await readSafe(await realpath(repository.path), path);
      if ((await lstat(join(repository.path, path))).mode & 0o111) return false;
    }
    catch (error) {
      if (error.code !== 'ENOENT') return false;
      try {
        const mode = (await git(repository.path, ['ls-tree', 'HEAD', '--', path])).split(' ')[0];
        if (mode !== '100644') return false;
        bytes = Buffer.from(await git(repository.path, ['show', `HEAD:${path}`]));
      } catch { return false; }
    }
    return excluded(path, home, bytes);
  };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]; if (!entry) continue;
    requireThat(await bookkeeping(entry.slice(3)), `Application source is dirty: ${repository.alias}`);
    if (/[RC]/u.test(entry.slice(0, 2))) requireThat(await bookkeeping(entries[++i]), 'Renamed application source is dirty');
  }
}
export async function sourceCandidate(store, context, input, authorization) {
  requireThat(Array.isArray(input.repositories) && input.repositories.length > 0, 'Select at least one repository');
  requireThat(new Set(input.repositories.map(repo => repo.alias)).size === input.repositories.length, 'Duplicate repository selection');
  const repos = [];
  for (const pin of [...input.repositories].sort((a, b) => a.alias.localeCompare(b.alias))) {
    const repository = context.repositories.find(item => item.alias === pin.alias);
    requireThat(repository, `Repository is not configured: ${pin.alias}`);
    if (input.scope === 'FEATURE') requireThat(repository.featureBaseSha && pin.base === repository.featureBaseSha, `Feature review must use configured original featureBaseSha: ${pin.alias}`);
    const base = await tree(store, repository, pin.base);
    const head = await tree(store, repository, pin.head);
    const target = pin.target ?? pin.base;
    const targetFiles = target === pin.base ? base : await tree(store, repository, target);
    // Clean source is required, but local feature evidence is intentionally optional in Git.
    await assertClean(repository, store);
    requireThat((await git(repository.path, ['rev-parse', 'HEAD'])).trim() === pin.head, 'Working repository differs from selected source');
    repos.push({ identity: repositoryIdentity(repository), alias: pin.alias, base: pin.base, head: pin.head, baseFiles: base, files: head, target, targetFiles });
  }
  const docs = await requirements(store);
  requireThat(['SLICE', 'FEATURE'].includes(input.scope), 'Explicit review scope is required');
  requireThat(Array.isArray(input.criteria) && input.criteria.length > 0 && new Set(input.criteria).size === input.criteria.length, 'Explicit distinct criteria are required');
  const spec = (await store.get(docs['spec.md'])).toString('utf8');
  const rubric = [...spec.matchAll(/^\|\s*(R\d+)\s*\|/gmu)].map(match => match[1]);
  requireThat(input.criteria.every(id => rubric.includes(id)), 'Review criterion is not in approved spec');
  requireThat(input.scope !== 'FEATURE' || input.criteria.length === rubric.length, 'Feature review must cover the entire rubric');
  const value = { contract: CONTRACT, kind: 'candidate', featureId: context.featureId, repositories: repos,
    requirements: docs, authorization, scope: input.scope, criteria: [...input.criteria].sort() };
  return { value, ref: await store.putJson(value) };
}
export function contentIdentity(candidate) {
  return identity({ contract: candidate.contract, featureId: candidate.featureId, scope: candidate.scope, criteria: candidate.criteria,
    requirements: candidate.requirements,
    repositories: [...candidate.repositories].sort((a, b) => a.alias.localeCompare(b.alias)).map(repo => ({ identity: repo.identity, alias: repo.alias, baseFiles: repo.baseFiles, files: repo.files, targetFiles: repo.targetFiles })) });
}
// Retained candidates must satisfy today's source-isolation policy too. This
// path-only guard also protects history export without reinterpreting its proof.
export function assertSourceIsolation(candidate, featureHome) {
  for (const repo of candidate.repositories) {
    const local = relative(repo.identity.path, featureHome).split(sep).join('/');
    const featureRelative = local.split('/')[0] !== '..' && !isAbsolute(local) ? local : null;
    for (const file of [...repo.baseFiles, ...repo.files, ...repo.targetFiles]) {
      requireThat(!excluded(file.path, featureRelative), 'Retained source includes reserved workflow history; prepare fresh isolated proof');
    }
  }
}
export async function checkCandidate(store, context, ref, { live = true } = {}) {
  const candidate = await store.json(ref);
  requireThat(candidate.contract === CONTRACT && candidate.kind === 'candidate' && candidate.featureId === context.featureId, 'Candidate belongs to another contract or feature');
  assertSourceIsolation(candidate, store.home);
  for (const doc of Object.values(candidate.requirements)) {
    if (live) await store.currentBytes(doc); else await store.get(doc);
  }
  for (const repo of candidate.repositories) {
    const configured = context.repositories.find(item => item.alias === repo.alias);
    requireThat(configured && identity(repositoryIdentity(configured)) === identity(repo.identity), 'Candidate repository or policy changed');
    await assertRepositoryRoot(configured);
    if (candidate.scope === 'FEATURE') requireThat(configured.featureBaseSha && repo.base === configured.featureBaseSha, `Feature review must use configured original featureBaseSha: ${repo.alias}`);
    for (const file of [...repo.baseFiles, ...repo.files, ...repo.targetFiles]) await store.get(file);
    if (live) {
      const root = context.repositories.find(item => item.alias === repo.alias).path;
      requireThat((await git(root, ['rev-parse', 'HEAD'])).trim() === repo.head, `Source changed: ${repo.alias}`);
      await assertClean(configured, store);
    }
  }
  return candidate;
}
export function executionInput(candidate, gateId, configuration, consumed = []) {
  text(gateId, 'Gate');
  return { contract: CONTRACT, gate: gateId, content: contentIdentity(candidate), configuration, consumed };
}
