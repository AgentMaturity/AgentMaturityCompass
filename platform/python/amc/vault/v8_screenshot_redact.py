"""
AMC Vault — V8: Screenshot and Screen Recording Redaction Pipeline
=================================================================

Works without heavy ML dependencies.  The pipeline extracts text-like regions
from images, applies DLP patterns (through :class:`DLPRedactor`), redacts the
regions, and writes a share-safe copy with a watermark.

Usage
-----

.. code-block:: python

    from amc.vault.v8_screenshot_redact import ScreenshotRedactor

    redactor = ScreenshotRedactor(
        restricted_original_dir="/tmp/amc_sec/originals",
        share_base_dir="/tmp/amc_sec/shares",
    )

    result = redactor.redact_image("in.png", "redacted.png")
    print(result.redacted_path, result.redactions_count)

    link = redactor.create_share_link("redacted.png", ttl_hours=2)
    print(link.share_url)

    safe_text = redactor.redact_text_overlay("visit admin.example.com with key sk-proj-...")
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import structlog
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pydantic import BaseModel, Field

from amc.vault.v2_dlp import DLPRedactor, DetectedSecret

log = structlog.get_logger(__name__)

# Optional OCR dependency; if missing, fallback to conservative region sampling.
try:  # pragma: no cover
    import pytesseract
    from pytesseract import Output as _TessOutput
    _OCR_AVAILABLE = True
except Exception:  # pragma: no cover
    pytesseract = None  # type: ignore
    _TessOutput = None  # type: ignore
    _OCR_AVAILABLE = False


ALWAYS_REDACT_KEYWORDS = [
    re.compile(r"banking", re.I),
    re.compile(r"admin", re.I),
    re.compile(r"credential", re.I),
    re.compile(r"sign.?in", re.I),
]


_SCHEMA = """
CREATE TABLE IF NOT EXISTS screenshot_share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT NOT NULL UNIQUE,
    redacted_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    share_url TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT unique_path UNIQUE (redacted_path)
);
"""


class RedactedRegion(BaseModel):
    """Geometry and rationale for a single redaction block."""

    left: int
    top: int
    right: int
    bottom: int
    reason: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class RedactionResult(BaseModel):
    """Result returned from :meth:`ScreenshotRedactor.redact_image`."""

    redacted_path: str
    original_hash: str
    redactions_count: int
    redacted_regions: list[RedactedRegion] = Field(default_factory=list)


class ShareLink(BaseModel):
    """Share token for a redacted asset."""

    link_id: str
    redacted_path: str
    share_url: str
    created_at: datetime
    expires_at: datetime
    ttl_hours: float


class ScreenshotRedactor:
    """Image redaction engine for screenshots and screen recordings."""

    def __init__(
        self,
        *,
        restricted_original_dir: str | Path = "/tmp/amc_secure_originals",
        share_base_dir: str | Path = "/tmp/amc_screenshot_share",
        redact_fill: tuple[int, int, int] = (0, 0, 0),
        watermark_text: str = "AMC REDACTED",
        watermark_opacity: int = 80,
        min_text_area: int = 30,
        ocr_conf_threshold: int = 40,
    ) -> None:
        self.restricted_original_dir = Path(restricted_original_dir)
        self.share_base_dir = Path(share_base_dir)
        self.restrict_db = self.share_base_dir / "share_links.db"
        self.restrict_db.parent.mkdir(parents=True, exist_ok=True)
        self.restricted_original_dir.mkdir(parents=True, exist_ok=True)
        self.share_base_dir.mkdir(parents=True, exist_ok=True)
        self.redact_fill = redact_fill
        self.watermark_text = watermark_text
        self.watermark_opacity = watermark_opacity
        self.min_text_area = min_text_area
        self.ocr_conf_threshold = ocr_conf_threshold
        self.dlp = DLPRedactor()

        self._init_schema()

    # ------------------------------------------------------------------
    # API
    # ------------------------------------------------------------------

    def redact_image(self, image_path: str | Path, output_path: str | Path) -> RedactionResult:
        """Redact sensitive regions in an image and return the redaction result."""
        image_path = Path(image_path)
        output_path = Path(output_path)

        if not image_path.exists():
            raise FileNotFoundError(f"input image not found: {image_path}")

        original_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()

        # Persist immutable original for audit and legal requests.
        safe_original = self.restricted_original_dir / f"{original_hash}_{image_path.name}"
        if not safe_original.exists():
            safe_original.write_bytes(image_path.read_bytes())

        with Image.open(image_path) as src:
            im = src.convert("RGB")

        regions = self._detect_sensitive_regions(im)

        canvas = im.copy()
        draw = ImageDraw.Draw(canvas)

        out_regions: list[RedactedRegion] = []
        for left, top, right, bottom, reason, conf in regions:
            if right <= left or bottom <= top:
                continue
            draw.rectangle((left, top, right, bottom), fill=self.redact_fill)
            out_regions.append(RedactedRegion(
                left=left,
                top=top,
                right=right,
                bottom=bottom,
                reason=reason,
                confidence=conf,
            ))

        self._apply_watermark(
            canvas,
            f"{self.watermark_text} [{datetime.now(timezone.utc).isoformat()}]",
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path)

        log.info(
            "screenshot_redactor.redact_image",
            input=str(image_path),
            output=str(output_path),
            redactions=len(out_regions),
            original_hash=original_hash,
        )

        return RedactionResult(
            redacted_path=str(output_path),
            original_hash=original_hash,
            redactions_count=len(out_regions),
            redacted_regions=out_regions,
        )

    def redact_text_overlay(self, text: str) -> str:
        """Redact sensitive tokens in an HTML/text screenshot capture string."""
        if not text:
            return text

        findings = self.dlp.scan(text)
        redacted = text

        for finding in sorted(findings, key=lambda i: i.span_start, reverse=True):
            redacted = self._replace_span(
                redacted,
                finding,
                f"[REDACTED:{finding.type.value}]",
            )

        # Always redact known sensitive domains/phrases regardless of ML output.
        for pat in ALWAYS_REDACT_KEYWORDS:
            redacted = pat.sub("[REDACTED:DOMAIN]", redacted)

        return redacted

    def create_share_link(self, redacted_path: str | Path, ttl_hours: float) -> ShareLink:
        """Create a short-lived link id for the redacted artifact."""
        redacted_path = Path(redacted_path)
        if not redacted_path.exists():
            raise FileNotFoundError(f"missing redacted file: {redacted_path}")

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=float(ttl_hours))
        link_id = hashlib.sha256(
            f"{redacted_path}|{now.isoformat()}".encode("utf-8")
        ).hexdigest()[:32]
        share_url = f"amc://share/{link_id}"

        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO screenshot_share_links
                (link_id, redacted_path, created_at, expires_at, share_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    link_id,
                    str(redacted_path),
                    now.isoformat(),
                    expires_at.isoformat(),
                    share_url,
                ),
            )

        log.info("screenshot_redactor.create_share", link_id=link_id, path=str(redacted_path), ttl_hours=ttl_hours)
        return ShareLink(
            link_id=link_id,
            redacted_path=str(redacted_path),
            share_url=share_url,
            created_at=now,
            expires_at=expires_at,
            ttl_hours=float(ttl_hours),
        )

    def resolve_share_link(self, link_id: str) -> Path:
        """Resolve link to file path while honoring expiry and incrementing hits."""
        now = datetime.now(timezone.utc)
        with self._tx() as cur:
            row = cur.execute(
                "SELECT redacted_path, expires_at, hit_count FROM screenshot_share_links WHERE link_id = ?",
                (link_id,),
            ).fetchone()
            if not row:
                raise KeyError(f"share link not found: {link_id}")

            redacted_path, expires_at, hit_count = row
            if datetime.fromisoformat(expires_at) <= now:
                raise PermissionError("share link expired")

            cur.execute(
                "UPDATE screenshot_share_links SET hit_count = ? WHERE link_id = ?",
                (int(hit_count or 0) + 1, link_id),
            )

        return Path(redacted_path)

    def purge_expired_links(self) -> int:
        """Delete and count all expired share links."""
        now = datetime.now(timezone.utc).isoformat()
        with self._tx() as cur:
            count = cur.execute(
                "SELECT COUNT(*) FROM screenshot_share_links WHERE expires_at <= ?",
                (now,),
            ).fetchone()[0]
            cur.execute("DELETE FROM screenshot_share_links WHERE expires_at <= ?", (now,))
        return int(count)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.restrict_db)
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _detect_sensitive_regions(self, im: Image.Image) -> list[tuple[int, int, int, int, str, float]]:
        width, height = im.size
        regions: list[tuple[int, int, int, int, str, float]] = []

        # Best effort OCR path
        if _OCR_AVAILABLE:
            data = pytesseract.image_to_data(im, output_type=_TessOutput.DICT)  # type: ignore[arg-type]
            n = len(data.get("text", []))
            for i in range(n):
                raw_text = (data["text"][i] or "").strip()
                if not raw_text:
                    continue
                try:
                    conf = float(data.get("conf", [0])[i])
                except Exception:
                    conf = 0.0
                if conf < self.ocr_conf_threshold:
                    continue

                x = int(data.get("left", [0])[i])
                y = int(data.get("top", [0])[i])
                w = int(data.get("width", [0])[i])
                h = int(data.get("height", [0])[i])

                if w * h < self.min_text_area:
                    continue

                detections = self.dlp.scan(raw_text)
                # Mark high confidence for keyword match and DLP hits.
                if detections:
                    reasons = ",".join({d.type.value for d in detections})
                    reason = reasons or "dlp"
                    regions.append((x, y, x + w, y + h, reason, conf / 100.0))
                elif self._requires_domain_redaction(raw_text):
                    regions.append((x, y, x + w, y + h, "always_domain", min(1.0, conf / 100.0)))

        # Fallback heuristic if OCR unavailable or no hits.
        if not regions:
            gray = ImageOps.grayscale(im)
            pix = gray.load()
            row_h = 24
            for y in range(0, height - row_h, row_h):
                dark = sum(1 for x in range(width) if pix[x, y] < 120)
                ratio = dark / max(1, width)
                if ratio > 0.32:
                    regions.append((0, y, width, y + row_h, "heuristic_row", 0.2))

        return self._merge_regions(self._filter_small(regions))

    @staticmethod
    def _requires_domain_redaction(text: str) -> bool:
        lowered = text.lower()
        if any(p.search(lowered) for p in ALWAYS_REDACT_KEYWORDS):
            return True
        return bool(re.search(r"https?://", lowered))

    @staticmethod
    def _replace_span(text: str, finding: DetectedSecret, replacement: str) -> str:
        if finding.span_start >= len(text) or finding.span_end > len(text):
            return text
        return text[:finding.span_start] + replacement + text[finding.span_end:]

    @staticmethod
    def _filter_small(
        regions: list[tuple[int, int, int, int, str, float]],
        min_area: int = 120,
    ) -> list[tuple[int, int, int, int, str, float]]:
        return [r for r in regions if (r[2] - r[0]) * (r[3] - r[1]) >= min_area]

    @staticmethod
    def _merge_regions(regions: list[tuple[int, int, int, int, str, float]], overlap_ratio: float = 0.25) -> list[tuple[int, int, int, int, str, float]]:
        if not regions:
            return []

        regions = sorted(regions, key=lambda x: (x[1], x[0]))
        merged = [regions[0]]

        def _iou(a: tuple[int, int, int, int, str, float], b: tuple[int, int, int, int, str, float]) -> float:
            l1, t1, r1, b1, _, _ = a
            l2, t2, r2, b2, _, _ = b
            inter_x1 = max(l1, l2)
            inter_y1 = max(t1, t2)
            inter_x2 = min(r1, r2)
            inter_y2 = min(b1, b2)
            if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
                return 0.0
            inter = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
            a_area = (r1 - l1) * (b1 - t1)
            b_area = (r2 - l2) * (b2 - t2)
            return inter / min(a_area, b_area)

        for reg in regions[1:]:
            last = merged[-1]
            if _iou(last, reg) >= overlap_ratio:
                merged[-1] = (
                    min(last[0], reg[0]),
                    min(last[1], reg[1]),
                    max(last[2], reg[2]),
                    max(last[3], reg[3]),
                    f"{last[4]};{reg[4]}",
                    max(last[5], reg[5]),
                )
            else:
                merged.append(reg)

        return merged

    def _apply_watermark(self, im: Image.Image, text: str) -> None:
        draw = ImageDraw.Draw(im)
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
        x1, y1, x2, y2 = draw.textbbox((0, 0), text, font=font)
        pad = 6
        x = max(2, im.width - (x2 - x1) - pad)
        y = max(2, im.height - (y2 - y1) - pad)

        overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle(
            [x - 4, y - 4, x + (x2 - x1) + 4, y + (y2 - y1) + 4],
            fill=(255, 255, 255, self.watermark_opacity),
        )
        overlay_draw.text((x, y), text, fill=(0, 0, 0, 255), font=font)
        combined = Image.alpha_composite(im.convert("RGBA"), overlay)
        im.paste(Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB"))

    # Optional helper for observability tooling
    @staticmethod
    def original_hash(path: str | Path) -> str:
        """Compute SHA-256 for an arbitrary file path."""
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()


RedactedRegion.model_rebuild()
RedactionResult.model_rebuild()
ShareLink.model_rebuild()
