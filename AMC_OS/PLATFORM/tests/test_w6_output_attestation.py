from __future__ import annotations

from amc.core.models import ActionReceipt, SessionTrust, ToolCategory, PolicyDecision
from amc.watch.w6_output_attestation import AttestationStatus, OutputAttestor


def _sample_receipt() -> ActionReceipt:
    r = ActionReceipt(
        session_id="s1",
        sender_id="u1",
        tool_name="scan",
        tool_category=ToolCategory.READ_ONLY,
        parameters_redacted={"q": "ok"},
        outcome_summary="ok",
        trust_level=SessionTrust.TRUSTED,
        policy_decision=PolicyDecision.ALLOW,
    )
    return r


def test_attestation_records_and_verifies():
    attestor = OutputAttestor(hmac_key="k")
    r = _sample_receipt()
    rec = attestor.attestate({"a": 1, "b": [1, 2]}, r)
    status = attestor.verify(rec, {"a": 1, "b": [1, 2]})
    assert status == AttestationStatus.VALID


def test_attestation_rejects_tamper():
    attestor = OutputAttestor(hmac_key="k")
    r = _sample_receipt()
    rec = attestor.attestate("hello", r)
    status = attestor.verify(rec, "hacked")
    assert status == AttestationStatus.INVALID


def test_list_by_receipt_filters():
    attestor = OutputAttestor(hmac_key="k")
    r = _sample_receipt()
    attestor.attestate("x", r)
    rows = attestor.list_by_receipt(r.receipt_id)
    assert len(rows) == 1
    assert rows[0].receipt_id == r.receipt_id


def test_verify_many_uses_lookup():
    attestor = OutputAttestor(hmac_key="k")
    r = _sample_receipt()
    rec = attestor.attestate("abc", r)
    statuses = attestor.verify_many([rec], {rec.attestation_id: "abc", "other": "x"})
    assert statuses[rec.attestation_id] == AttestationStatus.VALID
