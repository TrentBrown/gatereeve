// @ts-check

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { requireSelectedAgents, requireSetupState } from '../shared/contracts.js';
import { discoverExecutable } from './executable-discovery.js';
import { classifySetupCompatibility, validateSetupCompatibility } from './setup-compatibility.js';

const execute = promisify(execFile);
const PLUGIN_ID = 'agentic-development-workflow@quality-code';
const AGENTS = Object.freeze({
  codex: Object.freeze({
    label: 'Codex',
    executable: 'codex',
    versionArguments: ['--version'],
    authArguments: ['login', 'status'],
    installCommand: 'codex plugin add agentic-development-workflow@quality-code',
    enableCommand: null,
    guideUrl: 'https://learn.chatgpt.com/docs/build-plugins',
  }),
  claude: Object.freeze({
    label: 'Claude Code',
    executable: 'claude',
    versionArguments: ['--version'],
    authArguments: ['auth', 'status'],
    installCommand: 'claude plugin install agentic-development-workflow@quality-code --scope user',
    enableCommand: 'claude plugin enable agentic-development-workflow@quality-code --scope user',
    guideUrl: 'https://code.claude.com/docs/en/discover-plugins',
  }),
});

const PREREQUISITES = Object.freeze([
  Object.freeze({
    id: 'git', label: 'Git', executable: 'git', arguments: ['--version'], minimum: null,
    installCommand: { darwin: 'brew install git', linux: 'sudo apt install -y git' },
    guideUrl: 'https://git-scm.com/downloads',
  }),
  Object.freeze({
    id: 'python', label: 'Python', executable: 'python3', arguments: ['--version'], minimum: '3.10.0',
    installCommand: { darwin: 'brew install python', linux: 'sudo apt install -y python3' },
    guideUrl: 'https://www.python.org/downloads/',
  }),
  Object.freeze({
    id: 'node', label: 'Node.js', executable: 'node', arguments: ['--version'], minimum: '22.12.0',
    installCommand: null, guideUrl: 'https://nodejs.org/en/download',
  }),
  Object.freeze({
    id: 'github', label: 'GitHub CLI', executable: 'gh', arguments: ['--version'], minimum: null,
    installCommand: { darwin: 'brew install gh', linux: 'sudo apt install -y gh' },
    guideUrl: 'https://cli.github.com/', authArguments: ['auth', 'status'],
  }),
]);

function remediation(summary, command, guideUrl) {
  return Object.freeze({ summary, command, guideUrl });
}

function installCommand(item, platform) {
  if (item.installCommand === null || typeof item.installCommand === 'string') {
    return item.installCommand;
  }
  return item.installCommand[platform] ?? null;
}

function output(error, field) {
  return typeof error?.[field] === 'string' ? error[field] : '';
}

async function command(exec, executable, arguments_) {
  try {
    const result = await exec(executable, arguments_, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    });
    return { ok: true, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (error) {
    return {
      ok: false,
      stdout: output(error, 'stdout'),
      stderr: output(error, 'stderr') || error?.message || 'Command failed',
    };
  }
}

function versionFrom(value) {
  return value.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null;
}

function numericVersion(value) {
  const match = value?.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? match.slice(1, 4).map((part) => Number(part ?? 0)) : null;
}

function atLeast(version, minimum) {
  if (minimum === null) return true;
  const actual = numericVersion(version);
  const expected = numericVersion(minimum);
  if (!actual || !expected) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) return actual[index] > expected[index];
  }
  return true;
}

function parseCodexPlugin(outputText) {
  const row = outputText.split(/\r?\n/).find((line) => line.trim().startsWith(PLUGIN_ID));
  if (!row) return { status: 'missing', version: null };
  const columns = row.trim().split(/\s{2,}/);
  const enabled = columns[1]?.includes('enabled') === true;
  return {
    status: enabled ? 'enabled' : 'disabled',
    version: versionFrom(columns[2] ?? row),
  };
}

function findClaudePlugin(value) {
  if (Array.isArray(value)) {
    return value.map(findClaudePlugin).find(Boolean) ?? null;
  }
  if (!value || typeof value !== 'object') return null;
  const identifier = value.id ?? value.name ?? value.plugin ?? value.fullName;
  if (identifier === PLUGIN_ID || identifier === 'agentic-development-workflow') return value;
  return Object.values(value).map(findClaudePlugin).find(Boolean) ?? null;
}

