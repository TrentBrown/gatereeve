# Ordinary CI installer retention

This policy applies only to Actions artifacts named exactly
`gatereeve-universal-dmg`, produced by `.github/workflows/plugin-ci.yml`.
It does not delete workflow runs, logs, source-acceptance receipts, other
artifacts, release assets, signed bundles or release/recovery packets.

Keep the newest available installer from a **completed successful main push**
run (artifact creation time descending, then numeric artifact ID descending).
A newer PR, failed, canceled or running build does not replace this keeper.
Protect every installer whose producing run is not completed, including waiting
and queued reruns. The only current consumers are that run's Apple Silicon and
Intel package-test jobs. Do not add a cross-workflow consumer without extending
this protection or placing an explicit hold before the producing run completes.

After a run completes, its other installers are disposable unless held.
There is no per-branch quota and no automatic failed-build archive. Keep test
logs, source IDs, checksums and source-acceptance receipts separately. Cleanup
receipts include artifact IDs, source SHAs, digests, sizes and per-ID outcomes.
The existing source-acceptance receipt remains valid without the DMG download.

## Holds

Edit `ci/dmg-retention-holds.json` on **main** through the normal reviewed change
process. An example entry (replace the ID, date and reason):

```json
{
  "schemaVersion": 1,
  "holds": [
    {
      "artifactId": 123456789,
      "expiresAt": "2026-11-05T18:00:00Z",
      "reason": "Investigate the Intel packaged-launch failure"
    }
  ]
}
```

IDs must be positive safe integers and unique. Expiry must be a real UTC ISO
timestamp; a reason is required. Expired holds cease protection automatically.
Missing/malformed holds or unavailable API state stop cleanup without treating
the uncertainty as permission. Holds must reach main **before deletion**; they
cannot recover deleted artifacts. Place investigation holds while the producing
run is still active when possible. A hold does not override GitHub's own expiry.

## Preview and execution

The `CI installer retention` workflow runs after Plugin CI completion and daily
at 09:23 UTC. Manual dispatch defaults to preview. Every entry point shares one
non-canceling concurrency group and executes trusted main code; no PR code runs
with its Actions write token. No extra credential or dependency install is needed.

```sh
gh workflow run ci-dmg-retention.yml --ref main -f apply=false
```

From trusted source, local preview uses existing GitHub CLI authentication:

```sh
node ci/dmg-retention.mjs --repo TrentBrown/gatereeve
```

Before the hold file is deployed, preview the proposed file read-only:

```sh
node ci/dmg-retention.mjs --holds-file ci/dmg-retention-holds.json
```

Local holds cannot be combined with `--apply`. The CLI accepts `--apply` only in
the main-branch retention workflow so normal entry points share serialization;
local commands are preview-only. `--output <path>` saves a compact
JSON receipt; it is updated after every deletion and on failure. Hosted receipts
remain for 30 days. Failed API requests stop a sweep; already-deleted IDs are
recorded harmlessly. Retrying re-observes state instead of blindly replaying IDs.

Before each deletion, the helper checks the selected keeper, target identity,
live main holds revision and producing run. New uploads are never added to the
original deletion set. A changed hold file or lost/restarted keeper stops the
sweep; a restarted target is skipped. GitHub has no atomic transaction spanning
run state, Git contents and artifact deletion. These checks narrow the race
window; avoid starting an old partial rerun or changing a hold while a deletion
is already in flight.

## Expiry and retries

Uploads explicitly expire after 90 days (subject to repository/organization
limits). The policy means **at most one unprotected completed installer**, not
one installer preserved forever. During concurrent runs or explicit holds there
can be more; after a quiet period there can be none. The published signed DMG is
separate. Do not re-upload solely to reset an ordinary CI artifact's age.

After an older installer is deleted, a downstream-only rerun cannot download it.
Rerun the complete Plugin CI workflow so the package and its tests run together.
Signed release recovery continues to use its own protected retained packets.
