"""Prompt modularization system for AMC platform.

Provides reusable prompt components (role / constraints / format / domain),
composition of prompts from named modules, and versioning via SQLite.

Architecture:
- ``PromptModule``: atomic reusable snippet with a type and content
- ``PromptTemplate``: ordered composition of module references
- ``PromptVersion``: immutable snapshot of a composed prompt string
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from amc.product.persistence import product_db_path

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_PM_SCHEMA = """
CREATE TABLE IF NOT EXISTS pm_modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    module_type TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pm_modules_type
    ON pm_modules(module_type);

CREATE TABLE IF NOT EXISTS pm_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    module_refs_json TEXT NOT NULL DEFAULT '[]',
    separator TEXT NOT NULL DEFAULT '\n\n',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pm_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    version INTEGER NOT NULL,
    composed_text TEXT NOT NULL,
    module_snapshot_json TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(template_id, version),
    FOREIGN KEY(template_id) REFERENCES pm_templates(id)
);
CREATE INDEX IF NOT EXISTS idx_pm_versions_template
    ON pm_versions(template_id, version DESC);
"""

_PM_DB_FILE = "amc_product_prompt_modules.db"

# Module type registry
MODULE_TYPES = {"role", "constraints", "format", "domain", "instruction", "example", "context", "custom"}


def _pm_db_path(db_path: str | Path | None = None) -> Path:
    if db_path is not None:
        return Path(db_path)
    base = product_db_path()
    return base.parent / _PM_DB_FILE


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class PromptModule:
    """Atomic reusable prompt snippet."""

    id: str
    name: str
    module_type: str
    content: str
    description: str
    tags: list[str]
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "module_type": self.module_type,
            "content": self.content,
            "description": self.description,
            "tags": self.tags,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class ModuleRef:
    """Reference to a module within a template, with optional override."""

    module_name: str
    override_content: str | None = None  # replaces module content if set
    condition: str | None = None  # simple key for conditional inclusion (future)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"module_name": self.module_name}
        if self.override_content is not None:
            d["override_content"] = self.override_content
        if self.condition is not None:
            d["condition"] = self.condition
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ModuleRef":
        return cls(
            module_name=d["module_name"],
            override_content=d.get("override_content"),
            condition=d.get("condition"),
        )


@dataclass
class PromptTemplate:
    """Ordered composition of module references."""

    id: str
    name: str
    description: str
    module_refs: list[ModuleRef]
    separator: str
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "module_refs": [r.to_dict() for r in self.module_refs],
            "separator": self.separator,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class PromptVersion:
    """Immutable versioned snapshot of a composed prompt."""

    id: str
    template_id: str
    template_name: str
    version: int
    composed_text: str
    module_snapshot: dict[str, str]
    note: str
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "template_name": self.template_name,
            "version": self.version,
            "composed_text": self.composed_text,
            "module_snapshot": self.module_snapshot,
            "note": self.note,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# PromptModuleRegistry
# ---------------------------------------------------------------------------

class PromptModuleRegistry:
    """Storage and composition engine for prompt modules and templates."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = _pm_db_path(db_path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_PM_SCHEMA)

    # ------------------------------------------------------------------
    # Module CRUD
    # ------------------------------------------------------------------

    def create_module(
        self,
        name: str,
        module_type: str,
        content: str,
        description: str = "",
        tags: list[str] | None = None,
    ) -> PromptModule:
        """Create or update a reusable prompt module."""
        if module_type not in MODULE_TYPES:
            raise ValueError(
                f"module_type must be one of {sorted(MODULE_TYPES)}, got '{module_type}'"
            )
        tags = tags or []
        now = _utc_now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM pm_modules WHERE name=?", (name,)
            ).fetchone()
            if existing:
                rec_id = existing["id"]
                conn.execute(
                    """UPDATE pm_modules
                       SET module_type=?, content=?, description=?, tags_json=?,
                           active=1, updated_at=?
                       WHERE id=?""",
                    (module_type, content, description, json.dumps(tags), now, rec_id),
                )
            else:
                rec_id = _new_id()
                conn.execute(
                    """INSERT INTO pm_modules
                       (id, name, module_type, content, description, tags_json,
                        active, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,1,?,?)""",
                    (rec_id, name, module_type, content, description, json.dumps(tags), now, now),
                )
        return self.get_module(rec_id)  # type: ignore[return-value]

    def get_module(self, module_id: str) -> PromptModule | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_modules WHERE id=?", (module_id,)
            ).fetchone()
        return self._row_to_module(row) if row else None

    def get_module_by_name(self, name: str) -> PromptModule | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_modules WHERE name=?", (name,)
            ).fetchone()
        return self._row_to_module(row) if row else None

    def list_modules(
        self,
        module_type: str | None = None,
        tag: str | None = None,
        active_only: bool = True,
    ) -> list[PromptModule]:
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("active=1")
        if module_type is not None:
            clauses.append("module_type=?")
            params.append(module_type)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM pm_modules {where} ORDER BY name", params
            ).fetchall()
        result = [self._row_to_module(r) for r in rows]
        if tag:
            result = [m for m in result if tag in m.tags]
        return result

    def update_module(self, module_id: str, updates: dict[str, Any]) -> PromptModule:
        rec = self.get_module(module_id)
        if rec is None:
            raise KeyError(f"Module '{module_id}' not found")
        if "module_type" in updates and updates["module_type"] not in MODULE_TYPES:
            raise ValueError(f"module_type must be one of {sorted(MODULE_TYPES)}")
        now = _utc_now()
        allowed = {"module_type", "content", "description", "tags", "active"}
        sets: list[str] = ["updated_at=?"]
        params: list[Any] = [now]
        for key, val in updates.items():
            if key not in allowed:
                continue
            if key == "tags":
                sets.append("tags_json=?")
                params.append(json.dumps(val))
            elif key == "active":
                sets.append("active=?")
                params.append(1 if val else 0)
            else:
                sets.append(f"{key}=?")
                params.append(val)
        params.append(module_id)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE pm_modules SET {', '.join(sets)} WHERE id=?", params
            )
        return self.get_module(module_id)  # type: ignore[return-value]

    def delete_module(self, module_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE pm_modules SET active=0 WHERE id=?", (module_id,)
            )
        return cur.rowcount > 0

    def _row_to_module(self, row: sqlite3.Row) -> PromptModule:
        return PromptModule(
            id=row["id"],
            name=row["name"],
            module_type=row["module_type"],
            content=row["content"],
            description=row["description"],
            tags=json.loads(row["tags_json"]),
            active=bool(row["active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # ------------------------------------------------------------------
    # Template CRUD
    # ------------------------------------------------------------------

    def create_template(
        self,
        name: str,
        module_refs: list[dict[str, Any]] | list[ModuleRef],
        description: str = "",
        separator: str = "\n\n",
    ) -> PromptTemplate:
        """Create or update a prompt template."""
        refs = self._normalize_refs(module_refs)
        now = _utc_now()
        refs_json = json.dumps([r.to_dict() for r in refs])
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM pm_templates WHERE name=?", (name,)
            ).fetchone()
            if existing:
                rec_id = existing["id"]
                conn.execute(
                    """UPDATE pm_templates
                       SET description=?, module_refs_json=?, separator=?,
                           active=1, updated_at=?
                       WHERE id=?""",
                    (description, refs_json, separator, now, rec_id),
                )
            else:
                rec_id = _new_id()
                conn.execute(
                    """INSERT INTO pm_templates
                       (id, name, description, module_refs_json, separator, active, created_at, updated_at)
                       VALUES (?,?,?,?,?,1,?,?)""",
                    (rec_id, name, description, refs_json, separator, now, now),
                )
        return self.get_template(rec_id)  # type: ignore[return-value]

    def get_template(self, template_id: str) -> PromptTemplate | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_templates WHERE id=?", (template_id,)
            ).fetchone()
        return self._row_to_template(row) if row else None

    def get_template_by_name(self, name: str) -> PromptTemplate | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_templates WHERE name=?", (name,)
            ).fetchone()
        return self._row_to_template(row) if row else None

    def list_templates(self, active_only: bool = True) -> list[PromptTemplate]:
        where = "WHERE active=1" if active_only else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM pm_templates {where} ORDER BY name"
            ).fetchall()
        return [self._row_to_template(r) for r in rows]

    def delete_template(self, template_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE pm_templates SET active=0 WHERE id=?", (template_id,)
            )
        return cur.rowcount > 0

    def _row_to_template(self, row: sqlite3.Row) -> PromptTemplate:
        refs_raw = json.loads(row["module_refs_json"])
        refs = [ModuleRef.from_dict(r) for r in refs_raw]
        return PromptTemplate(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            module_refs=refs,
            separator=row["separator"],
            active=bool(row["active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _normalize_refs(
        self, refs: list[dict[str, Any]] | list[ModuleRef]
    ) -> list[ModuleRef]:
        result: list[ModuleRef] = []
        for r in refs:
            if isinstance(r, ModuleRef):
                result.append(r)
            elif isinstance(r, dict):
                result.append(ModuleRef.from_dict(r))
            elif isinstance(r, str):
                result.append(ModuleRef(module_name=r))
            else:
                raise ValueError(f"Cannot convert to ModuleRef: {r!r}")
        return result

    # ------------------------------------------------------------------
    # Composition
    # ------------------------------------------------------------------

    def compose(
        self,
        template_id: str,
        context: dict[str, Any] | None = None,
    ) -> str:
        """Compose a prompt string from a template.

        Args:
            template_id: Template ID or name to compose.
            context: Optional variables for ``{var}`` substitution in module content.

        Returns:
            Composed prompt string.
        """
        tmpl = self.get_template(template_id)
        if tmpl is None:
            # Try by name
            tmpl = self.get_template_by_name(template_id)
        if tmpl is None:
            raise KeyError(f"Template '{template_id}' not found")
        return self._compose_template(tmpl, context or {})

    def _compose_template(
        self,
        tmpl: PromptTemplate,
        context: dict[str, Any],
    ) -> str:
        parts: list[str] = []
        for ref in tmpl.module_refs:
            if ref.override_content is not None:
                content = ref.override_content
            else:
                mod = self.get_module_by_name(ref.module_name)
                if mod is None or not mod.active:
                    continue
                content = mod.content
            # Apply context substitution
            for key, val in context.items():
                content = content.replace(f"{{{key}}}", str(val))
            parts.append(content)
        return tmpl.separator.join(parts)

    # ------------------------------------------------------------------
    # Versioning
    # ------------------------------------------------------------------

    def snapshot_version(
        self,
        template_id: str,
        note: str = "",
        context: dict[str, Any] | None = None,
    ) -> PromptVersion:
        """Compose and store an immutable version snapshot."""
        tmpl = self.get_template(template_id)
        if tmpl is None:
            raise KeyError(f"Template '{template_id}' not found")

        composed = self._compose_template(tmpl, context or {})

        # Capture module contents at snapshot time
        snapshot: dict[str, str] = {}
        for ref in tmpl.module_refs:
            if ref.override_content is not None:
                snapshot[ref.module_name] = ref.override_content
            else:
                mod = self.get_module_by_name(ref.module_name)
                snapshot[ref.module_name] = mod.content if mod else ""

        with self._connect() as conn:
            row = conn.execute(
                """SELECT MAX(version) as max_v FROM pm_versions
                   WHERE template_id=?""",
                (template_id,),
            ).fetchone()
            next_version = (row["max_v"] or 0) + 1

            rec_id = _new_id()
            now = _utc_now()
            conn.execute(
                """INSERT INTO pm_versions
                   (id, template_id, template_name, version, composed_text,
                    module_snapshot_json, note, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    rec_id, template_id, tmpl.name, next_version, composed,
                    json.dumps(snapshot), note, now,
                ),
            )

        return PromptVersion(
            id=rec_id,
            template_id=template_id,
            template_name=tmpl.name,
            version=next_version,
            composed_text=composed,
            module_snapshot=snapshot,
            note=note,
            created_at=now,
        )

    def get_version(self, version_id: str) -> PromptVersion | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_versions WHERE id=?", (version_id,)
            ).fetchone()
        return self._row_to_version(row) if row else None

    def get_template_version(
        self, template_id: str, version: int
    ) -> PromptVersion | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM pm_versions WHERE template_id=? AND version=?",
                (template_id, version),
            ).fetchone()
        return self._row_to_version(row) if row else None

    def list_versions(
        self,
        template_id: str,
        limit: int = 50,
    ) -> list[PromptVersion]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT * FROM pm_versions WHERE template_id=?
                   ORDER BY version DESC LIMIT ?""",
                (template_id, limit),
            ).fetchall()
        return [self._row_to_version(r) for r in rows]

    def latest_version(self, template_id: str) -> PromptVersion | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT * FROM pm_versions WHERE template_id=?
                   ORDER BY version DESC LIMIT 1""",
                (template_id,),
            ).fetchone()
        return self._row_to_version(row) if row else None

    def _row_to_version(self, row: sqlite3.Row) -> PromptVersion:
        return PromptVersion(
            id=row["id"],
            template_id=row["template_id"],
            template_name=row["template_name"],
            version=row["version"],
            composed_text=row["composed_text"],
            module_snapshot=json.loads(row["module_snapshot_json"]),
            note=row["note"],
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_REGISTRY: PromptModuleRegistry | None = None


def get_prompt_registry(db_path: str | Path | None = None) -> PromptModuleRegistry:
    global _REGISTRY
    if _REGISTRY is None or db_path is not None:
        _REGISTRY = PromptModuleRegistry(db_path=db_path)
    return _REGISTRY


__all__ = [
    "MODULE_TYPES",
    "ModuleRef",
    "PromptModule",
    "PromptTemplate",
    "PromptVersion",
    "PromptModuleRegistry",
    "get_prompt_registry",
]
