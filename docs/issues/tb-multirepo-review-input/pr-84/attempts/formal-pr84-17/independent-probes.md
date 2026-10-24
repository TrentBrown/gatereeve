# Independent actual reproduction source

These probes assert the defect on the immutable formal15 pin. Test evaluator results are synthetic; command execution and core passage are actual.

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir, realpath, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentStore } from '/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-daapHn/repository/plugin-src/shared/resources/protocol/current/store.js';
import { CurrentCore } from '/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-daapHn/repository/plugin-src/shared/resources/protocol/current/core.js';
import { identity } from '/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-daapHn/repository/plugin-src/shared/resources/protocol/current/contracts.js';
import { git } from '/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-daapHn/repository/plugin-src/shared/resources/protocol/current/evidence.js';

const human = { kind: 'human-confirmed', instruction: 'Approve the named scope.', context: 'test user conversation' };
async function fixture(t, { nested = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-current-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = nested ? join(root, 'app') : root;
  const home = join(root, 'docs/issues/feature');
  await mkdir(repo, { recursive: true }); await mkdir(home, { recursive: true });
  if (nested) { await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n'); }
  await git(repo, ['init', '-b', 'topic']);
  await git(repo, ['config', 'user.email', 'fixture@example.test']);
  await git(repo, ['config', 'user.name', 'Fixture']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(repo, 'app.js'), 'export const answer = 42;\n');
  await git(repo, ['add', 'app.js']); await git(repo, ['commit', '-m', 'fixture']);
  const head = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  await writeFile(join(home, 'interview.md'), '# Interview\nSettled decisions.\n');
  await writeFile(join(home, 'design.md'), '# Design\n\n**Status:** approved\n');
  await writeFile(join(home, 'spec.md'), '# Spec\n\n## Acceptance Criteria\n\n- **AC1.** Export the constant answer with value 42.\n\n## Rubric\n\n| # | Criterion | Pass | Fail | Evidence |\n|---|---|---|---|---|\n| R1 | AC1 | 42 | other | test |\n\n## Changes\n');
  await writeFile(join(home, 'plan.md'), '# Plan\n## P1 - Implement R1\n');
  await writeFile(join(home, 'issues.md'), '# Issues\n## I-1 - Implement\n**Status:** in-review\n**Plan steps:** P1\n**Rubric criteria:** R1\n');
  await writeFile(join(home, 'tracker.md'), '# Tracker\n## Rubric Status\n| R1 | AC1 | NOT YET | pending |\n## Review Log\n');
  await writeFile(join(home, 'events.jsonl'), 'old journal preserved verbatim\n');
  const context = { featureId: 'feature', featureHome: home, workspaceRoot: root, repositories: [{ alias: 'app', path: repo, featureBaseSha: head }] };
  const core = await CurrentCore.at(context);
  const request = (operation, input = {}, operationId) => core.execute({ operation, input, operationId });
  await request('run.start', { runId: 'run-one', implementers: ['implementer-one'] }, 'start-one');
  return { root, repo, home, head, context, core, request };
}
async function authorize(f) {
  const design = await f.core.store.capture('design.md');
  await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: human, reason: 'Approved design', consequences: 'Proceed to spec' }, 'design-one');
  await f.request('spec.validate', {}, 'spec-one');
  const commitments = await f.core.commitments();
  await f.request('human.decide', { kind: 'authorize-implementation', subject: commitments.subject, authority: human, reason: 'Approved scope', consequences: 'May implement' }, 'plan-one');
}
async function candidate(f) {
  await f.request('candidate.prepare', { repositories: [{ alias: 'app', base: f.context.repositories[0].featureBaseSha, head: f.head }], scope: 'FEATURE', criteria: ['R1'] }, 'candidate-one');
}

