"""
AMC Vault — V2: DLP Redaction Middleware
Detect and redact secrets, credentials, and PII from prompts,
tool outputs, transcripts, and outgoing messages.

Usage:
    dlp = DLPRedactor()

    clean, receipts = dlp.redact("My API key is sk-proj-abc123xyz and email is foo@bar.com")
    # clean == "My API key is [REDACTED:api_key] and email is [REDACTED:email]"
    # receipts == [RedactionReceipt(...), RedactionReceipt(...)]

    # Scan without redacting (just detect):
    findings = dlp.scan("Bearer eyJhbGciOiJIUzI1NiJ9...")
"""
from __future__ import annotations

import hashlib
import math
import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


class SecretType(str, Enum):
    API_KEY = "api_key"
    PRIVATE_KEY = "private_key"
    JWT_TOKEN = "jwt_token"
    BEARER_TOKEN = "bearer_token"
    PASSWORD = "password"
    AWS_SECRET = "aws_secret"
    DATABASE_URL = "database_url"
    EMAIL = "email"
    PHONE = "phone"
    CREDIT_CARD = "credit_card"
    SSN = "ssn"
    IP_ADDRESS = "ip_address"
    INTERNAL_URL = "internal_url"
    HIGH_ENTROPY = "high_entropy"   # generic entropy-based detection


@dataclass
class DetectedSecret:
    type: SecretType
    value_hash: str     # SHA-256 of detected value (not the value itself)
    value_preview: str  # first 4 + "..." — enough to identify but not expose
    span_start: int
    span_end: int
    confidence: float   # 0.0–1.0
    rule_id: str


@dataclass
class RedactionReceipt:
    """Evidence of what was redacted, without revealing the redacted value."""
    receipt_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    secret_type: SecretType = SecretType.HIGH_ENTROPY
    value_hash: str = ""     # SHA-256 of original value
    value_preview: str = ""  # "sk-p..." style
    replacement: str = ""    # "[REDACTED:api_key]"
    rule_id: str = ""
    confidence: float = 1.0
    context_hint: str = ""   # surrounding 20 chars for debugging


# ---------------------------------------------------------------------------
# Detection Rules
# ---------------------------------------------------------------------------

@dataclass
class DLPRule:
    id: str
    secret_type: SecretType
    pattern: re.Pattern
    confidence: float = 1.0
    min_entropy: float | None = None  # if set, also require entropy threshold


def _shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    probs = [v / len(s) for v in freq.values()]
    return -sum(p * math.log2(p) for p in probs if p > 0)


# Entropy threshold: random-looking strings above this are likely secrets
HIGH_ENTROPY_THRESHOLD = 3.8

