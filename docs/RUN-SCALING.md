# Run scaling: reviewer history and runtime fingerprints

Two costs in contract `gatereeve/current/5` grew with the length of a run and
the size of a workspace. Small fixtures did not show either. MyLifeMap's frontend run on rc.23
(`fe-resume-rc22-20261102-1`, 2026-11-05/06) hit both. This note records the
fix chosen for each one, against the invariants the protocol already relies on.

## 1. Reviewer history overflowed the provider prompt

**Failure.** Each independent review inlined every relevant prior report in full:
49 reports and 331,890 bytes by candidate 5 of PR #281, growing about 30 KB per
failed round. When the prompt passed the adapter's 524,288-character limit,
the gate went UNAVAILABLE before any model call. Archiving planning
documents bought one round. The slice then merged under a waiver.

**Why not compression or truncation.** Compressing the text doesn't help,
because the reviewer has to read the prompt. Truncating reports, or capping
records, would bring back the review-round cap that selection deliberately avoids.
It could also drop an open finding without anyone noticing.

**Fix: history becomes evidence the reviewer reads, not prompt text.**
(`protocol/current/review-history.js`)

- Selection is unchanged. It still has no record-count cutoff, and the same
  reports are bound in the prepared input. Result reuse and proof identity are
  unaffected.
- Every selected report is already copied in full into the read-only review view
  as `evidence/<hex>`. The view now also contains:
  - `history/index.json`, a projection of every selected entry in run order;
  - `evidence/index.json`, listing every copied object.
- Each prompt entry is a **projection** of its report. It keeps the findings
  (with evidence), disposition statuses, the evidence for non-PASS criteria,
  coverage completeness and limitations, `historyAssessment`, and a path to the
  full report. It drops the summary prose, coverage paths and interactions.
- Entries are shaped under fixed character budgets, in priority order:
  1. reports carrying open or reopened blocking findings;
  2. reports behind `reconsiderClosures` and claims;
  3. explicitly requested history and the delta prior;
  4. remaining context.

  Within each priority, newer reports come first. An entry that does not fit
  becomes a compact reference (`inline: false`). After that it appears only in
  `history/index.json`, and `historyIndex.indexOnly` counts how many entries
  that applies to. The prompt is measured with the adapter's exact text, and
  the first of four tiers that fits wins. Shaping is deterministic.
- `historyIndex.guide` tells the reviewer how to read this. Omission from the
  prompt is reported as a size bound, never as a history gap. `historyGaps`
  still means unavailable evidence only, so it keeps forcing fresh full
  assessment. Folding size bounds into it would wrongly block qualification.
- `validateVerdict` still checks dispositions against the full server-side
  reports. A PASS that ignores a projected open finding is still rejected.
- The evaluator instructions are unchanged. The new format is described inside
  the packet itself. Changing the instructions would change `reviewContract` and
  disqualify every retained review in active runs.

**Result.** In the replay test, 30+ reports of about 18 KB each (well over 512
KiB inline) become a prompt under 75% of the limit. The open finding stays
inline, and every report stays readable in the view. A synthetic 2,000-round
history still fits.

## 2. Runtime fingerprints re-hashed about 2.5 GB per check

**Failure.** Re-qualifying a runner result fingerprints its declared runtime
inputs: the Node install, the worktree `node_modules`, Playwright browsers and
so on, about 40,000 files and 2.5 GB in MyLifeMap. rc.23 did this:

- once per configuration key;
- for every milestone that `status` evaluates;
- again in each live-input guard and each waiver risk.

Each pass read every byte one awaited file at a time. It also called
`realpath()` on every entry and re-walked each pnpm link target. Decisions and
merges took 15–50 minutes, against 1.2 s for a parallel `sha256sum` of the same
files. Metrics attributed none of this time.

**What must hold.** A verification result stays bound to the exact runtime it
ran in. Any change to a bound input after verification must still invalidate
it. The manifest format and `RUNNER_FINGERPRINT_POLICY` are unchanged, so
retained proofs remain valid.

**Fix** (`protocol/current/fingerprint-cache.js`, `environment.js`)

