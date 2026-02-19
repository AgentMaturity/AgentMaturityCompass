"""
AMC Vault — V3: Honeytoken / Canary System

A canary system for detecting credential/secret egress:
- generate realistic fake tokens
- embed canaries into text or files
- maintain fast lookup registry in SQLite
- detect when canaries appear in outbound payloads
- trigger alerts and optional callbacks

Usage:
    hm = HoneytokenManager()
    tok = hm.generate_token("api_key")
    with open("notes.md", "w") as f:
        f.write(hm.plant_in_file("notes.md", tok))

    if hm.is_canary(tok):
        print("valid canary")

    alerts = hm.scan_outbound("POST key=sk-live-... includes maybe canary: {tok}")
"""

from __future__ import annotations

import re
import secrets
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

_TOKEN_TYPE_RE = re.compile(r"[A-Za-z0-9+/_-]{8,}")


class CanaryAlert(BaseModel):
    """Signal generated when outbound text contains a canary."""

    request_id: str | None = None
    token: str
    token_type: str
    reason: str = "canary detected in outbound content"
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_context: str = ""


class HoneytokenManagerConfig(BaseModel):
    db_path: str = "amc_honeytokens.db"
    logs_dir: str = "AMC_OS/LOGS"
    on_trigger_callback: Callable[[CanaryAlert], None] | None = None


SCHEMA = """
CREATE TABLE IF NOT EXISTS canary_registry (
    token TEXT PRIMARY KEY,
    token_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    planted_in_file INTEGER NOT NULL DEFAULT 0,
    planted_in_text INTEGER NOT NULL DEFAULT 0,
    value_preview TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS canary_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    request_id TEXT,
    reason TEXT NOT NULL,
    source_context TEXT,
    triggered_at TEXT NOT NULL,
    action TEXT NOT NULL
);
"""


@dataclass
class HoneytokenPolicy:
    file_marker: str = "[CANARY]"
    text_marker: str = "CANARY"


class HoneytokenManager:
    """Generate, plant, and detect honey tokens."""

    def __init__(self, config: HoneytokenManagerConfig | None = None) -> None:
        self.config = config or HoneytokenManagerConfig()
        self.db_path = Path(self.config.db_path)
        self.logs_dir = Path(self.config.logs_dir)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._policy = HoneytokenPolicy()

        self._cache: set[str] = set()
        self._refresh_cache()

    def close(self) -> None:
        self._conn.close()

    def _refresh_cache(self) -> None:
        rows = self._conn.execute("SELECT token FROM canary_registry WHERE active = 1").fetchall()
        self._cache = {row["token"] for row in rows}

    def _preview(self, token: str) -> str:
        return token[:8] + "..." + token[-4:]

    def _insert_registry(self, token: str, token_type: str, planted_in_file: bool = False, planted_in_text: bool = False) -> None:
        self._conn.execute(
            """INSERT OR IGNORE INTO canary_registry
            (token, token_type, created_at, planted_in_file, planted_in_text, value_preview)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (
                token,
                token_type,
                datetime.now(timezone.utc).isoformat(),
                int(planted_in_file),
                int(planted_in_text),
                self._preview(token),
            ),
        )
        self._conn.commit()
        self._cache.add(token)

    def generate_token(self, token_type: str) -> str:
        """Generate a realistic fake token for the requested token type.

        token_type supported: api_key|file|database_url|email
        """
        if token_type not in {"api_key", "file", "database_url", "email"}:
            raise ValueError("token_type must be api_key|file|database_url|email")

        if token_type == "api_key":
            token = "sk-live-" + secrets.token_urlsafe(24)
        elif token_type == "file":
            token = "filekey_" + secrets.token_hex(20)
        elif token_type == "database_url":
            token = "postgres://user:pass" + secrets.token_urlsafe(8) + "@db.internal:5432/prod"
        else:  # email
            token = "mailto:" + secrets.token_hex(10) + "@example.invalid"

        self._insert_registry(token, token_type)
        log.info("honeytoken.generated", token_type=token_type, token_preview=self._preview(token))
        return token

    def plant_in_file(self, path: str | Path, token: str) -> str:
        """Embed a canary token in a file and return resulting file content."""
        if token not in self._cache and not self.is_canary(token):
            self._insert_registry(token, "file")
        p = Path(path)
        marker = f"\n# {self._policy.file_marker}: {token}\n"
        existing = p.read_text() if p.exists() else ""
        planted = existing + marker
        p.write_text(planted)
        self._conn.execute(
            """UPDATE canary_registry
             SET planted_in_file = 1
             WHERE token = ?""",
            (token,),
        )
        self._conn.commit()
        log.info("honeytoken.planted_in_file", path=str(p), token_preview=self._preview(token))
        return planted

    def plant_in_text(self, text: str) -> str:
        """Return text with an embedded canary token."""
        token_type = "email" if "@" in text else "api_key"
        token = self.generate_token(token_type)
        embedded = f"{text}\n\n{self._policy.text_marker}: {token}\n"
        self._conn.execute(
            """UPDATE canary_registry
             SET planted_in_text = 1
             WHERE token = ?""",
            (token,),
        )
        self._conn.commit()
        return embedded

    def is_canary(self, value: str) -> bool:
        """Fast registry lookup by exact value."""
        return value in self._cache or self._is_canary_fallback(value)

    def _is_canary_fallback(self, value: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM canary_registry WHERE token = ? LIMIT 1", (value,)
        ).fetchone()
        if row:
            self._cache.add(value)
            return True
        return False

    def on_trigger(self, alert: CanaryAlert) -> None:
        """Handle a canary trigger (log + callback)."""
        self._conn.execute(
            """INSERT INTO canary_events
             (token, request_id, reason, source_context, triggered_at, action)
             VALUES (?, ?, ?, ?, ?, ?)""",
            (
                alert.token,
                alert.request_id,
                alert.reason,
                alert.source_context,
                alert.detected_at.isoformat(),
                "trigger",
            ),
        )
        self._conn.commit()

        path = self.logs_dir / "INJECTION_ATTEMPTS.md"
        line = (
            f"- ts={alert.detected_at.isoformat()} token={alert.token} "
            f"type={alert.token_type} request={alert.request_id or '-'} reason={alert.reason!r}\n"
            f"  context={alert.source_context}\n"
        )
        path.write_text(path.read_text() + line if path.exists() else line)

        if self.config.on_trigger_callback:
            try:
                self.config.on_trigger_callback(alert)
            except Exception:
                log.exception("honeytoken.callback_failed", token=alert.token)

        log.warning("honeytoken.trigger", token=alert.token, token_type=alert.token_type)

    def scan_outbound(self, text: str) -> list[CanaryAlert]:
        """Scan text for planted canaries and emit alerts."""
        alerts: list[CanaryAlert] = []
        for token in _TOKEN_TYPE_RE.findall(text):
            if not self.is_canary(token):
                continue
            rows = self._conn.execute(
                "SELECT token_type FROM canary_registry WHERE token = ? LIMIT 1", (token,)
            ).fetchone()
            token_type = rows["token_type"] if rows else "unknown"
            alert = CanaryAlert(
                token=token,
                token_type=token_type,
                source_context=text[:120],
            )
            alerts.append(alert)
            self.on_trigger(alert)

        return alerts
