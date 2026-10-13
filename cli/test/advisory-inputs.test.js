import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isAdvisoryWorkflowRecord } from '../../plugin-src/shared/resources/protocol/advisory-inputs.js';
const feature=new URL('../../docs/issues/tb-boundary-iteration-cost/',import.meta.url);
for (const name of ['pr-77/attempts/s1-pr77-a1/preparation-unavailable.json',
 'pr-77/attempts/s1-pr77-a2/provider-unavailable.json','pr-77/attempts/s1-pr77-a2/validation-correction.json',
 'runtime/s1-integration.json','runtime/s2-model-migration-impact.json','runtime/s3-integration.json','runtime/s4-cost-verification.json']) {
 test(`historical mechanical record ${name} has a bounded recognized shape; configuration additions are not history`,async()=>{
  const value=JSON.parse(await readFile(new URL(name,feature)));
  assert.equal(isAdvisoryWorkflowRecord(value),true);
  assert.equal(isAdvisoryWorkflowRecord({...value,productionMode:'changed'}),false);
  assert.equal(isAdvisoryWorkflowRecord({filename:name,status:value.status}),false);
 });
}

test('empty history needs actual invalidation and superseding journal proof; empty/config-shaped new files still block', async t => {
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {createHash}=await import('node:crypto');const exec=promisify(execFile);
 const core=await import('../../plugin-src/shared/resources/protocol/index.js');
 const {opaqueAdvisoryInputIdentity}=await import('../../plugin-src/shared/resources/protocol/advisory-inputs.js');
 const {loadHistoricalModel}=await import('./helpers/historical-model.js');
 const root=await mkdtemp(join(tmpdir(),'advisory-legacy-record-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=async(...args)=>(await exec('git',['-c','core.hooksPath=/dev/null','-C',root,...args])).stdout.trim();
 await git('init','-b','main');await git('config','user.name','Fixture');await git('config','user.email','fixture@example.invalid');
 const home=join(root,'docs/issues/feature');const agent={kind:'agent',label:'fixture'},human={kind:'human-confirmed',label:'fixture'};
 await core.initializeFeature({featureHome:home,featureId:'feature',model:await loadHistoricalModel(),actor:agent});
 await writeFile(join(home,'design.md'),'# Design\n**Status:** approved\n');await writeFile(join(home,'spec.md'),'# Spec\n| R1 | behavior | pass | fail | evidence |\n');
 await core.recordFeatureTransition(home,'approve-design',{actor:human});await core.recordFeatureTransition(home,'validate-spec',{actor:agent,facts:{specValidationCurrent:true}});
 await core.recordFeatureTransition(home,'authorize-plan',{actor:human});await core.proposeSlice(home,{sliceId:'s1',scope:'SLICE',actor:agent});
 await core.recordSliceTransition(home,'plan-slice','s1',{actor:agent});await core.recordSliceTransition(home,'start-slice','s1',{actor:agent,facts:{sliceReadinessCurrent:true}});
 const commit=async()=>{await git('add','.');await git('commit','-m','fixture');return git('rev-parse','HEAD');};const base=await commit();
 await core.recordSliceTransition(home,'begin-boundary','s1',{actor:agent,payload:{attemptId:'a1',scope:'SLICE',context:{headSha:base,baseSha:base}}});
 const path='pr-1/attempts/a1/invalidated.json';await mkdir(join(home,'pr-1/attempts/a1'),{recursive:true});await writeFile(join(home,path),'');
 const bytesHash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
 const first=await core.recordGateOutcome(home,{attemptId:'a1',gateId:'pinContext',outcome:'PASS',inputs:{fixture:1},actor:agent,evidence:{path,hash:bytesHash('')}});
 await core.invalidateGates(home,{attemptId:'a1',gateIds:['pinContext'],reason:'Empty provisional evidence rejected',actor:agent});
 const content=JSON.stringify({schemaVersion:1,pullRequest:1,evaluatedSourceSha:base,mergeBaseSha:base});const replacement='pr-1/attempts/a1/context.json';
 await writeFile(join(home,replacement),content);
 await core.recordGateOutcome(home,{attemptId:'a1',gateId:'pinContext',outcome:'PASS',inputs:{fixture:2},currentFingerprints:{pinContext:first.inputFingerprint},actor:agent,evidence:{path:replacement,hash:bytesHash(content)}});
 let head=await commit();
 const check=async()=>{const c=await core.buildCompactReviewInput({repositoryRoot:root,featureHome:home,baseSha:base,headSha:head,sliceBaseSha:base,scope:'FEATURE'});try{return await opaqueAdvisoryInputIdentity(root,c);}finally{await c.cleanup();}};
 assert.match(await check(),/^sha256:/);
 await writeFile(join(home,path),'{"productionMode":"changed"}');head=await commit();await assert.rejects(check(),/changed ambiguous/);
 await writeFile(join(home,path),'');await writeFile(join(home,'pr-1/attempts/a1/unregistered.json'),'');head=await commit();
 await assert.rejects(check(),/unregistered.json/);
});
