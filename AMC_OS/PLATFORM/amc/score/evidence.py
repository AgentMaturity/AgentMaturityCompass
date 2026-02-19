"""
AMC Score — Evidence Artifact System
Execution-proof evidence that prevents gaming via keyword matching.
Trust levels range from keyword claims (lowest) to continuous verification (highest).
"""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EvidenceKind(str, Enum):
    KEYWORD_CLAIM = "keyword_claim"            # Old way — lowest trust
    CODE_PRESENT = "code_present"              # Code exists in file — low trust
    IMPORT_VERIFIED = "import_verified"        # Module actually imports — medium trust
    EXECUTION_VERIFIED = "execution_verified"  # Module called, got real result — high trust
    CONTINUOUS_VERIFIED = "continuous_verified" # Runs in prod, has logs — highest trust


# Trust multipliers: fraction of full points awarded per evidence kind
TRUST_MULTIPLIERS: dict[EvidenceKind, float] = {
    EvidenceKind.KEYWORD_CLAIM: 0.40,
    EvidenceKind.CODE_PRESENT: 0.55,
    EvidenceKind.IMPORT_VERIFIED: 0.70,
    EvidenceKind.EXECUTION_VERIFIED: 1.00,
    EvidenceKind.CONTINUOUS_VERIFIED: 1.10,
}


class EvidenceArtifact(BaseModel):
    """A single piece of evidence linking a questionnaire item to a verifiable capability."""
    qid: str
    kind: EvidenceKind
    claim: str                          # Human-readable description
    execution_result: Any = None        # Actual return value from module call
    execution_error: str | None = None  # Error if execution failed
    verified_at: str                    # ISO timestamp
    trust_score: float = Field(ge=0.0, le=1.1)  # Based on kind

    @staticmethod
    def trust_for_kind(kind: EvidenceKind, has_error: bool = False) -> float:
        """Compute trust score for a given evidence kind."""
        if has_error:
            return 0.0
        return TRUST_MULTIPLIERS[kind]
