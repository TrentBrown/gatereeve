from __future__ import annotations

import json
import unittest
from dataclasses import replace
from pathlib import Path

import test_pr_context as fixtures
from boundary_context import BoundaryContext, synthetic_review_identity
from boundary_gate import resolve_gate_context, BoundaryGateError
from pr_context import (
    PullRequestContext, PullRequestContextError, PullRequestSnapshot,
    GitHubPullRequestProvider,
    resolve_pull_request_context, verify_context_is_current,
    verify_boundary_context_is_current, finalize_pull_request_context,
)
from pr_lifecycle import prepare_pull_request, merge_pull_request, require_merge_direction
from workflow_context import resolve_workflow_context, WorkflowContextError


class Provider:
    source = "github"

    def __init__(self, payload, *, listed=True, fail=None, checks=None):
        self.payload = payload.copy()
        self.listed = listed
        self.fail = fail
        self.calls = []
        self.checks = checks or []

    def snapshot(self, selector=None):
        return PullRequestSnapshot.from_dict(self.payload)

    def gh(self, *args):
        self.calls.append(args)
        command = args[1]
        if command == self.fail:
            raise PullRequestContextError(f"{command} failed")
        if command == "list":
            return json.dumps([self.payload] if self.listed else [])
        if command == "create":
            self.listed = True
            self.payload["state"] = "OPEN"
            return self.payload["url"]
        if command in {"close", "reopen", "merge"}:
            self.payload["state"] = {"close": "CLOSED", "reopen": "OPEN", "merge": "MERGED"}[command]
        if command == "ready":
            self.payload["isDraft"] = False
        if command == "view":
            return json.dumps({"statusCheckRollup": self.checks})
        return ""


