// @ts-check

export const DESKTOP_UPDATE_MANIFEST_URL = 'https://gatereeve.pages.dev/releases/desktop.json';
export const DESKTOP_RELEASES_URL = 'https://github.com/TrentBrown/gatereeve/releases';
export const DESKTOP_UPDATE_MANIFEST_SCHEMA_VERSION = 1;

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(rc)\.(0|[1-9]\d*))?$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

export function parseDesktopVersion(value) {
  if (typeof value !== 'string') throw new Error('Desktop version must be a string.');
  const match = value.match(VERSION_PATTERN);
  if (!match) throw new Error(`Unsupported GateReeve Desktop version: ${value}`);
  return Object.freeze({
    value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    channel: match[4] === 'rc' ? 'rc' : 'stable',
    rc: match[5] === undefined ? null : Number(match[5]),
  });
}

function compareCore(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

export function compareDesktopVersions(leftValue, rightValue) {
  const left = typeof leftValue === 'string' ? parseDesktopVersion(leftValue) : leftValue;
  const right = typeof rightValue === 'string' ? parseDesktopVersion(rightValue) : rightValue;
  const core = compareCore(left, right);
  if (core !== 0) return core;
  if (left.channel !== right.channel) return left.channel === 'stable' ? 1 : -1;
  if (left.channel === 'stable') return 0;
  return left.rc === right.rc ? 0 : left.rc < right.rc ? -1 : 1;
}

function validRelease(value, channel) {
  if (value === null) return true;
  if (!exactKeys(value, [
    'version', 'publishedAt', 'sourceCommit', 'artifact', 'appleTrust',
  ])) return false;
  let parsed;
  try { parsed = parseDesktopVersion(value.version); } catch { return false; }
  return parsed.channel === channel
    && typeof value.publishedAt === 'string'
    && Number.isFinite(Date.parse(value.publishedAt))
    && COMMIT_PATTERN.test(value.sourceCommit)
    && exactKeys(value.artifact, ['name', 'bytes', 'sha256'])
    && value.artifact.name === `GateReeve-${value.version}-macos-universal.dmg`
    && Number.isSafeInteger(value.artifact.bytes)
    && value.artifact.bytes > 0
    && SHA256_PATTERN.test(value.artifact.sha256)
    && exactKeys(value.appleTrust, [
      'developerIdApplication', 'hardenedRuntime', 'secureTimestamp',
      'notarized', 'stapled', 'gatekeeperAccepted',
    ])
    && Object.values(value.appleTrust).every((item) => item === true);
}

export function requireDesktopUpdateManifest(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'product', 'generatedAt', 'channels'])
    || value.schemaVersion !== DESKTOP_UPDATE_MANIFEST_SCHEMA_VERSION
    || value.product !== 'gatereeve-desktop'
    || (value.generatedAt !== null && (
      typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))
    ))
    || !exactKeys(value.channels, ['stable', 'rc'])
    || !validRelease(value.channels.stable, 'stable')
    || !validRelease(value.channels.rc, 'rc')
    || (value.channels.stable !== null && value.generatedAt === null)
    || (value.channels.rc !== null && value.generatedAt === null)
  ) {
    throw new Error('GateReeve Desktop update manifest is invalid.');
  }
  return value;
}

function sameVersionLine(left, right) {
  return left.major === right.major && left.minor === right.minor && left.patch === right.patch;
}

export function selectDesktopUpdate(currentVersion, manifestValue) {
  const current = parseDesktopVersion(currentVersion);
  const manifest = requireDesktopUpdateManifest(manifestValue);
  const candidates = [];
  if (current.channel === 'stable') {
    if (manifest.channels.stable !== null) candidates.push(manifest.channels.stable);
  } else {
    for (const release of [manifest.channels.rc, manifest.channels.stable]) {
      if (release !== null && sameVersionLine(current, parseDesktopVersion(release.version))) {
        candidates.push(release);
      }
    }
  }
  return candidates
    .filter((release) => compareDesktopVersions(release.version, current) > 0)
    .sort((left, right) => compareDesktopVersions(right.version, left.version))[0] ?? null;
}

export function desktopReleasePage(version) {
  parseDesktopVersion(version);
  return `${DESKTOP_RELEASES_URL}/tag/v${version}`;
}