1. **A content-hash cache keyed on stat data, as Git's index uses.** A file's
   hash is reused only when its device, inode, size, `mtime_ns` and `ctime_ns`
   all match. Every write or metadata change advances ctime, and user space
   cannot set ctime back.
   - Files modified within 2 s of the observation are never cached (the racy
     window). A file is also re-read if its stat changes during the read.
   - The cache lives in the feature home, is sealed with an HMAC derived from
     the runner comparison key, and is released at completion.
   - A cache that is missing, corrupt or fails its seal grants nothing and is
     replaced.
   - `GATEREEVE_FINGERPRINT_CACHE=off` turns it off.
2. **Parallel prefetch, deterministic walk.** Stats, listings and hashes are
   fetched with bounded concurrency (32) and memoized per observation. The
   existing sequential walk consumes them unchanged, so manifests stay
   byte-identical. Children of a checked real directory skip `realpath()`
   and the containment checks. pnpm hard links share one read per inode.
   Interpreter detection reads 4 KiB, not the whole binary.
3. **One observation per operation.** Within one adapter operation,
   qualification and waiver-risk requests share an epoch. A live-input guard
   only accepts an epoch that began after the guard began, so the existing
   "freshly read at each final guard" rule still holds. Runner pre- and
   post-check observations are always fresh.

**Measured** on a generated pnpm-shaped workspace (39,602 files, 155 MB, plus
the Node binary), 4 cores, warm page cache:

| | rc.23 | This change |
|---|---:|---:|
| One fingerprint, cold | 13.0 s | 6.1 s |
| One fingerprint, warm | 13.0 s | 1.8–2.2 s |
| `status` | 61.3 s | 8.8 s |
| `status` after a verification waiver | 103.6 s | 10.0 s |
| `milestone.check acceptance` | 42.6 s | 4.4 s |
| `milestone.check merge` | 72.0 s | 6.1 s |
| `human.decide` (waive incl. verification) | 13.7 s | 2.2 s |

rc.23's cost per pass grows with the bytes hashed. A warm pass on this branch
grows only with the number of entries, so the MyLifeMap tree (2.5 GB) should
re-check in about the time its 40k-entry stat walk takes.

**Not chosen yet (policy decision).** Fingerprinting package-managed trees by
identity (lockfile, pnpm store integrity, Node binary hash, Playwright revision
markers), or binding only what verification actually loaded, would remove the
stat walk too. Both change what is bound, not just how it is read. They need a
new fingerprint policy, and every retained runner proof would be re-run once.

## 3. Metrics

New labels in the performance store (`performance/store.js`):

| Label | Category | Meaning |
|---|---|---|
| `environment-fingerprint` | setup | Span per computed fingerprint. `count` = bound entries. Requests answered from the operation's shared observation add no record. |
| `environment-hash` | setup | Files read and hashed by one observation. Absent when every hash came from the cache. |
| `environment-hash-bytes` | setup | Bytes hashed by one observation. Absent when nothing was read. |
| `review-prompt` | review | Measured prompt characters. `REJECTED` if no history tier fits the limit. |
| `review-history` | review | Selected history entries. `SKIPPED` when some were carried by reference or index only. |

Records are kept few on purpose. rc.23's per-file metrics store reconciled its
whole inventory on every write once it held 19,000 files. The SQLite store that
replaces it (see `PERFORMANCE.md`) appends without rescanning, but each record
still counts against the retention cap.

Fingerprint time now appears as child spans of the operation, not as
unexplained time inside `gate.execute` or `human.decide`.

## Follow-ups seen but not changed

- `source-view` (88 min across 24 views in the MyLifeMap metrics) copies each
  history report's prior source snapshots into the view. This also grows with
  history, and is the next attribution target.
- Selection still re-qualifies every closed finding's closure each round. This
  is quadratic in long runs, and is visible as seconds per `gate.execute` in
  the replay test.
- `packet.planning.authority` (all decisions) and `reconsiderClosures` still
  grow with a run, though slowly. The history tiers absorb this growth until it
  is large.
