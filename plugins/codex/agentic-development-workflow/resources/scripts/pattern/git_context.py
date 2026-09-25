"""Git and diff helpers for pattern-review workflows."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GitContext:
    repo_root: Path
    branch: str
    base_ref: str
    merge_base: str
    head: str
    changed_files: list[str]


def run_git(args: list[str], cwd: str | Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


def repo_root(cwd: str | Path = ".") -> Path:
    return Path(run_git(["rev-parse", "--show-toplevel"], cwd)).resolve()


def current_branch(cwd: str | Path = ".") -> str:
    return run_git(["branch", "--show-current"], cwd) or "HEAD"


def resolve_base(cwd: str | Path = ".", explicit_base: str | None = None) -> str:
    if explicit_base:
        return explicit_base
    try:
        upstream = run_git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd)
        if upstream:
            return upstream
    except subprocess.CalledProcessError:
        pass
    for candidate in ("origin/main", "origin/latest", "origin/development"):
        try:
            run_git(["rev-parse", "--verify", candidate], cwd)
            return candidate
        except subprocess.CalledProcessError:
            continue
    raise RuntimeError("No trustworthy base found; pass an explicit base")


def build_context(
    cwd: str | Path = ".",
    base: str | None = None,
    head: str | None = None,
) -> GitContext:
    root = repo_root(cwd)
    base_ref = resolve_base(root, base)
    head_ref = head or "HEAD"
    merge_base = run_git(["merge-base", base_ref, head_ref], root)
    head_sha = run_git(["rev-parse", head_ref], root)
    changed = run_git(
        ["diff", "--name-only", "--no-renames", f"{merge_base}...{head_sha}"],
        root,
    )
    return GitContext(
        repo_root=root,
        branch=current_branch(root),
        base_ref=base_ref,
        merge_base=merge_base,
        head=head_sha,
        changed_files=[line for line in changed.splitlines() if line.strip()],
    )


def added_lines(
    cwd: str | Path,
    merge_base: str,
    head: str | None = None,
) -> dict[str, list[str]]:
    root = repo_root(cwd)
    head_ref = head or "HEAD"
    diff = run_git(
        ["diff", "--unified=0", "--no-renames", f"{merge_base}...{head_ref}"],
        root,
    )
    current_file: str | None = None
    result: dict[str, list[str]] = {}
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
            result.setdefault(current_file, [])
        elif current_file and line.startswith("+") and not line.startswith("+++"):
            result.setdefault(current_file, []).append(line[1:])
    return result
