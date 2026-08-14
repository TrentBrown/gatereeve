# All Sources Notes

The all-sources dashboard is the most useful version when the user works across tools. It also requires the strictest fidelity labels.

## Collection order

1. Codex exact logs
2. Claude Code exact logs
3. Claude chat estimates
4. ChatGPT estimates

Exact numbers should land first. Estimates should be added only after the user understands the assumption.

## Interview questions

- Which AI tools did you use in the target date range?
- Which tool is the main source of exact logs?
- Which chat tools need estimates?
- What work families should the dashboard track?
- Which evidence notes are private and should never ship?

## Normalization

Every source must land in the same local-day row. If source timestamps disagree because of UTC, convert first, then sum.

Never merge estimated chat usage into exact source columns. The point of the dashboard is not only the total. It is the trust label attached to each source.
