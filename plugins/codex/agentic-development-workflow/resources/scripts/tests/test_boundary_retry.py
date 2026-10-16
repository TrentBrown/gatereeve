from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

import test_pr_context as fixtures
from test_pr_lifecycle import Provider
from boundary_retry import execute
from boundary_packet import ARTIFACTS
from pr_context import PullRequestContextError


class BoundaryRetryBridgeTests(unittest.TestCase):
    setUp = fixtures.PullRequestContextTests.setUp
    tearDown = fixtures.PullRequestContextTests.tearDown
    run_git = fixtures.PullRequestContextTests.run_git
    sha = fixtures.PullRequestContextTests.sha
    write = fixtures.PullRequestContextTests.write
    payload = fixtures.PullRequestContextTests.payload

    def configured(self, closed=False, repositories=None):
        config = {"schemaVersion": 1, "featureId": "tb-feature",
                  "repositories": repositories or {"product": {
                      "path": ".", "integrationBranch": "main",
                      "featureBaseSha": self.base_sha, "keepPullRequestsClosed": closed}}}
        self.write(".agentic-workflow.json", json.dumps(config))
        exclude = self.root / ".git/info/exclude"
        exclude.write_text(exclude.read_text() + "\n.agentic-workflow.json\n")
        return {"repositoryRoot": str(self.root), "repositoryAlias": "product",
                "pullRequest": 42, "scope": "SLICE", "action": "prepare"}

    def test_exact_pr_retry_preserves_both_closure_policies_without_creating_or_reopening(self):
        for closed in [False, True]:
            request = self.configured(closed)
            provider = Provider(self.payload())
            first = execute(request, provider)
            second = execute(request, provider)
            self.assertEqual(first, second)
            self.assertEqual(first["context"]["pullRequest"]["state"], "CLOSED" if closed else "OPEN")
            self.assertFalse(any(call[1] in {"create", "reopen", "ready", "merge"} for call in provider.calls))

    def test_missing_wrong_or_merged_pr_never_creates_a_replacement(self):
        request = self.configured()
        for provider in [Provider(self.payload(), listed=False),
                         Provider(self.payload(number=43)),
                         Provider(self.payload(state="MERGED"))]:
            with self.assertRaisesRegex(PullRequestContextError, "exact existing"):
                execute(request, provider)
            self.assertFalse(any(call[1] == "create" for call in provider.calls))

    def test_uncertain_close_is_reconciled_before_replay(self):
        request = self.configured(True)
        class UncertainProvider(Provider):
            once = True
            def gh(self, *args):
                result = super().gh(*args)
                if args[1] == "close" and self.once:
                    self.once = False
                    raise PullRequestContextError("network lost after close")
                return result
        provider = UncertainProvider(self.payload())
        with self.assertRaisesRegex(PullRequestContextError, "network lost"):
            execute(request, provider)
        self.assertEqual(execute(request, provider)["context"]["pullRequest"]["state"], "CLOSED")
        self.assertEqual(len([call for call in provider.calls if call[1] == "close"]), 1)

    def test_direction_dirty_checkout_and_remote_drift_block_preparation(self):
        request = self.configured()
        with self.assertRaisesRegex(PullRequestContextError, "Forbidden merge"):
            execute(request, Provider(self.payload(headRefName="development-work")))
        self.write("src/app.py", "changed\n")
        with self.assertRaisesRegex(PullRequestContextError, "uncommitted|clean|dirty"):
            execute(request, Provider(self.payload()))
        self.run_git("checkout", "--", "src/app.py")
        with self.assertRaisesRegex(PullRequestContextError, "head|HEAD"):
            execute(request, Provider(self.payload(headRefOid=self.base_sha)))

    def test_finalization_requires_clean_exact_evidence_delta_and_git_derived_packet(self):
        request = self.configured()
        provider = Provider(self.payload())
        context = execute(request, provider)["context"]
        home = self.root / "docs/issues/tb-feature"
        packet = home / "pr-42"
        gates = {}
        for gate, name in ARTIFACTS.items():
            artifact = packet / "attempts/ready-1" / name
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_text("fixture report\n")
            gates[gate] = {"disposition": "passed", "reason": None,
                           "evidence": {"path": "attempts/ready-1/" + name,
                                        "sha256": "sha256:" + hashlib.sha256(artifact.read_bytes()).hexdigest()}}
        (packet / "boundary.json").write_text(json.dumps({
            "schemaVersion": 2, "scope": "slice", "featureId": "tb-feature",
            "repositoryAlias": "product", "packetId": "pr-42",
            "pullRequest": context["pullRequest"], "mergeBaseSha": self.base_sha,
            "evaluatedSourceSha": self.head_sha, "featureBaseSha": None,
            "applicability": {"specEvaluation": True, "judge": True, "patternReview": True}, "gates": gates}))
        (home / "tracker.md").write_text("# tb-feature\n\n### PR #42\n\n[Packet](pr-42/)\n")
        finalize = {**request, "action": "finalize", "context": context,
                    "evidencePaths": ["docs/issues/tb-feature/pr-42", "docs/issues/tb-feature/tracker.md"]}
        with self.assertRaises(PullRequestContextError):
            execute(finalize, provider)
        self.run_git("add", "docs")
        self.run_git("commit", "-m", "fixture evidence")
        provider.payload["headRefOid"] = self.sha()
        verified = execute(finalize, provider)
        self.assertEqual(verified["packet"]["status"], "valid")
        self.assertEqual(verified["packet"]["changeSource"], "git")
        self.assertEqual(verified["synchronization"]["finalHeadSha"], self.sha())
        self.write("src/app.py", "production changed\n")
        self.run_git("add", "src")
        self.run_git("commit", "-m", "new source")
        provider.payload["headRefOid"] = self.sha()
        with self.assertRaisesRegex(PullRequestContextError, "outside|undeclared|evidence"):
            execute(finalize, provider)

    def test_feature_final_gate_keeps_whole_feature_range_and_retention(self):
        request = self.configured()
        request["scope"] = "FEATURE_FINAL"
        provider = Provider(self.payload())
        context = execute(request, provider)["context"]
        gate = execute({**request, "action": "gate", "context": context,
                        "gateId": "judge", "attemptId": "ready-1"}, provider)
        self.assertEqual(gate["evaluationScope"], "feature")
        self.assertEqual(gate["diffBaseSha"], self.base_sha)
        self.assertIsNotNone(gate["featureHomeRetention"])


if __name__ == "__main__":
    unittest.main()
