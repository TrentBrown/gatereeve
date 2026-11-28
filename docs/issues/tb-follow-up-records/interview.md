# Interview - tb-follow-up-records

**Feature start:** 2026-11-27
**Status:** concluded

Source: GitHub issue #148 (AC7 of the convergence follow-up seed,
`docs/issues/tb-convergence-and-retirement/follow-up-feature.md`), tracking
issue #150 wave 4. The scope was agreed with the human before the run (the
issue is the design input), so the source feature's approved decisions D9,
D10, D14 and D22 are carried below as human-answered, and only genuinely open
choices were asked. Entries the agent settled from the code are marked
`agent` and are presented for review at the design gate.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**.

### D1 - Carried scope from the source feature (D9, D10, D14, D22)

- **Question:** What must follow-up records do?
- **Answer:** Approved in the source feature's interview (D9, D10, D14, D22) and
  restated in #148.
- **Answered by:** human
- **Decision:**
  1. Non-blocking and demoted review findings are recorded as follow-ups with
     origin data (finding ID, class, criterion, path, severity, failure
     scenario, round and reviewer, and why it did not block). A readable
     `follow-ups.md` is generated, never hand-edited, in the feature folder.
  2. Completion is refused while any follow-up is undecided. Decisions: accept
     the risk, turn it into new work, or reject it as not a real problem.
     Decisions can be made in bulk.
  3. Defaults under a new `policy-default` authority kind, never reported as
     human-confirmed: low accepts the risk, medium becomes new work (a GitHub
     issue, or a seed for the next feature when there is no issue tracker),
     high is never decided by default. An open high follow-up keeps the run
     incomplete and blocks the release merge. In supervised runs "accept the
     defaults" is one answer. `status` lists default decisions so the human can
     overturn any.
  4. Light runs follow the same Completion rule and defaults.
  5. Goal runs apply the defaults (filing medium follow-ups as issues) and park
     on an open high follow-up instead of reaching a ready PR.

### D2 - Pre-existing dependency-scan findings

- **Question:** The `dependency-scan` gate (wave 5) reports high and critical
  vulnerabilities already on the base branch. Its design says they never
  block and need no decision; AC7 refuses Completion on undecided follow-ups
  and treats an open high as a park and a release-merge blocker. How do these
  follow-ups behave?
- **Answer:** "Track, never block (Recommended)".
- **Answered by:** human
- **Decision:** A follow-up from a non-review origin that reports a
  pre-existing condition keeps the scanner's severity for display, but its
  default decision is `new-work` at every severity (one deduplicated issue,
  reused when an open one exists). It never counts as an open high, so it
  never parks a goal run or blocks the release merge. It still needs a
  decision before Completion, which the defaults supply.

### D3 - When a goal run applies the defaults

- **Question:** Goal runs end at a ready, unmerged PR; Completion runs only
  after the merge. When does a goal run apply the defaults and file medium
  issues?
- **Answer:** "Before the ready PR (Recommended)".
- **Answered by:** human
- **Decision:** Supersedes D22's "at Completion" for the filing. A goal run's
  `goal.terminal` reaches `ready-pr` only when every follow-up of the run is
  decided. The agent applies the policy defaults (low accepts the risk, medium
  files an issue), the PR lists the follow-ups and filed issues, and an open
  high parks the run. Completion re-checks that nothing is undecided.

### D4 - What counts as a review follow-up

- **Question:** Which review findings become follow-ups?
- **Answered by:** agent
- **Answer:** Every finding of a retained boundary `review` result of this run
  (paired or individual selection-tagged) that did not block when raised: low
  findings in any round, findings the reviewer marked non-blocking, and
  findings the round 4-5 band demoted. "Did not block" uses the same
  raise-time rule as the metrics projection (`scheduledBlocking` with the
  recorded round, regression paths and sweep records). Findings from results
  without a severity (earlier contracts) are not follow-ups. One follow-up per
  finding ID (the first raising result is its origin); a finding that a later
  review of the run marks resolved is `fixed` and needs no decision. Planning
  reviews are out of scope.
