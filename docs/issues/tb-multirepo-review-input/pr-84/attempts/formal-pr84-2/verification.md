# Verification — PR84 / formal-pr84-2

**Outcome: PASS for this implementation's boundary-feasible local verification.**
Pinned source `b1d83440b4c44b77793895ef3297be2e9462d46a` against `643e3ea2b03f19b66595219c4f8df934596aa436`.
Application source and tests are commit `83b3f4a4f35afcc48b6fdcbb535e0940dce992b5`;
subsequent commits retain verification and readiness only.

| Category | Exact command / exercise | Actual result |
| --- | --- | --- |
| CLI unit/integration | `npm --prefix cli test` | 252 PASS, 0 FAIL, 1 optional live-provider SKIP; cli-tests.log |
| Real evaluator integration | `GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol GATEREEVE_LIVE_RECEIPT=/tmp/gr-repair-live-receipt.json node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js`, with bundled Codex directory first on PATH | 1 PASS, 0 FAIL, no skips; actual receipt reproduced below; live-evaluator.log/json |
| Desktop build/unit/integration | `npm --prefix apps/desktop test` | renderer build and 172 checks PASS; desktop-tests.log |
| Python helpers/integration | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugin-src/shared/resources/scripts/tests` | 62 PASS; python-tests.log |
| Native portability | `node cli/bin/workflow.js plugin lint --json` | PASS; 159 shared files and 28 skills; plugin-lint.json |
| Native packages | `node cli/bin/workflow.js plugin build --dist-root /tmp/gr-repair-plugins --json` | PASS for both native hosts; plugin-build.json |
| Native contract | `node cli/bin/workflow.js plugin validate-native --json` | PASS; native-validation.json |
| Universal macOS package | `packageMacos({outputRoot: isolatedTmpDirectory, version: '0.1.0-rc.16'})` from apps/desktop/scripts/package-macos.mjs | Actual universal application and DMG built; package-result.json and package.log |
| Packaged application/runtime | `verifyDmg({dmgPath: packageResult.dmgPath, version: packageResult.version, fixturePath: isolatedGovernedFixture})` from apps/desktop/scripts/verify-macos-package.mjs; fixture made with create-smoke-fixture.mjs | PASS on native ARM64, including mounted package identity, explicit Python closure, universal binary slices, ad-hoc signature, and live governed app smoke; package-verify.log, package-verified.json, runtime-result.json |
| Documentation and formatting | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py; `git diff --check 5724e5507b007c8c0558ece6bda4c95915016ad1 83b3f4a4f35afcc48b6fdcbb535e0940dce992b5 -- plugin-src cli apps/desktop .github ci` | PASS; no dedicated ESLint/typecheck is configured. Executed suites and renderer compilation cover syntax/import integration. |

The CLI suite exercises actual isolated Git repositories, shared parent records,
current milestone checks, retained evidence corruption/loss and recovery, explicit
fresh native adapter contracts, source/policy/environment changes, grouped and
delta verdicts, scoped exceptions, exact merge actions and post-check target drift.
The hosted API in merge regression tests is injected; those tests make no real
merge. The packaged smoke opens the actual application and checks setup, panels,
resizing, focus and terminal start/termination. The captured small viewport was
inspected; scrollable panels are intentional and no visual redesign is claimed.

Runtime evidence: [packaged application screenshot](runtime.png).

## Actual native evaluator receipt

Bundled executable: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`
(version 0.163.0-alpha.11.2), model gpt-6.1-sol with high reasoning. This is the
new current-protocol path on the small fixture defined in the test. It proves
actual isolated execution and bound separate receipt machinery; its fixture
code PASS does not assess this feature. The following is the actual retained
execution result, core receipt and provider receipt, included in this bound
Verification report so it is available even in a history-filtered review view.