DLP_RULES: list[DLPRule] = [
    # --- API Keys ---
    DLPRule(
        id="DLP-001", secret_type=SecretType.API_KEY, confidence=0.97,
        pattern=re.compile(
            r"(?<![A-Za-z0-9])"
            r"(sk-[A-Za-z0-9_-]{20,}|"                    # OpenAI-style
            r"sk-proj-[A-Za-z0-9_-]{20,}|"                # OpenAI project key
            r"sk-ant-[A-Za-z0-9_-]{30,}|"                 # Anthropic
            r"xoxb-[0-9A-Za-z-]{50,}|"                    # Slack bot token
            r"xoxp-[0-9A-Za-z-]{70,}|"                    # Slack user token
            r"ghp_[A-Za-z0-9]{36}|"                       # GitHub PAT
            r"ghs_[A-Za-z0-9]{36}|"                       # GitHub action secret
            r"AKIA[0-9A-Z]{16}|"                           # AWS Access Key ID
            r"AIza[0-9A-Za-z_-]{35}|"                     # Google API key
            r"ya29\.[0-9A-Za-z_-]{100,})"                 # Google OAuth token
        ),
    ),
    DLPRule(
        id="DLP-002", secret_type=SecretType.PRIVATE_KEY, confidence=1.0,
        pattern=re.compile(
            r"-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----|"
            r"-----BEGIN\s+EC\s+PRIVATE\s+KEY-----|"
            r"-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----",
            re.MULTILINE,
        ),
    ),
    DLPRule(
        id="DLP-003", secret_type=SecretType.JWT_TOKEN, confidence=0.90,
        pattern=re.compile(
            r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
        ),
    ),
    DLPRule(
        id="DLP-004", secret_type=SecretType.BEARER_TOKEN, confidence=0.85,
        pattern=re.compile(
            r"(?i)bearer\s+([A-Za-z0-9+/=_.-]{20,})",
        ),
    ),
    DLPRule(
        id="DLP-005", secret_type=SecretType.PASSWORD, confidence=0.80,
        pattern=re.compile(
            r'(?i)(?:password|passwd|pwd|secret)\s*[:=]\s*["\']?([^\s"\'<>,;]{8,})["\']?',
        ),
    ),
    DLPRule(
        id="DLP-006", secret_type=SecretType.AWS_SECRET, confidence=0.95,
        pattern=re.compile(
            r"(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])",
        ),
        min_entropy=4.2,
    ),
    DLPRule(
        id="DLP-007", secret_type=SecretType.DATABASE_URL, confidence=0.92,
        pattern=re.compile(
            r"(?i)(postgres|mysql|mongodb|redis|sqlite)://[^@\s]+:[^@\s]+@[^/\s]+",
        ),
    ),

    # --- PII ---
    DLPRule(
        id="DLP-010", secret_type=SecretType.EMAIL, confidence=0.90,
        pattern=re.compile(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        ),
    ),
    DLPRule(
        id="DLP-011", secret_type=SecretType.PHONE, confidence=0.80,
        pattern=re.compile(
            r"(?<!\d)(\+?1?\s?[-.]?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)|"
            r"\+91[-\s]?[6-9]\d{9}",  # Indian mobile
        ),
    ),
    DLPRule(
        id="DLP-012", secret_type=SecretType.CREDIT_CARD, confidence=0.88,
        pattern=re.compile(
            r"(?<!\d)(?:4[0-9]{12}(?:[0-9]{3})?|"
            r"5[1-5][0-9]{14}|"
            r"3[47][0-9]{13}|"
            r"3(?:0[0-5]|[68][0-9])[0-9]{11})(?!\d)"
        ),
    ),
    DLPRule(
        id="DLP-013", secret_type=SecretType.SSN, confidence=0.90,
        pattern=re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"),
    ),
]


# ---------------------------------------------------------------------------
# DLP Redactor Engine
# ---------------------------------------------------------------------------

