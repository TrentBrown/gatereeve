// Bounded, reproducible enabled/disabled comparison; writes only requested output.
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { MetricsStore } from '../../plugin-src/shared/resources/performance/store.js';
import { observe } from '../../plugin-src/shared/resources/performance/observe.js';
import { withScratch } from '../../plugin-src/shared/resources/storage/scratch.js';
await withScratch({purpose:'metrics-benchmark'},async scratch=>{
const root=scratch.path;
const samples=[];
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'ignore',env:{...process.env,GATEREEVE_METRICS:'off'}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Workload exited ${code}`)));});
  for(const workload of ['short-command','validation'])for(let pair=0;pair<5;pair++)for(const enabled of pair%2?[true,false]:[false,true]){
    const store=new MetricsStore(join(root,`${workload}-${pair}-${enabled}`));await store.setConfig({enabled});
    const start=performance.now();const count=workload==='short-command'?20:1;
    for(let i=0;i<count;i++)await observe({project:'benchmark',category:'verification',worker:true},()=>run(workload==='short-command'?['-e','process.exit(0)']:['--test','cli/test/cli.test.js','cli/test/gatereeve-cli.test.js']),store);
    samples.push({workload,enabled,pair,count,durationMs:performance.now()-start});
  }
  const workloads=[...new Set(samples.map(s=>s.workload))].map(workload=>{
    const rows=samples.filter(s=>s.workload===workload);const avg=enabled=>{const group=rows.filter(s=>s.enabled===enabled);return group.reduce((s,r)=>s+r.durationMs,0)/group.length;};const delta=avg(true)-avg(false);
    return {workload,baselineMeanMs:avg(false),enabledMeanMs:avg(true),addedMs:delta,percent:100*delta/avg(false),samples:rows};
  });
  const populated=new MetricsStore(join(root,'populated'));
  for(let i=0;i<20000;i++)await populated.put({id:`seed-${i}`,project:'benchmark',category:'unit',startedAt:Date.now(),durationMs:1,outcome:'PASS'});
  const maintenanceStart=performance.now();
  await observe({project:'benchmark',category:'unit'},()=>42,populated);
  const reconciliationMs=performance.now()-maintenanceStart;
  const populatedSamples=[];
  for(let i=0;i<10;i++){const start=performance.now();await observe({project:'benchmark',category:'unit'},()=>42,populated);populatedSamples.push(performance.now()-start);}
  const populatedStore={retainedRecords:20000,reconciliationMs,steadyAddedMeanMs:populatedSamples.reduce((a,b)=>a+b,0)/populatedSamples.length,samples:populatedSamples,note:'Periodic retention reconciliation included separately; steady writes are single SQLite transactions independent of store size.'};
  const report={schemaVersion:1,node:process.version,platform:process.platform,arch:process.arch,createdAt:new Date().toISOString(),workloads,populatedStore,limits:['Single local machine; timing noise is retained.','Child workload collection is disabled in both modes; comparison isolates observer overhead.','No inference about other projects or production performance.']};
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
});
