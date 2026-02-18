from __future__ import annotations

from amc.core.models import ActionReceipt, PolicyDecision, RiskLevel, SessionTrust, ToolCategory
from amc.watch.w7_explainability_packet import ExplainabilityPacketer


def _sample_receipt() -> ActionReceipt:
    return ActionReceipt(
        session_id="sess",
        sender_id="u1",
        tool_name="exec",
        tool_category=ToolCategory.EXEC,
        parameters_redacted={"cmd": "ls"},
        outcome_summary="done",
        trust_level=SessionTrust.TRUSTED,
        policy_decision=PolicyDecision.ALLOW,
    )


def test_packet_has_rows_and_digest():
    p = ExplainabilityPacketer()
    receipt = _sample_receipt()
    packet = p.build_packet(
        session_id="sess",
        receipts=[receipt],
        findings=[{"area": "watch", "title": "x", "evidence": "ok", "risk": RiskLevel.MEDIUM}],
    )
    assert packet.session_id == "sess"
    assert packet.receipt_count == 1
    assert packet.digest and len(packet.digest) == 64
    assert any("tool:exec" in r.area for r in packet.claims)


def test_render_text_contains_summary():
    p = ExplainabilityPacketer()
    packet = p.build_packet("s2", [_sample_receipt()], [])
    txt = p.render_text(packet)
    assert "Session: s2" in txt
    assert "Receipts:" in txt
