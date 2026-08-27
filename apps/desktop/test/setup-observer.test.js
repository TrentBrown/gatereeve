import assert from 'node:assert/strict';
import test from 'node:test';

import { createSetupObserver } from '../main/setup-observer.js';

const metadata = {
  schemaVersion: 1,
  desktop: { version: '0.1.0' },
  plugin: {
    id: 'agentic-development-workflow@quality-code',
    displayName: 'Agentic Software Development Workflow',
  },
  testedPairs: [
    { desktopVersion: '0.1.0', pluginVersion: '0.1.0', state: 'matched', evidence: 'release' },
    { desktopVersion: '0.1.0', pluginVersion: '0.1.0-rc.2', state: 'compatible', evidence: 'portable' },
  ],
};

function successfulExec(calls) {
  return async (executable, args) => {
    calls.push([executable, ...args]);
    const name = executable.split('/').at(-1);
    if (name === 'git') return { stdout: 'git version 2.53.0\n', stderr: '' };
    if (name === 'python3') return { stdout: 'Python 3.14.4\n', stderr: '' };
    if (name === 'node') return { stdout: 'v24.19.0\n', stderr: '' };
    if (name === 'gh') {
      return args[0] === 'auth'
        ? { stdout: 'Logged in\n', stderr: '' }
        : { stdout: 'gh version 2.98.0\n', stderr: '' };
    }
    if (name === 'codex') {
      if (args[0] === '--version') return { stdout: 'codex-cli 0.150.1\n', stderr: '' };
      if (args[0] === 'login') return { stdout: 'Logged in using ChatGPT\n', stderr: '' };
      return {
        stdout: 'PLUGIN                                     STATUS              VERSION     PATH\nagentic-development-workflow@quality-code  installed, enabled  0.1.0-rc.2  /plugin\n',
        stderr: '',
      };
    }
    throw new Error(`Unexpected executable: ${name}`);
  };
}

test('observer checks only selected agents and accepts only an explicit compatible pair', async () => {
  const calls = [];
  const discovered = [];
  const observer = createSetupObserver({
    metadata,
    exec: successfulExec(calls),
    async discover(name) { discovered.push(name); return `/bin/${name}`; },
    now: () => new Date('2026-08-27T12:00:00Z'),
  });
  const setup = await observer(['codex']);
  assert.equal(setup.operationalReady, true);
  assert.equal(setup.agents[0].plugin.compatibility, 'compatible');
  assert.equal(setup.agents[0].plugin.evidence, 'portable');
  assert.equal(discovered.includes('codex'), true);
  assert.equal(discovered.includes('claude'), false);
  assert.equal(calls.some((call) => call.some((part) => /install|enable|disable|remove|upgrade/.test(part))), false);
  assert.equal(calls.some((call) => call[0].endsWith('/gatereeve')), false);
});

test('unknown Plugin versions fail readiness while historical reading remains a UI concern', async () => {
  const calls = [];
  const exec = successfulExec(calls);
  const observer = createSetupObserver({
    metadata,
    exec: async (executable, args) => {
      const result = await exec(executable, args);
      if (executable.endsWith('/codex') && args[0] === 'plugin') {
        return {
          stdout: 'PLUGIN                                     STATUS              VERSION     PATH\nagentic-development-workflow@quality-code  installed, enabled  0.1.1  /plugin\n',
          stderr: '',
        };
      }
      return result;
    },
    async discover(name) { return `/bin/${name}`; },
  });
  const setup = await observer(['codex']);
  assert.equal(setup.operationalReady, false);
  assert.equal(setup.agents[0].plugin.compatibility, 'incompatible');
  assert.match(setup.agents[0].plugin.detail, /not an explicitly tested pair/);
});

test('an enabled Plugin without an exact manager-reported version is incompatible', async () => {
  const common = successfulExec([]);
  const observer = createSetupObserver({
    metadata,
    exec: async (executable, args) => {
      if (executable.endsWith('/claude')) {
        if (args[0] === '--version') return { stdout: '2.1.63 (Claude Code)\n', stderr: '' };
        if (args[0] === 'auth') return { stdout: 'authenticated\n', stderr: '' };
        return {
          stdout: JSON.stringify([{ name: 'agentic-development-workflow@quality-code', enabled: true }]),
          stderr: '',
        };
      }
      return common(executable, args);
    },
    async discover(name) { return `/bin/${name}`; },
  });
  const setup = await observer(['claude']);
  assert.equal(setup.operationalReady, false);
  assert.equal(setup.agents[0].plugin.status, 'enabled');
  assert.equal(setup.agents[0].plugin.compatibility, 'incompatible');
  assert.match(setup.agents[0].plugin.detail, /exact version/);
});

test('unselected agents are not probed when a selected agent is missing', async () => {
  const discovered = [];
  const observer = createSetupObserver({
    metadata,
    exec: successfulExec([]),
    async discover(name) {
      discovered.push(name);
      return name === 'claude' ? null : `/bin/${name}`;
    },
  });
  const setup = await observer(['claude']);
  assert.equal(setup.operationalReady, false);
  assert.equal(setup.agents[0].cli.status, 'missing');
  assert.equal(discovered.includes('codex'), false);
});

test('shared prerequisite remediation follows the host-native package owner', async () => {
  for (const [platform, expected] of [
    ['darwin', 'brew install git'],
    ['linux', 'sudo apt install -y git'],
  ]) {
    const observer = createSetupObserver({
      metadata,
      platform,
      exec: successfulExec([]),
      async discover(name) { return name === 'git' ? null : `/bin/${name}`; },
    });
    const setup = await observer(['codex']);
    const git = setup.prerequisites.find((item) => item.id === 'git');
    assert.equal(git.status, 'missing');
    assert.equal(git.remediation.command, expected);
    assert.equal(setup.operationalReady, false);
  }
});
