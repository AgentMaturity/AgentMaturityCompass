from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class CorrectionRule(BaseModel):
    rule_id: str
    name: str
    rule_type: str  # "formatting" | "ordering" | "naming" | "consistency" | "custom"
    pattern: str  # regex pattern to match
    replacement: str  # replacement string (supports backreferences)
    description: str
    priority: int  # lower = applied first
    is_active: bool
    created_at: str
    metadata: dict[str, Any]


class CorrectionRuleCreate(BaseModel):
    name: str
    rule_type: str = "formatting"
    pattern: str
    replacement: str
    description: str = ""
    priority: int = 50
    metadata: dict[str, Any] = Field(default_factory=dict)


class SectionOrderConfig(BaseModel):
    config_id: str
    name: str
    expected_sections: list[str]  # ordered list of section names/patterns
    created_at: str


class SectionOrderConfigCreate(BaseModel):
    name: str
    expected_sections: list[str]


class NamingNorm(BaseModel):
    norm_id: str
    pattern: str  # regex to find wrong names
    canonical: str  # correct name
    description: str
    created_at: str


class NamingNormCreate(BaseModel):
    pattern: str
    canonical: str
    description: str = ""


class CorrectRequest(BaseModel):
    content: str
    apply_formatting: bool = True
    apply_ordering: bool = True
    apply_naming: bool = True
    apply_consistency: bool = True
    section_config_id: str = ""  # which section order config to use
    custom_rules: list[str] = Field(default_factory=list)  # rule_ids to also apply
    metadata: dict[str, Any] = Field(default_factory=dict)


class Correction(BaseModel):
    correction_type: str
    description: str
    before: str
    after: str
    rule_id: str


class CorrectResult(BaseModel):
    result_id: str
    original_content: str
    corrected_content: str
    corrections: list[Correction]
    correction_count: int
    is_changed: bool
    duration_ms: int
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# Built-in default rule definitions
# ---------------------------------------------------------------------------

_BUILTIN_RULES: list[dict[str, Any]] = [
    {
        "rule_id": "builtin_trailing_whitespace",
        "name": "Strip trailing whitespace",
        "rule_type": "formatting",
        "pattern": r"[ \t]+$",
        "replacement": "",
        "description": "Remove trailing spaces/tabs from each line",
        "priority": 1,
        "flags": re.MULTILINE,
    },
    {
        "rule_id": "builtin_bullet_asterisk",
        "name": "Normalize bullet points",
        "rule_type": "formatting",
        "pattern": r"^\* ",
        "replacement": "- ",
        "description": "Standardize bullet points from * to -",
        "priority": 10,
        "flags": re.MULTILINE,
    },
    {
        "rule_id": "builtin_header_trailing_punct",
        "name": "Remove trailing punctuation from headers",
        "rule_type": "formatting",
        "pattern": r"^(#{1,6} .+)[:.!?;,]+[ \t]*$",
        "replacement": r"\1",
        "description": "Remove trailing punctuation characters from markdown headers",
        "priority": 15,
        "flags": re.MULTILINE,
    },
    {
        "rule_id": "builtin_multiple_blank_lines",
        "name": "Normalize multiple blank lines",
        "rule_type": "formatting",
        "pattern": r"\n{3,}",
        "replacement": "\n\n",
        "description": "Reduce 3+ consecutive blank lines to max 2",
        "priority": 20,
        "flags": 0,
    },
    {
        "rule_id": "builtin_amc_casing",
        "name": "Normalize AMC casing",
        "rule_type": "naming",
        "pattern": r"\bAmc\b|\bamc\b",
        "replacement": "AMC",
        "description": "Normalize 'amc' and 'Amc' to 'AMC'",
        "priority": 30,
        "flags": 0,
    },
    {
        "rule_id": "builtin_workflow_lowercase",
        "name": "Normalize workflow casing (non-headers)",
        "rule_type": "naming",
        "pattern": r"(?<![#\n])(?<=\s)Workflow(?=\s)",
        "replacement": "workflow",
        "description": "Lowercase 'Workflow' when not in a header context",
        "priority": 35,
        "flags": 0,
    },
]


