"""
LegalContractAnalyzerBot — V1 (ungoverned)
Analyzes contracts using regex-based clause extraction.
No governance, no audit trail, no injection detection, no circuit breakers.
"""
from __future__ import annotations

import re
import time
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class ClauseType(str, Enum):
    LIABILITY_CAP = "liability_cap"
    IP_OWNERSHIP = "ip_ownership"
    TERMINATION = "termination"
    AUTO_RENEWAL = "auto_renewal"
    JURISDICTION = "jurisdiction"
    NON_COMPETE = "non_compete"
    INDEMNIFICATION = "indemnification"
    CONFIDENTIALITY = "confidentiality"
    FORCE_MAJEURE = "force_majeure"
    PAYMENT_TERMS = "payment_terms"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ClauseResult:
    clause_type: ClauseType
    found: bool
    text_snippet: str
    risk_level: RiskLevel
    risk_reason: str
    confidence: float


@dataclass
class ContractAnalysis:
    contract_id: str
    clauses: list[ClauseResult]
    overall_risk_score: int  # 0-100
    risk_summary: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)


# Regex patterns for clause extraction
CLAUSE_PATTERNS: dict[ClauseType, list[re.Pattern]] = {
    ClauseType.LIABILITY_CAP: [
        re.compile(r"(?i)(liabilit\w+).{0,200}(cap|limit|not exceed|maximum|aggregate)", re.DOTALL),
        re.compile(r"(?i)(unlimited\s+liabilit)", re.DOTALL),
        re.compile(r"(?i)(in no event.{0,100}liable.{0,100}exceed)", re.DOTALL),
    ],
    ClauseType.IP_OWNERSHIP: [
        re.compile(r"(?i)(intellectual property|IP).{0,200}(own|assign|transfer|vest|belong)", re.DOTALL),
        re.compile(r"(?i)(work.made.for.hire|work\s+product).{0,150}(own|belong|vest)", re.DOTALL),
        re.compile(r"(?i)(all\s+(?:right|title|interest)).{0,100}(assign|transfer|vest)", re.DOTALL),
    ],
    ClauseType.TERMINATION: [
        re.compile(r"(?i)(terminat\w+).{0,200}(notice|days|written|cause|convenience|breach)", re.DOTALL),
        re.compile(r"(?i)(either\s+party\s+may\s+terminat)", re.DOTALL),
    ],
    ClauseType.AUTO_RENEWAL: [
        re.compile(r"(?i)(auto\w*\s*renew|automatic\w*\s*renew)", re.DOTALL),
        re.compile(r"(?i)(renew\w+).{0,100}(unless|until|written\s+notice)", re.DOTALL),
    ],
    ClauseType.JURISDICTION: [
        re.compile(r"(?i)(govern\w+\s+(?:by\s+)?(?:the\s+)?law\w*\s+of)", re.DOTALL),
        re.compile(r"(?i)(jurisdicti\w+|venue).{0,100}(state|court|county|district)", re.DOTALL),
        re.compile(r"(?i)(exclusive\s+jurisdicti)", re.DOTALL),
    ],
    ClauseType.NON_COMPETE: [
        re.compile(r"(?i)(non[\s-]*compet\w+|restrictive\s+covenant)", re.DOTALL),
        re.compile(r"(?i)(shall\s+not\s+(?:directly|indirectly).{0,100}compet)", re.DOTALL),
    ],
    ClauseType.INDEMNIFICATION: [
        re.compile(r"(?i)(indemnif\w+|hold\s+harmless)", re.DOTALL),
    ],
    ClauseType.CONFIDENTIALITY: [
        re.compile(r"(?i)(confidential\w*).{0,200}(information|material|disclose|not\s+disclose)", re.DOTALL),
        re.compile(r"(?i)(non[\s-]*disclosure|NDA)", re.DOTALL),
    ],
    ClauseType.FORCE_MAJEURE: [
        re.compile(r"(?i)(force\s+majeure|act\s+of\s+god)", re.DOTALL),
    ],
    ClauseType.PAYMENT_TERMS: [
        re.compile(r"(?i)(payment).{0,200}(net\s+\d+|within\s+\d+\s+days|upon\s+receipt|due\s+date)", re.DOTALL),
        re.compile(r"(?i)(invoice\w*).{0,100}(pay|due|net)", re.DOTALL),
    ],
}