- **Options:** derive from retained results (chosen); record an event at each
  boundary review (touches `execution.js`/`boundary-review.js`, which #147
  also edits, and misses results retained before this ships).
- **Reversibility:** high.
- **Decision:** Review follow-ups are derived on read from retained results,
  so no reviewer-path code changes.

### D5 - Waivers and adjudications stay separate

- **Question:** Do findings closed by a waiver or an autonomous adjudication
  become follow-ups?
- **Answered by:** agent
- **Answer:** No. A waiver records how a gate was closed (with its own human
  authority and retained FAIL/UNAVAILABLE); an adjudication records residual
  risk on blocking findings. A follow-up records a decision on a finding that
  never blocked. A finding that blocked when raised is never a follow-up,
  whatever closed it.
- **Options:** fold waived findings in (blurs the two records and would make
  every waive need a second decision).
- **Reversibility:** medium.
- **Decision:** Kept distinct; documented in PROTOCOL.md.

### D6 - Non-review origins and deduplication

- **Question:** How does a non-review origin (the dependency-scan gate) create
  follow-ups?
- **Answered by:** agent
- **Answer:** A protocol-internal API records them as `FOLLOW_UP_RECORDED`
  events with `origin: {kind, ...}` (for `dependency-scan`: repository,
  manifest, vulnId, package, version, severity, title). The dedup key is
  origin-specific; for `dependency-scan` it is repository + manifest + vuln id
  + package@version. Within a run a repeated key is the same follow-up. Across
  runs the filed issue is the registry: its body carries a stable marker of
  the key's hash, and filing reuses an open issue with that marker. The gate
  itself is not built here; a test uses a synthetic finding of that origin.
- **Reversibility:** high.

### D7 - Filing issues

- **Question:** How is a `new-work` follow-up filed, testably and safely?
- **Answered by:** agent
- **Answer:** GateReeve files it through the injectable `core.runtime.gh`
  (the same seam `review.publish` uses), in the follow-up's own repository,
  after searching for an open issue with the dedup marker. The issue text is
  built from a fixed template of repository-relative fields; free text
  (failure scenario, class statement, title) has absolute paths, home paths
  and the workspace root redacted, and the text never includes the feature
  home, worktree paths, host names, run IDs or other configured repositories.
  A repository without a GitHub remote records a `seed` (listed in
  `follow-ups.md` for the next feature) instead.
- **Reversibility:** high.

### D8 - Authority and overturning

- **Question:** Who may record which decisions?
- **Answered by:** agent
- **Answer:** `human-confirmed` may record any decision on any follow-up.
  `policy-default` applies only the default for each follow-up, and is
  recorded either by the agent under goal (or mandated) autonomy, or in any
  run citing the human's "accept the defaults" instruction. A high review
  follow-up has no default. A later human decision supersedes an earlier
  decision; overturning `new-work` does not close a filed issue.
- **Reversibility:** high.

### D9 - Metrics measure 2 (decided at Completion)

- **Question:** How does #149's `decided` half of measure 2 become computable?
- **Answered by:** agent
- **Answer:** Follow-up decisions project `followUp` (`undecided`,
  `accepted-risk`, `new-work`, `rejected`, `fixed`) onto the matching finding
  rows (result hash + finding ID). Runs started under this version mark every
  follow-up finding `undecided` until decided; runs started earlier keep
  `followUp` absent (not recorded, never zero). `rejected` joins the
  enumeration. The "not recorded by this version" statement then appears only
  for cohorts without follow-up-aware runs.
- **Reversibility:** high.

### D10 - Where follow-ups live

- **Question:** Other threads already file follow-ups as GitHub issues, which
  are visible and well supported. Should GitHub be the record?
- **Answer:** "Hybrid, PR lists all (Recommended)".
- **Answered by:** human
- **Decision:** The authoritative record stays in the run's workflow database
  (the gates and metrics read it deterministically and offline). Only
  `new-work` follow-ups become GitHub issues, so the tracker holds real work
  and not every accepted low. The PR's published review summary lists every
  follow-up with its decision and issue link, and each filed issue links back
  to the PR. `follow-ups.md` stays as a generated view.
