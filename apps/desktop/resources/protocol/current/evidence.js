import { planningFacts } from './planning.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative, sep, isAbsolute, join, dirname } from 'node:path';
import { realpath, lstat } from 'node:fs/promises';
import { CONTRACT, identity, requireThat, text } from './contracts.js';
import { readSafe } from './store.js';
import { CLASSIFIER, CLASSIFICATION_LIMIT, sourceGit, treeEntries, withObjects, smallBlob } from './git-source.js';
import { checkPins } from './source-retention.js';

const exec = promisify(execFile);
export async function git(root, args, options = {}) {
  const { gitExecutable = 'git', ...executionOptions } = options;
  const { stdout } = await exec(gitExecutable, ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...executionOptions });
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
  const top = await realpath((await git(root, ['rev-parse', '--show-toplevel'], { gitExecutable: repository.gitExecutable })).trim());
  requireThat(root === top, `Configured repository must identify its Git working-tree root: ${repository.alias}`);
  return root;
}
function featureRelative(store, repository) {
  const local = relative(repository.path, store.home).split(sep).join('/');
  return local.split('/')[0] !== '..' && !isAbsolute(local) ? local : null;
}
async function manifest(store, repository, revision, format, retained = null) {
  const home = featureRelative(store, repository);
  const entries = await treeEntries(repository, revision, format);
  const files = []; const classifications = [];
  const classified = new Map();
  await withObjects(repository, { metadata: true }, async reader => {
    const available = new Map();
    for (const entry of entries) {
      if (excluded(entry.path, home)) {
        requireThat(entry.mode === '100644', 'Lifecycle records must be regular non-executable files');
        continue;
      }
      if (entry.entryKind === 'gitlink') { files.push(entry); continue; }
      if (!available.has(entry.oid)) available.set(entry.oid, await reader.read(entry.oid));
      const info = available.get(entry.oid);
      requireThat(info.type === 'blob', `Source is not a blob: ${entry.path}`);
      if (artifactArea(recordLocal(entry.path, home) ?? '') && entry.path.endsWith('.json')) {
        requireThat(info.size <= CLASSIFICATION_LIMIT, `Ambiguous workflow JSON ${entry.path}: ${info.size} bytes exceeds ${CLASSIFICATION_LIMIT} byte classification limit`);
        let decision;
        if (retained) {
          decision = retained.find(item => item.path === entry.path && item.oid === entry.oid);
          requireThat(decision && decision.policy === CLASSIFIER && typeof decision.excluded === 'boolean', 'Source classification provenance changed');
        } else {
          if (!classified.has(entry.oid)) {
            const bytes = await smallBlob(repository, entry.oid, info.size);
            classified.set(entry.oid, new Map(entries.filter(item => item.oid === entry.oid).map(item => [item.path, excluded(item.path, home, bytes)])));
          }
          decision = { path: entry.path, oid: entry.oid, policy: CLASSIFIER, excluded: classified.get(entry.oid).get(entry.path) };
        }
        classifications.push(decision);
        if (decision.excluded) { requireThat(entry.mode === '100644', 'Lifecycle records must be regular non-executable files'); continue; }
      }
      files.push(entry);
    }
  });
  return { files, classifications };
}
export async function checkSource(store, context, candidate) {
  requireThat(candidate.contract === CONTRACT && candidate.sourceStorage === 'git-manifest', 'Source proof requires the current Git manifest contract');
  for (const repo of candidate.repositories) {
    const configured = context.repositories.find(item => item.alias === repo.alias);
    requireThat(configured, 'Source repository is not configured');
    await assertRepositoryRoot(configured);
  }
  await checkPins(context, candidate.sourceRetention);
  for (const repo of candidate.repositories) {
    const configured = context.repositories.find(item => item.alias === repo.alias);
    requireThat(configured && identity(repositoryIdentity(configured)) === identity(repo.identity), 'Candidate repository or policy changed');
    await assertRepositoryRoot(configured);
    requireThat((await sourceGit(configured, ['rev-parse', '--show-object-format'])).trim() === repo.objectFormat, 'Git object format changed');
    const checked = new Map();
    for (const [endpoint, files] of [['base', repo.baseFiles], ['head', repo.files], ['target', repo.targetFiles]]) {
      requireThat(candidate.sourceRetention.pins.some(pin => pin.alias === repo.alias && pin.endpoint === endpoint && pin.commit === repo[endpoint]), 'Source endpoint is not owned by this candidate');
      const classifications = repo.classifications[endpoint];
      const key = identity({ commit: repo[endpoint], classifications });
      if (!checked.has(key)) checked.set(key, await manifest(store, configured, repo[endpoint], repo.objectFormat, classifications));
      const actual = checked.get(key);
      requireThat(identity(actual.files) === identity(files) && identity(actual.classifications) === identity(classifications), 'Pinned source manifest or classification changed');
    }
  }
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
  const entries = (await git(repository.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { gitExecutable: repository.gitExecutable })).split('\0');
  const bookkeeping = async path => {
    if (!excluded(path, home) && (!artifactArea(recordLocal(path, home) ?? '') || !path.endsWith('.json'))) return false;
    // Deleted records are classified from HEAD, existing ones through the same
    // no-symlink reader used for retained inputs. Neither path follows links.
    let bytes;
    try {
      if (excluded(path, home)) {
        let current = join(repository.path, path);
        const file = await lstat(current);
        if (!file.isFile() || file.isSymbolicLink() || file.mode & 0o111) return false;
        for (current = dirname(current); current !== repository.path; current = dirname(current)) {
          const directory = await lstat(current);
          if (!directory.isDirectory() || directory.isSymbolicLink()) return false;
        }
        return true;
      }
      if ((await lstat(join(repository.path, path))).size > CLASSIFICATION_LIMIT) return false;
      bytes = await readSafe(await realpath(repository.path), path);
      if ((await lstat(join(repository.path, path))).mode & 0o111) return false;
    }
    catch (error) {
      if (error.code !== 'ENOENT') return false;
      try {
        const mode = (await git(repository.path, ['ls-tree', 'HEAD', '--', path], { gitExecutable: repository.gitExecutable })).split(' ')[0];
        if (mode !== '100644') return false;
        if (excluded(path, home)) return true;
        bytes = Buffer.from(await git(repository.path, ['show', `HEAD:${path}`], { gitExecutable: repository.gitExecutable }));
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
export async function sourceCandidate(store, context, input, authorization, sourceRetention) {
  requireThat(Array.isArray(input.repositories) && input.repositories.length > 0, 'Select at least one repository');
  requireThat(new Set(input.repositories.map(repo => repo.alias)).size === input.repositories.length, 'Duplicate repository selection');
  const repos = [];
  for (const pin of [...input.repositories].sort((a, b) => a.alias.localeCompare(b.alias))) {
    const repository = context.repositories.find(item => item.alias === pin.alias);
    requireThat(repository, `Repository is not configured: ${pin.alias}`);
    if (input.scope === 'FEATURE') requireThat(repository.featureBaseSha && pin.base === repository.featureBaseSha, `Feature review must use configured original featureBaseSha: ${pin.alias}`);
    const objectFormat = (await sourceGit(repository, ['rev-parse', '--show-object-format'])).trim();
    const cache = new Map();
    const capture = async commit => { if (!cache.has(commit)) cache.set(commit, await manifest(store, repository, commit, objectFormat)); return cache.get(commit); };
    const base = await capture(pin.base);
    const head = await capture(pin.head);
    const target = pin.target ?? pin.base;
    const targetView = await capture(target);
    // Clean source is required, but local feature evidence is intentionally optional in Git.
    await assertClean(repository, store);
    requireThat((await git(repository.path, ['rev-parse', 'HEAD'], { gitExecutable: repository.gitExecutable })).trim() === pin.head, 'Working repository differs from selected source');
    repos.push({ identity: repositoryIdentity(repository), alias: pin.alias, base: pin.base, head: pin.head, objectFormat, baseFiles: base.files, files: head.files, target, targetFiles: targetView.files, classifications: { base: base.classifications, head: head.classifications, target: targetView.classifications } });
  }
  const docs = await requirements(store);
  requireThat(['SLICE', 'FEATURE'].includes(input.scope), 'Explicit review scope is required');
  requireThat(Array.isArray(input.criteria) && input.criteria.length > 0 && new Set(input.criteria).size === input.criteria.length, 'Explicit distinct criteria are required');
  const spec = (await store.get(docs['spec.md'])).toString('utf8');
  const rubric = planningFacts(spec).criteria.map(item => item.id);
  requireThat(input.criteria.every(id => rubric.includes(id)), 'Review criterion is not in approved spec');
  requireThat(input.scope !== 'FEATURE' || input.criteria.length === rubric.length, 'Feature review must cover the entire rubric');
  const value = { contract: CONTRACT, kind: 'candidate', sourceStorage: 'git-manifest', sourceRetention, featureId: context.featureId, repositories: repos,
    requirements: docs, authorization, scope: input.scope, criteria: [...input.criteria].sort() };
  await checkSource(store, context, value);
  return { value, ref: await store.putJson(value) };
}
export function contentIdentity(candidate) {
  return identity({ contract: candidate.contract, featureId: candidate.featureId, scope: candidate.scope, criteria: candidate.criteria,
    requirements: candidate.requirements,
    repositories: [...candidate.repositories].sort((a, b) => a.alias.localeCompare(b.alias)).map(repo => ({ identity: repo.identity, alias: repo.alias, objectFormat: repo.objectFormat, baseFiles: repo.baseFiles, files: repo.files, targetFiles: repo.targetFiles })) });
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
export async function checkCandidate(store, context, ref, { live = true, memo = new Map() } = {}) {
  const candidate = await store.json(ref);
  requireThat(candidate.contract === CONTRACT && candidate.kind === 'candidate' && candidate.featureId === context.featureId, 'Candidate belongs to another contract or feature');
  assertSourceIsolation(candidate, store.home);
  const sourceKey = `source:${ref.hash}`;
  if (!memo.has(sourceKey)) memo.set(sourceKey, checkSource(store, context, candidate));
  await memo.get(sourceKey);
  for (const doc of Object.values(candidate.requirements)) {
    if (live) await store.currentBytes(doc); else await store.get(doc);
  }
  for (const repo of candidate.repositories) {
    const configured = context.repositories.find(item => item.alias === repo.alias);
    requireThat(configured && identity(repositoryIdentity(configured)) === identity(repo.identity), 'Candidate repository or policy changed');
    await assertRepositoryRoot(configured);
    if (candidate.scope === 'FEATURE') requireThat(configured.featureBaseSha && repo.base === configured.featureBaseSha, `Feature review must use configured original featureBaseSha: ${repo.alias}`);

    if (live) {
      const root = context.repositories.find(item => item.alias === repo.alias).path;
      requireThat((await git(root, ['rev-parse', 'HEAD'], { gitExecutable: configured.gitExecutable })).trim() === repo.head, `Source changed: ${repo.alias}`);
      await assertClean(configured, store);
    }
  }
  return candidate;
}
export function executionInput(candidate, gateId, configuration, consumed = []) {
  text(gateId, 'Gate');
  return { contract: CONTRACT, gate: gateId, content: contentIdentity(candidate), configuration, consumed };
}
