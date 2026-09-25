# Design - tb-whiteboard-test-gate

**Status:** approved (gate passed 2026-09-24)

## Problem

Agent-generated changes can arrive faster than their human owners can build a
defensible mental model of them. A developer may be able to review a diff yet
still be unable to explain how the change works, why its architecture was
chosen, what assumptions it makes, or how to debug it under pressure. GateReeve
does not currently produce a rich, adversarial study artifact for that purpose.

This need is different from both existing gates:

- Explain Diff teaches a change through an interactive summary and
  multiple-choice quiz. Whiteboard Test must be standalone and must not depend
  on or mention Explain Diff.
- LLM-as-Judge validates implementation compliance against an approved spec and
  may block passage. Whiteboard Test must teach and expose weaknesses without
  becoming another work-validation gate.

The current Judge skill also has an independence defect. Its instructions ask
for isolation but permit the implementation agent to perform the evaluation in
its own context when a subagent is unavailable or not separately authorized.
GateReeve's current skill invocation does not prove that a fresh context was
used. The same missing runtime capability would prevent Whiteboard Test from
making a credible adversarial-isolation claim.

## Intent

Add a repository-activated **Whiteboard Test** plugin whose **Whiteboard
Defense** gate produces an evidence-backed, interactive mock technical defense
of the exact pinned PR scope. The artifact should let a reader pause on
open-ended challenge questions, formulate or speak an answer privately, then
reveal a concise defense, deeper explanation, concrete evidence, and optional
Push Harder follow-ups. It should favor substantive coverage and visual clarity
over brevity while remaining adaptive to the change.

Deliver, in the same feature and pull request, a reusable GateReeve
agent-workflow runtime and use it to correct Judge isolation. GateReeve—not
skill prose—must establish that each required model stage ran in a fresh,
bounded context. Codex and Claude Code, headless and Desktop execution, are all
required in the first release.

Whiteboard Test certifies only that a complete and defensible explanation
artifact was produced. It does not certify human understanding or flawless
code. Judge remains the independent compliance authority; a Judge failure
blocks the workflow and leaves remediation to an implementation context.

## Chosen shape

### Gate topology and activation

Whiteboard Test is a separate plugin namespace with a likely module ID of
`whiteboard-test/defense`. Installation makes the capability available but does
not alter repository policy. A repository explicitly activates the exact
module version and digest in `.gatereeve/workflow.json`; the resolved graph is
then pinned into new or explicitly migrated governed features.

Once activated, Whiteboard Defense is a required boundary gate. It depends on
current pinned Verification evidence and declares Judge as a conditional
ordering predecessor:

```text
Pinned context -> Verification -> Judge (when enabled) -> Whiteboard Defense
                                  \_______________________/
                                  edge omitted if disabled
```

The module uses `after: ["gatereeve/judge"]`, not a hard Judge dependency. If
Judge is enabled, Whiteboard waits for a current nonblocking Judge outcome under
normal GateReeve semantics. A Judge failure, stale result, unavailable run, or
unfinished attempt keeps Whiteboard ineligible. If Judge is disabled, the edge
is omitted and Whiteboard proceeds. Whiteboard never reads or derives content
from the Judge artifact; the event is used only for ordering and freshness.

Activated repositories run Whiteboard at ordinary and feature-final PR
boundaries. A human may explicitly waive it with a nonempty rationale for a
genuinely non-behavioral change. The model cannot exempt itself. The waiver is
attempt-scoped and becomes stale when pinned inputs change.

### Evaluation scopes

At an ordinary PR boundary, Whiteboard defends only the exact pinned slice plus
the minimum surrounding context needed to understand it. It must not expand
into a survey of the product.

At the feature-final PR boundary, Whiteboard defends the assembled feature from
the configured original feature base through the pinned final head, while
distinguishing the final PR's immediate delta where useful. This occurs before
merge so any human or Judge-driven remediation can still change the work.

### Whiteboard agent workflow

Whiteboard uses two independently isolated model stages:

1. **Challenger.** Receives the pinned evidence packet and produces the complete
   required set of primary and Push Harder questions before any answers exist.
2. **Defender/Publisher.** Receives the same evidence and the Challenger output,
   but no private Challenger reasoning or implementation conversation. It
   answers the questions and produces the structured manifest and interactive
   presentation.

The Challenger's required set is immutable. The Defender/Publisher may add
clearly identified supplemental questions but cannot remove, soften, merge
away, obscure, or omit a required challenge. Every required question receives
either an evidence-backed defense or an explicit unknown, evidence gap, or
limitation response. There is no Whiteboard Auditor or correction loop.

Both stages use a declared high-capability reasoning profile. Repository policy
or a host adapter maps that portable profile to an approved provider and model;
an adapter cannot silently downgrade it.

### Human-facing defense

The presentation is a linear mock defense with progressive reveal rather than
a multiple-choice test. A primary challenge may reveal:

1. **Concise Defense** written so a person could deliver it at a whiteboard.
2. **Deep Defense** explaining mechanics, architecture, tradeoffs, and context.
3. **Evidence** anchored in the exact pinned source.
4. **Push Harder** follow-ups, each with its own pause-and-reveal answer.

