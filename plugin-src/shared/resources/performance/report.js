import { MetricsStore, CATEGORIES } from './store.js';
export function union(intervals) {
  let total=0, end=-Infinity;
  for (const [a,b] of intervals.sort((a,b)=>a[0]-b[0])) { if (b>a) { total+=Math.max(0,b-Math.max(end,a)); end=Math.max(end,b); } }
  return total;
}
export function queryOptions(q = {}) {
  if (!q || typeof q !== 'object' || Array.isArray(q) || Object.keys(q).some(k=>!['project','feature','since','until','limit','offset'].includes(k))) throw new Error('Invalid metrics query');
  for (const key of ['project','feature']) if (q[key] != null && (typeof q[key] !== 'string' || q[key].length>1024)) throw new Error('Invalid query identity');
  for (const key of ['since','until']) if (q[key] != null && !Number.isFinite(Date.parse(q[key]))) throw new Error('Invalid query date');
  if (q.since && q.until && Date.parse(q.since)>Date.parse(q.until)) throw new Error('Invalid query interval');
  for (const key of ['limit','offset']) if (q[key] != null && (!Number.isInteger(q[key]) || q[key]<0 || q[key]>(key==='limit'?1000:20000))) throw new Error('Invalid query bound');
  return q;
}
export async function report(q = {}, store = new MetricsStore()) {
  queryOptions(q);
  const inventory = await store.read();
  const project = q.project ? await store.identity(q.project).catch(()=>null) : null;
  const feature = q.feature ? await store.identity(q.feature).catch(()=>null) : null;
  const rows = inventory.records.map(x=>x.record).filter(r=>(!q.project || r.projectId===project) && (!q.feature || r.featureIds.includes(feature))
    && (!q.since || r.startedAt>=Date.parse(q.since)) && (!q.until || r.startedAt<=Date.parse(q.until)));
  const byId = new Map(rows.map(r=>[r.id,r]));
  const finite = rows.filter(r=>r.durationMs!==null);
  const childMap=new Map(), workerChildren=new Map();
  for(const child of finite){
    if(child.parentId){if(!childMap.has(child.parentId))childMap.set(child.parentId,[]);childMap.get(child.parentId).push(child);}
    if(!child.worker)continue;
    let id=child.parentId;const seen=new Set();
    while(id && !seen.has(id) && seen.size<100){seen.add(id);const parent=byId.get(id);if(!parent)break;if(parent.worker){if(!workerChildren.has(id))workerChildren.set(id,[]);workerChildren.get(id).push(child);break;}id=parent.parentId;}
  }
  const workers=finite.filter(r=>r.worker).map(r=>{
    const descendants=workerChildren.get(r.id)??[];
    const covered=descendants.filter(child=>child.clock===r.clock).map(child=>[Math.max(r.startedAt,child.startedAt),Math.min(r.startedAt+r.durationMs,child.startedAt+child.durationMs)]);
    return {...r,workerMs:r.workMs??(descendants.some(child=>child.clock!==r.clock)?0:Math.max(0,r.durationMs-union(covered)))};
  });
  const clocks = [...new Set(finite.map(r=>r.clock))];
  const operations=finite.map(r=>{const children=(childMap.get(r.id)??[]).filter(c=>c.clock===r.clock);return {...r,exclusiveMs:Math.max(0,r.durationMs-union(children.map(c=>[Math.max(r.startedAt,c.startedAt),Math.min(r.startedAt+r.durationMs,c.startedAt+c.durationMs)])))};});
  const operationCost=[...new Set(operations.map(r=>r.label))].map(label=>({label,executions:operations.filter(r=>r.label===label).length,exclusiveMs:operations.filter(r=>r.label===label).reduce((sum,r)=>sum+r.exclusiveMs,0)})).sort((a,b)=>b.exclusiveMs-a.exclusiveMs);
  const cost = CATEGORIES.map(category=>{
    const group=workers.filter(r=>r.category===category);
    return { category, executions:group.length, workerMs:group.reduce((s,r)=>s+r.workerMs,0), ids:group.slice(0,1000).map(r=>r.id),idsTruncated:group.length>1000 };
  }).filter(x=>x.executions).sort((a,b)=>b.workerMs-a.workerMs);
  const repeated = new Map();
  for (const r of rows.filter(r=>r.commandId && r.worker)) { const key=`${r.projectId}:${r.commandId}`; if (!repeated.has(key)) repeated.set(key,[]); repeated.get(key).push(r); }
  const repetitions=[...repeated.values()].filter(g=>g.length>1).map(g=>({ commandId:g[0].commandId, executions:g.length,
    classification:g.every(r=>r.inputId && r.inputId===g[0].inputId) ? 'matching-observed-inputs' : 'possible-repeat',
    ids:g.slice(0,1000).map(r=>r.id), reasons:g.slice(0,1000).map(r=>r.reason),idsTruncated:g.length>1000, conclusion:'Repetition does not authorize skipping.' }));
  const gaps = ['Commands outside instrumented entrypoints are unobserved.', 'Known-execution denominator is unknown unless reconciled with source receipts.', 'No cross-host critical path is inferred.'];
  if (rows.some(r=>r.summary)) gaps.push('Some detail expired; summary drilldown is unavailable.');
  if (rows.some(r=>r.parentId && !byId.has(r.parentId))) gaps.push('Parent spans outside this dataset are unavailable.');
  const featureTotals=new Map();for(const r of workers)for(const id of r.featureIds)featureTotals.set(id,(featureTotals.get(id)??0)+r.workerMs);
  const featureAttribution=[...featureTotals].map(([featureId,workerMs])=>({featureId,workerMs,note:'Attribution overlaps for shared work; do not sum across features.'}));
  const records=rows.map(r=>({...r,projectAlias:`project-${r.projectId.slice(0,8)}`})).sort((a,b)=>a.startedAt-b.startedAt);
  return { schemaVersion:1, collectorVersion:'performance/1', window:{since:q.since??null,until:q.until??null},
    totals:{ records:rows.length, workerMs:workers.reduce((s,r)=>s+r.workerMs,0),
      observedElapsedMs:clocks.length<=1 ? union(finite.filter(r=>r.category!=='poll').map(r=>[r.startedAt,r.startedAt+r.durationMs])) : null,
      elapsedByClock:clocks.map(clock=>({clock,ms:union(finite.filter(r=>r.clock===clock).map(r=>[r.startedAt,r.startedAt+r.durationMs]))})), cpuMs:null,cost:workers.length && workers.every(r=>r.cost!==null) ? workers.reduce((s,r)=>s+r.cost,0):null },
    coverage:{knownExecutionDenominator:null, incomplete:rows.filter(r=>r.durationMs===null).length+inventory.incomplete, gaps},
    milestones:rows.filter(r=>r.outcome==='PASS' && ['authorize-implementation','candidate.ready','accept','milestone:acceptance','merge.execute','integration.observe','milestone:completion','run.pause','run.continue'].includes(r.label)).map(r=>({id:r.id,label:r.label,at:r.startedAt,featureIds:r.featureIds})).slice(0,1000),
    cost, operationCost, featureAttribution:featureAttribution.slice(0,1000), repetitions:repetitions.slice(0,1000), detailListsTruncated:rows.length>1000, reuse:rows.filter(r=>r.category==='reuse').slice(0,1000).map(r=>({id:r.id,outcome:r.outcome,reason:r.reason})),
    pagination:{offset:q.offset??0,limit:q.limit??200,total:records.length},
    records:records.slice(q.offset??0,(q.offset??0)+(q.limit??200)) };
}
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderReport(value, format='json') {
  if(format==='json')return JSON.stringify(value,null,2);
  const lines=['# GateReeve performance', '', `Observed records: ${value.totals.records}`, `Worker time: ${value.totals.workerMs.toFixed(1)} ms`, `Observed elapsed: ${value.totals.observedElapsedMs ?? 'unknown across clocks'} ms`, '', '## Capture limits', ...value.coverage.gaps.map(g=>`- ${g}`), `- Incomplete records: ${value.coverage.incomplete}`, '', '## Cost', '| Category | Executions | Worker ms |','|---|---:|---:|',...value.cost.map(c=>`| ${c.category} | ${c.executions} | ${c.workerMs.toFixed(1)} |`), '', '## Observed operation cost (exclusive ms)',...value.operationCost.map(o=>`- ${o.label}: ${o.exclusiveMs.toFixed(1)} ms across ${o.executions} observations`), '', '## Repetition and reuse', ...value.repetitions.map(r=>`- ${r.executions} executions: ${r.classification}. ${r.conclusion}`), ...value.reuse.map(r=>`- ${r.outcome}: ${r.reason}`), '', '## Timeline (selected page)', ...value.records.map(r=>`- ${new Date(r.startedAt).toISOString()} ${r.category}: ${r.outcome}, ${r.durationMs ?? 'unknown'} ms [${r.id}]`)];
  if(format==='markdown')return lines.join('\n');
  if(format!=='html')throw new Error('Unknown report format');
  const categories=[...new Set(value.records.map(r=>r.category))];
  const filters=categories.map(c=>`<input type="radio" name="category" id="filter-${c}"><label for="filter-${c}">${escape(c)}</label>`).join(' ');
  const css=categories.map(c=>`#filter-${c}:checked ~ .timeline .event:not([data-category="${c}"]){display:none}`).join('\n');
  const timeline=value.records.map(r=>`<details class="event" data-category="${r.category}"><summary>${escape(new Date(r.startedAt).toISOString())} · ${escape(r.category)} · ${escape(r.outcome)} · ${r.durationMs??'unknown'} ms</summary><pre>${escape(JSON.stringify(r,null,2))}</pre></details>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>GateReeve performance</title><style>body{font:16px system-ui;max-width:1000px;margin:3rem auto;padding:1rem;color:#18312d;background:#f5f8f6}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary,label{cursor:pointer}.event{padding:12px;border-bottom:1px solid #cad8d3}input:checked+label{font-weight:bold}label{margin-right:12px}${css}</style><h1>GateReeve performance</h1><pre>${escape(lines.slice(2,lines.indexOf('## Timeline (selected page)')).join('\n'))}</pre><h2>Timeline</h2><p>Filter the selected page by category; expand a record for provenance. Use query dates and pagination to select another window.</p><input type="radio" name="category" id="filter-all" checked><label for="filter-all">All</label> ${filters}<div class="timeline">${timeline}</div><details><summary>Structured report and aggregate identities</summary><pre>${escape(JSON.stringify(value,null,2))}</pre></details></html>`;
}
export async function status(store=new MetricsStore()) { const inventory=await store.read(); return { schemaVersion:1, settings:await store.config(), bytes:inventory.bytes, records:inventory.records.length, incomplete:inventory.incomplete+inventory.records.filter(x=>x.record.durationMs===null).length, blindSpots:['Uninstrumented commands','Unavailable remote details'], activation:'Collector version describes this process only; existing sessions may be uninstrumented.' }; }
