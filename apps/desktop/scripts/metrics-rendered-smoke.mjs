import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { withScratch } from '../../../plugin-src/shared/resources/storage/scratch.js';
const electron=createRequire(import.meta.url)('electron');
await withScratch({purpose:'metrics-rendered-smoke'},async scratch=>{
  await new Promise((resolvePromise,reject)=>{
    const child=spawn(electron,[resolve(import.meta.dirname,'metrics-rendered-smoke.cjs'),...process.argv.slice(2)],{env:{...process.env,GATEREEVE_METRICS_SMOKE_ROOT:scratch.path},stdio:['ignore','pipe','inherit']});
    let receipt=false;
    child.stdout.on('data',chunk=>{process.stdout.write(chunk);if(chunk.toString().includes('"frameRendered":true'))receipt=true;});
    const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);code===0&&receipt?resolvePromise():reject(Error(`Rendered smoke failed: ${code??signal}; receipt=${receipt}`));});
  });
});
