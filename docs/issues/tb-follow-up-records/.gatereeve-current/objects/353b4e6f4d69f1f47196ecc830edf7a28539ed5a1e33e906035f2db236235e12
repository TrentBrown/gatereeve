# Design - tb-follow-up-records

**Status:** approved (gate passed 2026-11-27)

Source: GitHub issue #148 (AC7), tracking issue #150 wave 4. Decisions:
`interview.md` D1-D10.

## Problem

The round policy (rounds 4-5) and the severity rules (#143) make many findings
non-blocking: every low finding, out-of-model findings and medium findings
demoted in rounds 4-5. They stay visible on the pair member
(`demotedFindings`) and in the metrics store, but nothing tracks them to a
decision. A run can complete with dozens of reviewer-reported risks nobody
accepted, scheduled or rejected, and measure 2 of the convergence metrics
(#149) cannot tell whether every demoted finding was "decided at Completion".
The dependency-scan gate (wave 5) will also report pre-existing
vulnerabilities that need the same tracking without blocking the branch.

## Intent

Every non-blocking finding becomes a follow-up record with its origin, and
every follow-up reaches a recorded decision before the run completes. Defaults
make that cheap: one supervised answer, or automatic under goal autonomy.
Non-review origins plug into the same record.

## Chosen shape

**1. The record** (`protocol/current/follow-ups.js`, new). Format
`follow-up/1`, extending the #144 claim/sweep shape (`findingId`, `classId`,
`class`):

```json
{"id":"fu-<12 hex of sha256(dedupKey)>","dedupKey":"review:<result hash>:<finding id>",
 "origin":{"kind":"review","result":"<hash>","findingId":"F3","provider":"codex","model":"…","reviewScope":"slice","round":4},
 "finding":{"findingId":"F3","classId":"…","class":"<classStatement>","criterion":"R2","path":"repository/src/x.js",
   "severity":"medium","failureScenario":"…"},
 "reason":"low|reviewer-non-blocking|demoted",
 "status":"undecided|accepted-risk|new-work|rejected|fixed",
 "decision":null}
```

- **Review origin** (D4): derived on read from the run's retained boundary
  `review` results. A finding is a follow-up when it did not block at raise
  time (`scheduledBlocking` with the recorded round, regression paths and
  sweep records, shared with the metrics projection). One record per finding
  ID; the first raising result is the origin. A later disposition `resolved`
  makes it `fixed` (no decision needed); `present` again reopens it. Results
  without a severity are never follow-ups. Findings that blocked are never
  follow-ups, whatever closed them (D5).
- **Non-review origin** (D6): `recordFollowUps(core, {origin, findings})`, a
  protocol-internal API for gates, appends one `FOLLOW_UP_RECORDED` event per
  new dedup key. Origin `dependency-scan`: `{kind, repository, manifest,
  vulnId, package, version, severity, title, preExisting: true}`; dedup key
  `dependency-scan:<repository>:<manifest>:<vulnId>:<package>@<version>`. A
  repeated key in the run is the same record. `preExisting` follow-ups never
  count as an open high (D2).

**2. Decisions** (operation `followup.decide`, CLI
`gatereeve follow-ups decide <file>`). Input: `followUps` (IDs) or
`select: {status?, severity?, origin?}` for bulk, `decision`
(`accept-risk|new-work|reject`) or `defaults: true`, `reason`, `authority`.
Recorded as one `FOLLOW_UP_DECIDED` event per call, listing each decided ID
with its decision and, for `new-work`, its tracking reference.

- `human-confirmed` may decide anything. `policy-default` (D8) applies only
  each follow-up's default: low `accept-risk`; medium `new-work`;
  `preExisting` `new-work` at any severity; review high has no default and
  stays undecided. The agent may record it under goal or mandated autonomy;
  otherwise it cites the human's "accept the defaults" instruction. A later
  human decision supersedes; `status` lists every policy-default decision.
- `new-work` files a GitHub issue in the follow-up's repository through the
  injectable `core.runtime.gh` (D7): it searches open issues for the marker
  `gatereeve-follow-up:<sha256 of dedupKey>` and reuses a match, else creates
  one. The text is a fixed template of repository-relative fields; free text
  is redacted of absolute and home paths and the workspace root, and never
  carries the feature home, run ID, host name or other repositories. A
  repository without a GitHub remote records `{kind: "seed"}` instead.

**3. Where decisions are enforced.**

- `milestone.check completion`: missing `follow-ups: N undecided (<ids>)`.
- `milestone.check merge` with `deliveryTarget: release`: missing
  `open high follow-up` while a non-`preExisting` high follow-up is undecided.
- `goalStatus`: `ready-pr` also needs every follow-up decided; an undecided
  high is reported as a park reason (D3).
- GitHub is the visible surface (D10): the `review.publish` summary lists
  every follow-up of the run, accepted lows included, with its status,
  decision authority and filed issue link. Each filed issue links back to the
  PR when `followup.decide` names it (`pr`). Only `new-work` follow-ups become
  issues; the gates read the local record, never GitHub state.
- `status.followUps`: counts by status and severity, undecided IDs, default
  decisions, and the next step. Light runs are the same (D1.4).

**4. `follow-ups.md`.** Regenerated in the feature folder by every
`followup.decide` and by `followup.render` (CLI `gatereeve follow-ups
render`), with a "generated, do not edit" banner: undecided, decided (with
authority kind), fixed, and seeds for the next feature. Feature-folder `.md`
files are already bookkeeping for the clean-checkout check.

**5. Metrics** (D9, measure 2). `STARTED` gains `followUps: 1`. The
projection (version 3) sets `followUp` on follow-up finding rows: `undecided`
for runs with the marker, then the decided value from `FOLLOW_UP_DECIDED`
events, and `fixed` from the Completion `MILESTONE` record, which retains the
final follow-up list. Runs without the marker leave `followUp` absent (not
recorded). `rejected` joins the `followUp` enumeration. Convergence measure 2
then reports `decided` from rows; measure 3's follow-up count uses the same
field.

**6. Docs.** PROTOCOL.md (record, operation, authority kind, enforcement,
waiver distinction), USER-GUIDE.md (deciding follow-ups), PERFORMANCE.md
(`followUp` values), cli/README.md (commands). Desktop protocol mirror
restaged byte-identical.

## Alternatives considered

- Recording review follow-ups as events at each boundary review: needs edits
  in the reviewer path #147 is changing, and misses results retained before
  this ships (D4).
- Including waived or adjudicated findings: merges two concepts with
  different authority (D5).
- Applying goal defaults at Completion: the goal agent is gone by then and the
  PR would not show the filed issues (D3, human).
- Blocking on pre-existing scan highs: blames the branch for the base (D2,
  human).

## Constraints

- Contract stays `gatereeve/current/8`; runs started earlier keep working: a
  run without the `followUps` marker still gets Completion enforcement for
  follow-ups derived from its results (the rule is what AC7 asks), but its
  metrics rows stay "not recorded".
- Never touch real GitHub in tests (`core.runtime.gh` stub). No local paths or
  client names in filed issue text.
- Stay out of `local-agent-adapters.js` and reviewer instructions (#147).
  `boundary-review.js`/`execution.js` are read, not edited, except an export
  if needed.
- Desktop resource mirror stays byte-identical to `plugin-src/shared/resources`.

## Open risks

- A run with many low findings produces many follow-ups; the defaults and the
  bulk `select` keep that one call, but `follow-ups.md` can be long.
- Cross-run dedup relies on the issue marker search; a closed issue with the
  marker is not reused, so a fixed-then-reintroduced base vuln opens a new
  issue (intended).
- Derived review follow-ups depend on retained results; a lost result makes
  its follow-ups unreadable, reported as a Completion blocker, not dropped.
- `gh issue create` partial failure (issue created, response lost): the next
  attempt's marker search finds and reuses it.

## Changes
