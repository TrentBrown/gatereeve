# Plugin Smoke Interview Answers

Use a fresh copy of this directory for each harness. Submit this request without
naming the workflow:

> Add a JSON output mode to this CLI while preserving its existing text output.
> Include tests.

Answer semantically equivalent interview questions with these settled choices:

- Add a `--json` flag; keep the current text output as the default.
- Emit one compact JSON object to standard output.
- Use `{"name":"Ada","message":"Hello, Ada!"}` as the named-output shape.
- Preserve `World` as the default name in both modes.
- Add no third-party dependencies.
- Cover default text, named text, default JSON, and named JSON behavior.
- Keep the change limited to this CLI and its tests.

Success at this workflow boundary means the agent conducts a one-question-at-a-
time interview, writes the settled answers under
`docs/issues/<configured-prefix>plugin-smoke/interview.md`, synthesizes
`design.md` when asked to conclude, and stops for design approval. Do not ask it
to implement the feature during this smoke run.
