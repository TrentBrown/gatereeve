# Actual CLI shortcut reproduction

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {currentFixture} from '/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/cli/test/helpers/current-fixture.js';
import {establishCurrentRun} from '/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/cli/test/helpers/established-current-run.js';
const exec=promisify(execFile), cli='/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/cli/bin/workflow.js';
test('documented checks CLI cannot express mandatory external declaration',async t=>{
 const f=await currentFixture(t);await establishCurrentRun(f.core);
 const checks=[{repository:'app',command:process.execPath,args:['-e','process.exit(0)'],purpose:'Declared dependency-free fixture'}];
 const cp=join(f.root,'checks.json'),config=join(f.root,'config.json');await writeFile(cp,JSON.stringify(checks));await writeFile(config,JSON.stringify({checks,externalRuntimeInputs:{app:[]}}));
 let result;try{result=await exec(process.execPath,[cli,'evaluate','verification','--checks',cp,'--cwd',f.repo,'--json']);}catch(e){result=e;}
 assert.equal(result.code,1);const failed=JSON.parse(result.stdout);assert.match(failed.error.message,/externalRuntimeInputs/);console.log(JSON.stringify({checksExit:1,message:failed.error.message}));
 const passed=await exec(process.execPath,[cli,'evaluate','verification','--configuration',config,'--cwd',f.repo,'--json']);assert.equal(JSON.parse(passed.stdout).ok,true);console.log(JSON.stringify({fullConfigurationSuccess:true}));
});

```

```text
{"checksExit":1,"message":"Runner requires explicit externalRuntimeInputs for each checked repository (an empty list declares no additional external inputs)"}
{"fullConfigurationSuccess":true}
✔ documented checks CLI cannot express mandatory external declaration (2396.25725ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2439.843291

```
