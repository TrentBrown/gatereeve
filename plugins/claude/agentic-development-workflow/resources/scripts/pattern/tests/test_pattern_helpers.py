#!/usr/bin/env python3
"""Reusable tests for deterministic pattern-review helpers."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from pattern.buckets import move_proposal, upsert_rule
from pattern.harvest import harvest_github_reviews, parse_pr_ref
from pattern.learning_events import load_events, unprocessed_events
from pattern.rules import deterministic_trigger, discover_pattern_dirs, effective_rules, load_bucket, validate_rule_shape
from pattern.simple_yaml import load_yaml, write_yaml
from pattern.status import pattern_status


SCRIPT_ROOT = Path(__file__).resolve().parents[2]
TOOL = SCRIPT_ROOT / "pattern_tool.py"


class PatternHelperTests(unittest.TestCase):
    def test_canonical_yaml_is_independent_of_optional_pyyaml(self) -> None:
        class UnexpectedYaml:
            @staticmethod
            def safe_load(text: str) -> object:
                raise AssertionError("canonical subset should not call PyYAML")

            @staticmethod
            def safe_dump(value: object, sort_keys: bool = False) -> str:
                raise AssertionError("canonical output should not call PyYAML")

        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            sys.modules, {"yaml": UnexpectedYaml}
        ):
            path = Path(tmp) / "values.yaml"
            write_yaml(path, [{"id": "stable", "paths": ["**/*"]}])
            self.assertEqual(
                load_yaml(path),
                [{"id": "stable", "paths": ["**/*"]}],
            )
            self.assertIn('id: "stable"', path.read_text())

    def test_yaml_round_trip_for_rule_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules.yaml"
            data = [
                {
                    "id": "example-rule",
                    "title": "Example rule",
                    "trigger": {"mode": "diff", "addedContains": ["DEBUG STARTUP"]},
                    "review": {"mode": "agentic", "instructions": "Check debug marker."},
                    "severity": "blocker",
                }
            ]
            write_yaml(path, data)
            self.assertEqual(load_yaml(path), data)

    def test_yaml_round_trip_unescapes_json_quoted_strings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules.yaml"
            data = [
                {
                    "id": "unicode-rule",
                    "description": "Use an em dash — and security: [{}].",
                    "scope": {"paths": ["**/*"]},
                }
            ]

            write_yaml(path, data)
            self.assertEqual(load_yaml(path), data)

    def test_rule_discovery_precedence_and_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "client"
            child = repo / "src"
            parent_pattern = root / ".pattern-review"
            repo_pattern = repo / ".pattern-review"
            child.mkdir(parents=True)
            parent_pattern.mkdir()
            repo_pattern.mkdir()
            write_yaml(
                parent_pattern / "rules.yaml",
                [
                    {
                        "id": "shared-rule",
                        "title": "Parent title",
                        "description": "parent",
                        "scope": {"paths": ["**/*.js"]},
                        "trigger": {"mode": "path", "paths": ["**/*.js"]},
                        "severity": "warning",
                        "review": {"mode": "agentic", "instructions": "parent"},
                    }
                ],
            )
            write_yaml(
                repo_pattern / "rules.yaml",
                [
                    {
                        "id": "shared-rule",
                        "title": "Repo title",
                        "description": "repo",
                        "scope": {"paths": ["src/*.js"]},
                        "trigger": {"mode": "path", "paths": ["src/*.js"]},
                        "severity": "blocker",
                        "review": {"mode": "agentic", "instructions": "repo"},
                    }
                ],
            )

            pattern_dirs = discover_pattern_dirs(["src/app.js"], repo)
            rules, overrides = effective_rules(pattern_dirs)

            self.assertEqual(rules[0]["title"], "Repo title")
            self.assertEqual(rules[0]["severity"], "blocker")
            self.assertEqual(overrides[0]["id"], "shared-rule")

    def test_learning_event_idempotence_uses_lifecycle_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            issue_dir = root / "docs" / "issues" / "branch"
            events_dir = issue_dir / "learning-events"
            pattern_dir = root / ".pattern-review"
            events_dir.mkdir(parents=True)
            pattern_dir.mkdir()
            write_yaml(
                events_dir / "judge.yaml",
                {
                    "events": [
                        {
                            "id": "event-1",
                            "source": {"type": "judge", "producer": "judge"},
                            "finding": {"summary": "Finding", "severity": "warning"},
                            "evidence": {"files": [{"path": "a.js", "line": 1}]},
                        }
                    ]
                },
            )
            event = load_events(issue_dir)[0]
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {
                        "id": "proposal-1",
                        "provenance": {
                            "learningEvents": [
                                {"id": event["id"], "fingerprint": event["fingerprint"]}
                            ]
                        },
                    }
                ],
            )

            pending, skipped = unprocessed_events(issue_dir, pattern_dir)

            self.assertEqual(pending, [])
            self.assertEqual(skipped[0]["id"], "event-1")

    def test_bucket_move_and_rule_upsert(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pattern_dir = Path(tmp) / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(pattern_dir / "proposals.yaml", [{"id": "p1", "title": "Proposal"}])

            move_proposal(
                pattern_dir,
                "p1",
                "deferred",
                {"id": "p1", "title": "Proposal", "decision": {"reason": "later"}},
            )
            upsert_rule(pattern_dir, {"id": "r1", "title": "Rule v1"})
            upsert_rule(pattern_dir, {"id": "r1", "title": "Rule v2"})

            self.assertEqual(load_bucket(pattern_dir, "proposals"), [])
            self.assertEqual(load_bucket(pattern_dir, "deferred")[0]["decision"]["reason"], "later")
            self.assertEqual(load_bucket(pattern_dir, "rules")[0]["title"], "Rule v2")

    def test_pattern_init_creates_lifecycle_files_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()

            output = run(["python3", str(TOOL), "init", str(repo)], repo)
            data = json.loads(output)
            pattern_dir = repo / ".pattern-review"

            self.assertEqual(Path(data["patternDir"]).resolve(), pattern_dir.resolve())
            for name in ("rules", "proposals", "deferred", "rejected"):
                self.assertEqual(load_yaml(pattern_dir / f"{name}.yaml"), [])
            self.assertTrue((pattern_dir / "README.md").exists())

            write_yaml(pattern_dir / "rules.yaml", [{"id": "existing"}])
            output = run(["python3", str(TOOL), "init", str(repo)], repo)
            data = json.loads(output)

            self.assertEqual(load_yaml(pattern_dir / "rules.yaml"), [{"id": "existing"}])
            existing = {Path(path).resolve() for path in data["existing"]}
            self.assertIn((pattern_dir / "rules.yaml").resolve(), existing)

    def test_review_inputs_fails_without_pattern_scope(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            run(["git", "init", "-q"], repo)
            run(["git", "checkout", "-b", "base", "-q"], repo)
            (repo / "app.js").write_text("initial\n")
            run(["git", "add", "."], repo)
            run(["git", "commit", "-q", "-m", "init"], repo)
            run(["git", "checkout", "-b", "feature", "-q"], repo)
            (repo / "app.js").write_text("changed\n")
            run(["git", "add", "app.js"], repo)
            run(["git", "commit", "-q", "-m", "change"], repo)

            result = subprocess.run(
                ["python3", str(TOOL), "review-inputs", "--cwd", str(repo), "--base", "base", "--home", str(repo / "no-home")],
                cwd=str(repo),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("No applicable .pattern-review directory found", result.stderr)
            self.assertIn("/pattern-init", result.stderr)

    def test_explicit_pattern_dir_commands_fail_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / ".pattern-review"
            issue_dir = Path(tmp) / "docs" / "issues" / "branch"
            issue_dir.mkdir(parents=True)

            for command in (
                ["python3", str(TOOL), "audit-rules", str(missing)],
                ["python3", str(TOOL), "event-inventory", str(issue_dir), str(missing)],
            ):
                result = subprocess.run(
                    command,
                    cwd=tmp,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                )

                self.assertEqual(result.returncode, 2)
                self.assertIn("No applicable .pattern-review directory found", result.stderr)
                self.assertIn("/pattern-init", result.stderr)

    def test_explicit_pattern_dir_commands_report_pattern_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            issue_dir = root / "docs" / "issues" / "branch"
            events_dir = issue_dir / "learning-events"
            pattern_dir.mkdir()
            events_dir.mkdir(parents=True)
            write_yaml(pattern_dir / "rules.yaml", [])

            audit = json.loads(run(["python3", str(TOOL), "audit-rules", str(pattern_dir)], root))
            inventory = json.loads(run(["python3", str(TOOL), "event-inventory", str(issue_dir), str(pattern_dir)], root))

            self.assertEqual(Path(audit["patternDir"]).resolve(), pattern_dir.resolve())
            self.assertEqual(Path(inventory["patternDir"]).resolve(), pattern_dir.resolve())

    def test_normalize_buckets_quotes_yaml_sensitive_scalars(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            proposal = pattern_dir / "proposals.yaml"
            proposal.write_text(
                "- type: new_rule\n"
                "  id: yaml-sensitive\n"
                "  extractedAt: 2026-07-04\n"
                "  paths:\n"
                "    - **/*\n"
                "  description: New endpoints may specify security: [{}].\n"
            )

            output = run(["python3", str(TOOL), "normalize-buckets", str(pattern_dir)], root)
            data = json.loads(output)

            self.assertEqual(Path(data["patternDir"]).resolve(), pattern_dir.resolve())
            normalized = proposal.read_text()
            self.assertIn('"**/*"', normalized)
            self.assertIn('"2026-07-04"', normalized)
            self.assertIn('"New endpoints may specify security: [{}]."', normalized)
            self.assertEqual(load_yaml(proposal)[0]["description"], "New endpoints may specify security: [{}].")

    def test_audit_rejects_non_string_diff_trigger_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(
                pattern_dir / "rules.yaml",
                [
                    {
                        "id": "bad-diff-trigger",
                        "title": "Bad diff trigger",
                        "description": "Malformed diff trigger.",
                        "scope": {"paths": ["openapi.yaml"]},
                        "trigger": {"mode": "diff", "addedContains": [{"security": ""}]},
                        "severity": "blocker",
                        "review": {"mode": "agentic", "instructions": "Review security opt-outs."},
                    }
                ],
            )

            result = subprocess.run(
                ["python3", str(TOOL), "audit-rules", str(pattern_dir)],
                cwd=str(root),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            data = json.loads(result.stdout)

            self.assertEqual(result.returncode, 1)
            self.assertEqual(data["status"], "FAIL")
            self.assertIn("trigger.addedContains[0] must be a string", data["findings"][0]["failures"])

    def test_diff_trigger_matches_quoted_yaml_sensitive_scalar(self) -> None:
        rule = {
            "id": "security-opt-out",
            "title": "Security opt-out",
            "description": "Catch OpenAPI security opt-outs.",
            "scope": {"paths": ["openapi.yaml"]},
            "trigger": {"mode": "diff", "addedContains": ["security:", "- {}"]},
            "severity": "blocker",
            "review": {"mode": "agentic", "instructions": "Review public endpoint intent."},
        }

        self.assertEqual(validate_rule_shape(rule), [])
        result, rationale = deterministic_trigger(rule, ["openapi.yaml"], {"openapi.yaml": ["    security:", "      - {}"]})

        self.assertTrue(result)
        self.assertIn("openapi.yaml", rationale)

    def test_harvest_parses_pr_refs(self) -> None:
        shorthand = parse_pr_ref("example-org/client#689")
        url = parse_pr_ref("https://github.com/example-org/webservices/pull/970/")

        self.assertEqual(shorthand.owner, "example-org")
        self.assertEqual(shorthand.repo, "client")
        self.assertEqual(shorthand.number, 689)
        self.assertEqual(url.repo, "webservices")
        self.assertEqual(url.number, 970)

    def test_harvest_github_reviews_from_raw_writes_artifacts_and_proposals(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw_dir = root / "raw-input"
            out_dir = root / "harvest"
            pattern_dir = root / ".pattern-review"
            raw_dir.mkdir()
            pattern_dir.mkdir()
            write_yaml(
                pattern_dir / "rules.yaml",
                [
                    {
                        "id": "client-api-access-through-stores",
                        "title": "Client API access must go through stores",
                        "description": "Existing active rule.",
                        "scope": {"paths": ["public/**/*.vue"]},
                        "trigger": {"mode": "diff", "addedContains": ["$axios"]},
                        "severity": "blocker",
                        "review": {"mode": "agentic", "instructions": "Review direct API access."},
                    }
                ],
            )
            (raw_dir / "client-689.json").write_text(json.dumps(sample_harvest_payload()) + "\n")

            result = harvest_github_reviews(
                ["example-org/client#689"],
                "gregqpro",
                out_dir,
                [pattern_dir],
                raw_dir=raw_dir,
            )
            complaints = json.loads((out_dir / "complaints.json").read_text())["complaints"]
            coverage = json.loads((out_dir / "coverage-matrix.json").read_text())["complaints"]
            proposals = load_yaml(out_dir / "proposals.yaml")

            self.assertEqual(result["complaints"], 2)
            self.assertEqual(len(complaints), 2)
            self.assertEqual(coverage[0]["coverage"]["ruleIds"], ["client-api-access-through-stores"])
            self.assertEqual(coverage[1]["coverage"]["candidateRule"], "client-remote-error-handling-must-be-explicit")
            self.assertEqual(proposals[0]["id"], "client-remote-error-handling-must-be-explicit")
            self.assertEqual(proposals[0]["provenance"]["githubReviewComments"][0]["commentId"], "comment-2")
            self.assertEqual(proposals[0]["provenance"]["githubReviewComments"][0]["threadId"], "thread-2")
            self.assertTrue((out_dir / "README.md").exists())
            self.assertTrue((out_dir / "candidate-rule-proposals.md").exists())
            self.assertTrue((out_dir / "harvest-state.json").exists())

    def test_harvest_filters_and_resume_are_deterministic_from_raw(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw_dir = root / "raw-input"
            out_dir = root / "harvest"
            raw_dir.mkdir()
            payload = sample_harvest_payload()
            payload["reviewThreads"][1]["isResolved"] = True
            payload["reviewThreads"][1]["isOutdated"] = True
            (raw_dir / "client-689.json").write_text(json.dumps(payload) + "\n")

            result = harvest_github_reviews(
                ["example-org/client#689"],
                "gregqpro",
                out_dir,
                raw_dir=raw_dir,
                since="2026-06-01T01:30:00Z",
            )
            complaints = json.loads((out_dir / "complaints.json").read_text())["complaints"]

            self.assertEqual(result["totalFetchedComplaints"], 2)
            self.assertEqual(result["complaints"], 1)
            self.assertEqual(complaints[0]["commentId"], "comment-2")

            result = harvest_github_reviews(
                ["example-org/client#689"],
                "gregqpro",
                out_dir,
                raw_dir=raw_dir,
                only_unresolved=True,
                exclude_outdated=True,
            )
            complaints = json.loads((out_dir / "complaints.json").read_text())["complaints"]

            self.assertEqual(result["complaints"], 1)
            self.assertEqual(complaints[0]["commentId"], "comment-1")

            first_resume = harvest_github_reviews(
                ["example-org/client#689"],
                "gregqpro",
                out_dir,
                raw_dir=raw_dir,
                resume=True,
            )
            second_resume = harvest_github_reviews(
                ["example-org/client#689"],
                "gregqpro",
                out_dir,
                raw_dir=raw_dir,
                resume=True,
            )

            self.assertEqual(first_resume["complaints"], 0)
            self.assertEqual(second_resume["complaints"], 0)
            state = json.loads((out_dir / "harvest-state.json").read_text())
            self.assertEqual(state["seenCommentIds"], ["comment-1", "comment-2"])

    def test_pattern_status_reports_scope_counts_and_next_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            harvest_dir = root / "harvest"
            pattern_dir.mkdir()
            harvest_dir.mkdir()
            write_yaml(
                pattern_dir / "rules.yaml",
                [
                    {
                        "id": "active-rule",
                        "title": "Active rule",
                        "description": "Active rule description.",
                        "scope": {"paths": ["src/**/*.js"]},
                        "trigger": {"mode": "path", "paths": ["src/**/*.js"]},
                        "severity": "warning",
                        "review": {"mode": "agentic", "instructions": "Review source files."},
                    }
                ],
            )
            write_yaml(pattern_dir / "proposals.yaml", [{"id": "proposal-rule", "title": "Proposal"}])
            write_yaml(pattern_dir / "deferred.yaml", [])
            write_yaml(pattern_dir / "rejected.yaml", [])
            (harvest_dir / "harvest-state.json").write_text(
                json.dumps(
                    {
                        "version": 1,
                        "reviewer": "gregqpro",
                        "prs": ["example-org/client#689"],
                        "highWaterUpdatedAt": "2026-07-06T21:41:48Z",
                        "seenCommentIds": ["comment-1", "comment-2"],
                        "filters": {"resume": True},
                    }
                )
                + "\n"
            )

            status = pattern_status(root, [pattern_dir], harvest_dirs=[harvest_dir])

            self.assertEqual(status["status"], "READY")
            self.assertEqual(status["nextCommand"], "pattern-promote")
            self.assertEqual(status["scopes"][0]["buckets"]["rules"]["count"], 1)
            self.assertEqual(status["scopes"][0]["buckets"]["proposals"]["count"], 1)
            self.assertEqual(status["harvestStates"][0]["seenCommentCount"], 2)
            self.assertEqual(status["harvestStates"][0]["highWaterUpdatedAt"], "2026-07-06T21:41:48Z")

    def test_pattern_status_reports_audit_failures_and_cli_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(pattern_dir / "rules.yaml", [{"id": "bad-rule", "title": "Bad"}])
            write_yaml(pattern_dir / "proposals.yaml", [])
            write_yaml(pattern_dir / "deferred.yaml", [])
            write_yaml(pattern_dir / "rejected.yaml", [])

            output = run(["python3", str(TOOL), "status", "--pattern-dir", str(pattern_dir), "--out", "status/report.md"], root)
            status = json.loads(output)

            self.assertEqual(status["status"], "NEEDS_ATTENTION")
            self.assertEqual(status["nextCommand"], "pattern-audit")
            self.assertEqual(status["scopes"][0]["audit"]["status"], "FAIL")
            self.assertIn("missing description", status["scopes"][0]["audit"]["findings"][0]["failures"])
            self.assertEqual(Path(status["report"]["markdown"]).resolve(), (root / "status" / "report.md").resolve())
            self.assertEqual(Path(status["report"]["html"]).resolve(), (root / "status" / "report.html").resolve())
            self.assertIn("# Pattern Status", (root / "status" / "report.md").read_text())
            self.assertIn("<h1>Pattern Status</h1>", (root / "status" / "report.html").read_text())

    def test_pattern_status_positional_target_discovers_descendant_scopes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            client_pattern = root / "client" / ".pattern-review"
            webservices_pattern = root / "webservices" / ".pattern-review"
            client_pattern.mkdir(parents=True)
            webservices_pattern.mkdir(parents=True)
            for pattern_dir, rule_id in ((client_pattern, "client-rule"), (webservices_pattern, "webservices-rule")):
                write_yaml(
                    pattern_dir / "rules.yaml",
                    [
                        {
                            "id": rule_id,
                            "title": "Rule",
                            "description": "Rule description.",
                            "scope": {"paths": ["**/*"]},
                            "trigger": {"mode": "always"},
                            "severity": "warning",
                            "review": {"mode": "agentic", "instructions": "Review it."},
                        }
                    ],
                )
                write_yaml(pattern_dir / "proposals.yaml", [])
                write_yaml(pattern_dir / "deferred.yaml", [])
                write_yaml(pattern_dir / "rejected.yaml", [])

            output = run(
                [
                    "python3",
                    str(TOOL),
                    "status",
                    str(root),
                    "--include-descendants",
                    "--out",
                    "pattern-status/status.md",
                ],
                root,
            )
            status = json.loads(output)

            self.assertEqual(status["status"], "READY")
            self.assertEqual(len(status["scopes"]), 2)
            self.assertEqual(Path(status["report"]["markdown"]).resolve(), (root / "pattern-status" / "status.md").resolve())
            self.assertEqual(Path(status["report"]["html"]).resolve(), (root / "pattern-status" / "status.html").resolve())
            markdown = (root / "pattern-status" / "status.md").read_text()
            self.assertIn("client/.pattern-review", markdown)
            self.assertIn("webservices/.pattern-review", markdown)

    def test_promote_accept_moves_proposal_to_rules(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            for name in ("deferred", "rejected"):
                write_yaml(pattern_dir / f"{name}.yaml", [])
            write_yaml(pattern_dir / "rules.yaml", [])
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {
                        "type": "new_rule",
                        "id": "new-rule",
                        "title": "New rule",
                        "description": "Rule description.",
                        "scope": {"paths": ["**/*"]},
                        "trigger": {"mode": "always"},
                        "severity": "warning",
                        "review": {"mode": "agentic", "instructions": "Review it."},
                        "provenance": {"extractedBy": "pattern-extract"},
                    }
                ],
            )

            output = run(
                [
                    "python3",
                    str(TOOL),
                    "promote",
                    str(pattern_dir),
                    "new-rule",
                    "accept",
                    "--now",
                    "2026-07-04T00:00:00Z",
                ],
                root,
            )
            data = json.loads(output)
            rules = load_yaml(pattern_dir / "rules.yaml")

            self.assertEqual(data["counts"]["rules"], 1)
            self.assertEqual(data["counts"]["proposals"], 0)
            self.assertEqual(rules[0]["id"], "new-rule")
            self.assertNotIn("type", rules[0])
            self.assertEqual(rules[0]["provenance"]["promotedAt"], "2026-07-04T00:00:00Z")
            self.assertEqual(rules[0]["provenance"]["promotedBy"], "pattern-promote")
            self.assertEqual(load_yaml(pattern_dir / "proposals.yaml"), [])

    def test_promote_accept_rejects_duplicate_new_rule(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(pattern_dir / "rules.yaml", [{"id": "new-rule", "title": "Existing"}])
            write_yaml(pattern_dir / "proposals.yaml", [{"type": "new_rule", "id": "new-rule", "title": "Duplicate"}])

            result = subprocess.run(
                ["python3", str(TOOL), "promote", str(pattern_dir), "new-rule", "accept"],
                cwd=str(root),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("rule already exists: new-rule", result.stderr)
            self.assertEqual(load_yaml(pattern_dir / "proposals.yaml")[0]["id"], "new-rule")

    def test_promote_reject_and_defer_move_to_lifecycle_buckets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(pattern_dir / "rules.yaml", [])
            write_yaml(pattern_dir / "deferred.yaml", [])
            write_yaml(pattern_dir / "rejected.yaml", [])
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {"type": "new_rule", "id": "reject-me", "title": "Reject me"},
                    {"type": "new_rule", "id": "defer-me", "title": "Defer me"},
                ],
            )

            reject_output = run(
                [
                    "python3",
                    str(TOOL),
                    "promote",
                    str(pattern_dir),
                    "reject-me",
                    "reject",
                    "--reason",
                    "already covered",
                    "--now",
                    "2026-07-04T00:00:00Z",
                ],
                root,
            )
            defer_output = run(
                [
                    "python3",
                    str(TOOL),
                    "promote",
                    str(pattern_dir),
                    "defer-me",
                    "defer",
                    "--reason",
                    "needs owner review",
                    "--now",
                    "2026-07-04T00:00:01Z",
                ],
                root,
            )

            self.assertEqual(json.loads(reject_output)["counts"]["rejected"], 1)
            self.assertEqual(json.loads(defer_output)["counts"]["deferred"], 1)
            self.assertEqual(load_yaml(pattern_dir / "proposals.yaml"), [])
            self.assertEqual(load_yaml(pattern_dir / "rejected.yaml")[0]["decision"]["reason"], "already covered")
            self.assertEqual(load_yaml(pattern_dir / "deferred.yaml")[0]["decision"]["reason"], "needs owner review")

    def test_promote_show_writes_packet_for_first_proposal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {
                        "type": "new_rule",
                        "id": "show-me",
                        "title": "Show me",
                        "description": "Display this proposal.",
                        "rationale": "Because the source guidance says so.",
                        "severity": "warning",
                        "scope": {"paths": ["src/**/*.js"]},
                        "trigger": {"mode": "path", "description": "When source files change."},
                        "evidence": {
                            "instructionFiles": [
                                {
                                    "path": "AGENTS.md",
                                    "line": 12,
                                    "sourceText": "Use the established pattern.",
                                    "sourceBoundary": "line",
                                }
                            ],
                            "sourceSummary": "Source summary should stay near the top.",
                        },
                    }
                ],
            )

            output = run(["python3", str(TOOL), "promote-show", str(pattern_dir)], root)
            data = json.loads(output)
            html_packet = Path(data["htmlPacket"])
            markdown_packet = Path(data["markdownPacket"])
            html_text = html_packet.read_text()
            markdown_text = markdown_packet.read_text()

            self.assertEqual(data["proposalId"], "show-me")
            self.assertEqual(Path(data["packet"]).resolve(), (pattern_dir / "promotion" / "current.html").resolve())
            self.assertEqual(html_packet.resolve(), (pattern_dir / "promotion" / "current.html").resolve())
            self.assertEqual(markdown_packet.resolve(), (pattern_dir / "promotion" / "current.md").resolve())
            self.assertIn("<h1>Show me</h1>", html_text)
            self.assertIn("<h2>Description</h2>", html_text)
            self.assertLess(html_text.index("<h2>Source Summary</h2>"), html_text.index("<h2>Examples</h2>"))
            self.assertIn("Source summary should stay near the top.", html_text)
            self.assertIn("<h2>Scope, Trigger, And Review</h2>", html_text)
            self.assertIn("Scope paths", html_text)
            self.assertIn("src/**/*.js", html_text)
            self.assertIn("Trigger mode", html_text)
            self.assertIn("Trigger paths", html_text)
            self.assertIn("Trigger diff criteria", html_text)
            self.assertIn("Trigger description", html_text)
            self.assertIn("When source files change.", html_text)
            self.assertIn("<summary>Raw YAML</summary>", html_text)
            self.assertIn("<summary>Source Evidence</summary>", html_text)
            self.assertIn("AGENTS.md:12", html_text)
            self.assertIn("Use the established pattern.", html_text)
            self.assertIn("# Pattern Promotion Packet: Show me", markdown_text)
            self.assertIn("## Structured Proposal", markdown_text)
            self.assertIn('id: "show-me"', markdown_text)
            self.assertIn("## Source Evidence", markdown_text)

    def test_promote_show_supports_selected_proposal_and_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {"type": "new_rule", "id": "first", "title": "First"},
                    {"type": "new_rule", "id": "second", "title": "Second"},
                ],
            )

            output = run(
                [
                    "python3",
                    str(TOOL),
                    "promote-show",
                    str(pattern_dir),
                    "second",
                    "--out",
                    "promotion/second.md",
                ],
                root,
            )
            data = json.loads(output)
            html_packet = Path(data["htmlPacket"])
            markdown_packet = Path(data["markdownPacket"])

            self.assertEqual(data["proposalId"], "second")
            self.assertEqual(Path(data["packet"]).resolve(), (pattern_dir / "promotion" / "second.html").resolve())
            self.assertEqual(html_packet.resolve(), (pattern_dir / "promotion" / "second.html").resolve())
            self.assertEqual(markdown_packet.resolve(), (pattern_dir / "promotion" / "second.md").resolve())
            self.assertIn("Proposal id: `second`", markdown_packet.read_text())

    def test_promote_show_highlights_diff_trigger_criteria(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pattern_dir = root / ".pattern-review"
            pattern_dir.mkdir()
            write_yaml(
                pattern_dir / "proposals.yaml",
                [
                    {
                        "type": "new_rule",
                        "id": "diff-trigger",
                        "title": "Diff trigger",
                        "trigger": {"mode": "diff", "addedContains": ["DEBUG STARTUP"], "addedRegex": ["Temp"]},
                    }
                ],
            )

            output = run(["python3", str(TOOL), "promote-show", str(pattern_dir)], root)
            data = json.loads(output)
            html_text = Path(data["htmlPacket"]).read_text()

            self.assertIn("Trigger diff criteria", html_text)
            self.assertIn("addedContains: DEBUG STARTUP", html_text)
            self.assertIn("addedRegex: Temp", html_text)

    def test_review_inputs_reports_diff_trigger(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            run(["git", "init", "-q"], repo)
            run(["git", "checkout", "-b", "base", "-q"], repo)
            (repo / "src").mkdir()
            (repo / ".pattern-review").mkdir()
            (repo / "src" / "app.js").write_text("initial\n")
            write_yaml(
                repo / ".pattern-review" / "rules.yaml",
                [
                    {
                        "id": "no-debug-startup",
                        "title": "No DEBUG STARTUP",
                        "description": "Do not add DEBUG STARTUP markers.",
                        "scope": {"paths": ["src/**/*.js"]},
                        "trigger": {"mode": "diff", "addedContains": ["DEBUG STARTUP"]},
                        "severity": "blocker",
                        "review": {
                            "mode": "agentic",
                            "instructions": "Check whether DEBUG STARTUP is temporary debug code.",
                        },
                    }
                ],
            )
            run(["git", "add", "."], repo)
            run(["git", "commit", "-q", "-m", "init"], repo)
            run(["git", "checkout", "-b", "feature", "-q"], repo)
            (repo / "src" / "app.js").write_text("initial\nDEBUG STARTUP\n")
            run(["git", "add", "src/app.js"], repo)
            run(["git", "commit", "-q", "-m", "add debug marker"], repo)

            output = run(
                ["python3", str(TOOL), "review-inputs", "--cwd", str(repo), "--base", "base"],
                repo,
            )
            data = json.loads(output)

            self.assertEqual(data["reviewContext"]["changedFiles"], ["src/app.js"])
            self.assertTrue(data["triggeredRules"][0]["triggerResult"])
            self.assertEqual(data["triggeredRules"][0]["id"], "no-debug-startup")

    def test_review_inputs_honors_a_pinned_historical_head(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            run(["git", "init", "-q"], repo)
            run(["git", "checkout", "-b", "base", "-q"], repo)
            (repo / ".pattern-review").mkdir()
            (repo / "source.py").write_text("base\n")
            write_yaml(repo / ".pattern-review" / "rules.yaml", [])
            run(["git", "add", "."], repo)
            run(["git", "commit", "-q", "-m", "base"], repo)
            run(["git", "checkout", "-b", "feature", "-q"], repo)
            (repo / "source.py").write_text("source\n")
            run(["git", "add", "source.py"], repo)
            run(["git", "commit", "-q", "-m", "source"], repo)
            source_sha = run(["git", "rev-parse", "HEAD"], repo).strip()
            (repo / "evidence.md").write_text("evidence\n")
            run(["git", "add", "evidence.md"], repo)
            run(["git", "commit", "-q", "-m", "evidence"], repo)

            output = run(
                [
                    "python3",
                    str(TOOL),
                    "review-inputs",
                    "--cwd",
                    str(repo),
                    "--base",
                    "base",
                    "--head",
                    source_sha,
                ],
                repo,
            )
            data = json.loads(output)

            self.assertEqual(data["reviewContext"]["head"], source_sha)
            self.assertEqual(data["reviewContext"]["changedFiles"], ["source.py"])

    def test_review_inputs_disables_rename_detection_for_shared_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            run(["git", "init", "-q"], repo)
            run(["git", "checkout", "-b", "base", "-q"], repo)
            (repo / ".pattern-review").mkdir()
            (repo / "old.py").write_text("content\n")
            write_yaml(repo / ".pattern-review" / "rules.yaml", [])
            run(["git", "add", "."], repo)
            run(["git", "commit", "-q", "-m", "base"], repo)
            run(["git", "checkout", "-b", "feature", "-q"], repo)
            run(["git", "mv", "old.py", "new.py"], repo)
            run(["git", "commit", "-q", "-m", "rename"], repo)

            output = run(
                [
                    "python3",
                    str(TOOL),
                    "review-inputs",
                    "--cwd",
                    str(repo),
                    "--base",
                    "base",
                ],
                repo,
            )
            data = json.loads(output)

            self.assertEqual(
                data["reviewContext"]["changedFiles"], ["new.py", "old.py"]
            )


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return result.stdout


def sample_harvest_payload() -> dict[str, object]:
    return {
        "pullRequest": {
            "number": 689,
            "url": "https://github.com/example-org/client/pull/689",
            "title": "Provider integration",
            "state": "OPEN",
            "createdAt": "2026-06-01T00:00:00Z",
            "updatedAt": "2026-06-02T00:00:00Z",
            "baseRefName": "main",
            "headRefName": "tb-1166-provider-integration",
            "baseRefOid": "base",
            "headRefOid": "head",
            "mergeCommit": None,
            "author": {"login": "TrentBrown"},
            "owner": "example-org",
            "repo": "client",
        },
        "conversationComments": [],
        "reviews": [],
        "reviewThreads": [
            {
                "id": "thread-1",
                "isResolved": False,
                "isOutdated": False,
                "path": "public/components/Site/siteLayoutMap.vue",
                "line": 10,
                "originalLine": 10,
                "comments": {
                    "nodes": [
                        {
                            "id": "comment-1",
                            "url": "https://example.test/comment-1",
                            "body": "API calls should always go through a stores module.",
                            "createdAt": "2026-06-01T01:00:00Z",
                            "updatedAt": "2026-06-01T01:00:00Z",
                            "author": {"login": "gregqpro"},
                            "path": "public/components/Site/siteLayoutMap.vue",
                            "line": 10,
                            "originalLine": 10,
                            "diffHunk": "@@",
                            "commit": {"oid": "head"},
                            "originalCommit": {"oid": "old-head"},
                        }
                    ]
                },
            },
            {
                "id": "thread-2",
                "isResolved": False,
                "isOutdated": False,
                "path": "public/stores/provider.js",
                "line": 20,
                "originalLine": 20,
                "comments": {
                    "nodes": [
                        {
                            "id": "comment-2",
                            "url": "https://example.test/comment-2",
                            "body": "No alerts on errors? Are the errors handled somehow in the calling code?",
                            "createdAt": "2026-06-01T02:00:00Z",
                            "updatedAt": "2026-06-01T02:00:00Z",
                            "author": {"login": "gregqpro"},
                            "path": "public/stores/provider.js",
                            "line": 20,
                            "originalLine": 20,
                            "diffHunk": "@@",
                            "commit": {"oid": "head"},
                            "originalCommit": {"oid": "old-head"},
                        }
                    ]
                },
            },
        ],
    }


if __name__ == "__main__":
    unittest.main()