def _make_builtin_rule(d: dict[str, Any]) -> CorrectionRule:
    return CorrectionRule(
        rule_id=d["rule_id"],
        name=d["name"],
        rule_type=d["rule_type"],
        pattern=d["pattern"],
        replacement=d["replacement"],
        description=d["description"],
        priority=d["priority"],
        is_active=True,
        created_at="builtin",
        metadata={},
    )


# ---------------------------------------------------------------------------
# Core Corrector
# ---------------------------------------------------------------------------


class OutputCorrector:
    """Post-processor that applies formatting, ordering, naming, and consistency corrections.

    Corrections are applied in a pipeline:
      1. Built-in formatting rules
      2. Section reordering
      3. Naming normalizations
      4. Consistency DB rules
      5. Custom (user-specified) DB rules
    """

    def __init__(self, db_path: str | None = None) -> None:
        if db_path is None:
            from amc.product.persistence import product_db_path
            db_path = str(product_db_path("output_corrector.db"))
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()
        logger.info("output_corrector.initialized", db_path=db_path)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS correction_rules (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id      TEXT UNIQUE NOT NULL,
                name         TEXT NOT NULL,
                rule_type    TEXT NOT NULL DEFAULT 'formatting',
                pattern      TEXT NOT NULL,
                replacement  TEXT NOT NULL DEFAULT '',
                description  TEXT NOT NULL DEFAULT '',
                priority     INTEGER NOT NULL DEFAULT 50,
                is_active    INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS section_order_configs (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id             TEXT UNIQUE NOT NULL,
                name                  TEXT NOT NULL,
                expected_sections_json TEXT NOT NULL DEFAULT '[]',
                created_at            TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS naming_norms (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                norm_id     TEXT UNIQUE NOT NULL,
                pattern     TEXT NOT NULL,
                canonical   TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS correction_history (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                result_id        TEXT UNIQUE NOT NULL,
                original_hash    TEXT NOT NULL,
                corrected_hash   TEXT NOT NULL,
                correction_count INTEGER NOT NULL DEFAULT 0,
                is_changed       INTEGER NOT NULL DEFAULT 0,
                duration_ms      INTEGER NOT NULL DEFAULT 0,
                metadata_json    TEXT NOT NULL DEFAULT '{}',
                created_at       TEXT NOT NULL
            );
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _new_id(self, prefix: str) -> str:
        import uuid
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    def _sha256(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    def _row_to_rule(self, row: sqlite3.Row) -> CorrectionRule:
        return CorrectionRule(
            rule_id=row["rule_id"],
            name=row["name"],
            rule_type=row["rule_type"],
            pattern=row["pattern"],
            replacement=row["replacement"],
            description=row["description"],
            priority=row["priority"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def _row_to_section_config(self, row: sqlite3.Row) -> SectionOrderConfig:
        return SectionOrderConfig(
            config_id=row["config_id"],
            name=row["name"],
            expected_sections=json.loads(row["expected_sections_json"]),
            created_at=row["created_at"],
        )

    def _row_to_naming_norm(self, row: sqlite3.Row) -> NamingNorm:
        return NamingNorm(
            norm_id=row["norm_id"],
            pattern=row["pattern"],
            canonical=row["canonical"],
            description=row["description"],
            created_at=row["created_at"],
        )

    # ------------------------------------------------------------------
    # Rule application
    # ------------------------------------------------------------------

    def _apply_rule(
        self, content: str, rule: CorrectionRule
    ) -> tuple[str, list[Correction]]:
        """Apply a single regex rule to content; return updated content and corrections."""
        corrections: list[Correction] = []
        try:
            compiled = re.compile(rule.pattern, re.MULTILINE)
        except re.error as exc:
            logger.warning(
                "output_corrector.invalid_rule_pattern",
                rule_id=rule.rule_id,
                error=str(exc),
            )
            return content, corrections

        def _sub(m: re.Match) -> str:
            return m.expand(rule.replacement)

        new_content = compiled.sub(_sub, content)
        if new_content != content:
            corrections.append(
                Correction(
                    correction_type=rule.rule_type,
                    description=rule.description or rule.name,
                    before=content[:120],
                    after=new_content[:120],
                    rule_id=rule.rule_id,
                )
            )
        return new_content, corrections

    def _apply_builtin_formatting(
        self, content: str
    ) -> tuple[str, list[Correction]]:
        """Apply all built-in rules in priority order. Also handles 'end with single newline'."""
        all_corrections: list[Correction] = []
        rules = sorted(_BUILTIN_RULES, key=lambda r: r["priority"])

        for r in rules:
            flags = r.get("flags", 0)
            try:
                compiled = re.compile(r["pattern"], flags)
            except re.error as exc:
                logger.warning(
                    "output_corrector.builtin_rule_error",
                    rule_id=r["rule_id"],
                    error=str(exc),
                )
                continue

            def _sub(m: re.Match, repl: str = r["replacement"]) -> str:
                return m.expand(repl)

            new_content = compiled.sub(_sub, content)
            if new_content != content:
                all_corrections.append(
                    Correction(
                        correction_type=r["rule_type"],
                        description=r["description"],
                        before=content[:120],
                        after=new_content[:120],
                        rule_id=r["rule_id"],
                    )
                )
                content = new_content

        # Ensure file ends with exactly one newline
        stripped = content.rstrip("\n")
        ensured = stripped + "\n"
        if ensured != content:
            all_corrections.append(
                Correction(
                    correction_type="formatting",
                    description="Ensure file ends with single newline",
                    before=repr(content[-20:]),
                    after=repr(ensured[-20:]),
                    rule_id="builtin_single_trailing_newline",
                )
            )
            content = ensured

        return content, all_corrections

    # ------------------------------------------------------------------
    # Section reordering
    # ------------------------------------------------------------------

    def _reorder_sections(
        self, content: str, config: SectionOrderConfig
    ) -> tuple[str, list[Correction]]:
        """Detect ## sections, reorder to match expected_sections, append unknowns at end."""
        corrections: list[Correction] = []

        # Split content into preamble + section chunks
        # A section starts with a line beginning with "## "
        section_pattern = re.compile(r"^(## .+)$", re.MULTILINE)
        splits = section_pattern.split(content)
        # splits[0] = preamble, then alternating: header, body, header, body ...

        if len(splits) <= 1:
            # No ## sections found
            return content, corrections

        preamble = splits[0]
        sections: list[tuple[str, str]] = []  # (header_line, body_text)
        i = 1
        while i < len(splits) - 1:
            header = splits[i]
            body = splits[i + 1]
            sections.append((header, body))
            i += 2

        # Map section header → index in expected list
        def _match_priority(header: str) -> int:
            title = header.lstrip("# ").strip()
            for idx, pattern in enumerate(config.expected_sections):
                try:
                    if re.search(pattern, title, re.IGNORECASE):
                        return idx
                except re.error:
                    if pattern.lower() == title.lower():
                        return idx
            return len(config.expected_sections)  # unknown → end

        original_order = [h for h, _ in sections]
        sorted_sections = sorted(sections, key=lambda s: _match_priority(s[0]))
        new_order = [h for h, _ in sorted_sections]

        if original_order == new_order:
            return content, corrections

        # Reconstruct content
        new_content = preamble
        for header, body in sorted_sections:
            new_content += header + body

        corrections.append(
            Correction(
                correction_type="ordering",
                description=f"Reordered sections per config '{config.name}'",
                before=" → ".join(h.strip() for h in original_order[:5]),
                after=" → ".join(h.strip() for h in new_order[:5]),
                rule_id=f"section_config:{config.config_id}",
            )
        )
        return new_content, corrections

    # ------------------------------------------------------------------
    # Naming norms
    # ------------------------------------------------------------------

    def _apply_naming_norms(
        self, content: str, norms: list[NamingNorm]
    ) -> tuple[str, list[Correction]]:
        corrections: list[Correction] = []
        for norm in norms:
            try:
                compiled = re.compile(norm.pattern)
            except re.error as exc:
                logger.warning(
                    "output_corrector.invalid_norm_pattern",
                    norm_id=norm.norm_id,
                    error=str(exc),
                )
                continue
            new_content = compiled.sub(norm.canonical, content)
            if new_content != content:
                corrections.append(
                    Correction(
                        correction_type="naming",
                        description=norm.description or f"Normalize to '{norm.canonical}'",
                        before=content[:120],
                        after=new_content[:120],
                        rule_id=f"norm:{norm.norm_id}",
                    )
                )
                content = new_content
        return content, corrections

    # ------------------------------------------------------------------
    # Main correct pipeline
    # ------------------------------------------------------------------

    def correct(self, request: CorrectRequest) -> CorrectResult:
        """Apply the full corrections pipeline and return a CorrectResult."""
        import uuid

        start_ms = int(time.monotonic() * 1000)
        original_content = request.content
        content = original_content
        all_corrections: list[Correction] = []

        # 1) Built-in formatting rules
        if request.apply_formatting:
            content, corrections = self._apply_builtin_formatting(content)
            all_corrections.extend(corrections)

        # 2) Section reordering
        if request.apply_ordering and request.section_config_id:
            row = self._conn.execute(
                "SELECT * FROM section_order_configs WHERE config_id = ?",
                (request.section_config_id,),
            ).fetchone()
            if row:
                config = self._row_to_section_config(row)
                content, corrections = self._reorder_sections(content, config)
                all_corrections.extend(corrections)
            else:
                logger.warning(
                    "output_corrector.section_config_not_found",
                    config_id=request.section_config_id,
                )

        # 3) Naming norms
        if request.apply_naming:
            norms = self.list_naming_norms()
            content, corrections = self._apply_naming_norms(content, norms)
            all_corrections.extend(corrections)

        # 4) Consistency rules (DB rules of type 'consistency')
        if request.apply_consistency:
            consistency_rules = self.list_rules(rule_type="consistency", active_only=True)
            for rule in sorted(consistency_rules, key=lambda r: r.priority):
                content, corrections = self._apply_rule(content, rule)
                all_corrections.extend(corrections)

        # 5) Custom/user-specified rule IDs
        if request.custom_rules:
            for rule_id in request.custom_rules:
                row = self._conn.execute(
                    "SELECT * FROM correction_rules WHERE rule_id = ? AND is_active = 1",
                    (rule_id,),
                ).fetchone()
                if row:
                    rule = self._row_to_rule(row)
                    content, corrections = self._apply_rule(content, rule)
                    all_corrections.extend(corrections)

        end_ms = int(time.monotonic() * 1000)
        duration_ms = end_ms - start_ms
        result_id = f"corr_{uuid.uuid4().hex[:12]}"
        is_changed = content != original_content

        # Persist history
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO correction_history
                (result_id, original_hash, corrected_hash, correction_count,
                 is_changed, duration_ms, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result_id,
                self._sha256(original_content),
                self._sha256(content),
                len(all_corrections),
                int(is_changed),
                duration_ms,
                json.dumps(request.metadata),
                now,
            ),
        )
        self._conn.commit()

        logger.info(
            "output_corrector.corrected",
            result_id=result_id,
            correction_count=len(all_corrections),
            is_changed=is_changed,
            duration_ms=duration_ms,
        )

        return CorrectResult(
            result_id=result_id,
            original_content=original_content,
            corrected_content=content,
            corrections=all_corrections,
            correction_count=len(all_corrections),
            is_changed=is_changed,
            duration_ms=duration_ms,
            metadata=request.metadata,
        )

    # ------------------------------------------------------------------
    # Rule management
    # ------------------------------------------------------------------

    def create_rule(self, request: CorrectionRuleCreate) -> CorrectionRule:
        rule_id = self._new_id("rule")
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO correction_rules
                (rule_id, name, rule_type, pattern, replacement, description,
                 priority, is_active, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                rule_id,
                request.name,
                request.rule_type,
                request.pattern,
                request.replacement,
                request.description,
                request.priority,
                json.dumps(request.metadata),
                now,
            ),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT * FROM correction_rules WHERE rule_id = ?", (rule_id,)
        ).fetchone()
        rule = self._row_to_rule(row)
        logger.info("output_corrector.rule_created", rule_id=rule_id, name=request.name)
        return rule

    def list_rules(
        self, rule_type: str | None = None, active_only: bool = True
    ) -> list[CorrectionRule]:
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("is_active = 1")
        if rule_type is not None:
            clauses.append("rule_type = ?")
            params.append(rule_type)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = self._conn.execute(
            f"SELECT * FROM correction_rules {where} ORDER BY priority, created_at",
            params,
        ).fetchall()
        return [self._row_to_rule(r) for r in rows]

    def delete_rule(self, rule_id: str) -> bool:
        cur = self._conn.execute(
            "UPDATE correction_rules SET is_active = 0 WHERE rule_id = ?",
            (rule_id,),
        )
        self._conn.commit()
        success = cur.rowcount > 0
        if success:
            logger.info("output_corrector.rule_deleted", rule_id=rule_id)
        return success

    # ------------------------------------------------------------------
    # Section order config management
    # ------------------------------------------------------------------

    def create_section_config(self, request: SectionOrderConfigCreate) -> SectionOrderConfig:
        config_id = self._new_id("scfg")
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO section_order_configs (config_id, name, expected_sections_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (config_id, request.name, json.dumps(request.expected_sections), now),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT * FROM section_order_configs WHERE config_id = ?", (config_id,)
        ).fetchone()
        config = self._row_to_section_config(row)
        logger.info(
            "output_corrector.section_config_created",
            config_id=config_id,
            name=request.name,
        )
        return config

    def list_section_configs(self) -> list[SectionOrderConfig]:
        rows = self._conn.execute(
            "SELECT * FROM section_order_configs ORDER BY created_at"
        ).fetchall()
        return [self._row_to_section_config(r) for r in rows]

    # ------------------------------------------------------------------
    # Naming norm management
    # ------------------------------------------------------------------

    def add_naming_norm(self, request: NamingNormCreate) -> NamingNorm:
        norm_id = self._new_id("norm")
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO naming_norms (norm_id, pattern, canonical, description, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (norm_id, request.pattern, request.canonical, request.description, now),
        )
        self._conn.commit()
        row = self._conn.execute(
            "SELECT * FROM naming_norms WHERE norm_id = ?", (norm_id,)
        ).fetchone()
        norm = self._row_to_naming_norm(row)
        logger.info(
            "output_corrector.naming_norm_added",
            norm_id=norm_id,
            canonical=request.canonical,
        )
        return norm

    def list_naming_norms(self) -> list[NamingNorm]:
        rows = self._conn.execute(
            "SELECT * FROM naming_norms ORDER BY created_at"
        ).fetchall()
        return [self._row_to_naming_norm(r) for r in rows]

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------

    def get_history(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT result_id, original_hash, corrected_hash, correction_count,
                   is_changed, duration_ms, metadata_json, created_at
            FROM correction_history
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [
            {
                "result_id": r["result_id"],
                "original_hash": r["original_hash"],
                "corrected_hash": r["corrected_hash"],
                "correction_count": r["correction_count"],
                "is_changed": bool(r["is_changed"]),
                "duration_ms": r["duration_ms"],
                "metadata": json.loads(r["metadata_json"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: OutputCorrector | None = None


def get_output_corrector() -> OutputCorrector:
    global _instance
    if _instance is None:
        db_path = str(product_db_path("output_corrector.db"))
        _instance = OutputCorrector(db_path)
    return _instance


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    "CorrectionRule",
    "CorrectionRuleCreate",
    "SectionOrderConfig",
    "SectionOrderConfigCreate",
    "NamingNorm",
    "NamingNormCreate",
    "CorrectRequest",
    "Correction",
    "CorrectResult",
    "OutputCorrector",
    "get_output_corrector",
]
