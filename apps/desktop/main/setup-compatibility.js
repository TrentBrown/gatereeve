// @ts-check

const PAIR_STATES = new Set(['matched', 'compatible']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function validateSetupCompatibility(value) {
  if (
    !object(value)
    || !exactKeys(value, ['schemaVersion', 'desktop', 'plugin', 'testedPairs'])
    || value.schemaVersion !== 1
    || !object(value.desktop)
    || !exactKeys(value.desktop, ['version'])
    || typeof value.desktop.version !== 'string'
    || value.desktop.version.length === 0
    || !object(value.plugin)
    || !exactKeys(value.plugin, ['id', 'displayName'])
    || typeof value.plugin.id !== 'string'
    || typeof value.plugin.displayName !== 'string'
    || !Array.isArray(value.testedPairs)
  ) {
    throw new Error('GateReeve setup compatibility metadata is invalid.');
  }
  const keys = new Set();
  for (const pair of value.testedPairs) {
    if (
      !object(pair)
      || !exactKeys(pair, ['desktopVersion', 'pluginVersion', 'state', 'evidence'])
      || typeof pair.desktopVersion !== 'string'
      || typeof pair.pluginVersion !== 'string'
      || !PAIR_STATES.has(pair.state)
      || typeof pair.evidence !== 'string'
      || pair.evidence.length === 0
      || (pair.state === 'matched' && pair.desktopVersion !== pair.pluginVersion)
      || (pair.state === 'compatible' && pair.desktopVersion === pair.pluginVersion)
    ) {
      throw new Error('GateReeve setup compatibility pair is invalid.');
    }
    const key = `${pair.desktopVersion}\0${pair.pluginVersion}`;
    if (keys.has(key)) throw new Error('GateReeve setup compatibility pairs must be unique.');
    keys.add(key);
  }
  return value;
}

export function classifySetupCompatibility(metadata, pluginVersion) {
  const value = validateSetupCompatibility(metadata);
  if (typeof pluginVersion !== 'string' || pluginVersion.length === 0) {
    return Object.freeze({
      state: 'not-checked',
      evidence: null,
      recommendation: null,
      detail: 'Plugin compatibility cannot be checked until its exact version is available.',
    });
  }
  const pair = value.testedPairs.find((candidate) => (
    candidate.desktopVersion === value.desktop.version
    && candidate.pluginVersion === pluginVersion
  ));
  if (!pair) {
    return Object.freeze({
      state: 'incompatible',
      evidence: null,
      recommendation: `Install ${value.plugin.displayName} ${value.desktop.version}.`,
      detail: `Desktop ${value.desktop.version} and Plugin ${pluginVersion} are not an explicitly tested pair.`,
    });
  }
  if (pair.state === 'matched') {
    return Object.freeze({
      state: 'matched',
      evidence: pair.evidence,
      recommendation: null,
      detail: `Desktop and Plugin are the coordinated ${value.desktop.version} release.`,
    });
  }
  return Object.freeze({
    state: 'compatible',
    evidence: pair.evidence,
    recommendation: `Update the Plugin to ${value.desktop.version} when convenient.`,
    detail: `Desktop ${value.desktop.version} and Plugin ${pluginVersion} are explicitly tested together.`,
  });
}