Challenge count is adaptive. Every defense covers how the evaluated change
works, why it was designed that way, and how it fails or is debugged, then adds
questions for material risks, integration seams, assumptions, counterfactuals,
and surprising decisions. It errs toward useful depth without adding padding.

Every primary challenge has concrete evidence such as commit-pinned paths and
symbols, diff sections, tests, recorded decisions, configuration, or schema.
Facts, supported inference, and unknowns remain visibly distinct.

Every nontrivial defense includes at least one meaningful Visual Model selected
for the change: for example an architecture map, sequence, state machine,
schema relationship, wireframe, debugging decision tree, or failure-containment
topology. Visuals connect to evidence, include text alternatives, and are never
decorative substitutes for evidence. A rare N/A requires an explicit reason.

There is no audio, recording, speech recognition, answer submission, reader
scoring, or certification of human knowledge.

### Findings and Whiteboard outcome

Findings about the implementation appear both inline and in a linked Defense
Findings summary. Typed findings include Undocumented rationale, Evidence gap,
Known limitation, Open risk, Unresolved unknown, Supported inference, and
Accepted tradeoff. Text and symbols carry meaning; color is supplementary.

A weakness in the defended work does not make Whiteboard fail. Honestly
exposing a questionable tradeoff, missing rationale, limitation, weak
observability, or unknown is successful Whiteboard behavior. Whiteboard PASS
claims only that the artifact is accurate, sufficiently deep, complete for its
pinned scope, and defensible.

Artifact defects do prevent PASS: wrong scope, unsupported factual assertions,
missing evidence, omitted required challenges, broken interactions, incomplete
generation, or unresolved generation warnings. PASS requires both the
Defender/Publisher's substantive attestation and deterministic validation. The
validator checks the contract and presentation mechanics; it does not grade
human knowledge or independently judge the implementation.

### Manifest and free-form presentation

`whiteboard-defense.json` is the authoritative evidence root. It records scope,
challenge structure, layered defenses, evidence anchors, findings,
relationships, Visual Model declarations, substantive attestation,
deterministic validation, and digest bindings to every required stage receipt
and output.

`whiteboard-defense.html` is the primary human artifact. The isolated model may
author self-contained HTML, CSS, JavaScript, SVG, diagrams, animations, and
interactions, constrained only by a small semantic linkage contract between
visible elements and manifest IDs. GateReeve presents it in a sandbox with no
network, filesystem, parent-window, or navigation authority. Validation checks
that required manifest items appear, resources are embedded, the page loads
without script errors, and required controls function. A standalone HTML file
or an unbound bundle cannot grant passage.

### Reusable agent-workflow runtime

The module protocol gains a provider-neutral agent-workflow run primitive. A
module declares one or more named stages with role instructions, bounded
inputs, typed outputs, fresh-context requirements, and dependencies on prior
stage artifacts. GateReeve schedules stages through a compatible host adapter,
validates receipts, writes governed outputs, and binds the result to the pinned
boundary before recording passage.

The protocol core is the reeve. Skill text, implementation-agent
self-attestation, copied invocations, ordinary terminals, and UI-only state
cannot prove isolation or record passage. Unsupported or unverifiable
isolation leaves the gate UNSET and reports Unavailable rather than falling
back to the implementation context.

Agent stages are observational:

- Read-only access to the exact pinned repository snapshot and declared
  evidence.
- A disposable scratch area that cannot modify the repository or feature
  record.
- Network denied by default.
- Typed output returned to GateReeve, which alone writes governed artifacts.
- No authority to remediate code.

Enabling an agent-workflow module is standing authorization for automatic
launch when its gate becomes eligible. A declared workflow advances through
its stages without per-stage consent. Failures remain visible and cannot cause
unbounded automatic retries; future policy may add optional cost, consent, or
retry controls without changing gate meaning.

The same portable protocol and CLI-facing runtime is authoritative for
headless and Desktop operation. Desktop invokes and observes that runtime; it
does not own a second execution model. No gate depends on Desktop being open.

The initial implementation includes conforming Codex and Claude Code adapters.
Codex must create fresh subagent contexts without inherited turns or summaries.
Claude Code must create independent custom-subagent contexts rather than
continuing or forking the implementation conversation. Separate user-visible
tasks are optional; fresh context and auditable adapter evidence are mandatory.

### Execution receipts

Each stage receipt retains audit metadata and cryptographic bindings rather
than a provider transcript. It records:

- Requested capability profile and actual provider, adapter/version, model or
  versioned alias, and reasoning setting.
- Opaque provider run or context identifier and execution timestamps.
- Isolation method and explicit zero-inherited-turns attestation.
- Pinned snapshot and read-only/network policies.
- Completion or execution-failure status.
- Digests of effective instructions, materialized bounded prompt, input packet,
  and typed outputs.

Receipts do not retain hidden chain-of-thought, unrelated provider conversation,
or complete internal transcripts. Provider identifiers may be represented by
opaque locally auditable tokens when raw metadata is unsafe or unstable.

