# Decision Scratchpad - tb-small-fixes-batch

**Feature start:** 2026-11-25

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## [1] Raise the run from light to full

**Answered by:** human
**Decision:** Accepting non-draft PRs changes a documented contract, so the
human chose full rigor ("Accept open PRs, go full") over the explain-only fix.

## [2] Drop every draft-status precondition and restoration

**Answered by:** human
**Decision:** "I want to relax any restrictions on whether a PR is draft or not
draft." No draft field in the action, no draft check in `merge.prepare` or
`goal.park`, no restoration after a failed merge.

## [3] Release-conductor observer keeps --slurp

**Answered by:** agent
**Decision:** Out of scope: it serves GateReeve's own release flow, and its
tests mock the slurped shape.
**Alternatives:** convert it to `--jq` and rework its desktop tests.
**Reversibility:** high; a later change can convert it.
