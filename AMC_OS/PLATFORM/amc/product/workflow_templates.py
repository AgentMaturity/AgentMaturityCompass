"""
workflow_templates.py — Workflow Template Marketplace
Template CRUD, categories, install/uninstall, versioning. SQLite-backed.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TemplateStep(BaseModel):
    step_id: str
    name: str
    description: str
    tool: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class WorkflowTemplate(BaseModel):
    template_id: str
    name: str
    version: str  # semver e.g. "1.2.0"
    category: str
    description: str
    author: str
    tags: list[str]
    steps: list[TemplateStep]
    config_schema: dict[str, Any]  # JSON Schema for template parameters
    is_published: bool
    install_count: int
    rating: float  # 0.0-5.0
    created_at: str
    updated_at: str
    metadata: dict[str, Any]


class TemplateCreateRequest(BaseModel):
    name: str
    version: str = "1.0.0"
    category: str = "general"
    description: str = ""
    author: str = ""
    tags: list[str] = Field(default_factory=list)
    steps: list[TemplateStep] = Field(default_factory=list)
    config_schema: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TemplateUpdateRequest(BaseModel):
    name: str | None = None
    version: str | None = None
    description: str | None = None
    steps: list[TemplateStep] | None = None
    config_schema: dict[str, Any] | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None


class InstallRecord(BaseModel):
    install_id: str
    template_id: str
    template_version: str
    tenant_id: str
    installed_at: str
    config_overrides: dict[str, Any]
    is_active: bool


class TemplateInstallRequest(BaseModel):
    template_id: str
    tenant_id: str
    config_overrides: dict[str, Any] = Field(default_factory=dict)


class TemplateSearchRequest(BaseModel):
    query: str = ""
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    min_rating: float = 0.0
    limit: int = 20
    offset: int = 0


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class WorkflowTemplateMarketplace:
    """Marketplace for workflow templates: CRUD, versioning, installs, ratings."""

    def __init__(self, db_path: str | None = None) -> None:
        self._db_path = db_path or str(product_db_path("workflow_templates.db"))
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()
        logger.info("WorkflowTemplateMarketplace initialised", db_path=self._db_path)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS workflow_templates (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id        TEXT NOT NULL UNIQUE,
                name               TEXT NOT NULL,
                version            TEXT NOT NULL DEFAULT '1.0.0',
                category           TEXT NOT NULL DEFAULT 'general',
                description        TEXT NOT NULL DEFAULT '',
                author             TEXT NOT NULL DEFAULT '',
                tags_json          TEXT NOT NULL DEFAULT '[]',
                steps_json         TEXT NOT NULL DEFAULT '[]',
                config_schema_json TEXT NOT NULL DEFAULT '{}',
                is_published       INTEGER NOT NULL DEFAULT 0,
                install_count      INTEGER NOT NULL DEFAULT 0,
                rating             REAL NOT NULL DEFAULT 0.0,
                rating_count       INTEGER NOT NULL DEFAULT 0,
                metadata_json      TEXT NOT NULL DEFAULT '{}',
                created_at         TEXT NOT NULL,
                updated_at         TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_wt_category   ON workflow_templates(category);
            CREATE INDEX IF NOT EXISTS idx_wt_published  ON workflow_templates(is_published);
            CREATE INDEX IF NOT EXISTS idx_wt_rating     ON workflow_templates(rating);

            CREATE TABLE IF NOT EXISTS template_installs (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                install_id           TEXT NOT NULL UNIQUE,
                template_id          TEXT NOT NULL,
                template_version     TEXT NOT NULL,
                tenant_id            TEXT NOT NULL,
                installed_at         TEXT NOT NULL,
                config_overrides_json TEXT NOT NULL DEFAULT '{}',
                is_active            INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_ti_tenant     ON template_installs(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_ti_template   ON template_installs(template_id);

            CREATE TABLE IF NOT EXISTS template_versions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id TEXT NOT NULL,
                version     TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                created_at  TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tv_template ON template_versions(template_id);
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_template(row: sqlite3.Row) -> WorkflowTemplate:
        steps_raw = json.loads(row["steps_json"])
        steps = [TemplateStep(**s) for s in steps_raw]
        return WorkflowTemplate(
            template_id=row["template_id"],
            name=row["name"],
            version=row["version"],
            category=row["category"],
            description=row["description"],
            author=row["author"],
            tags=json.loads(row["tags_json"]),
            steps=steps,
            config_schema=json.loads(row["config_schema_json"]),
            is_published=bool(row["is_published"]),
            install_count=row["install_count"],
            rating=row["rating"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    @staticmethod
    def _row_to_install(row: sqlite3.Row) -> InstallRecord:
        return InstallRecord(
            install_id=row["install_id"],
            template_id=row["template_id"],
            template_version=row["template_version"],
            tenant_id=row["tenant_id"],
            installed_at=row["installed_at"],
            config_overrides=json.loads(row["config_overrides_json"]),
            is_active=bool(row["is_active"]),
        )

    def _snapshot_template(self, template: WorkflowTemplate) -> None:
        """Save a version snapshot to template_versions."""
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO template_versions (template_id, version, snapshot_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                template.template_id,
                template.version,
                template.model_dump_json(),
                now,
            ),
        )

    # ------------------------------------------------------------------
    # Template CRUD
    # ------------------------------------------------------------------

    def create_template(self, request: TemplateCreateRequest) -> WorkflowTemplate:
        template_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        steps_json = json.dumps([s.model_dump() for s in request.steps])

        self._conn.execute(
            """
            INSERT INTO workflow_templates
                (template_id, name, version, category, description, author,
                 tags_json, steps_json, config_schema_json, is_published,
                 install_count, rating, rating_count, metadata_json,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0.0, 0, ?, ?, ?)
            """,
            (
                template_id,
                request.name,
                request.version,
                request.category,
                request.description,
                request.author,
                json.dumps(request.tags),
                steps_json,
                json.dumps(request.config_schema),
                json.dumps(request.metadata),
                now,
                now,
            ),
        )
        self._conn.commit()

        template = self.get_template(template_id)
        assert template is not None
        self._snapshot_template(template)
        self._conn.commit()

        logger.info("template created", template_id=template_id, name=request.name)
        return template

    def get_template(self, template_id: str) -> WorkflowTemplate | None:
        row = self._conn.execute(
            "SELECT * FROM workflow_templates WHERE template_id = ?", (template_id,)
        ).fetchone()
        if row is None:
            return None
        return self._row_to_template(row)

    def update_template(
        self, template_id: str, request: TemplateUpdateRequest
    ) -> WorkflowTemplate | None:
        existing = self.get_template(template_id)
        if existing is None:
            logger.warning("update_template: not found", template_id=template_id)
            return None

        now = datetime.now(timezone.utc).isoformat()
        fields: list[str] = []
        params: list[Any] = []

        if request.name is not None:
            fields.append("name = ?")
            params.append(request.name)
        if request.version is not None:
            fields.append("version = ?")
            params.append(request.version)
        if request.description is not None:
            fields.append("description = ?")
            params.append(request.description)
        if request.steps is not None:
            fields.append("steps_json = ?")
            params.append(json.dumps([s.model_dump() for s in request.steps]))
        if request.config_schema is not None:
            fields.append("config_schema_json = ?")
            params.append(json.dumps(request.config_schema))
        if request.tags is not None:
            fields.append("tags_json = ?")
            params.append(json.dumps(request.tags))
        if request.metadata is not None:
            fields.append("metadata_json = ?")
            params.append(json.dumps(request.metadata))

        if not fields:
            return existing

        fields.append("updated_at = ?")
        params.append(now)
        params.append(template_id)

        self._conn.execute(
            f"UPDATE workflow_templates SET {', '.join(fields)} WHERE template_id = ?",
            params,
        )
        self._conn.commit()

        updated = self.get_template(template_id)
        assert updated is not None
        self._snapshot_template(updated)
        self._conn.commit()

        logger.info("template updated", template_id=template_id)
        return updated

    def delete_template(self, template_id: str) -> bool:
        cur = self._conn.execute(
            "DELETE FROM workflow_templates WHERE template_id = ?", (template_id,)
        )
        self._conn.commit()
        ok = cur.rowcount > 0
        logger.info("template deleted", template_id=template_id, ok=ok)
        return ok

    def publish_template(self, template_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        cur = self._conn.execute(
            "UPDATE workflow_templates SET is_published = 1, updated_at = ? WHERE template_id = ?",
            (now, template_id),
        )
        self._conn.commit()
        ok = cur.rowcount > 0
        logger.info("template published", template_id=template_id, ok=ok)
        return ok

    # ------------------------------------------------------------------
    # Search & browse
    # ------------------------------------------------------------------

    def search_templates(self, request: TemplateSearchRequest) -> list[WorkflowTemplate]:
        conditions: list[str] = ["rating >= ?"]
        params: list[Any] = [request.min_rating]

        if request.query:
            like = f"%{request.query}%"
            conditions.append("(name LIKE ? OR description LIKE ? OR tags_json LIKE ?)")
            params += [like, like, like]

        if request.category:
            conditions.append("category = ?")
            params.append(request.category)

        if request.tags:
            for tag in request.tags:
                conditions.append("tags_json LIKE ?")
                params.append(f'%"{tag}"%')

        where = " AND ".join(conditions)
        sql = (
            f"SELECT * FROM workflow_templates WHERE {where} "
            f"ORDER BY install_count DESC, rating DESC LIMIT ? OFFSET ?"
        )
        params += [request.limit, request.offset]

        rows = self._conn.execute(sql, params).fetchall()
        return [self._row_to_template(r) for r in rows]

    def list_categories(self) -> list[str]:
        rows = self._conn.execute(
            "SELECT DISTINCT category FROM workflow_templates ORDER BY category"
        ).fetchall()
        return [r["category"] for r in rows]

    # ------------------------------------------------------------------
    # Install / uninstall
    # ------------------------------------------------------------------

    def install_template(self, request: TemplateInstallRequest) -> InstallRecord:
        template = self.get_template(request.template_id)
        if template is None:
            raise ValueError(f"Template not found: {request.template_id}")

        install_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """
            INSERT INTO template_installs
                (install_id, template_id, template_version, tenant_id,
                 installed_at, config_overrides_json, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (
                install_id,
                request.template_id,
                template.version,
                request.tenant_id,
                now,
                json.dumps(request.config_overrides),
            ),
        )
        # Increment install_count
        self._conn.execute(
            "UPDATE workflow_templates SET install_count = install_count + 1, updated_at = ? WHERE template_id = ?",
            (now, request.template_id),
        )
        self._conn.commit()

        record = self._row_to_install(
            self._conn.execute(
                "SELECT * FROM template_installs WHERE install_id = ?", (install_id,)
            ).fetchone()
        )
        logger.info(
            "template installed",
            install_id=install_id,
            template_id=request.template_id,
            tenant_id=request.tenant_id,
        )
        return record

    def uninstall_template(self, install_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        # Mark inactive rather than hard-delete to preserve audit trail
        cur = self._conn.execute(
            "UPDATE template_installs SET is_active = 0 WHERE install_id = ?",
            (install_id,),
        )
        self._conn.commit()
        ok = cur.rowcount > 0
        logger.info("template uninstalled", install_id=install_id, ok=ok)
        return ok

    def list_installs(self, tenant_id: str) -> list[InstallRecord]:
        rows = self._conn.execute(
            "SELECT * FROM template_installs WHERE tenant_id = ? ORDER BY installed_at DESC",
            (tenant_id,),
        ).fetchall()
        return [self._row_to_install(r) for r in rows]

    # ------------------------------------------------------------------
    # Ratings
    # ------------------------------------------------------------------

    def rate_template(self, template_id: str, rating: float) -> bool:
        rating = max(0.0, min(5.0, rating))
        row = self._conn.execute(
            "SELECT rating, rating_count FROM workflow_templates WHERE template_id = ?",
            (template_id,),
        ).fetchone()
        if row is None:
            return False

        old_rating: float = row["rating"]
        old_count: int = row["rating_count"]
        new_count = old_count + 1
        new_rating = ((old_rating * old_count) + rating) / new_count

        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            "UPDATE workflow_templates SET rating = ?, rating_count = ?, updated_at = ? WHERE template_id = ?",
            (new_rating, new_count, now, template_id),
        )
        self._conn.commit()
        logger.info(
            "template rated",
            template_id=template_id,
            rating=rating,
            new_avg=new_rating,
            count=new_count,
        )
        return True

    # ------------------------------------------------------------------
    # Versioning
    # ------------------------------------------------------------------

    def get_versions(self, template_id: str) -> list[str]:
        """Return list of snapshot version strings for a template (oldest → newest)."""
        rows = self._conn.execute(
            "SELECT version FROM template_versions WHERE template_id = ? ORDER BY created_at ASC",
            (template_id,),
        ).fetchall()
        return [r["version"] for r in rows]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: WorkflowTemplateMarketplace | None = None


def get_workflow_template_marketplace() -> WorkflowTemplateMarketplace:
    global _instance
    if _instance is None:
        _instance = WorkflowTemplateMarketplace()
    return _instance


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

__all__ = [
    "TemplateStep",
    "WorkflowTemplate",
    "TemplateCreateRequest",
    "TemplateUpdateRequest",
    "InstallRecord",
    "TemplateInstallRequest",
    "TemplateSearchRequest",
    "WorkflowTemplateMarketplace",
    "get_workflow_template_marketplace",
]
