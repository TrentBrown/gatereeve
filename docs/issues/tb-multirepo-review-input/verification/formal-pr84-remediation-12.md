# Formal PR84 remediation 12

Native OpenAI Judge12 returned FAIL (17 PASS,4 FAIL) on 85f8b36. Its F1 showed that a retained retention PASS could still satisfy completion after required failed-specification evidence disappeared. The original independent reports and receipts remain unchanged under pr-84/attempts/formal-pr84-12.

## Repair and verification

Retention results now retain their checked candidate, decision, integration and failed-validation references alongside inventory and completion evidence. Admission checks the current failed-validation inventory and current required closure. Later failed validation requires a new deterministic retention check; restoring a missing or corrupt reference can recover the original applicable proof without changing its historical verdict.

The existing complete local workflow fixture now obtains retention PASS, loses and corrupts both failed diagnostics and unique failed-input bytes, and confirms completion checks and passage reject. Restoration recovers eligibility. A later failed amendment adds a new retained obligation, blocks the older retention result, and requires fresh proof after restoration. Actual local Git integration is exercised; evaluator/release transports remain explicit fixtures. Focused controls: 2 PASS. The prior code reproduced actual erroneous completion eligibility. Independent reproduction and full verification are being retained separately before the next formal assessment.

## Journal clarification

Event evt-pr84-remediate-12 correctly returned the active slice to implementation through the installed core, but its copied reason text mistakenly describes Judge11. This note corrects that prose: the reason for this transition was Judge12 F1 above. The immutable event is preserved rather than rewritten. No quality gate was waived.
