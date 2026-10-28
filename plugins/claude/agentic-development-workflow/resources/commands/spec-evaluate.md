# Spec Evaluate

Read `<plugin-root>/resources/PROTOCOL.md` for the current operation/input contract.

Use `gate.execute` to request the `spec` gate with current Verification proof and approved rubric scope.
A fresh independent evaluator scores every selected criterion with evidence;
whole-feature scope includes every rubric row. Code/spec may share a session but
must return separate verdicts. Missing evidence is UNAVAILABLE, not partial PASS.
Update tracker from the recorded outcomes and retain limits. A targeted delta
must name prior proof and cover changed paths plus their interactions.
