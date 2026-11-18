# Independent acceptance assessment

Current recorded review: sha256:d51a64d3b322493fec987de83ba39d3a86e432f55a85f8d54d8c75ce1124634d

Outcome: PASS for R1-R7, with no blocking findings. F2 is resolved; F1 and F3 are retained nonblocking follow-ups. The original structured result is [independent-review.txt](independent-review.txt).

Fresh consolidated review of the pr-explainer feature: base 67871b00 to head c42c65bd. The target equals the base, so merging adds nothing beyond the feature change. Because historyGaps is nonempty, I did a full reassessment and did not rely on earlier verification history.

What changed:
- The explain-diff skill is replaced by plugin-src/shared/skills/pr-explainer: SKILL.md, agents/openai.yaml, and three references (artifact.md, visual-evidence.md, invocation-contract.md). The old skill entrypoint is deleted.
- The inventory entry is swapped. Both workflow_doctor.py REQUIRED_SKILLS copies are updated.
- 'pr-explainer.html' is added to REPORTS in both evidence.js copies, and the Desktop projection was regenerated.
- A new behavioural classifier regression is in cli/test/current-source.test.js.
- Active docs are updated: USER-GUIDE, DEVELOPMENT, the Desktop README and the static site index.
- Historical records, fixtures, workflow-site artifacts and skills-copy are unchanged (explain-diff counts match base).

I found no blocking defects.

Validation since the last review is stronger:
- Verification 6404 contains a direct full ci/portable-acceptance.sh PASS on c42c65bd itself: 437 Node tests, 435 passed, 2 skipped; Python 29+69+2 OK; 'All 28 workflow skills are present' in both packages; 'Portable acceptance passed'.
- Its only failure was the helper script that prints a report (outside the repository) crashing with spawnSync git ENOBUFS. That happened after the receipt had already printed 'Artifact integrity checks passed'.
- Verification 7b4e replays the repaired artifact command on c42 (PASS) and runs apps/desktop/test/stage-protocol.test.js on c42 (1/1 pass).
- It also retains a receipt for hosted run 44368349936 on e80f1ca. Every full-scope job succeeded, including both Desktop contract jobs. The two skips are expected by plugin-ci.yml conditions: Review artifact validation runs only for review-artifacts scope, and Retain complete source acceptance runs only on push.
- That receipt asserts exact equality of all 1298 filtered application entries and their OIDs between e80 and c42. This is an implementer-script assertion. The direct full portable PASS on c42 independently supports it, but the hosted CI is not counted as a run on c42.

F2 (Desktop contract not executed) is resolved. F1 (conservative CI artifact-name pattern) and F3 (site links resolve only after merge) remain present and nonblocking.

Caveats:
- changedPaths was not supplied and the metadata has no blob hashes. I rebuilt the changed set from base/head comparisons and the retained 'CURRENT DELTA' diff.
- Results from skill-creator quick_validate and the native install smoke remain implementer claims beyond what the package-inventory stages show.
- The retained trial HTML is assessed through .html.txt copies and receipts. The originals live in the task-owned scratch area.

## Coverage qualifications

### unchanged-legacy-site-tuple — PASS

The retained failing receipt ff2c944b fails only at test-desktop-early-access.mjs:79:10: a deepEqual of a hardcoded 0.1.0-rc.1 tuple against workflow-site/releases/desktop.json, which holds 0.1.0-rc.29.
- I confirmed head and base are identical for this test: rc lines 23-24, 48, 80 and 84 are the same.
- The manifest's version and name lines 8 and 12 are also identical between base and head.
- The failure point is after the index.html assertions at lines 75-78, so the changed index passed those assertions.
- The replacement run 1d126aff passes the other 3 site tests.
- The fresh full portable run, both on e80 (83f9) and directly on c42 (6404, command 2: 435 pass, 0 fail, 2 skip), plus the hosted full-scope CI on application-identical e80, cover everything else.
- plugin-ci.yml does not run the workflow-site suite.

The exclusion covers one unrelated pre-existing release tuple; the failure stays retained and is not relabelled as passing.

### reporting-helper-repair — PASS

Aggregate 6404 FAIL is retained, not relabelled.
- Its command 2 is an actual exit-0 receipt (1c0cb110) for the unmodified ci/portable-acceptance.sh on c42c65bd: 437 Node tests, 435 passed, 2 skipped (lines 2401-2406); Python 29+69+2 OK; both packages report 28 skills; 'Portable acceptance passed' (line 2821).
- Its command 1 failed in verify-evidence.mjs:38 with spawnSync git ENOBUFS while running 'git diff 6894bb4 HEAD' for the report (stderr 8148ca96). Its stdout 7266ca81:2019-2020 already shows 'Artifact integrity checks passed' and the site link and anchor checks.
- The repaired run 7b4e (stdout 140949) passes the exact absolute-node command on c42 with the same integrity lines (2019-2020) and a bounded application-path delta (2021+).

The helper is a scratch script outside the repository, so the repair affects only reporting, not product source or the checks performed.

## Criteria

