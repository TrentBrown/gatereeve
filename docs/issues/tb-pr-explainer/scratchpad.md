# Decision Scratchpad - tb-pr-explainer

**Feature start:** 2026-11-18

Working record of implementation decisions. The approved product decisions and their actual human instructions are in interview.md D1-D12 and design.md. Implementation choices and validation observations are recorded below.

## Planning observations

- The canonical inventory currently exposes explain-diff; the user rejected a compatibility alias. Replace that skill and update active references selectively.
- Current evidence classification names explain-diff.html as a report. Supporting pr-explainer.html must not broaden exclusion to arbitrary executable/configuration inputs or rewrite retained historical records.
- Existing repository records contain runtime images, and PR #42 provides an accessible real UI change. Reuse only source/evidence that can be identified; controlled discovery fixtures remain explicitly labeled test material.
- The run's minimal local workspace configuration was created by run.start. Installation, PR actions, merge, release, and deployment are not covered by the design approval.

## Implementation notes - 2026-11-18

- Human implementation instruction: "Approve specification and plan; begin implementation". GateReeve recorded it against subject sha256:806b4a086f34cf22675bf6872e6045aebbb6456a06d441dcba65da08f37c55e0.
- Human autonomy instruction: "I give you full autonomy to work on this." The run.set-dial request named this run and was refused because GitHub reports main as unprotected. The formal dial remains supervised; existing implementation authority remains valid. Do not change branch protection or misreport delegated authority.
- Added the new reserved report filename to existing evidence classification while retaining the old filename solely for historical artifact handling. No legacy skill alias is shipped and no historical record is rewritten. A source-boundary regression exercises the reports alongside ordinary HTML, JavaScript and JSON inputs.
- Chose a concise skill and three progressive references, with no renderer/plugin dependency or new package dependency. Ordinary invocation remains a source/evidence investigation plus artifact generation.

Material choices will be triaged at the review boundary.

- Workflow Doctor owns an active required-skill list in addition to the packaging inventory; it now requires pr-explainer. Historical UI fixtures retain their original artifact labels. Native install smoke passed in disposable Codex and Claude profiles (doctor ready, activation pending); active user profiles were not modified.
