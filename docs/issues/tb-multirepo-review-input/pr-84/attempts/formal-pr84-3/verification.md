# Verification — formal-pr84-3

**Outcome: PASS for the applicable local verification matrix.**

Base `643e3ea2b03f19b66595219c4f8df934596aa436`; evaluated source `3dd128fc5dae29a7b6fa829fe23a5f32e0842b4c`. The application source/test change is commit `166ec158b0271a0bd2414cf610e7d8db43d38e39`; later commits retain only feature evidence/readiness. This report records execution evidence; independent assessments remain separate.

| Category | Actual command or operation | Result and retained evidence |
|---|---|---|
| CLI unit/integration | `npm --prefix cli test` | 260 PASS, 0 FAIL, 1 optional live test SKIP (261 total); cli-tests.log |
| Desktop/build | `npm --prefix apps/desktop test` (including renderer build/protocol staging) | 172 PASS, 0 FAIL; desktop-tests.log |
| Python integration/helpers | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugin-src/shared/resources/scripts/tests` | 58 PASS; python-tests.log. Retired Python merge tests replaced by absence check; current protected merge behavior is tested in CLI integration. |
| Focused interactions | `node --test --test-name-pattern=... cli/test/current-core.test.js` | 7 source/target/history tests, 3 environment/failure/amendment tests, 2 continuation tests and 4 final focused tests PASS; respective retained logs. |
| Native plugin lint | `node cli/bin/workflow.js plugin lint --json` | PASS, 159 files/28 skills; plugin-lint.json |
| Both native plugin builds | `node cli/bin/workflow.js plugin build --dist-root /tmp/gr-repair2-plugins --json` | PASS; plugin-build.json |
| Native manifests/hooks | `node cli/bin/workflow.js plugin validate-native --json` | PASS; native-validation.json |
| Branch docs | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py | All exit 0; document-validation.log |
| Changed-file formatting | `git diff --check` before commit | PASS |
| Real OpenAI evaluator | Live evaluator test with bundled CodexCLI 0.163.0-alpha.11.2, gpt-6.1-sol high; GATEREEVE_LIVE_EVALUATOR=1 | 1 PASS, no skips; live-evaluator.log/json and complete receipt below |
| Actual universal macOS package | `packageMacos({outputRoot: isolatedTmpDirectory, version: '0.1.0-rc.16'})` | Built app/DMG; package.log, package-result.json |
| Mounted package validation/runtime | `verifyDmg({dmgPath,version,fixturePath})` and `smokeApplication` | PASS on native ARM64; universal binary slices, explicit Python closure, ad-hoc signature and governed app smoke; package-verified.json, runtime-result.json, runtime.png |

The package is `/tmp/gr-repair2-package.bmnysD/GateReeve-0.1.0-rc.16-macos-universal.dmg`, 253922958 bytes, SHA256 `44c2ab61d12ecb81a02a07da37109e426018fed7013361e16438282ffc82e887`. Development ad-hoc signature only; not installed, notarized, published or released. The runtime screenshot was inspected: the 940px smoke window shows the current design phase, panels and terminal; scrollbars at this test width are visible. This is runtime evidence, not a visual-redesign acceptance claim.

The actual live provider context is `01a16b74-baab-7321-b1bf-d9e3f6cf3d68` (fresh context, inheritedTurns=0). The fixture establishes current adapter/source/input/output receipt behavior with the revised target-aware input. It does not independently accept this product feature or claim a live grouped code/spec run.

## Limits and unrelated hosted results

- Exact-current hosted CI is not claimed: PR84 remains CLOSED, whose native GitHub diff is frozen at 5433a606. Local source and the remote branch are pinned independently.
- Earlier macOS CI rejected the Python package allowlist. The current allowlist and staged closure now pass actual rebuilt package validation and ARM64 runtime.
- The unchanged Homebrew smoke workflow referenced an unavailable historical rc.8 publication artifact. No release/publication was performed to replace it.
- The universal Intel slice is verified, but native Intel runtime was not repeated. Live external installed-host activation/arbitrary-shell interception is not claimed; subprocess hook-routing tests have their stated limited scope.
- GitHub merge/provider tests are local injected integration tests; no live hosted merge was performed.
- Empty pattern policy provides no substantive pattern-rule coverage; its formal report states that limit separately.

## Complete actual live-evaluator evidence

The following is retained actual output and provider/execution receipt data, not a hand-authored verdict.

```json
{
  "result": {
    "artifacts": [
      {
        "bytes": 1301,
        "format": "json",
        "hash": "sha256:0aad347b44454165937addfd04a7c5c57f38a6ac969aba36ddad699c2bbd8cdb"
      },
      {
        "bytes": 628,
        "format": "json",
        "hash": "sha256:88f1d12f92656b3aafc0ce554b5d1f1128b2efa4ab48ed8d37b546d0ae24c19d"
      }
    ],
    "contract": "gatereeve/current/2",
    "coverage": {
      "complete": true,
      "interactions": [
        "Compared complete base, head and target source: each contains only `export const answer = 42;` at line 1, consistent with requirements/spec.md AC1 and R1. No imports, callers or cross-repository interactions are present in the supplied scope."
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
      "bytes": 576,
      "format": "json",
      "hash": "sha256:bc92c48fab08f75689d015434a5afa994e68b8c310a7d57e04133934932c3c99"
    },
    "kind": "result",
    "mode": "full",
    "outcome": "PASS",
    "prior": null,
    "priorCandidate": null,
    "receipt": {
      "bytes": 594,
      "format": "json",
      "hash": "sha256:13707ff9719be6e42b32e2290ea828eb41068bf198d692dfe8e1f976a431b88d"
    },
    "runId": "run-one",
    "summary": "Base, head and target contain identical source. No supported change-related defects were found. Assessment is based on static evidence; no test results were supplied."
  },
  "receipt": {
    "completedAt": "2026-10-24T01:09:50.887Z",
    "contract": "gatereeve/current/2",
    "evaluator": {
      "contextId": "01a16b74-baab-7321-b1bf-d9e3f6cf3d68",
      "freshContext": true,
      "inheritedTurns": 0,
      "model": "gpt-6.1-sol",
      "provider": "codex"
    },
    "gates": [
      "code"
    ],
    "input": "sha256:bc92c48fab08f75689d015434a5afa994e68b8c310a7d57e04133934932c3c99",
    "jobId": "d01f21c80fbc71aefdf99cfdf07d24d075cc67fe72548332a4fb1f5ea7d97cf8",
    "kind": "execution",
    "metrics": {
      "cost": null,
      "tokens": {
        "cacheCreation": null,
        "cachedInput": 61568,
        "input": 83266,
        "output": 504
      }
    },
    "role": "independent",
    "runId": "run-one",
    "startedAt": "2026-10-24T01:09:34.361Z"
  },
  "providerReceipts": [
    {
      "attemptId": "sha256:bc92c48fab08f75689d015434a5afa994e68b8c310a7d57e04133934932c3c99",
      "capabilityProfile": {
        "id": "high-capability-v1",
        "minimumReasoning": "high"
      },
      "completedAt": "2026-10-24T01:09:50.850Z",
      "digests": {
        "input": "sha256:a7dea574a316dd80f38f5b1b844ad84fabf94a5529c1bc81428574bafe4754a6",
        "instructions": "sha256:98a0c1107aad4f0edb8ce0c415706cdf0fd9aa26c73231ebb0b70eac98dca528",
        "output": "sha256:ad0a05a270019f137e567945d0e369fa7206ced2c6257dbca2de4e41d1a8308b",
        "snapshot": "sha256:a07dea381e0e36c249eb124b1398b7f05f6530b52c7cede2bcdccb59a5ff90a2"
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
          "input": 83266,
          "output": 504
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
      "protocolVersion": "2.0.0",
      "provider": {
        "adapterVersion": "1.0.0",
        "contextId": "01a16b74-baab-7321-b1bf-d9e3f6cf3d68",
        "id": "codex",
        "model": "gpt-6.1-sol",
        "reasoningEffort": "high"
      },
      "runId": "run-one",
      "schemaVersion": 1,
      "stage": "review",
      "startedAt": "2026-10-24T01:09:34.365Z",
      "status": "completed"
    },
    {
      "verdicts": [
        {
          "coverage": {
            "complete": true,
            "interactions": [
              "Compared complete base, head and target source: each contains only `export const answer = 42;` at line 1, consistent with requirements/spec.md AC1 and R1. No imports, callers or cross-repository interactions are present in the supplied scope."
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
          "summary": "Base, head and target contain identical source. No supported change-related defects were found. Assessment is based on static evidence; no test results were supplied."
        }
      ]
    }
  ]
}
```
