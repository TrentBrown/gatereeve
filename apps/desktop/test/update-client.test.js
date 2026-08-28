import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchDesktopUpdateManifest } from '../main/update-client.js';
import { DESKTOP_UPDATE_MANIFEST_URL } from '../main/update-manifest.js';

const emptyManifest = {
  schemaVersion: 1,
  product: 'gatereeve-desktop',
  generatedAt: null,
  channels: { stable: null, rc: null },
};

test('fetches only the fixed identifier-free endpoint with bounded request options', async () => {
  let observed = null;
  const result = await fetchDesktopUpdateManifest({
    fetchFn: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify(emptyManifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.deepEqual(result, emptyManifest);
  assert.equal(observed.url, DESKTOP_UPDATE_MANIFEST_URL);
  assert.deepEqual({
    method: observed.options.method,
    redirect: observed.options.redirect,
    cache: observed.options.cache,
    credentials: observed.options.credentials,
    referrerPolicy: observed.options.referrerPolicy,
    headers: observed.options.headers,
  }, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { accept: 'application/json' },
  });
  assert.equal(new URL(observed.url).search, '');
});

test('rejects HTTP, parse, schema, and response-size failures', async () => {
  await assert.rejects(fetchDesktopUpdateManifest({
    fetchFn: async () => new Response('offline', { status: 503 }),
  }), /HTTP 503/);
  await assert.rejects(fetchDesktopUpdateManifest({
    fetchFn: async () => new Response('{', { status: 200 }),
  }), SyntaxError);
  await assert.rejects(fetchDesktopUpdateManifest({
    fetchFn: async () => new Response('{}', { status: 200 }),
  }), /invalid/);
  await assert.rejects(fetchDesktopUpdateManifest({
    fetchFn: async () => new Response('x'.repeat(128), { status: 200 }),
    responseLimitBytes: 64,
  }), /size limit/);
});

test('aborts a manifest request at the fixed timeout boundary', async () => {
  await assert.rejects(fetchDesktopUpdateManifest({
    timeoutMs: 5,
    fetchFn: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ), { once: true });
    }),
  }), /aborted/);
});
