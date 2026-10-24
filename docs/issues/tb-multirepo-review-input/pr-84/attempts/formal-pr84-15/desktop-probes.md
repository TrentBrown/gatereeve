# Independent before-repair probe

Executed against pinned formal13 source; see recorded findings.

```javascript
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const source='/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-sAd2ki/repository';
const imports=async p=>import(pathToFileURL(p));
const root=await mkdtemp(join(tmpdir(),'gr-formal13-desktop-probes-'));
const canonical=await imports(join(source,'plugin-src/shared/resources/protocol/python-guards.js'));
const {currentFixture}=await imports(join(source,'cli/test/helpers/current-fixture.js'));
const {discoverCompatiblePythonExecutable}=await imports(join(source,'apps/desktop/main/executable-discovery.js'));
const t={after(){}};
async function stage(name,full=false){
 const dest=join(root,name);await mkdir(join(dest,'resources'),{recursive:true});await mkdir(join(dest,'main'));await writeFile(join(dest,'package.json'),'{"type":"module"}\n');
 await cp(join(source,'plugin-src/shared/resources/protocol'),join(dest,'resources/protocol'),{recursive:true});await cp(join(source,'plugin-src/shared/resources/release'),join(dest,'resources/release'),{recursive:true});
 const text=await readFile(join(source,'apps/desktop/scripts/stage-protocol.mjs'),'utf8');
 const paths=full?['scripts']:[...text.matchAll(/'(scripts\/[^']+)'/g)].map(x=>x[1]);
 for(const p of paths){await mkdir(join(dest,'resources',p,'..'),{recursive:true});await cp(join(source,'plugin-src/shared/resources',p),join(dest,'resources',p),{recursive:true});}
 await cp(join(source,'apps/desktop/main/protocol-adapter.js'),join(dest,'main/protocol-adapter.js'));
 return dest;
}
const partial=await stage('actual-desktop-subset');
const f1=await currentFixture(t);const options={pythonExecutable:'/opt/homebrew/bin/python3',environment:{...process.env}};
const receipt=await canonical.runTrustedPythonGuard('spec.validation.current',[f1.home],options);assert.equal(receipt.passed,true);await canonical.assertTrustedPythonProof(receipt,options);
const staged=await imports(join(partial,'resources/protocol/python-guards.js'));
const otherBinding=await staged.trustedPythonBinding('spec.validation.current',options);
let rejection;try{await staged.assertTrustedPythonProof(receipt,options);}catch(e){rejection=e.message;}assert.equal(rejection,'Trusted validator proof is stale or unavailable');
console.log(JSON.stringify({case:'F1',canonicalProof:'PASS',canonicalApplicability:'PASS',canonicalHelpers:receipt.binding.helpers.length,desktopHelpers:otherBinding.helpers.length,desktopRejection:rejection}));
await writeFile(join(root,'canonical-spec-proof.json'),JSON.stringify(receipt,null,2));
const full=await stage('equalized-helper-control',true);
const f2=await currentFixture(t);await mkdir(join(root,'gui-path'));const savedPath=process.env.PATH;process.env.PATH=join(root,'gui-path');
try{
 const discovered=await discoverCompatiblePythonExecutable();assert.ok(discovered);f2.core.runtime.pythonGuardOptions={pythonExecutable:discovered,environment:{...process.env}};
 const request=(operation,input={},operationId)=>f2.core.execute({operation,input,operationId});
 const authority={kind:'human-confirmed',instruction:'Approve fixture requirements',context:'Disposable independent probe'};
 await request('run.start',{runId:'desktop-established',implementers:['probe']},'start');
 const design=await f2.core.store.capture('design.md');await request('human.decide',{kind:'approve-design',subject:design.hash,authority,reason:'Approve',consequences:'Validate'},'design');
 await request('spec.validate',{},'spec');const commitments=await f2.core.commitments();await request('human.decide',{kind:'authorize-implementation',subject:commitments.subject,authority,reason:'Approve',consequences:'Implement'},'implementation');
 const native=await f2.core.check('implementation');assert.equal(native.allowed,true);
 const {createProtocolAdapter}=await imports(join(full,'main/protocol-adapter.js'));
 const desktop=createProtocolAdapter({gitExecutable:'/usr/bin/git',pythonExecutable:discovered});await desktop.resolve(f2.repo);const snapshot=await desktop.snapshot(f2.home);const implementation=snapshot.milestones.find(x=>x.name==='implementation');assert.equal(implementation.allowed,false);assert.ok(implementation.missing.includes('current trusted specification validator proof'));
 console.log(JSON.stringify({case:'F2',guiPATH:process.env.PATH,discoveredPython:discovered,nativeAllowed:native.allowed,phase:snapshot.current.phase,desktopAllowed:implementation.allowed,desktopMissing:implementation.missing,control:'Both helper trees equalized; actual native spec proof and implementation authorization, not DESIGNING'}));
}finally{process.env.PATH=savedPath;}
const archive='/tmp/gr-repair12-package.vSKSsA/application/GateReeve-darwin-universal/GateReeve.app/Contents/Resources/app.asar';
let error;try{await exec('/opt/homebrew/bin/python3',[join(archive,'resources/scripts/pattern_tool.py'),'--help']);}catch(e){error={code:e.code,stderr:e.stderr};}assert.equal(error.code,2);assert.match(error.stderr,/Not a directory|No such file/);
console.log(JSON.stringify({case:'F3',actualArchivedScript:join(archive,'resources/scripts/pattern_tool.py'),externalPython:error,limit:'Actual packaged helper invocation; not an Electron observer entrypoint yet'}));
console.log(JSON.stringify({probeRoot:root}));

```
