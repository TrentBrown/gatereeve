# Authorized PR84 merge window

Trent explicitly approved and requested merge/continuation. Human acceptance is recorded in event evt-pr84-24-human-accepted, committed c1ad9c5. Reviewed product remains unchanged. Source tb-multirepo-review-input to target main is permitted.

Installed pr_lifecycle.py revalidated the clean synchronized packet, reopened PR84, marked it ready and launched current-head checks. The four Cask jobs failed before installation: the unchanged workflow defaults to September1 publication run33541222023, whose artifact inventory is now empty. Original rc8 DMG/SHA256SUMS exist, but not the required linked publication packet. No failure is relabeled PASS.

Desktop contracts/runtime, universal packaging and packaged runtime on both native architectures passed. Four Linux acceptance jobs were still running at the retained observation. The local merge helper was interrupted with SIGINT while waiting, so it reclosed PR84; remote CI was not cancelled. No merge attempt reached the GitHub merge command. GitHub CLI refused draft conversion on the now-closed PR; it remains CLOSED/non-draft, permitted by the existing failed-window recovery policy.

A question is pending: explicitly accept only the four missing-artifact Cask failures conditional on all Plugin CI checks passing, or repair Cask CI before merging. No exception has been authorized yet. Original merge authorization persists; no new merge authorization is needed after satisfying these conditions. Do not publish/deploy as part of a check waiver.
