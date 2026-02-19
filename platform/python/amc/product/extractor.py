"""AMC Unstructured-to-Structured Extraction Pipeline — Feature #30.

Extract entities (vendors, amounts, dates, SKUs, emails, phones, URLs) from
free-form text/documents using regex + heuristics. No external ML deps.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Entity type constants
# ---------------------------------------------------------------------------

ENTITY_VENDOR = "vendor"
ENTITY_AMOUNT = "amount"
ENTITY_DATE = "date"
ENTITY_SKU = "sku"
ENTITY_EMAIL = "email"
ENTITY_PHONE = "phone"
ENTITY_URL = "url"
ENTITY_PERCENTAGE = "percentage"
ENTITY_INVOICE_NO = "invoice_number"
ENTITY_PO_NUMBER = "po_number"

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Currency amounts: $1,234.56 / USD 1234 / €99.99
_AMOUNT_PATTERN = re.compile(
    r"""
    (?:
        (?P<symbol>[\$€£¥₹])
        \s*(?P<amount1>[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,4})?)
    |
        (?P<amount2>[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,4})?)
        \s*(?P<currency>[A-Z]{3})
    )
    """,
    re.VERBOSE,
)

# Dates: 2024-01-15 / Jan 15, 2024 / 15/01/2024 / January 15 2024
_DATE_PATTERN = re.compile(
    r"""
    \b(?:
        (?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|
           Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)
        \s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}
    |
        \d{1,2}\s+
        (?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|
           Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)
        \s+\d{4}
    |
        \d{4}[-/]\d{1,2}[-/]\d{1,2}
    |
        \d{1,2}[-/]\d{1,2}[-/]\d{2,4}
    )\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

# SKUs: alphanumeric codes like SKU-12345, PROD-ABC-001, P1234567
_SKU_PATTERN = re.compile(
    r"\b(?:SKU|ITEM|PART|PROD|MODEL|REF|CAT|PN|MPN)[#:\-\s]?\s*([A-Z0-9][A-Z0-9\-\_]{2,20})\b",
    re.IGNORECASE,
)

# Standalone alphanumeric product codes (uppercase, min 6 chars)
_STANDALONE_SKU = re.compile(r"\b([A-Z]{2,6}[\-][A-Z0-9]{2,12}(?:[\-][A-Z0-9]{1,8})?)\b")

# Email
_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

# Phone: various formats
_PHONE_PATTERN = re.compile(
    r"""
    (?:\+?1[-.\s]?)?
    (?:\(?[2-9]\d{2}\)?[-.\s]?)
    [2-9]\d{2}
    [-.\s]?\d{4}
    (?:\s*(?:x|ext\.?)\s*\d{1,5})?
    """,
    re.VERBOSE,
)

# URLs
_URL_PATTERN = re.compile(
    r"\b(?:https?://|www\.)[^\s<>\"']{4,200}",
    re.IGNORECASE,
)

# Percentage
_PERCENT_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\s*%")

# Invoice/PO numbers
_INVOICE_PATTERN = re.compile(
    r"\b(?:Invoice|INV|Bill)[\s#:\-]*([A-Z0-9]{4,20})\b",
    re.IGNORECASE,
)
_PO_PATTERN = re.compile(
    r"\b(?:PO|Purchase\s+Order|P\.O\.)[\s#:\-]*([A-Z0-9]{4,20})\b",
    re.IGNORECASE,
)

# Vendor/company heuristic: capitalized words followed by Inc/LLC/Corp/Ltd/Co
_VENDOR_PATTERN = re.compile(
    r"\b([A-Z][a-zA-Z0-9&\.\-]{1,40}(?:\s+[A-Z][a-zA-Z0-9&\.\-]{1,40}){0,4})"
    r"\s*(?:,\s*)?(?:Inc\.?|LLC\.?|Corp\.?|Ltd\.?|Co\.?|GmbH|AG|SA|SAS|BV|NV|Pty\.?\s*Ltd\.?)",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class Entity:
    """A single extracted entity."""
    entity_type: str
    value: str
    normalized: str
    start: int
    end: int
    confidence: float
    context: str = ""

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "value": self.value,
            "normalized": self.normalized,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
            "context": self.context,
        }


@dataclass
class ExtractionInput:
    """Input to the extraction pipeline."""
    text: str
    entity_types: list[str] = field(default_factory=list)  # empty = all
    context_window: int = 40  # characters either side for context snippet
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExtractionResult:
    """Full extraction output."""
    entities: list[Entity]
    entity_counts: dict[str, int]
    total_entities: int
    char_length: int
    extraction_ts: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "entities": [e.dict for e in self.entities],
            "entity_counts": self.entity_counts,
            "total_entities": self.total_entities,
            "char_length": self.char_length,
            "extraction_ts": self.extraction_ts,
        }

    def by_type(self, entity_type: str) -> list[Entity]:
        return [e for e in self.entities if e.entity_type == entity_type]


# ---------------------------------------------------------------------------
# Core extractor
# ---------------------------------------------------------------------------

