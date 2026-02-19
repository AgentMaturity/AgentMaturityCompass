"""
AMC Watch — W3: SIEM Exporter and MITRE-Style Activity Mapping
==============================================================

Maps action receipts into lightweight MITRE ATT&CK-style categories and exports
telemetry to common SIEM shapes.

Usage
-----

.. code-block:: python

    from amc.watch.w3_siem_exporter import SIEMExporter

    exporter = SIEMExporter()
    events = await exporter.map_receipts_from_db(db_path="/tmp/amc_receipts.db", limit=20)

    splunk_payload = exporter.export_splunk(events)
    elastic_payload = exporter.export_elastic(events)
    cef_payload = exporter.export_sentinel(events)

    exporter.export_jsonl(events, "/tmp/mitre_events.jsonl")

    # Continuous stream (bounded for tests with max_batches)
    await exporter.stream_to_webhook(
        url="https://siem.local/ingest",
        api_key="TOKEN",
        batch_size=50,
        poll_interval_seconds=15,
        max_batches=2,
    )
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
import urllib.error
import urllib.request
from pydantic import BaseModel

from amc.core.models import ActionReceipt, ToolCategory
# W1 receipt reader is imported lazily in methods to avoid hard dependency on optional async backends.

log = structlog.get_logger(__name__)


class MITRECategory(str, Enum):
    """Small ATT&CK-style mapping for agent receipts."""

    EXECUTION = "execution"
    CREDENTIAL_ACCESS = "credential_access"
    EXFILTRATION_RISK = "exfiltration_risk"
    DEFENSE_EVASION = "defense_evasion"
    DISCOVERY = "discovery"
    LATERAL_MOVEMENT = "lateral_movement"
    IMPACT = "impact"
    INITIAL_ACCESS = "initial_access"


class MITREEvent(BaseModel):
    """Normalized event built from one :class:`ActionReceipt` instance."""

    timestamp: datetime
    session_id: str
    mitre_category: MITRECategory
    severity: int
    description: str
    receipt_id: str
    raw_tool_name: str
    action_receipt: ActionReceipt


class AlertQueryTemplate(BaseModel):
    """Prebuilt SIEM query template payload."""

    name: str
    query: str
    description: str
    recommended_threshold: int


class SIEMExporter:
    """Export and stream MITRE-like events to SIEM consumers."""

    DEFAULT_ALERT_TEMPLATES: list[AlertQueryTemplate] = [
        AlertQueryTemplate(
            name="burst_exec",
            description="Spike in shell execution receipts in short timeframe.",
            query="mitre_category:execution | stats count() by session_id | where count > 6",
            recommended_threshold=6,
        ),
        AlertQueryTemplate(
            name="credential_access",
            description="Any access to credentials, tokens, or auth tooling.",
            query="mitre_category:credential_access and severity>=70",
            recommended_threshold=1,
        ),
        AlertQueryTemplate(
            name="new_domain",
            description="Potential exfiltration through newly seen outbound endpoints.",
            query="mitre_category:exfiltration_risk and outcome_summary:*domain*",
            recommended_threshold=1,
        ),
        AlertQueryTemplate(
            name="policy_overrides",
            description="Policy override attempts / control bypass indicators.",
            query="mitre_category:defense_evasion or policy_reasons:*override*",
            recommended_threshold=1,
        ),
        AlertQueryTemplate(
            name="cross_session_reads",
            description="Cross-session reads that can indicate lateral movement.",
            query="mitre_category:lateral_movement and tool_name:read",
            recommended_threshold=1,
        ),
    ]

    _HEAVY_EXEC_TOOLS = {"rm", "chmod", "chown", "python", "node", "bash", "sh", "curl", "wget"}

    def __init__(self, *, last_poll_receipt: str | None = None) -> None:
        self.last_poll_receipt = last_poll_receipt

    # ------------------------------------------------------------------
    # Mapping
    # ------------------------------------------------------------------

    def map_receipt_to_mitre(self, receipt: ActionReceipt) -> MITREEvent:
        """Map one receipt to a MITRE-style event."""
        category = self._category_for_receipt(receipt)
        severity = self._risk_to_severity(receipt)
        description = self._build_description(receipt)

        return MITREEvent(
            timestamp=receipt.timestamp,
            session_id=receipt.session_id,
            mitre_category=category,
            severity=severity,
            description=description,
            receipt_id=receipt.receipt_id,
            raw_tool_name=receipt.tool_name,
            action_receipt=receipt,
        )

    async def map_receipts_from_db(
        self,
        db_path: str | Path = "amc_receipts.db",
        limit: int = 100,
    ) -> list[MITREEvent]:
        """Load up to *limit* most recent receipts and map them to events."""
        # Lazy import keeps this module importable even when optional W1 deps are
        # unavailable in the current execution environment.
        from amc.watch.w1_receipts import get_ledger

        ledger = await get_ledger(db_path)
        receipts = await ledger.query(limit=limit)
        events = [self.map_receipt_to_mitre(r) for r in receipts]

        # Cursor support for consumers that only want incremental events.
        if events:
            self.last_poll_receipt = events[0].receipt_id
        return events

    # ------------------------------------------------------------------
    # Export formats
    # ------------------------------------------------------------------

    def export_splunk(self, events: list[MITREEvent]) -> list[dict[str, Any]]:
        """Convert events to Splunk HEC-compatible JSON objects."""
        payload = []
        for e in events:
            payload.append(
                {
                    "time": int(e.timestamp.timestamp()),
                    "source": "amc.watch",
                    "sourcetype": "amc_mitre",
                    "event": {
                        "mitre_category": e.mitre_category.value,
                        "session_id": e.session_id,
                        "severity": e.severity,
                        "description": e.description,
                        "receipt_id": e.receipt_id,
                        "raw_tool_name": e.raw_tool_name,
                        "action_receipt": json.loads(e.action_receipt.model_dump_json()),
                    },
                }
            )
        return payload

    def export_elastic(self, events: list[MITREEvent]) -> list[dict[str, Any]]:
        """Convert events to Elastic Common Schema-like documents."""
        out = []
        for e in events:
            out.append(
                {
                    "@timestamp": e.timestamp.isoformat(),
                    "observer": {
                        "type": "agent",
                        "name": "amc-watch",
                    },
                    "event": {
                        "action": "telemetry.map",
                        "category": ["process", "threat"],
                        "kind": "alert",
                        "type": [e.mitre_category.value],
                    },
                    "labels": {
                        "mitre_category": e.mitre_category.value,
                        "session_id": e.session_id,
                        "receipt_id": e.receipt_id,
                        "raw_tool_name": e.raw_tool_name,
                    },
                    "log": {
                        "level": "warning" if e.severity >= 70 else "info",
                    },
                    "message": e.description,
                    "amc": {
                        "receipt": json.loads(e.action_receipt.model_dump_json()),
                    },
                    "severity": e.severity,
                }
            )
        return out

    def export_sentinel(self, events: list[MITREEvent]) -> list[dict[str, Any]]:
        """Convert events to Microsoft Sentinel / CEF-like payloads."""
        out = []
        for e in events:
            out.append(
                {
                    "cef.version": "0",
                    "cef.vendor": "AMC",
                    "cef.product": "Watch",
                    "cef.version": "1.0",
                    "cef.deviceEventClassId": e.mitre_category.value,
                    "cef.name": "AMC MITRE Mapped Event",
                    "cef.severity": e.severity,
                    "deviceReceiptId": e.receipt_id,
                    "sessionId": e.session_id,
                    "rawTool": e.raw_tool_name,
                    "description": e.description,
                    "event": json.loads(e.action_receipt.model_dump_json()),
                }
            )
        return out

    def export_jsonl(self, events: list[MITREEvent], path: str | Path) -> int:
        """Write events as JSON lines and return number of records written."""
        out_path = Path(path)
        count = 0
        with out_path.open("w", encoding="utf-8") as f:
            for event in events:
                row = {
                    **event.model_dump(mode="json"),
                    "payload_hash": hashlib.sha256(event.model_dump_json().encode("utf-8")).hexdigest(),
                }
                f.write(json.dumps(row) + "\n")
                count += 1
        log.info("siem_exporter.export_jsonl", path=str(out_path), count=count)
        return count

    # ------------------------------------------------------------------
    # Continuous export
    # ------------------------------------------------------------------

    async def stream_to_webhook(
        self,
        url: str,
        api_key: str,
        batch_size: int = 50,
        poll_interval_seconds: float = 10.0,
        db_path: str | Path = "amc_receipts.db",
        max_batches: int | None = None,
    ) -> None:
        """Poll W1 receipts and send batches to webhook continuously.

        Pass ``max_batches`` for bounded test/runtime (e.g. 1-3 loops).
        """
        emitted = 0
        loops = 0

        while True:
            events = await self.map_receipts_from_db(db_path=db_path, limit=batch_size)

            # avoid sending old events repeatedly in long-running mode
            if self.last_poll_receipt:
                # map_receipts_from_db returns newest first; keep only unseen events
                filtered: list[MITREEvent] = []
                for ev in events:
                    if ev.receipt_id == self.last_poll_receipt:
                        break
                    filtered.append(ev)
                events = list(reversed(filtered))
            else:
                events = events[:batch_size]

            if events:
                payload = self.export_splunk(events)
                self._post_json(url=url, api_key=api_key, payload=payload)
                emitted += len(events)
                self.last_poll_receipt = events[-1].receipt_id if events else self.last_poll_receipt

            loops += 1
            if max_batches is not None and loops >= max_batches:
                log.info("siem_exporter.stream_done", loops=loops, emitted=emitted)
                return

            await asyncio.sleep(max(1.0, poll_interval_seconds))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _risk_to_severity(receipt: ActionReceipt) -> int:
        """Map decision policy to numeric severity."""
        decision = receipt.policy_decision.value.lower()
        if decision == "deny":
            return 95
        if decision == "stepup":
            return 80
        if decision == "allow":
            # default allow is moderate only
            return 50
        return 30

    def _category_for_receipt(self, receipt: ActionReceipt) -> MITRECategory:
        text = (receipt.outcome_summary or "") .lower()
        params = json.dumps(receipt.parameters_redacted or {}, sort_keys=True).lower()
        reasons = " ".join(receipt.policy_reasons or []).lower()
        all_text = f"{receipt.tool_name.lower()} {text} {params} {reasons}"

        # explicit category by tool name (most deterministic)
        if receipt.tool_name.lower() in self._HEAVY_EXEC_TOOLS or receipt.tool_name == "exec":
            return MITRECategory.EXECUTION
        if receipt.tool_category == ToolCategory.EXEC:
            return MITRECategory.EXECUTION

        # policy override
        if "override" in all_text or "bypass" in all_text:
            return MITRECategory.DEFENSE_EVASION

        # initial access (new senders)
        if "new sender" in all_text or "onboard" in all_text or "trust" in all_text:
            return MITRECategory.INITIAL_ACCESS

        # credential access
        if any(x in all_text for x in ["password", "secret", "token", "credential", "login", "auth"]):
            return MITRECategory.CREDENTIAL_ACCESS

        # exfiltration risk
        if any(x in all_text for x in ["webhook", "upload", "new domain", "outbound", "post", "http", "https"]):
            return MITRECategory.EXFILTRATION_RISK

        # lateral movement
        if any(x in all_text for x in ["cross-session", "other session", "session_id", "lateral", "impersonat"]):
            return MITRECategory.LATERAL_MOVEMENT

        # discovery / enumeration
        if any(x in all_text for x in ["scan", "list", "discover", "find", "enumerate", "ls "]):
            return MITRECategory.DISCOVERY

        # impact
        if any(x in all_text for x in ["delete", "remove", "truncate", "overwrite", "rm ", "config"]):
            return MITRECategory.IMPACT

        # execution fallback
        if any(x in all_text for x in ["shell", "command", "exec"]):
            return MITRECategory.EXECUTION

        return MITRECategory.INITIAL_ACCESS

    @staticmethod
    def _build_description(receipt: ActionReceipt) -> str:
        reasons = ", ".join(receipt.policy_reasons[:2]) if receipt.policy_reasons else "no policy reasons"
        return (
            f"tool={receipt.tool_name} category={receipt.tool_category.value} "
            f"decision={receipt.policy_decision.value} outcome='{receipt.outcome_summary}' "
            f"reasons=[{reasons}]"
        )

    def alert_templates(self) -> list[AlertQueryTemplate]:
        """Return pre-built top alert templates."""
        return list(self.DEFAULT_ALERT_TEMPLATES)

    @staticmethod
    def _post_json(url: str, api_key: str, payload: list[dict[str, Any]]) -> None:
        if not payload:
            return
        req = urllib.request.Request(
            url,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            data=json.dumps(payload).encode("utf-8"),
        )

        try:
            with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310 - target URL is caller provided in trusted automation
                status = getattr(resp, "status", 0)
                body = resp.read(64)
            log.info("siem_exporter.webhook", status=status, sample=body[:20], bytes_sent=len(payload))
        except urllib.error.HTTPError as exc:  # pragma: no cover
            log.error("siem_exporter.webhook_http_error", code=exc.code, body=str(exc))
        except urllib.error.URLError as exc:  # pragma: no cover
            log.error("siem_exporter.webhook_network_error", error=str(exc))
        except Exception as exc:  # pragma: no cover
            log.error("siem_exporter.webhook_error", error=str(exc))


MITREEvent.model_rebuild()
AlertQueryTemplate.model_rebuild()
