import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderMetrics } from '../renderer/metrics-view.js';
test('metrics UI loads on demand, opens sandboxed report and uses explicit management',async t=>{
  const {document,Event}=parseHTML('<html><body><main></main></body></html>').window;globalThis.document=document;t.after(()=>delete globalThis.document);
  const calls=[];
  const api={metrics:async request=>{calls.push(request);return request.action==='status'?{settings:{enabled:true,detailDays:90,summaryDays:365,maxBytes:104857600},bytes:128}:request.action==='html'?{html:'<h1>Safe report</h1>'}:{totals:{workerMs:100},cost:[],reuse:[],repetitions:[],coverage:{incomplete:1,gaps:['unobserved']}};}};
  const card=renderMetrics(document.querySelector('main'),api);assert.equal(calls.length,0);
  const click=async text=>{[...card.querySelectorAll('button')].find(b=>b.textContent===text).dispatchEvent(new Event('click'));await new Promise(r=>setTimeout(r,0));};
  await click('Load metrics');assert.deepEqual(calls.map(c=>c.action),['status','report']);assert.match(card.textContent,/1 incomplete/);
  await click('Open full report');assert.equal(card.querySelector('iframe').getAttribute('sandbox'),'');
  await click('Preview metrics cleanup');assert.equal(calls.at(-1).input.apply,false);
  await click('Apply eligible metrics cleanup');assert.equal(calls.at(-1).input.apply,true);
  await click('Save measurement settings');assert.ok(calls.some(c=>c.action==='config'&&c.input.maxBytes===104857600));
});
