import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const KIND = 'gatereeve-scratch/1';
const ID = /^[a-z0-9][a-z0-9-]{0,47}-[a-f0-9-]{36}$/u;
const uid = () => process.getuid?.();
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const identity = stat => ({ dev: stat.dev, ino: stat.ino });
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const absent = error => error.code === 'ENOENT';
const contains = (parent, child) => child === parent || child.startsWith(`${parent}${sep}`);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function scratchRoot() { return process.env.GATEREEVE_SCRATCH_ROOT || join(tmpdir(), 'gatereeve'); }

async function directory(path) {
  const stat = await lstat(path);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === uid() && !(stat.mode & 0o077), `Unsafe scratch directory: ${path}`);
  return stat;
}

async function regularJson(path) {
  const stat = await lstat(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === uid() && !(stat.mode & 0o077) && stat.size < 32768, `Unsafe scratch record: ${path}`);
  return json(path);
}

// Resolve the OS temporary parent (on macOS /tmp is a normal symlink), but
// never follow a substituted GateReeve root, run directory or ownership file.
async function rootInfo(root, create = false) {
  assert(uid() !== undefined, 'Managed scratch currently requires a POSIX host');
  root = join(await realpath(dirname(resolve(root))), basename(root));
  if (create) {
    try {
      await mkdir(root, { mode: 0o700 });
      const stat = await directory(root);
      await mkdir(join(root, 'runs'), { mode: 0o700 });
      await mkdir(join(root, 'reports'), { mode: 0o700 });
      const pending = join(root, `.owner-${randomUUID()}.json`);
      await writeFile(pending, JSON.stringify({ kind: KIND, uid: uid(), ...identity(stat) }), { mode: 0o600, flag: 'wx' });
      await rename(pending, join(root, 'owner.json')); // Publish only a complete root.
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const stat = await directory(root), owner = await regularJson(join(root, 'owner.json'));
      assert(owner.kind === KIND && owner.uid === uid() && same(owner, stat), 'Scratch root ownership changed');
      await directory(join(root, 'runs'));
      await directory(join(root, 'reports'));
      return { root, ...identity(stat) };
    } catch (error) {
      // Another creator can be publishing a new root. Do not create missing
      // records in an existing directory or adopt an unregistered directory.
      if (!create || !absent(error) || attempt >= 20) throw error;
      await delay(25);
    }
  }
}

export async function processIdentity(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0, 'Invalid process identity');
  try {
    const { stdout } = await execute('ps', ['-p', String(pid), '-o', 'lstart='], {
      timeout: 5000, env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    });
    return stdout.trim() || null;
  } catch (error) {
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return null;
    throw new Error('Process activity could not be established');
  }
}

async function alive(owner, probe = processIdentity) {
  return (await probe(owner.processId)) === owner.processStartedAt;
}

