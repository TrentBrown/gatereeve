# Independent repair probe

Disposable read-only evaluation, separate from formal verdicts.

```javascript
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const source='/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input';
const native=await import(source+'/plugin-src/shared/resources/protocol/python-guards.js');
const desktop=await import(source+'/apps/desktop/resources/protocol/python-guards.js');
const {currentFixture}=await import(source+'/cli/test/helpers/current-fixture.js');
const {establishCurrentRun}=await import(source+'/cli/test/helpers/established-current-run.js');
const {createProtocolAdapter}=await import(source+'/apps/desktop/main/protocol-adapter.js');
const f=await currentFixture({after(){}});const py='/opt/homebrew/bin/python3';const options={pythonExecutable:py};
const proof=await native.runTrustedPythonGuard('spec.validation.current',[f.home],options);assert.equal(proof.passed,true);await native.assertTrustedPythonProof(proof,options);await desktop.assertTrustedPythonProof(proof,options);const d=await desktop.trustedPythonBinding('spec.validation.current',options);assert.deepEqual(proof.binding,d);
console.log(JSON.stringify({case:'F1-repaired',native:'PASS',desktop:'PASS',helpers:proof.binding.helpers.length}));
const root=await mkdtemp(join(tmpdir(),'gr-validator-env-isolation-'));const helpers=join(root,'helpers');await cp(source+'/plugin-src/shared/resources/scripts',helpers,{recursive:true});await writeFile(join(helpers,'lint_spec.py'),"import os,json\nprint(json.dumps(dict(os.environ),sort_keys=True))\n");
const custom={pythonExecutable:py,helperRoot:helpers,environment:{...process.env,GATEREEVE_OBSERVER_WINDOW_ID:'window-one',PYTHONPATH:'/untrusted',PYTHONHOME:'/untrusted'}};
const executed=await native.runTrustedPythonGuard('spec.validation.current',[f.home],custom);assert.equal(executed.passed,true,executed.stderr);const actual=JSON.parse(executed.stdout);assert.equal(actual.GATEREEVE_OBSERVER_WINDOW_ID,undefined);assert.equal(actual.PYTHONPATH,undefined);assert.equal(actual.PYTHONHOME,undefined);assert.equal(actual.LANG,'C');assert.equal(actual.LC_ALL,'C');await native.assertTrustedPythonProof(executed,{...custom,environment:{...custom.environment,GATEREEVE_OBSERVER_WINDOW_ID:'window-two',PATH:'/missing'}});
await writeFile(join(helpers,'lint_spec.py'),'raise SystemExit(1)\n');await assert.rejects(native.assertTrustedPythonProof(executed,custom),/stale|unavailable/);
console.log(JSON.stringify({case:'effective-environment',actualChildEnvironment:actual,observerOnlyChange:'accepted',helperMutation:'rejected'}));
f.core.runtime.pythonGuardOptions=options;await establishCurrentRun(f.core);const before=(await f.core.state()).events;const original={...process.env};await mkdir(join(root,'empty-path'));
try{process.env.PATH=join(root,'empty-path');process.env.GATEREEVE_OBSERVER_WINDOW_ID='GUI';const adapter=createProtocolAdapter({gitExecutable:'/usr/bin/git',pythonExecutable:py});await adapter.resolve(f.repo);let view=await adapter.snapshot(f.home);assert.equal(view.milestones.find(x=>x.name==='implementation').allowed,true);const acceptance=view.milestones.find(x=>x.name==='acceptance');for(const id of ['reconcile','pattern'])assert.equal(acceptance.outcomes.find(x=>x.id===id).outcome,'PASS');assert.deepEqual((await f.core.state()).events,before);await writeFile(join(f.repo,'app.js'),'export const answer = 99;\n');view=await adapter.snapshot(f.home);assert.ok(view.milestones.find(x=>x.name==='acceptance').missing.some(x=>/dirty/.test(x)));console.log(JSON.stringify({case:'F2-and-Git-repaired',phase:view.current.phase,initialImplementation:true,reconcile:'PASS',pattern:'PASS',sourceDrift:'rejected',observationReadOnly:true}));}finally{for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original);}
console.log(JSON.stringify({root,fixture:f.root}));

```
