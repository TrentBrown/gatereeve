# Formal OpenAI execution configuration

The PATH Codex CLI0.142.4 rejected the configured model as requiring a newer
version. The application-bundled Codex CLI0.163.0-alpha.11.2 successfully executed
a fresh ephemeral gpt-6.1-sol context with high reasoning, read-only sandbox,
ignored user configuration/rules and no requested tools. Global config was not
changed. Formal execution uses the installed GateReeve native adapter with this
explicit executable:

`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`

This probe establishes provider availability only. The formal runtime must still
prepare the pinned isolated view, validate structured results and receipts, and
record passage through the governing core.
