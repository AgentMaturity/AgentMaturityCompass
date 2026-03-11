"""Core AMC SDK functions — score, fix, with_amc, report."""

from __future__ import annotations

import json
import os
import signal
import subprocess
from contextlib import contextmanager
from typing import Any, Generator

from .types import (
    AMCContext,
    FixResult,
    Report,
    ScoreResult,
    _parse_score_result,
)


def _find_amc() -> str:
    """Find the AMC CLI binary."""
    for candidate in ["amc", "npx agent-maturity-compass"]:
        try:
            subprocess.run(
                candidate.split() + ["--version"],
                capture_output=True,
                timeout=10,
            )
            return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    raise RuntimeError(
        "AMC CLI not found. Install with: npm i -g agent-maturity-compass"
    )


def _run_amc_command(args: list[str], timeout: int = 120) -> dict[str, Any] | None:
    """Run an AMC CLI command and return parsed JSON output."""
    amc = _find_amc()
    cmd = amc.split() + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        pass
    return None


def score(
    agent_id: str = "default",
    *,
    target_level: str | None = None,
    eu_ai_act: bool = False,
    json_output: bool = False,
) -> ScoreResult:
    """Score an agent's maturity level.

    Args:
        agent_id: Agent identifier
        target_level: Optional target maturity level (L0-L5)
        eu_ai_act: Include EU AI Act risk classification
        json_output: Return raw JSON data

    Returns:
        ScoreResult with score, level, and dimension breakdown
    """
    args = ["quickscore", "--json", "--agent", agent_id]
    if eu_ai_act:
        args.append("--eu-ai-act")

    raw = _run_amc_command(args)
    if raw is None:
        return ScoreResult(score=0, level="L0", agent_id=agent_id)

    return _parse_score_result(agent_id, raw)


def fix(
    agent_id: str = "default",
    *,
    target_level: str = "L3",
    dry_run: bool = False,
) -> FixResult:
    """Auto-generate remediation for an agent.

    Args:
        agent_id: Agent identifier
        target_level: Target maturity level for fixes
        dry_run: Preview changes without writing files

    Returns:
        FixResult with generated guardrails, AGENTS.md, and CI gate
    """
    args = ["fix", "--json", "--agent", agent_id, "--target-level", target_level]
    if dry_run:
        args.append("--dry-run")

    raw = _run_amc_command(args)
    if raw is None:
        return FixResult(
            agent_id=agent_id,
            target_level=target_level,
            guardrails="",
            agents_md="",
            ci_gate="",
        )

    return FixResult(
        agent_id=agent_id,
        target_level=target_level,
        guardrails=raw.get("guardrails", ""),
        agents_md=raw.get("agents_md", ""),
        ci_gate=raw.get("ci_gate", ""),
        files_written=raw.get("files_written", []),
    )


@contextmanager
def with_amc(
    agent_id: str = "default",
    *,
    target_level: str | None = None,
    gateway_port: int = 3210,
) -> Generator[AMCContext, None, None]:
    """Context manager that routes LLM calls through AMC gateway.

    Usage:
        with with_amc("my-agent") as amc:
            llm = ChatOpenAI()  # automatically routes through gateway
            response = llm.invoke("Hello!")

        print(amc.result.level)  # L3
    """
    ctx = AMCContext(agent_id=agent_id)
    gateway_process = None
    original_env = {}

    try:
        # Start gateway
        amc = _find_amc()
        gateway_process = subprocess.Popen(
            amc.split() + ["gateway", "start", "--port", str(gateway_port)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        ctx.gateway_pid = gateway_process.pid
        ctx.gateway_url = f"http://localhost:{gateway_port}/v1"

        # Set environment variables so LLM clients route through gateway
        env_overrides = {
            "OPENAI_BASE_URL": ctx.gateway_url,
            "AMC_AGENT_ID": agent_id,
        }
        for key, value in env_overrides.items():
            original_env[key] = os.environ.get(key)
            os.environ[key] = value

        yield ctx

    finally:
        # Restore environment
        for key, original in original_env.items():
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original

        # Stop gateway
        if gateway_process and gateway_process.poll() is None:
            gateway_process.send_signal(signal.SIGTERM)
            try:
                gateway_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                gateway_process.kill()

        # Get final score
        raw = _run_amc_command(["quickscore", "--json", "--agent", agent_id])
        if raw:
            ctx.result = _parse_score_result(agent_id, raw)


def report(
    agent_id: str = "default",
    *,
    framework: str = "eu-ai-act",
    output_format: str = "html",
) -> Report:
    """Generate a compliance report.

    Args:
        agent_id: Agent identifier
        framework: Compliance framework (eu-ai-act, iso-42001, nist-ai-rmf, soc2, owasp)
        output_format: Output format (html, json, markdown)

    Returns:
        Report object with content and save methods
    """
    args = [
        "compliance", "report",
        "--json",
        "--agent", agent_id,
        "--framework", framework,
    ]

    raw = _run_amc_command(args)
    if raw is None:
        return Report(agent_id=agent_id, framework=framework, content="", raw={})

    return Report(
        agent_id=agent_id,
        framework=framework,
        content=raw.get("content", raw.get("html", "")),
        raw=raw,
    )
