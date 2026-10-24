# Verification — formal-pr84-5

**Outcome: PASS for the applicable local verification matrix.**

Base `643e3ea2b03f19b66595219c4f8df934596aa436`; evaluated source `b1bade8610c1b72b299abad2bf8cf2fb2e9fe1d0`. The application source/test change is commit `2efaee31903fdbbf59c56f4171d62672c51665f9`; later commits retain only feature evidence/readiness. This report records execution evidence; independent assessments remain separate.

| Category | Actual command or operation | Result and retained evidence |
|---|---|---|
| CLI unit/integration | `npm --prefix cli test` | 278 PASS, 0 FAIL, 1 optional live test SKIP (279 total); cli-tests.log |
| Desktop/build | `npm --prefix apps/desktop test` (including renderer build/protocol staging) | 172 PASS, 0 FAIL; desktop-tests.log |
| Python integration/helpers | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugin-src/shared/resources/scripts/tests` | 58 PASS; python-tests.log. Retired Python merge tests replaced by absence check; current protected merge behavior is tested in CLI integration. |
| Focused interactions | `node --test --test-name-pattern=... cli/test/current-core.test.js` | 16 focused history, coverage, state-race and reuse tests PASS; focused-regressions.log. Six final authority/retry/concurrency tests PASS; authority-regressions.log. Earlier regressions are also included in the full CLI suite. |
| Native plugin lint | `node cli/bin/workflow.js plugin lint --json` | PASS, 159 files/28 skills; plugin-lint.json |
| Both native plugin builds | `node cli/bin/workflow.js plugin build --dist-root /tmp/gr-repair4-plugins --json` | PASS; plugin-build.json |
| Native manifests/hooks | `node cli/bin/workflow.js plugin validate-native --json` | PASS; native-validation.json |
| Branch docs | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py | All exit 0; document-validation.log |
| Changed-file formatting | `git diff --check` before commit | PASS |
| Retained third-round OpenAI adapter smoke | Live evaluator test with bundled CodexCLI 0.163.0-alpha.11.2, gpt-6.1-sol high; GATEREEVE_LIVE_EVALUATOR=1 | 1 PASS, no skips on third-round source b94a792; explicitly carried prior evidence, not a fourth-round live run; live-evaluator.log/json and receipt below |
| Actual universal macOS package | `packageMacos({outputRoot: isolatedTmpDirectory, version: '0.1.0-rc.16'})` | Built app/DMG; package.log, package-result.json |
| Mounted package validation/runtime | `verifyDmg({dmgPath,version,fixturePath})` and `smokeApplication` | PASS on native ARM64; universal binary slices, explicit Python closure, ad-hoc signature and governed app smoke; package-verified.json, runtime-result.json, runtime.png |

The package is `/tmp/gr-repair4-package.XPgYpb/GateReeve-0.1.0-rc.16-macos-universal.dmg`, 253927277 bytes, SHA256 `784065b6f8813554ccbc1ff7be787d9a2221e83ec81b91f66ac789ad1ba3ba7f`. Development ad-hoc signature only; not installed, notarized, published or released. The runtime screenshot was inspected: the 940px smoke window shows the current design phase, panels and terminal; scrollbars at this test width are visible. This is runtime evidence, not a visual-redesign acceptance claim.

The retained third-round live provider context is `01a16b89-fa92-7681-85dd-ea36c8179d05` (fresh context, inheritedTurns=0). The fixture established adapter/source/input/output receipt behavior on b94a792. That adapter transport was not changed in round four. Current local tests cover the history/coverage/state repairs; the current native formal Judge runs separately and must supply a fresh verdict. It does not independently accept this product feature or claim a live grouped code/spec run.

## Limits and unrelated hosted results

- Exact-current hosted CI is not claimed: PR84 remains CLOSED, whose native GitHub diff is frozen at 5433a606. Local source and the remote branch are pinned independently.
- Earlier macOS CI rejected the Python package allowlist. The current allowlist and staged closure now pass actual rebuilt package validation and ARM64 runtime.
- The unchanged Homebrew smoke workflow referenced an unavailable historical rc.8 publication artifact. No release/publication was performed to replace it.
- The universal Intel slice is verified, but native Intel runtime was not repeated. Live external installed-host activation/arbitrary-shell interception is not claimed; subprocess hook-routing tests have their stated limited scope.
- GitHub merge/provider tests are local injected integration tests; no live hosted merge was performed.
- Empty pattern policy provides no substantive pattern-rule coverage; its formal report states that limit separately.

## Complete actual live-evaluator evidence

Carried third-round actual output and execution receipts follow; this fixture receipt does not accept the feature.

```json
{
  "result": {
    "artifacts": [
      {
        "bytes": 1301,
        "format": "json",
        "hash": "sha256:f7491fef52cb931880f893b5faa9634b337df56b18ce69fd7c48dd784dae9c26"
      },
      {
        "bytes": 675,
        "format": "json",
        "hash": "sha256:f43d81f1cc17e0290f10bee034d3a35cc683947674acc7bdb01fafacd1d44f5d"
      }
    ],
    "contract": "gatereeve/current/2",
    "coverage": {
      "complete": true,
      "interactions": [
        "Compared the complete base, head and target module: app/app.js:1 is `export const answer = 42;` in all three snapshots.",
        "Confirmed retained mode 100644 and kind file across all snapshots. The module has no imports, calls or cross-repository interactions."
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
      "hash": "sha256:4ba1af30e7bf60f40067b70dffda5c015f2cddff19adf8dd55fc8026ec2d9a46"
    },
    "kind": "result",
    "mode": "full",
    "outcome": "PASS",
    "prior": null,
    "priorCandidate": null,
    "receipt": {
      "bytes": 594,
      "format": "json",
      "hash": "sha256:59bd7f5085e336ae13e1300eab14697dc183a11c1fb3abf92a7a6cd8c32d7a65"
    },
    "runId": "run-one",
    "summary": "Base, head and target contain identical source and retained file modes. The sole module exports answer as 42, consistent with AC1/R1. No supported defects found; no runtime test evidence was supplied."
  },
  "receipt": {
    "completedAt": "2026-10-24T01:33:04.720Z",
    "contract": "gatereeve/current/2",
    "evaluator": {
      "contextId": "01a16b89-fa92-7681-85dd-ea36c8179d05",
      "freshContext": true,
      "inheritedTurns": 0,
      "model": "gpt-6.1-sol",
      "provider": "codex"
    },
    "gates": [
      "code"
    ],
    "input": "sha256:4ba1af30e7bf60f40067b70dffda5c015f2cddff19adf8dd55fc8026ec2d9a46",
    "jobId": "d01f21c80fbc71aefdf99cfdf07d24d075cc67fe72548332a4fb1f5ea7d97cf8",
    "kind": "execution",
    "metrics": {
      "cost": null,
      "tokens": {
        "cacheCreation": null,
        "cachedInput": 61184,
        "input": 83411,
        "output": 448
      }
    },
    "role": "independent",
    "runId": "run-one",
    "startedAt": "2026-10-24T01:32:46.878Z"
  },
  "providerReceipts": [
    {
      "attemptId": "sha256:4ba1af30e7bf60f40067b70dffda5c015f2cddff19adf8dd55fc8026ec2d9a46",
      "capabilityProfile": {
        "id": "high-capability-v1",
        "minimumReasoning": "high"
      },
      "completedAt": "2026-10-24T01:33:04.672Z",
      "digests": {
        "input": "sha256:5b7cec94ab6b34fbc8056e966c2eb02253652b890d923bda6bb59a1bf9d78c44",
        "instructions": "sha256:7a40ac53bc9304c001ac034fe748826666a3cb674c0eea55200bb2e26af3c20d",
        "output": "sha256:1a093b4779676c90a8876f3cd3570707433bdb20f1c5a9fd09c2466253fd8f6b",
        "snapshot": "sha256:ac9019a3eee7f13c015356bdf04a6119403160d188d8c1c1e29f6455630ababa"
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
          "cachedInput": 61184,
          "input": 83411,
          "output": 448
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
        "contextId": "01a16b89-fa92-7681-85dd-ea36c8179d05",
        "id": "codex",
        "model": "gpt-6.1-sol",
        "reasoningEffort": "high"
      },
      "runId": "run-one",
      "schemaVersion": 1,
      "stage": "review",
      "startedAt": "2026-10-24T01:32:46.921Z",
      "status": "completed"
    },
    {
      "verdicts": [
        {
          "coverage": {
            "complete": true,
            "interactions": [
              "Compared the complete base, head and target module: app/app.js:1 is `export const answer = 42;` in all three snapshots.",
              "Confirmed retained mode 100644 and kind file across all snapshots. The module has no imports, calls or cross-repository interactions."
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
          "summary": "Base, head and target contain identical source and retained file modes. The sole module exports answer as 42, consistent with AC1/R1. No supported defects found; no runtime test evidence was supplied."
        }
      ]
    }
  ]
}
```
