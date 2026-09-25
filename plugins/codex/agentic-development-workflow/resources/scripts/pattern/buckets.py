"""Safe lifecycle bucket updates."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .rules import load_bucket
from .simple_yaml import write_yaml


def write_bucket(pattern_dir: str | Path, bucket: str, items: list[dict[str, Any]]) -> None:
    write_yaml(Path(pattern_dir) / f"{bucket}.yaml", items)


def move_proposal(pattern_dir: str | Path, proposal_id: str, target_bucket: str, updated_item: dict[str, Any]) -> None:
    pattern_path = Path(pattern_dir)
    proposals = load_bucket(pattern_path, "proposals")
    remaining = [item for item in proposals if item.get("id") != proposal_id]
    if len(remaining) == len(proposals):
        raise ValueError(f"proposal not found: {proposal_id}")
    target = load_bucket(pattern_path, target_bucket)
    target.append(updated_item)
    write_bucket(pattern_path, "proposals", remaining)
    write_bucket(pattern_path, target_bucket, target)


def upsert_rule(pattern_dir: str | Path, rule: dict[str, Any]) -> None:
    rules = load_bucket(pattern_dir, "rules")
    rule_id = rule.get("id")
    if not rule_id:
        raise ValueError("rule must include id")
    replaced = False
    next_rules: list[dict[str, Any]] = []
    for existing in rules:
        if existing.get("id") == rule_id:
            next_rules.append(rule)
            replaced = True
        else:
            next_rules.append(existing)
    if not replaced:
        next_rules.append(rule)
    write_bucket(pattern_dir, "rules", next_rules)

