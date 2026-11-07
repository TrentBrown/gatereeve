"""Portable entry to the current factual extractor; never grants review passage."""
from pathlib import Path
import subprocess
import sys


def run(kind: str) -> int:
    if len(sys.argv) < 2:
        print("Expected feature directory", file=sys.stderr)
        return 1
    script = Path(__file__).resolve().parent.parent / "protocol/current/planning-lint.js"
    return subprocess.run(["node", str(script), kind, sys.argv[1]], check=False).returncode
