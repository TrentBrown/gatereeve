#!/usr/bin/env node
// Reproducible structural measurements. No provider launches or latency claims.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCompactReviewInput } from '../../plugin-src/shared/resources/protocol/index.js';
const exec=promisify(execFile);
const scratch=await mkdtemp(join(tmpdir(),'gatereeve-cost-'));
const git=async(root,...args)=>(await exec('git',['-c','core.hooksPath=/dev/null','-C',root,...args],{maxBuffer:1024*1024})).stdout.trim();
async function measure(name,repositoryRoot,featureHome,baseSha,headSha,sliceBaseSha=baseSha){
 const compact=await buildCompactReviewInput({repositoryRoot,featureHome,baseSha,headSha,sliceBaseSha,scope:'FEATURE'});
 try {const metrics=compact.audit.metrics;
  return {name,source:{baseSha,headSha,sliceBaseSha},metrics,
   inlineManifestFractionOfReferencedText:metrics.manifestBytes/metrics.materialBytes,
   retainedBinaryBlobsAndRepositorySnapshot:'excluded from text-byte metric'};
 }finally{await compact.cleanup();}
}
try {
 const repo=join(scratch,'fixture');await mkdir(repo);
 await git(repo,'init','-b','main');await git(repo,'config','user.name','Cost Fixture');await git(repo,'config','user.email','fixture@example.invalid');
 const home=join(repo,'docs/issues/cost');await mkdir(home,{recursive:true});
 await writeFile(join(home,'spec.md'),'# Approved spec\n| R1 | large text, rename and binary fidelity | pass | fail | evidence |\n');
 await writeFile(join(home,'design.md'),'# Approved design\n**Status:** approved\n');
 await writeFile(join(repo,'original.txt'),'baseline material\n'.repeat(100));
 await writeFile(join(repo,'image.bin'),Buffer.from([0,1,2,3]));await git(repo,'add','.');await git(repo,'commit','-m','original fixture');
 const base=await git(repo,'rev-parse','HEAD');
 await git(repo,'mv','original.txt','renamed.txt');await writeFile(join(repo,'renamed.txt'),'baseline material\n'.repeat(99)+'substantive changed line\n');
 await writeFile(join(repo,'image.bin'),Buffer.from([0,4,5,6]));
 await writeFile(join(repo,'large.txt'),'0123456789abcdef\n'.repeat(Math.ceil(24*1024*1024/17)));
 await git(repo,'add','.');await git(repo,'commit','-m','large text with rename and binary edit');const head=await git(repo,'rev-parse','HEAD');
 const cases=[await measure('24 MiB text, identical feature/slice range, rename and binary fixture',repo,home,base,head)];
 if(process.argv.includes('--mylifemap')) {
  const historical=JSON.parse(await readFile(resolve(import.meta.dirname,'../../docs/issues/tb-boundary-iteration-cost/s1-historical-packet-metrics.json')));
  const root=process.argv[process.argv.indexOf('--mylifemap')+1];
  cases.push(await measure('Read-only historical MyLifeMap pinned range',root,join(root,'docs/issues/tb-mylifemap-ai-studio'),
   historical.source.baseSha,historical.source.headSha,historical.source.sliceBaseSha));
 }
 const report={schemaVersion:1,kind:'structural-cost-verification',cases,
  orchestration:{evidence:'cli/test/advisory.test.js complete readiness-to-retry journey; cli/test/boundary-retry.test.js',
   formalAttemptsBeforeAdvisoryDefectDiscovery:0,formalAttemptsAfterRevisedReadyAndInterruptedResume:1,
   duplicateAttemptEventsAfterInterruptedResume:0,duplicateGateEventsAfterUncertainRecord:0,
   commandContract:'One shared coordinator entrypoint, repeated for advance/record/packet/finalize. Skill/native reviewers still execute substantive work.',
   bookkeepingCommitPushCheckpoints:3,
   bookkeepingLimitation:'Checkpoint count is the verified sequential contract, not a measured reduction versus historical manual operator actions.'},
  timing:{measuredModelLatency:false,historicalWallClockEstimates:'No estimates used as measured savings'},
  proof:'Synthetic input and provider-contract fixtures; optional actual read-only historical source rehearsal. No installed activation, publication or real-feature journal mutation.'};
 const output=process.argv[process.argv.indexOf('--output')+1];
 if(process.argv.includes('--output'))await writeFile(output,JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
}finally{await rm(scratch,{recursive:true,force:true});}
