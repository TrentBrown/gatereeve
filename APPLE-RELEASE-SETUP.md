# Apple release trust setup

This is the one-time and recovery runbook for GateReeve's direct macOS
distribution identity. It is intentionally separate from routine release
publication. Complete it as the Apple Account holder; do not give an agent an
Apple Account password, two-factor code, certificate private key, or unencrypted
notarization key.

GateReeve uses:

- an **individual** Apple Developer Program membership in the account holder's
  legal name;
- one **Developer ID Application** certificate exported with its private key as
  a password-protected `.p12`;
- one App Store Connect **team API key** for `notarytool`; and
- the protected GitHub environment `release-trust`.

An individual App Store Connect API key is not a substitute: Apple explicitly
states that individual keys cannot use `notaryTool`. GateReeve also does not
support an Apple Account app-specific password as a second CI authentication
mode.

Primary references:

- [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/)
- [Create a Developer ID certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [Create a certificate signing request](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request)
- [Developer ID intermediate certificate](https://developer.apple.com/support/developer-id-intermediate-certificate/)
- [App Store Connect API team keys](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api)
- [Apple notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## 1. Enroll as an individual

Use an Apple Account whose first and last name are the account holder's legal
name and whose two-factor authentication is enabled. Apple currently charges
US $99 per membership year, subject to regional pricing and change. Select
individual enrollment—not organization enrollment—and complete Apple's legal,
identity, agreement, payment, and approval steps.

Apple's public-facing Developer ID signature will identify the individual
account holder. GateReeve, Quality Code, or another trade name is not the legal
enrolled entity. Do not proceed until the membership page shows the program as
active and all current agreements are accepted.

## 2. Create the Developer ID Application identity

On the Mac that will hold the offline recovery identity:

1. Open Keychain Access.
2. Choose **Certificate Assistant → Request a Certificate from a Certificate
   Authority**.
3. Enter the Apple Account email, use a recognizable common name such as
   `QualityCode Application`, leave the CA email blank, select **Saved to
   disk**, and save the CSR. The common name labels the private key on this Mac;
   it does not change the legal name Apple places in the certificate.
4. Create a fresh CSR for every certificate request. Apple rejects a CSR that
   has already generated another certificate, and a fresh CSR also gives the
   new identity its own private key.
5. In Apple Developer **Certificates, Identifiers & Profiles**, add a
   certificate and select **Developer ID Application** from the **Software**
   list. When Apple asks for a profile type, select **G2 Sub-CA**. The
   **Previous Sub-CA** option is only for legacy tooling through Xcode 11.4.1.
   GateReeve uses a DMG, not an installer package, so it does not require a
   Developer ID Installer certificate.
6. Upload the fresh CSR and download the `.cer`.
7. Import the `.cer` into the same **login** keychain that contains the CSR's
   private key. If opening the file puts it in the System keychain, use
   **File → Import Items** in Keychain Access and select **login** as the
   destination instead.

Confirm the identity appears under **login → My Certificates** and expands
to reveal its private key. Then verify it from Terminal:

```bash
security find-identity -v -p codesigning \
  ~/Library/Keychains/login.keychain-db
```

Its complete name must have this shape:

```text
Developer ID Application: LEGAL NAME (TEAMID1234)
```

If Keychain Access reports that the leaf certificate is not trusted or the
command finds no valid identity, install Apple's current
[Developer ID G2 intermediate certificate](https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer)
in the **System** keychain, leave its trust setting at **System Defaults**, and
run the check again. Do not set the Developer ID leaf certificate to **Always Trust**;
repair the missing certificate chain instead.

Export the expanded **Developer ID Application** identity and its private key
from **My Certificates** as a `.p12`. Do not accidentally export a Developer ID
Installer identity. Use a new high-entropy export password stored in the
password manager, not the Apple Account password.

## 3. Create a notarization team API key

In App Store Connect, open **Users and Access → Integrations**. If API access
has not been enabled, the Account Holder must request it and wait for Apple to
approve the request. Under **Team Keys**, generate a key named
`GateReeve Notarization` with the least role that retains notarization access
(`Developer` for the individual Account Holder account).

Record the Issuer ID and Key ID. Download the `.p8` immediately; Apple permits
the private half to be downloaded only once. Do not generate an individual API
key from the user profile—Apple documents that those keys cannot authenticate
`notarytool`.

On a current Mac with Xcode command-line tools, verify the team key without
submitting software:

```bash
APPLE_NOTARY_KEY_PATH=/absolute/path/to/AuthKey_KEYID12345.p8
APPLE_NOTARY_KEY_ID=KEYID12345
APPLE_NOTARY_ISSUER_ID=12345678-1234-1234-1234-1234567890ab

xcrun notarytool history \
  --key "$APPLE_NOTARY_KEY_PATH" \
  --key-id "$APPLE_NOTARY_KEY_ID" \
  --issuer "$APPLE_NOTARY_ISSUER_ID"
```

An empty history is valid; an authentication failure is not.

## 4. Preserve encrypted recovery material

Retain an offline recovery packet under the account holder's control:

- the password-protected Developer ID `.p12`;
- the `.p12` export password in a separate password-manager item;
- the one-time-download notarization `.p8`;
- Key ID, Issuer ID, Team ID, full signing identity, creation date, and
  certificate expiration date; and
- these revocation and restoration instructions.

Store the files in a password-manager document vault or an encrypted offline
volume with a tested recovery path. A password-protected `.p12` alone does not
encrypt the `.p8`; the surrounding storage must protect both. Do not keep an
unencrypted second copy in Downloads, iCloud Drive, a repository, CI artifact,
or chat transcript.

If the certificate private key or `.p8` may be exposed, stop releases, revoke
the affected Apple credential, remove its GitHub secret, create a replacement,
and run the protected nonpublishing rehearsal again. Revocation does not permit
rewriting already published GateReeve history.

## 5. Configure the protected GitHub environment

The Apple credential environment is named `release-trust`. It requires Trent
Brown's approval, permits self-review because this personal project has one
human actor, and accepts deployments only from `main`. Candidate jobs run and
pass before a job enters this environment; its secrets are unavailable until
the environment approval is granted. Approval grants the workflow temporary
access to credentials already stored in GitHub; it does not require the
maintainer to provide the `.p12`, password, or `.p8` again for each release.

Keep `release-publication` separate. It contains only public-distribution
authority and must not contain any Apple private credential material. Its
protected reviewer and `main` policy may match `release-trust`, but approval of
one environment never grants authority in the other.

Set these non-secret environment variables:

```bash
GATEREEVE_APPLE_TEAM_ID=TEAMID1234
GATEREEVE_DEVELOPER_IDENTITY='Developer ID Application: LEGAL NAME (TEAMID1234)'
GATEREEVE_NOTARY_KEY_ID=KEYID12345
GATEREEVE_NOTARY_ISSUER_ID=12345678-1234-1234-1234-1234567890ab

gh variable set GATEREEVE_APPLE_TEAM_ID \
  --repo TrentBrown/gatereeve \
  --env release-trust \
  --body "$GATEREEVE_APPLE_TEAM_ID"
gh variable set GATEREEVE_DEVELOPER_IDENTITY \
  --repo TrentBrown/gatereeve \
  --env release-trust \
  --body "$GATEREEVE_DEVELOPER_IDENTITY"
gh variable set GATEREEVE_NOTARY_KEY_ID \
  --repo TrentBrown/gatereeve \
  --env release-trust \
  --body "$GATEREEVE_NOTARY_KEY_ID"
gh variable set GATEREEVE_NOTARY_ISSUER_ID \
  --repo TrentBrown/gatereeve \
  --env release-trust \
  --body "$GATEREEVE_NOTARY_ISSUER_ID"
```

Set exactly three environment secrets. Each command reads sensitive material
from standard input; it does not put a secret value in shell history:

```bash
DEVELOPER_ID_P12=/absolute/path/to/GateReeve-Developer-ID.p12
NOTARY_KEY_P8=/absolute/path/to/AuthKey_KEYID12345.p8

openssl base64 -A -in "$DEVELOPER_ID_P12" \
  | gh secret set GATEREEVE_DEVELOPER_ID_P12_BASE64 \
      --repo TrentBrown/gatereeve \
      --env release-trust
gh secret set GATEREEVE_DEVELOPER_ID_P12_PASSWORD \
  --repo TrentBrown/gatereeve \
  --env release-trust
openssl base64 -A -in "$NOTARY_KEY_P8" \
  | gh secret set GATEREEVE_NOTARY_KEY_P8_BASE64 \
      --repo TrentBrown/gatereeve \
      --env release-trust
```

The middle command prompts securely for the `.p12` export password. Confirm
only names and timestamps—never values:

```bash
gh variable list --repo TrentBrown/gatereeve --env release-trust
gh secret list --repo TrentBrown/gatereeve --env release-trust
```

Configure `release-publication` with no Apple identity variables and exactly
one secret, `GATEREEVE_PUBLICATION_TOKEN`, when the linked Cask publisher needs
cross-repository write access to `TrentBrown/homebrew-gatereeve`. Use a
fine-grained token limited to the GateReeve tap's contents and pull requests;
do not grant Apple, package-build, organization-administration, or unrelated
repository access. The primary publisher uses its scoped workflow token. The
protected primary and Cask rehearsals receive neither the publication token nor
any Apple secret.

Set the publication token once through a secure prompt. It remains stored in
the GitHub environment and is not re-entered for each release:

```bash
gh secret set GATEREEVE_PUBLICATION_TOKEN \
  --repo TrentBrown/gatereeve \
  --env release-publication
```

Audit names and protection metadata only:

```bash
gh variable list --repo TrentBrown/gatereeve --env release-publication
gh secret list --repo TrentBrown/gatereeve --env release-publication
gh api repos/TrentBrown/gatereeve/environments/release-trust
gh api repos/TrentBrown/gatereeve/environments/release-publication
```

The intended name-only inventory is:

| Environment | Variables | Secrets |
|---|---|---|
| `release-trust` | `GATEREEVE_APPLE_TEAM_ID`, `GATEREEVE_DEVELOPER_IDENTITY`, `GATEREEVE_NOTARY_KEY_ID`, `GATEREEVE_NOTARY_ISSUER_ID` | `GATEREEVE_DEVELOPER_ID_P12_BASE64`, `GATEREEVE_DEVELOPER_ID_P12_PASSWORD`, `GATEREEVE_NOTARY_KEY_P8_BASE64` |
| `release-publication` | none required | `GATEREEVE_PUBLICATION_TOKEN` |

For migration from the historical combined environment, first populate and
validate `release-trust`, complete a protected nonpublishing trust run, and
confirm all retained evidence. Only then remove the three Apple secrets and
four Apple variables from `release-publication`. Never copy their values to
Playpen, a local handoff, logs, or artifacts. If the trust validation fails,
leave the old environment untouched, correct `release-trust`, and repeat with
a fresh RC if Apple-bound bytes or request history already exists.

## 6. Run a nonpublishing protected rehearsal

After this workflow code is merged to `main`, choose a fresh RC identity and
dispatch preparation from `main`:

```bash
RELEASE_TAG=v0.1.0-rc.1

gh workflow run coordinated-release-prepare.yml \
  --repo TrentBrown/gatereeve \
  --ref main \
  -f tag="$RELEASE_TAG"
```

The workflow binds the dispatch SHA to the exact current `origin/main`; it fails
if `main` advances before source resolution. The signing job waits at
`release-trust`. Review the source commit and Plugin candidate result before
approving environment access. Approval grants secret access for that run; it
does **not** approve publication.

The protected job creates an ephemeral keychain, imports the `.p12`, builds the
same version from the pinned source, Developer ID-signs the app and DMG with
hardened runtime and secure timestamps, notarizes the DMG with `notarytool`,
staples a separate final copy, runs Gatekeeper assessment, uploads the retained
submitted bytes, final trusted candidate, durable attempt history, and
non-secret evidence, then deletes the keychain and credential files. ARM and
Intel jobs independently inspect and run the exact final trusted DMG. All trust
artifacts are retained for at least 30 days.

Download and inspect the final artifact:

```bash
gh run list \
  --repo TrentBrown/gatereeve \
  --workflow coordinated-release-prepare.yml \
  --limit 5
gh run download RUN_ID \
  --repo TrentBrown/gatereeve \
  --name "gatereeve-$RELEASE_TAG-coordinated-release"
```

`release-record.json` must use schema v2 and end at
`desktop-trust-verified`. Its ordered evidence must bind the expected legal
identity and Team ID, hardened runtime, secure timestamp, accepted request,
validated staple, accepted Gatekeeper assessments, exactly one ARM and Intel
document, and the final DMG SHA-256. The workflow has only
`contents: read`; it cannot create a tag, release, marketplace update, manifest,
website change, or Cask.

Finalization and the hosted publication dry run are the remaining
nonpublishing acceptance steps. Finalization has read-only repository access
and no protected environment. The dry-run job enters `release-publication` but
has read-only permissions and receives no publication secret. Capture public
state before and after the dry run and prove that the tag, GitHub release,
marketplace head, manifest, website response, and Cask did not change. See
`RELEASING.md` for exact dispatch inputs.

Do not use GitHub's generic **Re-run jobs** after protected production begins.
For a timeout or recoverable interruption, dispatch the bounded recovery
workflow with the original preparation run and the latest run that retained the
trust bundle:

```bash
PREPARATION_RUN_ID=<ORIGINAL_RUN_ID>
TRUST_ARTIFACT_RUN_ID=<LATEST_TRUST_OR_RECOVERY_RUN_ID>
SOURCE_COMMIT=<EXACT_PREPARATION_SHA>

gh workflow run coordinated-release-trust-recover.yml \
  --repo TrentBrown/gatereeve \
  --ref main \
  -f preparation_run_id="$PREPARATION_RUN_ID" \
  -f trust_artifact_run_id="$TRUST_ARTIFACT_RUN_ID" \
  -f tag="$RELEASE_TAG" \
  -f source_commit="$SOURCE_COMMIT"
```

Recovery never rebuilds or re-signs. It polls the recorded Apple request. If
submission was interrupted before the request ID was persisted, it queries
Apple history and continues only when exactly one candidate request matches;
absence or ambiguity remains fail-closed and authorizes no resubmission.

## 7. Rotation and recovery

At least quarterly and before a public release, inspect credential names,
certificate expiration, Apple agreements, environment reviewers, branch policy,
and recent environment deployments. Rotate immediately after suspected
exposure. A normal planned rotation creates and validates the new credential,
updates GitHub, runs a nonpublishing rehearsal, and only then revokes the old
credential.

To restore CI, import the recovery `.p12` into a temporary local keychain and
re-upload it with its original export password; restore the `.p8` only if its
key remains active in App Store Connect. If the `.p8` was lost, revoke it and
generate a new team key because Apple will not provide another download.
