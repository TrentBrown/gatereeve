import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { currentFixture } from './helpers/current-fixture.js';
import { preToolUse } from '../../plugin-src/shared/resources/protocol/current/pre-tool-use.js';

test('native manifests select the shared handler; subprocess payloads produce deny without claiming host interception', async t => {
  const f = await currentFixture(t);
  await f.request('run.start', { implementers: ['implementer'], runId: 'hook-test' }, 'hook-start');
  for (const host of ['codex', 'claude']) {
    const hooks = JSON.parse(await readFile(new URL(`../../plugin-src/${host}/hooks/hooks.json`, import.meta.url)));
    const handler = hooks.hooks.PreToolUse[0].hooks[0];
    assert.match(handler.command, /current\/pre-tool-use.js/u);
    const output = execFileSync(process.execPath, [new URL('../../plugin-src/shared/resources/protocol/current/pre-tool-use.js', import.meta.url).pathname], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: host === 'claude' ? 'Bash' : 'exec_command', cwd: f.repo, tool_input: host === 'claude' ? { command: 'gh pr merge 12' } : { cmd: 'gh -R fixture/repo pr merge 12' } }), encoding: 'utf8',
    });
    const decision = JSON.parse(output).hookSpecificOutput;
    assert.equal(decision.hookEventName, 'PreToolUse'); assert.equal(decision.permissionDecision, 'deny');
    assert.match(decision.permissionDecisionReason, /Merge milestone is blocked/u);
  }
  assert.deepEqual(await preToolUse({ cwd: f.repo, tool_input: { cmd: 'git commit -m repair' } }), {});
  assert.deepEqual(await preToolUse({ cwd: f.repo, tool_input: { cmd: 'npm test' } }), {});
  const missing = await preToolUse({ cwd: '/path-that-does-not-exist', tool_input: { cmd: 'gh pr merge 12' } });
  assert.equal(missing.hookSpecificOutput.permissionDecision, 'deny');
});


test('configured missing feature records deny direct merging', async t => {
  const f = await currentFixture(t);
  await rm(f.home, { recursive: true });
  for (const tool_input of [{ cmd: 'gh pr merge 12' }, { command: 'gh pr merge 12' }]) {
    const decision = await preToolUse({ cwd: f.repo, tool_input });
    assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(decision.hookSpecificOutput.permissionDecisionReason, /could not validate/);
  }
});