```json
{
  "result": {
    "artifacts": [
      {
        "bytes": 1301,
        "format": "json",
        "hash": "sha256:d3804d7ab0620365abd9f5258e659865f6e3e7f6861b3d88b3bce42b4352e3e2"
      },
      {
        "bytes": 571,
        "format": "json",
        "hash": "sha256:68d1d956a31350577ff512232ded98ab4b0baf91afbd5fde46b59d53b29ddc5d"
      }
    ],
    "contract": "gatereeve/current/2",
    "coverage": {
      "complete": true,
      "interactions": [
        "Compared base and head app/app.js; both contain only export const answer = 42. No imports, consumers or cross-repository interactions are present in the supplied scope."
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
      "hash": "sha256:ede403af14f3c106eb2659787261fdb181feca13fa03fb42dfe42b6a06369d87"
    },
    "kind": "result",
    "mode": "full",
    "outcome": "PASS",
    "prior": null,
    "priorCandidate": null,
    "receipt": {
      "bytes": 594,
      "format": "json",
      "hash": "sha256:c728b3b4bedf31a3bd517d2fbe87925f572a78d83ae701a906408dfa147b0872"
    },
    "runId": "run-one",
    "summary": "Pinned base and head are identical. The sole module exports answer with value 42, consistent with AC1/R1. No defects found by source inspection; no runtime test evidence was supplied."
  },
  "receipt": {
    "completedAt": "2026-10-24T00:41:29.745Z",
    "contract": "gatereeve/current/2",
    "evaluator": {
      "contextId": "01a16b5a-cb2d-74d1-a54a-b00e1a021801",
      "freshContext": true,
      "inheritedTurns": 0,
      "model": "gpt-6.1-sol",
      "provider": "codex"
    },
    "gates": [
      "code"
    ],
    "input": "sha256:ede403af14f3c106eb2659787261fdb181feca13fa03fb42dfe42b6a06369d87",
    "jobId": "d01f21c80fbc71aefdf99cfdf07d24d075cc67fe72548332a4fb1f5ea7d97cf8",
    "kind": "execution",
    "metrics": {
      "cost": null,
      "tokens": {
        "cacheCreation": null,
        "cachedInput": 52096,
        "input": 70522,
        "output": 446
      }
    },
    "role": "independent",
    "runId": "run-one",
    "startedAt": "2026-10-24T00:41:14.506Z"
  },
  "providerReceipts": [
    {
      "attemptId": "sha256:ede403af14f3c106eb2659787261fdb181feca13fa03fb42dfe42b6a06369d87",
      "capabilityProfile": {
        "id": "high-capability-v1",
        "minimumReasoning": "high"
      },
      "completedAt": "2026-10-24T00:41:29.712Z",
      "digests": {
        "input": "sha256:ccc74b2261b7ec2eb42fdd6fb9834cc5f336f4332ac8b16a49bd005dbbd7e58c",
        "instructions": "sha256:27a6c9263f8f72d97af97ce9cbc2e4eba7a007c90de4ec1214c1213c2d32992a",
        "output": "sha256:e6cba7dfb81d521792411fb2c9a20eba96dcf8d662da6fc243769f08596aa4ad",
        "snapshot": "sha256:23fa1e78a7b4efc9f51062bc792c6cadc3308584a05ace0f15c0613ea9dc07ea"
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
          "cachedInput": 52096,
          "input": 70522,
          "output": 446
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
        "contextId": "01a16b5a-cb2d-74d1-a54a-b00e1a021801",
        "id": "codex",
        "model": "gpt-6.1-sol",
        "reasoningEffort": "high"
      },
      "runId": "run-one",
      "schemaVersion": 1,
      "stage": "review",
      "startedAt": "2026-10-24T00:41:14.543Z",
      "status": "completed"
    },
    {
      "verdicts": [
        {
          "coverage": {
            "complete": true,
            "interactions": [
              "Compared base and head app/app.js; both contain only export const answer = 42. No imports, consumers or cross-repository interactions are present in the supplied scope."
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
          "summary": "Pinned base and head are identical. The sole module exports answer with value 42, consistent with AC1/R1. No defects found by source inspection; no runtime test evidence was supplied."
        }
      ]
    }
  ]
}
```

## Limits and hosted checks

The universal package was launched natively on ARM64. Native Intel launch was
not repeated locally. The package uses an ad-hoc development signature; this is
not installation, notarization, publication or a released product assertion.
Packaged hook tests exercise real handler subprocesses; live installed-host hook
activation and production provider activation are not established.

GitHub CI on the original PR source reported a Python allowlist failure. Current
packaging now passes the real local package verifier and runtime launch. The
unchanged Homebrew smoke workflow requests the rc.8 publication artifact
`gatereeve-v0.1.0-rc.8-linked-homebrew-cask-result`, which GitHub could not find.
The workflow has no feature diff; this historical artifact availability failure
is not claimed fixed. PR84 remains closed, so exact-current hosted CI is not
claimed. These limitations remain visible for the later merge decision.
