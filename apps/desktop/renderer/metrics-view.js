import { node } from './dom.js';
export function renderMetrics(container, api) {
  const card=node('section',{className:'action-card'});
  const heading=node('h3',{text:'Workflow metrics'});
  const status=node('p',{text:'Local measurement. Load the selected project’s metrics on demand.'});
  const controls=node('div'); const result=node('pre');
  const button=(label,fn)=>{const b=node('button',{type:'button',text:label});b.disabled=typeof api.metrics!=='function';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch{status.textContent='Metrics unavailable. Existing workflow and test results are unaffected.';}finally{b.disabled=false;}});controls.append(b);return b;};
  const load=async()=>{
    const health=await api.metrics({action:'status'});const report=await api.metrics({action:'report'});
    status.textContent=`Collection ${health.settings.enabled?'enabled':'disabled'} · ${health.bytes} bytes of ${health.settings.maxBytes} · ${report.coverage.incomplete} incomplete records`;
    result.textContent=JSON.stringify({totals:report.totals,cost:report.cost,reuse:report.reuse,repetitions:report.repetitions,coverage:report.coverage},null,2);
    for(const [key,input] of Object.entries(fields)) input.value=String(health.settings[key]);
    enabled.checked=health.settings.enabled;diagnostics.checked=health.settings.diagnosticDetails;
  };
  button('Load metrics',load);
  button('Open full report',async()=>{const {html}=await api.metrics({action:'html'});let frame=card.querySelector('iframe');if(!frame){frame=node('iframe',{attributes:{title:'Workflow performance report',sandbox:''}});frame.style.width='100%';frame.style.height='600px';card.append(frame);}frame.srcdoc=html;});
  const settings=node('details',{},[node('summary',{text:'Measurement settings (all projects)'})]);
  const enabled=node('input',{type:'checkbox'});settings.append(node('label',{},[enabled,node('span',{text:' Enable collection'})]));
  const diagnostics=node('input',{type:'checkbox'});settings.append(node('label',{},[diagnostics,node('span',{text:' Enable bounded diagnostic detail'})]));
  const fields={};
  for(const [key,label] of [['detailDays','Detail retention days'],['summaryDays','Summary retention days'],['maxBytes','Store cap in bytes']]){const input=node('input',{type:'number',attributes:{'aria-label':label}});fields[key]=input;settings.append(node('label',{},[node('span',{text:label}),input]));}
  const save=node('button',{type:'button',text:'Save measurement settings'});
  save.addEventListener('click',async()=>{try{await api.metrics({action:'config',input:{enabled:enabled.checked,diagnosticDetails:diagnostics.checked,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v.value)]))}});await load();}catch{status.textContent='Settings not saved; check values and available capacity.';}});settings.append(save);
  button('Preview metrics cleanup',async()=>{result.textContent=JSON.stringify(await api.metrics({action:'cleanup',input:{apply:false}}),null,2);});
  button('Apply eligible metrics cleanup',async()=>{result.textContent=JSON.stringify(await api.metrics({action:'cleanup',input:{apply:true}}),null,2);status.textContent='Eligible owned metrics cleaned; evidence and active work preserved.';});
  const fleet=node('section',{},[node('h3',{text:'All-project reevaluation'})]);
  const datasets=node('select',{attributes:{'aria-label':'Fixed reporting dataset'}});
  const projectFilter=node('input',{attributes:{'aria-label':'Project filter',placeholder:'All projects (or exact label)'}});
  const platform=node('input',{attributes:{'aria-label':'Platform label',placeholder:'This machine'}});
  const fleetButton=(text,fn)=>{const b=node('button',{type:'button',text});b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(error){status.textContent=`Report unavailable: ${error.message}`;}finally{b.disabled=false;}});fleet.append(b);};
  const list=async()=>{const value=await api.metrics({action:'datasets'});datasets.replaceChildren(...value.datasets.map(row=>node('option',{attributes:{value:row.id},text:`${row.capturedAt} · ${row.records} observations · ${row.sources.map(s=>s.platform).join(', ')}`})));};
  const query=()=>({dataset:datasets.value,...(projectFilter.value?{project:projectFilter.value}:{})});
  fleet.append(datasets,projectFilter,platform);
  fleetButton('List datasets',list);
  fleetButton('Capture this machine',async()=>{await api.metrics({action:'capture',input:platform.value?{platform:platform.value}:{}});await list();});
  fleetButton('Open reevaluation report',async()=>{const {html}=await api.metrics({action:'reevaluation-html',input:query()});let frame=fleet.querySelector('iframe');if(!frame){frame=node('iframe',{attributes:{title:'All-project reevaluation report',sandbox:''}});frame.style.width='100%';frame.style.height='650px';fleet.append(frame);}frame.srcdoc=html;});
  fleetButton('Inspect databases',async()=>{result.textContent=JSON.stringify(await api.metrics({action:'databases'}),null,2);});
  const transfer=node('textarea',{attributes:{'aria-label':'Snapshot JSON',placeholder:'Paste a portable snapshot to import, or export the selected dataset here'}});fleet.append(transfer);
  const importKind=node('select',{attributes:{'aria-label':'Snapshot import format'}},[['snapshot-import','Portable snapshot'],['legacy-import','Historical rc.23/rc.24 envelope']].map(([value,text])=>node('option',{attributes:{value},text})));fleet.append(importKind);
  fleetButton('Import snapshot',async()=>{await api.metrics({action:importKind.value || 'snapshot-import',input:JSON.parse(transfer.value)});await list();});
  fleetButton('Export snapshot',async()=>{transfer.value=JSON.stringify(await api.metrics({action:'snapshot-export',input:{dataset:datasets.value}}),null,2);});
  const mergeIds=node('input',{attributes:{'aria-label':'Dataset IDs to combine',placeholder:'Dataset IDs, separated by commas'}});fleet.append(mergeIds);
  fleetButton('Combine datasets',async()=>{await api.metrics({action:'combine',input:{datasets:mergeIds.value.split(',').map(id=>id.trim()).filter(Boolean)}});await list();});
  const provider=node('select',{attributes:{'aria-label':'Analysis provider'}},['codex','claude-code'].map(value=>node('option',{attributes:{value},text:value})));
  const model=node('input',{attributes:{'aria-label':'Analysis model',placeholder:'Explicit model name'}});fleet.append(provider,model);
  fleetButton('Request model analysis',async()=>{status.textContent='Analyzing the selected fixed dataset…';const value=await api.metrics({action:'analyze',input:{...query(),provider:provider.value,model:model.value}});result.textContent=JSON.stringify(value,null,2);status.textContent=`Analysis ${value.status}; policy unchanged.`;});
  card.append(heading,status,controls,fleet,settings,result);container.append(card);return card;
}
