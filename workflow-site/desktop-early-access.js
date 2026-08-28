const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/u;
const RELEASES_URL = 'https://github.com/TrentBrown/gatereeve/releases';

function exactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function trustedRelease(value, channel) {
  return value !== null
    && exactKeys(value, ['version', 'publishedAt', 'sourceCommit', 'artifact', 'appleTrust'])
    && typeof value.version === 'string'
    && VERSION_PATTERN.test(value.version)
    && (value.version.includes('-rc.') ? 'rc' : 'stable') === channel
    && typeof value.publishedAt === 'string'
    && Number.isFinite(Date.parse(value.publishedAt))
    && /^[a-f0-9]{40}$/u.test(value.sourceCommit)
    && exactKeys(value.artifact, ['name', 'bytes', 'sha256'])
    && value.artifact.name === `GateReeve-${value.version}-macos-universal.dmg`
    && Number.isSafeInteger(value.artifact.bytes)
    && value.artifact.bytes > 0
    && /^[a-f0-9]{64}$/u.test(value.artifact.sha256)
    && exactKeys(value.appleTrust, [
      'developerIdApplication', 'hardenedRuntime', 'secureTimestamp',
      'notarized', 'stapled', 'gatekeeperAccepted',
    ])
    && Object.values(value.appleTrust).every((item) => item === true);
}

export function requireEarlyAccessManifest(value) {
  if (
    !exactKeys(value, ['schemaVersion', 'product', 'generatedAt', 'channels'])
    || value.schemaVersion !== 1
    || value.product !== 'gatereeve-desktop'
    || (value.generatedAt !== null && (
      typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))
    ))
    || !exactKeys(value.channels, ['stable', 'rc'])
    || (value.channels.stable !== null && !trustedRelease(value.channels.stable, 'stable'))
    || (value.channels.rc !== null && !trustedRelease(value.channels.rc, 'rc'))
    || ((value.channels.stable !== null || value.channels.rc !== null) && value.generatedAt === null)
  ) throw new Error('Desktop Early Access manifest is unavailable.');
  return value;
}

export function exactReleasePage(version) {
  if (!VERSION_PATTERN.test(version)) throw new Error('Desktop release version is invalid.');
  return `${RELEASES_URL}/tag/v${version}`;
}

export function presentEarlyAccess(root, manifestValue) {
  const manifest = requireEarlyAccessManifest(manifestValue);
  const release = manifest.channels.rc;
  const status = root.querySelector('#desktop-early-access-status');
  const detail = root.querySelector('#desktop-early-access-detail');
  const link = root.querySelector('#desktop-early-access-link');
  if (release === null) return false;
  status.textContent = `Early Access ${release.version}`;
  status.dataset.state = 'available';
  detail.textContent = 'The universal macOS DMG is Developer ID signed, hardened, securely timestamped, notarized, stapled, and Gatekeeper accepted.';
  link.href = exactReleasePage(release.version);
  link.hidden = false;
  return true;
}

export async function initializeEarlyAccess({
  root = document,
  fetchFn = globalThis.fetch,
} = {}) {
  try {
    const response = await fetchFn('/releases/desktop.json', {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    return presentEarlyAccess(root, await response.json());
  } catch {
    return false;
  }
}

if (typeof document !== 'undefined') void initializeEarlyAccess();
