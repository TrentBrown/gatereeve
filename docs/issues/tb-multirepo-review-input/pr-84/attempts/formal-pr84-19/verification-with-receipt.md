# Verification — formal-pr84-19

Outcome: PASS
Base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: 39c5fa3c657cb2caa2e7c343b4d80e0cab6130e8
Final product: d924492cc4f1ec825eaebcd5897c08208532cc38

Mechanical composite assessment only; independent code/spec and native Judge verdicts are separate. No gate waived.

| Coverage | Actual result |
| --- | --- |
| D11 frozen product controls | final-runtime.log:15PASS. Scope, acceptance-only, slice/final merge, target drift, revocation/expiry races, draft restoration, configured Git/Python and existing direct merge controls. |
| Long history | history-final.log:1PASS,66 retained records/33 closures. Exact frozen product. |
| Transitive exception | exception-fixed.log:1PASS; precise rejection message assertion corrected, product unchanged. |
| Current broad run | source-evolving-broad.log:172PASS,2FAIL,1SKIP. Started before final changes. Both failures reconciled in regression-reconciliation.md; not relabeled all-green or exact-final. |
| Prior broad feature coverage | baseline-verification.md and broad-cli-completed.log disclose previous368 tests:366PASS,1resolved portabilityFAIL,1intentionalSKIP. Prior unchanged-domain focused checks remain usable; affected D11 domains supplemented above. |
| Desktop | desktop-tests.log:173PASS on final product. |
| Actual unpacked CLI | packed-cli.log:2PASS on final product, packaged CLI executable. |
| Surface/portability/docs | surface-tests.log:18PASS; final runtime helper change supplemented by merge-helper.log:3PASS and final-runtime.log. |
| Native plugin | Final plugin-lint.json/plugin-build.json PASS. New authorization.js included in inventory and both staged surfaces. |
| Packaged application | package-result.json/package-verified.json/runtime-result.json/runtime.png: universal ad-hoc dev package built, actual ARM64 runtime smoke PASS. Screenshot inspected. No Intel runtime/install/release claim. |
| Build binding | final-build-binding.json:49 protocol/helper files across actual app.asar and two native packages,147 byte comparisons match final product. Later changes are tests and retained evidence only. |
| Earlier unchanged transport/helper domains | Baseline logs retain actual OpenAI fixture/public receipt validation, prior trusted Python58 and pattern29, tested process-local coordinator transport. New merge helper/runtime paths separately tested. |

The six original D11 defect probes and independent delta findings are retained outside the native Judge evidence bundle, preserving its fresh review policy. Formal reviewers must assess current code and all23 rubric rows; prior code/spec verdicts are historical context, not current passage.

Limits: no installed-host interception, arbitrary shell enforcement, exact-current hosted CI, deployment, publication, installation, signing/notarization or Intel runtime established. Human authorization provenance is cooperative. Empty pattern scope supplies no substantive pattern-rule coverage. Local mirror is not external backup. Remote target rechecks are not atomic target CAS. Runtime dependency declarations remain explicit reviewable commitments rather than universal dependency inference.

Installed rc.16 governs. Existing tested coordinator loader provides compact advisory transport and bounded audit reading without changing core guards, receipt validation or evidence hashes. See baseline coordinator-transport.md. Pending/unavailable optional advisory uses recorded reasoned proceed; mandatory independent gates remain required.

## Inspectable evaluator execution evidence

The embedded original records below include live-evaluator.json (actual current-contract result/receipt and public2.1.0 provider receipt plus output), live-evaluator.log (actual opt-in execution PASS), live-roundtrip.json and retained-evaluator-validation.json (current public-validator recheck). These provide R8 fixture execution/transport evidence, not this PR’s independent quality verdict. Provider context01a16cc8-7243-7180-91b2-9329b2bccd42 is fresh, high-reasoning gpt-6.1-sol,zero inherited turns; exact output digest is retained. The current execution/public-validation paths are unchanged from that real run; D11 affects authority and integration paths separately covered by current controls. All source/test changes since formal18 are evidence-only. Final runtime, Desktop, CLI, history, scope assertion, package/build bindings and reconciliation remain retained under their named evidence files; the actual screenshot is an image attachment.

