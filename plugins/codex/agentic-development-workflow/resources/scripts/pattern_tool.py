#!/usr/bin/env python3
"""Deterministic helper entry point for pattern-review skills."""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pattern.git_context import added_lines, build_context
from pattern.harvest import harvest_github_reviews
from pattern.learning_events import unprocessed_events
from pattern.rules import deterministic_trigger, discover_pattern_dirs, effective_rules, validate_rule_shape
from pattern.simple_yaml import dump_yaml, load_yaml, write_yaml
from pattern.status import pattern_status, status_html, status_markdown


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="Initialize a .pattern-review directory")
    init.add_argument("target", nargs="?", default=".")

    review = sub.add_parser("review-inputs", help="Collect deterministic inputs for pattern-review")
    review.add_argument("--cwd", default=".")
    review.add_argument("--base")
    review.add_argument("--head")
    review.add_argument("--home", default=os.environ.get("HOME"))

    events = sub.add_parser("event-inventory", help="List unprocessed learning events")
    events.add_argument("issue_dir")
    events.add_argument("pattern_dir")

    audit = sub.add_parser("audit-rules", help="Run cheap rule shape audit")
    audit.add_argument("pattern_dir")

    status = sub.add_parser("status", help="Report read-only pattern-review scope status")
    status.add_argument("target", nargs="?", help="Optional target directory or .pattern-review directory")
    status.add_argument("--cwd", default=".", help="Directory to use for pattern scope discovery")
    status.add_argument("--pattern-dir", action="append", default=[], help="Explicit .pattern-review directory to inspect")
    status.add_argument("--harvest-dir", action="append", default=[], help="Harvest output directory containing harvest-state.json")
    status.add_argument("--home", default=os.environ.get("HOME"), help="Home directory for optional home-level pattern scope discovery")
    status.add_argument("--include-descendants", action="store_true", help="Also inspect descendant .pattern-review directories under the target")
    status.add_argument("--out", help="Markdown report output path; HTML is written beside it with .html suffix")

    normalize = sub.add_parser("normalize-buckets", help="Normalize pattern-review YAML bucket files")
    normalize.add_argument("pattern_dir")

    promote = sub.add_parser("promote", help="Apply one pattern proposal disposition")
    promote.add_argument("pattern_dir")
    promote.add_argument("proposal_id")
    promote.add_argument("disposition", choices=("accept", "reject", "defer"))
    promote.add_argument("--reason", default="")
    promote.add_argument("--actor", default="pattern-promote")
    promote.add_argument("--now", help=argparse.SUPPRESS)

    promote_show_cmd = sub.add_parser("promote-show", help="Write Markdown and HTML packets for a proposal")
    promote_show_cmd.add_argument("pattern_dir")
    promote_show_cmd.add_argument("proposal_id", nargs="?")
    promote_show_cmd.add_argument("--out", help="Markdown output path; HTML is written beside it with .html suffix")

    harvest = sub.add_parser("harvest-github-reviews", help="Harvest GitHub PR review comments into pattern proposal artifacts")
    harvest.add_argument("--pr", action="append", required=True, help="GitHub PR ref, e.g. owner/repo#123 or https://github.com/owner/repo/pull/123")
    harvest.add_argument("--reviewer", required=True, help="Reviewer login whose comments should be harvested")
    harvest.add_argument("--out", required=True, help="Output directory for harvest artifacts")
    harvest.add_argument("--pattern-dir", action="append", default=[], help="Existing .pattern-review directory for active-rule coverage comparison")
    harvest.add_argument("--raw-dir", help="Use pre-fetched raw/*.json input from this directory instead of calling GitHub")
    harvest.add_argument("--since", help="Only include reviewer comments created or updated after this ISO timestamp")
    harvest.add_argument("--only-unresolved", action="store_true", help="Only include comments from unresolved review threads")
    harvest.add_argument("--exclude-outdated", action="store_true", help="Exclude comments from outdated review threads")
    harvest.add_argument("--resume", action="store_true", help="Use <out>/harvest-state.json to include only new or updated comments")

    args = parser.parse_args()
    if args.command == "init":
        return init_pattern_review(args.target)
    if args.command == "review-inputs":
        return review_inputs(args.cwd, args.base, args.head, args.home)
    if args.command == "event-inventory":
        return event_inventory(args.issue_dir, args.pattern_dir)
    if args.command == "audit-rules":
        return audit_rules(args.pattern_dir)
    if args.command == "status":
        return status_command(args.target, args.cwd, args.pattern_dir, args.home, args.harvest_dir, args.include_descendants, args.out)
    if args.command == "normalize-buckets":
        return normalize_buckets(args.pattern_dir)
    if args.command == "promote":
        return promote_proposal(args.pattern_dir, args.proposal_id, args.disposition, args.reason, args.actor, args.now)
    if args.command == "promote-show":
        return promote_show(args.pattern_dir, args.proposal_id, args.out)
    if args.command == "harvest-github-reviews":
        return harvest_github_reviews_command(
            args.pr,
            args.reviewer,
            args.out,
            args.pattern_dir,
            args.raw_dir,
            args.since,
            args.only_unresolved,
            args.exclude_outdated,
            args.resume,
        )
    return 1


