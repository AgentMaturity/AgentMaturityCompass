"""Chunking + Summarization Pipeline — structure-aware document chunking.

Splits documents by headings / tables / bullet blocks with configurable overlap,
generates per-chunk summaries, and produces a manifest suitable for RAG ingestion.
Pure Python, no SQLite required.

API: POST /api/v1/product/docs/chunk
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ChunkStrategy(str, Enum):
    HEADING = "heading"          # Split at markdown headings (## ...)
    PARAGRAPH = "paragraph"      # Split at double newlines
    SENTENCE = "sentence"        # Split at sentence boundaries
    FIXED = "fixed"              # Fixed token-count windows
    HYBRID = "hybrid"            # Headings → paragraphs → sentences fallback


class ChunkType(str, Enum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    TABLE = "table"
    LIST = "list"
    CODE = "code"
    SENTENCE = "sentence"
    GENERIC = "generic"


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class DocChunk:
    """A single document chunk."""

    chunk_id: str
    doc_id: str
    chunk_index: int
    chunk_type: ChunkType
    heading_path: list[str]    # Breadcrumb of parent headings
    content: str
    summary: str
    token_estimate: int
    start_char: int
    end_char: int
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "chunk_index": self.chunk_index,
            "chunk_type": self.chunk_type.value,
            "heading_path": self.heading_path,
            "content": self.content,
            "summary": self.summary,
            "token_estimate": self.token_estimate,
            "start_char": self.start_char,
            "end_char": self.end_char,
            "metadata": self.metadata,
        }


@dataclass
class ChunkRequest:
    """Input to the chunking pipeline."""

    doc_id: str
    content: str
    strategy: ChunkStrategy = ChunkStrategy.HYBRID
    max_chunk_tokens: int = 512
    overlap_tokens: int = 64
    min_chunk_tokens: int = 5
    generate_summaries: bool = True
    max_summary_length: int = 150
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChunkManifest:
    """Full output of the chunking pipeline for a document."""

    doc_id: str
    strategy: str
    total_chunks: int
    total_tokens: int
    avg_chunk_tokens: float
    chunks: list[DocChunk]
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "strategy": self.strategy,
            "total_chunks": self.total_chunks,
            "total_tokens": self.total_tokens,
            "avg_chunk_tokens": round(self.avg_chunk_tokens, 2),
            "chunks": [c.dict for c in self.chunks],
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_TABLE_RE = re.compile(r"^\|.+\|$", re.MULTILINE)
_LIST_RE = re.compile(r"^(\s*[-*+]|\s*\d+\.)\s+", re.MULTILINE)
_CODE_FENCE_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _build_summary(content: str, max_len: int) -> str:
    """Generate a short extractive summary of a chunk."""
    # Remove markdown syntax
    clean = re.sub(r"[#*_`~>|]", "", content)
    clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", clean)  # links
    clean = re.sub(r"\s+", " ", clean).strip()

    # Take first 1–2 sentences
    sentences = _SENTENCE_END_RE.split(clean)
    summary = " ".join(sentences[:2]).strip()
    if len(summary) > max_len:
        summary = summary[:max_len].rstrip() + "…"
    return summary or clean[:max_len]


def _make_chunk_id(doc_id: str, idx: int) -> str:
    return f"{doc_id}::{idx:04d}"


def _detect_chunk_type(text: str) -> ChunkType:
    if _TABLE_RE.search(text):
        return ChunkType.TABLE
    if _CODE_FENCE_RE.search(text):
        return ChunkType.CODE
    if _LIST_RE.search(text):
        return ChunkType.LIST
    if _HEADING_RE.match(text.strip()):
        return ChunkType.HEADING
    return ChunkType.PARAGRAPH


# ---------------------------------------------------------------------------
# Splitters
# ---------------------------------------------------------------------------


def _split_by_heading(text: str) -> list[tuple[list[str], str, int, int]]:
    """Split on markdown headings, returning (heading_path, content, start, end)."""
    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        return [([], text, 0, len(text))]

    sections: list[tuple[list[str], str, int, int]] = []
    heading_stack: list[tuple[int, str]] = []

    for i, m in enumerate(matches):
        level = len(m.group(1))
        title = m.group(2).strip()

        # Maintain heading stack
        while heading_stack and heading_stack[-1][0] >= level:
            heading_stack.pop()
        heading_stack.append((level, title))

        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        path = [h for _, h in heading_stack]
        sections.append((path, body, start, end))

    # Prepend any content before first heading
    if matches[0].start() > 0:
        preamble = text[: matches[0].start()].strip()
        if preamble:
            sections.insert(0, ([], preamble, 0, matches[0].start()))

    return sections


def _split_by_paragraph(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]


def _split_by_sentence(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_END_RE.split(text) if s.strip()]


def _fixed_windows(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    """Sliding window over words/tokens."""
    words = text.split()
    # Approximate: 1 word ≈ 1.3 tokens → words_per_chunk ≈ max_tokens / 1.3
    wpc = max(1, int(max_tokens / 1.3))
    # Cap overlap to ensure positive forward progress (step >= 1)
    overlap_w = max(0, min(int(overlap_tokens / 1.3), wpc - 1))
    step = max(1, wpc - overlap_w)
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i: i + wpc]
        chunks.append(" ".join(chunk_words))
        i += step
    return chunks


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ChunkingPipeline:
    """Structure-aware document chunker with per-chunk summary generation."""

    def chunk(self, request: ChunkRequest) -> ChunkManifest:
        content = request.content
        strategy = request.strategy
        chunks: list[DocChunk] = []

        if strategy == ChunkStrategy.HEADING:
            sections = _split_by_heading(content)
            for path, body, start, end in sections:
                chunks.extend(
                    self._materialize(body, request, path, start, len(chunks))
                )

        elif strategy == ChunkStrategy.PARAGRAPH:
            paras = _split_by_paragraph(content)
            offset = 0
            for para in paras:
                pos = content.find(para, offset)
                chunks.extend(
                    self._materialize(para, request, [], pos, len(chunks))
                )
                offset = pos + len(para)

        elif strategy == ChunkStrategy.SENTENCE:
            sentences = _split_by_sentence(content)
            offset = 0
            for sent in sentences:
                pos = content.find(sent, offset)
                chunks.extend(
                    self._materialize(sent, request, [], pos, len(chunks))
                )
                offset = pos + len(sent)

        elif strategy == ChunkStrategy.FIXED:
            windows = _fixed_windows(
                content, request.max_chunk_tokens, request.overlap_tokens
            )
            for i, window in enumerate(windows):
                pos = content.find(window[:20])
                chunks.extend(
                    self._materialize(window, request, [], max(0, pos), len(chunks))
                )

        elif strategy == ChunkStrategy.HYBRID:
            # Try headings first, then fall back to paragraphs within each section
            sections = _split_by_heading(content)
            for path, body, start, end in sections:
                if _estimate_tokens(body) <= request.max_chunk_tokens:
                    chunks.extend(
                        self._materialize(body, request, path, start, len(chunks))
                    )
                else:
                    # Split by paragraph within this section
                    for para in _split_by_paragraph(body):
                        pos = body.find(para)
                        chunks.extend(
                            self._materialize(
                                para, request, path, start + pos, len(chunks)
                            )
                        )

        # Filter out tiny chunks below min threshold
        chunks = [
            c for c in chunks
            if c.token_estimate >= request.min_chunk_tokens
        ]

        # Re-index
        for i, c in enumerate(chunks):
            c.chunk_index = i
            c.chunk_id = _make_chunk_id(request.doc_id, i)

        total_tokens = sum(c.token_estimate for c in chunks)
        avg_tokens = total_tokens / len(chunks) if chunks else 0.0

        log.info(
            "document_chunked",
            doc_id=request.doc_id,
            strategy=strategy.value,
            chunks=len(chunks),
            total_tokens=total_tokens,
        )

        return ChunkManifest(
            doc_id=request.doc_id,
            strategy=strategy.value,
            total_chunks=len(chunks),
            total_tokens=total_tokens,
            avg_chunk_tokens=avg_tokens,
            chunks=chunks,
            metadata=request.metadata,
        )

    def _materialize(
        self,
        text: str,
        request: ChunkRequest,
        heading_path: list[str],
        start_char: int,
        base_index: int,
        _depth: int = 0,
    ) -> list[DocChunk]:
        """Convert a text block into one or more DocChunk objects."""
        text = text.strip()
        if not text:
            return []

        tokens = _estimate_tokens(text)

        # If over budget, recursively split (max depth 4 to avoid infinite recursion)
        if tokens > request.max_chunk_tokens and _depth < 4:
            sub_texts = _split_by_paragraph(text)
            if len(sub_texts) <= 1:
                sub_texts = _split_by_sentence(text)
            if len(sub_texts) <= 1:
                # Fixed windows: guaranteed to terminate
                sub_texts = _fixed_windows(text, request.max_chunk_tokens, request.overlap_tokens)

            if len(sub_texts) > 1:
                result = []
                offset = 0
                for sub in sub_texts:
                    pos = text.find(sub, offset)
                    result.extend(
                        self._materialize(
                            sub, request, heading_path,
                            start_char + max(0, pos),
                            base_index + len(result),
                            _depth=_depth + 1,
                        )
                    )
                    offset = max(0, pos + len(sub))
                return result
            # If we still can't split, fall through and emit as single chunk

        summary = ""
        if request.generate_summaries:
            summary = _build_summary(text, request.max_summary_length)

        idx = base_index
        return [
            DocChunk(
                chunk_id=_make_chunk_id(request.doc_id, idx),
                doc_id=request.doc_id,
                chunk_index=idx,
                chunk_type=_detect_chunk_type(text),
                heading_path=heading_path,
                content=text,
                summary=summary,
                token_estimate=tokens,
                start_char=start_char,
                end_char=start_char + len(text),
                metadata=request.metadata,
            )
        ]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_pipeline: ChunkingPipeline | None = None


def get_chunking_pipeline() -> ChunkingPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = ChunkingPipeline()
    return _pipeline


__all__ = [
    "ChunkStrategy",
    "ChunkType",
    "DocChunk",
    "ChunkRequest",
    "ChunkManifest",
    "ChunkingPipeline",
    "get_chunking_pipeline",
]
