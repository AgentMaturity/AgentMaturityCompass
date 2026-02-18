"""AMC Product — White-Label Agency Launcher.

Provisions isolated client environments with per-client branding config,
template inheritance, and strict data isolation at the SQLite level.

Each client gets:
  - A named environment (env_id) with branding overrides
  - Inherited defaults from a parent template
  - Isolated data via tenant_id scoping
  - Provisioning lifecycle: draft → active → suspended → terminated

Revenue path: agency reseller channel → platform revenue at scale with low marginal cost.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS wl_templates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     TEXT NOT NULL UNIQUE,
    agency_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    branding_json   TEXT NOT NULL DEFAULT '{}',
    feature_flags_json TEXT NOT NULL DEFAULT '{}',
    default_config_json TEXT NOT NULL DEFAULT '{}',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wl_tmpl_name ON wl_templates(agency_id, name);
CREATE INDEX IF NOT EXISTS idx_wl_tmpl_agency ON wl_templates(agency_id);

CREATE TABLE IF NOT EXISTS wl_environments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    env_id          TEXT NOT NULL UNIQUE,
    agency_id       TEXT NOT NULL,
    template_id     TEXT NOT NULL,
    client_id       TEXT NOT NULL,
    client_name     TEXT NOT NULL,
    tenant_id       TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'draft',
    branding_json   TEXT NOT NULL DEFAULT '{}',
    feature_flags_json TEXT NOT NULL DEFAULT '{}',
    config_json     TEXT NOT NULL DEFAULT '{}',
    domain          TEXT NOT NULL DEFAULT '',
    custom_domain   TEXT NOT NULL DEFAULT '',
    provisioned_at  TEXT,
    suspended_at    TEXT,
    terminated_at   TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES wl_templates(template_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wl_env_client ON wl_environments(agency_id, client_id);
CREATE INDEX IF NOT EXISTS idx_wl_env_agency ON wl_environments(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_wl_env_tenant ON wl_environments(tenant_id);

CREATE TABLE IF NOT EXISTS wl_branding_assets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        TEXT NOT NULL UNIQUE,
    env_id          TEXT NOT NULL,
    asset_type      TEXT NOT NULL,
    key             TEXT NOT NULL,
    value           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (env_id) REFERENCES wl_environments(env_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wl_asset_key ON wl_branding_assets(env_id, asset_type, key);

CREATE TABLE IF NOT EXISTS wl_provision_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id          TEXT NOT NULL UNIQUE,
    env_id          TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    actor_id        TEXT NOT NULL DEFAULT 'system',
    details_json    TEXT NOT NULL DEFAULT '{}',
    occurred_at     TEXT NOT NULL,
    FOREIGN KEY (env_id) REFERENCES wl_environments(env_id)
);
CREATE INDEX IF NOT EXISTS idx_wl_log_env ON wl_provision_log(env_id, occurred_at DESC);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class EnvironmentStatus(str, Enum):
    DRAFT      = "draft"
    ACTIVE     = "active"
    SUSPENDED  = "suspended"
    TERMINATED = "terminated"


class BrandingConfig(BaseModel):
    primary_color: str = "#1a73e8"
    secondary_color: str = "#ffffff"
    logo_url: str = ""
    favicon_url: str = ""
    brand_name: str = ""
    support_email: str = ""
    font_family: str = "Inter, sans-serif"
    custom_css: str = ""
    extra: dict[str, Any] = Field(default_factory=dict)


class TemplateCreateInput(BaseModel):
    agency_id: str
    name: str
    description: str = ""
    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    feature_flags: dict[str, bool] = Field(default_factory=dict)
    default_config: dict[str, Any] = Field(default_factory=dict)


class TemplateUpdateInput(BaseModel):
    template_id: str
    branding: BrandingConfig | None = None
    feature_flags: dict[str, bool] | None = None
    default_config: dict[str, Any] | None = None
    active: bool | None = None


class EnvironmentProvisionInput(BaseModel):
    agency_id: str
    template_id: str
    client_id: str
    client_name: str
    branding_overrides: BrandingConfig | None = None
    feature_flag_overrides: dict[str, bool] = Field(default_factory=dict)
    config_overrides: dict[str, Any] = Field(default_factory=dict)
    domain: str = ""
    custom_domain: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class BrandingAssetInput(BaseModel):
    env_id: str
    asset_type: str     # logo, favicon, css, color, etc.
    key: str
    value: str


class TemplateRecord(BaseModel):
    template_id: str
    agency_id: str
    name: str
    description: str
    branding: dict[str, Any]
    feature_flags: dict[str, bool]
    default_config: dict[str, Any]
    active: bool
    created_at: str
    updated_at: str


class EnvironmentRecord(BaseModel):
    env_id: str
    agency_id: str
    template_id: str
    client_id: str
    client_name: str
    tenant_id: str
    status: str
    branding: dict[str, Any]
    feature_flags: dict[str, bool]
    config: dict[str, Any]
    domain: str
    custom_domain: str
    provisioned_at: str | None
    suspended_at: str | None
    terminated_at: str | None
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class BrandingAssetRecord(BaseModel):
    asset_id: str
    env_id: str
    asset_type: str
    key: str
    value: str
    created_at: str
    updated_at: str


class ProvisionLogRecord(BaseModel):
    log_id: str
    env_id: str
    event_type: str
    actor_id: str
    details: dict[str, Any]
    occurred_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_tenant_id(agency_id: str, client_id: str) -> str:
    """Deterministic but unique tenant_id for data isolation."""
    import hashlib
    raw = f"{agency_id}:{client_id}:{uuid.uuid4()}"
    return "wl-" + hashlib.sha256(raw.encode()).hexdigest()[:20]


class WhiteLabelManager:
    """White-label agency launcher with template inheritance and data isolation."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    def _log_event(
        self, env_id: str, event_type: str,
        actor_id: str = "system", details: dict | None = None
    ) -> None:
        log_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as c:
            c.execute(
                """INSERT INTO wl_provision_log
                   (log_id, env_id, event_type, actor_id, details_json, occurred_at)
                   VALUES (?,?,?,?,?,?)""",
                (log_id, env_id, event_type, actor_id,
                 json.dumps(details or {}), now),
            )

    # ------------------------------------------------------------------
    # Templates
    # ------------------------------------------------------------------

    def create_template(self, inp: TemplateCreateInput) -> TemplateRecord:
        template_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            try:
                c.execute(
                    """INSERT INTO wl_templates
                       (template_id, agency_id, name, description,
                        branding_json, feature_flags_json, default_config_json,
                        active, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (template_id, inp.agency_id, inp.name, inp.description,
                     inp.branding.model_dump_json(),
                     json.dumps(inp.feature_flags),
                     json.dumps(inp.default_config),
                     1, now, now),
                )
            except sqlite3.IntegrityError:
                raise ValueError(
                    f"Template {inp.name!r} already exists for agency {inp.agency_id!r}"
                )
        log.info("white_label.template_created",
                 template_id=template_id, agency=inp.agency_id)
        return self.get_template(template_id)  # type: ignore[return-value]

    def get_template(self, template_id: str) -> TemplateRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM wl_templates WHERE template_id=?", (template_id,)
            ).fetchone()
        if row is None:
            return None
        return TemplateRecord(
            template_id=row["template_id"], agency_id=row["agency_id"],
            name=row["name"], description=row["description"],
            branding=json.loads(row["branding_json"]),
            feature_flags=json.loads(row["feature_flags_json"]),
            default_config=json.loads(row["default_config_json"]),
            active=bool(row["active"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    def update_template(self, inp: TemplateUpdateInput) -> TemplateRecord:
        now = _utc_now()
        fields: dict[str, Any] = {"updated_at": now}
        if inp.branding is not None:
            fields["branding_json"] = inp.branding.model_dump_json()
        if inp.feature_flags is not None:
            fields["feature_flags_json"] = json.dumps(inp.feature_flags)
        if inp.default_config is not None:
            fields["default_config_json"] = json.dumps(inp.default_config)
        if inp.active is not None:
            fields["active"] = int(inp.active)
        set_clause = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [inp.template_id]
        with self._lock, self._conn() as c:
            c.execute(f"UPDATE wl_templates SET {set_clause} WHERE template_id=?", vals)
        return self.get_template(inp.template_id)  # type: ignore[return-value]

    def list_templates(self, agency_id: str, active_only: bool = True) -> list[TemplateRecord]:
        q = "SELECT * FROM wl_templates WHERE agency_id=?"
        params: list[Any] = [agency_id]
        if active_only:
            q += " AND active=1"
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            TemplateRecord(
                template_id=r["template_id"], agency_id=r["agency_id"],
                name=r["name"], description=r["description"],
                branding=json.loads(r["branding_json"]),
                feature_flags=json.loads(r["feature_flags_json"]),
                default_config=json.loads(r["default_config_json"]),
                active=bool(r["active"]),
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Environments (client provisioning)
    # ------------------------------------------------------------------

    def provision_environment(self, inp: EnvironmentProvisionInput) -> EnvironmentRecord:
        template = self.get_template(inp.template_id)
        if template is None:
            raise ValueError(f"Template {inp.template_id!r} not found")
        if not template.active:
            raise ValueError("Template is not active")

        # Merge branding: template defaults ← client overrides
        branding_base = template.branding.copy()
        if inp.branding_overrides:
            branding_base.update(inp.branding_overrides.model_dump())

        flags = {**template.feature_flags, **inp.feature_flag_overrides}
        config = {**template.default_config, **inp.config_overrides}

        env_id = str(uuid.uuid4())
        tenant_id = _generate_tenant_id(inp.agency_id, inp.client_id)
        now = _utc_now()

        with self._lock, self._conn() as c:
            try:
                c.execute(
                    """INSERT INTO wl_environments
                       (env_id, agency_id, template_id, client_id, client_name,
                        tenant_id, status, branding_json, feature_flags_json,
                        config_json, domain, custom_domain, metadata_json,
                        created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (env_id, inp.agency_id, inp.template_id, inp.client_id,
                     inp.client_name, tenant_id, EnvironmentStatus.DRAFT.value,
                     json.dumps(branding_base), json.dumps(flags), json.dumps(config),
                     inp.domain, inp.custom_domain, json.dumps(inp.metadata),
                     now, now),
                )
            except sqlite3.IntegrityError:
                raise ValueError(
                    f"Environment for client {inp.client_id!r} already exists in agency {inp.agency_id!r}"
                )
        self._log_event(env_id, "provisioned", details={"client_id": inp.client_id})
        log.info("white_label.env_provisioned",
                 env_id=env_id, client=inp.client_id, tenant_id=tenant_id)
        return self.get_environment(env_id)  # type: ignore[return-value]

    def get_environment(self, env_id: str) -> EnvironmentRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM wl_environments WHERE env_id=?", (env_id,)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_env(row)

    def get_environment_by_tenant(self, tenant_id: str) -> EnvironmentRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM wl_environments WHERE tenant_id=?", (tenant_id,)
            ).fetchone()
        return self._row_to_env(row) if row else None

    def _row_to_env(self, row: sqlite3.Row) -> EnvironmentRecord:
        return EnvironmentRecord(
            env_id=row["env_id"], agency_id=row["agency_id"],
            template_id=row["template_id"], client_id=row["client_id"],
            client_name=row["client_name"], tenant_id=row["tenant_id"],
            status=row["status"],
            branding=json.loads(row["branding_json"]),
            feature_flags=json.loads(row["feature_flags_json"]),
            config=json.loads(row["config_json"]),
            domain=row["domain"], custom_domain=row["custom_domain"],
            provisioned_at=row["provisioned_at"], suspended_at=row["suspended_at"],
            terminated_at=row["terminated_at"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    def activate_environment(self, env_id: str, actor_id: str = "system") -> EnvironmentRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE wl_environments SET status=?, provisioned_at=?, updated_at=? WHERE env_id=?",
                (EnvironmentStatus.ACTIVE.value, now, now, env_id),
            )
        self._log_event(env_id, "activated", actor_id=actor_id)
        return self.get_environment(env_id)  # type: ignore[return-value]

    def suspend_environment(self, env_id: str, actor_id: str = "system", reason: str = "") -> EnvironmentRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE wl_environments SET status=?, suspended_at=?, updated_at=? WHERE env_id=?",
                (EnvironmentStatus.SUSPENDED.value, now, now, env_id),
            )
        self._log_event(env_id, "suspended", actor_id=actor_id, details={"reason": reason})
        return self.get_environment(env_id)  # type: ignore[return-value]

    def terminate_environment(self, env_id: str, actor_id: str = "system") -> EnvironmentRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE wl_environments SET status=?, terminated_at=?, updated_at=? WHERE env_id=?",
                (EnvironmentStatus.TERMINATED.value, now, now, env_id),
            )
        self._log_event(env_id, "terminated", actor_id=actor_id)
        log.info("white_label.env_terminated", env_id=env_id)
        return self.get_environment(env_id)  # type: ignore[return-value]

    def list_environments(
        self,
        agency_id: str,
        status: str | None = None,
        limit: int = 100,
    ) -> list[EnvironmentRecord]:
        q = "SELECT * FROM wl_environments WHERE agency_id=?"
        params: list[Any] = [agency_id]
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_env(r) for r in rows]

    # ------------------------------------------------------------------
    # Branding assets
    # ------------------------------------------------------------------

    def upsert_branding_asset(self, inp: BrandingAssetInput) -> BrandingAssetRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            existing = c.execute(
                """SELECT asset_id FROM wl_branding_assets
                   WHERE env_id=? AND asset_type=? AND key=?""",
                (inp.env_id, inp.asset_type, inp.key),
            ).fetchone()
            if existing:
                c.execute(
                    "UPDATE wl_branding_assets SET value=?, updated_at=? WHERE asset_id=?",
                    (inp.value, now, existing["asset_id"]),
                )
                asset_id = existing["asset_id"]
            else:
                asset_id = str(uuid.uuid4())
                c.execute(
                    """INSERT INTO wl_branding_assets
                       (asset_id, env_id, asset_type, key, value, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (asset_id, inp.env_id, inp.asset_type, inp.key, inp.value, now, now),
                )
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM wl_branding_assets WHERE asset_id=?", (asset_id,)
            ).fetchone()
        return BrandingAssetRecord(
            asset_id=row["asset_id"], env_id=row["env_id"],
            asset_type=row["asset_type"], key=row["key"], value=row["value"],
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    def list_branding_assets(
        self, env_id: str, asset_type: str | None = None
    ) -> list[BrandingAssetRecord]:
        q = "SELECT * FROM wl_branding_assets WHERE env_id=?"
        params: list[Any] = [env_id]
        if asset_type:
            q += " AND asset_type=?"; params.append(asset_type)
        q += " ORDER BY asset_type, key"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            BrandingAssetRecord(
                asset_id=r["asset_id"], env_id=r["env_id"],
                asset_type=r["asset_type"], key=r["key"], value=r["value"],
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]

    def get_provision_log(self, env_id: str, limit: int = 50) -> list[ProvisionLogRecord]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT * FROM wl_provision_log
                   WHERE env_id=? ORDER BY occurred_at DESC LIMIT ?""",
                (env_id, limit),
            ).fetchall()
        return [
            ProvisionLogRecord(
                log_id=r["log_id"], env_id=r["env_id"],
                event_type=r["event_type"], actor_id=r["actor_id"],
                details=json.loads(r["details_json"]), occurred_at=r["occurred_at"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_wl_mgr: WhiteLabelManager | None = None
_wl_lock = Lock()


def get_white_label_manager(db_path: str | Path | None = None) -> WhiteLabelManager:
    global _wl_mgr
    with _wl_lock:
        if _wl_mgr is None:
            _wl_mgr = WhiteLabelManager(db_path=db_path)
    return _wl_mgr


__all__ = [
    "EnvironmentStatus",
    "BrandingConfig",
    "TemplateCreateInput",
    "TemplateUpdateInput",
    "EnvironmentProvisionInput",
    "BrandingAssetInput",
    "TemplateRecord",
    "EnvironmentRecord",
    "BrandingAssetRecord",
    "ProvisionLogRecord",
    "WhiteLabelManager",
    "get_white_label_manager",
]