class DLPRedactor:
    """
    Multi-pass DLP detector and redactor.

    Pass 1: Named pattern rules (fast regex)
    Pass 2: Entropy analysis for unrecognized high-entropy strings
    """

    def __init__(
        self,
        rules: list[DLPRule] | None = None,
        redact_emails: bool = True,
        redact_phones: bool = True,
        entropy_scan: bool = True,
        entropy_min_length: int = 20,
        placeholder_format: str = "[REDACTED:{type}]",
    ) -> None:
        self.rules = rules if rules is not None else DLP_RULES
        self.redact_emails = redact_emails
        self.redact_phones = redact_phones
        self.entropy_scan = entropy_scan
        self.entropy_min_length = entropy_min_length
        self.placeholder_format = placeholder_format

    def _placeholder(self, secret_type: SecretType) -> str:
        return self.placeholder_format.format(type=secret_type.value)

    def scan(self, text: str) -> list[DetectedSecret]:
        """Detect secrets without redacting. Returns list of findings."""
        detected: list[DetectedSecret] = []
        seen_spans: set[tuple[int, int]] = set()

        for rule in self.rules:
            # Skip email/phone if disabled
            if rule.secret_type == SecretType.EMAIL and not self.redact_emails:
                continue
            if rule.secret_type == SecretType.PHONE and not self.redact_phones:
                continue

            for match in rule.pattern.finditer(text):
                span = (match.start(), match.end())
                # Avoid overlapping detections
                if any(s[0] <= span[0] <= s[1] or s[0] <= span[1] <= s[1] for s in seen_spans):
                    continue

                value = match.group(0)
                if len(match.groups()) > 0:
                    # Use first capture group if present (more precise)
                    value = match.group(1) or value

                # Entropy gate for rules that require it
                if rule.min_entropy and _shannon_entropy(value) < rule.min_entropy:
                    continue

                seen_spans.add(span)
                detected.append(DetectedSecret(
                    type=rule.secret_type,
                    value_hash=hashlib.sha256(value.encode()).hexdigest(),
                    value_preview=value[:4] + "..." if len(value) > 4 else "...",
                    span_start=match.start(),
                    span_end=match.end(),
                    confidence=rule.confidence,
                    rule_id=rule.id,
                ))

        # Entropy scan for unrecognized long tokens
        if self.entropy_scan:
            for match in re.finditer(r"[A-Za-z0-9+/=_\-]{%d,}" % self.entropy_min_length, text):
                span = (match.start(), match.end())
                if any(s[0] <= span[0] <= s[1] or s[0] <= span[1] <= s[1] for s in seen_spans):
                    continue
                value = match.group(0)
                if _shannon_entropy(value) >= HIGH_ENTROPY_THRESHOLD:
                    seen_spans.add(span)
                    detected.append(DetectedSecret(
                        type=SecretType.HIGH_ENTROPY,
                        value_hash=hashlib.sha256(value.encode()).hexdigest(),
                        value_preview=value[:4] + "...",
                        span_start=match.start(),
                        span_end=match.end(),
                        confidence=0.70,
                        rule_id="DLP-ENT",
                    ))

        return sorted(detected, key=lambda d: d.span_start)

    def redact(self, text: str) -> tuple[str, list[RedactionReceipt]]:
        """
        Redact all detected secrets from text.
        Returns (redacted_text, list_of_receipts).
        Receipts prove what was removed without revealing the values.
        """
        detected = self.scan(text)
        if not detected:
            return text, []

        receipts: list[RedactionReceipt] = []
        # Process in reverse order to preserve span positions
        result = text
        for secret in reversed(detected):
            placeholder = self._placeholder(secret.type)
            original_value = text[secret.span_start:secret.span_end]
            context_start = max(0, secret.span_start - 10)
            context_end = min(len(text), secret.span_end + 10)
            context = text[context_start:context_end].replace(original_value, "***")

            result = result[:secret.span_start] + placeholder + result[secret.span_end:]
            receipts.append(RedactionReceipt(
                secret_type=secret.type,
                value_hash=secret.value_hash,
                value_preview=secret.value_preview,
                replacement=placeholder,
                rule_id=secret.rule_id,
                confidence=secret.confidence,
                context_hint=context[:60],
            ))

        log.info(
            "dlp.redacted",
            secrets_found=len(detected),
            types=[s.type.value for s in detected],
        )
        return result, list(reversed(receipts))

    def redact_dict(self, data: dict[str, Any], depth: int = 0) -> tuple[dict, list[RedactionReceipt]]:
        """Recursively redact a dict (e.g. tool parameters)."""
        if depth > 10:
            return data, []
        result = {}
        all_receipts: list[RedactionReceipt] = []
        for k, v in data.items():
            if isinstance(v, str):
                clean, receipts = self.redact(v)
                result[k] = clean
                all_receipts.extend(receipts)
            elif isinstance(v, dict):
                clean_v, receipts = self.redact_dict(v, depth + 1)
                result[k] = clean_v
                all_receipts.extend(receipts)
            elif isinstance(v, list):
                clean_list = []
                for item in v:
                    if isinstance(item, str):
                        clean_item, receipts = self.redact(item)
                        clean_list.append(clean_item)
                        all_receipts.extend(receipts)
                    else:
                        clean_list.append(item)
                result[k] = clean_list
            else:
                result[k] = v
        return result, all_receipts
