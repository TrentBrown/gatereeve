// @ts-check

import { spawn as spawnProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  parseModuleProviderResponse,
  validateModuleProviderRequest,
} from '../resources/protocol/module-runtime.js';

export const PROVIDER_OUTPUT_LIMIT = 1_000_000;
const ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
}

function digest(value) {
  return `sha256:${createHash('sha256').update(`${JSON.stringify(normalized(value), null, 2)}\n`).digest('hex')}`;
}

export function hashProviderExecutable(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an invalid shape.`);
  }
}

export function hashProviderManifest(manifest) {
  const { digest: _digest, ...content } = manifest;
  return digest(content);
}

export function validateProviderManifest(value) {
  exactKeys(
    value,
    [
      'schemaVersion', 'id', 'version', 'digest', 'runtime', 'executable',
      'executableDigest', 'args', 'timeoutSeconds',
    ],
    'Provider manifest',
  );
  if (
    value.schemaVersion !== 1
    || !ID.test(value.id)
    || !SEMVER.test(value.version)
    || !SHA256.test(value.digest)
    || !['native', 'electron-node'].includes(value.runtime)
    || typeof value.executable !== 'string'
    || value.executable.length === 0
    || (!isAbsolute(value.executable) && (
      value.executable.includes('\\')
      || value.executable.split('/').some((part) => ['', '.', '..'].includes(part))
    ))
    || !SHA256.test(value.executableDigest)
    || !Array.isArray(value.args)
    || value.args.some((arg) => typeof arg !== 'string' || arg.length > 16_384)
    || !Number.isSafeInteger(value.timeoutSeconds)
    || value.timeoutSeconds < 1
    || value.timeoutSeconds > 3_600
  ) {
    throw new Error(`Provider manifest ${value.id ?? '<unknown>'} is invalid.`);
  }
  if (hashProviderManifest(value) !== value.digest) {
    throw new Error(`Provider manifest ${value.id} digest does not match.`);
  }
  return value;
}

function selectorKey(value) {
  return `${value.id}@${value.version}#${value.digest}`;
}

function inside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

export async function discoverInstalledProviders(
  installRoot,
  allowlist,
  { electronExecutable = process.execPath } = {},
) {
  if (!isAbsolute(installRoot)) throw new TypeError('Provider install root must be absolute.');
  if (!isAbsolute(electronExecutable)) throw new TypeError('Electron provider runtime must be absolute.');
  if (!Array.isArray(allowlist)) throw new TypeError('Provider allowlist must be an array.');
  const allowed = new Set(allowlist.map((selector) => {
    exactKeys(selector, ['id', 'version', 'digest'], 'Provider allowlist selector');
    if (!ID.test(selector.id) || !SEMVER.test(selector.version) || !SHA256.test(selector.digest)) {
      throw new TypeError('Provider allowlist selector is invalid.');
    }
    return selectorKey(selector);
  }));
  const root = await realpath(installRoot).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (root === null) return Object.freeze({ providers: [], diagnostics: [] });
  const providers = [];
  const diagnostics = [];
  const ids = new Set();
  const duplicateIds = new Set();
  for (const name of (await readdir(root)).filter((item) => item.endsWith('.json')).sort()) {
    const path = join(root, name);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Manifest must be a regular file.');
      const canonical = await realpath(path);
      if (!inside(root, canonical)) throw new Error('Manifest escapes the installed provider directory.');
      const manifest = validateProviderManifest(JSON.parse(await readFile(canonical, 'utf8')));
      if (manifest.runtime === 'electron-node' && isAbsolute(manifest.executable)) {
        throw new Error('Electron Node provider entrypoints must be installed provider-relative files.');
      }
      if (!allowed.has(selectorKey(manifest))) {
        diagnostics.push({ path, status: 'not-allowlisted', providerId: manifest.id });
        continue;
      }
      if (ids.has(manifest.id) || duplicateIds.has(manifest.id)) {
        duplicateIds.add(manifest.id);
        const prior = providers.findIndex((provider) => provider.id === manifest.id);
        if (prior !== -1) providers.splice(prior, 1);
        diagnostics.push({ path, status: 'invalid', detail: `Duplicate installed provider ${manifest.id}.` });
        continue;
      }
      ids.add(manifest.id);
      const executablePath = isAbsolute(manifest.executable)
        ? manifest.executable
        : resolve(dirname(canonical), manifest.executable);
      if (!isAbsolute(manifest.executable) && !inside(root, executablePath)) {
        throw new Error('Provider executable escapes the installed provider directory.');
      }
      const executableInfo = await lstat(executablePath);
      if (
        !executableInfo.isFile()
        || executableInfo.isSymbolicLink()
        || (manifest.runtime === 'native' && (executableInfo.mode & 0o111) === 0)
      ) {
        throw new Error(manifest.runtime === 'native'
          ? 'Provider executable must be an executable regular file, not a symlink.'
          : 'Provider entrypoint must be a regular file, not a symlink.');
      }
      const executable = await realpath(executablePath);
      if (!isAbsolute(manifest.executable) && !inside(root, executable)) {
        throw new Error('Provider executable escapes the installed provider directory.');
      }
      if (hashProviderExecutable(await readFile(executable)) !== manifest.executableDigest) {
        throw new Error('Provider executable digest does not match its manifest.');
      }
      providers.push(Object.freeze({
        id: manifest.id,
        version: manifest.version,
        digest: manifest.digest,
        executable: manifest.runtime === 'electron-node' ? electronExecutable : executable,
        args: manifest.runtime === 'electron-node' ? [executable, ...manifest.args] : [...manifest.args],
        environment: manifest.runtime === 'electron-node' ? { ELECTRON_RUN_AS_NODE: '1' } : {},
        entrypoint: executable,
        timeoutSeconds: manifest.timeoutSeconds,
        manifestPath: canonical,
        manifest: structuredClone(manifest),
      }));
    } catch (error) {
      diagnostics.push({ path, status: 'invalid', detail: error?.message ?? String(error) });
    }
  }
  return Object.freeze({ providers, diagnostics });
}

