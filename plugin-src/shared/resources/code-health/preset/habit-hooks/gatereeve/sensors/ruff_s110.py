"""GateReeve sensor: Ruff S110 (try/except/pass) as `swallowed-exception`.

Prints Habit Hooks findings JSON on stdout. Ruff exits 0 (clean) or 1
(violations); anything else is a broken run and is raised, so Habit Hooks
reports it as an incomplete run rather than a clean one.
"""

import json
import subprocess
import sys


def main(argv):
    ruff, files = argv[0], argv[1:]
    if not files:
        print("[]")
        return 0
    result = subprocess.run(
        [ruff, "check", "--output-format=json", "--select=S110", "--no-cache", *files],
        capture_output=True, encoding="utf-8", errors="replace",
    )
    if result.returncode not in (0, 1):
        sys.stderr.write(result.stderr)
        return 2
    issues = [
        {
            "key": entry["filename"],
            "details": {
                "file": entry["filename"],
                "line": entry["location"]["row"],
                "column": entry["location"]["column"],
                "message": entry["message"],
                "source": f"ruff:{entry['code']}",
            },
        }
        for entry in json.loads(result.stdout or "[]")
    ]
    findings = [{"smell": "swallowed-exception", "details": {}, "issues": issues, "language": "python"}] if issues else []
    print(json.dumps(findings))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
