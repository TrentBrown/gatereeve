import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  exactReleasePage,
  initializeEarlyAccess,
  presentEarlyAccess,
  requireEarlyAccessManifest,
} from './desktop-early-access.js';

function manifest(rc = null) {
  return {
    schemaVersion: 1,
    product: 'gatereeve-desktop',
    generatedAt: rc === null ? null : '2026-08-28T00:00:00.000Z',
    channels: { stable: null, rc },
  };
}

function rc() {
  return {
    version: '0.1.0-rc.4', publishedAt: '2026-08-28T00:00:00.000Z', sourceCommit: 'a'.repeat(40),
    artifact: { name: 'GateReeve-0.1.0-rc.4-macos-universal.dmg', bytes: 1, sha256: 'b'.repeat(64) },
    appleTrust: {
      developerIdApplication: true, hardenedRuntime: true, secureTimestamp: true,
      notarized: true, stapled: true, gatekeeperAccepted: true,
    },
  };
}

function root() {
  const values = Object.fromEntries([
    'desktop-early-access-status', 'desktop-early-access-detail', 'desktop-early-access-link',
  ].map((id) => [id, { textContent: '', dataset: {}, href: '', hidden: id.endsWith('link') }]));
  return { values, querySelector(selector) { return values[selector.slice(1)]; } };
}

test('empty manifest leaves the Early Access release unresolved', () => {
  const document = root();
  assert.equal(presentEarlyAccess(document, manifest()), false);
  assert.equal(document.values['desktop-early-access-link'].hidden, true);
});

test('only complete Apple trust evidence activates the exact GitHub tag page', () => {
  const document = root();
  assert.equal(presentEarlyAccess(document, manifest(rc())), true);
  assert.equal(document.values['desktop-early-access-link'].href, exactReleasePage('0.1.0-rc.4'));
  assert.equal(document.values['desktop-early-access-link'].hidden, false);
  const untrusted = rc();
  untrusted.appleTrust.stapled = false;
  assert.throws(() => requireEarlyAccessManifest(manifest(untrusted)), /unavailable/);
});

test('website fetch uses one same-origin manifest without identifiers', async () => {
  const document = root();
  let request;
  assert.equal(await initializeEarlyAccess({
    root: document,
    fetchFn: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return manifest(); } };
    },
  }), false);
  assert.equal(request.url, '/releases/desktop.json');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
});

test('production site keeps the prerequisite visible and ships the exact trusted RC', async () => {
  const [html, productionManifest] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./releases/desktop.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(html, /<strong>Install the GateReeve Plugin first\.<\/strong>/u);
  assert.match(html, /Desktop is an optional, read-only window/u);
  assert.match(html, /RC installations notify you about later RCs and the eventual stable release/u);
  assert.match(html, /id="desktop-early-access-link"[^>]*hidden/u);
  assert.deepEqual(requireEarlyAccessManifest(productionManifest).channels.rc, {
    version: '0.1.0-rc.1',
    publishedAt: '2026-08-28T15:14:01.037Z',
    sourceCommit: '117a58511ef20957426d3fc5e801f6d5b1173b32',
    artifact: {
      name: 'GateReeve-0.1.0-rc.1-macos-universal.dmg',
      bytes: 246098110,
      sha256: '9cbe51065692857ba929e153863fa92c8fe2dc4d275eb29453014a04e1f1ea92',
    },
    appleTrust: {
      developerIdApplication: true,
      hardenedRuntime: true,
      secureTimestamp: true,
      notarized: true,
      stapled: true,
      gatekeeperAccepted: true,
    },
  });
});
