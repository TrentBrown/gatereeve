import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, human, openPr } from './helpers/lightweight-fixture.js';
import { preToolUse, questionGuard, QUESTION_TOOLS } from '../../plugin-src/shared/resources/protocol/current/pre-tool-use.js';
import { stopHook, STALL_LIMIT } from '../../plugin-src/shared/resources/protocol/current/stop.js';

const mandate = { goal: 'Export the constant answer.', constraints: [] };
const goal = f => f.request('run.set-dial', { dial: 'autonomy', value: 'goal', actor: 'human', runId: 'run-one',
  authority: { ...human, instruction: 'Goal mode for run-one.' }, reason: 'Unattended', mandate }, 'goal');
const runtimeFor = f => ({ contextFor: async () => f.context, core: { gh: f.core.runtime.gh } });
const ask = tool_name => ({ hook_event_name: 'PreToolUse', tool_name, cwd: '/unused', tool_input: { questions: [] } });

test('both native manifests route the question tools and the Stop event to the shared handlers', async () => {
  for (const host of ['codex', 'claude']) {
    const hooks = JSON.parse(await readFile(new URL(`../../plugin-src/${host}/hooks/hooks.json`, import.meta.url)));
    const question = hooks.hooks.PreToolUse.find(entry => entry.matcher.split('|').includes('AskUserQuestion'));
    assert.ok(question, `${host} routes AskUserQuestion`);
    assert.deepEqual(question.matcher.split('|').sort(), [...QUESTION_TOOLS].sort());
    assert.match(question.hooks[0].command, /current\/pre-tool-use.js/u);
    assert.match(hooks.hooks.Stop[0].hooks[0].command, /current\/stop.js/u);
    assert.match(hooks.hooks.PreToolUse[0].matcher, /Bash\|exec_command/u, 'the shell guard entry is unchanged');
  }
  const contracts = JSON.parse(await readFile(new URL('../../plugin-src/contracts/platform-contracts.json', import.meta.url)));
  for (const host of ['codex', 'claudeCode']) assert.equal(contracts[host].goalAutonomy.stopHook, true);
});

test('the question guard denies only a goal run without an active park and fails open', async t => {
  const f = await fixture(t);
  const runtime = runtimeFor(f);
  for (const tool of QUESTION_TOOLS) assert.deepEqual(await preToolUse(ask(tool), runtime), {}, 'supervised runs may ask');
  await goal(f);
  for (const tool of QUESTION_TOOLS) {
    const decision = (await preToolUse(ask(tool), runtime)).hookSpecificOutput;
    assert.equal(decision.permissionDecision, 'deny');
    assert.match(decision.permissionDecisionReason, /Answered by: agent/u);
  }
  assert.deepEqual(await preToolUse({ cwd: '/unused', tool_name: 'Bash', tool_input: { command: 'npm test' } }, runtime), {}, 'shell guard unchanged');
  openPr(f, 'topic', f.release, f.base, 'Blocked: Needs credentials.');
  await f.request('goal.park', { pr: { repository: 'app', number: 12 }, blockers: ['Needs credentials.'], evidence: ['Deploy needs a secret.'] }, 'park');
  assert.deepEqual(await preToolUse(ask('AskUserQuestion'), runtime), {}, 'a recorded park admits the question');
  assert.deepEqual(await questionGuard(ask('AskUserQuestion'), { contextFor: async () => { throw new Error('unreadable'); } }), {});
});

test('the Stop hook blocks a goal run until it reaches a terminal state, with a stall valve', async t => {
  const f = await fixture(t);
  const runtime = { ...runtimeFor(f), stallDirectory: await mkdtemp(join(tmpdir(), 'gatereeve-stop-')) };
  assert.deepEqual(await stopHook({ cwd: '/unused' }, runtime), {}, 'a supervised run may stop');
  await goal(f);
  const blocked = await stopHook({ cwd: '/unused' }, runtime);
  assert.equal(blocked.decision, 'block');
  assert.match(blocked.reason, /goal\.terminal/u);
  assert.match(blocked.reason, /Current state: phase /u);
  for (let count = 2; count <= STALL_LIMIT; count += 1) assert.equal((await stopHook({ cwd: '/unused' }, runtime)).decision, 'block');
  assert.deepEqual(await stopHook({ cwd: '/unused' }, runtime), {}, 'repeated blocks with no recorded progress admit the stop');
  openPr(f, 'topic', f.release, f.base, 'Blocked: Needs credentials.');
  await f.request('goal.park', { pr: { repository: 'app', number: 12 }, blockers: ['Needs credentials.'], evidence: ['Deploy needs a secret.'] }, 'park');
  assert.deepEqual(await stopHook({ cwd: '/unused' }, runtime), {}, 'a parked goal run may stop');
  await f.request('run.continue', { authority: { ...human, instruction: 'Carry on.' } }, 'continue');
  assert.equal((await stopHook({ cwd: '/unused' }, runtime)).decision, 'block', 'progress resets the stall valve');
  assert.deepEqual(await stopHook({ cwd: '/unused' }, { contextFor: async () => { throw new Error('unreadable'); } }), {});
});
