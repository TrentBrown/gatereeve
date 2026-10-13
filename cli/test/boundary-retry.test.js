import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadHistoricalModel } from './helpers/historical-model.js';
import { initializeFeature, proposeSlice, recordFeatureTransition, recordSliceTransition,
  retryBoundary, readFeatureRecord, recordGateOutcome, projectRecord } from '../../plugin-src/shared/resources/protocol/index.js';

const agent = {kind:'agent',label:'fixture implementer'};
const human = {kind:'human-confirmed',label:'fixture approval'};
const hash = b => 'sha256:'+createHash('sha256').update(b).digest('hex');
async function fixture() {
 const root=await realpath(await mkdtemp(join(tmpdir(),'gatereeve-retry-')));
 const home=join(root,'docs/issues/feature');
 await initializeFeature({featureHome:home,featureId:'feature',actor:agent,model:await loadHistoricalModel()});
 await recordFeatureTransition(home,'approve-design',{actor:human});
 await recordFeatureTransition(home,'validate-spec',{actor:agent,facts:{specValidationCurrent:true}});
 await recordFeatureTransition(home,'authorize-plan',{actor:human});
 await proposeSlice(home,{sliceId:'s1',branch:'tb-feature',scope:'SLICE',rubricCriteria:['R1'],actor:agent});
 await recordSliceTransition(home,'plan-slice','s1',{actor:agent});
 await recordSliceTransition(home,'start-slice','s1',{actor:agent,facts:{sliceReadinessCurrent:true}});
 const context={schemaVersion:1,repositoryRoot:root,repositoryAlias:'product',remote:'origin',source:'github',
   evaluatedSourceSha:'a'.repeat(40),mergeBaseSha:'b'.repeat(40),featureBaseSha:'b'.repeat(40),keepPullRequestsClosed:false,
   pullRequest:{repository:'example/product',number:42,url:'https://github.com/example/product/pull/42',state:'OPEN',isDraft:true,
     baseRefName:'main',baseRefOid:'b'.repeat(40),headRefName:'tb-feature',headRefOid:'a'.repeat(40)}};
 const calls=[];
 const deps={checkpointDirectory:root,verifyCurrent:async ({context})=>({...context,status:'current'}),
   bridge:async request=>{calls.push(request.action); if(request.action==='prepare')return {context,packetId:'pr-42'};
    if(request.action==='gate')return {outputPath:join(home,'pr-42/attempts/retry-ready-1',request.gateId),packetId:'pr-42'};
    if(request.action==='finalize')return {synchronization:{finalHeadSha:'c'.repeat(40)},packet:{status:'valid'}};
    throw Error(request.action);}};
 const input={retryId:'ready-1',sliceId:'s1',pullRequest:42,scope:'SLICE',repositoryRoot:root,actor:agent};
 const invoke=extra=>retryBoundary(home,{...input,...extra},deps);
 return {root,home,input,deps,calls,invoke,context};
}
async function report(f,id,text='fixture passed') {
 const filename={reconcile:'reconcile.md',verification:'verification.md',specEvaluation:'spec-evaluation.md',patternReview:'pattern-review.md',
 judge:'judge.json',codeReview:'code-review.md',decisionTriage:'decision-triage.md',explainDiff:'explain-diff.html'}[id];
 const path=`pr-42/attempts/retry-${f.input.retryId}/${filename}`;
 await mkdir(join(f.home,`pr-42/attempts/retry-${f.input.retryId}`),{recursive:true});
 await writeFile(join(f.home,path),text);return path;
}
async function runGate(f,step,outcome='PASS') {
 const path=await report(f,step.gateId);
 if(step.module.run?.kind==='agent-workflow') {
   // Contract fixture: the real native runtime is covered by its independent
   // service tests. No fixture result is live/provider proof.
   await recordGateOutcome(f.home,{attemptId:step.attemptId,gateId:step.gateId,outcome,
     inputs:step.preparation.inputs,currentFingerprints:step.preparation.currentFingerprints,
     evidence:{path,hash:hash(await readFile(join(f.home,path)))},actor:agent});
   await writeFile(join(f.home,'pr-42/attempts',step.attemptId,'judge.md'),'fixture native report');
 } else await f.invoke({action:'record',gateId:step.gateId,outcome,evidencePath:path});
}

test('uncertain begin-boundary resumes exact PR without duplicating attempt or events',async()=>{
 const f=await fixture();let once=true;
 f.deps.afterMutation=async action=>{if(action==='begin-boundary'&&once){once=false;throw Error('crash after journal append');}};
 await assert.rejects(f.invoke(),/crash/);
 assert.equal((await f.invoke()).gateId,'pinContext');
 assert.equal((await f.invoke()).gateId,'reconcile');
 const record=await readFeatureRecord(f.home);
 assert.equal(record.events.filter(x=>x.type==='BOUNDARY_STARTED').length,1);
 assert.equal(f.calls.filter(x=>x==='prepare').length,1);
});

test('uncertain gate recording reconciles actual bytes/event and never duplicates PASS',async()=>{
 const f=await fixture();await f.invoke();const step=await f.invoke();
 const path=await report(f,step.gateId);let once=true;
 f.deps.afterMutation=async action=>{if(action==='record:reconcile'&&once){once=false;throw Error('crash after gate');}};
 const request={action:'record',gateId:'reconcile',outcome:'PASS',evidencePath:path};
 await assert.rejects(f.invoke(request),/crash/);assert.equal((await f.invoke(request)).status,'RECORDED');
 assert.equal((await readFeatureRecord(f.home)).events.filter(x=>x.eventId==='evt-retry-ready-1-reconcile').length,1);
});

