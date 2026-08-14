# Dependency Vulnerability Packets

Use this reference for packets whose IDs start with `D-`.

## Inspect

Read:

- `package.json`
- lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or Maven file)
- `.snyk` when present
- the packet's example dependency paths

For npm projects, use deterministic graph commands when useful:

```sh
npm ls <package>
npm explain <package>
npm view <package> version dependencies --json
```

Use live registry data before recommending current versions.

## Classification

Prefer this order:

1. Direct dependency upgrade when the vulnerable package is direct and a safe
   compatible version exists.
2. Parent dependency upgrade when the vulnerable package is transitive and a
   parent can move to a fixed version.
3. npm `overrides` when the parent range already permits or is likely
   compatible with a fixed transitive version and a parent upgrade is larger.
4. Framework or major migration when the vulnerable package is tied to a major
   framework version.
5. `.snyk ignore` only for accepted risk, false positive, unreachable path, or
   deferred migration.

Avoid adding a direct dependency solely to influence a transitive package unless
the package manager's resolution behavior makes that reliable and verified.

## Editing

For npm:

- Prefer `npm install --package-lock-only --ignore-scripts` when only the
  manifest/lockfile needs updating.
- Prefer exact overrides for narrow remediations unless the repo convention
  favors ranges.
- Keep unrelated lockfile churn out of scope.

For Maven:

- Prefer dependency management or parent upgrades over broad exclusions.
- Verify with the project's normal Maven test or dependency tree command.

## Verification

After editing:

1. Run the package manager graph command and confirm the resolved version.
2. Run `deps build` with the same `--target`.
3. Run `deps explain` with the same `--target`.
4. Confirm the packet disappeared or explain why residual packets remain.

## Ignore Text

If `.snyk ignore` is necessary, include:

- Snyk vulnerability ID
- affected package and path
- why direct remediation is not currently practical
- why exploitability is accepted or mitigated
- expiry or revisit condition
