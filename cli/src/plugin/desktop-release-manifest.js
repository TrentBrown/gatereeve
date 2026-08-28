import { createHash } from 'node:crypto';

const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function exactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validRelease(value, channel) {
  return value !== null
    && exactKeys(value, ['version', 'publishedAt', 'sourceCommit', 'artifact', 'appleTrust'])
    && typeof value.version === 'string'
    && VERSION_PATTERN.test(value.version)
    && (value.version.includes('-rc.') ? 'rc' : 'stable') === channel
    && validTimestamp(value.publishedAt)
    && COMMIT.test(value.sourceCommit)
    && exactKeys(value.artifact, ['name', 'bytes', 'sha256'])
    && value.artifact.name === `GateReeve-${value.version}-macos-universal.dmg`
    && Number.isSafeInteger(value.artifact.bytes)
    && value.artifact.bytes > 0
    && SHA256.test(value.artifact.sha256)
    && exactKeys(value.appleTrust, [
      'developerIdApplication',
      'hardenedRuntime',
      'secureTimestamp',
      'notarized',
      'stapled',
      'gatekeeperAccepted',
    ])
    && Object.values(value.appleTrust).every((item) => item === true);
}

export function assertDesktopReleaseManifest(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'product', 'generatedAt', 'channels'])
    || value.schemaVersion !== 1
    || value.product !== 'gatereeve-desktop'
    || (value.generatedAt !== null && !validTimestamp(value.generatedAt))
    || !exactKeys(value.channels, ['stable', 'rc'])
    || (value.channels.stable !== null && !validRelease(value.channels.stable, 'stable'))
    || (value.channels.rc !== null && !validRelease(value.channels.rc, 'rc'))
    || ((value.channels.stable !== null || value.channels.rc !== null)
      && value.generatedAt === null)
  ) {
    throw new Error('GateReeve Desktop release manifest is invalid');
  }
  return value;
}

export function createDesktopReleaseManifest({ current, record, publishedAt }) {
  assertDesktopReleaseManifest(current);
  if (
    !VERSION_PATTERN.test(record?.version ?? '')
    || !COMMIT.test(record?.source?.commit ?? '')
    || record?.candidates?.desktop?.trust?.status !== 'developer-id-notarized'
    || record.candidates.desktop.trust.hardenedRuntime !== true
    || record.candidates.desktop.trust.secureTimestamp !== true
    || record.candidates.desktop.trust.notarizationStatus !== 'Accepted'
    || record.candidates.desktop.trust.stapled !== true
    || record.candidates.desktop.trust.gatekeeperAccepted !== true
    || !validTimestamp(publishedAt)
  ) {
    throw new Error('Trusted coordinated release identity is invalid for the manifest');
  }
  const artifact = record.candidates.desktop.artifact;
  const channel = record.channel;
  const entry = {
    version: record.version,
    publishedAt,
    sourceCommit: record.source.commit,
    artifact: {
      name: artifact.filename,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
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
  const next = {
    schemaVersion: 1,
    product: 'gatereeve-desktop',
    generatedAt: publishedAt,
    channels: {
      stable: channel === 'stable' ? entry : current.channels.stable,
      rc: channel === 'rc' ? entry : current.channels.rc,
    },
  };
  return assertDesktopReleaseManifest(next);
}

export function renderDesktopReleaseManifest(value) {
  assertDesktopReleaseManifest(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderDesktopChecksum(record) {
  const artifact = record?.candidates?.desktop?.artifact;
  if (
    typeof artifact?.filename !== 'string'
    || !SHA256.test(artifact?.sha256 ?? '')
  ) {
    throw new Error('Desktop artifact identity is invalid for SHA256SUMS');
  }
  return `${artifact.sha256}  ${artifact.filename}\n`;
}

export function textIdentity(path, content) {
  const bytes = Buffer.byteLength(content);
  return {
    path,
    filename: path.split('/').at(-1),
    bytes,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