test('FAIL is early retained discovery; presentation waits and revised attempt carries no PASS',async()=>{
 const f=await fixture();await f.invoke();await runGate(f,await f.invoke());await runGate(f,await f.invoke());
 const early=await f.invoke();assert.ok(['codeReview','specEvaluation'].includes(early.gateId));
 await runGate(f,early,'FAIL');assert.equal((await f.invoke()).status,'REMEDIATION_REQUIRED');
 assert.equal(projectRecord(await readFeatureRecord(f.home)).boundaryAttempts[0].gates.find(x=>x.id==='explainDiff').outcome,'UNSET');
 await recordSliceTransition(f.home,'remediate-boundary','s1',{actor:agent});
 f.input.retryId='ready-2';await f.invoke();
 const attempt=projectRecord(await readFeatureRecord(f.home)).boundaryAttempts.at(-1);
 assert.equal(attempt.id,'retry-ready-2');assert.equal(attempt.gates.find(x=>x.id==='verification').outcome,'UNSET');
 assert.equal(attempt.gates.find(x=>x.id===early.gateId).outcome,'UNSET');
});

test('clean substantive path orders discovery/triage before presentation and finalizes repeat-safely',async()=>{
 const f=await fixture();const trace=[];
 for(let n=0;n<15;n++) {const step=await f.invoke();
  if(step.status==='PREPARE_PACKET')break;
  trace.push(step.gateId);if(step.status==='RUN_GATE')await runGate(f,step);
 }
 assert.ok(trace.indexOf('codeReview')<trace.indexOf('judge'));
 assert.ok(trace.indexOf('specEvaluation')<trace.indexOf('judge'));
 assert.ok(trace.indexOf('decisionTriage')<trace.indexOf('explainDiff'));
 const packetStep=await f.invoke({action:'packet'});
 assert.equal(packetStep.status,'COMMIT_AND_PUSH_EVIDENCE');
 assert.ok(packetStep.evidencePaths.includes('docs/issues/feature/issues.md'));
 const manifest=JSON.parse(await readFile(join(f.home,'pr-42/boundary.json')));
 assert.equal(manifest.gates.judge.evidence.path,'attempts/retry-ready-1/judge.md');
 assert.equal((await f.invoke({action:'finalize'})).status,'COMMIT_AND_PUSH_EVIDENCE');
 assert.equal((await f.invoke({action:'finalize'})).status,'COMMIT_AND_PUSH_EVIDENCE');
 const final=await f.invoke({action:'finalize'});assert.equal(final.status,'AWAITING_HUMAN_REVIEW');
 assert.equal(final.finalHeadSha,'c'.repeat(40));const count=(await readFeatureRecord(f.home)).events.length;
 await f.invoke({action:'finalize'});assert.equal((await readFeatureRecord(f.home)).events.length,count);
 assert.equal((await f.invoke({action:'status'})).state,'HUMAN_REVIEW');
});

test('source movement, changed identity, model/input mismatch and premature packet block passage',async()=>{
 const f=await fixture();await f.invoke();const count=(await readFeatureRecord(f.home)).events.length;
 f.deps.verifyCurrent=async()=>{throw Error('PR source moved');};
 await assert.rejects(f.invoke(),/source moved/);
 await assert.rejects(f.invoke({pullRequest:43}),/identity changed/);
 assert.equal((await readFeatureRecord(f.home)).events.length,count);
 f.deps.verifyCurrent=async({context})=>({...context,status:'current'});
 await assert.rejects(f.invoke({action:'packet'}),/All substantive/);
});

test('recording refuses native Judge shortcuts and changed evidence cannot become CURRENT',async()=>{
 const f=await fixture();await f.invoke();
 for(let n=0;n<9;n++) {const step=await f.invoke();
  if(step.gateId==='judge') {
   await assert.rejects(f.invoke({action:'record',gateId:'judge',outcome:'PASS',evidencePath:await report(f,'judge')}),/independent runtime/);break;
  }await runGate(f,step);
 }
 const path='pr-42/attempts/retry-ready-1/verification.md';await writeFile(join(f.home,path),'changed after recording');
 await assert.rejects(f.invoke(),/evidence changed/);
});

test('stale preparation dependency identity is rejected instead of copying PASS',async()=>{
 const f=await fixture();await f.invoke();const step=await f.invoke();const path=await report(f,'reconcile');
 // A new pin-context event is a different predecessor even with equal content.
 await recordGateOutcome(f.home,{attemptId:step.attemptId,gateId:'pinContext',outcome:'PASS',
  inputs:{replacement:true},currentFingerprints:step.preparation.currentFingerprints,
  evidence:{path:'pr-42/attempts/retry-ready-1/context.json',hash:hash(await readFile(join(f.home,'pr-42/attempts/retry-ready-1/context.json')))},actor:agent});
 assert.equal((await f.invoke({action:'record',gateId:'reconcile',outcome:'PASS',evidencePath:path})).status,'REMEDIATION_REQUIRED');
});

test('status is observational and pause prevents further mutations',async()=>{
 const f=await fixture();await f.invoke();const initial=(await readFeatureRecord(f.home)).events.length;
 await f.invoke({action:'status'});assert.equal((await readFeatureRecord(f.home)).events.length,initial);
 const {pauseFeature}=await import('../../plugin-src/shared/resources/protocol/index.js');
 await pauseFeature(f.home,{actor:agent});
 await assert.rejects(f.invoke(),/pause/);
});