## Original retained R8 execution records

The installed coordinator permits only image/PDF side attachments. These original machine records are embedded verbatim in this bound Verification report for inspection; no prior PR reviewer verdict is supplied.

### live-evaluator.json

Original byte SHA256: `ca51e91a408ad1c03ff8b3bfaa98408f2d96406f4ca8b37111f557b456463279`.

```json
{
  "schemaVersion": 1,
  "kind": "feature-verification",
  "payload": {
    "result": {
      "artifacts": [
        {
          "bytes": 1301,
          "format": "json",
          "hash": "sha256:d33ca7ff6537c26324a924a38d2c7b12d0f8f74211a760fd6e04e2003376365a"
        },
        {
          "bytes": 696,
          "format": "json",
          "hash": "sha256:5505fe585d209a7484bfa23d6fc990cb9a085fb8d7b89e2a186788333bb2c7ac"
        }
      ],
      "contract": "gatereeve/current/3",
      "coverage": {
        "complete": true,
        "interactions": [
          "Reviewed the complete base/head/target source: app/app.js:1 exports const answer = 42, consistent with requirements/spec.md AC1/R1.",
          "Retained metadata confirms unchanged regular-file kind and mode 100644 across all three snapshots. No dependencies or cross-repository interactions exist in the supplied source."
        ],
        "limitations": [],
        "paths": [
          "app/app.js"
        ]
      },
      "criteria": [],
      "dispositions": [],
      "featureId": "feature",
      "findings": [],
      "gate": "code",
      "historyAssessment": null,
      "input": {
        "bytes": 598,
        "format": "json",
        "hash": "sha256:22e40c846bdc8b18c525ceba390c7bd117a62f0f62aa7b72fced683b3d271d75"
      },
      "kind": "result",
      "mode": "full",
      "outcome": "PASS",
      "prior": null,
      "priorCandidate": null,
      "receipt": {
        "bytes": 693,
        "format": "json",
        "hash": "sha256:e6845955334db695fc59dd5cad3850b6895de39eaa1074dea30ee70fd1267adf"
      },
      "runId": "run-one",
      "summary": "Base, head and target are identical. The supplied source exports answer as 42; no supported defects or regressions were found. No runtime test evidence was supplied."
    },
    "receipt": {
      "completedAt": "2026-10-24T07:20:55.064Z",
      "contract": "gatereeve/current/3",
      "evaluator": {
        "capabilityProfile": {
          "id": "high-capability-v1",
          "minimumReasoning": "high"
        },
        "contextId": "01a16cc8-7243-7180-91b2-9329b2bccd42",
        "freshContext": true,
        "inheritedTurns": 0,
        "model": "gpt-6.1-sol",
        "provider": "codex",
        "reasoningEffort": "high"
      },
      "gates": [
        "code"
      ],
      "input": "sha256:22e40c846bdc8b18c525ceba390c7bd117a62f0f62aa7b72fced683b3d271d75",
      "jobId": "d01f21c80fbc71aefdf99cfdf07d24d075cc67fe72548332a4fb1f5ea7d97cf8",
      "kind": "execution",
      "metrics": {
        "cost": null,
        "tokens": {
          "cacheCreation": null,
          "cachedInput": 61568,
          "input": 83448,
          "output": 414
        }
      },
      "role": "independent",
      "runId": "run-one",
      "startedAt": "2026-10-24T07:20:37.708Z"
    },
    "providerReceipts": [
      {
        "attemptId": "sha256:22e40c846bdc8b18c525ceba390c7bd117a62f0f62aa7b72fced683b3d271d75",
        "capabilityProfile": {
          "id": "high-capability-v1",
          "minimumReasoning": "high"
        },
        "completedAt": "2026-10-24T07:20:55.039Z",
        "digests": {
          "input": "sha256:fb5bae0d461286a809d404b69e6af6b15dbff8f0ab870f0348423a5585c5850a",
          "instructions": "sha256:1d434ff3d787394cb37b9fbb5362aa3978730a73d598972af42a5e82a5c240bf",
          "output": "sha256:ebc8c5acd8501e78729ba56caf46e4378e3a76b5666fb0f2dc81c2bf812c41dd",
          "snapshot": "sha256:020d8e196693dd701377e3a5ff60fab256a0f0660b5fd968c0887d477813c085"
        },
        "isolation": {
          "freshContext": true,
          "inheritedTurns": 0,
          "method": "codex-ephemeral-exec"
        },
        "kind": "gatereeve-agent-workflow-receipt",
        "metrics": {
          "cost": null,
          "tokens": {
            "cacheCreation": null,
            "cachedInput": 61568,
            "input": 83448,
            "output": 414
          }
        },
        "module": {
          "digest": "sha256:32b8b34fd4596ec54196f45ae537e29e81982f56a6079d8ecd4d08c57cdb1abd",
          "id": "gatereeve/current-review",
          "version": "2.0.0"
        },
        "policy": {
          "networkAccess": "deny",
          "repositoryAccess": "read-only",
          "scratch": "isolated"
        },
        "protocolVersion": "2.1.0",
        "provider": {
          "adapterVersion": "1.0.0",
          "contextId": "01a16cc8-7243-7180-91b2-9329b2bccd42",
          "id": "codex",
          "model": "gpt-6.1-sol",
          "reasoningEffort": "high"
        },
        "runId": "run-one",
        "schemaVersion": 1,
        "stage": "review",
        "startedAt": "2026-10-24T07:20:37.714Z",
        "status": "completed"
      },
      {
        "verdicts": [
          {
            "coverage": {
              "complete": true,
              "interactions": [
                "Reviewed the complete base/head/target source: app/app.js:1 exports const answer = 42, consistent with requirements/spec.md AC1/R1.",
                "Retained metadata confirms unchanged regular-file kind and mode 100644 across all three snapshots. No dependencies or cross-repository interactions exist in the supplied source."
              ],
              "limitations": [],
              "paths": [
                "app/app.js"
              ]
            },
            "criteria": [],
            "dispositions": [],
            "findings": [],
            "gate": "code",
            "historyAssessment": null,
            "outcome": "PASS",
            "summary": "Base, head and target are identical. The supplied source exports answer as 42; no supported defects or regressions were found. No runtime test evidence was supplied."
          }
        ]
      }
    ]
  }
}

```