def init_pattern_review(target: str) -> int:
    root = Path(target).expanduser().resolve()
    if root.exists() and root.is_file():
        root = root.parent
    pattern_dir = root / ".pattern-review"
    pattern_dir.mkdir(parents=True, exist_ok=True)

    created: list[str] = []
    existing: list[str] = []
    for name in ("rules", "proposals", "deferred", "rejected"):
        path = pattern_dir / f"{name}.yaml"
        if path.exists():
            existing.append(str(path))
            continue
        write_yaml(path, [])
        created.append(str(path))

    readme = pattern_dir / "README.md"
    if readme.exists():
        existing.append(str(readme))
    else:
        readme.write_text(
            "# Pattern Review\n\n"
            "This directory stores pattern-review rules and lifecycle buckets.\n\n"
            "- `rules.yaml` contains active rules.\n"
            "- `proposals.yaml` contains proposed rule additions or changes.\n"
            "- `deferred.yaml` contains postponed proposals.\n"
            "- `rejected.yaml` contains rejected proposals retained as learning context.\n",
        )
        created.append(str(readme))

    print(json.dumps({"patternDir": str(pattern_dir), "created": created, "existing": existing}, indent=2))
    return 0


def review_inputs(
    cwd: str,
    base: str | None,
    head: str | None,
    home: str | None,
) -> int:
    context = build_context(cwd, base, head)
    added = added_lines(context.repo_root, context.merge_base, context.head)
    pattern_dirs = discover_pattern_dirs(context.changed_files, context.repo_root, home)
    if not pattern_dirs:
        return missing_pattern_scope(context.repo_root)
    rules, overrides = effective_rules(pattern_dirs)
    triggered = []
    for rule in rules:
        try:
            result, rationale = deterministic_trigger(rule, context.changed_files, added)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        triggered.append(
            {
                "id": rule.get("id"),
                "title": rule.get("title"),
                "source": rule.get("_source"),
                "hash": rule.get("_hash"),
                "triggerResult": result,
                "triggerRationale": rationale,
                "requiresAgenticTrigger": result is None and (rule.get("trigger") or {}).get("mode") == "agentic",
            }
        )
    print(
        json.dumps(
            {
                "reviewContext": {
                    "repoRoot": str(context.repo_root),
                    "branch": context.branch,
                    "baseRef": context.base_ref,
                    "mergeBase": context.merge_base,
                    "head": context.head,
                    "changedFiles": context.changed_files,
                },
                "ruleSources": [str(path) for path in pattern_dirs],
                "overrides": overrides,
                "triggeredRules": triggered,
            },
            indent=2,
        )
    )
    return 0


def event_inventory(issue_dir: str, pattern_dir: str) -> int:
    pattern_path = Path(pattern_dir).expanduser()
    if not pattern_path.is_dir():
        return missing_pattern_scope(pattern_path)
    pending, skipped = unprocessed_events(issue_dir, pattern_dir)
    print(json.dumps({"patternDir": str(pattern_path.resolve()), "pending": pending, "skipped": skipped}, indent=2))
    return 0


def audit_rules(pattern_dir: str) -> int:
    pattern_path = Path(pattern_dir).expanduser()
    if not pattern_path.is_dir():
        return missing_pattern_scope(pattern_path)
    from pattern.rules import load_bucket

    findings = []
    for rule in load_bucket(pattern_path, "rules"):
        failures = validate_rule_shape(rule)
        if failures:
            findings.append({"id": rule.get("id"), "failures": failures})
    print(
        json.dumps(
            {"patternDir": str(pattern_path.resolve()), "findings": findings, "status": "PASS" if not findings else "FAIL"},
            indent=2,
        )
    )
    return 1 if findings else 0


