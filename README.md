# GateReeve

**Proof at every gate.**

GateReeve is a gate-based, artifact-driven workflow for agent-assisted
software development. It takes an idea from discovery through design,
specification, implementation, review, and closeout — preserving the
reasoning and evidence needed to trust the result. Agents execute with real
autonomy inside clear boundaries; work advances only through gates with
explicit pass conditions.

> **GateReeve runs the gates. You own the judgment.**

```mermaid
flowchart LR
    D{{"Design"}} --> S{{"Spec"}} --> B{{"Branch<br/>readiness"}} --> I{{"Implementation"}} --> P{{"PR<br/>boundary"}} --> H{{"Human<br/>review"}} --> C{{"Completion"}}
```

Every stage leaves durable records — interview, design, spec with a binary
rubric, plan, decisions, verification evidence, adversarial LLM-as-judge
review, and closeout proof — so the work stays inspectable instead of
disappearing into chat history.

## Get started

- **[Full overview](https://gatereeve.pages.dev)** — the philosophy, the
  gate spine, workflow layers, artifact flow, and real sample artifacts
  from a completed feature.
- **[INSTALL.md](INSTALL.md)** — install as a native plugin for Claude
  Code, Codex, or both (macOS and Ubuntu).
- **[USER-GUIDE.md](USER-GUIDE.md)** — start your first feature, work the
  gates, deliver sequential PRs.
- **[WORKFLOW.md](plugin-src/shared/resources/policy/WORKFLOW.md)** — the
  canonical process the plugin implements, with the
  [complete flow diagram](plugin-src/shared/resources/policy/WORKFLOW.mermaid).

## Why "GateReeve"?

The name borrows from the historical *reeve*: the local official who
enforced standards and kept order on the community's behalf. A gate-reeve
keeps the gates — each a decision point work must clear before it moves on.
GateReeve is a sibling of [PortReeve](https://github.com/TrentBrown/port-server),
the local port authority for development machines.

## License

MIT
