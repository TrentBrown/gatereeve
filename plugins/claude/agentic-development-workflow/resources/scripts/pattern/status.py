"""Read-only pattern-review status helpers."""

from __future__ import annotations

import json
import html
from pathlib import Path
from typing import Any

from .rules import BUCKETS, discover_pattern_dirs, load_bucket, validate_rule_shape


def pattern_status(
    cwd: str | Path = ".",
    pattern_dirs: list[str | Path] | None = None,
    home: str | Path | None = None,
    harvest_dirs: list[str | Path] | None = None,
    include_descendants: bool = False,
) -> dict[str, Any]:
    root = Path(cwd).expanduser().resolve()
    explicit_dirs = [Path(path).expanduser().resolve() for path in pattern_dirs or []]
    if explicit_dirs:
        discovered = explicit_dirs
    else:
        discovered = discover_pattern_dirs(["."], root, home)
        if include_descendants:
            discovered = merge_paths(discovered, discover_descendant_pattern_dirs(root))

    scopes = [scope_status(path) for path in discovered]
    harvest_states = []
    for path in harvest_dirs or []:
        harvest_states.append(harvest_state_status(Path(path).expanduser().resolve()))
    for scope in scopes:
        state_path = Path(scope["path"]) / "harvest-state.json"
        if state_path.exists():
            harvest_states.append(harvest_state_status(state_path.parent))

    return {
        "cwd": str(root),
        "status": overall_status(scopes),
        "patternDirs": [str(path) for path in discovered],
        "scopes": scopes,
        "harvestStates": harvest_states,
        "nextCommand": suggest_next_command(scopes),
    }


def discover_descendant_pattern_dirs(root: Path) -> list[Path]:
    ignored = {".git", "node_modules", ".venv", "venv", "__pycache__"}
    found: list[Path] = []
    stack = [root]
    while stack:
        current = stack.pop()
        pattern_dir = current / ".pattern-review"
        if pattern_dir.is_dir():
            found.append(pattern_dir.resolve())
        try:
            children = list(current.iterdir())
        except OSError:
            continue
        for child in children:
            if child.is_dir() and child.name not in ignored and child.name != ".pattern-review":
                stack.append(child)
    return sorted(found, key=lambda path: str(path))


def merge_paths(primary: list[Path], secondary: list[Path]) -> list[Path]:
    merged: dict[Path, None] = {}
    for path in primary + secondary:
        merged[path.resolve()] = None
    return list(merged.keys())


def scope_status(pattern_dir: Path) -> dict[str, Any]:
    status: dict[str, Any] = {
        "path": str(pattern_dir),
        "exists": pattern_dir.is_dir(),
        "buckets": {},
        "audit": {"status": "PASS", "findings": []},
        "promotion": promotion_status(pattern_dir),
    }
    if not pattern_dir.is_dir():
        status["audit"] = {"status": "FAIL", "findings": [{"id": None, "failures": ["pattern directory does not exist"]}]}
        return status

    all_ids: dict[str, list[str]] = {}
    for bucket in BUCKETS:
        bucket_path = pattern_dir / f"{bucket}.yaml"
        try:
            items = load_bucket(pattern_dir, bucket)
            parse_error = None
        except Exception as exc:
            items = []
            parse_error = str(exc)
        ids = [str(item.get("id") or "").strip() for item in items if item.get("id")]
        for item_id in ids:
            all_ids.setdefault(item_id, []).append(bucket)
        status["buckets"][bucket] = {
            "path": str(bucket_path),
            "exists": bucket_path.exists(),
            "count": len(items),
            "parseStatus": "PASS" if parse_error is None else "FAIL",
            "parseError": parse_error,
            "ids": ids,
        }

    findings = []
    for item_id, buckets in sorted(all_ids.items()):
        if len(buckets) > 1:
            findings.append({"id": item_id, "failures": [f"duplicate id across buckets: {', '.join(buckets)}"]})
    for rule in load_bucket_safe(pattern_dir, "rules"):
        failures = validate_rule_shape(rule)
        if failures:
            findings.append({"id": rule.get("id"), "failures": failures})
    for bucket, bucket_status in status["buckets"].items():
        if bucket_status["parseStatus"] != "PASS":
            findings.append({"id": None, "failures": [f"{bucket}.yaml parse failed: {bucket_status['parseError']}"]})

    status["audit"] = {"status": "PASS" if not findings else "FAIL", "findings": findings}
    return status