def status_command(
    target: str | None,
    cwd: str,
    pattern_dirs: list[str],
    home: str | None,
    harvest_dirs: list[str],
    include_descendants: bool,
    out: str | None,
) -> int:
    effective_cwd = target or cwd
    effective_pattern_dirs = list(pattern_dirs)
    if target and Path(target).expanduser().name == ".pattern-review":
        effective_pattern_dirs.append(target)
        effective_cwd = str(Path(target).expanduser().resolve().parent)
    status = pattern_status(effective_cwd, effective_pattern_dirs, home, harvest_dirs, include_descendants)
    if out:
        markdown_path = Path(out).expanduser()
        if not markdown_path.is_absolute():
            markdown_path = Path(effective_cwd).expanduser().resolve() / markdown_path
        html_path = markdown_path.with_suffix(".html")
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(status_markdown(status))
        html_path.write_text(status_html(status))
        status["report"] = {
            "markdown": str(markdown_path.resolve()),
            "html": str(html_path.resolve()),
        }
    print(json.dumps(status, indent=2))
    return 0


def normalize_buckets(pattern_dir: str) -> int:
    pattern_path = Path(pattern_dir).expanduser()
    if not pattern_path.is_dir():
        return missing_pattern_scope(pattern_path)
    normalized = _normalize_bucket_files(pattern_path)
    print(json.dumps({"patternDir": str(pattern_path.resolve()), "normalized": normalized}, indent=2))
    return 0


def promote_proposal(
    pattern_dir: str,
    proposal_id: str,
    disposition: str,
    reason: str,
    actor: str,
    now: str | None,
) -> int:
    pattern_path = Path(pattern_dir).expanduser()
    if not pattern_path.is_dir():
        return missing_pattern_scope(pattern_path)

    proposals_path = pattern_path / "proposals.yaml"
    rules_path = pattern_path / "rules.yaml"
    target_bucket = {"reject": "rejected", "defer": "deferred"}.get(disposition)
    proposals = _load_lifecycle_list(proposals_path)
    rules = _load_lifecycle_list(rules_path)

    matches = [item for item in proposals if item.get("id") == proposal_id]
    if not matches:
        print(f"proposal not found: {proposal_id}", file=sys.stderr)
        return 1
    if len(matches) > 1:
        print(f"proposal id is duplicated in proposals.yaml: {proposal_id}", file=sys.stderr)
        return 1
    proposal = matches[0]
    remaining = [item for item in proposals if item.get("id") != proposal_id]
    timestamp = now or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    if disposition == "accept":
        try:
            rules = _accept_proposal(rules, proposal, proposal_id, actor, timestamp)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        write_yaml(rules_path, rules)
        write_yaml(proposals_path, remaining)
    else:
        assert target_bucket is not None
        target_path = pattern_path / f"{target_bucket}.yaml"
        target_items = _load_lifecycle_list(target_path)
        moved = dict(proposal)
        moved["decision"] = {
            "disposition": disposition,
            "decidedAt": timestamp,
            "decidedBy": actor,
            "reason": reason,
        }
        target_items.append(moved)
        write_yaml(target_path, target_items)
        write_yaml(proposals_path, remaining)

    normalized = _normalize_bucket_files(pattern_path)
    counts = {
        "rules": len(_load_lifecycle_list(rules_path)),
        "proposals": len(_load_lifecycle_list(proposals_path)),
        "deferred": len(_load_lifecycle_list(pattern_path / "deferred.yaml")),
        "rejected": len(_load_lifecycle_list(pattern_path / "rejected.yaml")),
    }
    print(
        json.dumps(
            {
                "patternDir": str(pattern_path.resolve()),
                "proposalId": proposal_id,
                "disposition": disposition,
                "normalized": normalized,
                "counts": counts,
            },
            indent=2,
        )
    )
    return 0


