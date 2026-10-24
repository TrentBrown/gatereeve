# Independent code review — formal-pr84-16

Verdict: **FAIL**.

## Identity and scope

- Base: `643e3ea2b03f19b66595219c4f8df934596aa436`.
- Evaluated head: `2e3251e3a7f3b506efd92e0c2e3f3b1daad6c798`.
- Product source: `6187bc6b8d73388dfab69da56c9ea7521e1deaf6`.
- Authority for this output: `/tmp/gr-context16-codeReview.json`.
- Independent reviewer: `/root/formal_code_spec`, a continuing nonimplementing review context. This is not a claim of a fresh history-blind provider session. No product implementation edits were performed.

This is a **bounded assessment** of the newly reproduced CLI consumer interaction following the external-runtime-input repair. The supported defect below is sufficient for FAIL; this report does not claim a new complete review of every cumulative feature change or a full21-row spec assessment. Prior reports remain unchanged. No protocol passage, waiver or merge authorization is recorded here.

## CR16-1 — P2: Documented verification shortcut cannot supply mandatory runtime scope

**Primary source:** `cli/src/commands/current.js:87` (option advertised at line81).

**Supporting source:** `cli/README.md:38`; `plugin-src/shared/resources/protocol/current/environment.js`, `externalClosure` declaration requirement.

**Approved criterion:** R18 / AC7, coherent consumers and useful routine execution transport.

The documented command `gatereeve evaluate verification --checks checks.json` constructs configuration containing only `{checks}`. The repaired runner now requires an explicit `configuration.externalRuntimeInputs` entry for every checked repository. The CLI exposes no companion scope option for the `--checks` branch, so a valid checks file cannot satisfy that requirement. Supplying a full configuration works, but selects a different branch and ignores the checks shortcut. This is a reachable consumer regression, not a failure of the intended mandatory-scope rule.

### Actual reproduction

Disposable probe: `/tmp/gr-repair15-cli-checks-probe.mjs`.
Actual output: `/tmp/gr-repair15-cli-checks-probe.log`.

The probe imports the current fixture and establishes a real authorized candidate using the product core, then executes the actual CLI subprocess at `cli/bin/workflow.js`. It writes the same dependency-free Node check into two temporary inputs:

```json
[{"repository":"app","command":"<actual process.execPath>","args":["-e","process.exit(0)"],"purpose":"Declared dependency-free fixture"}]
```

The second input wraps those checks with an explicit `"externalRuntimeInputs":{"app":[]}`. It runs:

```text
node cli/bin/workflow.js evaluate verification --checks <checks.json> --cwd <fixture-repo> --json
node cli/bin/workflow.js evaluate verification --configuration <configuration.json> --cwd <fixture-repo> --json
```

Observed results:

- The documented `--checks` invocation exits **1** with `Runner requires explicit externalRuntimeInputs for each checked repository (an empty list declares no additional external inputs)`.
- The full `--configuration` invocation succeeds with `ok:true`.
- The reproduction test passes: **1 test,1 PASS,0 FAIL/SKIP**, duration2,439.843291ms. It asserts the defect and its working control; it is not a product acceptance test declaring this behavior correct.

The commands and runner were actual executions. The established-run fixture uses synthetic review data for unrelated setup; that data is not evidence of independent product quality. Temporary fixture files and core records were isolated outside the product checkout. The product source was verified unchanged from `6187bc6b8d73388dfab69da56c9ea7521e1deaf6` outside feature records, and HEAD matched the formal16 context when this report was written.

### Required correction

Make the advertised runner command capable of expressing the mandatory explicit scope, or retire the shortcut with direct, useful full-configuration guidance. Update the README example and CLI help consistently. Do **not** silently synthesize an empty scope: `[]` is an explicit dependency commitment, not a safe default inferred from missing information.

Add an actual CLI regression that exercises the chosen convenience path through an authorized candidate with explicit scope, plus a missing-scope negative. Preserve the successful full-configuration path and the external-runtime proof/waiver invalidation controls. A targeted CLI/documentation repair is sufficient; this finding does not request another implementation of the runtime closure mechanism.

## Other observations and limits

Earlier focused independent probes confirmed the external-input fixes, loader-input hashing, managed-store exclusion, direct/transitive waiver invalidation, malformed-argument recovery, and retention of already executed command receipts. The final one-line path-expression change preserved POSIX behavior and passed focused controls. Those results do not resolve the CLI construction error above.

This report makes no final assessment of the still separately assembled formal16 verification or native Judge outcome. It does not claim hosted CI, release, native-host activation or additional platform runtime coverage. The finding is confined to an advertised local consumer path and the approved R18 requirement.
