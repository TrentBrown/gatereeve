# Token Burn Data Contract

The dashboard reads one normalized JSON array from:

```text
assets/dashboard-starter/data/daily-burn.sample.json
```

When building for a user, copy that file to the starter app's `data/` folder and rename it only if you update the imports.

## Row shape

```json
{
  "date": "2026-05-24",
  "codex_tokens": 184320,
  "claude_code_tokens": 512880,
  "claude_code_calls": 47,
  "claude_chat_est": 38000,
  "chatgpt_est": 21000,
  "total": 756200,
  "driver": "shipping",
  "evidence": "local sanitized note"
}
```

## Rules

- Bucket dates in the user's local working timezone before aggregating.
- Keep exact measurements and estimates in separate columns.
- If `total` is missing, compute it from the source columns.
- Keep `driver` labels short and boring: shipping, research, review, video, planning, admin, support, writing.
- `evidence` should explain why a day spiked, but public evidence must be scrubbed.
- Never include raw logs, chat exports, client names, private project IDs, file paths, emails, or secrets in the starter app.
