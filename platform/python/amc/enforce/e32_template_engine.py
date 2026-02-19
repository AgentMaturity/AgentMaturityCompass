"""
AMC Enforce E32 — Restricted Template Engine
=============================================

Outbound messages and documents can only be generated from approved templates
with controlled, typed variables.  Unapproved templates are blocked; variable
values are validated for type, length, and allowed-value constraints before
rendering.

Usage::

    from datetime import datetime, timezone
    from amc.enforce.e32_template_engine import (
        TemplateEngine, MessageTemplate, TemplateVar, RenderRequest,
    )

    engine = TemplateEngine(db_path=":memory:")

    template = MessageTemplate(
        template_id="welcome-email-v1",
        name="Welcome Email",
        channel="email",
        body_template="Hi {name}, welcome to {product}!",
        variables=[
            TemplateVar(name="name", type="text", max_length=100),
            TemplateVar(name="product", type="text",
                        allowed_values=["AMC Platform", "AMC Lite"]),
        ],
        approved=False,
        approved_by=None,
        created_at=datetime.now(timezone.utc),
    )
    engine.register_template(template)
    engine.approve_template("welcome-email-v1", approver="alice@example.com")

    request = RenderRequest(
        template_id="welcome-email-v1",
        variables={"name": "Bob", "product": "AMC Platform"},
        recipient="bob@example.com",
        session_id="sess-001",
    )
    result = engine.render(request)
    assert result.rendered_body == "Hi Bob, welcome to AMC Platform!"
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Literal

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

_VAR_TYPE = Literal["text", "number", "date", "email", "url"]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^https?://\S+$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")


class TemplateVar(BaseModel):
    """Definition of a single variable accepted by a template."""

    name: str
    type: _VAR_TYPE
    max_length: int | None = None
    allowed_values: list[str] = Field(default_factory=list)
    required: bool = True


class MessageTemplate(BaseModel):
    """A registered, potentially approved outbound message template."""

    template_id: str
    name: str
    channel: str
    body_template: str
    """Template body using ``{var_name}`` placeholders."""
    variables: list[TemplateVar]
    approved: bool = False
    approved_by: str | None = None
    created_at: datetime


class RenderRequest(BaseModel):
    """A request to render a template with concrete variable values."""

    template_id: str
    variables: dict[str, str]
    recipient: str
    session_id: str


class RenderResult(BaseModel):
    """The outcome of a render operation."""

    template_id: str
    rendered_body: str
    recipient: str
    approved: bool
    blocked_reason: str | None
    rendered_at: datetime


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class TemplateEngine:
    """
    SQLite-backed restricted template engine.

    Only approved templates can be rendered.  Variable validation is strict:
    type checks, length limits, and allowed-value constraints are all enforced
    before any rendering occurs.
    """

    def __init__(self, db_path: str = "template_engine.db") -> None:
        """
        Initialise the engine.

        Args:
            db_path: SQLite database path.  Use ``":memory:"`` for tests.
        """
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._bootstrap()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _bootstrap(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS templates (
                template_id   TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                channel       TEXT NOT NULL,
                body_template TEXT NOT NULL,
                variables_json TEXT NOT NULL,
                approved      INTEGER NOT NULL DEFAULT 0,
                approved_by   TEXT,
                created_at    TEXT NOT NULL
            );
            """
        )
        self._conn.commit()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _row_to_template(self, row: tuple) -> MessageTemplate:
        (
            template_id,
            name,
            channel,
            body_template,
            variables_json,
            approved,
            approved_by,
            created_at,
        ) = row
        variables = [TemplateVar(**v) for v in json.loads(variables_json)]
        return MessageTemplate(
            template_id=template_id,
            name=name,
            channel=channel,
            body_template=body_template,
            variables=variables,
            approved=bool(approved),
            approved_by=approved_by,
            created_at=datetime.fromisoformat(created_at),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register_template(self, template: MessageTemplate) -> MessageTemplate:
        """
        Persist a template to the database.

        If a template with the same ``template_id`` already exists it is
        replaced (upsert).

        Args:
            template: The :class:`MessageTemplate` to register.

        Returns:
            The stored template (unchanged).
        """
        variables_json = json.dumps([v.model_dump() for v in template.variables])
        self._conn.execute(
            """
            INSERT INTO templates
                (template_id, name, channel, body_template, variables_json,
                 approved, approved_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(template_id) DO UPDATE SET
                name          = excluded.name,
                channel       = excluded.channel,
                body_template = excluded.body_template,
                variables_json = excluded.variables_json,
                approved      = excluded.approved,
                approved_by   = excluded.approved_by,
                created_at    = excluded.created_at
            """,
            (
                template.template_id,
                template.name,
                template.channel,
                template.body_template,
                variables_json,
                int(template.approved),
                template.approved_by,
                template.created_at.isoformat(),
            ),
        )
        self._conn.commit()
        logger.info("template_engine.registered", template_id=template.template_id)
        return template

    def approve_template(self, template_id: str, approver: str) -> bool:
        """
        Mark a template as approved by the given approver.

        Args:
            template_id: ID of the template to approve.
            approver: Identity of the approver (e.g. email or username).

        Returns:
            ``True`` if the template was found and updated; ``False`` otherwise.
        """
        cur = self._conn.execute(
            "UPDATE templates SET approved = 1, approved_by = ? WHERE template_id = ?",
            (approver, template_id),
        )
        self._conn.commit()
        updated = cur.rowcount > 0
        if updated:
            logger.info(
                "template_engine.approved",
                template_id=template_id,
                approver=approver,
            )
        else:
            logger.warning("template_engine.approve_not_found", template_id=template_id)
        return updated

    def validate_variables(
        self,
        template: MessageTemplate,
        variables: dict[str, str],
    ) -> list[str]:
        """
        Validate variable values against the template's variable definitions.

        Args:
            template: The template whose variable spec is used.
            variables: The caller-supplied variable values.

        Returns:
            A list of human-readable error strings.  Empty list means valid.
        """
        errors: list[str] = []
        var_map = {v.name: v for v in template.variables}

        # Check required variables are present
        for var in template.variables:
            if var.required and var.name not in variables:
                errors.append(f"Missing required variable: '{var.name}'")

        # Validate supplied values
        for name, value in variables.items():
            if name not in var_map:
                errors.append(f"Unknown variable: '{name}'")
                continue

            spec = var_map[name]

            # Type validation
            if spec.type == "number" and not _NUMBER_RE.match(value):
                errors.append(f"Variable '{name}' must be a number; got {value!r}")
            elif spec.type == "date" and not _DATE_RE.match(value):
                errors.append(
                    f"Variable '{name}' must be a date (YYYY-MM-DD); got {value!r}"
                )
            elif spec.type == "email" and not _EMAIL_RE.match(value):
                errors.append(f"Variable '{name}' must be a valid email; got {value!r}")
            elif spec.type == "url" and not _URL_RE.match(value):
                errors.append(
                    f"Variable '{name}' must be a valid http/https URL; got {value!r}"
                )

            # Max length
            if spec.max_length is not None and len(value) > spec.max_length:
                errors.append(
                    f"Variable '{name}' exceeds max length {spec.max_length} "
                    f"(got {len(value)} chars)"
                )

            # Allowed values
            if spec.allowed_values and value not in spec.allowed_values:
                errors.append(
                    f"Variable '{name}' must be one of {spec.allowed_values!r}; "
                    f"got {value!r}"
                )

        return errors

    def render(
        self,
        request: RenderRequest,
        *,
        allow_unapproved: bool = False,
    ) -> RenderResult:
        """
        Render a template with the supplied variables.

        Args:
            request: The :class:`RenderRequest`.
            allow_unapproved: If ``True``, render even if the template is not
                              yet approved (for internal testing only).

        Returns:
            A :class:`RenderResult`.  When blocked, ``rendered_body`` is empty
            and ``blocked_reason`` describes why.
        """
        now = self._now()

        cur = self._conn.execute(
            "SELECT template_id, name, channel, body_template, variables_json, "
            "       approved, approved_by, created_at "
            "FROM templates WHERE template_id = ?",
            (request.template_id,),
        )
        row = cur.fetchone()
        if row is None:
            logger.warning(
                "template_engine.render_unknown",
                template_id=request.template_id,
            )
            return RenderResult(
                template_id=request.template_id,
                rendered_body="",
                recipient=request.recipient,
                approved=False,
                blocked_reason=f"Template '{request.template_id}' not found",
                rendered_at=now,
            )

        template = self._row_to_template(row)

        if not template.approved and not allow_unapproved:
            logger.warning(
                "template_engine.render_unapproved",
                template_id=request.template_id,
            )
            return RenderResult(
                template_id=request.template_id,
                rendered_body="",
                recipient=request.recipient,
                approved=False,
                blocked_reason="Template is not approved",
                rendered_at=now,
            )

        errors = self.validate_variables(template, request.variables)
        if errors:
            reason = "; ".join(errors)
            logger.warning(
                "template_engine.render_validation_failed",
                template_id=request.template_id,
                errors=errors,
            )
            return RenderResult(
                template_id=request.template_id,
                rendered_body="",
                recipient=request.recipient,
                approved=template.approved,
                blocked_reason=reason,
                rendered_at=now,
            )

        # Render — only substitute known variables
        body = template.body_template
        for name, value in request.variables.items():
            body = body.replace(f"{{{name}}}", value)

        logger.info(
            "template_engine.rendered",
            template_id=request.template_id,
            recipient=request.recipient,
        )
        return RenderResult(
            template_id=request.template_id,
            rendered_body=body,
            recipient=request.recipient,
            approved=template.approved,
            blocked_reason=None,
            rendered_at=now,
        )

    def list_templates(
        self,
        channel: str | None = None,
        approved_only: bool = True,
    ) -> list[MessageTemplate]:
        """
        List templates, optionally filtered by channel and approval status.

        Args:
            channel: If provided, only return templates for this channel.
            approved_only: When ``True`` (default), only return approved
                           templates.

        Returns:
            List of :class:`MessageTemplate`.
        """
        query = (
            "SELECT template_id, name, channel, body_template, variables_json, "
            "       approved, approved_by, created_at FROM templates WHERE 1=1"
        )
        params: list[str | int] = []

        if approved_only:
            query += " AND approved = 1"

        if channel is not None:
            query += " AND channel = ?"
            params.append(channel)

        query += " ORDER BY created_at DESC"

        cur = self._conn.execute(query, params)
        return [self._row_to_template(row) for row in cur.fetchall()]
