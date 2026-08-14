# Code Vulnerability Packets

Use this reference for packets whose IDs start with `C-`.

## Inspect

Read:

- the packet's primary file and line
- nearby source code around every code-flow location
- helper functions called by the sink
- route/auth context when relevant
- `.snyk` exclusions when present

Treat SARIF as a pointer, not proof. Confirm source, transformation, sink, and
runtime context in code.

## Classification

Prefer this order:

1. Direct code fix: validate input, constrain types, escape output, parameterize
   dynamic values, remove hardcoded secrets, or use a safer API.
2. Shared helper when the same issue repeats and a local helper pattern is
   already reasonable.
3. Narrow refactor into a documented mitigation when the behavior is intentional
   but needs isolation.
4. `mitigated.js` extraction plus `.snyk` `exclude.code` only for accepted
   risk, false positive, generated code, test-only code, deprecated non-runtime
   code, or a mitigation Snyk cannot recognize.

Do not imply that `.snyk` can exclude individual code blocks or lines. Snyk
Code exclusions are file/path based. When exclusion is necessary, factor the
reviewed code into a peer `mitigated.js` file and exclude that whole file.

## Common Fix Patterns

### XSS / Output Sanitization

Escape only untrusted text before inserting it into trusted markup. Do not
escape the whole HTML string if the string intentionally contains trusted tags.
Keep raw request/domain values raw for persistence, comparison, JSON responses,
and non-HTML use. When a handler must compose trusted HTML, create separate
escaped display variables close to that composition point and use only those
escaped variables in the HTML string.

Example shape:

```js
const escapeHtmlText = (value) => escapeHtml(value == null ? '' : String(value));
const userNameHtml = escapeHtmlText(userName);
const message = 'Hello ' + userNameHtml + ' <a href="#case/' + caseId + '">open</a>';
```

If no dependency is available, use an existing local escaping helper or add a
small reviewed helper. Do not invent incomplete escaping.

### Unchecked Types

Validate request body/query/params values before calling methods such as
`split`, `map`, `trim`, or before treating values as arrays or objects.

### Hardcoded Secrets

Remove the secret, rotate if real, read from environment/secret manager, and
avoid committing replacement values.

### Path Traversal / File Access

Resolve paths against an allowed base directory, reject traversal, and avoid
passing raw request values to filesystem APIs.

## Last-Resort Mitigated File Pattern

Use this only after deciding that direct remediation is not practical, not worth
the risk/cost, or not recognized by Snyk after a real mitigation.

Pattern:

1. Keep the original module as the public call site.
2. Create or reuse a peer file named `mitigated.js` in the same directory as
   the original file.
3. Move the smallest offending function or wrapper into `mitigated.js`.
4. Export the moved function from `mitigated.js`.
5. Import or require that function back into the original module.
6. Add the relative `mitigated.js` path to `.snyk` under `exclude.code`, if it
   is not already present.
7. Add a nearby `.snyk` comment block documenting the Snyk rule ID, CWE when
   known, original file/function, why direct remediation was not chosen or why
   Snyk still flags the mitigated code, and the revisit condition.

Examples of this convention:

- `server/mitigated.js` for server-level mitigations.
- `server/rest/mitigated.js` for REST-handler mitigations.

If `mitigated.js` already exists beside the original file, add the new export to
that file rather than creating another mitigation file.

## Verification

After editing:

1. Run focused unit tests or the smallest available route/test command.
2. Run `code build` with the same `--target`.
3. Run `code explain` with the same `--target`.
4. Confirm the packet disappeared or explain why residual packets remain.

## Exclusion Text

If `.snyk` `exclude.code` is necessary, it must point to the whole
`mitigated.js` file, not an original source file unless the original source file
is generated, test-only, deprecated, or otherwise intentionally outside runtime
scope. Include nearby comments with:

- Snyk rule ID
- file and line or function
- why this is false positive, accepted risk, generated, test-only, or mitigated
- why a direct code fix is not appropriate
- revisit condition