function parseClaudePlugin(outputText) {
  try {
    const plugin = findClaudePlugin(JSON.parse(outputText));
    if (!plugin) return { status: 'missing', version: null };
    const disabled = plugin.enabled === false || String(plugin.status ?? '').toLowerCase().includes('disabled');
    return {
      status: disabled ? 'disabled' : 'enabled',
      version: typeof plugin.version === 'string' ? plugin.version : versionFrom(JSON.stringify(plugin)),
    };
  } catch {
    const row = outputText.split(/\r?\n/).find((line) => line.includes('agentic-development-workflow'));
    if (!row) return { status: 'missing', version: null };
    return {
      status: /disabled/i.test(row) ? 'disabled' : 'enabled',
      version: versionFrom(row),
    };
  }
}

async function observePrerequisite(item, { exec, discover, executablePaths, platform }) {
  const executable = executablePaths[item.id] ?? await discover(item.executable);
  if (executable === null) {
    return {
      id: item.id,
      label: item.label,
      status: 'missing',
      version: null,
      detail: `${item.label} was not found in Finder-compatible locations.`,
      remediation: remediation(
        `Install ${item.label} with its native owner.`,
        installCommand(item, platform),
        item.guideUrl,
      ),
    };
  }
  const result = await command(exec, executable, item.arguments);
  const version = versionFrom(`${result.stdout}\n${result.stderr}`);
  if (!result.ok) {
    return {
      id: item.id, label: item.label, status: 'unavailable', version,
      detail: result.stderr.trim() || `${item.label} could not be checked.`,
      remediation: remediation(
        `Repair ${item.label}, then recheck Setup.`,
        installCommand(item, platform),
        item.guideUrl,
      ),
    };
  }
  if (!atLeast(version, item.minimum)) {
    return {
      id: item.id, label: item.label, status: 'incompatible', version,
      detail: `${item.label} ${version ?? 'with an unknown version'} does not satisfy ${item.minimum} or newer.`,
      remediation: remediation(
        `Update ${item.label} to ${item.minimum} or newer.`,
        installCommand(item, platform),
        item.guideUrl,
      ),
    };
  }
  if (item.authArguments) {
    const auth = await command(exec, executable, item.authArguments);
    if (!auth.ok) {
      return {
        id: item.id, label: item.label, status: 'unauthenticated', version,
        detail: 'GitHub CLI is installed but not authenticated for PR-boundary work.',
        remediation: remediation('Authenticate with GitHub CLI, then recheck Setup.', 'gh auth login', item.guideUrl),
      };
    }
  }
  return {
    id: item.id, label: item.label, status: 'present', version,
    detail: `${item.label}${version ? ` ${version}` : ''} is available.`, remediation: null,
  };
}

