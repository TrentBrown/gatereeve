#!/usr/bin/env python3
"""Small baseline CLI used to verify implicit workflow activation."""

from __future__ import annotations

import argparse
from typing import Sequence


def greeting(name: str) -> str:
    return f"Hello, {name}!"


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Print a friendly greeting")
    command.add_argument("--name", default="World")
    return command


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    print(greeting(arguments.name))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
