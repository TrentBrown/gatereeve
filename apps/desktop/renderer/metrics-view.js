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
  card.append(heading,status,controls,settings,result);container.append(card);return card;
}
