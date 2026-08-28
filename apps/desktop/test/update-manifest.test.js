import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDesktopVersions,
  desktopReleasePage,
  requireDesktopUpdateManifest,
  selectDesktopUpdate,
} from '../main/update-manifest.js';

function release(version) {
  return {
    version,
    publishedAt: '2026-08-28T00:00:00.000Z',
    sourceCommit: 'a'.repeat(40),
    artifact: {
      name: `GateReeve-${version}-macos-universal.dmg`,
      bytes: 123_456,
      sha256: 'b'.repeat(64),
    },
    appleTrust: {
      developerIdApplication: true,
      hardenedRuntime: true,
      secureTimestamp: true,
      notarized: true,
      stapled: true,
      gatekeeperAccepted: true,
    },
  };
}

function manifest({ stable = null, rc = null } = {}) {
  return {
    schemaVersion: 1,
    product: 'gatereeve-desktop',
    generatedAt: stable === null && rc === null ? null : '2026-08-28T00:00:00.000Z',
    channels: { stable, rc },
  };
}

test('strictly validates an empty or fully trusted URL-free manifest', () => {
  assert.deepEqual(requireDesktopUpdateManifest(manifest()), manifest());
  assert.equal(requireDesktopUpdateManifest(manifest({ rc: release('0.1.0-rc.4') })).channels.rc.version, '0.1.0-rc.4');
  assert.throws(() => requireDesktopUpdateManifest({
    ...manifest({ rc: release('0.1.0-rc.4') }),
    downloadUrl: 'https://untrusted.example/app.dmg',
  }), /invalid/);
  const untrusted = release('0.1.0-rc.4');
  untrusted.appleTrust.notarized = false;
  assert.throws(() => requireDesktopUpdateManifest(manifest({ rc: untrusted })), /invalid/);
});

test('RC installations see later RC and eventual stable only on their version line', () => {
  assert.equal(selectDesktopUpdate('0.1.0-rc.3', manifest({
    stable: release('0.1.0'),
    rc: release('0.1.0-rc.4'),
  })).version, '0.1.0');
  assert.equal(selectDesktopUpdate('0.1.0-rc.3', manifest({
    stable: release('0.0.9'),
    rc: release('0.2.0-rc.1'),
  })), null);
  assert.equal(selectDesktopUpdate('0.1.0-rc.4', manifest({
    rc: release('0.1.0-rc.3'),
  })), null);
});

test('stable installations ignore RCs and see only later stable versions', () => {
  assert.equal(selectDesktopUpdate('0.1.0', manifest({
    stable: release('0.1.1'),
    rc: release('0.2.0-rc.1'),
  })).version, '0.1.1');
  assert.equal(selectDesktopUpdate('0.1.0', manifest({ rc: release('0.2.0-rc.1') })), null);
  assert.equal(compareDesktopVersions('0.1.0-rc.9', '0.1.0'), -1);
});

test('release navigation is derived only from a validated version', () => {
  assert.equal(
    desktopReleasePage('0.1.0-rc.4'),
    'https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.4',
  );
  assert.throws(() => desktopReleasePage('../latest'), /Unsupported/);
});
