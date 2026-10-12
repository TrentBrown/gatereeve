import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { sha256Digest } from './agent-workflow.js';
import { ContractError } from './errors.js';

const exec = promisify(execFile);
const SHA = /^[0-9a-f]{40,64}$/u;
const CHUNK_BYTES = 64 * 1024;
const ROOT = '.gatereeve-agent-evidence';
const POLICY = Object.freeze({ kind: 'compact-review-v1', history: 'exclude' });
const EMPTY_BLOBS = new Set(['sha1', 'sha256'].map((algorithm) =>
  createHash(algorithm).update('blob 0\0').digest('hex')));
const JOURNALS = new Set([
  'events.jsonl', 'workflow-model.lock.json', 'interview.md', 'plan.md',
  'decisions.md', 'scratchpad.md', 'tracker.md', 'issues.md',
  'spec-validation.md', 'planning-verification.md', 'completion-report.md',
  'spec-evaluation.md', 'judge.md', 'judge.json', 'code-review.md',
  'pattern-review.md', 'explain-diff.html', 'boundary.json',
]);
const RECORD_EXTENSION = /\.(?:md|json|jsonl|yaml|yml|html|txt|log|png|jpg|jpeg|webp|svg|pdf)$/iu;
const SOURCE_EXTENSION = /\.(?:js|mjs|cjs|ts|tsx|jsx|py|sh|bash|zsh|rb|go|rs|c|h|cc|cpp|hpp|java|kt|swift|cs|php|vue|svelte|astro|css|scss|sass|less|sql|graphql|gql|toml|ini|cfg|yaml|yml)$/iu;

function pathOf(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/')
    || value.includes('\\') || value.split('/').some((p) => !p || p === '.' || p === '..')) {
    throw new ContractError('Unsafe review input path');
  }
  return value;
}

function historyPath(path) {
  const match = /^docs\/issues\/[^/]+\/(.+)$/u.exec(path);
  if (!match) return false;
  const rest = match[1];
  if (JOURNALS.has(rest)) return true;
  // Legacy features sometimes stored reports beside the approved documents
  // instead of inside a PR packet. Their report names still denote history.
  if (!rest.includes('/') && /(?:^|[-_])(?:review|verification|acceptance|checkpoint|judge|spec-validation|completion-report|decision-triage)(?:[-_.]|$)/iu.test(rest)
    && /\.(?:md|json|jsonl|html|txt|log)$/iu.test(rest)) return true;
  const strict = /^(?:pr-\d+|review-[^/]+|advisory|runtime|learning-events)(?:\/|$)/u.test(rest);
  const evidence = /^[^/]*(?:verification|evidence|remediation|captures|screenshots)(?:\/|$)/u.test(rest);
  if (!strict && evidence && SOURCE_EXTENSION.test(rest)) return false;
  if (strict || evidence) {
    if (!RECORD_EXTENSION.test(rest)) {
      throw new ContractError(`Unclassified file in review-history location: ${path}`);
    }
    return true;
  }
  return false;
}

async function git(repositoryRoot, args) {
  const { stdout } = await exec('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
  });
  return stdout;
}

async function tree(repositoryRoot, sha) {
  const output = await git(repositoryRoot, ['ls-tree', '-rz', '--full-tree', sha]);
  return output.split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, oid] = line.slice(0, tab).split(' ');
    if (type !== 'blob') throw new ContractError('Review snapshots cannot inspect embedded repositories');
    return { path: pathOf(line.slice(tab + 1)), mode, oid };
  });
}

async function assertView(repositoryRoot, entries, excludedOids) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const excluded = new Set(entries.filter((entry) => historyPath(entry.path)).map((entry) => entry.path));
  for (const entry of entries) {
    if (entry.path === ROOT || entry.path.startsWith(`${ROOT}/`)) {
      throw new ContractError('Source occupies reserved review evidence path');
    }
    if (excluded.has(entry.path)) continue;
    if (excludedOids.has(entry.oid) && !EMPTY_BLOBS.has(entry.oid)) {
      throw new ContractError(`Review history is aliased into source: ${entry.path}`);
    }
    let current = entry;
    const seen = new Set();
    while (current?.mode === '120000') {
      if (seen.has(current.path)) throw new ContractError(`Cyclic review symlink: ${entry.path}`);
      seen.add(current.path);
      const target = await git(repositoryRoot, ['cat-file', 'blob', current.oid]);
      const destination = posix.normalize(posix.join(posix.dirname(current.path), target));
      if (target.startsWith('/') || target.includes('\\') || destination.split('/')[0] === '..'
        || excluded.has(destination)) {
        throw new ContractError(`Review symlink escapes allowed view: ${entry.path}`);
      }
      current = byPath.get(destination);
    }
  }
  return excluded;
}

