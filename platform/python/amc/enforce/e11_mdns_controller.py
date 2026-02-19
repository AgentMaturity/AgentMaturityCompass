"""
AMC Enforce — E11: mDNS and Local Discovery Leak Controller
===========================================================

This module implements lightweight local-service discovery visibility control for
hosted AI agents and developer workstations.

The implementation has five responsibilities:

1. **Scan**: capture mDNS/Bonjour packets on UDP/5353 for a short period
   and extract service metadata and TXT fields.
2. **Policy generation**: produce idempotent shell command sequences for
   minimizing or disabling mDNS per platform.
3. **Drift control**: compare a current scan against a persisted baseline.
4. **Persistence**: store and load baselines from SQLite so roll-forward/rollback
   can be audited.
5. **Risking**: detect sensitive TXT fields leaking local service metadata.

Usage
-----

.. code-block:: python

    from amc.enforce.e11_mdns_controller import MDNSConfig, MDNSController

    cfg = MDNSConfig(discovery_mode="minimal")
    ctrl = MDNSController(cfg)

    result = ctrl.scan_local()
    print(result.risk_level, result.recommendations)

    # Persist and compare later
    ctrl.store_baseline(result)
    baseline = ctrl.get_latest_baseline()
    drift = ctrl.detect_drift(baseline, result)
"""

from __future__ import annotations

import json
import socket
import struct
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
import sqlite3

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class DiscoveryMode(str, Enum):
    """Discovery mode policy levels for local service advertising."""

    OFF = "off"
    MINIMAL = "minimal"
    FULL = "full"


class MDNSService(BaseModel):
    """Single service advertisement discovered over mDNS."""

    name: str
    service_type: str
    port: int | None = None
    txt_records: dict[str, str] = Field(default_factory=dict)


