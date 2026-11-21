#!/usr/bin/env python3
"""Transport-neutral pinned context for a governed review boundary."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from pr_context import PullRequestContext, PullRequestContextError


SCHEMA_VERSION = 2
SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")
TRANSPORTS = {"pull-request", "synthetic-commit"}


class BoundaryContextError(RuntimeError):
    """Raised when a pinned review-boundary context is invalid."""


def _required_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BoundaryContextError(f"{label} must be a nonempty string")
    return value.strip()


def _required_sha(value: object, label: str) -> str:
    result = _required_string(value, label).lower()
    if not SHA.fullmatch(result):
        raise BoundaryContextError(f"{label} must be a full hexadecimal object ID")
    return result


def synthetic_review_identity(
    feature_id: object,
    repository_alias: object,
    candidate_sha: object,
) -> tuple[str, str]:
    """Return the only review identity allowed for one synthetic candidate."""
    feature = _required_string(feature_id, "review.featureId")
    alias = _required_string(repository_alias, "repositoryAlias")
    candidate = _required_sha(candidate_sha, "review.candidateSourceSha")
    review_id = f"{alias}-{candidate[:12]}"
    review_ref = f"refs/heads/review/{feature}/{alias}/{candidate[:12]}"
    return review_id, review_ref


@dataclass(frozen=True)
class BoundaryContext:
    repository_root: Path
    repository_alias: str
    remote: str
    source: str
    transport: str
    base_branch: str
    base_sha: str
    head_branch: str
    head_sha: str
    merge_base_sha: str
    evaluated_source_sha: str
    feature_base_sha: str | None
    review: Mapping[str, object]
    keep_pull_requests_closed: bool = False

    @property
    def reference(self) -> str:
        if self.transport == "pull-request":
            pull_request = self.review.get("pullRequest")
            if isinstance(pull_request, dict):
                return str(pull_request["number"])
        value = self.review.get("reviewId")
        if isinstance(value, str) and value:
            return value
        raise BoundaryContextError("Boundary review has no stable reference")

    @property
    def pull_request(self):
        """Compatibility view for callers that still need PR-specific metadata."""
        if self.transport != "pull-request":
            raise BoundaryContextError("Synthetic boundary has no pull request")
        return PullRequestContext.from_dict(self.to_legacy_pr_dict()).pull_request

    def to_legacy_pr_dict(self) -> dict[str, object]:
        if self.transport != "pull-request":
            raise BoundaryContextError("Synthetic boundary cannot become a PR context")
        return {
            "schemaVersion": 1,
            "source": self.source,
            "repositoryRoot": str(self.repository_root),
            "repositoryAlias": self.repository_alias,
            "remote": self.remote,
            "pullRequest": self.review["pullRequest"],
            "mergeBaseSha": self.merge_base_sha,
            "evaluatedSourceSha": self.evaluated_source_sha,
            "featureBaseSha": self.feature_base_sha,
            **({"keepPullRequestsClosed": True} if self.keep_pull_requests_closed else {}),
        }

    def to_dict(self) -> dict[str, object]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "source": self.source,
            "transport": self.transport,
            "repositoryRoot": str(self.repository_root),
            "repositoryAlias": self.repository_alias,
            "remote": self.remote,
            "baseBranch": self.base_branch,
            "baseSha": self.base_sha,
            "headBranch": self.head_branch,
            "headSha": self.head_sha,
            "mergeBaseSha": self.merge_base_sha,
            "evaluatedSourceSha": self.evaluated_source_sha,
            "featureBaseSha": self.feature_base_sha,
            **({"keepPullRequestsClosed": True} if self.keep_pull_requests_closed else {}),
            "review": dict(self.review),
        }

    @classmethod
    def from_pull_request(cls, context: PullRequestContext) -> "BoundaryContext":
        pull_request = context.pull_request
        return cls(
            keep_pull_requests_closed=context.keep_pull_requests_closed,
            repository_root=context.repository_root,
            repository_alias=context.repository_alias,
            remote=context.remote,
            source=context.source,
            transport="pull-request",
            base_branch=pull_request.base_branch,
            base_sha=pull_request.base_sha,
            head_branch=pull_request.head_branch,
            head_sha=pull_request.head_sha,
            merge_base_sha=context.merge_base_sha,
            evaluated_source_sha=context.evaluated_source_sha,
            feature_base_sha=context.feature_base_sha,
            review={"mode": "pull-request", "pullRequest": pull_request.to_dict()},
        )

    @classmethod
    def from_dict(cls, value: object) -> "BoundaryContext":
        if not isinstance(value, dict):
            raise BoundaryContextError("Boundary context must be a JSON object")
        if value.get("schemaVersion") == 1:
            try:
                return cls.from_pull_request(PullRequestContext.from_dict(value))
            except PullRequestContextError as error:
                raise BoundaryContextError(str(error)) from error
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise BoundaryContextError(
                f"Boundary context schemaVersion must be 1 or {SCHEMA_VERSION}"
            )
        transport = _required_string(value.get("transport"), "transport")
        if transport not in TRANSPORTS:
            raise BoundaryContextError(f"Unsupported boundary transport: {transport}")
        review = value.get("review")
        if not isinstance(review, dict) or review.get("mode") != transport:
            raise BoundaryContextError("review.mode must equal boundary transport")
        base_sha = _required_sha(value.get("baseSha"), "baseSha")
        head_sha = _required_sha(value.get("headSha"), "headSha")
        evaluated = _required_sha(
            value.get("evaluatedSourceSha"), "evaluatedSourceSha"
        )
        if evaluated != head_sha:
            raise BoundaryContextError(
                "evaluatedSourceSha must equal the originally resolved headSha"
            )
        raw_feature_base = value.get("featureBaseSha")
        feature_base = (
            _required_sha(raw_feature_base, "featureBaseSha")
            if raw_feature_base is not None
            else None
        )
        policy = value.get("keepPullRequestsClosed", False)
        if not isinstance(policy, bool):
            raise BoundaryContextError("keepPullRequestsClosed must be boolean")
        context = cls(
            keep_pull_requests_closed=policy,
            repository_root=Path(
                _required_string(value.get("repositoryRoot"), "repositoryRoot")
            ).expanduser().resolve(),
            repository_alias=_required_string(
                value.get("repositoryAlias"), "repositoryAlias"
            ),
            remote=_required_string(value.get("remote"), "remote"),
            source=_required_string(value.get("source"), "source"),
            transport=transport,
            base_branch=_required_string(value.get("baseBranch"), "baseBranch"),
            base_sha=base_sha,
            head_branch=_required_string(value.get("headBranch"), "headBranch"),
            head_sha=head_sha,
            merge_base_sha=_required_sha(value.get("mergeBaseSha"), "mergeBaseSha"),
            evaluated_source_sha=evaluated,
            feature_base_sha=feature_base,
            review=review,
        )
        if transport == "pull-request":
            try:
                PullRequestContext.from_dict(context.to_legacy_pr_dict())
            except (KeyError, PullRequestContextError) as error:
                raise BoundaryContextError(str(error)) from error
        else:
            feature_id = _required_string(review.get("featureId"), "review.featureId")
            review_id = _required_string(review.get("reviewId"), "review.reviewId")
            candidate = _required_sha(
                review.get("candidateSourceSha"), "review.candidateSourceSha"
            )
            review_ref = _required_string(review.get("reviewRef"), "review.reviewRef")
            expected_id, expected_ref = synthetic_review_identity(
                feature_id, context.repository_alias, candidate
            )
            if (
                candidate != evaluated
                or review_id != expected_id
                or review_ref != expected_ref
            ):
                raise BoundaryContextError(
                    "Synthetic review identity and deterministic ref must match the evaluated source"
                )
        return context


def normalize_context(value: BoundaryContext | PullRequestContext) -> BoundaryContext:
    if isinstance(value, BoundaryContext):
        return value
    if isinstance(value, PullRequestContext):
        return BoundaryContext.from_pull_request(value)
    raise BoundaryContextError("Unsupported boundary context value")


def load_context(path: str | Path) -> BoundaryContext:
    source = Path(path).expanduser().resolve()
    try:
        return BoundaryContext.from_dict(json.loads(source.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        raise BoundaryContextError(
            f"Cannot read boundary context from {source}: {error}"
        ) from error
