import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { metricsRequest, renderReevaluation } from '../../plugin-src/shared/resources/performance/service.js';
import { validationScope } from '../../plugin-src/shared/resources/protocol/current/validation-scope.js';
const now = '2026-11-09T10:00:00Z';
const source = {id:'playpen',platform:'Playpen',capturedAt:now,since:null,until:now,status:'partial',limitations:['Outside commands are unknown']};
const row = {id:'playpen:review-1',source:'playpen',observedAt:now,kind:'artifact',project:'MyLifeMap',workflow:'issue-1',check:'review',model:'fixture',outcome:'PASS'};
const snapshot = records => ({format:'gatereeve-metrics-snapshot/1',sources:[source],records});
async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'fleet-report-'))),store=new MetricsStore(join(root,'metrics'),{privateConnection:true});
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});return store;
}
test('fixed datasets are idempotent, overlapping imports do not change old reports, conflicts roll back',async t=>{
  const store=await fixture(t);
  const first=await metricsRequest('snapshot-import',snapshot([row]),store);
  assert.equal((await metricsRequest('snapshot-import',snapshot([row]),store)).dataset,first.dataset);
  const next={...row,observedAt:'2026-11-09T11:00:00Z',outcome:'FAIL'};
  const second=await metricsRequest('snapshot-import',snapshot([next]),store);
  assert.equal((await metricsRequest('reevaluate',{dataset:first.dataset},store)).observations[0].outcome,'PASS');
  await assert.rejects(metricsRequest('snapshot-import',snapshot([{...next,outcome:'PASS'}]),store),/Conflicting/);
  await assert.rejects(metricsRequest('snapshot-import',snapshot([{...row,outcome:'FAIL'}]),store),/Conflicting/);
  assert.equal((await metricsRequest('datasets',{},store)).datasets.length,2);
  const combined=await metricsRequest('combine',{datasets:[first.dataset,second.dataset]},store);
  const report=await metricsRequest('reevaluate',{dataset:combined.dataset},store);
  assert.equal(report.observations.length,1); assert.equal(report.projects[0].failures,1);
  assert.deepEqual(await metricsRequest('snapshot-export',{dataset:first.dataset},store),snapshot([row]));
  assert.equal((await metricsRequest('databases',{},store)).workflows.length,0,'report imports never register workflow authority');
});
test('capture includes truthful missing-source coverage and strips no raw data by accident',async t=>{
  const store=await fixture(t);
  await store.put({id:'execution',project:'MyLifeMap',category:'unit',worker:true,startedAt:Date.parse(now),durationMs:20,outcome:'PASS'});
  const captured=await metricsRequest('capture',{platform:'local',missingSources:['UpCloud']},store);
  const report=await metricsRequest('reevaluate',{dataset:captured.dataset},store);
  assert.deepEqual(report.coverage.missingSources,['UpCloud']); assert.equal(report.totals.workerMs,20);
  assert.equal(report.coverage.knownExecutionDenominator,null);
  assert.equal((await metricsRequest('reevaluate',{dataset:captured.dataset,project:'absent'},store)).observations.length,0);
  await assert.rejects(metricsRequest('snapshot-import',snapshot([{...row,rawArguments:'secret'}]),store),/Unsupported/);
  const html=renderReevaluation({...report,observations:[{...row,project:'<script>alert(1)</script>'}]},'html');
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('snapshot datasets preserve independent clocks and nested timing accounting',async t=>{
  const store=await fixture(t);
  for(const input of [
    {id:'parent',startedAt:Date.now(),durationMs:100,worker:true,category:'review',clock:'one'},
    {id:'child',parentId:'parent',startedAt:Date.now()+20,durationMs:20,worker:true,category:'unit',clock:'one'},
    {id:'remote',startedAt:Date.now(),durationMs:30,worker:true,category:'unit',clock:'two'},
  ])await store.put({...input,project:'test',outcome:'PASS'});
  const {dataset}=await metricsRequest('capture',{},store),report=await metricsRequest('reevaluate',{dataset},store);
  assert.equal(report.totals.workerMs,130); assert.equal(report.totals.observedElapsedMs,null);
  for(const dimension of ['projects','workflows','checks','models','platforms','validators']) assert.equal(report[dimension].reduce((sum,row)=>sum+row.recordedWorkerMs,0),130,dimension);
});
test('CI scope observes exact head and required executed jobs; alternative stays a proposal',async()=>{
  const candidate={repositories:[{alias:'app',head:'abc'}]},configuration={validation:{kind:'ci',runs:[{alias:'app',repository:'org/repo',run:1,attempt:1,requiredChecks:['full']}]}};
  const fetch=async()=>({head_sha:'abc',status:'completed',jobs:[{id:1,name:'full',status:'completed',conclusion:'success'},{id:2,name:'deploy',status:'completed',conclusion:'skipped'}]});
  const value=await validationScope(configuration,candidate,fetch);assert.equal(value.runs[0].jobs[1].conclusion,'skipped');
  await assert.rejects(validationScope(configuration,candidate,async()=>({...await fetch(),head_sha:'stale'})),/exact candidate/);
  await assert.rejects(validationScope(configuration,candidate,async()=>({...await fetch(),jobs:[{name:'full',status:'completed',conclusion:'skipped'}]})),/missing, skipped/);
  const alternative=await validationScope({validation:{kind:'alternative',reason:'CI unavailable',scope:'All changed behavior with local integration checks'}},candidate);
  assert.match(alternative.assurance,/independent assessment/);
});

test('inspection does not create stores and explicit cleanup expires reporting only',async t=>{
  const store=await fixture(t);
  assert.equal((await metricsRequest('databases',{},store)).metrics.exists,false);
  const {lstat}=await import('node:fs/promises');await assert.rejects(lstat(store.root),{code:'ENOENT'});
  const imported=await metricsRequest('snapshot-import',snapshot([row]),store);
  const db=await store.database();
  const old=JSON.parse(db.prepare('SELECT body FROM reporting_datasets WHERE id=?').get(imported.dataset).body);old.capturedAt='2020-01-01T00:00:00Z';
  db.prepare('UPDATE reporting_datasets SET body=? WHERE id=?').run(JSON.stringify(old),imported.dataset);
  const preview=await metricsRequest('cleanup',{apply:false},store);assert.equal(preview.reporting.datasets,1);
  assert.equal((await metricsRequest('datasets',{},store)).datasets.length,1);
  await metricsRequest('cleanup',{apply:true},store);assert.equal((await metricsRequest('datasets',{},store)).datasets.length,0);
});
test('optional analysis validates cited evidence and keeps factual results on provider failure',async t=>{
  const store=await fixture(t),{dataset}=await metricsRequest('snapshot-import',snapshot([row]),store);
  const {analyzeReport}=await import('../../plugin-src/shared/resources/performance/analysis.js');
  const unavailable=await analyzeReport({dataset,provider:'codex',model:'fixture'},store,{analyst:{runStage:async()=>{throw new Error('Selected provider unavailable');}}});
  assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.report.dataset,dataset);assert.match(unavailable.reason,/Selected provider/);
});
test('public model/check labels survive capture without command arguments or environment values',async t=>{
  const store=await fixture(t);
  await store.put({id:'modeled-review',project:'private-path',command:'private arguments',environment:'private env',category:'review',worker:true,startedAt:Date.now(),durationMs:25,outcome:'PASS',display:{project:'GateReeve',issue:'123',check:'review',model:'fixture-model',provider:'codex',validator:'agentic'}});
  const {dataset}=await metricsRequest('capture',{},store),report=await metricsRequest('reevaluate',{dataset},store);
  assert.equal(report.models[0].name,'fixture-model');assert.equal(report.validators[0].name,'agentic');assert.ok(!JSON.stringify(report).includes('private arguments'));assert.ok(!JSON.stringify(report).includes('private env'));
});

test('successful analysis retains its receipt and rejects fabricated citations',async t=>{
  const store=await fixture(t),{dataset}=await metricsRequest('snapshot-import',snapshot([row]),store);
  const {analyzeReport}=await import('../../plugin-src/shared/resources/performance/analysis.js');
  const {sha256Digest}=await import('../../plugin-src/shared/resources/protocol/agent-workflow.js');
  let citation=row.id;
  const analyst={runStage:async request=>{
    const output={summary:'Fixture hypothesis, not a measured speedup',limitations:['One observation'],hypotheses:[{claim:'Try a focused review',citations:[citation],experiment:'Compare matched cases',uncertainty:'Insufficient sample'}]};
    return {schemaVersion:1,protocolVersion:request.protocolVersion,stageId:request.stage.id,status:'completed',output,receipt:{schemaVersion:1,kind:'gatereeve-agent-workflow-receipt',protocolVersion:request.protocolVersion,module:request.module,stage:request.stage.id,capabilityProfile:request.capabilityProfile,startedAt:now,completedAt:'2026-11-09T10:00:01Z',status:'completed',runId:request.runId,attemptId:request.attemptId,isolation:{method:'fixture',freshContext:true,inheritedTurns:0},provider:{id:'codex',adapterVersion:'1',reasoningEffort:'high',model:'fixture',contextId:'fresh'},digests:{input:sha256Digest(request.input),instructions:sha256Digest(request.instructions),output:sha256Digest(output),snapshot:request.snapshotDigest},policy:request.policy}};
  }};
  const result=await analyzeReport({dataset,provider:'codex',model:'fixture'},store,{analyst});assert.equal(result.status,'available',result.reason);assert.equal(result.selection.included,1);
  const db=await store.database();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reporting_analyses').get().n,1);
  citation='nonexistent';const invalid=await analyzeReport({dataset,provider:'codex',model:'fixture'},store,{analyst});assert.equal(invalid.status,'unavailable');assert.match(invalid.reason,/cite/);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reporting_analyses').get().n,1);
});

test('workflow projection is incremental, inspectable and cannot import authority',async t=>{
  const store=await fixture(t);await store.admit(true);await store.key();
  const {projectWorkflow}=await import('../../plugin-src/shared/resources/performance/workflow-projection.js');
  const home=join(store.root,'not-an-authority-db');
  const events=[{sequence:1,hash:'event-one',recordedAt:now,type:'STARTED',payload:{}},{sequence:2,hash:'event-two',recordedAt:now,type:'OBSERVATION',payload:{kind:'strategy',strategy:'focused pyramid checks',reason:'Small isolated change'}}];
  const core={context:{workspaceRoot:'/project/gatereeve',featureId:'issue-42'},store:{home},state:async()=>({state:{runId:'run'},events})};
  await projectWorkflow(core,store);await projectWorkflow(core,store);
  const known=await metricsRequest('databases',{},store);assert.equal(known.workflows.length,1);assert.equal(known.workflows[0].issue,'issue-42');
  const {dataset}=await metricsRequest('capture',{},store),report=await metricsRequest('reevaluate',{dataset},store);
  assert.equal(report.observations.length,2);assert.equal(report.strategies.some(row=>row.name==='focused pyramid checks'),true);
  const health=await metricsRequest('databases',{workflow:known.workflows[0].id},store);assert.equal(health.exists,false);
});


test('same display names retain distinct project identities and bounded imports roll back',async t=>{
  const store=await fixture(t);
  const imported=await metricsRequest('snapshot-import',snapshot([{...row,projectKey:'one:project'}, {...row,id:'playpen:review-2',projectKey:'two:project'}]),store);
  const report=await metricsRequest('reevaluate',{dataset:imported.dataset},store);
  assert.equal(report.projects.length,2);assert.equal(report.projects[0].name,report.projects[1].name);
  assert.equal((await metricsRequest('reevaluate',{dataset:imported.dataset,project:'one:project'},store)).observations.length,1);
  const original=store.configFrom.bind(store);store.configFrom=db=>({...original(db),maxBytes:1});
  await assert.rejects(metricsRequest('snapshot-import',snapshot([{...row,id:'over-capacity'}]),store),/capacity/);
  assert.equal((await metricsRequest('datasets',{},store)).datasets.length,1);
});


test('unknown worker timing stays unknown beside observed work and spans inherit public context',async t=>{
  const store=await fixture(t);
  const {observe,record}=await import('../../plugin-src/shared/resources/performance/observe.js');
  await observe({project:'test',workflow:'run',worker:false,category:'operation',display:{project:'GateReeve',issue:'42',branch:'tb-42',check:'unit'}},async()=>{
    await record({id:'known',worker:true,category:'unit',startedAt:Date.now(),durationMs:10,outcome:'PASS'},store);
    await record({id:'unknown',worker:true,category:'unit',startedAt:Date.now(),durationMs:null,outcome:'UNAVAILABLE'},store);
  },store);
  const {dataset}=await metricsRequest('capture',{},store),report=await metricsRequest('reevaluate',{dataset},store);
  assert.equal(report.totals.workerMs,null);assert.equal(report.totals.observedElapsedMs,null);
  const workers=report.observations.filter(row=>row.metrics?.worker);
  assert.equal(workers.length,2);assert.ok(workers.every(row=>row.branch==='tb-42'&&row.workflow));
});

test('legacy imports retain known runs under a shared feature and disclose unknown runs',async t=>{
  const store=await fixture(t);
  for(const [id,workflow] of [['a','run-one'],['b','run-two'],['c',undefined]]) await store.put({id,workflow,feature:'same-feature',project:'test',category:'unit',worker:true,startedAt:Date.parse(now),durationMs:10,outcome:'PASS'});
  const records=(await store.read({})).records.map(row=>row.record);
  const result=await metricsRequest('legacy-import',{records,platform:'historical',sourceId:'legacy',capturedAt:now},store);
  const report=await metricsRequest('reevaluate',{dataset:result.dataset},store);
  assert.equal(report.workflows.length,3);
  for(const metric of records.filter(row=>row.workflowId)) assert.equal((await metricsRequest('reevaluate',{dataset:result.dataset,workflow:metric.workflowId},store)).observations.length,1);
  assert.ok(report.workflows.some(row=>row.id.startsWith('Unknown run (')));
});
test('combining snapshots retains earlier source gaps and the full known window',async t=>{
  const store=await fixture(t);
  const first=await metricsRequest('snapshot-import',{...snapshot([row]),sources:[{...source,since:'2026-11-01T00:00:00Z',until:'2026-11-02T00:00:00Z',limitations:['First window lost capture']}]},store);
  const second=await metricsRequest('snapshot-import',{...snapshot([{...row,id:'later',observedAt:'2026-11-10T00:00:00Z'}]),sources:[{...source,capturedAt:'2026-11-10T00:00:00Z',since:'2026-11-02T00:00:00Z',until:'2026-11-03T00:00:00Z',status:'available',limitations:[]}]},store);
  const combined=await metricsRequest('combine',{datasets:[first.dataset,second.dataset]},store);
  const value=await metricsRequest('snapshot-export',{dataset:combined.dataset},store);
  assert.equal(value.sources[0].since,'2026-11-01T00:00:00.000Z');assert.equal(value.sources[0].until,'2026-11-03T00:00:00.000Z');
  assert.equal(value.sources[0].status,'partial');assert.deepEqual(value.sources[0].limitations,['First window lost capture']);
  assert.equal((await metricsRequest('combine',{datasets:[second.dataset,first.dataset]},store)).dataset,combined.dataset);
  const unknown=await metricsRequest('snapshot-import',snapshot([]),store);
  const all=await metricsRequest('combine',{datasets:[combined.dataset,unknown.dataset]},store);
  assert.equal((await metricsRequest('snapshot-export',{dataset:all.dataset},store)).sources[0].since,null);
});

test('filtered model totals retain nested context and reconcile with overview contributions',async t=>{
  const store=await fixture(t),at=Date.parse(now);
  await store.put({id:'parent',project:'p',worker:true,category:'review',startedAt:at,durationMs:100,outcome:'PASS',display:{model:'one'}});
  await store.put({id:'child',parentId:'parent',project:'p',worker:true,category:'unit',startedAt:at+20,durationMs:20,outcome:'PASS',display:{model:'two'}});
  const {dataset}=await metricsRequest('capture',{},store),overview=await metricsRequest('reevaluate',{dataset},store);
  for(const model of ['one','two']){
    const filtered=await metricsRequest('reevaluate',{dataset,model},store);
    assert.equal(filtered.observations.length,1);
    assert.equal(filtered.totals.workerMs,overview.models.find(row=>row.id===model).recordedWorkerMs);
    assert.equal(filtered.models[0].recordedWorkerMs,filtered.totals.workerMs);
  }
});
