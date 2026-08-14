#!/usr/bin/env python3
"""Diagnose installed workflow plugin readiness without changing user state."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable, Mapping, Sequence

from workflow_common import (
    WorkflowConfigurationError,
    default_plugin_root,
    load_json,
    profile_paths,
    read_configuration,
    validate_branch_prefix,
)


PLUGIN_ID = "agentic-development-workflow"
MINIMUM_PYTHON = (3, 10)
REQUIRED_SKILLS = (
    "checkpoint",
    "explain-diff",
    "grill-me",
    "handoff",
    "pattern-audit",
    "pattern-extract",
    "pattern-harvest",
    "pattern-help",
    "pattern-init",
    "pattern-learn",
    "pattern-promote",
    "pattern-review",
    "pattern-status",
    "software-development-workflow",
    "workflow-branch-bootstrap",
    "workflow-commit",
    "workflow-decision-record",
    "workflow-decision-triage",
    "workflow-design",
    "workflow-doctor",
    "workflow-judge",
    "workflow-pr-boundary",
    "workflow-pr-review",
    "workflow-setup",
    "workflow-spec-draft",
    "workflow-spec-evaluate",
    "workflow-spec-validate",
)
OPTIONAL_INTEGRATIONS = (
    "playwright",
    "cloudflare",
    "graphify",
    "security-best-practices",
    "remediate-vuln",
)
LEGACY_SKILL_ROOTS = (
    ".agents/skills",
    ".codex/skills",
    ".claude/skills",
)


def check(
    identifier: str,
    status: str,
    message: str,
    remedy: str | None = None,
) -> dict[str, str]:
    result = {"id": identifier, "status": status, "message": message}
    if remedy:
        result["remedy"] = remedy
    return result


def detect_platform(plugin_root: Path) -> str:
    candidates = []
    if (plugin_root / ".codex-plugin" / "plugin.json").is_file():
        candidates.append("codex")
    if (plugin_root / ".claude-plugin" / "plugin.json").is_file():
        candidates.append("claude")
    if len(candidates) != 1:
        raise WorkflowConfigurationError(
            "Plugin root must contain exactly one native platform manifest"
        )
    return candidates[0]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_integrity(
    plugin_root: Path,
) -> tuple[dict[str, object], list[str], list[str]]:
    manifest_path = plugin_root / ".workflow-build" / "shared-files.json"
    payload = load_json(manifest_path)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise WorkflowConfigurationError("Shared-file manifest has an unsupported schema")
    entries = payload.get("files")
    if not isinstance(entries, list) or not entries:
        raise WorkflowConfigurationError("Shared-file manifest contains no files")
    provenance = load_json(plugin_root / ".workflow-build" / "provenance.json")
    if not isinstance(provenance, dict) or provenance.get("schemaVersion") != 1:
        raise WorkflowConfigurationError("Package provenance has an unsupported schema")

    failures = []
    skill_names = []
    for entry in entries:
        if not isinstance(entry, dict):
            failures.append("invalid shared-file entry")
            continue
        relative_path = entry.get("path")
        expected_hash = entry.get("sha256")
        if not isinstance(relative_path, str) or not isinstance(expected_hash, str):
            failures.append("invalid shared-file path or hash")
            continue
        target = (plugin_root / relative_path).resolve()
        try:
            target.relative_to(plugin_root.resolve())
        except ValueError:
            failures.append(f"path escapes plugin root: {relative_path}")
            continue
        if not target.is_file():
            failures.append(f"missing {relative_path}")
            continue
        if _sha256(target) != expected_hash:
            failures.append(f"content changed {relative_path}")
        parts = Path(relative_path).parts
        if len(parts) == 3 and parts[0] == "skills" and parts[2] == "SKILL.md":
            skill_names.append(parts[1])

    return payload, sorted(skill_names), failures


def _default_gh_auth_check(executable: str, environment: Mapping[str, str]) -> bool:
    result = subprocess.run(
        [executable, "auth", "status"],
        capture_output=True,
        text=True,
        env=dict(environment),
    )
    return result.returncode == 0


def _codex_hook_configuration(codex_home: Path) -> tuple[bool, str]:
    config_path = codex_home / "config.toml"
    if not config_path.exists():
        return True, "Codex hooks use the enabled-by-default setting"
    try:
        content = config_path.read_text(encoding="utf-8")
    except OSError as error:
        return False, f"Cannot read Codex configuration: {error}"

    section = ""
    for raw_line in content.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].strip()
            continue
        if "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        boolean = value.lower()
        if section == "features" and key in {"hooks", "codex_hooks"} and boolean == "false":
            return False, "Codex lifecycle hooks are disabled in config.toml"
        if section == "" and key == "allow_managed_hooks_only" and boolean == "true":
            return False, "Codex is configured to ignore non-managed plugin hooks"
    return True, "Codex configuration permits plugin hooks"


def _hook_file_ready(plugin_root: Path) -> tuple[bool, str]:
    try:
        payload = load_json(plugin_root / "hooks" / "hooks.json")
        groups = payload["hooks"]["SessionStart"]
        handlers = groups[0]["hooks"]
    except (WorkflowConfigurationError, KeyError, IndexError, TypeError) as error:
        return False, f"SessionStart hook is unreadable: {error}"
    if len(groups) != 1 or len(handlers) != 1 or handlers[0].get("type") != "command":
        return False, "SessionStart hook must contain exactly one command handler"
    return True, "SessionStart hook is present"


def run_doctor(
    *,
    plugin_root: Path,
    home: Path,
    repository: Path | None,
    activation_observed: bool,
    environment: Mapping[str, str] | None = None,
    executable_lookup: Callable[[str], str | None] = shutil.which,
    gh_auth_check: Callable[[str, Mapping[str, str]], bool] = _default_gh_auth_check,
) -> dict[str, object]:
    plugin_root = plugin_root.resolve()
    home = home.resolve()
    runtime_environment = os.environ.copy()
    if environment:
        runtime_environment.update(environment)
    checks: list[dict[str, str]] = []

    try:
        platform = detect_platform(plugin_root)
        checks.append(check("platform", "pass", f"Detected {platform} package"))
    except WorkflowConfigurationError as error:
        platform = "unknown"
        checks.append(check("platform", "fail", str(error), "Reinstall the native plugin"))

    if sys.version_info[:2] >= MINIMUM_PYTHON:
        checks.append(check("python", "pass", f"Python {sys.version_info.major}.{sys.version_info.minor} is supported"))
    else:
        checks.append(check("python", "fail", "Python 3.10 or newer is required", "Upgrade Python"))

    executables: dict[str, str] = {}
    required_commands = ["git", "python3", "gh"]
    if platform in {"codex", "claude"}:
        required_commands.append(platform)
    for name in required_commands:
        path = executable_lookup(name)
        if path:
            executables[name] = path
            checks.append(check(f"executable-{name}", "pass", f"Found {name}: {path}"))
        else:
            checks.append(check(f"executable-{name}", "fail", f"Required command is missing: {name}", f"Install {name} and ensure it is on PATH"))

    gh_executable = executables.get("gh")
    if gh_executable:
        if gh_auth_check(gh_executable, runtime_environment):
            checks.append(check("github-auth", "pass", "GitHub CLI authentication is ready"))
        else:
            checks.append(check("github-auth", "fail", "GitHub CLI is not authenticated", "Run gh auth login with access to the private workflow repository"))

    try:
        _, skill_names, integrity_failures = package_integrity(plugin_root)
        if integrity_failures:
            checks.append(check("package-integrity", "fail", "; ".join(integrity_failures), "Reinstall the plugin from the marketplace"))
        else:
            checks.append(check("package-integrity", "pass", f"Verified all shared package files and {len(skill_names)} skills"))
        missing_skills = sorted(set(REQUIRED_SKILLS) - set(skill_names))
        unexpected_skills = sorted(set(skill_names) - set(REQUIRED_SKILLS))
        if missing_skills or unexpected_skills:
            details = []
            if missing_skills:
                details.append(f"missing: {', '.join(missing_skills)}")
            if unexpected_skills:
                details.append(f"unexpected: {', '.join(unexpected_skills)}")
            checks.append(check("required-skills", "fail", "Skill inventory mismatch; " + "; ".join(details), "Reinstall the plugin"))
        else:
            checks.append(check("required-skills", "pass", f"All {len(REQUIRED_SKILLS)} workflow skills are present"))
    except WorkflowConfigurationError as error:
        skill_names = []
        checks.append(check("package-integrity", "fail", str(error), "Build or reinstall the native plugin"))

    hook_ready, hook_message = _hook_file_ready(plugin_root)
    checks.append(check("activation-hook", "pass" if hook_ready else "fail", hook_message, None if hook_ready else "Reinstall the plugin"))

    if platform == "codex":
        codex_home = Path(runtime_environment.get("CODEX_HOME", home / ".codex"))
        enabled, message = _codex_hook_configuration(codex_home)
        checks.append(check("codex-hook-feature", "pass" if enabled else "fail", message, None if enabled else "Enable Codex hooks and review /hooks"))

    if activation_observed:
        checks.append(check("activation-observed", "pass", "The current session contains the workflow activation policy"))
    else:
        remedy = "Start a fresh session; in Codex, review and trust the plugin hook with /hooks"
        checks.append(check("activation-observed", "fail", "The current session does not contain the workflow activation policy", remedy))

    git_executable = executables.get("git")
    if git_executable:
        try:
            configuration = read_configuration(
                git_executable=git_executable,
                repository=repository,
                environment=runtime_environment,
            )
        except WorkflowConfigurationError as error:
            configuration = {"profile": None, "branchPrefix": None}
            checks.append(check("configuration-read", "fail", str(error), "Run workflow-setup"))

        profiles = profile_paths(plugin_root)
        profile = configuration.get("profile")
        if profile in profiles and profiles[str(profile)].is_file():
            checks.append(check("profile", "pass", f"Effective profile: {profile}"))
        else:
            available = ", ".join(profiles) or "none"
            checks.append(check("profile", "fail", f"Workflow profile is unset or invalid; available: {available}", "Run workflow-setup"))

        prefix = configuration.get("branchPrefix")
        if isinstance(prefix, str):
            try:
                validate_branch_prefix(prefix, git_executable=git_executable, environment=runtime_environment)
                checks.append(check("branch-prefix", "pass", f"Effective branch prefix: {prefix}"))
            except WorkflowConfigurationError as error:
                checks.append(check("branch-prefix", "fail", str(error), "Run workflow-setup with a valid developer-specific prefix"))
        else:
            checks.append(check("branch-prefix", "fail", "Workflow branch prefix is unset", "Run workflow-setup; do not copy another developer's prefix"))

    duplicate_paths = []
    expected_skills = set(skill_names)
    for relative_root in LEGACY_SKILL_ROOTS:
        root = home / relative_root
        for name in sorted(expected_skills):
            path = root / name
            if path.exists() or path.is_symlink():
                duplicate_paths.append(str(path))
    if duplicate_paths:
        checks.append(check("duplicate-legacy-skills", "fail", f"Legacy workflow skills remain active: {', '.join(duplicate_paths)}", "Remove the duplicate legacy installation before continuing"))
    else:
        checks.append(check("duplicate-legacy-skills", "pass", "No duplicate legacy workflow skills found"))

    optional_present = []
    for name in OPTIONAL_INTEGRATIONS:
        if any((home / root / name).exists() for root in LEGACY_SKILL_ROOTS):
            optional_present.append(name)
    message = "Present: " + ", ".join(optional_present) if optional_present else "No optional specialist integrations detected"
    checks.append(check("optional-integrations", "info", message))

    ready = not any(item["status"] == "fail" for item in checks)
    return {
        "schemaVersion": 1,
        "plugin": PLUGIN_ID,
        "platform": platform,
        "ready": ready,
        "checks": checks,
    }


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--plugin-root", type=Path, default=default_plugin_root(Path(__file__)))
    command.add_argument("--home", type=Path, default=Path.home())
    command.add_argument("--repository", type=Path)
    command.add_argument("--activation-observed", action="store_true")
    command.add_argument("--json", action="store_true")
    return command


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    result = run_doctor(
        plugin_root=arguments.plugin_root,
        home=arguments.home,
        repository=arguments.repository,
        activation_observed=arguments.activation_observed,
    )
    if arguments.json:
        print(json.dumps(result, indent=2))
    else:
        for item in result["checks"]:
            print(f"[{item['status'].upper()}] {item['message']}")
            if item.get("remedy"):
                print(f"       Remedy: {item['remedy']}")
        print("READY" if result["ready"] else "NOT READY")
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
