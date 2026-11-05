import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { activity, processIdentity, privateStorageDirectory as directory,
  readStorageJson as json, withStorageLock as lock } from './scratch.js';

const execute = promisify(execFile);
const KIND = 'gatereeve-installers/1';
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const uid = () => process.getuid?.();
const absent = error => error.code === 'ENOENT';
const identity = s => ({ dev: s.dev, ino: s.ino });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const stamp = s => ({ ...identity(s), bytes: s.size, mtimeMs: s.mtimeMs });
const equalFile = (a, b) => same(a, b) && a.bytes === b.bytes && a.mtimeMs === b.mtimeMs;
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const validHold = h => h === null || (h && timestamp(h.until) && typeof h.reason === 'string' && h.reason.trim() && h.reason.length <= 1000);
const validProcess = p => Number.isSafeInteger(p?.pid) && p.pid > 0 && typeof p.startedAt === 'string' && p.startedAt.length > 0;

export const installerRoot = () => process.env.GATEREEVE_INSTALLER_ROOT || join(homedir(), '.local', 'share', 'gatereeve', 'installers');

async function save(path, value) {
  const pending = join(dirname(path), `.pending-${randomUUID()}.json`);
  const file = await open(pending, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); }
  finally { await file.close(); }
  await rename(pending, path);
  // A visible rename alone is not a durable pre-deletion receipt. Persist the
  // directory entry too; an unsupported/failed sync must prevent deletion.
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function rootInfo(root, create = false) {
  assert(uid() !== undefined, 'Installer storage requires a POSIX host');
  root = resolve(root);
  if (create) await mkdir(dirname(root), { recursive: true });
  root = join(await realpath(dirname(root)), basename(root));
  if (create) {
    try {
      await mkdir(root, { mode: 0o700 });
      await mkdir(join(root, 'entries'), { mode: 0o700 });
      await save(join(root, 'owner.json'), { kind: KIND, uid: uid(), ...identity(await directory(root)) });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const stat = await directory(root), owner = await json(join(root, 'owner.json'));
      assert(owner.kind === KIND && owner.uid === uid() && same(owner, stat), 'Installer root ownership changed');
      const entries = await directory(join(root, 'entries'));
      return { root, ...identity(stat), entries: identity(entries) };
    } catch (error) {
      if (!create || !absent(error) || attempt >= 20) throw error;
      await delay(25); // Another creator may be publishing ownership; never adopt it.
    }
  }
}

async function currentRoot(info) {
  const current = await rootInfo(info.root);
  assert(same(info, current) && same(info.entries, current.entries), 'Installer storage directories changed');
}

async function load(info, id) {
  assert(ID.test(id), 'Invalid installer ID');
  await currentRoot(info);
  const path = join(info.root, 'entries', id), stat = await directory(path);
  const record = await json(join(path, 'owner.json'));
  assert(record.kind === KIND && record.id === id && record.uid === uid() && same(record, stat)
    && typeof record.version === 'string' && record.version.length > 0 && record.version.length <= 100
    && timestamp(record.createdAt) && ['active', 'succeeded', 'failed'].includes(record.state)
    && validProcess(record.producer) && validHold(record.hold) && Array.isArray(record.consumers)
    && record.consumers.every(c => ID.test(c.id) && validProcess(c))
    && (record.state !== 'succeeded' || (timestamp(record.succeededAt) && Number.isSafeInteger(record.successSequence) && record.successSequence > 0 && /^[a-f0-9]{64}$/u.test(record.file?.sha256)
      && Number.isSafeInteger(record.file.bytes) && record.file.bytes > 0 && Number.isFinite(record.file.mtimeMs)
      && Number.isSafeInteger(record.file.dev) && Number.isSafeInteger(record.file.ino))), 'Invalid installer ownership record');
  return { id, path, record, identity: identity(stat), dmgPath: join(path, 'installer.dmg') };
}

async function fileInfo(path, hash = true) {
  const stat = await lstat(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === uid(), 'Installer is not an owned regular file');
  const value = { ...stamp(stat), allocatedBytes: stat.blocks * 512 };
  if (hash) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    assert(equalFile(value, stamp(await lstat(path))), 'Installer changed during hashing');
    value.sha256 = digest.digest('hex');
  }
  return value;
}