async function lock(root, callback) {
  const path = join(root, '.maintenance-lock');
  const started = Date.now();
  let observed = null, observedAt = started;
  for (let attempt = 0; ; attempt++) {
    try { await mkdir(path, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Do not steal a lock on PID/age alone. An interrupted maintenance lock
      // needs inspection; otherwise two recoverers could remove each other's lock.
      // Short waits suffice for an unknown/interrupted lock. A verified live
      // maintainer may be removing a large tree; let concurrent producers wait
      // without treating normal cleanup contention as a broken root.
      let current;
      try { current = await directory(path); }
      catch (readError) { if (absent(readError)) continue; throw readError; }
      if (!observed || !same(observed, current)) { observed = current; observedAt = Date.now(); }
      if (Date.now() - observedAt >= 2000) {
        let live = false;
        try { live = await alive(await regularJson(join(path, 'owner.json'))); }
        catch (readError) {
          if (absent(readError)) {
            const latest = await lstat(path).catch(() => null);
            if (!latest || !same(latest, current)) continue;
          }
        }
        assert(live && Date.now() - started < 90000, 'Scratch maintenance is active or interrupted; inspect the maintenance lock before retrying');
      }
      await delay(50 + Math.floor(Math.random() * 25));
    }
  }
  const stat = await directory(path);
  await writeFile(join(path, 'owner.json'), JSON.stringify({ kind: KIND, processId: process.pid, processStartedAt: await processIdentity(process.pid) }), { mode: 0o600, flag: 'wx' });
  try { return await callback(); }
  finally {
    assert(same(stat, await directory(path)), 'Maintenance lock changed');
    await unlink(join(path, 'owner.json')); await rmdir(path);
  }
}

async function saveOwner(path, owner) {
  const pending = join(path, `.owner-${randomUUID()}.json`);
  await writeFile(pending, JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
  await rename(pending, join(path, 'owner.json'));
}

export async function createScratch({ purpose, root = scratchRoot(), keepUntil = null } = {}) {
  assert(typeof purpose === 'string' && purpose.length > 0 && purpose.length <= 200, 'Scratch purpose is required (maximum 200 characters)');
  assert(keepUntil === null || Number.isFinite(Date.parse(keepUntil)), 'Invalid retention expiry');
  // Inherited roots must already be registered by the supervising invocation.
  const info = await rootInfo(root, root !== process.env.GATEREEVE_SCRATCH_ROOT);
  return lock(info.root, async () => {
    const label = purpose.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48) || 'run';
    const id = `${label}-${randomUUID()}`, path = join(info.root, 'runs', id);
    await mkdir(path, { mode: 0o700 });
    const owner = { kind: KIND, id, uid: uid(), ...identity(await directory(path)), purpose,
      createdAt: new Date().toISOString(), processId: process.pid, processStartedAt: await processIdentity(process.pid),
      state: 'active', keepUntil, children: [] };
    await saveOwner(path, owner);
    await writeFile(join(path, '.active'), id, { mode: 0o600, flag: 'wx' });
    return { root: info.root, id, path, owner };
  });
}

async function loadRun(root, id) {
  assert(ID.test(id), 'Invalid scratch run ID');
  const path = join(root, 'runs', id), stat = await directory(path);
  const owner = await regularJson(join(path, 'owner.json'));
  assert(owner.kind === KIND && owner.id === id && owner.uid === uid() && same(owner, stat)
    && typeof owner.purpose === 'string' && Number.isFinite(Date.parse(owner.createdAt))
    && Number.isSafeInteger(owner.processId) && owner.processId > 0 && typeof owner.processStartedAt === 'string'
    && owner.processStartedAt.length > 0 && ['active', 'finished', 'failed'].includes(owner.state)
    && (owner.keepUntil === null || Number.isFinite(Date.parse(owner.keepUntil))) && Array.isArray(owner.children), 'Invalid scratch ownership record');
  return { path, owner, stat };
}

async function treeSize(path, device) {
  let bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name), stat = await lstat(child);
    assert(stat.dev === device, 'Scratch contains another filesystem');
    if (stat.isDirectory() && !stat.isSymbolicLink()) bytes += await treeSize(child, device);
    else bytes += stat.blocks == null ? stat.size : stat.blocks * 512;
  }
  return bytes;
}