class ClosedPullRequestTests(fixtures.PullRequestContextTests):
    def test_github_closed_pr_uses_live_branch_refs_and_preserves_frozen_metadata(self):
        payload = self.payload(state="CLOSED", headRefOid=self.base_sha)
        payload["headRepository"] = {"nameWithOwner": "example/product"}
        def runner(executable, args, cwd, environment):
            if args[0] == "repo":
                return json.dumps({"nameWithOwner": "example/product"})
            if args[0] == "pr":
                return json.dumps(payload)
            if "tb-feature-02-pr-context" in args[1]:
                return self.head_sha
            return self.base_sha
        snapshot = GitHubPullRequestProvider(self.root, runner=runner).snapshot("42")
        self.assertEqual(snapshot.head_sha, self.head_sha)
        self.assertEqual(snapshot.github_reported_head_sha, self.base_sha)
        self.assertEqual(PullRequestSnapshot.from_dict(snapshot.to_dict()), snapshot)
        def missing_ref(*args):
            if args[1][0] == "api":
                raise PullRequestContextError("live branch missing")
            return runner(*args)
        with self.assertRaisesRegex(PullRequestContextError, "live branch missing"):
            GitHubPullRequestProvider(self.root, runner=missing_ref).snapshot("42")

    def closed_repository(self):
        self.repository = replace(self.repository, keep_pull_requests_closed=True)
        self.config = {"schemaVersion": 1, "featureId": "tb-feature",
                       "repositories": {"product": {"path": ".", "integrationBranch": "main",
                                                       "featureBaseSha": self.base_sha,
                                                       "keepPullRequestsClosed": True}}}
        (self.root / ".agentic-workflow.json").write_text(json.dumps(self.config))
        exclude = self.root / ".git/info/exclude"
        exclude.write_text(exclude.read_text() + "\n.agentic-workflow.json\n")
        return self.repository

    def test_closed_policy_survives_both_context_formats_and_evidence_finalization(self):
        repository = self.closed_repository()
        provider = Provider(self.payload(state="CLOSED"))
        context = resolve_pull_request_context(repository, provider)
        self.assertTrue(PullRequestContext.from_dict(context.to_dict()).keep_pull_requests_closed)
        v2 = BoundaryContext.from_pull_request(context)
        self.assertTrue(BoundaryContext.from_dict(v2.to_dict()).keep_pull_requests_closed)
        self.assertEqual(verify_boundary_context_is_current(v2.to_dict(), repository, provider)["status"], "current")
        self.assertEqual(finalize_pull_request_context(context, provider)["status"], "synchronized")
        provider.payload["state"] = "OPEN"
        with self.assertRaisesRegex(PullRequestContextError, "no longer CLOSED"):
            verify_context_is_current(context, provider)

    def test_config_drift_and_unpinned_closed_context_are_rejected(self):
        repository = self.closed_repository()
        provider = Provider(self.payload(state="CLOSED"))
        context = resolve_pull_request_context(repository, provider)
        legacy = context.to_dict()
        del legacy["keepPullRequestsClosed"]
        with self.assertRaisesRegex(PullRequestContextError, "changed"):
            verify_context_is_current(PullRequestContext.from_dict(legacy), provider)
        self.config["repositories"]["product"]["keepPullRequestsClosed"] = False
        (self.root / ".agentic-workflow.json").write_text(json.dumps(self.config))
        with self.assertRaisesRegex(PullRequestContextError, "changed"):
            finalize_pull_request_context(context, provider)

    def test_prepare_creates_and_closes_or_reuses_without_reopening(self):
        repository = self.closed_repository()
        for listed, state in [(False, "OPEN"), (True, "OPEN"), (True, "CLOSED")]:
            provider = Provider(self.payload(state=state), listed=listed)
            with fixtures.tempfile.NamedTemporaryFile() as body:
                context = prepare_pull_request(repository, provider, title="Feature", body_file=body.name)
            self.assertEqual(context.pull_request.state, "CLOSED")
            commands = [call[1] for call in provider.calls]
            self.assertEqual(commands.count("create"), int(not listed))
            self.assertNotIn("reopen", commands)

    def test_prepare_failed_closure_and_ambiguity_are_visible(self):
        repository = self.closed_repository()
        with fixtures.tempfile.NamedTemporaryFile() as body:
            provider = Provider(self.payload(), fail="close")
            with self.assertRaisesRegex(PullRequestContextError, "close failed"):
                prepare_pull_request(repository, provider, title="Feature", body_file=body.name)
            provider = Provider(self.payload())
            original = provider.gh
            provider.gh = lambda *args: json.dumps([provider.payload, provider.payload]) if args[1] == "list" else original(*args)
            with self.assertRaisesRegex(PullRequestContextError, "Multiple"):
                prepare_pull_request(repository, provider, title="Feature", body_file=body.name)

    def test_default_preparation_keeps_pr_open(self):
        provider = Provider(self.payload(), listed=False)
        with fixtures.tempfile.NamedTemporaryFile() as body:
            context = prepare_pull_request(self.repository, provider, title="Feature", body_file=body.name)
        self.assertEqual(context.pull_request.state, "OPEN")
        self.assertNotIn("close", [call[1] for call in provider.calls])

    def test_authorized_merge_pins_head_and_preserves_protections(self):
        repository = self.closed_repository()
        provider = Provider(self.payload(state="CLOSED"), checks=[{"state": "PENDING"}])
        context = resolve_pull_request_context(repository, provider)
        result = merge_pull_request(context, provider, reviewed_head=self.head_sha, authorization="Trent approved exact head")
        self.assertEqual(result["status"], "merged")
        commands = [call[1] for call in provider.calls]
        self.assertLess(commands.index("reopen"), commands.index("checks"))
        self.assertLess(commands.index("checks"), commands.index("merge"))
        merge = next(call for call in provider.calls if call[1] == "merge")
        self.assertIn("--match-head-commit", merge)
        self.assertNotIn("--admin", merge)
        self.assertNotIn("--auto", merge)

    def test_failed_checks_merge_or_reopen_reclose_unmerged_pr(self):
        repository = self.closed_repository()
        for failure in ["checks", "merge", "reopen"]:
            provider = Provider(self.payload(state="CLOSED"), fail=failure, checks=[{}])
            context = resolve_pull_request_context(repository, provider)
            with self.assertRaisesRegex(PullRequestContextError, "failed"):
                merge_pull_request(context, provider, reviewed_head=self.head_sha, authorization="Approved")
            self.assertEqual(provider.payload["state"], "CLOSED")

    def test_missing_authorization_wrong_head_and_forbidden_direction_do_not_reopen(self):
        repository = self.closed_repository()
        provider = Provider(self.payload(state="CLOSED"))
        context = resolve_pull_request_context(repository, provider)
        for authorization, head in [("", self.head_sha), ("Approved", self.base_sha)]:
            with self.assertRaises(PullRequestContextError):
                merge_pull_request(context, provider, reviewed_head=head, authorization=authorization)
        self.assertNotIn("reopen", [call[1] for call in provider.calls])
        for source in ["development", "development-client"]:
            with self.assertRaisesRegex(PullRequestContextError, "Forbidden"):
                require_merge_direction(source, "main")
        require_merge_direction("tb-feature", "development-client")

    def test_source_identity_drift_after_reopening_recloses_and_does_not_merge(self):
        repository = self.closed_repository()
        provider = Provider(self.payload(state="CLOSED"))
        context = resolve_pull_request_context(repository, provider)
        original = provider.gh
        def gh(*args):
            result = original(*args)
            if args[1] == "reopen":
                provider.payload["headRefOid"] = self.base_sha
            return result
        provider.gh = gh
        with self.assertRaisesRegex(PullRequestContextError, "authorized head"):
            merge_pull_request(context, provider, reviewed_head=self.head_sha, authorization="Approved")
        self.assertEqual(provider.payload["state"], "CLOSED")
        self.assertNotIn("merge", [call[1] for call in provider.calls])

    def test_archived_synthetic_context_remains_readable_but_cannot_be_used(self):
        review_id, review_ref = synthetic_review_identity("tb-feature", "product", self.head_sha)
        historical = BoundaryContext(
            repository_root=self.root.resolve(), repository_alias="product", remote="origin",
            source="github", transport="synthetic-commit", base_branch="main",
            base_sha=self.base_sha, head_branch="tb-feature-02-pr-context",
            head_sha=self.head_sha, merge_base_sha=self.base_sha,
            evaluated_source_sha=self.head_sha, feature_base_sha=self.base_sha,
            review={"mode": "synthetic-commit", "featureId": "tb-feature",
                    "reviewId": review_id, "reviewRef": review_ref,
                    "candidateSourceSha": self.head_sha},
        )
        decoded = BoundaryContext.from_dict(historical.to_dict())
        self.assertEqual(decoded.to_dict(), historical.to_dict())
        with self.assertRaisesRegex(PullRequestContextError, "retired"):
            verify_boundary_context_is_current(decoded.to_dict(), self.repository, self.provider())
        with self.assertRaisesRegex(BoundaryGateError, "retired"):
            resolve_gate_context(resolve_workflow_context(self.root), decoded, "verification")

    def test_boolean_validation_and_retired_configuration(self):
        self.closed_repository()
        for value in ["true", 1, None, []]:
            self.config["repositories"]["product"]["keepPullRequestsClosed"] = value
            (self.root / ".agentic-workflow.json").write_text(json.dumps(self.config))
            with self.assertRaisesRegex(WorkflowContextError, "must be boolean"):
                resolve_workflow_context(self.root)
        self.config["repositories"]["product"].pop("keepPullRequestsClosed")
        self.config["repositories"]["product"]["sliceBoundaryMode"] = "pull-request"
        (self.root / ".agentic-workflow.json").write_text(json.dumps(self.config))
        with self.assertRaisesRegex(WorkflowContextError, "retired"):
            resolve_workflow_context(self.root)


if __name__ == "__main__":
    unittest.main()
