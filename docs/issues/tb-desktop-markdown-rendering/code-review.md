# Code Review - tb-desktop-markdown-rendering

**Reviewed:** 2026-08-31
**Context:** Standalone review of the current `main`-relative local diff
**Verdict:** PASS

## Findings

No findings.

## Review Notes

- The content boundary is ordered correctly: unsafe raw/image nodes become
  text, links lose authored navigation, HAST is narrowly sanitized, and only
  then is DOM created (`apps/desktop/renderer/markdown-source.js:91-141`).
- The sanitizer does not admit image, media, frame, object, script, style, SVG,
  arbitrary classes, event properties, or authored resource URLs
  (`apps/desktop/renderer/markdown-source.js:11-72`).
- Rejected links are replaced with their exact positioned source; accepted
  links retain only the existing resolver result and application callback
  (`apps/desktop/renderer/markdown-source.js:187-225`).
- IDs are application-prefixed and logical fragment lookup is explicit rather
  than reverting to untrusted document IDs
  (`apps/desktop/renderer/markdown-source.js:143-163`,
  `apps/desktop/renderer/renderer.js:1160-1167`).
- The generated module is rebuilt for supported source paths and again inside
  staging. Staging removes the unbundled source and retains no runtime
  dependency tree (`apps/desktop/scripts/build-renderer.mjs:16-45`,
  `apps/desktop/scripts/package-macos.mjs:32-50`).
- The regression suite exercises the new syntax, safety cases, both application
  surfaces, build/staging behavior, and existing Desktop contracts.

## Residual Risks and Test Gaps

- Native Electron could not start on this host because `libatk-1.0.so.0` is
  absent. A real-browser production-module fixture passed, but native Electron
  and macOS packaged-app smoke remain required on their configured hosts.
- Large-artifact performance was measured (2,000 list items in 718 ms) but no
  hard product limit is specified; pathological inputs remain synchronous.
- No `.pattern-review` configuration exists in the repository, so this review
  could not apply repository-specific pattern rules.