async function installerActivity(path) {
  // hdiutil records the backing file even when its volume is mounted elsewhere.
  if (process.platform === 'darwin') {
    const { stdout, stderr } = await execute('hdiutil', ['info'], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    assert(!stderr.trim() && /framework\s*:/u.test(stdout), 'Disk image inventory unavailable');
    for (const line of stdout.split('\n')) {
      const image = /^image-path\s*:\s*(.+)$/u.exec(line)?.[1];
      if (image && (image === join(path, 'installer.dmg') || image.startsWith(`${path}/`))) return 'mounted';
    }
  }
  return activity(path);
}

async function inventory(info, { quick = false, probe = processIdentity, inspectActivity = installerActivity, now = Date.now() } = {}) {
  const entries = [], errors = [];
  for (const id of (await readdir(join(info.root, 'entries'))).sort()) {
    const entry = { id, status: 'uncertain', bytes: null };
    try {
      const item = await load(info, id), r = item.record;
      Object.assign(entry, { path: item.dmgPath, version: r.version, state: r.state, hold: r.hold, succeededAt: r.succeededAt, successSequence: r.successSequence, identity: item.identity });
      const f = await fileInfo(item.dmgPath, !quick).catch(error => { if (absent(error)) return null; throw error; });
      if (!f) { entry.status = r.state === 'active' ? 'pending' : 'absent'; entries.push(entry); continue; }
      entry.bytes = f.allocatedBytes; entry.file = f;
      if (r.state === 'succeeded') assert(equalFile(f, r.file) && (quick || f.sha256 === r.file.sha256), 'Successful installer content changed');
      if (quick) entry.status = r.hold && Date.parse(r.hold.until) > now ? 'held' : 'needs-check';
      else if (r.hold && Date.parse(r.hold.until) > now) entry.status = 'held';
      else if ((r.state === 'active' && await probe(r.producer.pid) === r.producer.startedAt)
        || (await Promise.all(r.consumers.map(async c => await probe(c.pid) === c.startedAt))).some(Boolean)) entry.status = 'active';
      else {
        const observed = await inspectActivity(item.path);
        assert(['inactive', 'active', 'mounted'].includes(observed), 'Unknown installer activity');
        entry.status = observed === 'inactive' ? 'eligible' : observed;
      }
    } catch (error) { entry.status = 'uncertain'; entry.reason = error.message; errors.push({ id, reason: error.message }); }
    entries.push(entry);
  }
  const keeper = entries.filter(e => e.state === 'succeeded' && e.file && e.status !== 'uncertain')
    .sort((a, b) => b.successSequence - a.successSequence)[0];
  if (keeper && ['eligible', 'needs-check'].includes(keeper.status)) keeper.status = 'latest-successful';
  // A corrupt record may describe the keeper or a live consumer. Do not guess.
  if (errors.length) for (const e of entries.filter(e => e.status === 'eligible')) { e.status = 'uncertain'; e.reason = 'Inventory contains unresolved records'; }
  return { root: info.root, quick, entries, keeper: keeper?.id ?? null, errors,
    eligibleBytes: quick ? null : entries.filter(e => e.status === 'eligible').reduce((n, e) => n + e.bytes, 0) };
}

export async function inspectInstallers({ root = installerRoot(), ...options } = {}) {
  try { return await inventory(await rootInfo(root), options); }
  catch (error) {
    if (absent(error) && !await lstat(root).catch(() => null)) return { root: resolve(root), quick: !!options.quick, entries: [], errors: [], eligibleBytes: 0 };
    return { root: resolve(root), entries: [], errors: [], eligibleBytes: null, error: error.message };
  }
}

export async function cleanupInstallers({ root = installerRoot(), apply = false, ...options } = {}) {
  const preview = await inspectInstallers({ root, ...options, quick: false });
  const result = { ...preview, applied: false, removed: [], reclaimedBytes: 0 };
  if (!apply || preview.error || preview.errors.length || !preview.entries.some(e => e.status === 'eligible')) return result;
  const info = await rootInfo(root);
  return lock(info.root, async () => {
    result.applied = true;
    for (const old of preview.entries.filter(e => e.status === 'eligible')) {
      try {
        const latest = await inventory(info, { ...options, quick: false });
        assert(!latest.errors.length && latest.keeper === preview.keeper, 'Installer keeper or inventory changed; preview again');
        const target = latest.entries.find(e => e.id === old.id);
        assert(target?.status === 'eligible' && same(target.identity, old.identity)
          && equalFile(target.file, old.file) && target.file.sha256 === old.file.sha256, 'Installer eligibility or identity changed');
        const item = await load(info, old.id);
        await save(join(item.path, 'deletion.json'), { kind: KIND, id: old.id, status: 'prepared', file: target.file, at: new Date().toISOString() });
        await currentRoot(info);
        const final = await fileInfo(item.dmgPath);
        assert(equalFile(target.file, final) && target.file.sha256 === final.sha256, 'Installer changed before deletion');
        await unlink(item.dmgPath); // Never remove the directory, app bundles or evidence.
        result.removed.push({ id: old.id, path: item.dmgPath, bytes: target.bytes });
        result.reclaimedBytes += target.bytes;
        await save(join(item.path, 'deletion.json'), { kind: KIND, id: old.id, status: 'deleted', file: target.file, at: new Date().toISOString() });
      } catch (error) { result.errors.push({ id: old.id, reason: error.message }); break; }
    }
    return result;
  });
}

export async function withInstallerBuild({ root = installerRoot(), version, hold = null, ...cleanupOptions }, produce) {
  assert(typeof version === 'string' && version.length > 0 && version.length <= 100 && validHold(hold), 'Invalid installer version or hold');
  const info = await rootInfo(root, true);
  const entry = await lock(info.root, async () => {
    await currentRoot(info);
    const id = randomUUID(), path = join(info.root, 'entries', id);
    await mkdir(path, { mode: 0o700 });
    const record = { kind: KIND, id, version, uid: uid(), ...identity(await directory(path)), state: 'active',
      createdAt: new Date().toISOString(), producer: { pid: process.pid, startedAt: await processIdentity(process.pid) }, consumers: [], hold };
    assert(validProcess(record.producer), 'Producer process identity unavailable');
    await save(join(path, 'owner.json'), record);
    return { root: info.root, id, path, dmgPath: join(path, 'installer.dmg') };
  });
  let value;
  try {
    value = await produce(entry);
    await lock(info.root, async () => {
      const item = await load(info, entry.id), file = await fileInfo(entry.dmgPath);
      assert(file.bytes > 0, 'Installer is empty');
      const owner = await json(join(info.root, 'owner.json'));
      const successSequence = (owner.successSequence ?? 0) + 1;
      assert(Number.isSafeInteger(successSequence) && successSequence > 0, 'Invalid installer success sequence');
      await save(join(info.root, 'owner.json'), { ...owner, successSequence });
      await save(join(entry.path, 'checksum.json'), { kind: KIND, id: entry.id, version, file });
      await save(join(entry.path, 'owner.json'), { ...item.record, state: 'succeeded', successSequence, succeededAt: new Date().toISOString(), file });
    });
  } catch (error) {
    try {
      await lock(info.root, async () => { const item = await load(info, entry.id); await save(join(entry.path, 'owner.json'), { ...item.record, state: 'failed' }); });
    } catch (recordError) {
      throw new AggregateError([error, recordError], `${error.message}; installer failure recording: ${recordError.message}`);
    }
    throw error;
  }
  // A cleanup issue must not mislabel a successfully produced installer as failed.
  let cleanup;
  try { cleanup = await cleanupInstallers({ ...cleanupOptions, root: info.root, apply: true }); }
  catch (error) { cleanup = { error: error.message, removed: [] }; }
  return { ...entry, value, cleanup };
}

export async function addInstaller({ path, version, ...options }) {
  assert(typeof path === 'string' && path.toLowerCase().endsWith('.dmg'), 'An explicit DMG file is required');
  const before = await fileInfo(resolve(path));
  return withInstallerBuild({ ...options, version }, async entry => {
    await copyFile(resolve(path), entry.dmgPath, constants.COPYFILE_EXCL);
    const copied = await fileInfo(entry.dmgPath), after = await fileInfo(resolve(path));
    assert(equalFile(before, after) && copied.sha256 === before.sha256, 'Imported installer changed');
    return { sourcePath: resolve(path), sha256: copied.sha256 };
  });
}

export async function setInstallerHold({ root = installerRoot(), id, until = null, reason = '' }) {
  const hold = until === null ? null : { until, reason };
  assert(validHold(hold) && (hold === null || Date.parse(until) > Date.now()), 'Hold needs a future expiry and a reason');
  const info = await rootInfo(root);
  return lock(info.root, async () => { const item = await load(info, id); await save(join(item.path, 'owner.json'), { ...item.record, hold }); return { id, hold }; });
}

export async function withInstallerLease({ root = installerRoot(), id }, consume) {
  const info = await rootInfo(root), lease = { id: randomUUID(), pid: process.pid, startedAt: await processIdentity(process.pid) };
  assert(validProcess(lease), 'Consumer process identity unavailable');
  const path = await lock(info.root, async () => {
    const item = await load(info, id);
    await fileInfo(item.dmgPath);
    await save(join(item.path, 'owner.json'), { ...item.record, consumers: [...item.record.consumers, lease] });
    return item.dmgPath;
  });
  try { return await consume(path); }
  finally { await lock(info.root, async () => { const item = await load(info, id); await save(join(item.path, 'owner.json'), { ...item.record, consumers: item.record.consumers.filter(c => c.id !== lease.id) }); }); }
}

export async function withInstallerFile({ path, root = installerRoot() }, consume) {
  path = resolve(path); root = resolve(root);
  // Match the same parent canonicalization used at registration. A /tmp-style
  // alias must not turn a managed input into an unleased external file.
  const canonicalRoot = join(await realpath(dirname(root)).catch(error => {
    if (absent(error)) return dirname(root);
    throw error;
  }), basename(root));
  const canonicalPath = await realpath(path).catch(error => { if (absent(error)) return path; throw error; });
  const selected = path.startsWith(`${root}/`) ? path : canonicalPath;
  const selectedRoot = path.startsWith(`${root}/`) ? root : canonicalRoot;
  if (!selected.startsWith(`${selectedRoot}/`)) return consume(path);
  const id = basename(dirname(selected));
  assert(ID.test(id) && selected === join(selectedRoot, 'entries', id, 'installer.dmg'), 'Unexpected managed installer path');
  return withInstallerLease({ root: canonicalRoot, id }, consume);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert(process.argv[2] === 'inspect' && process.argv[3] === '--quick' && process.argv.length === 4,
    'Usage: installers.js inspect --quick');
  console.log(JSON.stringify(await inspectInstallers({ quick: true })));
}
