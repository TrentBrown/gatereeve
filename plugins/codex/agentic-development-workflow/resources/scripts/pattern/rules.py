"""Rule discovery, loading, and trigger helpers."""

from __future__ import annotations

import fnmatch
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .simple_yaml import load_yaml

PATTERN_DIR = ".pattern-review"
BUCKETS = ("rules", "proposals", "deferred", "rejected")


def load_bucket(pattern_dir: str | Path, bucket: str) -> list[dict[str, Any]]:
    path = Path(pattern_dir) / f"{bucket}.yaml"
    if not path.exists():
        return []
    data = load_yaml(path)
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        value = data.get(bucket) or data.get("items") or data.get("rules") or []
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    raise ValueError(f"{path} must contain a list or a mapping with a list")


def discover_pattern_dirs(changed_files: list[str], repo_root: str | Path, home: str | Path | None = None) -> list[Path]:
    root = Path(repo_root).resolve()
    found: dict[Path, None] = {}
    for rel in changed_files or ["."]:
        current = (root / rel).resolve()
        if current.is_file() or current.suffix:
            current = current.parent
        while True:
            pattern_dir = current / PATTERN_DIR
            if pattern_dir.is_dir():
                found[pattern_dir] = None
            if current.parent == current:
                break
            current = current.parent
    if home:
        home_dir = Path(home).expanduser().resolve() / PATTERN_DIR
        if home_dir.is_dir():
            found[home_dir] = None
    return sorted(found.keys(), key=lambda path: len(path.parts), reverse=True)


def effective_rules(pattern_dirs: list[Path]) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    by_id: dict[str, dict[str, Any]] = {}
    sources: dict[str, Path] = {}
    overrides: list[dict[str, str]] = []
    for pattern_dir in reversed(pattern_dirs):
        for rule in load_bucket(pattern_dir, "rules"):
            rule_id = str(rule.get("id", "")).strip()
            if not rule_id:
                continue
            if rule_id in by_id:
                overrides.append(
                    {
                        "id": rule_id,
                        "overridden": str(sources[rule_id]),
                        "selected": str(pattern_dir / "rules.yaml"),
                    }
                )
            enriched = dict(rule)
            enriched["_source"] = str(pattern_dir / "rules.yaml")
            enriched["_hash"] = fingerprint(rule)
            by_id[rule_id] = enriched
            sources[rule_id] = pattern_dir / "rules.yaml"
    return list(by_id.values()), overrides


def fingerprint(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def deterministic_trigger(rule: dict[str, Any], changed_files: list[str], added_by_file: dict[str, list[str]]) -> tuple[bool | None, str]:
    failures = validate_rule_shape(rule)
    if failures:
        rule_id = rule.get("id") or "<unknown>"
        raise ValueError(f"invalid rule {rule_id}: {'; '.join(failures)}")

    trigger = rule.get("trigger") or {}
    mode = trigger.get("mode")
    if mode == "always":
        return True, "always trigger"
    if mode == "path":
        patterns = trigger.get("paths") or []
        matched = [path for path in changed_files if any(fnmatch.fnmatch(path, pattern) for pattern in patterns)]
        return bool(matched), f"matched paths: {', '.join(matched)}" if matched else "no path matches"
    if mode == "diff":
        contains = trigger.get("addedContains") or []
        regexes = trigger.get("addedRegex") or []
        matches: list[str] = []
        for path, lines in added_by_file.items():
            for line in lines:
                if any(token in line for token in contains) or any(re.search(pattern, line) for pattern in regexes):
                    matches.append(path)
                    break
        return bool(matches), f"matched diff files: {', '.join(sorted(set(matches)))}" if matches else "no diff matches"
    if mode == "agentic":
        return None, "agentic trigger requires model judgment"
    return None, f"unsupported or missing trigger mode: {mode}"


def validate_rule_shape(rule: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for key in ("id", "title", "description", "scope", "trigger", "severity", "review"):
        if key not in rule:
            failures.append(f"missing {key}")
    trigger = rule.get("trigger") or {}
    mode = trigger.get("mode")
    if mode not in ("path", "diff", "agentic", "always"):
        failures.append("trigger.mode must be path, diff, agentic, or always")
    elif mode == "path":
        failures.extend(_validate_string_list(trigger, "trigger.paths"))
    elif mode == "diff":
        failures.extend(_validate_string_list(trigger, "trigger.addedContains"))
        failures.extend(_validate_string_list(trigger, "trigger.addedRegex"))
        if "addedRegexes" in trigger:
            failures.append("trigger.addedRegexes is not supported; use trigger.addedRegex")
    review = rule.get("review") or {}
    if review.get("mode") not in ("agentic", "manual", "mechanical", "checklist"):
        failures.append("review.mode must be agentic, manual, mechanical, or checklist")
    if rule.get("severity") not in ("blocker", "warning", "info"):
        failures.append("severity must be blocker, warning, or info")
    return failures


def _validate_string_list(container: dict[str, Any], dotted_key: str) -> list[str]:
    key = dotted_key.split(".")[-1]
    if key not in container:
        return []

    value = container.get(key)
    if not isinstance(value, list):
        return [f"{dotted_key} must be a list of strings"]

    failures: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str):
            failures.append(f"{dotted_key}[{index}] must be a string")
    return failures
