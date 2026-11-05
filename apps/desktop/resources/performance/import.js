import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MetricsStore } from './store.js';
const exec=promisify(execFile);
const time = v => typeof v==='number' && Number.isFinite(v) ? v : typeof v==='string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const outcome = v => ['passed','pass','success','ok'].includes(v) ? 'PASS' : ['failed','fail','failure','timed_out'].includes(v) ? 'FAIL' : ['skipped','pending','todo'].includes(v) ? 'SKIPPED' : ['cancelled','interrupted'].includes(v) ? 'CANCELLED' : 'UNAVAILABLE';
export async function importMetrics(format, data, options = {}, store=new MetricsStore()) {
  if (Buffer.byteLength(JSON.stringify(data))>4*1024*1024)throw new Error('Metrics import exceeds 4 MiB');
  const rows=[]; const gaps=[]; const diagnostic=(await store.config()).diagnosticDetails; let diagnosticCount=0; const project=options.project ?? 'unknown'; const clock=options.clock ?? `import:${options.execution ?? 'unknown'}`;
  if(typeof options.execution!=='string' || !options.execution || options.execution.length>1024)throw new Error('Import requires stable execution identity');
  const add=(id,value)=>{if(rows.length>=10000)throw new Error('Import exceeds 10000 records'); rows.push({id:`${format}:${options.execution}:${id}`,project,feature:options.feature,clock,location:format==='github'?'ci':'local',category:format==='playwright'?'browser':'unit',worker:true,reason:options.reason,parentId:options.parentId,...value});};
  if(format==='github') {
    if(!Array.isArray(data.jobs))throw new Error('Expected GitHub jobs');
    for(const job of data.jobs) {
      if(!Number.isInteger(job.id))throw new Error('Missing CI job identity');
      const started=time(job.started_at),ended=time(job.completed_at);
      if(started===null)gaps.push('CI job start unavailable');
      add(`job:${job.id}`,{category:'verification',source:job.head_sha,workflow:job.workflow_name,environment:job.labels?JSON.stringify(job.labels):null,attempt:options.execution,startedAt:started??options.observedAt??Date.now(),provenance:started===null?'estimated':'observed',durationMs:started!==null && ended!==null && ended>=started ? ended-started : null,outcome:outcome(job.conclusion),command:`ci-job:${job.name}`, input:null});
      for(const step of job.steps??[]) {
        const a=time(step.started_at),b=time(step.completed_at);
        if(a===null)gaps.push('CI step timing unavailable');
        add(`job:${job.id}:step:${step.number}`,{parentId:`${format}:${options.execution}:job:${job.id}`,category:'setup',worker:false,startedAt:a??options.observedAt??Date.now(),provenance:a===null?'estimated':'observed',durationMs:a!==null && b!==null && b>=a ? b-a : null,outcome:outcome(step.conclusion),command:`ci-step:${step.name}`});
      }
    }
    gaps.push('Run-to-job delay may include dependencies; pure queue duration unavailable.');
  } else if(format==='release') {
    if(data.kind!=='gatereeve-coordinated-release'||!Array.isArray(data.stages))throw new Error('Expected release lifecycle receipt');
    for(const stage of data.stages){const at=time(stage.completedAt);if(at===null)gaps.push('Release stage timestamp unavailable');add(`stage:${stage.sequence}`,{category:'delivery',location:'release',label:'release-observation',command:stage.stage,evidence:stage.stageSha256,startedAt:at??options.observedAt??Date.now(),provenance:at===null?'estimated':'observed',durationMs:at===null?null:0,outcome:'PASS',worker:false});}
    gaps.push('Stage completion timestamps do not establish stage execution duration.');
  } else if(format==='vitest') {
    if(!Array.isArray(data.testResults))throw new Error('Expected Vitest JSON reporter testResults');
    for(const [i,suite] of data.testResults.entries()) {
      const a=time(suite.startTime),b=time(suite.endTime);
      if(a===null)gaps.push('Suite start unavailable');
      add(`suite:${i}`,{command:suite.name,startedAt:a??options.observedAt??Date.now(),provenance:a===null?'estimated':'observed',durationMs:a!==null && b!==null && b>=a ? b-a:null,outcome:outcome(suite.status), count:suite.assertionResults?.length});
    }
  } else if(format==='playwright') {
    if(!Array.isArray(data.suites))throw new Error('Expected Playwright JSON reporter suites');
    const visit=(suites,prefix='',depth=0)=>{
      if(depth>30)throw new Error('Reporter nesting exceeds bound');
      for(const [i,suite] of suites.entries()) {
        const path=`${prefix}/${i}`;
        // One bounded suite aggregate per retry ordinal. A recovered failure is
        // retained as its own attempt, never allowed to poison the later verdict.
        const attempts=new Map();
        for(const [specIndex,spec] of (suite.specs??[]).entries())for(const [testIndex,test] of (spec.tests??[]).entries())for(const [ordinal,r] of (test.results??[]).entries()){
          const retry=Number.isInteger(r.retry)&&r.retry>=0?r.retry:ordinal;
          if(!attempts.has(retry))attempts.set(retry,[]);
          attempts.get(retry).push({...r,identity:`${specIndex}:${testIndex}:${retry}`});
        }
        for(const [retry,results] of attempts){
          const timed=results.filter(r=>time(r.startTime)!==null && Number.isFinite(r.duration)&&r.duration>=0);
          const complete=timed.length===results.length;
          if(!complete)gaps.push('Some test timing unavailable');
          const start=timed.length?Math.min(...timed.map(r=>time(r.startTime))):options.observedAt??Date.now();
          const end=timed.length?Math.max(...timed.map(r=>time(r.startTime)+r.duration)):start;
          const id=`${path}:retry:${retry}`;
          add(id,{command:suite.file,attempt:`${options.execution}:retry:${retry}`,reason:retry?'retry':options.reason,startedAt:start,provenance:complete?'observed':'estimated',durationMs:complete?end-start:null,workMs:complete?timed.reduce((sum,r)=>sum+r.duration,0):null,count:results.length,outcome:results.some(r=>outcome(r.status)==='FAIL')?'FAIL':results.every(r=>outcome(r.status)==='PASS')?'PASS':'UNAVAILABLE'});
          if(diagnostic)for(const r of [...timed].sort((a,b)=>b.duration-a.duration)){
            if(diagnosticCount++>=10)break;
            add(`${id}:detail:${r.identity}`,{parentId:`${format}:${options.execution}:${id}`,worker:false,command:`${suite.file}:${r.identity}`,attempt:`${options.execution}:retry:${retry}`,startedAt:time(r.startTime),durationMs:r.duration,outcome:outcome(r.status)});
          }
        }
        visit(suite.suites??[],path,depth+1);
      }
    };visit(data.suites);
  } else if(format==='node') {
    if(!Array.isArray(data))throw new Error('Expected normalized Node test events');
    for(const [i,event] of data.entries()) {
      if(!['test:pass','test:fail'].includes(event.type))continue;
      const r=event.data; if(r?.nesting!==0 && (!diagnostic||diagnosticCount++>=10))continue; const duration=r?.details?.duration_ms; const start=time(event.startedAt);
      if(start===null){gaps.push('Node event has no absolute start; duration retained with estimated import timestamp');}
      add(`test:${i}`,{command:r?.name,startedAt:start??options.observedAt??Date.now(),durationMs:Number.isFinite(duration)&&duration>=0?duration:null,outcome:event.type==='test:pass'?'PASS':'FAIL',provenance:start===null?'estimated':'observed',worker:r?.nesting===0});
    }
  } else if(format==='verification') {
    if(!Array.isArray(data.receipts??data.steps??data.commands))throw new Error('Expected verification receipts');
    for(const [i,r] of (data.receipts??data.steps??data.commands).entries()) {
      const a=time(r.startedAt),b=time(r.completedAt??r.finishedAt);if(a===null)gaps.push('Receipt start unavailable');
      add(`check:${i}`,{category:'verification',command:JSON.stringify([r.command,r.args]),startedAt:a??options.observedAt??Date.now(),provenance:a===null?'estimated':'observed',durationMs:a!==null&&b!==null&&b>=a?b-a:null,outcome:r.outcome??(r.exitCode===0?'PASS':r.exitCode!=null?'FAIL':'UNAVAILABLE'),input:r.inputFingerprint??null});
    }
  } else throw new Error('Unsupported metrics import format');
  let imported=0;
  for(const r of rows)if(await store.put(r))imported++;
  return {schemaVersion:1, imported, gaps:[...new Set(gaps)], coverage:'Imported observations only; not proof of complete execution capture.'};
}
export async function fetchGitHubJobs(repository, run, attempt) {
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^\d+$/.test(String(run))||!/^\d+$/.test(String(attempt)))throw new Error('Expected repository, run ID and attempt');
  const {stdout}=await exec('gh',['api',`repos/${repository}/actions/runs/${run}/attempts/${attempt}/jobs?per_page=100`,'--paginate','--slurp'],{maxBuffer:4*1024*1024,timeout:30000});
  const pages=JSON.parse(stdout); return {jobs:pages.flatMap(p=>p.jobs??[])};
}
