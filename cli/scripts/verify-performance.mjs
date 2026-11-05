import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { withScratch } from '../../plugin-src/shared/resources/storage/scratch.js';
const root=resolve(import.meta.dirname,'../..');
const commands=[
  {args:['--test','test/performance.test.js','test/portability.test.js'],cwd:join(root,'cli')},
  ['--test','cli/test/cli.test.js','cli/test/gatereeve-cli.test.js','cli/test/stage-protocol.test.js','cli/test/current-planning.test.js','cli/test/current-environment.test.js'],
  ['--test','apps/desktop/test/metrics-view.test.js','apps/desktop/test/ipc.test.js','apps/desktop/test/contracts.test.js','apps/desktop/test/terminal-renderer.test.js','apps/desktop/test/stage-protocol.test.js'],
  ['--test','--test-name-pattern=actual runner receipts|one fresh evaluator|current run preserves|readiness is a declaration','cli/test/current-core.test.js'],
];
await withScratch({purpose:'workflow-performance-verification'},async scratch=>{
  for(const command of commands)await new Promise((resolve,reject)=>{
    const args=Array.isArray(command)?command:command.args;const cwd=Array.isArray(command)?root:command.cwd;
    const child=spawn(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,GATEREEVE_METRICS_DIR:join(scratch.path,'metrics'),GATEREEVE_METRICS:'on'}});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`Verification exited ${code??signal}`)));
  });
});