class EntityExtractor:
    """Regex + heuristic entity extractor. Stateless; no external deps."""

    def extract(self, inp: ExtractionInput) -> ExtractionResult:
        text = inp.text
        want = set(inp.entity_types) if inp.entity_types else None
        entities: list[Entity] = []

        def _ctx(m: re.Match) -> str:  # type: ignore[type-arg]
            s = max(0, m.start() - inp.context_window)
            e = min(len(text), m.end() + inp.context_window)
            snippet = text[s:e].replace("\n", " ")
            return snippet

        if want is None or ENTITY_VENDOR in want:
            for m in _VENDOR_PATTERN.finditer(text):
                name = m.group().strip()
                entities.append(Entity(
                    entity_type=ENTITY_VENDOR,
                    value=name,
                    normalized=_normalize_vendor(name),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.80,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_AMOUNT in want:
            for m in _AMOUNT_PATTERN.finditer(text):
                raw = m.group().strip()
                normalized = _normalize_amount(m)
                entities.append(Entity(
                    entity_type=ENTITY_AMOUNT,
                    value=raw,
                    normalized=normalized,
                    start=m.start(),
                    end=m.end(),
                    confidence=0.95,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_DATE in want:
            for m in _DATE_PATTERN.finditer(text):
                raw = m.group().strip()
                entities.append(Entity(
                    entity_type=ENTITY_DATE,
                    value=raw,
                    normalized=_normalize_date(raw),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.85,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_SKU in want:
            seen_sku: set[str] = set()
            for m in _SKU_PATTERN.finditer(text):
                code = (m.group(1) if m.lastindex else m.group()).upper().strip()
                if code not in seen_sku:
                    seen_sku.add(code)
                    entities.append(Entity(
                        entity_type=ENTITY_SKU,
                        value=m.group().strip(),
                        normalized=code,
                        start=m.start(),
                        end=m.end(),
                        confidence=0.90,
                        context=_ctx(m),
                    ))
            for m in _STANDALONE_SKU.finditer(text):
                code = m.group(1).upper()
                if code not in seen_sku:
                    seen_sku.add(code)
                    entities.append(Entity(
                        entity_type=ENTITY_SKU,
                        value=m.group().strip(),
                        normalized=code,
                        start=m.start(),
                        end=m.end(),
                        confidence=0.70,
                        context=_ctx(m),
                    ))

        if want is None or ENTITY_EMAIL in want:
            for m in _EMAIL_PATTERN.finditer(text):
                entities.append(Entity(
                    entity_type=ENTITY_EMAIL,
                    value=m.group(),
                    normalized=m.group().lower(),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.98,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_PHONE in want:
            for m in _PHONE_PATTERN.finditer(text):
                raw = m.group().strip()
                if len(re.sub(r"\D", "", raw)) >= 7:
                    entities.append(Entity(
                        entity_type=ENTITY_PHONE,
                        value=raw,
                        normalized=re.sub(r"[^\d+x]", "", raw),
                        start=m.start(),
                        end=m.end(),
                        confidence=0.82,
                        context=_ctx(m),
                    ))

        if want is None or ENTITY_URL in want:
            for m in _URL_PATTERN.finditer(text):
                entities.append(Entity(
                    entity_type=ENTITY_URL,
                    value=m.group(),
                    normalized=m.group().rstrip(".,;)\"'"),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.97,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_PERCENTAGE in want:
            for m in _PERCENT_PATTERN.finditer(text):
                entities.append(Entity(
                    entity_type=ENTITY_PERCENTAGE,
                    value=m.group(),
                    normalized=m.group().replace(" ", ""),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.95,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_INVOICE_NO in want:
            for m in _INVOICE_PATTERN.finditer(text):
                num = m.group(1) if m.lastindex else m.group()
                entities.append(Entity(
                    entity_type=ENTITY_INVOICE_NO,
                    value=m.group().strip(),
                    normalized=num.upper(),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.88,
                    context=_ctx(m),
                ))

        if want is None or ENTITY_PO_NUMBER in want:
            for m in _PO_PATTERN.finditer(text):
                num = m.group(1) if m.lastindex else m.group()
                entities.append(Entity(
                    entity_type=ENTITY_PO_NUMBER,
                    value=m.group().strip(),
                    normalized=num.upper(),
                    start=m.start(),
                    end=m.end(),
                    confidence=0.88,
                    context=_ctx(m),
                ))

        # Sort by start position
        entities.sort(key=lambda e: e.start)

        counts: dict[str, int] = {}
        for ent in entities:
            counts[ent.entity_type] = counts.get(ent.entity_type, 0) + 1

        return ExtractionResult(
            entities=entities,
            entity_counts=counts,
            total_entities=len(entities),
            char_length=len(text),
            extraction_ts=datetime.now(timezone.utc).isoformat(),
        )


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------

def _normalize_vendor(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


def _normalize_amount(m: re.Match) -> str:  # type: ignore[type-arg]
    raw = m.group()
    symbol_map = {"$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR"}
    sym = m.group("symbol") if "symbol" in m.groupdict() and m.group("symbol") else ""
    currency = symbol_map.get(sym, m.group("currency") if "currency" in m.groupdict() and m.group("currency") else "")
    amt_str = (
        m.group("amount1")
        if "amount1" in m.groupdict() and m.group("amount1")
        else m.group("amount2") if "amount2" in m.groupdict() else raw
    )
    amt_clean = re.sub(r"[,\s]", "", amt_str or "")
    try:
        amt = float(amt_clean)
        return f"{currency} {amt:.2f}" if currency else f"{amt:.2f}"
    except (ValueError, TypeError):
        return raw.strip()


def _normalize_date(raw: str) -> str:
    """Best-effort ISO date normalization."""
    raw = raw.strip()
    # Already ISO
    if re.match(r"\d{4}-\d{2}-\d{2}", raw):
        return raw[:10]
    # Try common formats
    for fmt in (
        "%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y",
        "%d %B %Y", "%d %b %Y",
        "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y",
        "%d/%m/%y", "%m/%d/%y",
    ):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw  # return original if unparseable


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_extractor: EntityExtractor | None = None


def get_extractor() -> EntityExtractor:
    global _extractor
    if _extractor is None:
        _extractor = EntityExtractor()
    return _extractor
