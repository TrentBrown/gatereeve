# Managed storage

## Local installer retention

Default local desktop packaging and `verify-local-package.mjs` keep their DMG in
`~/.local/share/gatereeve/installers/entries/<id>/installer.dmg`, separate from
temporary scratch. `GATEREEVE_INSTALLER_ROOT` can select a different private root.
Small ownership records register producers, consumer leases, success order and
explicit expiring holds. The most recently completed successful available
installer survives regardless of version naming or clock changes. A failed or
unfinished build cannot displace it. Verification qualifies only after its
checks and external receipt publication succeed.

Successful production attempts cleanup automatically. `gatereeve cleanup`
previews deferred older-DMG cleanup alongside scratch; `--apply` rechecks and
deletes eligible payloads. `--run` remains scratch-only. Doctor inspects metadata
without hashing bulk, probing activity or creating directories. Full cleanup
checks content identity/hash, process start identity, open files and mounted
backing images under a shared maintenance lock. Unknown activity or corrupt
ownership blocks the sweep. Interrupted locks require inspection, not age-based
stealing. Compact checksum and deletion receipts survive; repeat cleanup is safe.

Only registered `installer.dmg` files are unlinked. Entry directories, checksums,
verification records, installed apps, rollback copies, recovery packets and
release assets are never recursively pruned. CI, signed release packaging and
explicit `--output-root` exports keep their existing caller-owned outputs.
Historical/downloaded DMGs outside the managed root are not discovered or adopted
by filename. `gatereeve installer add /absolute/successful.dmg --version <version>`
explicitly copies a known successful installer into retention, preserving the
original and its neighboring evidence. Review removal of that original separately.

Use `gatereeve installer hold <id> --until <timestamp> --reason <text>` to retain
an exact entry, and `installer release-hold <id>` to clear it. Expiry permits the
next cleanup; no scheduler runs. Use `gatereeve installer use <id> <command>
[args...]` to lease an active consumer; exact `{installer}` arguments expand to
the path and the child receives `GATEREEVE_INSTALLER_PATH`. Await all children;
do not daemonize. The desktop verifier leases managed inputs automatically.
Cooperative leases protect the entire operation, including gaps between reads;
external consumers should take a lease or hold before use. Cleanup never restarts
apps or switches active sessions.

## Temporary storage

GateReeve owns only registered run directories beneath the host temporary
directory's `gatereeve/runs/` folder. Each run has a small owner record (purpose,
creation time, user/directory identity, process/start time, lifecycle, optional
hold and supervised children) and an activity marker. No database is needed.

Use the CLI from an installed package or a source checkout:

```sh
gatereeve cleanup                    # preview; no writes
gatereeve cleanup --apply            # recheck and remove eligible owned runs
gatereeve cleanup --run <run-id>      # preview one exact run
gatereeve doctor                     # quick advisory metadata inventory
gatereeve scratch run --purpose test -- /absolute/tool arguments
gatereeve scratch run --keep-hours 24 -- /absolute/tool arguments
```

`scratch run` starts the command in its new run directory and supplies
`GATEREEVE_SCRATCH`. Use absolute input paths and export required outputs outside
scratch. Its child process group is tracked; SIGINT/SIGTERM are forwarded and
owned children must finish before cleanup. Do not detach or daemonize work from
the supervised group. Library consumers use `withScratch(options, callback)` and
must await all children. Await explicit exports of required reports before the
callback returns. Never put caller-requested deliverables, installation caches,
signed release recovery material or canonical feature evidence in scratch.

After success or failure a compact diagnostic receipt (bounded error/output,
no environment or full command arguments) is written to `gatereeve/reports/`
before bulk becomes eligible. Governed checks keep raw captured output out of these
reports and pass it to the existing redacted evidence pipeline instead. These temporary diagnostics are not permanent gate
evidence or backups. They are outside automatic run cleanup. Export required
evidence to the feature record. Consider sensitive tool output before retaining
diagnostics. A failed receipt write protects bulk. Cleanup failures remain visible
alongside the original error.

An explicit hold protects bulk until its expiry. Expiry only permits a later
on-demand cleanup; there is no scheduler. `plugin smoke-install --keep` holds its
owned workspace for 24 hours. A caller's explicit `--workspace` remains caller
owned. Normal completion cleans the command's own scratch where safety checks
permit. Retained paths and reasons are reported.

