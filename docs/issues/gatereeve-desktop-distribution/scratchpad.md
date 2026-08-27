# Decision Scratchpad - gatereeve-desktop-distribution

**Feature start:** 2026-08-27

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Separate packaged context resolution from trusted Python gate execution

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Canonical protocol context module, Desktop staged projection, and Plugin/CLI protocol consumers

Implement workflow-context discovery and validation once in the canonical JavaScript protocol and stage no Python scripts into Desktop. Preserve the existing Python guard providers for Plugin and CLI enforcement because Desktop does not execute workflow passage guards. Keep one canonical protocol rather than creating a Desktop fork; parity tests bind JavaScript context output to the Python resolver during migration.

**Triggered by:** AC2 requires packaged local observation without Python while the existing shared protocol also exports trusted Python gate providers used by workflow enforcement.

**Alternatives considered:**
Port every Python gate validator to JavaScript in this slice — rejected as unrelated scope with a much larger governance blast radius. Fork a Desktop-only context implementation — rejected because it would create protocol drift. Continue packaging the Python resolver — rejected because installed observation would retain an undeclared system runtime prerequisite.

## [2] Use exact tested pairs for Desktop and Plugin compatibility

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop setup observer, compatibility metadata, readiness projection, release version coordination

Store project-controlled compatibility metadata as an explicit list of tested Desktop and Plugin version pairs. Equal coordinated versions may be marked matched; unequal versions are operational only when an exact pair is marked compatible with evidence. Any absent pair is incompatible. Detection facts remain ephemeral and read-only, while incomplete or incompatible setup never hides an existing durable feature record.

**Triggered by:** P3 requires three evidence-backed compatibility states despite independently updated Plugin and Desktop installations

**Alternatives considered:**
Infer compatibility from semantic-version ranges - rejected because proximity is not evidence; require exact version equality - rejected because independent native update lifecycles create harmless tested skew; inspect a workflow record to infer Plugin version - rejected because historical records are not installation authority