function fakeEvaluator(f, { malformed = false, inherited = false, blocking = false, findingId = 'finding-1', outcome = blocking ? 'FAIL' : 'PASS', dispositions = [], historyAssessment = null, criterionRows = null, coverage = null } = {}) {
  let launches = 0;
  f.core.runtime.evaluator = {
    async describe() { return { provider: 'codex', model: 'fixture', reasoningEffort: 'high' }; },
    async runStage(request) {
      launches++;
      const output = { verdicts: request.input.gates.map(id => ({ gate: id, outcome,
        summary: 'Fixture assessment', criteria: criterionRows ?? request.input.criteria.map(id => ({ id, outcome, evidence: 'Fixture source and command receipt' })), coverage: coverage ?? { complete: true, paths: request.input.changedPaths ?? ['app/app.js'], interactions: ['app/app.js'], limitations: [] },
        findings: blocking ? [{ id: findingId, classId: 'class-1', criterion: 'R1', path: 'app/app.js', evidence: 'Current defect', blocking: true }] : [], dispositions, historyAssessment })) };
      if (malformed) output.verdicts.pop();
      const { sha256Digest } = await import('/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-daapHn/repository/plugin-src/shared/resources/protocol/agent-workflow.js');
      return { schemaVersion: 1, protocolVersion: request.protocolVersion, stageId: request.stage.id, status: 'completed', output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt', protocolVersion: request.protocolVersion, module: request.module, stage: request.stage.id, capabilityProfile: request.capabilityProfile, startedAt: '2026-10-23T00:00:00Z', completedAt: '2026-10-23T00:00:01Z', status: 'completed', runId: request.runId, attemptId: request.attemptId,
        isolation: { method: 'test-isolated', freshContext: true, inheritedTurns: inherited ? 1 : 0 },
        provider: { id: 'codex', adapterVersion: '1.0.0', reasoningEffort: 'high', model: 'fixture', contextId: 'reviewer-fresh' },
        digests: { input: sha256Digest(request.input), instructions: sha256Digest(request.instructions), output: sha256Digest(output), snapshot: request.snapshotDigest },
        policy: { repositoryAccess: 'read-only', networkAccess: 'deny', scratch: 'isolated' } } };
    },
  };
  return () => launches;
}


