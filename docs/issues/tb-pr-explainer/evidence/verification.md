# Implementation verification - pr-explainer

Source candidate: 6894bb4 on tb-pr-explainer, base 67871b00d6227c77257006176b51c5e231cabb44. Approved scope R1-R7, no merge/release/active installation.

## Completed observations

- System skill-creator quick_validate passed using an isolated uv Python with PyYAML. No global package changes.
- Plugin validate, lint, validate-native passed (28 skills; 205 portable files).
- Focused Node tests: 32 passed, zero failures (current-source, compose, native). Includes the new report-classification boundary regression; arbitrary HTML, executable and config remain inputs. [Receipt](focused-tests.log).
- Actual native install smoke in disposable Codex/Claude profiles passed, both doctors ready, activation pending. [Result](native-smoke.txt). This is no claim of active-session installation.
- [Browser measurements and keyboard outcomes](artifact-browser-checks.txt): all four artifacts fit 1280px and 390px, no network rendering assets, all disclosures opened/closed by Enter, fragment navigation worked. HTML was loaded into an isolated about:blank page; no product was loaded. Desktop/phone captures are retained within each case. A real 390px overflow in the non-UI artifact was fixed by bounded grid tracks before successful recheck.

## Behavioral forward tests

Independent fresh agents received the skill plus a realistic request and raw inputs, without the intended answer or expected fixture inventory.

- [UI PR42](ui/pr-explainer.html.txt), [invocation log](ui/invocation-log.md): raw pinned source, design/spec, selected annotated excerpts, source-grounded visible before/after and pipeline diagram. Qualifies unavailable captures, author reports and synthetic-merge CI checkout.
- [Non-UI PR101](nonui/pr-explainer.html.txt), [invocation log](nonui/actions.md): explicit governed caller identity, exact two-file range and destination; no matching design/spec packet or supplied execution receipt. Explains the publication race and bounded retry policy; qualifies synthetic-merge CI and source-based concerns.
- [Controlled visual-discovery case](visual-output/pr-explainer.html.txt), [invocation log](visual-output/actions-evidence-limitations.md): relevant config leads into ignored non-default report output and relative attachment. Agent opened the PNG, recognized unrelated content and excluded it; labels failed base metadata and missing head execution. Missing intent docs are explicit. [Independent expected inventory](visual-expected.txt) was withheld from generation. Fixture source/report text is retained under visual-input; these are controlled test data, not historical runtime proof.

The fixture image was reused from an unrelated retained GateReeve run and is labeled accordingly. Original trial outputs remain in the task-owned scratch directory recorded by their action logs. Retained copies use .txt for raw source/config/JSON evidence, with local links adjusted; this keeps executable/configuration extensions outside the evidence exemption rather than broadening the classifier.

## Broad verification and limits

The first exploratory broad run on default Node26 was interrupted; preserve [its partial log](initial-node26-portable.log). The first official Node24 run failed with generated Python bytecode plus host-warning/timeout interference; [that receipt](portable-node24.log) remains retained. After removing bytecode, isolating only MODULE_TYPELESS_PACKAGE_JSON, and bounding file concurrency, the full Node suite completed: 437 discovered, 434 passed, 2 skipped, 1 failed. Its sole failure was a stale checked-in Desktop projection of evidence.js. Regenerating with the maintained apps/desktop/scripts/stage-protocol.mjs fixed the source/copy mismatch; the exact parity regression passed. [Full suite receipt](portable-node24-bounded.log), [repair check](copy-parity.log), and [local recipe](portable-acceptance-local.sh.txt) preserve what actually ran.

Current Verification runs the exact parity regression and focused current tests, all remaining portable acceptance stages, and artifact integrity/reference checks. Independent acceptance must assess this replacement coverage, including the exact current delta from the full-suite candidate. It does not relabel the failed broad run as green. No hosted CI was used by that local Verification.

No product tests/apps were run by ordinary skill trial invocations; the implementation's repository acceptance checks are a separate authorized development activity. No PR comments, merge, release, active installation or capture-policy changes occurred.

The installed rc.29 adapter predates the new report filename. Actual HTML artifacts stay in the task-owned trial directories; identical retained HTML text copies use .html.txt so the installed source boundary does not mistake them for application source. The replacement classifier is tested from source without changing the active installation.

## Relevant capture forward test

A fourth fresh trial, [capture explanation](capture-output/pr-explainer.html.txt) with [actions](capture-output/actions.md), found a relevant image through the configured ignored output and relative report attachment. It inspected and embedded the existing pending-save PNG, qualified its exact helper-head identity and controlled harness provenance, and excluded the unrelated stale image. The capture was prepared separately as explicitly labeled fixture test data using the exact head helper; no real product or Playwright suite ran. The trial agent did no fresh capture. Parent browser checks passed desktop/phone widths and keyboard disclosure, including loaded embedded-image checks.

The static site index now links the canonical new skill and distinguishes optional invocation and historical examples. Its diagram/skill snapshot assets are unchanged. Site-wide artifact regeneration was attempted but requires the optional Mermaid CLI absent in this checkout; no changed diagram asset depends on the index text. Current index link targets, existing fragment identities, and existing site tests are checked separately.

## Pre-existing website release-fixture failure

The optional existing website test run exposed a fixed rc.1 expectation against the unchanged rc.29 release manifest. Both test and manifest blobs exactly match the original base ([proof](site-baseline.txt)); this feature does not change either. The full failing receipt remains [current-check-1.log](current-check-1.log). Current scoped checks skip only that unrelated release-tuple assertion while exercising the remaining site behavior and all feature checks. Independent review must assess this scope decision; it is not a claim that the entire legacy site suite passed.

## Final fresh full backstop

The final repaired candidate under keepPullRequestsClosed=true passed the complete local portable-acceptance recipe. Typed result: sha256:83f9449c06fecfcebdba1c76f1bc9f258b83da5e5914c1d3b38bb6493c7340ca. [Raw receipt](final-full-backstop.log): 437 Node tests discovered, 435 passed, zero failed, two skipped; Python suites 29 + 69 + 2 passed; audit, lint, dual-platform deterministic builds, disposable setup/doctor and lifecycle checks passed. Scoped Verification sha256:889f5ab01a32f32cc70df625c20b74f2cc454e78f213bf734702b24bfe0c1e66 additionally retains four artifact trials and the selected site behavior. The unchanged legacy site RC tuple remains separately documented, not relabeled as passing. Hosted CI also ran for source head e80f1ca; its ongoing jobs are supplemental and not a substitute for these receipts.
