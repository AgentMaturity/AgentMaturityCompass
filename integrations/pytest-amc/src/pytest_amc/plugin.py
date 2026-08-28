"""pytest plugin: fail a build on AMC evidence integrity, and optionally level.

WHY THIS WAS REWRITTEN. The previous version shelled out to
``amc quickscore --json --agent <id>`` and returned early on a non-zero exit.
That command exits 1 in any non-TTY — which is every CI run — because without a
terminal it answers no questions and emits
``scoreStatus: NON_INTERACTIVE_PLACEHOLDER`` rather than inventing an L0. So the
threshold check below it was unreachable, permanently, and a build could not be
failed by the plugin whose entire purpose was failing builds.

Two further faults hid behind the first: it read ``score`` and ``level`` from the
response, and NEITHER KEY EXISTS in either scoring mode, so the defaults would
have reported L0 for every run had it ever got that far; and it printed
"meets minimum L0" on the default settings, which reads as a checked result and
was not one.

It now uses ``quickscore --auto``, which scores from ledger evidence with no
questions asked and exits 0 in CI. The decision itself lives in ``gate.py`` so it
can be tested without spawning pytest.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from typing import Any, Optional

import pytest

from .gate import evaluate

__all__ = ["pytest_addoption", "pytest_configure", "AMCPlugin"]


def pytest_addoption(parser: pytest.Parser) -> None:
    group = parser.getgroup("amc", "Agent Maturity Compass")
    group.addoption(
        "--amc-score", action="store_true", default=False,
        help="After the tests, score the workspace from ledger evidence and gate on it.",
    )
    group.addoption(
        "--amc-min-level", type=int, default=0,
        help="Require this level or better across every layer. 0 gates on evidence integrity only.",
    )
    group.addoption(
        "--amc-agent-id", type=str, default="default",
        help="Agent ID to score.",
    )
    group.addoption(
        "--amc-allow-unverified", action="store_true", default=False,
        help="Do not fail when the evidence ledger does not verify. Off by default, deliberately.",
    )


class AMCPlugin:
    """Runs the scorer once the tests are done, and fails the run if it should."""

    def __init__(self, config: pytest.Config) -> None:
        self.config = config
        self.min_level: int = config.getoption("--amc-min-level")
        self.agent_id: str = config.getoption("--amc-agent-id")
        self.allow_unverified: bool = config.getoption("--amc-allow-unverified")
        self.result: Optional[dict[str, Any]] = None

    def _amc(self) -> list[str]:
        """The CLI to run. `AMC_BIN` may name a build; `.js` runs through node."""
        explicit = os.environ.get("AMC_BIN")
        if explicit:
            return ["node", explicit] if explicit.endswith(".js") else [explicit]
        found = shutil.which("amc")
        if not found:
            raise FileNotFoundError("no `amc` on PATH and AMC_BIN is unset")
        return [found]

    def pytest_sessionfinish(self, session: pytest.Session, exitstatus: int) -> None:
        try:
            argv = [*self._amc(), "quickscore", "--auto", "--json", "--quiet", "--agent", self.agent_id]
            completed = subprocess.run(argv, capture_output=True, text=True, check=False)
        except FileNotFoundError as exc:
            self._fail(session, f"AMC scoring could not run: {exc}")
            return

        if completed.returncode != 0:
            # A FAILURE, not a reason to say nothing. The old plugin returned
            # here, which is how a permanently-failing command became a
            # permanently-silent gate.
            self._fail(
                session,
                f"`amc quickscore --auto` exited {completed.returncode}: "
                f"{(completed.stderr or completed.stdout).strip()[:300]}",
            )
            return

        try:
            self.result = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            self._fail(session, f"AMC scoring returned unreadable JSON: {exc}")
            return

        verdict = evaluate(
            self.result,
            min_level=self.min_level,
            require_verification=not self.allow_unverified,
        )
        line = f"AMC: {verdict.reason}"
        if verdict.failed:
            self._fail(session, line)
        else:
            print(f"\n{line}", file=sys.stderr)

    @staticmethod
    def _fail(session: pytest.Session, reason: str) -> None:
        """Fail the run, loudly and on stderr.

        `session.exitstatus` is what pytest returns to the shell, so setting it
        is what actually fails CI — printing alone would leave a green build
        under a red message.
        """
        print(f"\nAMC gate FAILED: {reason}", file=sys.stderr)
        session.exitstatus = 1


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config: pytest.Config) -> None:
    if config.getoption("--amc-score"):
        config.pluginmanager.register(AMCPlugin(config), "amc_plugin")
