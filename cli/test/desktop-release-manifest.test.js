import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDesktopReleaseManifest,
  createDesktopReleaseManifest,
  renderDesktopChecksum,
  renderDesktopReleaseManifest,
  textIdentity,
} from '../src/plugin/desktop-release-manifest.js';

const emptyManifest = {
  schemaVersion: 1,
  product: 'gatereeve-desktop',
  generatedAt: null,
  channels: { stable: null, rc: null },
};

function trustedRecord(version = '0.1.0-rc.1') {
  return {
    version,
    channel: version.includes('-rc.') ? 'rc' : 'stable',
    source: { commit: '1234567890abcdef1234567890abcdef12345678' },
    candidates: {
      desktop: {
        artifact: {
          filename: `GateReeve-${version}-macos-universal.dmg`,
          bytes: 42,
          sha256: 'a'.repeat(64),
        },
        trust: {
          status: 'developer-id-notarized',
          hardenedRuntime: true,
          secureTimestamp: true,
          notarizationStatus: 'Accepted',
          stapled: true,
          gatekeeperAccepted: true,
        },
      },
    },
  };
}

test('renders one exact trusted RC manifest and checksum output', () => {
  const record = trustedRecord();
  const manifest = createDesktopReleaseManifest({
    current: emptyManifest,
    record,
    publishedAt: '2026-08-28T15:00:00.000Z',
  });
  assert.equal(manifest.channels.stable, null);
  assert.equal(manifest.channels.rc.version, '0.1.0-rc.1');
  assert.equal(manifest.channels.rc.artifact.sha256, 'a'.repeat(64));
  assert.deepEqual(Object.values(manifest.channels.rc.appleTrust), [
    true, true, true, true, true, true,
  ]);
  const content = renderDesktopReleaseManifest(manifest);
  assert.deepEqual(assertDesktopReleaseManifest(JSON.parse(content)), manifest);
  assert.equal(
    renderDesktopChecksum(record),
    `${'a'.repeat(64)}  GateReeve-0.1.0-rc.1-macos-universal.dmg\n`
  );
  assert.deepEqual(textIdentity('publication/desktop.json', '{}\n'), {
    path: 'publication/desktop.json',
    filename: 'desktop.json',
    bytes: 3,
    sha256: 'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
  });
});

test('preserves the other channel and rejects incomplete trust', () => {
  const rc = createDesktopReleaseManifest({
    current: emptyManifest,
    record: trustedRecord(),
    publishedAt: '2026-08-28T15:00:00.000Z',
  });
  const stable = createDesktopReleaseManifest({
    current: rc,
    record: trustedRecord('0.1.0'),
    publishedAt: '2026-08-29T15:00:00.000Z',
  });
  assert.equal(stable.channels.rc.version, '0.1.0-rc.1');
  assert.equal(stable.channels.stable.version, '0.1.0');

  const untrusted = trustedRecord();
  untrusted.candidates.desktop.trust.stapled = false;
  assert.throws(
    () => createDesktopReleaseManifest({
      current: emptyManifest,
      record: untrusted,
      publishedAt: '2026-08-28T15:00:00.000Z',
    }),
    /Trusted coordinated release identity is invalid/
  );
});