# Risk flags
RISK_FLAGS: dict[ClauseType, list[tuple[re.Pattern, RiskLevel, str]]] = {
    ClauseType.LIABILITY_CAP: [
        (re.compile(r"(?i)unlimited\s+liabilit"), RiskLevel.CRITICAL, "Unlimited liability exposure"),
        (re.compile(r"(?i)in\s+no\s+event.{0,50}liable"), RiskLevel.MEDIUM, "Liability limitation present"),
    ],
    ClauseType.IP_OWNERSHIP: [
        (re.compile(r"(?i)all\s+(?:right|title|interest).{0,50}(?:assign|transfer).{0,50}(?:company|client|employer)"), RiskLevel.HIGH, "One-sided IP assignment"),
        (re.compile(r"(?i)work.made.for.hire"), RiskLevel.HIGH, "Work-for-hire IP assignment"),
    ],
    ClauseType.NON_COMPETE: [
        (re.compile(r"(?i)(?:2|3|4|5)\s+year"), RiskLevel.HIGH, "Extended non-compete period"),
        (re.compile(r"(?i)worldwide|global"), RiskLevel.CRITICAL, "Worldwide non-compete scope"),
        (re.compile(r"(?i)non[\s-]*compet"), RiskLevel.MEDIUM, "Non-compete clause present"),
    ],
    ClauseType.AUTO_RENEWAL: [
        (re.compile(r"(?i)auto\w*\s*renew"), RiskLevel.MEDIUM, "Auto-renewal may lock you in"),
    ],
    ClauseType.INDEMNIFICATION: [
        (re.compile(r"(?i)sole\w*\s+(?:expense|cost).{0,50}indemnif"), RiskLevel.HIGH, "One-sided indemnification"),
    ],
}


class LegalContractAnalyzerBot:
    """V1 contract analyzer — regex-based, no AMC modules."""

    def __init__(self):
        self._analysis_count = 0

    def analyze(self, contract_text: str) -> dict:
        """Analyze contract text and return structured results."""
        self._analysis_count += 1
        contract_id = hashlib.sha256(contract_text.encode()[:256]).hexdigest()[:12]

        clauses = []
        total_risk = 0

        for clause_type, patterns in CLAUSE_PATTERNS.items():
            found = False
            snippet = ""
            for pat in patterns:
                m = pat.search(contract_text)
                if m:
                    found = True
                    start = max(0, m.start() - 20)
                    end = min(len(contract_text), m.end() + 80)
                    snippet = contract_text[start:end].strip()
                    break

            risk_level = RiskLevel.LOW
            risk_reason = "No specific risk identified"

            if found and clause_type in RISK_FLAGS:
                for risk_pat, level, reason in RISK_FLAGS[clause_type]:
                    if risk_pat.search(contract_text):
                        risk_level = level
                        risk_reason = reason
                        break

            risk_points = {"low": 0, "medium": 10, "high": 25, "critical": 40}
            total_risk += risk_points.get(risk_level.value, 0)

            clauses.append(ClauseResult(
                clause_type=clause_type,
                found=found,
                text_snippet=snippet[:200] if snippet else "",
                risk_level=risk_level,
                risk_reason=risk_reason,
                confidence=0.7 if found else 0.3,
            ))

        overall_risk = min(100, total_risk)

        if overall_risk >= 70:
            summary = "HIGH RISK — Multiple critical/high-risk clauses detected. Legal review strongly recommended."
        elif overall_risk >= 40:
            summary = "MODERATE RISK — Some concerning clauses found. Review recommended."
        elif overall_risk >= 15:
            summary = "LOW-MODERATE RISK — Minor concerns identified."
        else:
            summary = "LOW RISK — No significant concerns detected."

        analysis = ContractAnalysis(
            contract_id=contract_id,
            clauses=clauses,
            overall_risk_score=overall_risk,
            risk_summary=summary,
        )

        return {
            "contract_id": analysis.contract_id,
            "overall_risk_score": analysis.overall_risk_score,
            "risk_summary": analysis.risk_summary,
            "timestamp": analysis.timestamp,
            "clauses": [
                {
                    "type": c.clause_type.value,
                    "found": c.found,
                    "snippet": c.text_snippet,
                    "risk_level": c.risk_level.value,
                    "risk_reason": c.risk_reason,
                    "confidence": c.confidence,
                }
                for c in analysis.clauses
            ],
        }
