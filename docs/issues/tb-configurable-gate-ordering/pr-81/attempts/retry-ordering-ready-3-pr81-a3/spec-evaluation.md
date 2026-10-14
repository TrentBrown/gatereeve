# Spec Evaluation - tb-configurable-gate-ordering

**Outcome:** FAIL
**Pinned source:** 2615083f3e3151a3c75730ce3fefbe188177b302

R7 needs one further class-wide guard: policy publication and own-byte rollback are not serialized across competing manager operations. Two operations can pass pre-publication validation against the same baseline before either publishes; a later conflict and rollback must not remove the other successful operation's policy, including identical bytes. Add per-repository exclusive policy mutation ownership across validation, publication, core migration and rollback, with a deterministic concurrent-operation regression. No human review readiness is claimed.