// Full cleanup is deliberately conservative. Failed/unsupported OS probes
// produce uncertain entries; Doctor's quick inventory does not run these probes.
export async function activity(path) {
  const { stdout: mounts } = await execute('mount', [], { timeout: 10000, maxBuffer: 1024 * 1024 });
  const mounted = mounts.trim().split('\n').map(line => / on (.*?) \(/u.exec(line)?.[1]?.replace(/ type \S+$/u, ''));
  assert(mounted.length > 0 && mounted.every(Boolean), 'Mount inventory could not be parsed');
  for (const value of mounted) {
    const mount = value.replace(/\\([0-7]{3})/gu, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    if (contains(path, mount)) return 'mounted';
  }
  try {
    const result = await execute('lsof', ['-t', '+D', path], { timeout: 10000, maxBuffer: 1024 * 1024 });
    if (result.stdout.trim()) return 'active';
    assert(!result.stderr.trim(), 'Open-file inventory is incomplete');
  } catch (error) {
    if (!(error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim())) throw new Error('Open-file activity could not be established');
  }
  const { stdout } = await execute('ps', ['-ax', '-o', 'command='], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  if (stdout.split('\n').some(command => command.includes(path))) return 'active';
  return 'inactive';
}

async function assess(root, id, { quick = false, now = Date.now(), probe = processIdentity, inspectActivity = activity } = {}) {
  const item = { id, path: join(root, 'runs', id), status: 'uncertain', bytes: null };
  try {
    const { path, owner, stat } = await loadRun(root, id);
    Object.assign(item, { purpose: owner.purpose, createdAt: owner.createdAt, keepUntil: owner.keepUntil, identity: identity(stat) });
    let marker = false;
    try {
      const mark = await lstat(join(path, '.active'));
      assert(mark.isFile() && !mark.isSymbolicLink() && await readFile(join(path, '.active'), 'utf8') === id, 'Invalid activity marker');
      marker = true;
    } catch (error) { if (!absent(error)) throw error; }
    if (quick) {
      item.status = owner.keepUntil && Date.parse(owner.keepUntil) > now ? 'retained' : marker ? 'active-or-interrupted' : 'needs-check';
      return item;
    }
    if (owner.keepUntil && Date.parse(owner.keepUntil) > now) item.status = 'retained';
    else if (marker && await alive(owner, probe)) item.status = 'active';
    else {
      assert(marker === (owner.state === 'active'), 'Activity marker and lifecycle disagree');
      assert(!owner.supervisionPending, 'Interrupted child registration needs inspection');
      for (const child of owner.children) {
        assert(Number.isSafeInteger(child.processId) && child.processId > 0 && typeof child.processStartedAt === 'string', 'Invalid child identity');
        if (await alive(child, probe)) { item.status = 'active'; return item; }
        if (child.group) {
          try { process.kill(-child.processId, 0); item.status = 'active'; return item; }
          catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
      }
      const observed = await inspectActivity(path);
      assert(['inactive', 'active', 'mounted'].includes(observed), 'Unknown activity observation');
      item.status = observed === 'inactive' ? 'eligible' : observed;
    }
    // Never traverse a known mounted or active directory to calculate a size.
    if (item.status === 'eligible') item.bytes = await treeSize(path, stat.dev);
  } catch (error) { item.status = 'uncertain'; item.reason = error.message; }
  return item;
}

export async function inspectScratch({ root = scratchRoot(), run, quick = false, ...options } = {}) {
  let info;
  try { info = await rootInfo(root); }
  catch (error) {
    if (absent(error) && !await lstat(root).catch(() => null)) return { root: resolve(root), entries: [], eligibleBytes: 0, quick };
    return { root: resolve(root), entries: [], eligibleBytes: null, quick, error: error.message };
  }
  if (run !== undefined) assert(ID.test(run), 'Invalid scratch run ID');
  const names = run ? [run] : await readdir(join(info.root, 'runs'));
  const entries = [];
  for (const name of names.sort()) entries.push(await assess(info.root, name, { ...options, quick }));
  return { root: info.root, entries, eligibleBytes: quick ? null : entries.reduce((sum, item) => sum + (item.status === 'eligible' ? item.bytes : 0), 0), quick };
}

export async function cleanupScratch({ root = scratchRoot(), run, apply = false, ...options } = {}) {
  const preview = await inspectScratch({ root, run, ...options, quick: false });
  if (!apply || preview.error || preview.entries.length === 0) return { ...preview, applied: false, removed: [], reclaimedBytes: 0 };
  const info = await rootInfo(root);
  return lock(info.root, async () => {
    const removed = [], errors = [], skipped = [];
    for (const item of preview.entries.filter(entry => entry.status === 'eligible')) {
      try {
        const current = await assess(info.root, item.id, { ...options, quick: false });
        assert(current.status === 'eligible' && same(item.identity, current.identity), 'Run changed or is no longer eligible');
        // All cooperating creators/finishers use this root lock. Re-read parent
        // and run identities immediately before removal. rm never follows links.
        assert(same(info, await rootInfo(root)), 'Scratch root changed');
        assert(same(current.identity, await directory(current.path)), 'Run directory changed');
        await makeWritable(current.path);
        await rm(current.path, { recursive: true });
        removed.push({ id: item.id, bytes: current.bytes });
      } catch (error) { errors.push({ id: item.id, reason: error.message }); }
    }
    for (const item of preview.entries.filter(entry => entry.status !== 'eligible')) skipped.push({ id: item.id, status: item.status });
    return { ...preview, applied: true, removed, skipped, errors, reclaimedBytes: removed.reduce((sum, item) => sum + item.bytes, 0) };
  });
}

// Reviewer views deliberately seal directories read-only. Restore owner access
// only after activity/mount checks and under the same cleanup lock. Never follow links.
async function makeWritable(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) return;
  await chmod(path, info.mode | 0o700);
  for (const name of await readdir(path)) await makeWritable(join(path, name));
}

// External tools use standard temporary APIs; put those allocations under the
// supervised run without changing this process or nesting GateReeve roots.
export async function scratchEnvironment(scratch, environment = process.env) {
  const temporary = join(scratch.path, 'tmp');
  await mkdir(temporary, { mode: 0o700, recursive: true });
  return { ...environment, GATEREEVE_SCRATCH_ROOT: scratch.root, GATEREEVE_SCRATCH: scratch.path,
    TMPDIR: temporary, TMP: temporary, TEMP: temporary };
}

// Keep final output publication atomic even when TMPDIR and the output are on
// different volumes. The destination-side copy is a short output transaction,
// not a managed scratch root or a directory eligible for global cleanup.
export async function publishScratch(source, destination, { move = rename } = {}) {
  try { await move(source, destination); return; }
  catch (error) { if (error.code !== 'EXDEV') throw error; }
  const staging = await mkdtemp(join(dirname(destination), '.gatereeve-publish-'));
  try {
    const staged = join(staging, 'output');
    await cp(source, staged, { recursive: true, verbatimSymlinks: true });
    await rename(staged, destination);
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export async function finishScratch(scratch, { error = null, diagnostics = '' } = {}) {
  const info = await rootInfo(scratch.root);
  await lock(info.root, async () => {
    const { path, owner } = await loadRun(info.root, scratch.id);
    assert(same(owner, scratch.owner) && owner.processId === process.pid && owner.processStartedAt === await processIdentity(process.pid), 'Scratch belongs to a different invocation');
    const report = { kind: KIND, id: owner.id, purpose: owner.purpose, createdAt: owner.createdAt,
      finishedAt: new Date().toISOString(), outcome: error ? 'FAIL' : 'PASS',
      error: error ? String(error.message ?? error).slice(-4096) : null, diagnostics: String(diagnostics).slice(-16384) };
    // Durable diagnostic publication precedes eligibility. A write failure leaves
    // the directory protected instead of silently discarding the only evidence.
    await writeFile(join(info.root, 'reports', `${scratch.id}.json`), JSON.stringify(report), { mode: 0o600, flag: 'wx' });
    await saveOwner(path, { ...owner, supervisionPending: false, state: error ? 'failed' : 'finished' });
    await unlink(join(path, '.active'));
  });
  return cleanupScratch({ root: info.root, run: scratch.id, apply: true });
}

export async function withScratch(options, callback) {
  const scratch = await createScratch(options);
  let result, primary, cleanup;
  try { result = await callback(scratch); } catch (error) { primary = error; }
  try { cleanup = await finishScratch(scratch, { error: primary }); }
  catch (error) {
    throw new AggregateError([...(primary ? [primary] : []), error], `Scratch cleanup failed; retained ${scratch.path}`);
  }
  // A hold or external user of scratch is not a failed test. Always expose
  // retained paths; commands must not claim that their workspace was removed.
  if (!cleanup.removed.length) console.error(`Scratch retained: ${scratch.path} (${cleanup.entries[0]?.status ?? cleanup.error ?? 'uncertain'})`);
  options.onCleanup?.(cleanup);
  if (primary) { primary.scratchCleanup = cleanup; throw primary; }
  if (cleanup.errors?.length) throw new Error(`Scratch cleanup failed: ${JSON.stringify(cleanup.errors)}`);
  return result;
}

export async function runScratchCommand(command, args, options = {}) {
  let commandResult;
  return withScratch({ ...options, purpose: options.purpose ?? basename(command) }, async scratch => {
    await lock(scratch.root, async () => {
      const { owner } = await loadRun(scratch.root, scratch.id);
      await saveOwner(scratch.path, { ...owner, supervisionPending: true });
    });
    const child = spawn(command, args, { cwd: options.cwd ?? scratch.path,
      env: await scratchEnvironment(scratch, options.env ?? process.env), detached: true, stdio: [options.capture ? 'ignore' : 'inherit', 'pipe', 'pipe'] });
    const completed = new Promise((resolveResult, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolveResult({ code, signal }));
    });
    completed.catch(() => {}); // Launch errors can arrive during bookkeeping.
    // Install signal forwarding before waiting for any asynchronous bookkeeping.
    const forward = signal => { try { process.kill(-child.pid, signal); } catch {} };
    const onInt = () => forward('SIGINT'), onTerm = () => forward('SIGTERM');
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    let tail = '', stdout = '', stderr = '', outputBytes = 0, timedOut = false, outputLimited = false;
    const timer = options.timeoutMs ? setTimeout(() => { timedOut = true; forward('SIGKILL'); }, options.timeoutMs) : null;
    const output = (bytes, stream) => {
      tail = (tail + bytes).slice(-16384);
      if (!options.capture) { process[stream].write(bytes); return; }
      outputBytes += bytes.length;
      if (outputBytes > 16 * 1024 * 1024) { outputLimited = true; forward('SIGKILL'); return; }
      if (stream === 'stdout') stdout += bytes; else stderr += bytes;
    };
    child.stdout.on('data', bytes => output(bytes, 'stdout'));
    child.stderr.on('data', bytes => output(bytes, 'stderr'));
    try {
      if (child.pid) {
        const started = await processIdentity(child.pid);
        await lock(scratch.root, async () => {
          const { owner } = await loadRun(scratch.root, scratch.id);
          owner.children.push({ processId: child.pid, processStartedAt: started ?? 'unobserved', group: true });
          owner.supervisionPending = false;
          await saveOwner(scratch.path, owner);
        });
      }
      const outcome = await completed;
      const result = commandResult = { ...outcome, timedOut, outputLimited, stdout, stderr };
      if (outcome.code !== 0 || timedOut || outputLimited) {
        const error = new Error(`Scratch command failed (${timedOut ? 'timeout' : outputLimited ? 'output limit' : outcome.signal ?? outcome.code})${options.capture ? '' : `: ${tail}`}`);
        error.scratchResult = result;
        throw error;
      }
      return options.capture ? result : outcome;
    } finally {
      // If registration failed, stop and reap the command before closing its
      // owner. Otherwise a successful spawn could outlive a bookkeeping error.
      if (child.exitCode === null && child.signalCode === null) { forward('SIGKILL'); await completed.catch(() => {}); }
      if (timer) clearTimeout(timer);
      process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    }
  }).catch(error => {
    // Finalization can wrap a failed command or fail after a successful one.
    // Preserve its actual outcome and captured streams across either boundary.
    if (commandResult) error.scratchResult = commandResult;
    throw error;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Dependency-free entrypoint for maintained test/CI scripts. Preserve cwd.
  if (process.argv[2] === 'run') {
    const [command, ...args] = process.argv.slice(3);
    assert(command, 'Use run <command> [args...]');
    await runScratchCommand(command, args, { cwd: process.cwd() });
  } else {
    assert(process.argv[2] === 'inspect', 'Use inspect [--quick] or run <command> [args...]');
    console.log(JSON.stringify(await inspectScratch({ quick: process.argv.includes('--quick') })));
  }
}
