import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executionEnvironment, environmentChanges, assertEnvironmentCurrent } from '../../plugin-src/shared/resources/protocol/current/environment.js';
import { runnerEnvironment } from '../../plugin-src/shared/resources/protocol/current/runner-profile.js';
import { runCheckProcess } from '../../plugin-src/shared/resources/protocol/current/execution.js';

// Removed dependency-cache tests are replaced by the new no-traversal contract.
test('execution context never traverses dependency or declared runtime trees', async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(),'execution-context-')));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const context={featureHome:home,repositories:[{alias:'app',path:home}]}, candidate={repositories:[{alias:'app',head:'a'.repeat(40)}]};
  await mkdir(join(home,'huge-tool-output'));
  await symlink(home,join(home,'huge-tool-output','cycle'));
  const config={externalRuntimeInputs:{app:[join(home,'huge-tool-output')]},environment:{inherit:['DECLARED_SETTING']}};
  const environment={PATH:process.env.PATH,DECLARED_SETTING:'before'};
  const before=await executionEnvironment(context,candidate,config,true,environment);
  await writeFile(join(home,'huge-tool-output','arbitrary-generated-tool-file'),'changed');
  assert.deepEqual(await executionEnvironment(context,candidate,config,true,environment),before);
  assert.equal(before.assurance.includes('not snapshotted'),true);
  const changed=await executionEnvironment(context,candidate,config,true,{...environment,DECLARED_SETTING:'after'});
  assert.deepEqual(environmentChanges(before,changed),[{kind:'effectiveEnvironment'}]);
  assert.throws(()=>assertEnvironmentCurrent(before,changed),/context changed/);
  assert.equal(JSON.stringify(changed).includes('after'),false);
  const source=await executionEnvironment(context,{repositories:[{alias:'app',head:'b'.repeat(40)}]},config,true,environment);
  assert.deepEqual(environmentChanges(before,source),[], 'Source is independently qualified through the candidate contract');
  assert.deepEqual(await executionEnvironment(context,candidate,config,false,environment),{kind:'pinned-review-inputs'});
});

test('controlled profile executes additions and strips incidental host inputs', async () => {
  const configuration = { environment: { inherit: ['PROJECT_SETTING'], required: ['PROJECT_SETTING'], publicValues: { FIXED_SETTING: 'fixed' } } };
  assert.throws(() => runnerEnvironment(configuration, {}), /PROJECT_SETTING/);
  const env = runnerEnvironment(configuration, { PATH: process.env.PATH, PROJECT_SETTING: 'project', INCIDENTAL: 'agent-session' });
  const result = await runCheckProcess({ command: process.execPath, args: ['-e', 'console.log(JSON.stringify([process.env.PROJECT_SETTING,process.env.FIXED_SETTING,process.env.INCIDENTAL]))'] }, configuration, process.cwd(), env);
  assert.equal(result.outcome, 'PASS');
  assert.deepEqual(JSON.parse(result.stdout), ['project', 'fixed', null]);
});

test('ambiguous private literal values are rejected before a profile can be retained', () => {
  assert.throws(() => runnerEnvironment({environment:{values:{PASSWORD:'private'}}}), /inherit.*publicValues/);
  assert.equal(runnerEnvironment({environment:{publicValues:{NODE_ENV:'test'}}}).NODE_ENV, 'test');
});
