import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, readdir, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { observe, record } from '../../plugin-src/shared/resources/performance/observe.js';
import { report, renderReport } from '../../plugin-src/shared/resources/performance/report.js';
import { importMetrics } from '../../plugin-src/shared/resources/performance/import.js';
import { metricsRequest } from '../../plugin-src/shared/resources/performance/service.js';
import { createSession } from '../../plugin-src/shared/resources/performance/mcp.js';
async function fixture(t) {
  const parent=await realpath(await mkdtemp(join(tmpdir(),'gatereeve-metrics-test-')));t.after(()=>rm(parent,{recursive:true,force:true}));
  return {parent,store:new MetricsStore(join(parent,'metrics'))};
}
function child(argv, env={}) {
  return new Promise((resolve,reject)=>{const p=spawn(process.execPath,argv,{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);p.once('error',reject);p.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));p.stdin.end();});
}
const base={project:'project',category:'unit',startedAt:Date.now(),durationMs:100,outcome:'PASS',worker:true,clock:'fixture'};
test('read-only fresh store has no writes and defaults are enabled',async t=>{
  const {parent,store}=await fixture(t);const s=await metricsRequest('status',{},store);assert.equal(s.settings.enabled,true);assert.deepEqual(await readdir(parent),[]);
});
test('private metadata and idempotent imports do not copy secrets',async t=>{
  const {store}=await fixture(t);const secret='CUSTOMER_SECRET_123';
  await store.put({...base,id:'job',project:secret,command:secret,feature:secret,input:secret,evidence:secret,raw:secret});
  await store.put({...base,id:'job',command:secret});
  const r=await report({},store);assert.equal(r.totals.records,1);assert.equal(JSON.stringify(r).includes(secret),false);
  for(const file of await readdir(store.root))assert.equal((await readFile(join(store.root,file),'utf8')).includes(secret),false);
  assert.equal(renderReport(r,'html').includes(secret),false);
});
test('parallel/nested accounting separates elapsed from worker time',async t=>{
  const {store}=await fixture(t);const startedAt=Date.now();
  await store.put({...base,id:'parent',startedAt,durationMs:6000});
  await store.put({...base,id:'one',parentId:'parent',startedAt,durationMs:6000});
  await store.put({...base,id:'two',parentId:'parent',startedAt,durationMs:4000});
  const r=await report({},store);assert.equal(r.totals.workerMs,10000);assert.equal(r.totals.observedElapsedMs,6000);
});
test('unknown identities do not establish equivalence and clocks do not fabricate elapsed time',async t=>{
  const {store}=await fixture(t);await store.put({...base,id:'a',command:'test'});await store.put({...base,id:'b',command:'test',clock:'remote'});
  const r=await report({},store);assert.equal(r.repetitions[0].classification,'possible-repeat');assert.equal(r.totals.observedElapsedMs,null);assert.equal(r.coverage.knownExecutionDenominator,null);
});
test('observer preserves success, throw identity and unfinished attempts',async t=>{
  const {store}=await fixture(t);const value={outcome:'PASS',answer:42};assert.equal(await observe({...base},()=>value,store),value);
  const error=new Error('private error');await assert.rejects(observe({...base},()=>{throw error;},store),e=>e===error);
  await store.put({...base,id:'killed',outcome:'RUNNING',durationMs:null,pid:99999999});
  const r=await report({},store);assert.equal(r.coverage.incomplete,1);assert.equal(r.records.some(x=>x.outcome==='UNAVAILABLE'),true);
});
test('off switch bypasses storage and collection failure does not replace result',async t=>{
  const {parent,store}=await fixture(t);await store.setConfig({enabled:false});let calls=0;
  await assert.rejects(observe(base,()=>{calls++;throw new Error('expected');},store),/expected/);assert.equal(calls,1);assert.equal((await report({},store)).totals.records,0);
  const bad=new MetricsStore(join(parent,'bad'));await mkdir(bad.root);await writeFile(join(bad.root,'unowned'),'leave');
  assert.equal(await observe(base,()=>42,bad),42);assert.equal(await readFile(join(bad.root,'unowned'),'utf8'),'leave');
});
test('retention summarizes expired details and protects live producers',async t=>{
  const {store}=await fixture(t);await store.setConfig({detailDays:1,summaryDays:3});
  await store.put({...base,id:'old',startedAt:Date.now()-2*86400000});
  await store.put({...base,id:'active',outcome:'RUNNING',durationMs:null,pid:process.pid,startedAt:Date.now()-4*86400000});
  const preview=await store.cleanup();await store.cleanup({apply:true});const r=await report({},store);
  assert.equal(preview.protected,1);assert.equal(r.records.find(x=>x.summary)?.commandId,null);assert.equal(r.records.length,2);
  const before=r.totals.workerMs;await store.cleanup({apply:true,now:Date.now()+5*86400000});assert.equal((await report({},store)).totals.records,1);assert.ok(before>=0);
});
test('small budget remains bounded and cleanup never traverses links',async t=>{
  const {parent,store}=await fixture(t);await store.setConfig({maxBytes:65536});
  for(let i=0;i<100;i++)await store.put({...base,id:`job${i}`});
  assert.ok((await store.read()).bytes<=65536);const outside=join(parent,'evidence');await writeFile(outside,'preserve');await symlink(outside,join(store.root,'escape'));
  await assert.rejects(store.cleanup({apply:true}),/Unsafe/);assert.equal(await readFile(outside,'utf8'),'preserve');
});
test('active lock is not stolen; rejection does not grant write scope',async t=>{
  const {store}=await fixture(t);let release;const blocker=new Promise(r=>release=r);let entered;const ready=new Promise(r=>entered=r);
  const pending=store.lock(async()=>{entered();await blocker;});await ready;
  await assert.rejects(store.put(base),/busy/);release();await pending;
  await assert.rejects(metricsRequest('cleanup',{path:'/tmp',apply:true},store),/only/);
  await assert.rejects(metricsRequest('config',{maxBytes:1},store),/Invalid/);
});
test('framework imports accept initial adapters and preserve incomplete data',async t=>{
  const {store}=await fixture(t);const now=Date.now();
  await importMetrics('vitest',{testResults:[{name:'secret file',startTime:now,endTime:now+5,status:'passed',assertionResults:[{}]}]},{execution:'vitest'},store);
  await importMetrics('playwright',{suites:[{file:'secret file',specs:[{tests:[{results:[{startTime:new Date(now).toISOString(),duration:7,status:'passed'}]}]}]}]},{execution:'pw'},store);
  const node=await importMetrics('node',[{type:'test:pass',data:{name:'secret title',nesting:0,details:{duration_ms:4}}}],{execution:'node'},store);assert.ok(node.gaps.length);
  await importMetrics('verification',{steps:[{command:'secret command',startedAt:new Date(now).toISOString(),finishedAt:new Date(now+5).toISOString(),exitCode:0}]},{execution:'mlm'},store);
  const r=await report({},store);assert.equal(r.totals.records,4);assert.equal(JSON.stringify(r).includes('secret'),false);
  await assert.rejects(importMetrics('vitest',{}, {execution:'bad'},store),/Expected/);
});
test('CI reimports count one attempt and distinct attempts stay distinct',async t=>{
  const {store}=await fixture(t);const now=new Date().toISOString();const jobs={jobs:[{id:42,name:'secret-job',started_at:now,completed_at:null,conclusion:null,steps:[]}]};
  await importMetrics('github',jobs,{execution:'run:1:attempt:1'},store);await importMetrics('github',jobs,{execution:'run:1:attempt:1'},store);await importMetrics('github',jobs,{execution:'run:1:attempt:2'},store);
  const r=await report({},store);assert.equal(r.totals.records,2);assert.equal(r.coverage.incomplete,2);
});
test('MCP requires handshake and management is disabled by default',async t=>{
  const {store}=await fixture(t);const session=createSession({store});const call=(id,method,params)=>session({jsonrpc:'2.0',id,method,params});
  assert.ok((await call(1,'tools/list')).error);
  await call(2,'initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'1'},capabilities:{}});await session({jsonrpc:'2.0',method:'notifications/initialized'});
  const tools=(await call(3,'tools/list')).result.tools;assert.equal(tools.length,3);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
  assert.ok((await call(4,'tools/call',{name:'metrics_config',arguments:{enabled:false}})).error);
  const response=(await call(5,'tools/call',{name:'metrics_report',arguments:{limit:1}})).result;assert.deepEqual(response.structuredContent,await report({limit:1},store));
});
test('actual MCP stdio process supports initialization and tools',async t=>{
  const {store}=await fixture(t);const path=resolve('plugin-src/shared/resources/performance/mcp.js');
  const p=spawn(process.execPath,['--input-type=module','-e',`import {serve} from ${JSON.stringify(path)}; await serve();`],{env:{...process.env,GATEREEVE_METRICS_DIR:store.root},stdio:['pipe','pipe','pipe']});
  let output='';p.stdout.on('data',c=>output+=c);p.stdin.end([
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'fixture',version:'1'},capabilities:{}}},
    {jsonrpc:'2.0',method:'notifications/initialized'}, {jsonrpc:'2.0',id:2,method:'tools/list'}, {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'metrics_status',arguments:{}}},
  ].map(x=>JSON.stringify(x)).join('\n')+'\n');
  const code=await new Promise(r=>p.once('close',r));assert.equal(code,0);const messages=output.trim().split('\n').map(JSON.parse);assert.equal(messages.length,3);assert.equal(messages[2].result.structuredContent.records,0);
});
test('CLI wrapper preserves argv, output and nonzero exit',async t=>{
  const {store}=await fixture(t);const script='console.log(process.argv[1]); process.exit(7)';const args=['-e',script,'literal $(touch nope)'];
  const direct=await child(args);const wrapped=await child(['cli/bin/workflow.js','metrics','run','--',process.execPath,...args],{GATEREEVE_METRICS_DIR:store.root});
  assert.equal(wrapped.code,direct.code);assert.equal(wrapped.stdout,direct.stdout);assert.equal(wrapped.stderr,'');assert.equal((await report({},store)).records[0].outcome,'FAIL');
});
test('collector reports bounded diagnostics only when explicitly enabled',async t=>{
  const {store}=await fixture(t);const data={suites:[{file:'private-file',specs:[{tests:Array.from({length:30},()=>({results:[{retry:0,startTime:new Date().toISOString(),duration:1,status:'passed'}]}))}]}]};
  await importMetrics('playwright',data,{execution:'normal'},store);assert.equal((await report({},store)).records.length,1);
  await store.setConfig({diagnosticDetails:true});await importMetrics('playwright',data,{execution:'detail'},store);
  const r=await report({},store);assert.equal(r.records.length,12);assert.equal(JSON.stringify(r).includes('private-file'),false);
});
test('nested worker accounting retains exclusive parent setup',async t=>{
  const {store}=await fixture(t);await store.put({...base,id:'p',durationMs:6000});await store.put({...base,id:'operation',parentId:'p',durationMs:4000,worker:false});await store.put({...base,id:'child',parentId:'operation',durationMs:2000});
  assert.equal((await report({},store)).totals.workerMs,6000);
});
test('wrapper forwards termination and preserves terminal signal',async t=>{
  const {store}=await fixture(t);
  const p=spawn(process.execPath,['cli/bin/workflow.js','metrics','run','--',process.execPath,'-e',"console.log('ready');setInterval(()=>{},1000)"],{env:{...process.env,GATEREEVE_METRICS_DIR:store.root},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{p.stdout.once('data',resolve);p.once('error',reject);});p.kill('SIGTERM');
  const result=await new Promise(resolve=>p.once('close',(code,signal)=>resolve({code,signal})));assert.equal(result.signal,'SIGTERM');
  assert.equal((await report({},store)).records[0].outcome,'CANCELLED');
});
test('poll observations accumulate without unbounded per-poll records',async t=>{
  const {store}=await fixture(t);for(let i=0;i<4;i++)await store.put({...base,id:'bucket',category:'poll',worker:false,durationMs:5});
  const r=await report({},store);assert.equal(r.records.length,1);assert.equal(r.records[0].count,4);assert.equal(r.records[0].durationMs,20);
});
test('shared execution keeps multiple feature inclusions without duplicate cost',async t=>{
  const {store}=await fixture(t);await store.put({...base,id:'shared-ci',feature:'one'});await store.put({...base,id:'shared-ci',feature:'two'});
  const all=await report({},store);assert.equal(all.totals.workerMs,100);assert.equal(all.featureAttribution.length,2);
  assert.equal((await report({feature:'one'},store)).totals.workerMs,100);assert.equal((await report({feature:'two'},store)).totals.workerMs,100);
});
test('summary retention preserves nested accounting',async t=>{
  const {store}=await fixture(t);const startedAt=Date.now();await store.setConfig({detailDays:1,summaryDays:3});
  await store.put({...base,id:'parent',startedAt,durationMs:6000});await store.put({...base,id:'child',parentId:'parent',startedAt,durationMs:4000});
  const before=await report({},store);await store.cleanup({apply:true,now:startedAt+2*86400000});const after=await report({},store);
  assert.equal(after.totals.workerMs,before.totals.workerMs);assert.ok(after.records.every(r=>r.summary));
});

test('unavailable importer timing remains visible after the import response is gone',async t=>{
  const {store}=await fixture(t);
  await importMetrics('github',{jobs:[{id:1,started_at:null,steps:[{number:1}]}]},{execution:'missing'},store);
  await importMetrics('vitest',{testResults:[{name:'private'}]},{execution:'missing'},store);
  await importMetrics('playwright',{suites:[{specs:[{tests:[{results:[{status:'passed'}]}]}]}]},{execution:'missing'},store);
  await importMetrics('verification',{steps:[{command:'private'}]},{execution:'missing'},store);
  const r=await report({},store);assert.equal(r.coverage.incomplete,5);assert.ok(r.coverage.gaps.some(g=>g.includes('unavailable timing')));assert.equal(r.totals.workerMs,0);
});
test('Playwright retries remain separate idempotent attempts with recovered success',async t=>{
  const {store}=await fixture(t);const now=Date.now();
  const data={suites:[{file:'private',specs:[{tests:[{results:[{retry:0,startTime:now,duration:5,status:'failed'},{retry:1,startTime:now+10,duration:7,status:'passed'}]}]}]}]};
  for(let i=0;i<2;i++)await importMetrics('playwright',data,{execution:'pw-retry'},store);
  const r=await report({},store);assert.equal(r.totals.records,2);assert.equal(r.totals.workerMs,12);assert.deepEqual(r.records.map(x=>x.outcome),['FAIL','PASS']);assert.notEqual(r.records[0].attemptId,r.records[1].attemptId);assert.equal(r.records[1].reason,'retry');
});
test('collector loss has persistent bounded health even when a whole span was dropped',async t=>{
  const {store}=await fixture(t);await store.lock(async()=>{assert.equal(await record(base,store),null);});
  const r=await report({},store);assert.equal(r.coverage.captureIncomplete,true);assert.ok(r.coverage.gaps.some(g=>g.includes('dropped')));assert.equal(r.totals.records,0);
});
test('real command receipt correlates with its wrapper without duplicate worker time',async t=>{
  const {store,parent}=await fixture(t);const receipt=join(parent,'receipt.json');
  const script="const fs=require('node:fs');const startedAt=Date.now();setTimeout(()=>fs.writeFileSync(process.argv[1],JSON.stringify({steps:[{command:'actual-node-check',startedAt,finishedAt:Date.now(),exitCode:0}]})),20)";
  const result=await child(['cli/bin/workflow.js','metrics','run','--execution','real-wrapper','--',process.execPath,'-e',script,receipt],{GATEREEVE_METRICS_DIR:store.root});assert.equal(result.code,0);
  const before=await report({},store);const source=JSON.parse(await readFile(receipt,'utf8'));
  await importMetrics('verification',source,{execution:'real-child',parentId:'real-wrapper',clock:hostname()},store);
  const after=await report({},store);assert.equal(after.totals.records,2);assert.equal(after.totals.workerMs,before.totals.workerMs);assert.equal(after.coverage.incomplete,0);
});
test('retained native runner receipt reconciles exactly and reimport does not duplicate work',async t=>{
  const {store}=await fixture(t);const receiptFixture=JSON.parse(await readFile(new URL('./fixtures/performance/native-receipt.json',import.meta.url),'utf8'));
  const expected=receiptFixture.receipts.reduce((sum,r)=>sum+Date.parse(r.completedAt)-Date.parse(r.startedAt),0);
  for(let i=0;i<2;i++)await importMetrics('verification',receiptFixture,{execution:receiptFixture.provenance.receiptHash},store);
  const r=await report({},store);assert.equal(r.totals.records,receiptFixture.receipts.length);assert.equal(r.totals.workerMs,expected);assert.equal(r.coverage.incomplete,0);assert.ok(r.records.every(x=>x.outcome==='PASS'));
  console.log(JSON.stringify({reconciliation:'native-runner',receiptHash:receiptFixture.provenance.receiptHash,expectedChecks:receiptFixture.receipts.length,observedChecks:r.totals.records,expectedWorkerMs:expected,observedWorkerMs:r.totals.workerMs}));
});

test('write budget amortizes inventory scans and conservatively recovers an interrupted write',async t=>{
  const {store}=await fixture(t);let inventories=0;const inventory=store.inventory.bind(store);store.inventory=async(...args)=>{inventories++;return inventory(...args);};
  for(let i=0;i<40;i++)await store.put({...base,id:`budget-${i}`});
  assert.equal(inventories,1);
  const config=await store.config();await store.lock(()=>store.reserveWrite(Date.now(),config)); // interruption before publishing
  await writeFile(join(store.root,'.write-dead-beef'),'interrupted');
  await store.put({...base,id:'after-interruption'});assert.ok(!(await readdir(store.root)).includes('.write-dead-beef'));
  const budget=JSON.parse(await readFile(join(store.root,'budget.json'),'utf8'));assert.ok(budget.bytes>=(await store.read()).bytes);
});

test('estimated timestamps retain measured work without inventing elapsed placement or overlap',async t=>{
  const {store}=await fixture(t);
  await importMetrics('node',[{type:'test:pass',data:{nesting:0,details:{duration_ms:4}}}],{execution:'missing-start'},store);
  let r=await report({},store);assert.equal(r.totals.workerMs,4);assert.equal(r.totals.observedElapsedMs,null);assert.equal(r.totals.elapsedByClock[0].ms,null);
  await store.put({...base,id:'parent',durationMs:100});await store.put({...base,id:'unplaced-child',parentId:'parent',provenance:'estimated',durationMs:10});
  r=await report({},store);assert.equal(r.totals.workerMs,null);assert.equal(r.operationCost.find(x=>x.label==='unit').exclusiveMs,null);assert.match(renderReport(r,'markdown'),/Worker time: unknown/);
});
test('live Node reporter preserves normal output and treats delivery timestamps as estimates',async t=>{
  const {store,parent}=await fixture(t);const file=join(parent,'sample.test.mjs');
  await writeFile(file,"import test from 'node:test'; test('private-live-case',()=>{});\n");
  const r=await child(['--test','--test-reporter=spec',`--test-reporter=${resolve('plugin-src/shared/resources/performance/node-reporter.js')}`,'--test-reporter-destination=stdout','--test-reporter-destination=/dev/null',file],{GATEREEVE_METRICS_DIR:store.root,NODE_TEST_CONTEXT:undefined});
  assert.equal(r.code,0);assert.match(r.stdout,/private-live-case/);const value=await report({},store);assert.ok(value.totals.records>0);assert.equal(value.totals.observedElapsedMs,null);assert.equal(JSON.stringify(value).includes('private-live-case'),false);
});
