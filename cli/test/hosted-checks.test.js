import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForHostedChecks } from '../../plugin-src/shared/resources/protocol/current/actions.js';

const action = { number: 12, ownerRepo: 'fixture/project', headBranch: 'topic' };
const required = ['pr', 'checks', '12', '--repo', 'fixture/project', '--required', '--watch', '--fail-fast'];
const all = required.filter(arg => arg !== '--required');
function noRequired(overrides = {}) {
  return Object.assign(new Error('gh checks failed'), {
    code: 1, stdout: '', stderr: "no required checks reported on the 'topic' branch\n",
  }, overrides);
}

test('successful required checks preserve configured-required behavior', async () => {
  const calls = [];
  await waitForHostedChecks('/repository', action, async (root, args) => {
    assert.equal(root, '/repository'); calls.push(args); return 'required CI passed';
  });
  assert.deepEqual(calls, [required]);
});

test('empty required-check set watches all reported checks to completion', async () => {
  const calls = [];
  let finish;
  const completion = new Promise(resolve => { finish = resolve; });
  let entered;
  const watching = new Promise(resolve => { entered = resolve; });
  let settled = false;
  const result = waitForHostedChecks('/repository', action, async (root, args) => {
    assert.equal(root, '/repository'); calls.push(args);
    if (args.includes('--required')) throw noRequired();
    entered(); await completion;
  }).then(() => { settled = true; });
  await watching;
  assert.equal(settled, false);
  assert.deepEqual(calls, [required, all]);
  finish(); await result;
  assert.equal(settled, true);
});

for (const [name, error] of [
  ['failed required CI', noRequired({ stdout: 'unit tests\tfail\n', stderr: '' })],
  ['pending checks', noRequired({ code: 8 })],
  ['authentication failure', noRequired({ stderr: 'HTTP 401: Bad credentials\n' })],
  ['API failure', noRequired({ stderr: 'HTTP 502: Bad Gateway\n' })],
  ['transport failure', noRequired({ code: 'ECONNRESET' })],
  ['signal termination', noRequired({ code: null, signal: 'SIGTERM' })],
  ['missing stdout', noRequired({ stdout: undefined })],
  ['missing stderr', noRequired({ stderr: undefined })],
  ['unexpected output', noRequired({ stdout: 'unexpected\n' })],
  ['wrong branch', noRequired({ stderr: "no required checks reported on the 'other' branch\n" })],
  ['additional diagnostic', noRequired({ stderr: "no required checks reported on the 'topic' branch\nHTTP 403\n" })],
  ['unrecognized message', noRequired({ stderr: 'no required checks\n' })],
]) test(`${name} never triggers the empty-required fallback`, async () => {
  const calls = [];
  await assert.rejects(waitForHostedChecks('/repository', action, async (root, args) => {
    calls.push(args); throw error;
  }), actual => actual === error);
  assert.deepEqual(calls, [required]);
});

for (const [name, error] of [
  ['failed fallback CI', noRequired({ stdout: 'unit tests\tfail\n', stderr: '' })],
  ['pending fallback CI', noRequired({ code: 8, stderr: '' })],
  ['fallback API failure', noRequired({ stderr: 'HTTP 502: Bad Gateway\n' })],
  ['wrong-branch no-CI response', noRequired({ stderr: "no checks reported on the 'other' branch\n" })],
  ['no-CI response with unexpected output', noRequired({ stdout: 'unexpected\n', stderr: "no checks reported on the 'topic' branch\n" })],
  ['no-CI response with pending exit code', noRequired({ code: 8, stderr: "no checks reported on the 'topic' branch\n" })],
  ['no-CI response with extra diagnostic', noRequired({ stderr: "no checks reported on the 'topic' branch\nHTTP 403\n" })],
  ['required-only emptiness from unfiltered query', noRequired()],
]) test(`${name} remains blocking with the original diagnostic`, async () => {
  const calls = [];
  await assert.rejects(waitForHostedChecks('/repository', action, async (root, args) => {
    calls.push(args);
    if (args.includes('--required')) throw noRequired();
    throw error;
  }), actual => actual === error);
  assert.deepEqual(calls, [required, all]);
});

for (const initial of ['no required checks', 'no checks']) test(`${initial} requires unfiltered confirmation before allowing no CI`, async () => {
  const calls = [];
  await waitForHostedChecks('/repository', action, async (root, args) => {
    calls.push(args);
    throw noRequired({ stderr: `${args.includes('--required') ? initial : 'no checks'} reported on the 'topic' branch\n` });
  });
  assert.deepEqual(calls, [required, all]);
});

for (const fails of [false, true]) test(`checks appearing after initial no-CI response are ${fails ? 'blocking when failed' : 'watched normally'}`, async () => {
  const calls = [];
  const failure = noRequired({ stdout: 'new check\tfail\n', stderr: '' });
  const result = waitForHostedChecks('/repository', action, async (root, args) => {
    calls.push(args);
    if (args.includes('--required')) throw noRequired({ stderr: "no checks reported on the 'topic' branch\n" });
    if (fails) throw failure;
  });
  if (fails) await assert.rejects(result, error => error === failure);
  else await result;
  assert.deepEqual(calls, [required, all]);
});