async function hashFile(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { hash: `sha256:${hash.digest('hex')}`, bytes };
}

// Git output goes directly to disk. No aggregate patch or binary blob passes
// through execFile's buffer or the agent's JSON input.
async function spool(repositoryRoot, args, path) {
  const file = await open(path, 'wx', 0o600);
  try {
    await new Promise((done, fail) => {
      const child = spawn('git', ['-C', repositoryRoot, ...args], {
        stdio: ['ignore', file.fd, 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
      child.on('error', fail);
      child.on('close', (code) => code === 0 ? done() : fail(new ContractError(stderr || 'Git review export failed')));
    });
  } finally { await file.close(); }
  return hashFile(path);
}

async function referenceFile(sourcePath, path) {
  return { kind: 'snapshot-file', path, ...await hashFile(sourcePath) };
}

async function splitPatch(sourcePath, label, scratch, evidenceFiles) {
  const digest = await hashFile(sourcePath);
  const chunks = [];
  let pending = Buffer.alloc(0);
  let offset = 0;
  async function save(content) {
    const name = `${label}-${chunks.length}.patch`;
    const source = join(scratch, name);
    const path = `${ROOT}/patches/${name}`;
    await writeFile(source, content, { flag: 'wx', mode: 0o600 });
    const reference = await referenceFile(source, path);
    evidenceFiles[path] = { sourcePath: source, hash: reference.hash, bytes: reference.bytes };
    chunks.push({ ...reference, offset });
    offset += content.length;
  }
  for await (const block of createReadStream(sourcePath, { highWaterMark: CHUNK_BYTES })) {
    pending = Buffer.concat([pending, block]);
    while (pending.length > CHUNK_BYTES) {
      let end = CHUNK_BYTES;
      // Keep UTF-8 codepoints intact; concatenating chunks still reproduces
      // the exact bytes emitted by Git, including long lines.
      while (end > 0 && (pending[end] & 0xc0) === 0x80) end -= 1;
      if (end === 0) end = CHUNK_BYTES;
      await save(pending.subarray(0, end));
      pending = pending.subarray(end);
    }
  }
  if (pending.length || chunks.length === 0) await save(pending);
  const path = `${ROOT}/patches/${label}.json`;
  const content = `${JSON.stringify({ schemaVersion: 1, kind: 'patch-index', ...digest, chunks })}\n`;
  evidenceFiles[path] = content;
  return { kind: 'snapshot-file', format: 'patch-index-v1', path,
    hash: sha256Digest(content), bytes: Buffer.byteLength(content), materialHash: digest.hash,
    materialBytes: digest.bytes };
}

async function changes(repositoryRoot, baseSha, headSha, excluded) {
  const tokens = (await git(repositoryRoot, ['diff', '--raw', '-z', '--full-index',
    '--abbrev=64', '--find-renames', '--no-ext-diff', '--no-textconv', `${baseSha}..${headSha}`])).split('\0');
  const stats = (await git(repositoryRoot, ['diff', '--numstat', '-z', '--find-renames',
    '--no-ext-diff', '--no-textconv', `${baseSha}..${headSha}`])).split('\0');
  const binary = new Set();
  for (let i = 0; i < stats.length && stats[i]; i += 1) {
    const firstTab = stats[i].indexOf('\t');
    const secondTab = stats[i].indexOf('\t', firstTab + 1);
    const added = stats[i].slice(0, firstTab);
    const removed = stats[i].slice(firstTab + 1, secondTab);
    const name = stats[i].slice(secondTab + 1);
    const oldPath = name || stats[++i];
    const newPath = name || stats[++i];
    if (added === '-' && removed === '-') binary.add(newPath || oldPath);
  }
  const result = [];
  for (let i = 0; i < tokens.length && tokens[i]; i += 1) {
    const [oldMode, newMode, oldOid, newOid, status] = tokens[i].slice(1).split(' ');
    const first = pathOf(tokens[++i]);
    const second = /^[RC]/u.test(status) ? pathOf(tokens[++i]) : first;
    const oldPath = status[0] === 'A' ? null : first;
    const newPath = status[0] === 'D' ? null : second;
    if ((oldPath && excluded.has(oldPath)) || (newPath && excluded.has(newPath))) {
      if (oldPath && newPath && excluded.has(oldPath) !== excluded.has(newPath)) {
        throw new ContractError('Rename crosses review-history boundary');
      }
      continue;
    }
    result.push({ status, oldPath, newPath, oldMode, newMode,
      oldOid: /^0+$/u.test(oldOid) ? null : oldOid,
      newOid: /^0+$/u.test(newOid) ? null : newOid,
      binary: binary.has(second) });
  }
  return result;
}

export async function buildCompactReviewInput({
  repositoryRoot, baseSha, headSha, scope, sliceBaseSha = null, featureHome,
  criteria = null,
}) {
  const root = resolve(repositoryRoot);
  if (![baseSha, headSha, ...(sliceBaseSha ? [sliceBaseSha] : [])].every((sha) => SHA.test(sha))) {
    throw new ContractError('Compact review requires full pinned Git identities');
  }
  if (!['SLICE', 'FEATURE'].includes(scope) || (scope === 'FEATURE' && !sliceBaseSha)) {
    throw new ContractError('Compact review scope or final slice base is unavailable');
  }
  const home = relative(root, resolve(featureHome ?? '')).split(sep).join('/');
  pathOf(home);
  if (!/^docs\/issues\/[^/]+$/u.test(home)) throw new ContractError('Compact review requires a canonical feature home');
  for (const sha of new Set([baseSha, headSha, sliceBaseSha ?? baseSha])) {
    if ((await git(root, ['rev-parse', `${sha}^{commit}`])).trim() !== sha) {
      throw new ContractError('Compact review commit identity drifted');
    }
  }
  const [before, after, sliceBefore] = await Promise.all([
    tree(root, baseSha), tree(root, headSha), tree(root, sliceBaseSha ?? baseSha),
  ]);
  const excludedOids = new Set([...before, ...after, ...sliceBefore]
    .filter((entry) => historyPath(entry.path)).map((entry) => entry.oid));
  const excluded = new Set();
  for (const entries of [before, after, sliceBefore]) {
    for (const path of await assertView(root, entries, excludedOids)) excluded.add(path);
  }
  const documents = {};
  let rubric = [];
  for (const name of ['spec.md', 'design.md']) {
    const path = `${home}/${name}`;
    const entry = after.find((item) => item.path === path);
    if (!entry || entry.mode === '120000') throw new ContractError(`Approved requirement reconciliation required: ${name}`);
    const content = await git(root, ['cat-file', 'blob', entry.oid]);
    if (!content.trim() || (name === 'design.md' && !/\*\*Status:\*\*\s*approved\b/iu.test(content))) {
      throw new ContractError(`Approved requirement reconciliation required: ${name}`);
    }
    documents[name] = { kind: 'snapshot-file', path, hash: sha256Digest(content), bytes: Buffer.byteLength(content) };
    if (name === 'spec.md') rubric = [...content.matchAll(/^\|\s*(R\d+)\s*\|/gmu)].map((match) => match[1]);
  }
  if (!rubric.length || new Set(rubric).size !== rubric.length) {
    throw new ContractError('Approved requirement reconciliation required: rubric IDs');
  }
  const selected = criteria ?? rubric;
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
    || selected.some((id) => !rubric.includes(id))
    || (scope === 'FEATURE' && selected.length !== rubric.length)) {
    throw new ContractError('Review criteria must bind approved scope; whole-feature review requires the full rubric');
  }
  const scratch = await mkdtemp(join(tmpdir(), 'gatereeve-review-input-'));
  try {
    const evidenceFiles = {};
    const inventory = await changes(root, baseSha, headSha, excluded);
    const sliceInventory = sliceBaseSha && sliceBaseSha !== baseSha
      ? await changes(root, sliceBaseSha, headSha, excluded) : inventory;
    const exclusions = [...excluded].sort().map((path) => `:(exclude,literal)${path}`);
    const rangePatch = async (base, label) => {
      const path = join(scratch, `${label}.raw`);
      await spool(root, ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', '--no-color',
        `${base}..${headSha}`, '--', '.', ...exclusions], path);
      return { source: path, ...await hashFile(path) };
    };
    const feature = await rangePatch(baseSha, 'feature');
    const slice = sliceBaseSha && sliceBaseSha !== baseSha ? await rangePatch(sliceBaseSha, 'slice') : feature;
    const patch = await splitPatch(feature.source, 'feature', scratch, evidenceFiles);
    const same = feature.hash === slice.hash && feature.bytes === slice.bytes;
    const slicePatch = same ? patch : await splitPatch(slice.source, 'slice', scratch, evidenceFiles);
    const blobs = new Map();
    for (const item of [...inventory, ...sliceInventory].filter((item) => item.binary)) {
      for (const field of ['oldOid', 'newOid']) {
        const oid = item[field];
        if (!oid || blobs.has(oid)) continue;
        const sourcePath = join(scratch, oid);
        const path = `${ROOT}/blobs/${oid}`;
        await spool(root, ['cat-file', 'blob', oid], sourcePath);
        const ref = await referenceFile(sourcePath, path);
        blobs.set(oid, ref);
        evidenceFiles[path] = { sourcePath, hash: ref.hash, bytes: ref.bytes };
      }
      item.oldContent = item.oldOid ? blobs.get(item.oldOid) : null;
      item.newContent = item.newOid ? blobs.get(item.newOid) : null;
    }
    const view = after.filter((entry) => !excluded.has(entry.path));
    const inputIdentity = sha256Digest({ policy: POLICY, scope, criteria: selected,
      base: before.filter((entry) => !excluded.has(entry.path)), source: view,
      sliceBase: sliceBefore.filter((entry) => !excluded.has(entry.path)) });
    const jsonReference = (label, value) => {
      const path = `${ROOT}/${label}.json`;
      const content = `${JSON.stringify(value)}\n`;
      evidenceFiles[path] = content;
      return { kind: 'snapshot-file', path, hash: sha256Digest(content), bytes: Buffer.byteLength(content) };
    };
    const inventoryReference = jsonReference('inventory', inventory);
    const change = { schemaVersion: 2, scope, criteria: selected, source: { baseSha, headSha, sliceBaseSha: sliceBaseSha ?? baseSha },
      changedFiles: [...new Set(inventory.flatMap((item) => [item.oldPath, item.newPath]).filter(Boolean))].sort(),
      inventory: inventoryReference,
      sliceChangedFiles: [...new Set(sliceInventory.flatMap((item) => [item.oldPath, item.newPath]).filter(Boolean))].sort(),
      sliceInventory: sliceInventory === inventory ? inventoryReference : jsonReference('slice-inventory', sliceInventory),
      patch, slicePatch, slicePatchSameAsFeature: same, documents,
      reviewView: { policy: POLICY, inputIdentity, sourceTree: (await git(root, ['rev-parse', `${headSha}^{tree}`])).trim(),
        filteredTreeDigest: sha256Digest(view) } };
    const audit = { schemaVersion: 1, kind: 'review-view-audit', source: change.source,
      view: change.reviewView, excludedPaths: [...excluded].sort(),
      metrics: { manifestBytes: Buffer.byteLength(JSON.stringify(change)),
        materialBytes: feature.bytes + (same ? 0 : slice.bytes), duplicatePatchBytesAvoided: same ? slice.bytes : 0,
        changedFiles: change.changedFiles.length } };
    return { change, evidenceFiles, excludedPaths: [...excluded], expectedEntries: view, audit,
      cleanup: () => rm(scratch, { recursive: true, force: true }) };
  } catch (error) { await rm(scratch, { recursive: true, force: true }); throw error; }
}