### Judge isolation correction

Judge uses the same agent-workflow primitive for one fresh, read-only Judge
stage per attempt. It receives only the pinned spec and rubric, evaluated
source/diff, Verification evidence, repository instructions, and bounded Judge
prompt. It receives no implementation conversation, implementation rationale,
prior self-evaluation, Whiteboard artifact, or inherited turns. The existing
same-context fallback is removed.

Judge remains the compliance gate. It produces PASS, FAIL, or PASS WITH
CONCERNS using evidence from the pinned state. A FAIL blocks but does not
authorize code edits. Remediation occurs in an implementation context; the
revised state is pinned and evaluated by an entirely fresh Judge attempt.

The upgraded Judge module uses `judge.json` as its authoritative evidence root.
It binds the pinned inputs, requested and actual capability, execution receipt,
structured verdict and rubric results, and the digest of the human-readable
`judge.md` report. Historical `judge.md` evidence remains valid under previously
pinned module definitions. Adoption uses a new module version and explicit
workflow-model migration for work already in progress.

## Alternatives considered

- **Replace or depend on Explain Diff.** Rejected because Whiteboard serves a
  different purpose and must work when Explain Diff is absent.
- **Multiple-choice questions.** Rejected because recognition is too weak for
  open-ended explanation and defense.
- **A fixed trusted renderer.** Rejected as the sole presentation mechanism
  because it would constrain novel diagrams and interactions. The chosen hybrid
  keeps a strict manifest and sandbox while allowing free-form presentation.
- **Unstructured model-authored HTML alone.** Rejected because GateReeve could
  not reliably validate scope, required challenges, evidence, or provenance.
- **One context role-playing Challenger and Defender.** Rejected because it can
  choose questions that protect its own answers.
- **A third Whiteboard Auditor and correction loop.** Rejected because it
  duplicated Judge's validation/remediation responsibility.
- **A hard Judge dependency.** Rejected because repositories may intentionally
  disable Judge. Conditional ordering preserves useful sequencing without
  making Judge mandatory.
- **Instruction-only isolation.** Rejected because a skill cannot prove that
  the active agent did not reuse implementation context.
- **Gate-specific agent launch code.** Rejected in favor of a reusable staged
  agent-workflow primitive.
- **Vendor-specific model names.** Rejected in favor of portable capability
  profiles plus exact runtime attribution.
- **Codex-only, Desktop-only, or user-visible-task-only execution.** Rejected
  because the gate must remain portable across supported harnesses and surfaces.
- **Judge auto-remediation.** Rejected because evaluation must remain
  observational; a failed gate is sufficient to return work for repair.
- **Per-run user confirmation.** Rejected for this release because activated PR
  gates already run as part of the workflow and model cost is not an immediate
  concern.

## Constraints

- No implementation begins until this design passes explicit human approval,
  followed by specification and planning gates.
- Whiteboard and Judge remain separate modules, artifacts, verdicts, and
  responsibilities even though their runtime work ships in one pull request.
- All evaluation and presentation claims bind to one exact pinned boundary and
  module graph; changed inputs invalidate stale outcomes.
- Whiteboard must remain independent of Explain Diff.
- Judge may conditionally order Whiteboard but cannot provide explanatory
  content to it.
- The GateReeve protocol core alone records passage after rechecking current
  context, dependencies, fingerprints, validated evidence, and receipts.
- Repository activation and model migration remain explicit and digest-pinned.
- Historical feature records and Judge evidence are not rewritten.
- Free-form HTML is self-contained and runs only inside the declared sandbox.
- Agent stages cannot mutate the repository, feature record, or implementation.
- Required Codex and Claude Code support must satisfy equivalent semantics even
  when their provider-specific invocation details differ.

## Open risks

- Provider APIs may expose different guarantees and metadata for proving a
  zero-history context. Adapter conformance tests must distinguish verified
  isolation from assertion-only fallback.
- Enforcing read-only repository access consistently across Codex, Claude Code,
  headless execution, and Desktop may require platform-specific containment.
- Automatic execution needs crash recovery and bounded retry semantics without
  duplicate stages, runaway model calls, or stale results granting passage.
- Sandboxed free-form HTML needs strong browser tests for resource isolation,
  required controls, accessibility, printability, and varying viewport sizes.
- Large PRs may produce expensive evidence packets and oversized artifacts;
  limits must preserve coverage rather than silently truncate it.
- Model-authored explanations remain nondeterministic. Structured evidence,
  immutable challenges, substantive attestation, and deterministic validation
  reduce but cannot eliminate weak explanations.
- Adding an agent-workflow run kind and manifest evidence roots changes module,
  snapshot, CLI, Desktop, and artifact contracts. Schema versioning and
  migration tests must prevent reinterpretation of historical records.
- Capability-profile mapping needs a concrete configuration and readiness
  contract that detects unavailable or silently downgraded models.
- The exact bounded retry policy and receipt privacy treatment require
  specification-level acceptance criteria, but neither may weaken fail-closed
  isolation or permit unbounded automatic retries.

## Changes

- None.