import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const actualExit=async(command,args,cwd)=>{try{await execute(command,args,{cwd});return 0;}catch(e){return e.code;}};
async function setup(t,kind,fail=false){
 const f=await fixture(t);await authorize(f);await candidate(f);
 const outside=join(f.root,'external-tools');await mkdir(outside);
 let command=process.execPath,args=[],mutation;
 const script=join(outside,'check.cjs');
 if(kind==='argument'){
  await writeFile(script,`process.exit(${fail?1:0});\n`);args=[script];
  mutation=()=>writeFile(script,'process.exit(7);\n');
 }else if(kind==='library'){
  command=join(outside,'launcher');await writeFile(command,`#!${process.execPath}\nrequire('./lib.cjs');\n`);await chmod(command,0o755);
  const lib=join(outside,'lib.cjs');await writeFile(lib,'process.exit(0);\n');mutation=()=>writeFile(lib,'process.exit(7);\n');
 }else{
  const interpreter=join(outside,'interpreter');await symlink(process.execPath,interpreter);
  command=join(outside,'launcher');await writeFile(command,`#!${interpreter}\nprocess.exit(0);\n`);await chmod(command,0o755);
  mutation=async()=>{await rm(interpreter);await symlink('/bin/sh',interpreter);};
 }
 const configuration={checks:[{repository:'app',command,args,purpose:`External ${kind} actual probe`}]};
 const ran=await f.request('gate.execute',{gates:['verification'],configuration},'external-run');
 return {...f,command,args,configuration,mutation,ran};
}
for(const kind of ['argument','library','shebang'])test(`actual ${kind} change retains stale PASS`,async t=>{
 const f=await setup(t,kind),ref=f.ran.event.payload.results[0];
 assert.equal((await f.core.store.json(ref)).outcome,'PASS');
 await f.mutation();const actual=await actualExit(f.command,f.args,f.repo);assert.notEqual(actual,0);
 const state=(await f.core.state()).state,candidate=await f.core.store.json(state.candidate);
 assert.equal((await f.core.currentResult(ref,candidate,state)).outcome,'PASS');
 const reused=await f.request('gate.execute',{gates:['verification'],configuration:f.configuration},'external-repeat');assert.equal(reused.reused,true);
 console.log(JSON.stringify({kind,actualExitAfterChange:actual,oldProof:'PASS',reused:true}));
});
test('actual failed runner exception survives changed external script',async t=>{
 const f=await setup(t,'argument',true);let state=(await f.core.state()).state;const candidate=await f.core.store.json(state.candidate);
 assert.equal((await f.core.store.json(f.ran.event.payload.results[0])).outcome,'FAIL');
 await f.request('human.decide',{kind:'waive',subject:state.candidate.hash,gates:['verification'],authority:human,reason:'Known failed external command',consequences:'Accept only this external script behavior'},'waive-external');
 state=(await f.core.state()).state;const risk=await f.core.waiverRisk(state,candidate,'verification');
 await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.equal(await f.core.waiverRisk(state,candidate,'verification'),risk);
 const row=(await f.core.check('acceptance')).outcomes.find(x=>x.id==='verification');assert.equal(row.satisfied,true);assert.ok(row.exception);
 console.log(JSON.stringify({kind:'waiver',oldExit:1,newExit:7,sameRisk:true,satisfied:row.satisfied}));
});
test('actual acceptance passage admits old PASS after external script turns failing',async t=>{
 const f=await setup(t,'argument');await writeFile(join(f.home,'scratchpad.md'),'# No pending decisions\n');await f.request('candidate.ready',{},'ready');fakeEvaluator(f);
 const verification=f.ran.event.payload.results,refs=[...verification];
 for(const gate of ['context','reconcile','triage','code','spec','judge','pattern','explanation']){
  const result=await f.request('gate.execute',{gates:[gate],consumed:['spec','judge'].includes(gate)?verification:[],configuration:['code','spec','judge','pattern','explanation'].includes(gate)?{provider:'codex',model:'fixture'}:{}},`g-${gate}`);refs.push(...result.event.payload.results);
 }
 await f.request('gate.execute',{gates:['packet'],consumed:refs},'packet');
 const initial=await f.core.check('acceptance');assert.equal(initial.allowed,true,JSON.stringify(initial));await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.equal((await f.core.check('acceptance')).allowed,true);
 await f.request('milestone.pass',{name:'acceptance'},'pass-after-external-drift');
 assert.equal((await f.core.state()).state.phase,'ACCEPTING');
 console.log(JSON.stringify({kind:'milestone',actualExitAfterChange:7,allowed:true,phase:'ACCEPTING',reviewer:'synthetic test adapter; actual commands and core passage'}));
});
test('consumed verification external drift also preserves a spec waiver',async t=>{
 const f=await setup(t,'argument');fakeEvaluator(f,{outcome:'FAIL'});
 await f.request('gate.execute',{gates:['spec'],consumed:f.ran.event.payload.results,configuration:{provider:'codex',model:'fixture'}},'failed-spec');
 let state=(await f.core.state()).state;const candidate=await f.core.store.json(state.candidate);
 await f.request('human.decide',{kind:'waive',subject:state.candidate.hash,gates:['spec'],authority:human,reason:'Known spec result with retained verification',consequences:'This verification runtime scope'},'waive-spec');
 state=(await f.core.state()).state;const risk=await f.core.waiverRisk(state,candidate,'spec');
 await f.mutation();assert.equal(await actualExit(f.command,f.args,f.repo),7);
 assert.equal(await f.core.waiverRisk(state,candidate,'spec'),risk);
 const row=(await f.core.check('acceptance')).outcomes.find(x=>x.id==='spec');assert.equal(row.satisfied,true);assert.ok(row.exception);
 console.log(JSON.stringify({kind:'transitive-spec-waiver',actualExitAfterChange:7,sameRisk:true,satisfied:true}));
});

```
