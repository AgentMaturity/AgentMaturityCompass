"""W7 Explainability Packet

Builds concise, auditor-friendly evidence packets from policy receipts,
findings, and module outputs.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from amc.core.models import ActionReceipt, RiskLevel


@dataclass
class ExplainabilityRow:
    """Normalized packet row for downstream exports."""

    area: str
    claim: str
    evidence: str
    risk: RiskLevel
    timestamp: str


@dataclass
class ExplainabilityPacket:
    """One packet containing all evidence needed for auditability."""

    packet_id: str
    session_id: str
    generated_at: str
    claims: list[ExplainabilityRow]
    receipt_count: int
    digest: str


class ExplainabilityPacketError(Exception):
    """Raised when packet input is malformed."""


class ExplainabilityPacketer:
    """Compose explainability packets from heterogeneous watch/signature inputs."""

    def __init__(self, product_name: str = "AMC") -> None:
        self.product_name = product_name

    def _to_row(
        self,
        area: str,
        claim: str,
        evidence: str,
        risk: RiskLevel = RiskLevel.SAFE,
    ) -> ExplainabilityRow:
        return ExplainabilityRow(
            area=area,
            claim=claim,
            evidence=evidence,
            risk=risk,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def _dump(self, payload: dict[str, Any]) -> str:
        text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return sha256(text.encode()).hexdigest()

    def build_packet(
        self,
        session_id: str,
        receipts: list[ActionReceipt],
        findings: list[dict[str, Any]] | None = None,
        extra_notes: list[str] | None = None,
    ) -> ExplainabilityPacket:
        """Create an explainability packet from provided receipts and findings."""
        if not session_id:
            raise ExplainabilityPacketError("session_id is required")

        rows: list[ExplainabilityRow] = []
        for r in receipts:
            rows.append(
                self._to_row(
                    area=f"tool:{r.tool_name}",
                    claim=f"Tool call '{r.tool_name}' decided as {r.policy_decision.value}",
                    evidence=(
                        f"session={r.session_id}; trust={r.trust_level.value}; "
                        f"receipt={r.receipt_id}; outcome={r.outcome_summary}"
                    ),
                    risk=RiskLevel.LOW if r.policy_decision.value == "allow" else RiskLevel.MEDIUM,
                )
            )

        for finding in findings or []:
            rows.append(
                self._to_row(
                    area=str(finding.get("area", "watch")),
                    claim=str(finding.get("title", "finding")),
                    evidence=str(finding.get("evidence", "")),
                    risk=RiskLevel(finding.get("risk", RiskLevel.MEDIUM)),
                )
            )

        if extra_notes:
            for note in extra_notes:
                rows.append(self._to_row(area="note", claim="operator note", evidence=note))

        payload = {
            "session_id": session_id,
            "product": self.product_name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "rows": [r.__dict__ for r in rows],
        }
        packet = ExplainabilityPacket(
            packet_id=f"pkt-{uuid.uuid4().hex[:16]}",
            session_id=session_id,
            generated_at=payload["generated_at"],
            claims=rows,
            digest=self._dump(payload),
            receipt_count=len(receipts),
        )
        return packet

    def render_text(self, packet: ExplainabilityPacket) -> str:
        """Render a compact human-readable packet body."""
        lines = [
            f"Session: {packet.session_id}",
            f"Packet: {packet.packet_id}",
            f"Generated: {packet.generated_at}",
            f"Receipts: {packet.receipt_count}",
            f"Digest: {packet.digest}",
            "-- Claims --",
        ]
        for row in packet.claims:
            lines.append(f"[{row.area}] {row.claim} | risk={row.risk.value} | {row.evidence}")
        return "\n".join(lines)

    def to_dict(self, packet: ExplainabilityPacket) -> dict[str, Any]:
        return {
            "packet_id": packet.packet_id,
            "session_id": packet.session_id,
            "generated_at": packet.generated_at,
            "digest": packet.digest,
            "receipt_count": packet.receipt_count,
            "claims": [row.__dict__ for row in packet.claims],
        }