def load_bucket_safe(pattern_dir: Path, bucket: str) -> list[dict[str, Any]]:
    try:
        return load_bucket(pattern_dir, bucket)
    except Exception:
        return []


def promotion_status(pattern_dir: Path) -> dict[str, Any]:
    promotion_dir = pattern_dir / "promotion"
    current_html = promotion_dir / "current.html"
    current_md = promotion_dir / "current.md"
    return {
        "exists": promotion_dir.is_dir(),
        "currentHtml": str(current_html) if current_html.exists() else None,
        "currentMarkdown": str(current_md) if current_md.exists() else None,
    }


def harvest_state_status(harvest_dir: Path) -> dict[str, Any]:
    state_path = harvest_dir / "harvest-state.json"
    if not state_path.exists():
        return {"path": str(harvest_dir), "exists": False}
    try:
        state = json.loads(state_path.read_text())
    except Exception as exc:
        return {"path": str(harvest_dir), "exists": True, "parseStatus": "FAIL", "parseError": str(exc)}
    return {
        "path": str(harvest_dir),
        "exists": True,
        "parseStatus": "PASS",
        "reviewer": state.get("reviewer"),
        "prs": state.get("prs") or [],
        "highWaterUpdatedAt": state.get("highWaterUpdatedAt"),
        "seenCommentCount": len(state.get("seenCommentIds") or []),
        "filters": state.get("filters") or {},
    }


def overall_status(scopes: list[dict[str, Any]]) -> str:
    if not scopes:
        return "NO_SCOPE"
    if any(scope["audit"]["status"] != "PASS" for scope in scopes):
        return "NEEDS_ATTENTION"
    return "READY"


def suggest_next_command(scopes: list[dict[str, Any]]) -> str:
    if not scopes:
        return "pattern-init"
    first = scopes[0]
    buckets = first.get("buckets") or {}
    if first.get("audit", {}).get("status") != "PASS":
        return "pattern-audit"
    if (buckets.get("proposals") or {}).get("count", 0) > 0:
        return "pattern-promote"
    if (buckets.get("rules") or {}).get("count", 0) > 0:
        return "pattern-review"
    return "pattern-extract or pattern-harvest"


def status_markdown(status: dict[str, Any]) -> str:
    lines = [
        "# Pattern Status",
        "",
        f"- **CWD:** `{status['cwd']}`",
        f"- **Status:** `{status['status']}`",
        f"- **Next command:** `{status['nextCommand']}`",
        "",
        "## Scopes",
        "",
    ]
    scopes = status.get("scopes") or []
    if not scopes:
        lines.append("No `.pattern-review/` scopes were found.")
        lines.append("")
    for scope in scopes:
        lines.extend(scope_markdown(scope))
    lines.extend(["## Harvest State", ""])
    harvest_states = status.get("harvestStates") or []
    if not harvest_states:
        lines.append("No harvest state was found.")
        lines.append("")
    for harvest_state in harvest_states:
        lines.extend(harvest_state_markdown(harvest_state))
    return "\n".join(lines).rstrip() + "\n"


