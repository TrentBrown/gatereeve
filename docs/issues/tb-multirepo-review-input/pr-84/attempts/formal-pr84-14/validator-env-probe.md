# Independent before-repair probe

Executed against pinned formal13 source; see recorded findings.

```javascript
import assert from 'node:assert/strict';
const base='/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-sAd2ki/repository';
const {currentFixture}=await import(base+'/cli/test/helpers/current-fixture.js');
const {runTrustedPythonGuard,assertTrustedPythonProof,trustedPythonBinding}=await import(base+'/plugin-src/shared/resources/protocol/python-guards.js');
const f=await currentFixture({after(){}});const common={pythonExecutable:'/opt/homebrew/bin/python3'};
const before={...common,environment:{...process.env}};const after={...common,environment:{...process.env,GATEREEVE_OBSERVER_WINDOW_ID:'independent-disposable-window'}};
const proof=await runTrustedPythonGuard('spec.validation.current',[f.home],before);const other=await runTrustedPythonGuard('spec.validation.current',[f.home],after);assert.equal(proof.passed,true);assert.equal(other.passed,true);assert.equal(proof.stdout,other.stdout);assert.equal(proof.stderr,other.stderr);
const b=structuredClone(proof.binding),a=structuredClone(other.binding);delete a.environment;delete b.environment;assert.deepEqual(a,b);
let error;try{await assertTrustedPythonProof(proof,after);}catch(e){error=e.message;}assert.equal(error,'Trusted validator proof is stale or unavailable');console.log(JSON.stringify({case:'ambient-observer-only-env',bothActualValidations:'PASS',outputsEqual:true,allOtherBindingFieldsEqual:true,oldProofRejected:error,root:f.root,scope:'Shows conservative all-environment sensitivity; no blanket reuse approval for genuinely changed execution assumptions'}));

```
