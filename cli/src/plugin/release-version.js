import { parseReleaseTag } from './release.js';

const PLUGIN_ID = 'agentic-development-workflow';
const MARKETPLACE_ID = 'quality-code';
const BUMP_TYPES = new Set(['patch', 'minor', 'major']);

function increment(value) {
  return (BigInt(value) + 1n).toString();
}

function baseParts(parsed) {
  const [major, minor, patch] = parsed.baseVersion.split('.');
  return { major, minor, patch };
}

function rcNumber(parsed) {
  const match = parsed.prerelease?.match(/^rc\.(0|[1-9]\d*)$/);
  return match?.[1] ?? null;
}

function comparePrerelease(left, right) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function compareReleaseTags(leftTag, rightTag) {
  const left = parseReleaseTag(leftTag);
  const right = parseReleaseTag(rightTag);
  const leftBase = left.baseVersion.split('.').map((part) => BigInt(part));
  const rightBase = right.baseVersion.split('.').map((part) => BigInt(part));
  for (let index = 0; index < leftBase.length; index += 1) {
    if (leftBase[index] !== rightBase[index]) {
      return leftBase[index] < rightBase[index] ? -1 : 1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function validateDeployedRelease(release) {
  let parsed;
  try {
    parsed = parseReleaseTag(release?.sourceTag ?? '');
  } catch {
    throw new Error('The deployed marketplace does not contain a valid release tag');
  }
  if (
    release?.schemaVersion !== 1 ||
    release.plugin !== PLUGIN_ID ||
    release.marketplace !== MARKETPLACE_ID ||
    release.version !== parsed.version ||
    !/^[0-9a-f]{40,64}$/.test(release.sourceCommit ?? '')
  ) {
    throw new Error(
      'The deployed marketplace release metadata is missing or internally inconsistent'
    );
  }
  return {
    schemaVersion: 1,
    tag: release.sourceTag,
    version: release.version,
    sourceCommit: release.sourceCommit,
    parsed,
  };
}

function nextRcTag(parsed) {
  const { major, minor, patch } = baseParts(parsed);
  if (parsed.prerelease === null) {
    return `v${major}.${minor}.${increment(patch)}-rc.1`;
  }
  const number = rcNumber(parsed);
  if (number === null) {
    throw new Error(`Next-RC requires a stable or rc.N baseline: v${parsed.version}`);
  }
  return `v${parsed.baseVersion}-rc.${increment(number)}`;
}

function promotedTag(parsed) {
  if (rcNumber(parsed) === null) {
    throw new Error(`Promotion requires an rc.N baseline: v${parsed.version}`);
  }
  return `v${parsed.baseVersion}`;
}

function bumpedTag(parsed, bump) {
  if (!BUMP_TYPES.has(bump)) {
    throw new Error(`Release bump must be patch, minor, or major: ${bump}`);
  }
  let { major, minor, patch } = baseParts(parsed);
  if (bump === 'major') {
    major = increment(major);
    minor = '0';
    patch = '0';
  } else if (bump === 'minor') {
    minor = increment(minor);
    patch = '0';
  } else {
    patch = increment(patch);
  }
  return `v${major}.${minor}.${patch}-rc.1`;
}

export function planReleaseVersion({
  deployedRelease = null,
  action,
  tag = null,
  bump = null,
}) {
  if (action === 'tag') {
    const parsed = parseReleaseTag(tag ?? '');
    return {
      schemaVersion: 1,
      baselineTag: deployedRelease?.sourceTag ?? null,
      action,
      tag: `v${parsed.version}`,
      sourceCommit: null,
      source: 'selected-commit',
    };
  }

  const baseline = validateDeployedRelease(deployedRelease);
  let proposedTag;
  let source = 'origin-main';
  let sourceCommit = null;
  if (action === 'next-rc') {
    proposedTag = nextRcTag(baseline.parsed);
  } else if (action === 'promote') {
    proposedTag = promotedTag(baseline.parsed);
    source = 'deployed-rc';
    sourceCommit = baseline.sourceCommit;
  } else if (action === 'bump') {
    proposedTag = bumpedTag(baseline.parsed, bump);
  } else {
    throw new Error(`Unsupported release action: ${action}`);
  }

  return {
    schemaVersion: 1,
    baselineTag: baseline.tag,
    action,
    bump: action === 'bump' ? bump : null,
    tag: proposedTag,
    sourceCommit,
    source,
  };
}

export function releaseChoices(deployedRelease) {
  const baseline = validateDeployedRelease(deployedRelease);
  const choices = [];
  if (baseline.parsed.prerelease === null) {
    choices.push({
      key: '1',
      label: 'Begin the next patch release candidate (recommended)',
      plan: planReleaseVersion({ deployedRelease, action: 'next-rc' }),
    });
  } else {
    choices.push({
      key: '1',
      label: 'Create the next release candidate (recommended)',
      plan: planReleaseVersion({ deployedRelease, action: 'next-rc' }),
    });
    if (rcNumber(baseline.parsed) !== null) {
      choices.push({
        key: '2',
        label: 'Promote the deployed release candidate',
        plan: planReleaseVersion({ deployedRelease, action: 'promote' }),
      });
    }
  }
  const usedKeys = new Set(choices.map((item) => item.key));
  let key = 2;
  const bumps = baseline.parsed.prerelease === null
    ? ['minor', 'major']
    : ['patch', 'minor', 'major'];
  for (const bump of bumps) {
    while (usedKeys.has(String(key))) key += 1;
    choices.push({
      key: String(key),
      label: `Begin a ${bump} release line`,
      plan: planReleaseVersion({ deployedRelease, action: 'bump', bump }),
    });
    usedKeys.add(String(key));
    key += 1;
  }
  while (usedKeys.has(String(key))) key += 1;
  choices.push({ key: String(key), label: 'Enter a custom tag', plan: null });
  return { baseline, choices };
}