Cleanup rechecks run/root ownership and directory identities under a maintenance
lock. Symlinked roots/records, malformed or missing owners, active owners or child
groups, mounted directories and uncertain OS observations are protected. PID reuse
alone does not establish inactivity. Full checks use POSIX `ps`, `mount` and
`lsof`; unavailable tools or permissions retain scratch. Doctor reads metadata
only, labels possible interruptions, and does not claim size/reclaimability until
a full cleanup preview. Allocated-byte estimates are not guaranteed free-space
changes (APFS snapshots/clones and concurrent activity may differ).

Interrupted runs can be eligible once recorded owner/children are inactive and
OS probes find no remaining use. An interruption during child registration or
maintenance itself stays uncertain. Inspect and explicitly resolve those records;
do not remove a maintenance lock based on age/PID alone. Unknown unregistered
directories and all historical `/tmp/gr-*` directories are excluded. There is no
force flag, blanket prefix sweep, or deletion of source worktrees/installed apps.

For local desktop packaging verification, use the maintained
`apps/desktop/scripts/verify-local-package.mjs --report /absolute/new-report.json
--version <version>` command from the source checkout. It exports an exact DMG
hash and verification receipt before cleaning its temporary application/fixture.
`--keep` provides a 24-hour debugging hold. Production builds continue through
Release Conductor with separate, explicitly retained outputs.

## Default producer coverage

Managed storage is the default for disposable work created by GateReeve:

| Producer | Managed contents | Retained separately |
|---|---|---|
| Desktop packaging | source/branding staging, Electron packager intermediate trees, DMG composition copies | managed latest local DMG; explicit/CI/signed application and DMG outputs |
| Desktop verification | mount directories, smoke profiles, local verification builds/fixtures | exported verification receipts |
| Homebrew smoke | test application copies, temporary files and smoke-specific download cache | existing installations/taps and requested evidence |
| Release preparation | plugin builds, coordinated packets, publication packet assembly, bundles, selected-source worktrees | final requested outputs, approvals and publication recovery records |
| Release observation and CI reuse | downloaded provider/source/matrix evidence working copies | qualified copied receipts and their provenance |
| Independent review | sealed source views, provider output/schema staging, evaluator OS temporary files | canonical findings/verdicts and source pins |
| Governed checks | command-specific temporary directories and supervised child groups | caller outputs and bounded execution receipts |
| Repository tests / portable acceptance / developer smoke and benchmark / marketplace publish script | inherited Node, Python and shell temporary files, including abandoned fixtures | exported reports, explicitly requested build outputs |

The standard npm test commands and portable acceptance script supervise their
children automatically. For an ad hoc command, preserve the project cwd with:

```sh
gatereeve scratch run --cwd /absolute/project --purpose regression -- node --test
# Dependency-free source-checkout entrypoint; preserves the current cwd:
node plugin-src/shared/resources/storage/scratch.js run python3 -m unittest discover
```

Supervision sets `TMPDIR`, `TMP`, and `TEMP` to a run-owned subdirectory and
propagates `GATEREEVE_SCRATCH_ROOT` for nested GateReeve operations. Inherited roots
must already be registered/private; arbitrary directories are never adopted.
These settings affect child processes only. Tools that explicitly select a path,
ignore standard temp variables, or use their own persistent caches retain those
separate semantics. Never pass the scratch run root itself as the contents of a
published archive/image; use a child directory so owner records stay private.

Required exceptions: final outputs and multi-step CI download/upload directories
remain caller-owned until their consumer/export finishes. Persistent dependency,
Electron-download and installation caches are reusable data, not disposable
scratch. Small `.tmp` siblings used for atomic state updates stay beside their
target. Cross-filesystem output promotion uses a short `.gatereeve-publish-*`
transaction beside the destination so publication remains atomic; normal failure
removes that exact transaction, but global scratch cleanup never scans it.
Interrupted output transactions require local recovery/inspection.

Managed review views restore directory write permission only after guarded
cleanup establishes eligibility. Existing unregistered views remain visible for
inspection; this migration never sweeps old temp prefixes. A changed controlled
runner environment policy requires fresh affected verification; planning,
approvals and historical evidence remain intact.

The historical boundary-cost benchmark still targets its original review API;
this storage migration does not restore that retired API. Website copies of
unrelated plugin examples are not GateReeve execution entrypoints.