- R1: PASS — Replacement and naming:
- workflow-inventory.json:167-170 names pr-explainer at shared/skills/pr-explainer.
- base/plugin-src/shared/skills/explain-diff/SKILL.md is absent at head, and no alias exists: invocation-contract.md:29 says 'There is no explain-diff alias'.
- Both workflow_doctor.py copies list 'pr-explainer' at line 31.
- USER-GUIDE.md:279 says 'Run pr-explainer.' DEVELOPMENT.md:287-289 names pr-explainer and pr-explainer.html.
- The Desktop README:129 now says 'PR-explainer'.

Packaging: the c42 full portable receipt (1c0cb110:2567, 2726) shows 28 skills present in both packages.

Standalone invocation:
- SKILL.md:12-18 requires full base/head or working-tree snapshot identity, asks for clarification when the scope is unresolved, and says 'Ordinary use needs no GateReeve run'.
- The trials record exact ranges, e.g. 140949:368 fec5039e..aa9541fe.

Historical records: the remaining explain-diff references (site artifacts, skills-copy, fixtures, docs/issues) match base counts and are not rewritten.
- R2: PASS — Guidance:
- artifact.md:5-9 and SKILL.md:30-36 require context, problem, behaviour, mechanism, evidence and reviewer focus.
- They also require grouped scope including consequential non-excerpted changes, base/head-bound citations, and labelled inference.

Trials (retained receipt 140949):
- 64 revision-bound source references were validated (line 2019). The PR101 static check resolved 22 Git path/line references against pinned blobs (line 384).
- PR101 states its missing design/spec packet explicitly (lines 380 and 1989) instead of inventing one.
- The UI42 log shows pinned intent documents were read and the earlier generated explain-diff.html was not consulted (line 203).
- R3: PASS — Guidance:
- artifact.md:11-29 maps each change type to a suitable representation with no quota.
- It forbids synthesised screenshots and forced one-sided before/after comparisons.
- It keeps the explanation visual when captures are missing.
- SKILL.md:38 makes quizzes optional and only when requested.

Trials (receipt 140949):
- The PR101 figure caption (lines 317/421) reads 'Conceptual event sequence derived from the two source revisions, not a captured execution or product screenshot'.
- The capture trial embeds the relevant head-helper PNG with a fixture-provenance note and excludes the unrelated image (line 2006).
- No fabricated product screens appear.
- R4: PASS — Guidance:
- visual-evidence.md:5-13 follows tests, Playwright config, ignored output directories, report attachments resolved relative to their report, and scoped CI artifact reads.
- Lines 15-29 distinguish baseline, actual, diff, failure and context-only captures, and forbid presenting stale or unknown images as current evidence.

Trials (receipt 140949):
- The capture log (line 497) shows playwright.config.ts → .gitignore → configured ignored output → results.json attachment resolved relative to its report → failure.png opened and inspected.
- The relevant pending-save capture was embedded with head-helper provenance; the unrelated stale failure image was excluded (line 2006).
- Visual discovery for PR101 stayed bounded to that scenario (line 372).
- Raw-context verification 49f3 / receipt 3e420548 checks the embedded PNG bytes against the original.
- R5: PASS — Guidance:
- SKILL.md:22 separates tests added, checks run, retained output, author reports and observed behaviour.
- SKILL.md:26 forbids running product tests, starting the app, fresh captures, test/CI changes, fixes, posting and delivery unless explicitly requested.
- artifact.md:31-43 says concerns carry no PASS/FAIL, score or merge recommendation.

Trials (receipt 140949):
- The PR101 log (lines 370-375) labels author stress tests as author-reported, qualifies synthetic-merge CI, records that CI was not dispatched, and shows no checkout, edits, posts or delivery.

No metrics, gate or enforcement is added. DEVELOPMENT.md:289 says 'the standalone skill does not add a required gate'.
- R6: PASS — Guidance:
- artifact.md:45-53 requires one self-contained file, reflow, bounded code scrolling, native keyboard-operable controls, and honest reporting of render and interaction checks.
- SKILL.md:42-46 honours explicit destinations and prohibits overwriting unrelated artifacts.

Browser checks (receipt 140949, lines 1736-1833), for all four trials:
- Width 1280 → scroll 1280, and 390 → 390.
- remoteAssets 0, images loaded, keyboard navigation worked.

Honest reporting and destination:
- The PR101 child reported its host CUA as unavailable and did not claim a render (line 373). The parent check covered rendering later.
- The explicit nonui destination was honoured and writes stayed in the trial directory (lines 365 and 375).
- R7: PASS — Contract:
- invocation-contract.md:5-27 defines caller identity, intent, evidence and destination inputs.
- It forbids substituting the live branch or a different feature home, and lists handoff contents.
- It creates no gate, publication or acceptance authority.

Governed trial: PR101 used the caller's exact range and explicit destination (140949:365-368).

Naming recognition is narrow:
- Only 'pr-explainer.html' is added to REPORTS (evidence.js:20, mirrored in the Desktop copy).
- The regression at current-source.test.js:38-60 is behavioural and passed in the c42 full portable run.
- There are no PROTOCOL, gate or authority changes, and pr-boundary.md is unchanged.
