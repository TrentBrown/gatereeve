# QualityCode Policy Profile

Apply this QualityCode profile in addition to the portable workflow core. The
user's branch prefix and any repository-specific exceptions remain explicit
per-user or repository configuration.

## Version control

- Treat `main`, `latest`, `staging`, and `production` as protected branches.
- Start topic branches from the repository's declared upstream branch and
  merge them through pull requests. Never infer a direct-commit exception from
  the repository name.
- Pull requests are the only active slice-review mechanism. An optional
  repository `keepPullRequestsClosed: true` closes PRs immediately after
  creation and keeps them closed through preparation and review. Reopen only
  immediately before an explicitly authorized merge. This preference never
  permits force pushes, rule bypass, or premature reopening for helpers.
- When a repository uses environment branches, treat those branches as
  deployment snapshots rather than the durable home for fixes.
- Use canonical promotion PR titles: `main <-- <topic>` upstream and
  `<target> <-- <source> (<topic>)` between environment stages.
- A production hotfix must be carried back to the upstream branch and affected
  active branches after the emergency.

## Nuxt and Vue

- Use the Options API idiom for single-file components by default. Use the
  Composition API or `<script setup>` only when explicitly requested or when
  the project already standardizes on it.
- Keep client API access in Pinia stores. Components call store actions and own
  only UI state, DOM/browser APIs, rendering, and interaction behavior.
