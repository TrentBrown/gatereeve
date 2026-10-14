import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {finalizationOwnerFixture} from '../../../cli/test/helpers/owner-finalization-fixture.js';
import {completeFinalizedFeature} from '../../../plugin-src/shared/resources/protocol/finalization.js';
import {human} from '../../../cli/test/helpers/finalization-fixture.js';
import {createProtocolAdapter} from '../main/protocol-adapter.js';
const desktopRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function waitFor(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Timed out waiting for actual finalization render');}

test('retained and replacement finalization diagrams/cards share pinned groups after reversal/removal/disablement',async()=>{
 const f=await finalizationOwnerFixture();const protocol=createProtocolAdapter();
 const {window}=parseHTML(await readFile(resolve(desktopRoot,'renderer/index.html'),'utf8'));
 const update={schemaVersion:1,status:'idle',source:null,currentVersion:'0.1.0',checkedAt:null,available:null,detail:null};
 let subscriber;let current;let nextAttempt=0;
 const makeState=async()=>({schemaVersion:1,phase:'ready',refreshing:false,githubPolling:false,selection:{worktreePath:dirname(dirname(dirname(f.home))),featureHome:f.home},snapshot:await f.observe(),error:null,
  setup:{schemaVersion:1,phase:'ready',operationalReady:true,checkedAt:null,desktop:{version:'0.1.0'},selectedAgents:['codex'],prerequisites:[],agents:[]},
  preferences:{notificationsEnabled:false,projectPaths:[],selectedAgents:['codex'],terminalHeight:260}});
 current=await makeState();
 window.gatereeveDesktop={async getState(){return current;},async getUpdateState(){return update;},subscribe(cb){subscriber=cb;return()=>{};},subscribeUpdates(){return()=>{};},
  async readDetail(kind,id){return protocol.read(f.home,kind,id);},async refresh(){return current;},
  async startFinalization(){await f.replace('replacement-'+(++nextAttempt));current=await makeState();return current;},
  async completeFinalization(id){await completeFinalizedFeature(f.home,{attemptId:id,actor:human});current=await makeState();return current;}};
 globalThis.window=window;globalThis.document=window.document;
 try{
  await import(`${pathToFileURL(resolve(desktopRoot,'renderer/renderer.js')).href}?test=pinned-finalization-ui`);
  await waitFor(()=>window.document.querySelector('#finalization-dag .gate-stage'));
  const checkView=()=>{
   const attempt=current.snapshot.projection.finalizationAttempts.find(a=>a.state==='ACTIVE')??current.snapshot.projection.finalizationAttempts.at(-1);
   const wrappers=[...window.document.querySelectorAll('#finalization-dag .gate-stage')];
   const stages=[...new Set(attempt.modules.map(m=>m.dependencyStage))].sort((a,b)=>a-b);
   assert.equal(wrappers.length,stages.length);
   stages.forEach((stage,index)=>{
    const cards=[...wrappers[index].querySelectorAll('.module-card')];const results=attempt.modules.filter(m=>m.dependencyStage===stage);
    assert.equal(wrappers[index].getAttribute('aria-label'),`Finalization dependency stage ${stage}`);
    assert.deepEqual(cards.map(c=>c.querySelector('.order-marker').textContent),results.map(m=>m.orderLabel));
    results.forEach((result,j)=>{const definition=current.snapshot.modules.slots.find(s=>s.id==='feature.finalization').modules.find(m=>m.id===result.id);assert(cards[j].getAttribute('aria-label').includes(`module ${result.orderLabel}, ${definition.label},`));});
   });
   const actual=[...window.document.querySelectorAll('#finalization-dag [data-edge-from]')].map(e=>[e.getAttribute('data-edge-from'),e.getAttribute('data-edge-to'),e.getAttribute('data-edge-kind')]);
   assert.deepEqual(actual,attempt.modules.flatMap(m=>m.dependencyEdges.map(e=>[e.from,e.to,e.kind])));
  };
  checkView();assert.equal(window.document.querySelector('#finalization-summary').textContent.includes('Start current finalization'),false);
  for(const [ordering,disabled] of [[{'example/prepare':{after:['example/release']}},[]],[{},[]],[{},['example/prepare','example/release']]]){
   await f.migrate(ordering,disabled);current=await makeState();subscriber(current);checkView();
   assert(window.document.getElementById('finalization-summary').textContent.includes('Workflow changed since this retained attempt'));
   assert.equal(window.document.querySelectorAll('#finalization-dag .module-waiver-button').length,0);
   const start=[...window.document.querySelectorAll('#finalization-summary button')].find(b=>b.textContent==='Start current finalization');assert(start);
   start.click();await waitFor(()=>current.snapshot.projection.finalizationAttempts.at(-1).id==='replacement-'+nextAttempt&&!window.document.getElementById('finalization-summary').textContent.includes('Start current finalization'));checkView();
  }
  assert.equal(window.document.getElementById('finalization-surface').hidden,false);
  const complete=[...window.document.querySelectorAll('#finalization-summary button')].find(b=>b.textContent==='Complete feature');assert(complete);
  complete.click();await waitFor(()=>current.snapshot.projection.feature.state==='COMPLETE');
 }finally{delete globalThis.window;delete globalThis.document;}
});