### live-evaluator.log

Original byte SHA256: `6e88577b8fe73e5dffd126b9a2f37dc977efba9f88d959ee65bba3352adc153d`.

```text
✔ real local fresh evaluator produces a bound code-review receipt (18412.158208ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18462.019

```

### live-roundtrip.json

Original byte SHA256: `06979bb6a931cac814ec715cbe872258662db19622811f96d2f305e3ef9e94a2`.

```json
{
  "schemaVersion": 1,
  "kind": "feature-verification",
  "payload": {
    "passed": true,
    "actualVerdict": "PASS",
    "protocolVersion": "2.1.0",
    "contextId": "01a16cc8-7243-7180-91b2-9329b2bccd42",
    "reasoningEffort": "high",
    "profile": {
      "id": "high-capability-v1",
      "minimumReasoning": "high"
    },
    "outputDigest": "sha256:ebc8c5acd8501e78729ba56caf46e4378e3a76b5666fb0f2dc81c2bf812c41dd"
  }
}

```

### retained-evaluator-validation.json

Original byte SHA256: `f0ab7935580903282dbf819c8a168ccafd425b03f11519e16798dfc639064de6`.

```json
{
  "schemaVersion": 1,
  "kind": "feature-verification",
  "payload": {
    "passed": true,
    "actualVerdict": "PASS",
    "protocolVersion": "2.1.0",
    "contextId": "01a16cc8-7243-7180-91b2-9329b2bccd42",
    "outputDigest": "sha256:ebc8c5acd8501e78729ba56caf46e4378e3a76b5666fb0f2dc81c2bf812c41dd",
    "evidence": "pr-84/attempts/formal-pr84-18/live-evaluator.json",
    "purpose": "R8 actual retained execution/receipt transport proof, not current PR verdict"
  }
}

```
