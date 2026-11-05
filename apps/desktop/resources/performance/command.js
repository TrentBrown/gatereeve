#!/usr/bin/env node
import { runMeasured } from './run.js';
const args=process.argv.slice(2);const separator=args.indexOf('--');
if(separator<0||separator===args.length-1){process.stderr.write('Usage: node performance/command.js [--category unit] [--reason initial] [--project identity] [--feature identity] -- command args...\n');process.exitCode=2;}
else {
  const options={};
  for(let i=0;i<separator;i+=2){const key=args[i]?.replace(/^--/,'');if(!['category','reason','project','feature'].includes(key)||i+1>=separator)throw new Error('Invalid measurement wrapper option');options[key]=args[i+1];}
  const result=await runMeasured(args[separator+1],args.slice(separator+2),options);
  if(result.signal)process.kill(process.pid,result.signal);else process.exitCode=result.code??1;
}