def promote_show(pattern_dir: str, proposal_id: str | None, out: str | None) -> int:
    pattern_path = Path(pattern_dir).expanduser()
    if not pattern_path.is_dir():
        return missing_pattern_scope(pattern_path)

    proposals = _load_lifecycle_list(pattern_path / "proposals.yaml")
    if not proposals:
        print("no proposals found", file=sys.stderr)
        return 1

    if proposal_id:
        matches = [item for item in proposals if item.get("id") == proposal_id]
        if not matches:
            print(f"proposal not found: {proposal_id}", file=sys.stderr)
            return 1
        if len(matches) > 1:
            print(f"proposal id is duplicated in proposals.yaml: {proposal_id}", file=sys.stderr)
            return 1
        proposal = matches[0]
    else:
        proposal = proposals[0]

    markdown_path = Path(out).expanduser() if out else pattern_path / "promotion" / "current.md"
    if not markdown_path.is_absolute():
        markdown_path = pattern_path / markdown_path
    html_path = markdown_path.with_suffix(".html")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(_promotion_markdown_packet(pattern_path, proposal))
    html_path.write_text(_promotion_html_packet(pattern_path, proposal))
    print(
        json.dumps(
            {
                "patternDir": str(pattern_path.resolve()),
                "proposalId": proposal.get("id"),
                "packet": str(html_path.resolve()),
                "htmlPacket": str(html_path.resolve()),
                "markdownPacket": str(markdown_path.resolve()),
                "remainingProposals": len(proposals),
            },
            indent=2,
        )
    )
    return 0


