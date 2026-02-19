"""AMC Platform CLI."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import typer
import uvicorn

from amc.core.config import settings
from amc.core.logging import configure_logging
from amc.enforce import ToolPolicyFirewall
from amc.enforce.e1_policy import PolicyRequest
from amc.core.models import SessionTrust, ToolCategory
from amc.shield import InjectionDetector, SkillAnalyzer
from amc.watch import get_ledger
from amc.score import start_questionnaire
from amc.product import Relevance, count_features, get_features, select_high_impact

app = typer.Typer(help="AMC Platform CLI")
shield_app = typer.Typer(help="Shield commands")
enforce_app = typer.Typer(help="Policy enforcement commands")
policy_app = typer.Typer(help="Policy namespace")
watch_app = typer.Typer(help="Watch commands")
score_app = typer.Typer(help="Score / scorecard commands")


# ---------------------------------------------------------------------------
# shield
# ---------------------------------------------------------------------------

@shield_app.command("scan")
def shield_scan(path: str) -> None:
    """Scan a skill directory for dangerous patterns (S1 analyzer)."""
    configure_logging(debug=settings.debug, json_output=settings.log_json)
    analyzer = SkillAnalyzer()
    result = analyzer.scan_directory(Path(path))
    print(f"target={result.target}")
    print(f"risk={result.risk_level.value} ({result.risk_score})")
    print(f"passed={result.passed}")
    print(f"findings={len(result.findings)}")
    for f in result.findings:
        print(f"- [{f.rule_id}] {f.title} ({f.risk_level.value})")


@shield_app.command("detect")
def shield_detect(text: str) -> None:
    """Detect prompt injection in a single text input."""
    configure_logging(debug=settings.debug, json_output=settings.log_json)
    detector = InjectionDetector()
    result = asyncio.run(detector.scan(text))
    print(f"risk={result.risk_level.value}")
    print(f"action={result.action.value}")
    print(f"score={result.risk_score}")
    for f in result.findings:
        print(f"- [{f.rule_id}] {f.title}")


app.add_typer(shield_app, name="shield")


# ---------------------------------------------------------------------------
# enforce
# ---------------------------------------------------------------------------

@policy_app.command("eval")
def policy_eval(tool: str, params_json: str, sender: str = "cli", trust: str = "owner") -> None:
    """Evaluate a policy decision for a given tool and parameters.

    Args:
        tool: Tool name (e.g. exec, gateway).
        params_json: JSON object for tool parameters.
    """
    configure_logging(debug=settings.debug, json_output=settings.log_json)

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter(f"Invalid JSON for params_json: {exc}")

    # Map tool to a category
    category = ToolCategory(tool_category_from_name(tool))
    trust_level = SessionTrust(trust)

    fw = ToolPolicyFirewall.from_preset(settings.policy_preset)
    req = PolicyRequest(
        session_id="cli",
        sender_id=sender,
        trust_level=trust_level,
        tool_name=tool,
        tool_category=category,
        parameters=params,
        context={"source": "cli"},
    )
    out = fw.evaluate(req)
    print(json.dumps({
        "decision": out.decision.value,
        "risk_level": out.risk_level.value,
        "reasons": out.reasons,
        "remediation": out.remediation,
        "step_up_required": out.step_up_required,
    }, indent=2))


def tool_category_from_name(name: str) -> str:
    n = name.lower()
    if n in {"exec", "shell", "command", "run", "bash", "sh"}:
        return "exec"
    if n in {"gateway", "cron", "restart", "deploy"}:
        return "control_plane"
    if n in {"browser", "open", "navigate", "fill", "type", "screenshot"}:
        return "browser"
    if n in {"http", "fetch", "curl", "get", "post", "request"}:
        return "network"
    if n in {"send", "message", "chat"}:
        return "messaging"
    if n in {"write", "read", "memory", "mem"}:
        return "memory"
    if n in {"fs", "file", "write_file", "read_file", "path"}:
        return "filesystem"
    return "read_only"


enforce_app.add_typer(policy_app, name="policy")
app.add_typer(enforce_app, name="enforce")


# ---------------------------------------------------------------------------
# product (roadmap + feature catalog)
# ---------------------------------------------------------------------------

product_app = typer.Typer(help="Product roadmap and feature catalog")


@product_app.command("features")
def product_features(
    relevance: str | None = typer.Option(
        None,
        help="Filter by relevance: high|medium|low",
    ),
    amc_fit: bool = typer.Option(
        True,
        help="Only show features marked as AMC-fit",
    ),
    limit: int = typer.Option(0, ge=0, help="Limit number of returned rows"),
) -> None:
    """List the 50 candidate product features with relevance tags."""
    rel = Relevance(relevance.lower()) if relevance else None
    feats = get_features(relevance=rel, amc_fit_only=amc_fit)
    if limit > 0:
        feats = feats[:limit]
    print(f"count={len(feats)}")
    for f in feats:
        print(f"[{f.feature_id:02d}] {f.title} | {f.relevance.value} | fit={f.amc_fit} | lane={f.lane.value}")
        print(f"    owner={f.owner_hint} | effort={f.effort}")
        if f.rationale:
            print(f"    {f.rationale}")


@product_app.command("features-recommended")
def product_features_recommended(limit: int = typer.Option(12, ge=1, le=50)) -> None:
    """Show top high-impact AMC-fit recommendations for phase 1."""
    for f in select_high_impact(limit=limit):
        print(f"[{f.feature_id:02d}] {f.title}")
        print(f"  lane={f.lane.value} | effort={f.effort}")
        print(f"  rationale={f.rationale}")


@product_app.command("features-count")
def product_features_count() -> None:
    """Show total number of declared features in the catalog."""
    print(f"catalog_size={count_features()}")


app.add_typer(product_app, name="product")


# ---------------------------------------------------------------------------
# watch
# ---------------------------------------------------------------------------

receipts_app = typer.Typer(help="Receipt ledger commands")


@receipts_app.command("list")
def watch_receipts_list(limit: int = 20) -> None:
    """List recent receipts (default 20)."""
    configure_logging(debug=settings.debug, json_output=settings.log_json)

    async def _list() -> list:
        ledger = await get_ledger(str(settings.receipts_db))
        rows = await ledger.query(limit=limit)
        return rows

    receipts = asyncio.run(_list())
    print(f"found={len(receipts)}")
    for r in receipts:
        print(f"{r.timestamp.isoformat()} | {r.tool_name} | {r.policy_decision.value} | {r.receipt_id}")


@watch_app.command("verify")
def watch_verify() -> None:
    """Verify hash-chain integrity of receipt ledger."""
    configure_logging(debug=settings.debug, json_output=settings.log_json)

    async def _verify() -> tuple[bool, str]:
        ledger = await get_ledger(str(settings.receipts_db))
        return await ledger.verify_chain()

    ok, msg = asyncio.run(_verify())
    print(json.dumps({"ok": ok, "message": msg}, indent=2))


watch_app.add_typer(receipts_app, name="receipts")
app.add_typer(watch_app, name="watch")


# ---------------------------------------------------------------------------
# score
# ---------------------------------------------------------------------------

@score_app.command("start")
def score_start() -> None:
    """Run interactive trust-and-safety questionnaire."""
    result = start_questionnaire()
    print(f"score={result['score']:.0f}")
    print(f"answers={','.join(result['answers'])}")


app.add_typer(score_app, name="score")


# ---------------------------------------------------------------------------
# top-level
# ---------------------------------------------------------------------------

@app.command("server")
def server() -> None:
    """Start the AMC FastAPI server."""
    uvicorn.run(
        "amc.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
    )


if __name__ == "__main__":
    app()
