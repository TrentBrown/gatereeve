#!/usr/bin/env python3
"""Trusted mechanical bridge for the portable boundary retry coordinator."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from boundary_gate import resolve_gate_context
from boundary_packet import packet_name_for_context, validate_packet
from pr_context import (GitHubPullRequestProvider, PullRequestContext,
                        finalize_pull_request_context)
from pr_lifecycle import prepare_pull_request, require_merge_direction
from workflow_context import resolve_workflow_context


def execute(request, provider=None):
    workflow = resolve_workflow_context(request["repositoryRoot"],
                                        repository_alias=request.get("repositoryAlias"))
    provider = provider or GitHubPullRequestProvider(workflow.repository.path)
    action = request["action"]
    if action == "prepare":
        # Exact-PR preparation cannot create or reopen a PR, even after interruption.
        head = provider.snapshot(str(request["pullRequest"]))
        require_merge_direction(head.head_branch, head.base_branch)
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md") as body:
            body.write("Review preparation pending substantive checks.\n")
            body.flush()
            context = prepare_pull_request(workflow.repository, provider,
                                        title="Review preparation pending", body_file=body.name,
                                        scope=request["scope"].lower().replace("_", "-"),
                                        expected_pr=request["pullRequest"])
            return {"context": context.to_dict(), "packetId": packet_name_for_context(workflow, context)}
    context = PullRequestContext.from_dict(request["context"])
    if action == "gate":
        return resolve_gate_context(workflow, context, request["gateId"],
                                    scope=request["scope"].lower().replace("_", "-"),
                                    attempt_id=request["attemptId"])
    if action == "finalize":
        synchronized = finalize_pull_request_context(context, provider,
                                                      evidence_paths=request["evidencePaths"])
        packet = validate_packet(workflow, context)
        return {"synchronization": synchronized, "packet": packet}
    raise ValueError("Unsupported boundary retry bridge action")


if __name__ == "__main__":
    try:
        print(json.dumps(execute(json.load(sys.stdin))))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
