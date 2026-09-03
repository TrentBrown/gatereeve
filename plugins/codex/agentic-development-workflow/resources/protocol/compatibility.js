import { CompatibilityError, ContractError } from './errors.js';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(version) {
  const match = typeof version === 'string' ? SEMVER.exec(version) : null;
  if (!match) throw new ContractError(`Invalid semantic version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber < rightNumber ? -1 : 1;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function isVersionCompatible(version, compatibility) {
  if (!compatibility || typeof compatibility !== 'object') {
    throw new ContractError('Compatibility range must be an object');
  }
  return (
    compareVersions(version, compatibility.minimum) >= 0 &&
    compareVersions(version, compatibility.maximumExclusive) < 0
  );
}

export function assertVersionCompatible(version, compatibility) {
  if (!isVersionCompatible(version, compatibility)) {
    throw new CompatibilityError(
      `Protocol core ${version} is outside the model compatibility range ` +
        `[${compatibility.minimum}, ${compatibility.maximumExclusive})`,
      { coreVersion: version, compatibility }
    );
  }
}
