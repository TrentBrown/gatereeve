# Verification — formal-pr84-16

Outcome: FAIL
Evaluated source:2e3251e3a7f3b506efd92e0c2e3f3b1daad6c798

Independent actual CLI smoke reproduced a product regression: documented evaluate verification --checks cannot express required externalRuntimeInputs, so a valid authorized check exits1. The same explicit full configuration succeeds. See code-review.md (CR16-1/R18) and cli-shortcut-regression.log. The broad CLI suite is still running with no reported failures; it does not override this failed smoke. Final-source closure7/core18/Desktop173 and actual packaged smoke/144 byte matches passed as retained in verification/repair-round-15. No complete Verification PASS is claimed.
