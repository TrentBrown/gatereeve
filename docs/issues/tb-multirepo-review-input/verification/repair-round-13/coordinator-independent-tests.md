# Independent classifier controls

Nine cases passed: original emitted audit, wrong filename, wrong kind, wrong version, malformed shape, oversize, ordinary ambiguous configuration, executable mode, small existing record.

```javascript
import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,chmod} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {tmpdir} from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);const installed='/Users/trent.brown/.codex/plugins/cache/quality-code/agentic-development-workflow/0.1.0-rc.16/resources/protocol';const original=await import(installed+'/advisory-inputs.js');const root=await mkdtemp(join(tmpdir(),'gr-large-audit-classification-'));let code=await readFile(installed+'/advisory-inputs.js','utf8');
code=code.replaceAll("from './", "from '"+pathToFileURL(installed+'/').href);
const before=`    if (path.endsWith('.json') && size <= 128 * 1024) {
      try {
        recognized = isAdvisoryWorkflowRecord(
          JSON.parse(await git(root, ['show', sha + ':' + path]))
        );`;
const after=`    const largeAudit = path.endsWith('/judge-view-audit.json') && /^100644 blob /u.test(entry) && size <= 12 * 1024 * 1024;
    if (path.endsWith('.json') && (size <= 128 * 1024 || largeAudit)) {
      try {
        const value = JSON.parse(await git(root, ['show', sha + ':' + path]));
        recognized = isAdvisoryWorkflowRecord(value) && (size <= 128 * 1024 ||
          value.kind === 'review-view-audit' && value.schemaVersion === 1 &&
          exact(value, ['schemaVersion','kind','source','view','excludedPaths','metrics']) &&
          value.source && value.view && value.metrics && Array.isArray(value.excludedPaths) && value.excludedPaths.every(path=>typeof path==='string'));`;
assert.ok(code.includes(before));code=code.replace(before,after);const temp=join(root,'advisory-inputs.mjs');await writeFile(temp,code);const modified=await import(pathToFileURL(temp));
const audit=await readFile('/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/docs/issues/tb-multirepo-review-input/pr-84/attempts/formal-pr84-13/judge-view-audit.json');const parsed=JSON.parse(audit);const path='docs/issues/feature/pr-84/attempts/formal/judge-view-audit.json';
const tests=[['actual133059',path,audit,true],['wrong-name',path.replace('judge-view-audit','configuration'),audit,false],['other-known-kind',path,JSON.stringify({...parsed,kind:'feature-verification'}),false],['wrong-schema',path,JSON.stringify({...parsed,schemaVersion:2}),false],['malformed-audit',path,JSON.stringify({schemaVersion:1,kind:'review-view-audit',payload:'x'.repeat(140000)}),false],['over12MiB',path,JSON.stringify({...parsed,excludedPaths:['x'.repeat(12*1024*1024)]}),false],['ordinary-ambiguous',path.replace('judge-view-audit','config'),JSON.stringify({setting:'value'}),false],['small-existing-kind',path.replace('judge-view-audit','small'),JSON.stringify({kind:'feature-verification',schemaVersion:1,payload:{}}),true],['executable-large',path,audit,false,'755']];
for(const [name,file,bytes,expected,mode] of tests){const repo=join(root,name);await mkdir(repo);const git=async args=>(await exec('/usr/bin/git',['-C',repo,...args])).stdout.trim();await git(['init','-b','topic']);await git(['config','user.name','Fixture']);await git(['config','user.email','fixture@example.test']);await git(['-c','commit.gpgsign=false','commit','--allow-empty','-m','base']);const base=await git(['rev-parse','HEAD']);await mkdir(join(repo,file,'..'),{recursive:true});await writeFile(join(repo,file),bytes);if(mode)await chmod(join(repo,file),0o755);await git(['add','.']);await git(['-c','commit.gpgsign=false','commit','-m','audit']);const head=await git(['rev-parse','HEAD']);const compact={change:{source:{baseSha:base,headSha:head}},excludedPaths:[file]};let originalOK=true,modifiedOK=true;try{await original.opaqueAdvisoryInputIdentity(repo,compact);}catch{originalOK=false;}try{await modified.opaqueAdvisoryInputIdentity(repo,compact);}catch{modifiedOK=false;}assert.equal(modifiedOK,expected,name);if(name==='actual133059')assert.equal(originalOK,false);if(name!=='actual133059')assert.equal(originalOK,modifiedOK,name);console.log(JSON.stringify({name,bytes:Buffer.byteLength(bytes),originalOK,modifiedOK}));}
console.log(JSON.stringify({root,limit:'Tests proposed temporary classifier only; no installed module, repository source or governing event changed'}));

```
