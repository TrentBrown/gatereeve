from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("greet.py")


class GreetingCliTests(unittest.TestCase):
    def run_cli(self, *arguments: str) -> str:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout

    def test_default_greeting(self) -> None:
        self.assertEqual(self.run_cli(), "Hello, World!\n")

    def test_named_greeting(self) -> None:
        self.assertEqual(self.run_cli("--name", "Ada"), "Hello, Ada!\n")


if __name__ == "__main__":
    unittest.main()
