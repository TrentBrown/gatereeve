# Advisory Review

Read `<plugin-root>/resources/PROTOCOL.md` for the current operation/input contract.

Declare readiness with `candidate.ready` when the candidate is ready. This does
not launch discovery. If discovery is desired, explicitly request the appropriate
current code/spec checks with `gate.execute`. Retain findings and remediation
claims as bounded reviewer inputs. There is no mandatory separate advisory
execution or disposition gate before formal review.