def scope_markdown(scope: dict[str, Any]) -> list[str]:
    lines = [
        f"### `{scope['path']}`",
        "",
        f"- **Exists:** `{scope['exists']}`",
        f"- **Audit:** `{scope['audit']['status']}`",
        "",
        "| Bucket | Count | Parse |",
        "|---|---:|---|",
    ]
    for bucket in BUCKETS:
        bucket_status = (scope.get("buckets") or {}).get(bucket) or {}
        lines.append(f"| `{bucket}` | {bucket_status.get('count', 0)} | `{bucket_status.get('parseStatus', 'MISSING')}` |")
    lines.extend(["", "#### Promotion", ""])
    promotion = scope.get("promotion") or {}
    lines.extend(
        [
            f"- **Packet directory exists:** `{promotion.get('exists')}`",
            f"- **Current HTML:** `{promotion.get('currentHtml') or '-'}`",
            f"- **Current Markdown:** `{promotion.get('currentMarkdown') or '-'}`",
            "",
        ]
    )
    findings = (scope.get("audit") or {}).get("findings") or []
    lines.extend(["#### Findings", ""])
    if not findings:
        lines.extend(["No audit findings.", ""])
    else:
        for finding in findings:
            finding_id = finding.get("id") or "<scope>"
            failures = "; ".join(finding.get("failures") or [])
            lines.append(f"- `{finding_id}`: {failures}")
        lines.append("")
    return lines


def harvest_state_markdown(harvest_state: dict[str, Any]) -> list[str]:
    lines = [
        f"### `{harvest_state['path']}`",
        "",
        f"- **Exists:** `{harvest_state.get('exists')}`",
    ]
    if not harvest_state.get("exists") or harvest_state.get("parseStatus") == "FAIL":
        lines.extend(
            [
                f"- **Parse status:** `{harvest_state.get('parseStatus', 'MISSING')}`",
                f"- **Parse error:** `{harvest_state.get('parseError') or '-'}`",
                "",
            ]
        )
        return lines
    lines.extend(
        [
            f"- **Reviewer:** `{harvest_state.get('reviewer') or '-'}`",
            f"- **High water updated at:** `{harvest_state.get('highWaterUpdatedAt') or '-'}`",
            f"- **Seen comment count:** `{harvest_state.get('seenCommentCount')}`",
            "",
            "PRs:",
            "",
            *[f"- `{pr}`" for pr in harvest_state.get("prs") or []],
            "",
            "Filters:",
            "",
            *[f"- **{key}:** `{value}`" for key, value in (harvest_state.get("filters") or {}).items()],
            "",
        ]
    )
    return lines


def status_html(status: dict[str, Any]) -> str:
    scope_cards = "\n".join(scope_html(scope) for scope in status.get("scopes") or [])
    if not scope_cards:
        scope_cards = "<p class=\"empty\">No <code>.pattern-review/</code> scopes were found.</p>"
    harvest_cards = "\n".join(harvest_state_html(item) for item in status.get("harvestStates") or [])
    if not harvest_cards:
        harvest_cards = "<p class=\"empty\">No harvest state was found.</p>"
    return (
        "<!doctype html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "  <meta charset=\"utf-8\">\n"
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "  <title>Pattern Status</title>\n"
        "  <style>\n"
        "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f7f7f5; color: #20201d; }\n"
        "    main { max-width: 1040px; margin: 0 auto; padding: 32px 24px 48px; }\n"
        "    h1 { margin: 0 0 16px; font-size: 32px; letter-spacing: 0; }\n"
        "    h2 { margin-top: 28px; border-bottom: 1px solid #d8d6cf; padding-bottom: 8px; }\n"
        "    h3 { margin-top: 0; font-size: 17px; overflow-wrap: anywhere; }\n"
        "    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }\n"
        "    .pill { background: #ffffff; border: 1px solid #d8d6cf; border-radius: 6px; padding: 8px 10px; }\n"
        "    .card { background: #ffffff; border: 1px solid #d8d6cf; border-radius: 8px; padding: 16px; margin: 14px 0; }\n"
        "    table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; }\n"
        "    th, td { text-align: left; border-bottom: 1px solid #e4e1d9; padding: 8px; vertical-align: top; }\n"
        "    th { font-size: 12px; text-transform: uppercase; color: #666158; }\n"
        "    code { background: #f0eee8; border-radius: 4px; padding: 1px 4px; overflow-wrap: anywhere; }\n"
        "    .empty { color: #746f65; }\n"
        "    .finding { color: #8a2d1c; }\n"
        "    ul { padding-left: 20px; }\n"
        "  </style>\n"
        "</head>\n"
        "<body>\n"
        "<main>\n"
        "  <h1>Pattern Status</h1>\n"
        "  <div class=\"summary\">\n"
        f"    <span class=\"pill\">Status: <strong>{esc(status['status'])}</strong></span>\n"
        f"    <span class=\"pill\">Next: <strong>{esc(status['nextCommand'])}</strong></span>\n"
        f"    <span class=\"pill\">CWD: <code>{esc(status['cwd'])}</code></span>\n"
        "  </div>\n"
        "  <h2>Scopes</h2>\n"
        f"{scope_cards}\n"
        "  <h2>Harvest State</h2>\n"
        f"{harvest_cards}\n"
        "</main>\n"
        "</body>\n"
        "</html>\n"
    )


