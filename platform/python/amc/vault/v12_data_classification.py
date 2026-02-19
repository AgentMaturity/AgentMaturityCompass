"""
AMC Vault — V12: Data Classification + Label Propagation
=========================================================

Classifies data as Public / Internal / Confidential / Regulated and
propagates labels through agent tool and destination checks.

Usage
-----

.. code-block:: python

    from amc.vault.v12_data_classification import DataClassifier, DataLabel

    clf = DataClassifier()

    labeled = clf.classify("My SSN is 123-45-6789")
    print(labeled.label)           # DataLabel.REGULATED

    allowed, reason = clf.check_tool_allowed(labeled.label, "email_send")
    print(allowed, reason)         # False  "Tool blocked for REGULATED data"
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class DataLabel(str, Enum):
    """Severity-ordered data classification labels (lowest → highest)."""

    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    REGULATED = "regulated"


# Severity order for label comparison (higher index = more sensitive)
_LABEL_SEVERITY: dict[DataLabel, int] = {
    DataLabel.PUBLIC: 0,
    DataLabel.INTERNAL: 1,
    DataLabel.CONFIDENTIAL: 2,
    DataLabel.REGULATED: 3,
}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ClassificationRule(BaseModel):
    """A single regex-based classification rule."""

    rule_id: str
    pattern: str  # regex pattern
    label: DataLabel
    confidence: float  # 0.0–1.0
    reason: str


class LabeledData(BaseModel):
    """Result of classifying a piece of content."""

    data_id: str
    content_hash: str
    label: DataLabel
    confidence: float
    matching_rules: list[str]  # rule_ids that matched
    classified_at: datetime


class PropagationPolicy(BaseModel):
    """Policy governing what tools / destinations a label may reach."""

    label: DataLabel
    allowed_tools: list[str] = Field(default_factory=list)
    blocked_tools: list[str] = Field(default_factory=list)
    allowed_destinations: list[str] = Field(default_factory=list)
    requires_approval: bool = False


class ClassificationConfig(BaseModel):
    """Full classifier configuration."""

    rules: list[ClassificationRule] = Field(default_factory=list)
    propagation_policies: list[PropagationPolicy] = Field(
        default_factory=list
    )
    default_label: DataLabel = DataLabel.INTERNAL


# ---------------------------------------------------------------------------
# Built-in rules
# ---------------------------------------------------------------------------

_BUILTIN_RULES: list[ClassificationRule] = [
    # REGULATED
    ClassificationRule(
        rule_id="reg_credit_card",
        pattern=r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        label=DataLabel.REGULATED,
        confidence=0.95,
        reason="Credit card number pattern detected",
    ),
    ClassificationRule(
        rule_id="reg_ssn",
        pattern=r"\b\d{3}-\d{2}-\d{4}\b",
        label=DataLabel.REGULATED,
        confidence=0.95,
        reason="US Social Security Number pattern detected",
    ),
    ClassificationRule(
        rule_id="reg_ifsc",
        pattern=r"\bIFSC[A-Z0-9]{9}\b",
        label=DataLabel.REGULATED,
        confidence=0.95,
        reason="Indian bank IFSC code detected",
    ),
    ClassificationRule(
        rule_id="reg_aadhaar",
        pattern=r"aadhaar",
        label=DataLabel.REGULATED,
        confidence=0.90,
        reason="Aadhaar reference detected",
    ),
    # CONFIDENTIAL
    ClassificationRule(
        rule_id="conf_secrets",
        pattern=r"\b(password|api.?key|secret|token|private.?key)\b",
        label=DataLabel.CONFIDENTIAL,
        confidence=0.90,
        reason="Credential/secret keyword detected",
    ),
    ClassificationRule(
        rule_id="conf_marking",
        pattern=r"CONFIDENTIAL|INTERNAL USE ONLY",
        label=DataLabel.CONFIDENTIAL,
        confidence=0.95,
        reason="Explicit confidentiality marking found",
    ),
    # INTERNAL
    ClassificationRule(
        rule_id="int_marking",
        pattern=r"\b(internal|proprietary|not for distribution)\b",
        label=DataLabel.INTERNAL,
        confidence=0.80,
        reason="Internal distribution marking found",
    ),
]

# ---------------------------------------------------------------------------
# Default propagation policies
# ---------------------------------------------------------------------------

_BUILTIN_POLICIES: list[PropagationPolicy] = [
    PropagationPolicy(
        label=DataLabel.REGULATED,
        allowed_tools=[],
        blocked_tools=["email_send", "slack_send", "export_csv"],
        allowed_destinations=["internal-only"],
        requires_approval=True,
    ),
    PropagationPolicy(
        label=DataLabel.CONFIDENTIAL,
        allowed_tools=[],
        blocked_tools=["email_send_external"],
        allowed_destinations=[],
        requires_approval=True,
    ),
    PropagationPolicy(
        label=DataLabel.INTERNAL,
        allowed_tools=[],
        blocked_tools=[],
        allowed_destinations=[],
        requires_approval=False,
    ),
    PropagationPolicy(
        label=DataLabel.PUBLIC,
        allowed_tools=[],
        blocked_tools=[],
        allowed_destinations=[],
        requires_approval=False,
    ),
]

# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------

_DEFAULT_DB = Path("/tmp/amc_v12_classification.db")


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS classifications (
            data_id        TEXT PRIMARY KEY,
            content_hash   TEXT NOT NULL,
            label          TEXT NOT NULL,
            confidence     REAL NOT NULL,
            matching_rules TEXT NOT NULL,
            classified_at  TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _save_labeled(conn: sqlite3.Connection, ld: LabeledData) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO classifications
            (data_id, content_hash, label, confidence, matching_rules, classified_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            ld.data_id,
            ld.content_hash,
            ld.label.value,
            ld.confidence,
            json.dumps(ld.matching_rules),
            ld.classified_at.isoformat(),
        ),
    )
    conn.commit()


def _load_labeled(
    conn: sqlite3.Connection, data_id: str
) -> LabeledData | None:
    row = conn.execute(
        "SELECT * FROM classifications WHERE data_id = ?", (data_id,)
    ).fetchone()
    if row is None:
        return None
    return LabeledData(
        data_id=row[0],
        content_hash=row[1],
        label=DataLabel(row[2]),
        confidence=row[3],
        matching_rules=json.loads(row[4]),
        classified_at=datetime.fromisoformat(row[5]),
    )


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class DataClassifier:
    """Classify content and propagate labels through tool/destination checks.

    Parameters
    ----------
    config:
        Custom classification configuration.  Built-in rules and policies
        are always merged in unless *merge_builtins=False*.
    db_path:
        Path to the SQLite database used for persistence.
    merge_builtins:
        If *True* (default), built-in rules and policies are prepended to
        any supplied config.
    """

    def __init__(
        self,
        config: ClassificationConfig | None = None,
        db_path: Path = _DEFAULT_DB,
        merge_builtins: bool = True,
    ) -> None:
        cfg = config or ClassificationConfig()
        if merge_builtins:
            cfg = ClassificationConfig(
                rules=_BUILTIN_RULES + cfg.rules,
                propagation_policies=_BUILTIN_POLICIES + cfg.propagation_policies,
                default_label=cfg.default_label,
            )
        self.config = cfg
        # Pre-compile patterns
        self._compiled: list[tuple[re.Pattern[str], ClassificationRule]] = []
        for rule in cfg.rules:
            flags = re.IGNORECASE if rule.rule_id == "reg_aadhaar" else 0
            self._compiled.append((re.compile(rule.pattern, flags), rule))

        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _init_db(self._conn)

        # Build policy lookup: label -> PropagationPolicy (last write wins)
        self._policy: dict[DataLabel, PropagationPolicy] = {}
        for p in cfg.propagation_policies:
            self._policy[p.label] = p

        log.info("DataClassifier initialised", db_path=str(db_path))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def classify(
        self, content: str, data_id: str | None = None
    ) -> LabeledData:
        """Classify *content* and return the highest-severity label.

        Parameters
        ----------
        content:
            Text to classify.
        data_id:
            Optional stable identifier for this piece of data.  A UUID is
            generated if not supplied.

        Returns
        -------
        LabeledData
        """
        data_id = data_id or str(uuid.uuid4())
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        best_label = self.config.default_label
        best_confidence = 0.0
        matching_rules: list[str] = []

        for pattern, rule in self._compiled:
            if pattern.search(content):
                matching_rules.append(rule.rule_id)
                if _LABEL_SEVERITY[rule.label] > _LABEL_SEVERITY[best_label]:
                    best_label = rule.label
                    best_confidence = rule.confidence
                elif (
                    _LABEL_SEVERITY[rule.label] == _LABEL_SEVERITY[best_label]
                    and rule.confidence > best_confidence
                ):
                    best_confidence = rule.confidence

        if not matching_rules:
            best_confidence = 1.0  # default label applied with full confidence

        ld = LabeledData(
            data_id=data_id,
            content_hash=content_hash,
            label=best_label,
            confidence=best_confidence,
            matching_rules=matching_rules,
            classified_at=datetime.now(timezone.utc),
        )
        _save_labeled(self._conn, ld)
        log.info(
            "classify",
            data_id=data_id,
            label=best_label.value,
            rules_matched=len(matching_rules),
        )
        return ld

    def check_tool_allowed(
        self, label: DataLabel, tool_name: str
    ) -> tuple[bool, str]:
        """Check whether *tool_name* is permitted for data labelled *label*.

        Parameters
        ----------
        label:
            The classification label of the data.
        tool_name:
            Name of the tool being invoked.

        Returns
        -------
        tuple[bool, str]
            *(allowed, reason)*
        """
        policy = self._policy.get(label)
        if policy is None:
            return True, f"No policy defined for label '{label.value}' — defaulting to allow"

        if tool_name in policy.blocked_tools:
            return (
                False,
                f"Tool '{tool_name}' is blocked for {label.value} data",
            )
        if policy.allowed_tools and tool_name not in policy.allowed_tools:
            return (
                False,
                f"Tool '{tool_name}' is not in the allow-list for {label.value} data",
            )
        if policy.requires_approval:
            return (
                True,
                f"Tool '{tool_name}' allowed but requires human approval for {label.value} data",
            )
        return True, f"Tool '{tool_name}' is allowed for {label.value} data"

    def check_destination_allowed(
        self, label: DataLabel, destination: str
    ) -> tuple[bool, str]:
        """Check whether *destination* is permitted for data labelled *label*.

        Parameters
        ----------
        label:
            The classification label of the data.
        destination:
            Destination identifier (e.g. "external-email", "internal-only").

        Returns
        -------
        tuple[bool, str]
            *(allowed, reason)*
        """
        policy = self._policy.get(label)
        if policy is None:
            return True, f"No policy defined for label '{label.value}' — defaulting to allow"

        if policy.allowed_destinations:
            if destination in policy.allowed_destinations:
                return True, f"Destination '{destination}' is explicitly allowed for {label.value} data"
            return (
                False,
                f"Destination '{destination}' not in the allow-list for {label.value} data",
            )
        # No restriction list — allowed everywhere
        return True, f"Destination '{destination}' is allowed for {label.value} data"

    def get_classification(self, data_id: str) -> LabeledData | None:
        """Retrieve a previously stored classification by *data_id*.

        Parameters
        ----------
        data_id:
            The identifier used when ``classify()`` was called.

        Returns
        -------
        LabeledData | None
        """
        return _load_labeled(self._conn, data_id)
