import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderMetrics } from '../renderer/metrics-view.js';
test('metrics UI loads on demand, opens sandboxed report and uses explicit management',async t=>{
  const {document,Event}=parseHTML('<html><body><main></main></body></html>').window;globalThis.document=document;t.after(()=>delete globalThis.document);
  const calls=[];
  const api={metrics:async request=>{calls.push(request);return request.action==='status'?{settings:{enabled:true,diagnosticDetails:false,detailDays:90,summaryDays:365,maxBytes:104857600},bytes:128}:request.action==='html'?{html:'<h1>Safe report</h1>'}:{totals:{workerMs:100},cost:[],reuse:[],repetitions:[],coverage:{incomplete:1,gaps:['unobserved']}};}};
  const card=renderMetrics(document.querySelector('main'),api);assert.equal(calls.length,0);
  const click=async text=>{[...card.querySelectorAll('button')].find(b=>b.textContent===text).dispatchEvent(new Event('click'));await new Promise(r=>setTimeout(r,0));};
  await click('Load metrics');assert.deepEqual(calls.map(c=>c.action),['status','report']);assert.match(card.textContent,/1 incomplete/);
  await click('Open full report');assert.equal(card.querySelector('iframe').getAttribute('sandbox'),'');
  await click('Preview metrics cleanup');assert.equal(calls.at(-1).input.apply,false);
  await click('Apply eligible metrics cleanup');assert.equal(calls.at(-1).input.apply,true);
  await click('Save measurement settings');assert.ok(calls.some(c=>c.action==='config'&&c.input.maxBytes===104857600));
});

test('fleet UI selects fixed datasets and calls shared import/export and analysis explicitly',async t=>{
  const {document,Event}=parseHTML('<html><body><main></main></body></html>').window;globalThis.document=document;t.after(()=>delete globalThis.document);
  const calls=[];const api={metrics:async request=>{calls.push(request);if(request.action==='datasets')return {datasets:[{id:'dataset-one',capturedAt:'2026-11-09',records:3,sources:[{platform:'Playpen'}]}]};if(['reevaluation-html','html'].includes(request.action))return {html:'<h1>Fleet report</h1>'};if(request.action==='analyze')return {status:'unavailable',reason:'fixture'};return {format:'gatereeve-metrics-snapshot/1',sources:[],records:[]};}};
  const card=renderMetrics(document.querySelector('main'),api);assert.equal(calls.length,0);
  const click=async text=>{[...card.querySelectorAll('button')].find(b=>b.textContent===text).dispatchEvent(new Event('click'));await new Promise(r=>setTimeout(r,0));};
  await click('List datasets');const select=card.querySelector('[aria-label="Fixed reporting dataset"]');select.querySelector('option').selected=true;
  await click('Open reevaluation report');assert.deepEqual(calls.at(-1),{action:'reevaluation-html',input:{dataset:'dataset-one'}});
  assert.equal(card.querySelector('iframe').getAttribute('sandbox'),'');
  await click('Open full report');assert.equal(card.querySelectorAll('iframe').length,2);
  assert.equal(card.querySelector('iframe[title="All-project reevaluation report"]').srcdoc,'<h1>Fleet report</h1>');
  await click('Export snapshot');assert.match(card.querySelector('textarea').value,/gatereeve-metrics-snapshot/);
  await click('Import snapshot');assert.ok(calls.some(call=>call.action==='snapshot-import'));
  const provider=card.querySelector('[aria-label="Analysis provider"]');provider.querySelector('option').selected=true;
  card.querySelector('[aria-label="Analysis model"]').value='fixture';await click('Request model analysis');assert.equal(calls.at(-1).input.model,'fixture');assert.match(card.textContent,/Analysis unavailable/);
});

test('desktop selection inspects the actual local workflow database through the shared service',async t=>{
  const {currentFixture}=await import('../../../cli/test/helpers/current-fixture.js');
  const {MetricsStore}=await import('../../../plugin-src/shared/resources/performance/store.js');
  const {metricsRequest}=await import('../../../plugin-src/shared/resources/performance/service.js');
  const {projectWorkflow}=await import('../../../plugin-src/shared/resources/performance/workflow-projection.js');
  const f=await currentFixture(t);await f.request('run.start',{implementers:['fixture']},'start');
  const store=new MetricsStore(`${f.root}/metrics`,{privateConnection:true});t.after(()=>store.close());
  await projectWorkflow(f.core,store);
  const {document,Event}=parseHTML('<html><body><main></main></body></html>').window;globalThis.document=document;t.after(()=>delete globalThis.document);
  let completed;const calls=[];
  const api={metrics:async request=>{calls.push(request);completed=await metricsRequest(request.action,request.input??{},store);return completed;}};
  const card=renderMetrics(document.querySelector('main'),api);
  const click=async text=>{completed=undefined;[...card.querySelectorAll('button')].find(b=>b.textContent===text).dispatchEvent(new Event('click'));for(let n=0;n<100&&completed===undefined;n++)await new Promise(r=>setTimeout(r,10));assert.ok(completed);};
  await click('Inspect databases');const selector=card.querySelector('[aria-label="Workflow database"]');assert.equal(selector.querySelectorAll('option').length,1);selector.querySelector('option').selected=true;
  await click('Inspect selected workflow');assert.ok(calls.at(-1).input.workflow);assert.equal(completed.exists,true);assert.equal(completed.integrity,'ok');assert.equal(completed.schemaVersion,1);assert.match(JSON.stringify(completed),/gatereeve\/current\/6/);
});
