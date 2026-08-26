# Verification - PR #2

**Pinned range:** `801cfc82a17f2833ecf69607a7410d36be1f8b90..737ac3422c6dc502ba02956820301677a3a089be`

## Matrix

| Category | Command | Result | Evidence |
|---|---|---|---|
| Build/typecheck | `npm start --prefix cli -- plugin build --json` | PASS | Built both native packages; 158 files each; canonical protocol hash `sha256:1e71e3baf9347033e2a20c89ccfea0570fcd61f26659e192623db2441a4a90ba` |
| Lint/format | `npm start --prefix cli -- plugin validate --json` | PASS | 27 skills, both native platforms |
| Lint/format | `npm start --prefix cli -- plugin lint --json` | PASS | 153 canonical files inspected |
| Lint/format | `git diff --check 801cfc82a17f2833ecf69607a7410d36be1f8b90..737ac3422c6dc502ba02956820301677a3a089be` | PASS | No whitespace errors |
| Unit and contract tests | `node --test cli/test/snapshot.test.js cli/test/stage-protocol.test.js cli/test/lifecycle.test.js cli/test/observer.test.js cli/test/gatereeve-cli.test.js cli/test/plugin-adapter.test.js cli/test/protocol-contracts.test.js cli/test/portability.test.js cli/test/changes.test.js cli/test/boundary-protocol.test.js` | PASS | 39 passed, 0 failed, including nested malformed-contract rejection, escaping-symlink inventory rejection, and remediation history |
| Broad regression suite | `npm test --prefix cli` | PASS with unrelated environment limitation | 103 passed; the sole failure is the pre-existing release-bundle test invoking absent system executable `unzip` (`spawn unzip ENOENT`) |
| GitHub portable acceptance | Plugin CI run `33012123862` | PASS | Ubuntu 22.04/24.04 host and container jobs all passed after merging the separately approved fixture repair from PR #3 |
| Integration | Included in focused suite | PASS | Plugin adapter and Commander return the same snapshot/read contract; staged resources are executed directly; native packages have identical manifests |
| End-to-end/browser | Not applicable | N/A | This slice defines a read-only protocol and CLI contract; no graphical application exists yet |
| Application runtime | CLI/plugin runtime commands above | PASS | Staged plugin adapter initialized and observed a fixture; built native packages validate |

## Definition of Done

- **Build status:** PASS
- **Lint status:** PASS
- **Tests written:** `cli/test/snapshot.test.js`, `cli/test/stage-protocol.test.js`, plus lifecycle and CLI coverage; attempt 2 adds malformed nested-contract rejection cases
- **Test suite status:** PASS for all affected logic; broad suite has one unrelated host-tool failure documented above
- **Integration verified:** Yes - canonical source, staged CLI resources, plugin adapter, and native package manifests
- **Application runs:** Yes for the affected CLI/plugin surfaces
- **Pending manual verification:** None for this protocol slice

## Base refresh

Attempt 4 follows the separately approved and merged PR #3 repair to the
portable-acceptance fixture target. Merging current `main` into the topic
branch changed no observer-contract product files relative to the new base.
The focused matrix, plugin validation/lint/build, and all four GitHub portable
acceptance variants pass on the refreshed exact head.

## Known unrelated failure

`cli/test/release-operations.test.js` requires the external `unzip` program for one offline-marketplace assertion. The test reaches `spawn unzip ENOENT`; it does not exercise the changed snapshot, named-read, readiness, observer, adapter, CLI, or staging code. All other 103 tests pass.
