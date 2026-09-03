"""GitHub review harvesting helpers for pattern-review."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .rules import load_bucket
from .simple_yaml import write_yaml


DEFAULT_QUERY = """\
query(
  $owner: String!,
  $repo: String!,
  $number: Int!,
  $commentsCursor: String,
  $reviewsCursor: String,
  $threadsCursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      url
      title
      state
      createdAt
      updatedAt
      baseRefName
      headRefName
      baseRefOid
      headRefOid
      mergeCommit { oid }
      author { login }
      comments(first: 100, after: $commentsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          url
          body
          createdAt
          updatedAt
          author { login }
        }
      }
      reviews(first: 100, after: $reviewsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          url
          state
          body
          submittedAt
          author { login }
          commit { oid }
        }
      }
      reviewThreads(first: 100, after: $threadsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          startLine
          startDiffSide
          originalLine
          originalStartLine
          resolvedBy { login }
          comments(first: 100) {
            nodes {
              id
              url
              body
              createdAt
              updatedAt
              author { login }
              path
              line
              originalLine
              diffHunk
              commit { oid }
              originalCommit { oid }
            }
          }
        }
      }
    }
  }
}
"""


@dataclass(frozen=True)
class PullRequestRef:
    owner: str
    repo: str
    number: int

    @property
    def slug(self) -> str:
        return f"{self.repo}-{self.number}"

    @property
    def label(self) -> str:
        return f"{self.owner}/{self.repo}#{self.number}"


def parse_pr_ref(value: str) -> PullRequestRef:
    match = re.match(r"^(?:https://github\.com/)?([^/\s]+)/([^/#\s]+)(?:/pull/|#)(\d+)/?$", value)
    if not match:
        raise ValueError(f"PR must look like owner/repo#123 or https://github.com/owner/repo/pull/123: {value}")
    owner, repo, number = match.groups()
    return PullRequestRef(owner=owner, repo=repo, number=int(number))


def harvest_github_reviews(
    pr_values: list[str],
    reviewer: str,
    out_dir: str | Path,
    pattern_dirs: list[str | Path] | None = None,
    raw_dir: str | Path | None = None,
    since: str | None = None,
    only_unresolved: bool = False,
    exclude_outdated: bool = False,
    resume: bool = False,
) -> dict[str, Any]:
    refs = [parse_pr_ref(value) for value in pr_values]
    output = Path(out_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    raw_output = output / "raw"
    raw_output.mkdir(parents=True, exist_ok=True)
    state_path = output / "harvest-state.json"
    previous_state = load_harvest_state(state_path) if resume else {}

    raw_payloads: list[dict[str, Any]] = []
    if raw_dir:
        source = Path(raw_dir).expanduser()
        for ref in refs:
            raw_path = source / f"{ref.slug}.json"
            raw_payloads.append(json.loads(raw_path.read_text()))
            (raw_output / raw_path.name).write_text(json.dumps(raw_payloads[-1], indent=2) + "\n")
    else:
        for ref in refs:
            payload = fetch_pr(ref)
            raw_payloads.append(payload)
            (raw_output / f"{ref.slug}.json").write_text(json.dumps(payload, indent=2) + "\n")

    all_complaints = build_complaints(raw_payloads, reviewer)
    filter_summary = {
        "since": since,
        "onlyUnresolved": only_unresolved,
        "excludeOutdated": exclude_outdated,
        "resume": resume,
    }
    complaints = filter_complaints(
        all_complaints,
        since=since,
        only_unresolved=only_unresolved,
        exclude_outdated=exclude_outdated,
        previous_state=previous_state,
    )
    active_rules = load_active_rules(pattern_dirs or [])
    coverage_records = apply_coverage(complaints, active_rules)
    proposals = build_candidate_proposals(coverage_records, output)

    (output / "complaints.json").write_text(json.dumps({"complaints": complaints}, indent=2) + "\n")
    (output / "coverage-matrix.json").write_text(json.dumps({"complaints": coverage_records}, indent=2) + "\n")
    write_complaints_markdown(output / "complaints.md", complaints, refs, reviewer, filter_summary)
    write_coverage_markdown(output / "coverage-matrix.md", coverage_records)
    write_candidate_proposals_markdown(output / "candidate-rule-proposals.md", proposals)
    write_yaml(output / "proposals.yaml", proposals)
    write_readme(output / "README.md", refs, reviewer, coverage_records, proposals, filter_summary)
    write_harvest_state(state_path, refs, reviewer, all_complaints, filter_summary)

    return {
        "outputDir": str(output),
        "prs": [ref.label for ref in refs],
        "reviewer": reviewer,
        "complaints": len(complaints),
        "totalFetchedComplaints": len(all_complaints),
        "candidateProposals": len(proposals),
        "filters": filter_summary,
        "artifacts": [
            "README.md",
            "raw/",
            "complaints.json",
            "complaints.md",
            "coverage-matrix.json",
            "coverage-matrix.md",
            "candidate-rule-proposals.md",
            "proposals.yaml",
            "harvest-state.json",
        ],
    }


def fetch_pr(ref: PullRequestRef) -> dict[str, Any]:
    comments: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    threads: list[dict[str, Any]] = []
    comments_cursor = None
    reviews_cursor = None
    threads_cursor = None
    pr_meta: dict[str, Any] | None = None

    while True:
        payload = gh_graphql(ref, comments_cursor, reviews_cursor, threads_cursor)
        if payload.get("errors"):
            raise RuntimeError(json.dumps(payload["errors"], indent=2))

        pr = payload["data"]["repository"]["pullRequest"]
        if pr_meta is None:
            pr_meta = {
                key: pr[key]
                for key in (
                    "number",
                    "url",
                    "title",
                    "state",
                    "createdAt",
                    "updatedAt",
                    "baseRefName",
                    "headRefName",
                    "baseRefOid",
                    "headRefOid",
                    "mergeCommit",
                    "author",
                )
            }
            pr_meta["owner"] = ref.owner
            pr_meta["repo"] = ref.repo

        c = pr["comments"]
        r = pr["reviews"]
        t = pr["reviewThreads"]
        comments.extend(c.get("nodes") or [])
        reviews.extend(r.get("nodes") or [])
        threads.extend(t.get("nodes") or [])

        comments_cursor = c["pageInfo"]["endCursor"] if c["pageInfo"]["hasNextPage"] else None
        reviews_cursor = r["pageInfo"]["endCursor"] if r["pageInfo"]["hasNextPage"] else None
        threads_cursor = t["pageInfo"]["endCursor"] if t["pageInfo"]["hasNextPage"] else None
        if not (comments_cursor or reviews_cursor or threads_cursor):
            break

    assert pr_meta is not None
    return {"pullRequest": pr_meta, "conversationComments": comments, "reviews": reviews, "reviewThreads": threads}


def gh_graphql(
    ref: PullRequestRef,
    comments_cursor: str | None = None,
    reviews_cursor: str | None = None,
    threads_cursor: str | None = None,
) -> dict[str, Any]:
    cmd = [
        "gh",
        "api",
        "graphql",
        "-f",
        f"query={DEFAULT_QUERY}",
        "-F",
        f"owner={ref.owner}",
        "-F",
        f"repo={ref.repo}",
        "-F",
        f"number={ref.number}",
    ]
    if comments_cursor:
        cmd.extend(["-F", f"commentsCursor={comments_cursor}"])
    if reviews_cursor:
        cmd.extend(["-F", f"reviewsCursor={reviews_cursor}"])
    if threads_cursor:
        cmd.extend(["-F", f"threadsCursor={threads_cursor}"])

    result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return json.loads(result.stdout)


def build_complaints(raw_payloads: list[dict[str, Any]], reviewer: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for data in raw_payloads:
        pr = data["pullRequest"]
        repo = pr["repo"]
        number = pr["number"]
        for thread_index, thread in enumerate(data["reviewThreads"], start=1):
            reviewer_comments = [
                comment
                for comment in thread["comments"]["nodes"]
                if (comment.get("author") or {}).get("login") == reviewer
            ]
            for comment_index, comment in enumerate(reviewer_comments, start=1):
                body = compact_body(comment.get("body") or "")
                path = comment.get("path") or thread.get("path") or ""
                records.append(
                    {
                        "id": f"{repo}-{number}-T{thread_index:03d}-C{comment_index:02d}",
                        "repo": repo,
                        "pr": number,
                        "prUrl": pr["url"],
                        "threadId": thread["id"],
                        "commentId": comment["id"],
                        "url": comment.get("url"),
                        "createdAt": comment.get("createdAt"),
                        "updatedAt": comment.get("updatedAt"),
                        "path": path,
                        "line": comment.get("line") or thread.get("line"),
                        "originalLine": comment.get("originalLine") or thread.get("originalLine"),
                        "isResolved": thread.get("isResolved"),
                        "isOutdated": thread.get("isOutdated"),
                        "commit": (comment.get("commit") or {}).get("oid"),
                        "originalCommit": (comment.get("originalCommit") or {}).get("oid"),
                        "body": body,
                        "category": category_for(body, path),
                        "diffHunk": comment.get("diffHunk"),
                    }
                )
    records.sort(key=lambda item: (item["repo"], item["createdAt"] or "", item["id"]))
    return records


def filter_complaints(
    complaints: list[dict[str, Any]],
    since: str | None,
    only_unresolved: bool,
    exclude_outdated: bool,
    previous_state: dict[str, Any],
) -> list[dict[str, Any]]:
    since_dt = parse_timestamp(since) if since else None
    seen_comment_ids = set(previous_state.get("seenCommentIds") or [])
    high_water = parse_timestamp(previous_state["highWaterUpdatedAt"]) if previous_state.get("highWaterUpdatedAt") else None
    filtered: list[dict[str, Any]] = []
    for complaint in complaints:
        if only_unresolved and complaint.get("isResolved"):
            continue
        if exclude_outdated and complaint.get("isOutdated"):
            continue
        if since_dt and not timestamp_after(effective_comment_timestamp(complaint), since_dt):
            continue
        if high_water and complaint.get("commentId") in seen_comment_ids and not timestamp_after(effective_comment_timestamp(complaint), high_water):
            continue
        filtered.append(complaint)
    return filtered


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def effective_comment_timestamp(record: dict[str, Any]) -> datetime | None:
    timestamp = record.get("updatedAt") or record.get("createdAt")
    if not timestamp:
        return None
    return parse_timestamp(str(timestamp))


def timestamp_after(value: datetime | None, cutoff: datetime) -> bool:
    return bool(value and value > cutoff)


def load_harvest_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def write_harvest_state(
    path: Path,
    refs: list[PullRequestRef],
    reviewer: str,
    complaints: list[dict[str, Any]],
    filters: dict[str, Any],
) -> None:
    timestamps = [effective_comment_timestamp(complaint) for complaint in complaints]
    high_water = max((timestamp for timestamp in timestamps if timestamp), default=None)
    state = {
        "version": 1,
        "reviewer": reviewer,
        "prs": [ref.label for ref in refs],
        "filters": filters,
        "highWaterUpdatedAt": high_water.isoformat().replace("+00:00", "Z") if high_water else None,
        "seenCommentIds": sorted({str(complaint["commentId"]) for complaint in complaints if complaint.get("commentId")}),
    }
    path.write_text(json.dumps(state, indent=2) + "\n")


def compact_body(body: str) -> str:
    return re.sub(r"\s+", " ", body).strip()


def category_for(text: str, path: str) -> str:
    lower = text.lower()
    if path.endswith(".sql"):
        if "fn_can" in lower or "rights" in lower or "permission" in lower or "allowed" in lower:
            return "sql-permission-prolog"
        if "named" in lower or "name" in lower or "in_requesterid" in lower:
            return "sql-naming"
        if "migration" in lower or "insert" in lower or "seed" in lower:
            return "sql-migration-idempotency"
        return "sql-convention"
    if path.endswith(".vue") or path.endswith(".js") or path.endswith(".ts"):
        if "store" in lower or "$axios" in lower or "pinia" in lower:
            return "client-store-boundary"
        if "test" in lower or "spec" in lower:
            return "test-gap"
        return "code-convention"
    if "test" in lower:
        return "test-gap"
    return "uncategorized"


def load_active_rules(pattern_dirs: list[str | Path]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for pattern_dir in pattern_dirs:
        for rule in load_bucket(pattern_dir, "rules"):
            rules.append(rule)
    return rules


def apply_coverage(complaints: list[dict[str, Any]], active_rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    active_ids = {str(rule.get("id")) for rule in active_rules}
    records: list[dict[str, Any]] = []
    for complaint in complaints:
        record = dict(complaint)
        record["coverage"] = coverage_for(complaint, active_ids)
        records.append(record)
    return records


def coverage_for(record: dict[str, Any], active_ids: set[str]) -> dict[str, Any]:
    body = record["body"].lower()
    path = record["path"] or ""
    category = record["category"]

    candidates = candidate_rule_ids(record)
    active_match = [rule_id for rule_id in candidates if rule_id in active_ids]
    if active_match:
        return {"status": "probably_caught", "ruleIds": active_match, "candidateRule": None, "notes": "Matched an active rule by reviewer-comment heuristic."}

    if "always call stored procedures" in body:
        return {
            "status": "caught" if "backend-db-access-uses-stored-procedures" in active_ids else "not_caught",
            "ruleIds": ["backend-db-access-uses-stored-procedures"] if "backend-db-access-uses-stored-procedures" in active_ids else [],
            "candidateRule": None if "backend-db-access-uses-stored-procedures" in active_ids else "backend-db-access-uses-stored-procedures",
            "notes": "Backend direct database access maps to the stored-procedure boundary rule.",
        }
    if category == "sql-permission-prolog":
        return {
            "status": "probably_caught" if "stored-procedures-check-rights-first" in active_ids else "not_caught",
            "ruleIds": ["stored-procedures-check-rights-first"] if "stored-procedures-check-rights-first" in active_ids else [],
            "candidateRule": None if "stored-procedures-check-rights-first" in active_ids else "stored-procedures-check-rights-first",
            "notes": "SQL rights/prolog comments map to the rights-first stored procedure rule.",
        }
    if "transaction" in body and path.endswith(".sql"):
        return {
            "status": "caught" if "multi-mutation-procedures-own-transaction-boundary" in active_ids else "not_caught",
            "ruleIds": ["multi-mutation-procedures-own-transaction-boundary"] if "multi-mutation-procedures-own-transaction-boundary" in active_ids else [],
            "candidateRule": None if "multi-mutation-procedures-own-transaction-boundary" in active_ids else "multi-mutation-procedures-own-transaction-boundary",
            "notes": "Transaction-boundary comments map to the multi-mutation rule.",
        }

    if candidates:
        return {"status": "not_caught", "ruleIds": [], "candidateRule": candidates[0], "notes": "No active rule matched this heuristic candidate."}
    return {"status": "needs_human_review", "ruleIds": [], "candidateRule": None, "notes": "No obvious reusable rule from comment text alone."}


def candidate_rule_ids(record: dict[str, Any]) -> list[str]:
    body = record["body"].lower()
    path = record["path"] or ""
    category = record["category"]
    candidates: list[str] = []

    is_client_surface = record["repo"] == "client" or path.startswith("public/")
    if is_client_surface:
        if category == "client-store-boundary" or "stores module" in body or "store module" in body:
            candidates.append("client-api-access-through-stores")
        if "duplicate the backend" in body or "duplicating backend" in body:
            candidates.append("client-stores-must-not-duplicate-backend-domain-logic")
        if "different organization" in body:
            candidates.append("client-data-access-must-respect-backend-scope-boundaries")
        if "temp files" in body:
            candidates.append("client-tests-clean-up-generated-temp-files")
        if "errors handled" in body or "error handling" in body or "alerts on errors" in body:
            candidates.append("client-remote-error-handling-must-be-explicit")
        return candidates

    if path == "openapi.yaml" and "security" in body:
        candidates.append("openapi-security-opt-out-only-for-public-endpoints")
    if path == "openapi.yaml" and "named component" in body:
        candidates.append("openapi-parameters-and-request-bodies-use-components")
    if category == "sql-naming" or "pr_retire" in body:
        candidates.append("sql-procedure-naming-follows-local-verbs-and-arguments")
    if "support functions should be at the bottom" in body or '"rights" functions belong at the bottom' in body:
        candidates.append("sql-support-functions-live-at-bottom")
    if "sql object" in body or "transforms" in body or "utils" in body:
        candidates.append("handler-helpers-use-utils-and-transforms-layout")
    if "commentary" in body or "belongs in openapi.yaml" in body:
        candidates.append("implementation-comments-do-not-duplicate-api-docs")
    if "retired" in body and "false" in body:
        candidates.append("migration-upserts-explicitly-unretire-seed-rows")
    return candidates


def build_candidate_proposals(records: list[dict[str, Any]], out_dir: Path) -> list[dict[str, Any]]:
    by_rule: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        rule_id = record["coverage"].get("candidateRule")
        if rule_id:
            by_rule.setdefault(rule_id, []).append(record)

    return [proposal_for(rule_id, items, out_dir) for rule_id, items in sorted(by_rule.items())]


def proposal_for(rule_id: str, items: list[dict[str, Any]], out_dir: Path) -> dict[str, Any]:
    first = items[0]
    title = rule_id.replace("-", " ").capitalize()
    description = f"Review recurring feedback cluster `{rule_id}` before human review."
    severity = "warning"
    scope_paths = sorted({item["path"] for item in items if item.get("path")}) or ["**/*"]
    if any("scope" in item["body"].lower() or "organization" in item["body"].lower() for item in items):
        severity = "blocker"
    if rule_id in ("client-api-access-through-stores", "client-data-access-must-respect-backend-scope-boundaries"):
        severity = "blocker"

    evidence = [
        {
            "path": str(out_dir / "complaints.md"),
            "sourceText": f"{item['id']}: {item['body']}",
            "sourceBoundary": "complaint",
        }
        for item in items[:8]
    ]
    proposal = {
        "type": "new_rule",
        "id": rule_id,
        "title": title,
        "description": description,
        "rationale": f"Harvested from {len(items)} reviewer comment(s), starting with {first['id']}.",
        "scope": {"paths": scope_paths},
        "trigger": {"mode": "agentic", "description": f"Trigger when changes touch the harvested feedback area for {rule_id}."},
        "severity": severity,
        "review": {"mode": "agentic", "instructions": f"Inspect changed code for the reviewer feedback pattern represented by `{rule_id}` and record file-specific evidence for any finding."},
        "evidence": {"instructionFiles": evidence, "sourceSummary": f"Harvested from {len(items)} reviewer comment(s)."},
        "provenance": {
            "extractedBy": "pattern-harvest",
            "target": {"path": "."},
            "evaluation": {"path": str(out_dir)},
            "complaints": [item["id"] for item in items],
            "githubReviewComments": [
                {
                    "pr": f"{item['repo']}#{item['pr']}",
                    "threadId": item.get("threadId"),
                    "commentId": item.get("commentId"),
                    "url": item.get("url"),
                    "isResolved": item.get("isResolved"),
                    "isOutdated": item.get("isOutdated"),
                }
                for item in items
            ],
        },
        "examples": {"good": "The change follows the established local pattern and explains any intentional exception.", "bad": first["body"]},
    }
    return proposal


def write_complaints_markdown(
    path: Path,
    records: list[dict[str, Any]],
    refs: list[PullRequestRef],
    reviewer: str,
    filters: dict[str, Any],
) -> None:
    lines = [
        "# GitHub Review Complaint Corpus",
        "",
        f"Reviewer: `{reviewer}`",
        "",
        "PRs:",
        "",
        *[f"- {ref.label}" for ref in refs],
        "",
        "Filters:",
        "",
        *[f"- **{key}:** `{value}`" for key, value in filters.items()],
        "",
        "## Summary",
        "",
    ]
    counts = count_by(records, "repo")
    lines.extend(markdown_count_table("Group", counts))
    lines.append("")
    lines.extend(markdown_count_table("Category", count_by(records, "category")))
    lines.extend(["", "## Complaints", ""])
    for record in records:
        lines.extend(record_markdown(record))
    path.write_text("\n".join(lines) + "\n")


def write_coverage_markdown(path: Path, records: list[dict[str, Any]]) -> None:
    lines = [
        "# Pattern Coverage Matrix",
        "",
        "This is a heuristic first-pass coverage judgment. Use historical replay and human review before treating it as final.",
        "",
        "## Status Counts",
        "",
    ]
    lines.extend(markdown_count_table("Status", count_by([r["coverage"] for r in records], "status")))
    lines.extend(["", "## Matrix", "", "| ID | PR | Category | Coverage | Rule IDs | Candidate Rule | Complaint |", "|---|---|---|---|---|---|---|"])
    for record in records:
        cov = record["coverage"]
        body = record["body"].replace("|", "\\|")
        if len(body) > 140:
            body = body[:137] + "..."
        lines.append(
            f"| {record['id']} | {record['repo']}#{record['pr']} | {record['category']} | {cov['status']} | "
            f"{', '.join(cov['ruleIds']) or '-'} | {cov.get('candidateRule') or '-'} | {body} |"
        )
    path.write_text("\n".join(lines) + "\n")


def write_candidate_proposals_markdown(path: Path, proposals: list[dict[str, Any]]) -> None:
    lines = [
        "# Candidate Rule Proposals",
        "",
        "These are proposal drafts created by `pattern-harvest`. They are not active rules and should go through `pattern-promote`.",
        "",
    ]
    for proposal in proposals:
        evidence = (proposal.get("evidence") or {}).get("instructionFiles") or []
        lines.extend([f"## {proposal['id']}", "", f"- **Title:** {proposal['title']}", f"- **Evidence count:** {len(evidence)}", "- **Evidence:**"])
        for item in evidence:
            lines.append(f"  - {item['sourceText']}")
        lines.append("")
    path.write_text("\n".join(lines))


def write_readme(
    path: Path,
    refs: list[PullRequestRef],
    reviewer: str,
    records: list[dict[str, Any]],
    proposals: list[dict[str, Any]],
    filters: dict[str, Any],
) -> None:
    lines = [
        "# Pattern Harvest Evaluation",
        "",
        f"Reviewer: `{reviewer}`",
        "",
        "PRs:",
        "",
        *[f"- {ref.label}" for ref in refs],
        "",
        "## Artifacts",
        "",
        "- `raw/*.json` - raw thread-aware GitHub data.",
        "- `complaints.json` / `complaints.md` - normalized reviewer comments.",
        "- `coverage-matrix.json` / `coverage-matrix.md` - heuristic coverage matrix.",
        "- `candidate-rule-proposals.md` - human-readable proposal drafts.",
        "- `proposals.yaml` - structured proposal drafts suitable for review before copying into a `.pattern-review/proposals.yaml` bucket.",
        "- `harvest-state.json` - high-water state for `--resume` runs.",
        "",
        "## Counts",
        "",
        f"- Complaints: {len(records)}",
        f"- Candidate proposals: {len(proposals)}",
        "",
        "## Filters",
        "",
        *[f"- **{key}:** `{value}`" for key, value in filters.items()],
        "",
    ]
    path.write_text("\n".join(lines))


def record_markdown(record: dict[str, Any]) -> list[str]:
    return [
        f"### {record['id']} - {record['category']}",
        "",
        f"- **PR:** {record['repo']}#{record['pr']}",
        f"- **Path:** `{record['path']}`",
        f"- **Line:** {record['line'] or record['originalLine'] or '-'}",
        f"- **Created:** {record['createdAt']}",
        f"- **Updated:** {record['updatedAt'] or '-'}",
        f"- **Resolved:** {record['isResolved']}",
        f"- **Outdated:** {record['isOutdated']}",
        f"- **Thread ID:** `{record['threadId']}`",
        f"- **Comment ID:** `{record['commentId']}`",
        f"- **Original commit:** `{record['originalCommit'] or '-'}`",
        f"- **Comment:** {record['url']}",
        "",
        record["body"],
        "",
    ]


def count_by(records: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for record in records:
        value = str(record.get(key) or "")
        counts[value] = counts.get(value, 0) + 1
    return counts


def markdown_count_table(label: str, counts: dict[str, int]) -> list[str]:
    lines = [f"| {label} | Count |", "|---|---:|"]
    for key, count in sorted(counts.items()):
        lines.append(f"| {key} | {count} |")
    return lines
