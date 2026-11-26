import './helpers/private-scratch.js';
// Issue #146 small fixes: paginated gh reads without --slurp, and the
// slice-1 escalation's PID-reuse guard.
import assert from 'node:assert/strict';
import test from 'node:test';
import { paginatedItems } from '../../plugin-src/shared/resources/protocol/current/validation-scope.js';
import { escalationRoots } from '../../plugin-src/shared/resources/protocol/local-agent-adapters.js';

test('paginated gh reads use --paginate --jq (no --slurp) and join every page', async () => {
  const calls = [];
  const run = async (executable, args) => {
    calls.push([executable, ...args]);
    // gh prints one compact JSON value per line, page after page.
    return { stdout: '{"id":1,"name":"a"}\n{"id":2,"name":"b"}\n{"id":3,"name":"c"}\n' };
  };
  assert.deepEqual(await paginatedItems(run, 'repos/o/r/actions/runs/1/attempts/1/jobs?per_page=100', 'jobs'),
    [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]);
  assert.deepEqual(calls, [['gh', 'api', 'repos/o/r/actions/runs/1/attempts/1/jobs?per_page=100', '--paginate', '--jq', '.jobs[]']]);
  assert.ok(!calls[0].includes('--slurp'));
  assert.deepEqual(await paginatedItems(async () => ({ stdout: '' }), 'p', 'jobs'), [], 'no jobs is an empty list');
});

test('escalation walks only roots that are still the recorded process', () => {
  const recorded = [{ pid: 11, started: '100' }, { pid: 12, started: '200' }, { pid: 13, started: '300' }];
  const table = { 11: { started: '100' }, 12: { started: '999' } }; // 12 was reused, 13 is gone
  const stat = pid => table[pid] ?? null;
  assert.deepEqual(escalationRoots({ pid: 10, exitCode: null, signalCode: null }, recorded, stat), [10, 11]);
  // Once Node has reaped the tracked child its PID may belong to anyone.
  assert.deepEqual(escalationRoots({ pid: 10, exitCode: 0, signalCode: null }, recorded, stat), [11]);
  assert.deepEqual(escalationRoots({ pid: 10, exitCode: null, signalCode: 'SIGTERM' }, [], stat), []);
});
