# User-Mac Homebrew Upgrade Evidence

- **Reported by:** Trent Brown in the active conversation
- **Reported at:** `2026-08-29T17:28:28Z`
- **Host context:** macOS, Apple Silicon Homebrew under `/opt/homebrew`
- **Starting Cask:** `gatereeve 0.1.0-rc.1`
- **Target Cask:** `TrentBrown/gatereeve/gatereeve 0.1.0-rc.2`

## Upgrade

The user ran:

```bash
brew upgrade --cask --greedy TrentBrown/gatereeve/gatereeve
```

Homebrew identified the requested transition as
`trentbrown/gatereeve/gatereeve 0.1.0-rc.1 -> 0.1.0-rc.2`, downloaded the
246.1 MB rc.2 Cask payload, backed up and replaced `GateReeve.app`, purged the
rc.1 Cask files, and reported `gatereeve was successfully upgraded`.

The post-upgrade inventory reported:

```text
gatereeve 0.1.0-rc.2
```

## Apple trust

The user then ran strict deep code-signing verification and Gatekeeper
assessment against `/Applications/GateReeve.app`. Every prepared helper and
framework validated, and the final results were:

```text
/Applications/GateReeve.app: valid on disk
/Applications/GateReeve.app: satisfies its Designated Requirement
/Applications/GateReeve.app: accepted
source=Notarized Developer ID
```

## Remaining manual verification

Application launch and the installed AC1-AC7 behavior checklist remain. This
evidence advances but does not complete R8.