def scope_html(scope: dict[str, Any]) -> str:
    bucket_rows = []
    for bucket in BUCKETS:
        bucket_status = (scope.get("buckets") or {}).get(bucket) or {}
        bucket_rows.append(
            "<tr>"
            f"<td><code>{esc(bucket)}</code></td>"
            f"<td>{bucket_status.get('count', 0)}</td>"
            f"<td><code>{esc(bucket_status.get('parseStatus', 'MISSING'))}</code></td>"
            "</tr>"
        )
    findings = (scope.get("audit") or {}).get("findings") or []
    if findings:
        findings_html = "<ul>" + "".join(
            f"<li class=\"finding\"><code>{esc(finding.get('id') or '<scope>')}</code>: {esc('; '.join(finding.get('failures') or []))}</li>"
            for finding in findings
        ) + "</ul>"
    else:
        findings_html = "<p class=\"empty\">No audit findings.</p>"
    promotion = scope.get("promotion") or {}
    return (
        "<section class=\"card\">\n"
        f"  <h3><code>{esc(scope['path'])}</code></h3>\n"
        f"  <p>Exists: <code>{esc(scope.get('exists'))}</code> Audit: <code>{esc((scope.get('audit') or {}).get('status'))}</code></p>\n"
        "  <table><thead><tr><th>Bucket</th><th>Count</th><th>Parse</th></tr></thead><tbody>\n"
        f"    {''.join(bucket_rows)}\n"
        "  </tbody></table>\n"
        "  <h4>Promotion</h4>\n"
        f"  <p>Current HTML: <code>{esc(promotion.get('currentHtml') or '-')}</code></p>\n"
        f"  <p>Current Markdown: <code>{esc(promotion.get('currentMarkdown') or '-')}</code></p>\n"
        "  <h4>Findings</h4>\n"
        f"  {findings_html}\n"
        "</section>"
    )


def harvest_state_html(harvest_state: dict[str, Any]) -> str:
    if not harvest_state.get("exists") or harvest_state.get("parseStatus") == "FAIL":
        return (
            "<section class=\"card\">\n"
            f"  <h3><code>{esc(harvest_state['path'])}</code></h3>\n"
            f"  <p>Parse status: <code>{esc(harvest_state.get('parseStatus', 'MISSING'))}</code></p>\n"
            f"  <p class=\"finding\">{esc(harvest_state.get('parseError') or '')}</p>\n"
            "</section>"
        )
    prs = "".join(f"<li><code>{esc(pr)}</code></li>" for pr in harvest_state.get("prs") or [])
    filters = "".join(f"<li><strong>{esc(key)}:</strong> <code>{esc(value)}</code></li>" for key, value in (harvest_state.get("filters") or {}).items())
    return (
        "<section class=\"card\">\n"
        f"  <h3><code>{esc(harvest_state['path'])}</code></h3>\n"
        f"  <p>Reviewer: <code>{esc(harvest_state.get('reviewer') or '-')}</code></p>\n"
        f"  <p>High water: <code>{esc(harvest_state.get('highWaterUpdatedAt') or '-')}</code></p>\n"
        f"  <p>Seen comments: <strong>{esc(harvest_state.get('seenCommentCount'))}</strong></p>\n"
        f"  <h4>PRs</h4><ul>{prs}</ul>\n"
        f"  <h4>Filters</h4><ul>{filters}</ul>\n"
        "</section>"
    )


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)
