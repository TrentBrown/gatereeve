This handler catches an error and discards it, either with a broad `except`/`catch` or an `except: pass`. The failure is now invisible: the program carries on in a state nobody planned for, and whoever debugs it later has nothing to go on.

1. **Catch only what you can name**, and only where you can do something about it.
2. **Make the outcome visible:** recover deliberately, add context and re-raise (`raise ... from err`), or, at a boundary that must stay alive, log the full traceback and continue.
3. **If you cannot say which error you expect and why**, delete the handler and let the error surface.

Adding `# noqa` does not help: GateReeve's code-health check ignores inline suppressions. A deliberate swallow that a human agrees with goes through a scoped waiver.

{% include "includes/line_level_issues.md" %}
