"""AMC assurance/red-team module."""

from __future__ import annotations

from typing import Any

from .core import _run_amc_command
from .types import AssuranceResult, Finding


class _Assurance:
    """Assurance runner — access via `from amc_sdk import assurance`."""

    def run(
        self,
        agent_id: str = "default",
        *,
        scope: str | None = None,
        packs: list[str] | None = None,
        verbose: bool = False,
        sarif: bool = False,
    ) -> AssuranceResult:
        """Run red-team attack packs against an agent.

        Args:
            agent_id: Agent identifier
            scope: Run scope ("full", "quick", or None for default)
            packs: Specific pack names to run
            verbose: Include full scenario details
            sarif: Export as SARIF 2.1.0

        Returns:
            AssuranceResult with findings
        """
        args = ["assurance", "run", "--json", "--agent", agent_id]

        if scope:
            args.extend(["--scope", scope])
        if packs:
            for pack in packs:
                args.extend(["--pack", pack])
        if verbose:
            args.append("--verbose")
        if sarif:
            args.extend(["--format", "sarif"])

        raw = _run_amc_command(args, timeout=300)
        if raw is None:
            return AssuranceResult(agent_id=agent_id, total=0, passed=0, failed=0)

        findings = []
        for f in raw.get("findings", []):
            findings.append(Finding(
                id=f.get("id", ""),
                title=f.get("title", ""),
                severity=f.get("severity", "medium"),
                passed=f.get("passed", False),
                details=f.get("details", ""),
                pack=f.get("pack", ""),
            ))

        return AssuranceResult(
            agent_id=agent_id,
            total=raw.get("total", len(findings)),
            passed=raw.get("passed", sum(1 for f in findings if f.passed)),
            failed=raw.get("failed", sum(1 for f in findings if not f.passed)),
            findings=findings,
        )


assurance = _Assurance()
