# Design - tb-final-review-handoff

Status: approved 2026-11-20

## Problem

The final GateReeve handoff needs a readable account of the candidate and its verification. Pattern review should be opt-in. Reviewer transport and contract failures can lose usable results. A verification job with an oversized operation ID can leave a retained outcome that blocks later writes.

## Intent

Present the exact candidate for human or agent acceptance through its HTML PR explainer. Recover usable review output without weakening acceptance criteria. Add advisory mutation evidence for the changed production lines. Make new verification requests and historical job reconciliation safe.

## Chosen shape

- Remove pattern review from default scheduling and default acceptance requirements. Preserve explicit invocation and historical results.
- After verification and paired review clear the candidate, run opted-in Mutineer from the pinned checkout with `mutineer run --since <target-commit>` and configured package filters. Reuse results keyed by head, target, tool version and configuration. A changed input requires fresh evidence after verification and paired review clear again. Record skips, failures and timeouts distinctly. Keep detailed evidence in the acceptance packet with a thread summary and link. Offer pruning separately on request.
- Generate the candidate-pinned HTML PR explainer from the source, intent and retained results, including advisory mutation evidence, and offer it as the primary final review link. Pause the handoff when generation fails and retry only generation using retained inputs. Regenerate when the candidate or explanatory evidence changes.
- Prefer Claude structured output. Accept one unambiguous fenced JSON object from the prose fallback and apply the existing verdict contract. Give reviewers precise field guidance, including eligible history IDs. Retry Claude once for format or field failures while preserving a valid Codex result for the same candidate. Use the original verdict for narrow correction when available, preserving meaningful dispositions and findings. Retain valid UNAVAILABLE outcomes and their evidence gaps.
- Validate new operation IDs at request admission. Reconcile an already-completed legacy job using a valid completion identity consistently tied to its original retained operation. Preserve original identity, hash, verdict and receipts. Repeated reconciliation must record completion once and allow subsequent mutations.

## Alternatives considered

An optional explainer would permit the final handoff before the requested reading surface exists. Running Mutineer in normal verification would repeat expensive work in remedy cycles. Relaxing verdict validation would allow missing review evidence to count toward acceptance. Rerunning a completed legacy job could duplicate work and discard provenance.

## Constraints

Use the full workflow and its paired acceptance requirements. Keep verdicts private. Keep mutation findings advisory, and require a separate maintainer choice for pruning. Release the verified changes with the Fleet-support changes after approved integration.

## Open risks

Verify the operation recovery design against persisted journal and job receipts with a regression fixture. The Classic run on aws-1 is external to the local fixture. Confirm per-repository Mutineer command and report capabilities and keep unsupported repositories outside automatic execution.

## Changes

### Ordered reviewer model preferences

Add ordered per-provider reviewer model preferences to `.agentic-workflow.json`. An entry names a model and may specify reasoning effort. GateReeve selects the first preference that current runtime discovery confirms is available and eligible. If the list is empty or exhausted, the selecting agent may pick any eligible model from that provider, including Sonnet on the Claude side. Retain both selected models, efforts, and the reasons for skipping configured preferences or choosing a fallback. Preserve one reviewer from each provider. A response format or field failure uses the selected model for its one correction attempt. It does not advance the preference list.

Acceptance evidence should exercise available first choices, partial availability, exhausted or absent lists, and same-model correction. Validate the selected model and effort against the provider's runtime observations and existing capability requirements.
