A Promise nobody awaits is an error nobody sees. If it rejects, the failure surfaces later as an unhandled rejection with no useful stack, or not at all, and the code after it runs as if the work had finished.

Decide what this call is for:

1. **The caller needs the result or the failure:** `await` it (or `return` it) so a rejection propagates to code that can handle it.
2. **It is meant to run concurrently:** keep the Promise and join it, for example `await Promise.all([...])`, before the function reports success.
3. **It really is fire-and-forget:** attach the handling explicitly, `void task().catch(error => log(error))`, so the decision and the failure path are visible.

Do not silence the rule with a bare `void` or an inline disable. Inline suppressions are ignored by GateReeve's code-health check. A real false positive goes to a human as a scoped waiver.

{% include "includes/line_level_issues.md" %}