async function observeAgent(id, { exec, discover, metadata }) {
  const definition = AGENTS[id];
  const executable = await discover(definition.executable);
  if (executable === null) {
    return {
      id, label: definition.label, status: 'incomplete',
      cli: {
        status: 'missing', version: null, authenticated: null,
        detail: `${definition.label} was not found in Finder-compatible locations.`,
        remediation: remediation(`Install and authenticate ${definition.label}.`, null, definition.guideUrl),
      },
      plugin: {
        status: 'not-checked', version: null, compatibility: 'not-checked', evidence: null,
        detail: 'Plugin installation was not checked because the selected agent is missing.',
        recommendation: null, remediation: null,
      },
    };
  }
  const [versionResult, authResult] = await Promise.all([
    command(exec, executable, definition.versionArguments),
    command(exec, executable, definition.authArguments),
  ]);
  const cliVersion = versionFrom(`${versionResult.stdout}\n${versionResult.stderr}`);
  const cli = {
    status: versionResult.ok ? 'present' : 'unavailable',
    version: cliVersion,
    authenticated: authResult.ok,
    detail: versionResult.ok
      ? `${definition.label}${cliVersion ? ` ${cliVersion}` : ''} is ${authResult.ok ? '' : 'not '}authenticated.`
      : versionResult.stderr.trim() || `${definition.label} could not be checked.`,
    remediation: authResult.ok && versionResult.ok
      ? null
      : remediation(
        versionResult.ok ? `Authenticate ${definition.label}, then recheck Setup.` : `Repair ${definition.label}, then recheck Setup.`,
        id === 'codex' ? 'codex login' : 'claude',
        definition.guideUrl,
      ),
  };
  let pluginResult;
  if (id === 'codex') {
    const listing = await command(exec, executable, ['plugin', 'list', '--marketplace', 'quality-code']);
    pluginResult = listing.ok
      ? parseCodexPlugin(listing.stdout)
      : { status: 'missing', version: null };
  } else {
    let listing = await command(exec, executable, ['plugin', 'list', '--json']);
    if (!listing.ok) listing = await command(exec, executable, ['plugin', 'list']);
    pluginResult = listing.ok
      ? parseClaudePlugin(listing.stdout)
      : { status: 'missing', version: null };
  }
  const compatibility = pluginResult.status === 'enabled'
    ? pluginResult.version === null
      ? Object.freeze({
        state: 'incompatible',
        evidence: null,
        recommendation: `Update or reinstall ${metadata.plugin.displayName}.`,
        detail: 'The Plugin manager did not report an exact version, so no tested pair can be proven.',
      })
      : classifySetupCompatibility(metadata, pluginResult.version)
    : classifySetupCompatibility(metadata, null);
  const pluginRemediation = pluginResult.status === 'missing'
    ? remediation('Install the GateReeve Plugin with the selected agent manager.', definition.installCommand, definition.guideUrl)
    : pluginResult.status === 'disabled'
      ? remediation(
        'Enable the GateReeve Plugin with the selected agent manager, then start a fresh session.',
        definition.enableCommand,
        definition.guideUrl,
      )
      : compatibility.state === 'incompatible'
        ? remediation(compatibility.recommendation, definition.installCommand, definition.guideUrl)
        : compatibility.state === 'not-checked'
          ? remediation(
            'Update or reinstall the GateReeve Plugin so its exact version can be verified.',
            definition.installCommand,
            definition.guideUrl,
          )
        : null;
  const ready = cli.status === 'present'
    && cli.authenticated === true
    && pluginResult.status === 'enabled'
    && ['matched', 'compatible'].includes(compatibility.state);
  return {
    id,
    label: definition.label,
    status: ready ? 'ready' : 'incomplete',
    cli,
    plugin: {
      status: pluginResult.status,
      version: pluginResult.version,
      compatibility: compatibility.state,
      evidence: compatibility.evidence,
      detail: compatibility.state === 'not-checked'
        ? `The GateReeve Plugin is ${pluginResult.status === 'disabled' ? 'disabled' : 'not installed'}.`
        : compatibility.detail,
      recommendation: compatibility.recommendation,
      remediation: pluginRemediation,
    },
  };
}

export function createUnconfiguredSetup(metadata) {
  const value = validateSetupCompatibility(metadata);
  return requireSetupState({
    schemaVersion: 1,
    phase: 'unconfigured',
    operationalReady: false,
    checkedAt: null,
    desktop: { version: value.desktop.version },
    selectedAgents: [],
    prerequisites: [],
    agents: [],
  });
}

export function createSetupObserver({
  metadata,
  exec = execute,
  discover = discoverExecutable,
  executablePaths = {},
  platform = process.platform,
  now = () => new Date(),
} = {}) {
  const compatibilityMetadata = validateSetupCompatibility(metadata);
  return async function observeSetup(selectedAgents) {
    const selected = requireSelectedAgents(selectedAgents);
    if (selected.length === 0) return createUnconfiguredSetup(compatibilityMetadata);
    const prerequisites = await Promise.all(PREREQUISITES.map((item) => observePrerequisite(item, {
      exec, discover, executablePaths, platform,
    })));
    const agents = [];
    for (const id of selected) {
      agents.push(await observeAgent(id, { exec, discover, metadata: compatibilityMetadata }));
    }
    const operationalReady = prerequisites.every((item) => item.status === 'present')
      && agents.every((agent) => agent.status === 'ready');
    return requireSetupState({
      schemaVersion: 1,
      phase: operationalReady ? 'ready' : 'incomplete',
      operationalReady,
      checkedAt: now().toISOString(),
      desktop: { version: compatibilityMetadata.desktop.version },
      selectedAgents: selected,
      prerequisites,
      agents,
    });
  };
}
