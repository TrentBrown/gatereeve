"""Learning event helpers for pattern-learn."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .rules import BUCKETS, load_bucket
from .simple_yaml import load_yaml


def load_events(issue_dir: str | Path) -> list[dict[str, Any]]:
    events_dir = Path(issue_dir) / "learning-events"
    if not events_dir.is_dir():
        return []
    events: list[dict[str, Any]] = []
    for path in sorted(events_dir.glob("*.yaml")):
        data = load_yaml(path)
        raw_events = data.get("events", []) if isinstance(data, dict) else data
        if not isinstance(raw_events, list):
            continue
        for event in raw_events:
            if not isinstance(event, dict):
                continue
            normalized = ensure_identity(event)
            normalized["_sourceFile"] = str(path)
            events.append(normalized)
    return events


def ensure_identity(event: dict[str, Any]) -> dict[str, Any]:
    result = dict(event)
    fingerprint = event_fingerprint(result)
    result.setdefault("fingerprint", fingerprint)
    result.setdefault("id", generated_id(result))
    return result


def event_fingerprint(event: dict[str, Any]) -> str:
    copy = {key: value for key, value in event.items() if key not in ("fingerprint", "_sourceFile")}
    encoded = json.dumps(copy, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def generated_id(event: dict[str, Any]) -> str:
    source = event.get("source") or {}
    finding = event.get("finding") or {}
    basis = "|".join(
        [
            str(source.get("type", "event")),
            str(source.get("url") or source.get("artifactPath") or source.get("producer") or "unknown"),
            str(finding.get("summary") or finding.get("details") or ""),
        ]
    )
    slug = re.sub(r"[^a-z0-9]+", "-", basis.lower()).strip("-")[:60] or "learning-event"
    digest = hashlib.sha1(basis.encode()).hexdigest()[:8]
    return f"{slug}-{digest}"


def processed_event_keys(pattern_dir: str | Path) -> set[tuple[str, str | None]]:
    processed: set[tuple[str, str | None]] = set()
    for bucket in BUCKETS:
        for item in load_bucket(pattern_dir, bucket):
            provenance = item.get("provenance") or {}
            for event in provenance.get("learningEvents") or []:
                if isinstance(event, dict) and event.get("id"):
                    processed.add((str(event.get("id")), event.get("fingerprint")))
    return processed


def unprocessed_events(issue_dir: str | Path, pattern_dir: str | Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    processed = processed_event_keys(pattern_dir)
    pending: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for event in load_events(issue_dir):
        key = (str(event["id"]), event.get("fingerprint"))
        id_only_matches = [item for item in processed if item[0] == key[0]]
        if key in processed:
            skipped.append(event)
        elif id_only_matches:
            event["_warning"] = "event id was processed before with a different fingerprint"
            pending.append(event)
        else:
            pending.append(event)
    return pending, skipped

