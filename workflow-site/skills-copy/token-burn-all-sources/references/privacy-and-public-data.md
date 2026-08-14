# Privacy And Public Data

The private dashboard can contain useful detail. The public dashboard should not.

## Keep private

- Raw logs and raw chat exports
- Client names
- Private project names
- Repo paths, ticket IDs, email addresses, and account IDs
- Prompt text that reveals proprietary work
- Any API key, token, cookie, service-role key, or `.env` value

## Safe public fields

- Date
- Normalized token totals
- Source-level totals
- Exact or estimated fidelity label
- Generic driver labels
- Scrubbed evidence notes

## Scrubbing pattern

Before deploying, replace specific evidence with normalized work-family language:

```text
Bad: "named customer onboarding deck, private ticket ID, team export"
Good: "shipping dashboard polish and review"
```

If a detail is the reason the day matters, keep it in the private local file and remove it from the public one.
