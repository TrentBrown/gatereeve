// Use alongside the normal Node reporter; compact capture never owns test output.
import { record } from './observe.js';
import { randomUUID } from 'node:crypto';
const invocation=randomUUID();
export default async function* reporter(source) {
  const starts=new Map();let ordinal=0;
  for await(const event of source){
    const data=event.data??{}; if(data.nesting!==0)continue; const key=JSON.stringify([data.file,data.name,data.nesting,data.testNumber]);
    if(event.type==='test:start'){if(starts.size>=1000)starts.delete(starts.keys().next().value);starts.set(key,Date.now());}
    if(!['test:pass','test:fail'].includes(event.type))continue;
    const start=starts.get(key);starts.delete(key);
    if(data.nesting!==0)continue;
    const duration=data.details?.duration_ms;
    await record({id:`node:${invocation}:${ordinal++}`,project:process.cwd(),category:'unit',command:JSON.stringify([data.file,data.name]),startedAt:start??Date.now(),durationMs:Number.isFinite(duration)&&duration>=0?duration:null,provenance:start==null?'estimated':'observed',outcome:event.type==='test:pass'?'PASS':'FAIL',worker:true});
  }
}
