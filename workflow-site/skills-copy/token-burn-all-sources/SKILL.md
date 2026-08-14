---
name: token-burn-all-sources
description: Build a token-burn dashboard that tracks Codex, Claude Code, Claude chat, and ChatGPT on the same axes, with exact and estimated usage kept visibly separate.
---

# Token Burn Dashboard For All Sources

Use this skill when the user wants one dashboard across Codex, Claude, and ChatGPT.

## Workflow

1. Copy `assets/dashboard-starter/` into the user's chosen project folder.
2. Read `references/data-contract.md`, `references/dashboard-spec.md`, and `references/privacy-and-public-data.md`.
3. Read `references/source-notes.md` for source-by-source collection rules.
4. Inventory which sources the user actually uses.
5. Pull exact logs first: Codex and Claude Code where available.
6. Estimate Claude chat and ChatGPT only after interviewing the user or inspecting user-approved local artifacts.
7. Normalize every source into one daily row and one local timezone.
8. Run the starter app locally and verify all five views render.
9. Scrub private detail before deploy or sharing.

## Source Rules

- `codex_tokens`: exact when local Codex logs include token usage.
- `claude_code_tokens`: exact when Claude Code logs include token usage.
- `claude_code_calls`: count meaningful Claude Code sessions or calls.
- `claude_chat_est`: estimated unless exact provider logs exist.
- `chatgpt_est`: estimated unless exact provider logs exist.
- `total`: sum of all source columns.

## Done Means

- `npm install` succeeds.
- `npm run build` succeeds.
- All four source lanes appear on the dashboard.
- Exact and estimated labels are obvious.
- The dashboard answers: what work should the computer do next?
