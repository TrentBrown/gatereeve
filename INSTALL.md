# Install the Agentic Development Workflow

This guide installs the private Agentic Software Development Workflow through
the native Codex or Claude Code plugin manager. You may install it in Codex,
Claude Code, or both.

The supported operating systems are macOS and Ubuntu 22.04 or 24.04. Windows
users should currently run the workflow inside Ubuntu on WSL; native Windows
installation has not yet been validated.

The workflow plugin requires Node.js 22.12 or newer for its packaged governance
core. It does not require npm, a checkout of this repository, the optional
`gatereeve` CLI, personal instruction-file edits, or skill symlinks. Each agent
you choose must already be installed and authenticated.

## 1. Pause or resume the workflow at any time

Installing the workflow does not commit you to using it in every session. You
can disable it without uninstalling it, then re-enable it later without
repeating setup. Your workflow profile and branch-prefix settings remain in
place while the plugin is disabled.

### Claude Code

Use Claude Code's native plugin controls:

```bash
claude plugin disable agentic-development-workflow@quality-code --scope user
claude plugin enable agentic-development-workflow@quality-code --scope user
```

The same controls are available through `/plugin` in Claude Code. After
changing the state, start a fresh session. See
[Manage installed plugins](https://code.claude.com/docs/en/discover-plugins#manage-installed-plugins).

### Codex

Open the Plugins Directory in the Codex desktop application, find
**Agentic Development Workflow** under installed plugins, and use its on/off
control. Start a fresh session after changing the state.

The current Codex CLI does not expose plugin enable and disable commands. Use
the supported application control rather than editing `~/.codex/config.toml`
or the plugin cache by hand. See
[Build plugins](https://learn.chatgpt.com/docs/build-plugins).

## 2. Choose your platform and agent

Complete one operating-system path:

- **macOS:** use the Homebrew commands below.
- **Ubuntu 22.04 or 24.04:** use the `apt` commands below.
- **Windows:** install Ubuntu with WSL, open an Ubuntu shell, and follow the
  Ubuntu path. Native PowerShell installation is not yet supported by this
  guide.

Then complete one or both agent paths:

- **Codex:** sections 5A and 6 apply.
- **Claude Code:** section 5B applies.
- **Both:** complete both agent paths and verify each installation separately.

## 3. Install and verify shared prerequisites

Installing and running the workflow requires Git, Python 3.10 or newer, and
Node.js 22.12 or newer. The complete PR-boundary workflow also uses GitHub CLI
and requires it to be authenticated for the product repositories where the
workflow operates. Install a supported Node release with the version manager
or package source normally used on the machine before continuing.

The ZIP installation itself does not use GitHub and does not require access to
the plugin source repository. Current `workflow-doctor` readiness includes the
GitHub CLI and authentication checks because they are required later by the
full workflow.

### macOS

Install [Homebrew](https://brew.sh/) first if it is not already available,
then run:

```bash
brew update
brew install git python gh
```

### Ubuntu or Ubuntu on WSL

```bash
sudo apt update
sudo apt install -y git python3 curl gh unzip
```

### Verify the shared commands

```bash
python3 -c 'import sys; assert sys.version_info >= (3, 10), sys.version'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)'
git --version
gh --version
```

Verify only the agents you intend to use:

```bash
# Codex users
codex --version
codex login status

# Claude Code users
claude --version
claude auth status
```

If a selected agent command is missing, install and authenticate it using the
provider's current instructions:

- [Codex CLI getting started](https://help.openai.com/en/articles/11096431)
- [Claude Code installation](https://code.claude.com/docs/en/installation)

Run `codex login` or start `claude` and follow its login flow if the selected
authentication check reports that authentication is missing.

## 4. Easy install from a ZIP (recommended)

Use the versioned ZIP supplied by the workflow maintainer. It contains the
complete local marketplace for both Codex and Claude Code. This path does not
clone or access the plugin source repository.

Unpacking the ZIP does **not** install the plugin. It only creates a local
marketplace directory that must be registered with each selected agent in
section 5. The native plugin manager then installs the plugin from that
marketplace.

When a `.sha256` sidecar is supplied, verify it before unpacking. Run the
command for your operating system from the directory containing both files:

```bash
# macOS
shasum -a 256 -c quality-code-agentic-development-workflow-<VERSION>.zip.sha256

# Ubuntu
sha256sum -c quality-code-agentic-development-workflow-<VERSION>.zip.sha256
```

Unpack the marketplace into a stable user-level location:

```bash
mkdir -p ~/.local/share/quality-code
unzip quality-code-agentic-development-workflow-<VERSION>.zip \
  -d ~/.local/share/quality-code
cd ~/.local/share/quality-code/quality-code-agentic-development-workflow-<VERSION>
MARKETPLACE_ROOT="$PWD"
```

Claude Code and Codex do not require this exact
`~/.local/share/quality-code` path. It is the recommended convention because a
registered local marketplace should live somewhere persistent rather than in a
temporary `Downloads` directory. Any accessible directory works if
`MARKETPLACE_ROOT` names the unpacked versioned directory containing
`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.

Choose the final location before registering it, then keep the unpacked
directory at that path. Moving or deleting it later can prevent marketplace
updates or reinstallation. If the ZIP is already unpacked elsewhere, either
move it to its permanent location first or set `MARKETPLACE_ROOT` to its actual
absolute path.

The archive contains this `INSTALL.md` and the operational `USER-GUIDE.md` at
its top level. Continue with section 5 to perform the separate marketplace
registration and plugin installation steps.

### Alternative: private Git-backed marketplace

The managed Git-backed path remains available to users with read access to
`TrentBrown/agentic-development-workflow`. Authenticate GitHub CLI and confirm
the repository can be fetched:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
gh repo view TrentBrown/agentic-development-workflow
git ls-remote https://github.com/TrentBrown/agentic-development-workflow.git main
```

Use the Git-backed commands in section 5 instead of setting
`MARKETPLACE_ROOT`.

## 5. Install the plugin in each selected agent

Complete section 5A, section 5B, or both.

### 5A. Codex

For the recommended unpacked ZIP, register its local marketplace:

```bash
codex plugin marketplace add "$MARKETPLACE_ROOT"
```

Alternatively, register the private Git-backed marketplace:

```bash
codex plugin marketplace add \
  TrentBrown/agentic-development-workflow \
  --ref marketplace
```

Then install and verify the plugin:

```bash
codex plugin add agentic-development-workflow@quality-code
codex plugin list --marketplace quality-code
```

The list must show `agentic-development-workflow` installed and enabled from
the `quality-code` marketplace.

### 5B. Claude Code

For the recommended unpacked ZIP, register its local marketplace at user scope:

```bash
claude plugin marketplace add "$MARKETPLACE_ROOT" --scope user
```

Alternatively, register the private Git-backed marketplace:

```bash
claude plugin marketplace add \
  TrentBrown/agentic-development-workflow@marketplace \
  --scope user
```

Then install and verify the plugin:

```bash
claude plugin install \
  agentic-development-workflow@quality-code \
  --scope user
claude plugin list
```

The list must show `agentic-development-workflow@quality-code` installed,
enabled, and scoped to the user.

## 6. Trust the Codex activation hook

Skip this section if you installed only Claude Code.

The plugin uses a small `SessionStart` hook to tell fresh sessions that
non-trivial software work must load the workflow. Codex requires explicit
review of non-managed hooks.

1. Start a new interactive Codex session.
2. Run `/hooks`.
3. Find the `SessionStart` hook supplied by
   `agentic-development-workflow@quality-code`.
4. Review and trust its current hash.
5. Exit that session.

Claude Code does not require a corresponding per-hook trust step.

## 7. Configure the workflow once

Choose a personal Git branch prefix before setup. It must identify the
developer rather than copying another person's value; for example, a developer
named Alex Smith might choose `as-`.

Start any agent in which you installed the plugin and submit:

> Use workflow-setup to configure the `quality-code` profile and my branch
> prefix `<YOUR_PREFIX>` globally.

The skill must report the global scope, `quality-code` profile, and the prefix
you supplied. The settings are shared across installed agents through
namespaced Git configuration.

Verify them directly if needed:

```bash
git config --global --get agentic-workflow.profile
git config --global --get agentic-workflow.branchprefix
```

Start a fresh session in every installed agent after setup.

## 8. Run doctor in each installed agent

In a fresh Codex session, if installed, submit:

> Run workflow-doctor for this installed plugin. Preserve its real exit status
> and report every check.

Submit the same request in a separate fresh Claude Code session if you
installed Claude Code.

Each installed agent must report ready. In particular, doctor verifies:

- Python 3.10 or newer, Git, GitHub CLI, and the current agent;
- authenticated GitHub access;
- all workflow skills and their package hashes;
- the native `SessionStart` hook and observed activation policy;
- the `quality-code` profile and personal branch prefix; and
- no duplicate legacy workflow skills.

An installed-manager status alone is not a successful installation. Stop and
follow every doctor remediation before continuing.

This completes the normal installation. Maintainers and rollout coordinators
who need to prove autonomous workflow activation can run the optional
[behavioral plugin smoke test](docs/PLUGIN-SMOKE-TEST.md).

Next, follow the [first-feature walkthrough in `USER-GUIDE.md`](USER-GUIDE.md#your-first-feature).
The user guide explains the normal human-agent interaction, workflow artifacts,
sequential PR delivery, common operations, and troubleshooting after a
successful installation.

## 9. Upgrade

Record the current generated marketplace commit before an upgrade so it can be
used for rollback if needed:

```bash
git ls-remote \
  https://github.com/TrentBrown/agentic-development-workflow.git \
  refs/heads/marketplace
```

Run only the commands for the agents you installed.

### Codex

Upgrade the marketplace snapshot, refresh the installed package, then restart
Codex and review `/hooks` if its hook hash changed:

```bash
codex plugin marketplace upgrade quality-code
codex plugin add agentic-development-workflow@quality-code
```

### Claude Code

Update Claude Code and restart it or run `/reload-plugins`:

```bash
claude plugin marketplace update quality-code
claude plugin update \
  agentic-development-workflow@quality-code \
  --scope user
```

Run `workflow-doctor` again in a fresh session in every upgraded agent.

## 10. Roll back an upgrade

Use this only with a known-good marketplace commit supplied or approved by the
maintainer. Replace `<MARKETPLACE_COMMIT>` in every command with that commit.

### Codex

```bash
codex plugin remove agentic-development-workflow@quality-code
codex plugin marketplace remove quality-code
codex plugin marketplace add \
  TrentBrown/agentic-development-workflow \
  --ref <MARKETPLACE_COMMIT>
codex plugin add agentic-development-workflow@quality-code
```

### Claude Code

```bash
claude plugin uninstall \
  agentic-development-workflow@quality-code \
  --scope user
claude plugin marketplace remove quality-code --scope user
claude plugin marketplace add \
  TrentBrown/agentic-development-workflow@<MARKETPLACE_COMMIT> \
  --scope user
claude plugin install \
  agentic-development-workflow@quality-code \
  --scope user
```

Start fresh sessions and repeat doctor in every rolled-back agent.

## 11. Uninstall

Run only the commands for agents in which the plugin is installed. Remove the
plugin before removing its marketplace.

### Codex

```bash
codex plugin remove agentic-development-workflow@quality-code
codex plugin marketplace remove quality-code
```

### Claude Code

```bash
claude plugin uninstall \
  agentic-development-workflow@quality-code \
  --scope user
claude plugin marketplace remove quality-code --scope user
```

The namespaced workflow settings may be retained for a later reinstall. To
remove them as well:

```bash
git config --global --unset-all agentic-workflow.profile || true
git config --global --unset-all agentic-workflow.branchprefix || true
```

The plugin manager owns installed package files. Do not manually delete plugin
caches, create skill symlinks, or copy skills into personal agent directories.

## Troubleshooting

- **Private marketplace fetch fails:** rerun `gh auth status`,
  `gh auth setup-git`, `gh repo view TrentBrown/agentic-development-workflow`,
  and the `git ls-remote` check from section 4.
- **Codex doctor reports activation missing:** start a fresh session, run
  `/hooks`, and trust the workflow's current `SessionStart` hook.
- **Profile or branch prefix is missing:** rerun `workflow-setup`; do not copy
  another developer's branch prefix.
- **Doctor reports duplicate legacy skills:** do not delete them manually.
  Stop and ask the workflow maintainer to inspect the paths.
- **One installed agent succeeds and another fails:** preserve the plugin list
  and doctor report from each agent. Diagnose each installation independently.
- **You need to work without the workflow temporarily:** use the native
  controls in section 1; uninstallation is not necessary.