def harvest_github_reviews_command(
    prs: list[str],
    reviewer: str,
    out: str,
    pattern_dirs: list[str],
    raw_dir: str | None,
    since: str | None,
    only_unresolved: bool,
    exclude_outdated: bool,
    resume: bool,
) -> int:
    try:
        result = harvest_github_reviews(
            prs,
            reviewer,
            out,
            pattern_dirs,
            raw_dir,
            since=since,
            only_unresolved=only_unresolved,
            exclude_outdated=exclude_outdated,
            resume=resume,
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


def _promotion_markdown_packet(pattern_path: Path, proposal: dict[str, Any]) -> str:
    title = proposal.get("title") or proposal.get("id") or "Pattern proposal"
    proposal_id = proposal.get("id") or ""
    evidence_files = ((proposal.get("evidence") or {}).get("instructionFiles") or [])
    source_lines = []
    for item in evidence_files:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        line = item.get("line")
        label = f"{path}:{line}" if line else str(path)
        source_lines.append(f"### {label}")
        if item.get("sourceText"):
            source_lines.append("")
            source_lines.append("```text")
            source_lines.append(str(item["sourceText"]))
            source_lines.append("```")
        if item.get("sourceBoundary"):
            source_lines.append("")
            source_lines.append(f"Source boundary: `{item['sourceBoundary']}`")
        source_lines.append("")
    if not source_lines:
        source_lines = ["No source evidence recorded.", ""]

    return (
        f"# Pattern Promotion Packet: {title}\n\n"
        f"Pattern directory: `{pattern_path.resolve()}`\n\n"
        f"Proposal id: `{proposal_id}`\n\n"
        "## Structured Proposal\n\n"
        "```yaml\n"
        f"{dump_yaml(proposal).rstrip()}\n"
        "```\n\n"
        "## Source Evidence\n\n"
        f"{chr(10).join(source_lines).rstrip()}\n\n"
        "## Disposition\n\n"
        "Reply in chat with one of: `accept`, `reject`, `defer`, `edit`, or `skip`.\n"
    )


def _promotion_html_packet(pattern_path: Path, proposal: dict[str, Any]) -> str:
    title = str(proposal.get("title") or proposal.get("id") or "Pattern proposal")
    proposal_id = str(proposal.get("id") or "")
    description = str(proposal.get("description") or "")
    rationale = str(proposal.get("rationale") or "")
    severity = str(proposal.get("severity") or "")
    scope = proposal.get("scope") or {}
    trigger = proposal.get("trigger") or {}
    review = proposal.get("review") or {}
    examples = proposal.get("examples") or {}
    raw_yaml = dump_yaml(proposal).rstrip()
    source_summary = str((proposal.get("evidence") or {}).get("sourceSummary") or "")

    return (
        "<!doctype html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "  <meta charset=\"utf-8\">\n"
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        f"  <title>{_html(title)} - Pattern Promotion</title>\n"
        "  <style>\n"
        "    :root { color-scheme: light dark; --bg: #f8fafc; --fg: #111827; --muted: #64748b; --panel: #ffffff; --line: #d7dde7; --good: #ecfdf5; --good-border: #10b981; --bad: #fef2f2; --bad-border: #ef4444; --code: #0f172a; --code-fg: #e5e7eb; }\n"
        "    @media (prefers-color-scheme: dark) { :root { --bg: #0b1020; --fg: #e5e7eb; --muted: #94a3b8; --panel: #111827; --line: #334155; --good: #052e22; --bad: #3b0a0a; --code: #020617; --code-fg: #e5e7eb; } }\n"
        "    * { box-sizing: border-box; }\n"
        "    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; }\n"
        "    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }\n"
        "    header { border-bottom: 1px solid var(--line); padding-bottom: 18px; margin-bottom: 22px; }\n"
        "    h1 { margin: 0 0 12px; font-size: 30px; line-height: 1.15; letter-spacing: 0; }\n"
        "    h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: 0; }\n"
        "    section, details { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin: 14px 0; }\n"
        "    .meta { display: flex; flex-wrap: wrap; gap: 8px; }\n"
        "    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; color: var(--muted); font-size: 13px; }\n"
        "    .chips { display: flex; flex-wrap: wrap; gap: 6px; }\n"
        "    .chip { border: 1px solid var(--line); border-radius: 6px; padding: 3px 7px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }\n"
        "    .severity { color: var(--fg); font-weight: 700; }\n"
        "    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }\n"
        "    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }\n"
        "    .value { overflow-wrap: anywhere; }\n"
        "    .example { border-left: 4px solid var(--line); padding: 12px 14px; border-radius: 6px; margin-top: 10px; }\n"
        "    .good { background: var(--good); border-left-color: var(--good-border); }\n"
        "    .bad { background: var(--bad); border-left-color: var(--bad-border); }\n"
        "    pre { margin: 10px 0 0; overflow: auto; background: var(--code); color: var(--code-fg); padding: 14px; border-radius: 6px; font-size: 13px; line-height: 1.45; }\n"
        "    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n"
        "    summary { cursor: pointer; font-weight: 700; }\n"
        "    .evidence-item + .evidence-item { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }\n"
        "    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }\n"
        "    .empty { color: var(--muted); }\n"
        "  </style>\n"
        "</head>\n"
        "<body>\n"
        "<main>\n"
        "  <header>\n"
        f"    <h1>{_html(title)}</h1>\n"
        "    <div class=\"meta\">\n"
        f"      <span class=\"pill\">Rule id: <strong>{_html(proposal_id)}</strong></span>\n"
        f"      <span class=\"pill severity\">Severity: {_html(severity)}</span>\n"
        f"      <span class=\"pill\">Pattern dir: {_html(str(pattern_path.resolve()))}</span>\n"
        "    </div>\n"
        "  </header>\n"
        f"{_html_section('Description', description)}\n"
        f"{_html_section('Rationale', rationale)}\n"
        f"{_html_section('Source Summary', source_summary)}\n"
        "  <section>\n"
        "    <h2>Examples</h2>\n"
        f"    {_example_block('Good', examples.get('good'), 'good')}\n"
        f"    {_example_block('Bad', examples.get('bad'), 'bad')}\n"
        "  </section>\n"
        "  <section>\n"
        "    <h2>Scope, Trigger, And Review</h2>\n"
        "    <div class=\"summary-grid\">\n"
        f"      {_field_block('Scope paths', _scope_paths(scope))}\n"
        f"      {_field_block('Trigger mode', trigger.get('mode'))}\n"
        f"      {_field_block('Trigger paths', _trigger_paths(trigger))}\n"
        f"      {_field_block('Trigger diff criteria', _trigger_diff_criteria(trigger))}\n"
        f"      {_field_block('Trigger description', trigger.get('description'))}\n"
        f"      {_field_block('Review mode', review.get('mode'))}\n"
        f"      {_field_block('Review instructions', review.get('instructions'))}\n"
        "    </div>\n"
        "  </section>\n"
        f"{_source_evidence_html(proposal)}\n"
        "  <details>\n"
        "    <summary>Raw YAML</summary>\n"
        f"    <pre><code>{_html(raw_yaml)}</code></pre>\n"
        "  </details>\n"
        "  <section>\n"
        "    <h2>Disposition</h2>\n"
        "    <p>Reply in chat with one of: <code>accept</code>, <code>reject</code>, <code>defer</code>, <code>edit</code>, or <code>skip</code>.</p>\n"
        "  </section>\n"
        "</main>\n"
        "</body>\n"
        "</html>\n"
    )


def _html(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _html_section(title: str, body: str) -> str:
    if not body:
        return ""
    return f"  <section>\n    <h2>{_html(title)}</h2>\n    <p>{_html(body)}</p>\n  </section>"


def _field_block(label: str, value: Any) -> str:
    if isinstance(value, list):
        body = (
            "<div class=\"chips\">" + "".join(f"<span class=\"chip\">{_html(item)}</span>" for item in value) + "</div>"
            if value
            else "<span class=\"empty\">Not specified</span>"
        )
    else:
        body = _html(value) if value else "<span class=\"empty\">Not specified</span>"
    return f"<div><div class=\"label\">{_html(label)}</div><div class=\"value\">{body}</div></div>"


def _scope_paths(scope: Any) -> str:
    if not isinstance(scope, dict):
        return ""
    paths = scope.get("paths")
    if not isinstance(paths, list):
        return ""
    return [str(path) for path in paths]


def _trigger_paths(trigger: Any) -> list[str]:
    if not isinstance(trigger, dict):
        return []
    paths = trigger.get("paths")
    if not isinstance(paths, list):
        return []
    return [str(path) for path in paths]


def _trigger_diff_criteria(trigger: Any) -> list[str]:
    if not isinstance(trigger, dict):
        return []
    criteria: list[str] = []
    for key in ("addedContains", "addedRegex"):
        values = trigger.get(key)
        if isinstance(values, list):
            criteria.extend(f"{key}: {value}" for value in values)
    return criteria


def _example_block(label: str, value: Any, class_name: str) -> str:
    if not value:
        return f"<div class=\"example\"><strong>{_html(label)}:</strong> <span class=\"empty\">Not specified</span></div>"
    return f"<div class=\"example {class_name}\"><strong>{_html(label)}:</strong> {_html(value)}</div>"


def _source_evidence_html(proposal: dict[str, Any]) -> str:
    evidence_files = ((proposal.get("evidence") or {}).get("instructionFiles") or [])
    if not evidence_files:
        return "  <details>\n    <summary>Source Evidence</summary>\n    <p class=\"empty\">No source evidence recorded.</p>\n  </details>"
    items = []
    for item in evidence_files:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        line = item.get("line")
        label = f"{path}:{line}" if line else str(path)
        source = item.get("sourceText")
        boundary = item.get("sourceBoundary")
        parts = [
            "    <div class=\"evidence-item\">",
            f"      <div class=\"path\">{_html(label)}</div>",
        ]
        if source:
            parts.append(f"      <pre><code>{_html(source)}</code></pre>")
        if boundary:
            parts.append(f"      <p class=\"empty\">Source boundary: <code>{_html(boundary)}</code></p>")
        parts.append("    </div>")
        items.append("\n".join(parts))
    return "  <details>\n    <summary>Source Evidence</summary>\n" + "\n".join(items) + "\n  </details>"


def _accept_proposal(
    rules: list[dict[str, Any]],
    proposal: dict[str, Any],
    proposal_id: str,
    actor: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    proposal_type = proposal.get("type", "new_rule")
    rule = {key: value for key, value in proposal.items() if key != "type"}
    rule_id = rule.get("id")
    if not rule_id:
        raise ValueError("proposal must include id")
    provenance = dict(rule.get("provenance") or {})
    provenance.update({"promotedFrom": proposal_id, "promotedAt": timestamp, "promotedBy": actor})
    rule["provenance"] = provenance

    if proposal_type == "new_rule":
        if any(existing.get("id") == rule_id for existing in rules):
            raise ValueError(f"rule already exists: {rule_id}")
        return [*rules, rule]
    if proposal_type == "modify_rule":
        target_id = proposal.get("targetRuleId") or rule_id
        replaced = False
        next_rules: list[dict[str, Any]] = []
        for existing in rules:
            if existing.get("id") == target_id:
                next_rules.append(rule)
                replaced = True
            else:
                next_rules.append(existing)
        if not replaced:
            raise ValueError(f"target rule not found for modify_rule: {target_id}")
        return next_rules
    raise ValueError(f"unsupported proposal type: {proposal_type}")


def _load_lifecycle_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = load_yaml(path)
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a list")
    return [item for item in data if isinstance(item, dict)]


def _normalize_bucket_files(pattern_path: Path) -> list[str]:
    normalized: list[str] = []
    for name in ("rules", "proposals", "deferred", "rejected"):
        path = pattern_path / f"{name}.yaml"
        if not path.exists():
            continue
        data = load_yaml(path)
        write_yaml(path, data)
        normalized.append(str(path.resolve()))
    return normalized


def missing_pattern_scope(target: Path) -> int:
    print(
        f"No applicable .pattern-review directory found for {target}.\n"
        f"Run: /pattern-init {target}",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
