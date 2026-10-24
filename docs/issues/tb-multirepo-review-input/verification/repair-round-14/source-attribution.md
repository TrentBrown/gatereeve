# Test expectation correction and composite verification

Product source remains 7a945ecd5144df222b9445f8c8e338f4edffed7c. The only subsequent non-review change is the host-environment fixture assertion and explanatory comment in cli/test/current-core.test.js. It now expects isolated document-validator authorization to survive observer-only environment drift. Ordinary runner evidence must still become stale.

The complete broad CLI run on product source finished:352 tests,350 PASS,1 FAIL,1 intentional opt-in live-provider SKIP. Its sole failure was the obsolete assertion at current-core.test.js:650. This original failed log is retained unchanged. Formal14 Verification was recorded FAIL and moved to remediation.

The complete corrected test and three related controls were rerun:4 PASS,zero FAIL/skip. This executes the formerly unreachable declared-environment tail, full inherited-runner environment drift, trusted helper drift, and postflight/unbound-import rejection. The independent evaluator examined the assertion and approved this composite coverage conditional on the broad run having no other failures; that condition is met. The original full run is not relabeled green. All other product/runtime/package evidence remains applicable because product bytes are unchanged. No formal gate waived.