export class ProviderRuntimeError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'ProviderRuntimeError';
    this.code = code;
    this.detail = detail;
  }
}

function appendBounded(current, chunk, limit, label) {
  const next = `${current}${chunk}`;
  if (Buffer.byteLength(next, 'utf8') > limit) {
    throw new ProviderRuntimeError('PROVIDER_OUTPUT_LIMIT', `${label} exceeded its output limit.`);
  }
  return next;
}

export function createProviderSupervisor({
  spawn = spawnProcess,
  readExecutable = readFile,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  outputLimit = PROVIDER_OUTPUT_LIMIT,
} = {}) {
  if (typeof spawn !== 'function') throw new TypeError('A provider spawn adapter is required.');
  const active = new Map();
  let closed = false;

  return Object.freeze({
    observe(provider, requestValue) {
      if (closed) throw new ProviderRuntimeError('PROVIDER_UNAVAILABLE', 'The provider supervisor is closed.');
      const request = validateModuleProviderRequest(structuredClone(requestValue));
      const manifest = validateProviderManifest(provider.manifest ?? provider);
      if (
        manifest.id !== request.provider.id
        || manifest.version !== request.provider.version
        || provider.id !== manifest.id
        || provider.version !== manifest.version
        || provider.digest !== manifest.digest
      ) {
        throw new ProviderRuntimeError('PROVIDER_UNAVAILABLE', 'The exact requested provider is not installed.');
      }
      const start = () => new Promise((resolvePromise, rejectPromise) => {
        let child;
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer = null;
        const settle = (error, value = null) => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimer(timer);
          if (child) active.delete(child);
          if (error) rejectPromise(error);
          else resolvePromise(value);
        };
        try {
          child = spawn(provider.executable, provider.args, {
            cwd: dirname(provider.manifestPath),
            env: {
              PATH: process.env.PATH ?? '',
              HOME: process.env.HOME ?? '',
              ...(provider.environment ?? {}),
            },
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } catch (error) {
          settle(new ProviderRuntimeError('PROVIDER_UNAVAILABLE', 'Provider could not be started.', error?.message));
          return;
        }
        active.set(child, () => {
          try { child.kill('SIGKILL'); } catch { /* Process may already be gone. */ }
          settle(new ProviderRuntimeError('PROVIDER_UNAVAILABLE', 'Provider observation stopped during application shutdown.'));
        });
        const failOutput = (error) => {
          try { child.kill('SIGKILL'); } catch { /* Process may already be gone. */ }
          settle(error);
        };
        child.stdout?.setEncoding?.('utf8');
        child.stderr?.setEncoding?.('utf8');
        child.stdout?.on('data', (chunk) => {
          try { stdout = appendBounded(stdout, chunk, outputLimit, 'Provider stdout'); }
          catch (error) { failOutput(error); }
        });
        child.stderr?.on('data', (chunk) => {
          try { stderr = appendBounded(stderr, chunk, outputLimit, 'Provider stderr'); }
          catch (error) { failOutput(error); }
        });
        child.once('error', (error) => settle(new ProviderRuntimeError(
          'PROVIDER_UNAVAILABLE', 'Provider process failed to start.', error?.message,
        )));
        child.once('close', (code, signal) => {
          if (settled) return;
          if (signal !== null || code !== 0) {
            settle(new ProviderRuntimeError(
              'PROVIDER_CRASHED',
              `Provider exited unsuccessfully${signal ? ` on ${signal}` : ` with code ${code}`}.`,
              stderr.trim() || null,
            ));
            return;
          }
          const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
          if (lines.length !== 1) {
            settle(new ProviderRuntimeError(
              lines.length === 0 ? 'PROVIDER_MISSING_RESPONSE' : 'PROVIDER_DUPLICATE_RESPONSE',
              lines.length === 0
                ? 'Provider returned no response.'
                : 'Provider returned more than one response.',
            ));
            return;
          }
          try {
            settle(null, parseModuleProviderResponse(lines[0], request));
          } catch (error) {
            settle(new ProviderRuntimeError('PROVIDER_MALFORMED_RESPONSE', error.message));
          }
        });
        timer = setTimer(() => {
          try { child.kill('SIGKILL'); } catch { /* Process may already be gone. */ }
          settle(new ProviderRuntimeError('PROVIDER_TIMEOUT', 'Provider observation timed out.'));
        }, provider.timeoutSeconds * 1_000);
        try {
          child.stdin.end(`${JSON.stringify(request)}\n`);
        } catch (error) {
          settle(new ProviderRuntimeError('PROVIDER_STDIN_FAILED', 'Provider request could not be written.', error?.message));
        }
      });
      return Promise.resolve(readExecutable(provider.entrypoint ?? provider.executable))
        .then((bytes) => {
          if (hashProviderExecutable(bytes) !== manifest.executableDigest) {
            throw new ProviderRuntimeError(
              'PROVIDER_UNAVAILABLE',
              'Provider executable changed after discovery.',
            );
          }
          return start();
        })
        .catch((error) => {
          if (error instanceof ProviderRuntimeError) throw error;
          throw new ProviderRuntimeError(
            'PROVIDER_UNAVAILABLE',
            'Provider executable could not be verified before launch.',
            error?.message ?? String(error),
          );
        });
    },
    close() {
      if (closed) return;
      closed = true;
      for (const cancel of [...active.values()]) cancel();
      active.clear();
    },
  });
}
