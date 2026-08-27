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
- the protected GitHub environment `release-publication`.

An individual App Store Connect API key is not a substitute: Apple explicitly
states that individual keys cannot use `notaryTool`. GateReeve also does not
support an Apple Account app-specific password as a second CI authentication
mode.

Primary references:

- [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/)
- [Create a Developer ID certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [Create a certificate signing request](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request)
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
   `GateReeve Developer ID`, leave the CA email blank, and save the CSR to disk.
4. In Apple Developer **Certificates, Identifiers & Profiles**, add a
   certificate, select **Developer ID**, then **Developer ID Application**.
   GateReeve uses a DMG, not an installer package, so it does not require a
   Developer ID Installer certificate.
5. Upload the CSR, download the `.cer`, and open it so Keychain Access joins the
   certificate to the private key created with the CSR.

Confirm the identity appears under **My Certificates** and from Terminal:

```bash
security find-identity -v -p codesigning
```

Its complete name must have this shape:

```text
Developer ID Application: LEGAL NAME (TEAMID1234)
```

Export that identity and its private key from **My Certificates** as a `.p12`.
Use a new high-entropy export password stored in the password manager, not the
Apple Account password.

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

The repository environment is named `release-publication`. It requires Trent
Brown's approval, permits self-review because this personal project has one
human actor, and accepts deployments only from `main`. Candidate jobs run and
pass before a job enters this environment; its secrets are unavailable until
the environment approval is granted.

Set these non-secret environment variables:

```bash
GATEREEVE_APPLE_TEAM_ID=TEAMID1234
GATEREEVE_DEVELOPER_IDENTITY='Developer ID Application: LEGAL NAME (TEAMID1234)'
GATEREEVE_NOTARY_KEY_ID=KEYID12345
GATEREEVE_NOTARY_ISSUER_ID=12345678-1234-1234-1234-1234567890ab

gh variable set GATEREEVE_APPLE_TEAM_ID \
  --repo TrentBrown/gatereeve \
  --env release-publication \
  --body "$GATEREEVE_APPLE_TEAM_ID"
gh variable set GATEREEVE_DEVELOPER_IDENTITY \
  --repo TrentBrown/gatereeve \
  --env release-publication \
  --body "$GATEREEVE_DEVELOPER_IDENTITY"
gh variable set GATEREEVE_NOTARY_KEY_ID \
  --repo TrentBrown/gatereeve \
  --env release-publication \
  --body "$GATEREEVE_NOTARY_KEY_ID"
gh variable set GATEREEVE_NOTARY_ISSUER_ID \
  --repo TrentBrown/gatereeve \
  --env release-publication \
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
      --env release-publication
gh secret set GATEREEVE_DEVELOPER_ID_P12_PASSWORD \
  --repo TrentBrown/gatereeve \
  --env release-publication
openssl base64 -A -in "$NOTARY_KEY_P8" \
  | gh secret set GATEREEVE_NOTARY_KEY_P8_BASE64 \
      --repo TrentBrown/gatereeve \
      --env release-publication
```

The middle command prompts securely for the `.p12` export password. Confirm
only names and timestamps—never values:

```bash
gh variable list --repo TrentBrown/gatereeve --env release-publication
gh secret list --repo TrentBrown/gatereeve --env release-publication
```

## 6. Run a nonpublishing protected rehearsal

After this workflow code is merged to `main`, choose a fresh RC identity and
dispatch preparation with Apple trust enabled:

```bash
RELEASE_TAG=v0.1.0-rc.1

gh workflow run coordinated-release-prepare.yml \
  --repo TrentBrown/gatereeve \
  -f tag="$RELEASE_TAG" \
  -f source_ref=main \
  -f apple_trust=true
```

The unprotected jobs first build and natively verify the development candidate.
The signing job then waits at `release-publication`. Review the source commit
and candidate job results before approving environment access. Approval grants
secret access for that run; it does **not** approve publication.

The protected job creates an ephemeral keychain, imports the `.p12`, builds the
same version from the pinned source, Developer ID-signs the app and DMG with
hardened runtime and secure timestamps, notarizes the DMG with `notarytool`,
staples the ticket, runs Gatekeeper assessment, uploads only the trusted
candidate and non-secret evidence, then deletes the keychain and credential
files. ARM and Intel jobs independently inspect and run the exact trusted DMG.

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

`release-record.json` must report `developer-id-notarized`, the expected legal
identity and Team ID, hardened runtime, secure timestamp, an accepted
notarization ID, validated staple, accepted Gatekeeper assessment, identical
ARM/Intel evidence, and the exact DMG SHA-256. The workflow has only
`contents: read`; it cannot create a tag, release, marketplace update, manifest,
website change, or Cask.

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
