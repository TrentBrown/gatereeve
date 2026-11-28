A Promise is being passed where something synchronous is expected: an `if` condition, a `.forEach` or event callback whose return value is ignored, or a spread. The condition is always truthy, the callback's rejection is dropped, and the code moves on before the async work finishes.

- In a condition, `await` the value first.
- For callbacks, use a loop with `await` (`for (const x of xs) await f(x)`) or `await Promise.all(xs.map(f))`.
- For an event handler that has to stay synchronous, call an async function and handle its rejection inside it: `handler = () => { void run().catch(report); }`.

{% include "includes/line_level_issues.md" %}