class MDNSScanResult(BaseModel):
    """Result of a local mDNS scan window."""

    scan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    services_found: list[MDNSService] = Field(default_factory=list)
    sensitive_fields_leaked: list[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.SAFE
    recommendations: list[str] = Field(default_factory=list)
    raw_packet_count: int = 0


class MDNSConfig(BaseModel):
    """Runtime configuration for mDNS controller enforcement."""

    discovery_mode: DiscoveryMode = DiscoveryMode.FULL
    allowed_txt_fields: list[str] = Field(default_factory=list)
    alert_on_sensitive_fields: list[str] = Field(
        default_factory=lambda: ["path", "version", "token"]
    )


# ---------------------------------------------------------------------------
# mDNS parsing helpers
# ---------------------------------------------------------------------------


# DNS classes/types used for very small mDNS subset parsing.
_DNS_CLASS_IN = 1
_DNS_TYPE_PTR = 12
_DNS_TYPE_SRV = 33
_DNS_TYPE_TXT = 16


@dataclass(frozen=True)
class _DNSHeader:
    qdcount: int
    ancount: int
    nscount: int
    arcount: int


def _read_u16_be(data: bytes, offset: int) -> tuple[int, int]:
    if offset + 2 > len(data):
        raise ValueError("truncated DNS header")
    return struct.unpack_from("!H", data, offset)[0], offset + 2


def _parse_dns_name(data: bytes, offset: int) -> tuple[str, int]:
    """Parse a DNS-encoded domain name with simple compression support."""
    parts: list[str] = []
    visited = set()

    idx = offset
    jumped = False
    end_offset = offset

    while True:
        if idx >= len(data):
            raise ValueError("truncated DNS name")

        length = data[idx]
        idx += 1

        # Name-compression pointer.
        if length & 0xC0 == 0xC0:
            if idx >= len(data):
                raise ValueError("truncated DNS compression")
            ptr = ((length & 0x3F) << 8) | data[idx]
            idx += 1
            if ptr in visited:
                raise ValueError("DNS compression loop")
            visited.add(ptr)
            if not jumped:
                end_offset = idx
                jumped = True
            idx = ptr
            continue

        # Root / end of name.
        if length == 0:
            break

        if idx + length > len(data):
            raise ValueError("truncated DNS label")
        label = data[idx : idx + length].decode("utf-8", errors="ignore")
        parts.append(label)
        idx += length

    if not jumped:
        end_offset = idx
    return ".".join(parts), end_offset


def _parse_question_section(data: bytes, offset: int, qdcount: int) -> int:
    """Skip question section to preserve cursor position."""
    cur = offset
    for _ in range(qdcount):
        _, cur = _parse_dns_name(data, cur)
        if cur + 4 > len(data):
            raise ValueError("truncated question section")
        cur += 4  # type + class
    return cur


def _parse_txt_rdata(data: bytes) -> dict[str, str]:
    """Parse TXT rdata bytes into a mapping of key/value pairs."""
    txt: dict[str, str] = {}
    idx = 0
    while idx < len(data):
        size = data[idx]
        idx += 1
        if size == 0:
            continue
        if idx + size > len(data):
            break
        blob = data[idx : idx + size]
        idx += size

        if b"=" in blob:
            k, _, v = blob.partition(b"=")
            key = k.decode("utf-8", errors="ignore").strip().lower()
            val = v.decode("utf-8", errors="ignore")
            txt[key] = val
        else:
            key = blob.decode("utf-8", errors="ignore").strip().lower()
            txt[key] = ""
    return txt


def _parse_mdns_records(data: bytes, start_offset: int, count: int) -> list[dict[str, Any]]:
    """Parse a small subset of DNS resource records."""
    records: list[dict[str, Any]] = []
    cur = start_offset

    for _ in range(count):
        try:
            name, cur = _parse_dns_name(data, cur)
        except ValueError as exc:
            logger.warning("mdns.parse.name_failed", error=str(exc), offset=cur)
            return records

        if cur + 10 > len(data):
            break

        rr_type, cur = _read_u16_be(data, cur)
        rr_class, cur = _read_u16_be(data, cur)
        _ttl, cur = _read_u16_be(data, cur)
        ttl_low, cur = _read_u16_be(data, cur)
        ttl = (ttl_low << 16) | _ttl
        rdlen, cur = _read_u16_be(data, cur)

        if cur + rdlen > len(data):
            break
        rdata = data[cur : cur + rdlen]
        cur += rdlen

        if rr_class != _DNS_CLASS_IN:
            continue

        records.append(
            {
                "name": name,
                "type": rr_type,
                "ttl": ttl,
                "rdata": rdata,
            }
        )

    return records


def _risk_for_scan(services: list[MDNSService], sensitive: list[str]) -> RiskLevel:
    if not services:
        return RiskLevel.SAFE
    if sensitive:
        return RiskLevel.HIGH
    if len(services) > 10:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------


class MDNSController:
    """Scan for mDNS announcements, evaluate exposure, and manage policy plans."""

    def __init__(self, config: MDNSConfig | None = None, db_path: str = "mdns_controller.db") -> None:
        self.config = config or MDNSConfig()
        self._db_path = Path(db_path)
        self._sensitive_tokens = {"token", "key", "path", "secret", "admin", "password"}
        self._init_db()
        logger.info("mdns.controller.init", db=str(self._db_path), mode=self.config.discovery_mode.value)

    # ------------------------------- persistence --------------------------------

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mdns_baselines (
                    baseline_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )

    def store_baseline(self, result: MDNSScanResult) -> str:
        """Persist a scan result and return its baseline id."""
        data = result.model_dump(mode="json")
        baseline_id = data["scan_id"]
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                "INSERT INTO mdns_baselines (baseline_id, created_at, payload) VALUES (?, ?, ?)",
                (baseline_id, datetime.now(timezone.utc).isoformat(), json.dumps(data)),
            )
        logger.info("mdns.baseline.saved", baseline_id=baseline_id, services=len(result.services_found))
        return baseline_id

    def get_latest_baseline(self) -> MDNSScanResult | None:
        """Return most recent persisted baseline, if any."""
        with sqlite3.connect(str(self._db_path)) as conn:
            row = conn.execute(
                "SELECT payload FROM mdns_baselines ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        payload = json.loads(row[0])
        return MDNSScanResult.model_validate(payload)

    # ------------------------------- scan --------------------------------------

    def _build_recommendations(self, result: MDNSScanResult) -> list[str]:
        recommendations: list[str] = []
        if result.services_found:
            recommendations.append(
                "Disable or restrict mDNS on interfaces that do not require service discovery."
            )
        if result.sensitive_fields_leaked:
            recommendations.append(
                "Review TXT fields for exposed path/version/token-like metadata and trim allowed_txt_fields."
            )
        if self.config.discovery_mode == DiscoveryMode.OFF:
            recommendations.append("mDNS is in OFF mode; enforce commands should be executed. ")
        elif self.config.discovery_mode == DiscoveryMode.MINIMAL:
            recommendations.append("Keep PTR records but strip sensitive TXT keys and disable publishing. ")
        return recommendations

    def scan_local(self, duration_seconds: float = 3.0) -> MDNSScanResult:
        """Capture UDP/5353 packets for a bounded window and parse mDNS metadata.

        The implementation intentionally avoids binding to privileged interfaces or
        issuing socket joins. It simply listens on UDP/5353 and parses responses
        when present.
        """
        services: dict[str, MDNSService] = {}
        sensitive_hits: list[str] = []
        raw_packet_count = 0

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.settimeout(0.2)
                sock.bind(("", 5353))
            except OSError as exc:
                logger.error("mdns.scan.bind_failed", error=str(exc))
                return MDNSScanResult(
                    services_found=[],
                    sensitive_fields_leaked=[],
                    risk_level=RiskLevel.HIGH,
                    recommendations=["Bind on UDP/5353 failed; run with required privileges."],
                )

            deadline = time.time() + duration_seconds
            while time.time() < deadline:
                timeout = max(0.0, deadline - time.time())
                sock.settimeout(timeout)
                try:
                    packet, _addr = sock.recvfrom(4096)
                except socket.timeout:
                    continue
                except OSError:
                    break

                raw_packet_count += 1
                if len(packet) < 12:
                    continue

                try:
                    # header
                    qdcount = struct.unpack_from("!H", packet, 4)[0]
                    ancount = struct.unpack_from("!H", packet, 6)[0]
                    nscount = struct.unpack_from("!H", packet, 8)[0]
                    arcount = struct.unpack_from("!H", packet, 10)[0]
                    offset = 12
                    offset = _parse_question_section(packet, offset, qdcount)
                    answers = _parse_mdns_records(packet, offset, ancount + nscount + arcount)
                except Exception as exc:  # pragma: no cover - parser edge cases
                    logger.debug("mdns.scan.parse_error", error=str(exc))
                    continue

                for rec in answers:
                    rr_type = rec["type"]
                    name = rec["name"]
                    rdata = rec["rdata"]

                    if rr_type == _DNS_TYPE_PTR:
                        # owner is service type, target is service instance/hostname
                        try:
                            target, _ = _parse_dns_name(rdata, 0)
                        except Exception:
                            continue
                        services.setdefault(
                            target,
                            MDNSService(name=name, service_type=name),
                        )

                    elif rr_type == _DNS_TYPE_TXT:
                        txt = _parse_txt_rdata(rdata)
                        service = services.setdefault(
                            name,
                            MDNSService(name=name, service_type="unknown"),
                        )
                        # merge/overwrite
                        service.txt_records.update(txt)
                        sensitive_hits.extend(
                            [
                                k
                                for k in txt
                                if k.lower() in self._sensitive_tokens
                                and k.lower() not in sensitive_hits
                                and k.lower() not in [s.lower() for s in sensitive_hits]
                            ]
                        )

                    elif rr_type == _DNS_TYPE_SRV:
                        if len(rdata) < 6:
                            continue
                        _priority, _weight, port = struct.unpack("!HHH", rdata[:6])
                        service = services.setdefault(name, MDNSService(name=name, service_type="unknown"))
                        service.port = int(port)

        finally:
            sock.close()

        allowed = {f.lower() for f in self.config.allowed_txt_fields}
        # prune disallowed txt fields in report (policy visibility)
        for svc in services.values():
            if self.config.discovery_mode == DiscoveryMode.OFF:
                # In OFF mode treat everything as exposed if present.
                pass
            # Remove empty txt keys after policy allowlist
            svc.txt_records = {
                k: v
                for k, v in svc.txt_records.items()
                if not self.config.allowed_txt_fields or k.lower() in allowed
            }

        result = MDNSScanResult(
            services_found=list(services.values()),
            sensitive_fields_leaked=sorted(set(
                field.lower()
                for field in sensitive_hits
                if field.lower() in self._sensitive_tokens
                or field.lower() in [f.lower() for f in self.config.alert_on_sensitive_fields]
            )),
            raw_packet_count=raw_packet_count,
        )
        result.risk_level = _risk_for_scan(result.services_found, result.sensitive_fields_leaked)
        result.recommendations = self._build_recommendations(result)
        logger.info(
            "mdns.scan.complete",
            services=len(result.services_found),
            sensitive=len(result.sensitive_fields_leaked),
            risk=result.risk_level.value,
            packets=raw_packet_count,
        )
        return result

    # ------------------------------- policy -------------------------------------

    def enforce_policy(self, config: MDNSConfig | None = None) -> list[str]:
        """Generate non-executed shell commands for this OS + desired policy."""
        cfg = config or self.config
        commands: list[str] = []

        if cfg.discovery_mode == DiscoveryMode.OFF:
            commands += [
                "sudo launchctl bootout system/com.apple.mDNSResponder",
                "sudo launchctl disable system/com.apple.mDNSResponder",
                "sudo systemctl stop avahi-daemon",
                "sudo systemctl disable avahi-daemon",
            ]
        elif cfg.discovery_mode == DiscoveryMode.MINIMAL:
            commands += [
                "defaults write /Library/Preferences/com.apple.mDNSResponder.plist NoMulticastAdvertisements -bool YES && killall -HUP mDNSResponder",
                "sudo sed -i'' 's/^publish-.*$/publish=yes/' /etc/avahi/avahi-daemon.conf",
                "sudo systemctl restart avahi-daemon",
            ]
        else:  # FULL
            commands += [
                "# No-op: FULL mode keeps current discovery behavior.",
            ]

        return [cmd for cmd in commands if cmd]

    def auto_rollback_config(self, config: MDNSConfig | None = None) -> list[str]:
        """Generate rollback commands that reverse :meth:`enforce_policy`."""
        cfg = config or self.config
        if cfg.discovery_mode == DiscoveryMode.OFF:
            return [
                "sudo launchctl enable system/com.apple.mDNSResponder",
                "sudo launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.mDNSResponder.plist",
                "sudo systemctl enable avahi-daemon",
                "sudo systemctl start avahi-daemon",
            ]
        if cfg.discovery_mode == DiscoveryMode.MINIMAL:
            return [
                "# Restore service publish behavior as documented by environment defaults",
                "sudo avahi-daemon --reload",
                "defaults delete /Library/Preferences/com.apple.mDNSResponder.plist NoMulticastAdvertisements",
                "killall -HUP mDNSResponder",
            ]
        return ["# No rollback action required for FULL mode"]

    # ------------------------------- drift --------------------------------------

    def detect_drift(
        self,
        baseline: MDNSScanResult,
        current: MDNSScanResult,
    ) -> list[str]:
        """Compare two scan snapshots and list material differences."""
        changes: list[str] = []

        baseline_service_map = {
            srv.name: {
                "service_type": srv.service_type,
                "port": srv.port,
                "txt": dict(srv.txt_records),
            }
            for srv in baseline.services_found
        }
        current_service_map = {
            srv.name: {
                "service_type": srv.service_type,
                "port": srv.port,
                "txt": dict(srv.txt_records),
            }
            for srv in current.services_found
        }

        baseline_names = set(baseline_service_map)
        current_names = set(current_service_map)

        for added in sorted(current_names - baseline_names):
            changes.append(f"new_service:{added}")
        for removed in sorted(baseline_names - current_names):
            changes.append(f"removed_service:{removed}")

        for name in baseline_names & current_names:
            b = baseline_service_map[name]
            c = current_service_map[name]
            if b["service_type"] != c["service_type"]:
                changes.append(f"service_type_changed:{name}")
            if b["port"] != c["port"]:
                changes.append(f"port_changed:{name}")
            if b["txt"] != c["txt"]:
                changes.append(f"txt_changed:{name}")

        if set(baseline.sensitive_fields_leaked) != set(current.sensitive_fields_leaked):
            changes.append("sensitive_fields_changed")

        if not changes:
            changes.append("no_drift")

        logger.info("mdns.detect_drift", changes=len(changes), items=changes)
        return changes


__all__ = [
    "MDNSController",
    "MDNSConfig",
    "MDNSScanResult",
    "MDNSService",
    "DiscoveryMode",
]
