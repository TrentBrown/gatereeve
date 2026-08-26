#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

export PYTHONDONTWRITEBYTECODE=1
export PYTHONPATH="$repository_root/plugin-src/shared/resources/scripts${PYTHONPATH:+:$PYTHONPATH}"
export GIT_CONFIG_GLOBAL="$(mktemp)"
git config --global user.name "Workflow Acceptance"
git config --global user.email "workflow-acceptance@example.invalid"

npm test --prefix cli
npm audit --prefix cli --audit-level=high

python3 -m unittest discover \
  -s plugin-src/shared/resources/scripts/pattern/tests \
  -p 'test_*.py'
python3 -m unittest discover \
  -s plugin-src/shared/resources/scripts/tests \
  -p 'test_*.py'
python3 -m unittest discover \
  -s plugin-src/shared/resources/templates/plugin-smoke \
  -p 'test_*.py'

node cli/bin/workflow.js plugin validate --json
node cli/bin/workflow.js plugin validate-native --json
node cli/bin/workflow.js plugin lint --json
node cli/bin/workflow.js plugin build \
  --source-commit portable-acceptance \
  --json

cmp \
  dist/codex/.workflow-build/shared-files.json \
  dist/claude/.workflow-build/shared-files.json

if find dist -type l -print -quit | grep -q .; then
  echo "Generated packages must not contain symbolic links" >&2
  exit 1
fi

first_build="$(mktemp -d)"
cp -R dist/. "$first_build/"
node cli/bin/workflow.js plugin build \
  --source-commit portable-acceptance \
  --json >/dev/null
diff -ru "$first_build" dist

stub_bin="$(mktemp -d)"
for executable in gh codex claude; do
  printf '#!/usr/bin/env sh\nexit 0\n' >"$stub_bin/$executable"
  chmod 755 "$stub_bin/$executable"
done

for platform in codex claude; do
  package_root="$(mktemp -d)/workflow package $platform"
  cp -R "dist/$platform/." "$package_root/"
  isolated_home="$(mktemp -d)"
  git_config="$(mktemp)"
  platform_home="$(mktemp -d)"
  environment_name="CODEX_HOME"
  if [[ "$platform" == "claude" ]]; then
    environment_name="CLAUDE_CONFIG_DIR"
  fi

  env \
    "PATH=$stub_bin:$PATH" \
    "GIT_CONFIG_GLOBAL=$git_config" \
    "$environment_name=$platform_home" \
    python3 "$package_root/resources/scripts/workflow_setup.py" \
      --plugin-root "$package_root" \
      --profile quality-code \
      --branch-prefix smoke- \
      --json

  env \
    "PATH=$stub_bin:$PATH" \
    "GIT_CONFIG_GLOBAL=$git_config" \
    "$environment_name=$platform_home" \
    python3 "$package_root/resources/scripts/workflow_doctor.py" \
      --plugin-root "$package_root" \
      --home "$isolated_home" \
      --activation-observed \
      --json
done

for feature in workflow-state-machine-cli; do
  feature_home="docs/issues/$feature"
  python3 plugin-src/shared/resources/scripts/lint_spec.py "$feature_home"
  python3 plugin-src/shared/resources/scripts/lint_issues.py "$feature_home"
  python3 plugin-src/shared/resources/scripts/lint_tracker.py "$feature_home"
  python3 plugin-src/shared/resources/scripts/gate_triage.py "$feature_home"
  python3 plugin-src/shared/resources/scripts/validate_branch_docs.py "$feature_home"
done

echo "Portable acceptance passed on $(uname -s) $(uname -m) with $(python3 --version) and Node $(node --version)"
