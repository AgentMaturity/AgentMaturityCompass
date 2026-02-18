"""Tests for amc.product.chunking_pipeline — Chunking + Summarization Pipeline."""
from __future__ import annotations

import pytest

from amc.product.chunking_pipeline import (
    ChunkRequest,
    ChunkStrategy,
    ChunkType,
    ChunkingPipeline,
    get_chunking_pipeline,
)


@pytest.fixture()
def pipeline() -> ChunkingPipeline:
    return ChunkingPipeline()


_MARKDOWN_DOC = """\
# Introduction

This section introduces the document. It covers the main themes.

## Background

Here is some background information. It provides context for the rest.

### Sub-section

More details here. These are nested below background.

## Analysis

The analysis section contains the findings. Several conclusions were drawn.

- Point one: important detail
- Point two: another finding
- Point three: final observation

## Conclusion

The final conclusions wrap up the document. All findings are summarized.
"""

_TABLE_DOC = """\
# Data Overview

| Name   | Score | Grade |
| ------ | ----- | ----- |
| Alice  | 95    | A     |
| Bob    | 82    | B     |
| Carol  | 78    | C     |

See the table above for details.
"""

_CODE_DOC = """\
# Code Example

```python
def hello():
    return "world"
```

This function returns a greeting string.
"""


# ---------------------------------------------------------------------------
# Heading strategy
# ---------------------------------------------------------------------------


def test_heading_strategy_splits_on_headings(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="doc-1", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HEADING, min_chunk_tokens=1)
    )
    assert manifest.total_chunks >= 2
    # All chunks should have headings in path or content
    assert manifest.doc_id == "doc-1"


def test_heading_strategy_preserves_heading_path(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="doc-2", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HEADING, min_chunk_tokens=1)
    )
    has_path = any(len(c.heading_path) > 0 for c in manifest.chunks)
    assert has_path


# ---------------------------------------------------------------------------
# Paragraph strategy
# ---------------------------------------------------------------------------


def test_paragraph_strategy_splits_by_double_newline(pipeline):
    content = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="para-1", content=content, strategy=ChunkStrategy.PARAGRAPH, min_chunk_tokens=1)
    )
    assert manifest.total_chunks >= 2


# ---------------------------------------------------------------------------
# Sentence strategy
# ---------------------------------------------------------------------------


def test_sentence_strategy_splits_at_punctuation(pipeline):
    content = "First sentence. Second sentence. Third sentence! Fourth one?"
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="sent-1", content=content, strategy=ChunkStrategy.SENTENCE, min_chunk_tokens=1)
    )
    assert manifest.total_chunks >= 2


# ---------------------------------------------------------------------------
# Fixed window strategy
# ---------------------------------------------------------------------------


def test_fixed_strategy_respects_token_budget(pipeline):
    content = " ".join([f"word{i}" for i in range(200)])
    manifest = pipeline.chunk(
        ChunkRequest(
            doc_id="fixed-1",
            content=content,
            strategy=ChunkStrategy.FIXED,
            max_chunk_tokens=50,
            overlap_tokens=10,    # overlap < max to ensure positive step
            min_chunk_tokens=1,
        )
    )
    assert manifest.total_chunks >= 2
    # Each chunk should be ≤ 50 tokens (approx, allow 2x buffer for char-based estimation)
    for chunk in manifest.chunks:
        assert chunk.token_estimate <= 100


# ---------------------------------------------------------------------------
# Hybrid strategy
# ---------------------------------------------------------------------------


def test_hybrid_strategy_handles_mixed_content(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="hybrid-1", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HYBRID)
    )
    assert manifest.total_chunks >= 1
    assert manifest.strategy == "hybrid"


def test_hybrid_splits_large_section_further(pipeline):
    # Create a section that is large enough to trigger paragraph splitting
    big_section = (
        "# Big Section\n\n"
        + ("This is a very long paragraph with lots of words. " * 100)
        + "\n\nAnother paragraph follows here."
    )
    manifest = pipeline.chunk(
        ChunkRequest(
            doc_id="big-1",
            content=big_section,
            strategy=ChunkStrategy.HYBRID,
            max_chunk_tokens=100,
            min_chunk_tokens=1,
        )
    )
    assert manifest.total_chunks >= 2


# ---------------------------------------------------------------------------
# Chunk types detection
# ---------------------------------------------------------------------------


def test_table_detected_as_table_type(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="table-1", content=_TABLE_DOC, strategy=ChunkStrategy.PARAGRAPH)
    )
    types = {c.chunk_type for c in manifest.chunks}
    assert ChunkType.TABLE in types


def test_code_detected_as_code_type(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="code-1", content=_CODE_DOC, strategy=ChunkStrategy.PARAGRAPH, min_chunk_tokens=1)
    )
    types = {c.chunk_type for c in manifest.chunks}
    assert ChunkType.CODE in types


def test_list_detected_as_list_type(pipeline):
    content = "- Item one\n- Item two\n- Item three"
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="list-1", content=content, strategy=ChunkStrategy.PARAGRAPH, min_chunk_tokens=1)
    )
    types = {c.chunk_type for c in manifest.chunks}
    assert ChunkType.LIST in types


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------


def test_summary_generated_for_each_chunk(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(
            doc_id="summ-1",
            content=_MARKDOWN_DOC,
            strategy=ChunkStrategy.HYBRID,
            generate_summaries=True,
        )
    )
    for chunk in manifest.chunks:
        if len(chunk.content) >= 10:
            assert chunk.summary  # should have a non-empty summary


def test_no_summary_when_disabled(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(
            doc_id="nosumm-1",
            content="Some text.",
            strategy=ChunkStrategy.PARAGRAPH,
            generate_summaries=False,
            min_chunk_tokens=1,
        )
    )
    for chunk in manifest.chunks:
        assert chunk.summary == ""


# ---------------------------------------------------------------------------
# Token counting
# ---------------------------------------------------------------------------


def test_total_tokens_summed_correctly(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="tok-1", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HYBRID)
    )
    computed_total = sum(c.token_estimate for c in manifest.chunks)
    assert manifest.total_tokens == computed_total


def test_avg_chunk_tokens_computed(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="avg-1", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HEADING)
    )
    if manifest.total_chunks > 0:
        assert manifest.avg_chunk_tokens > 0


# ---------------------------------------------------------------------------
# Min chunk filter
# ---------------------------------------------------------------------------


def test_min_chunk_filter_removes_tiny_chunks(pipeline):
    content = "Short.\n\nAnother tiny piece.\n\n" + ("word " * 60)
    manifest = pipeline.chunk(
        ChunkRequest(
            doc_id="min-1",
            content=content,
            strategy=ChunkStrategy.PARAGRAPH,
            min_chunk_tokens=50,  # High threshold — removes small paragraphs
        )
    )
    for chunk in manifest.chunks:
        assert chunk.token_estimate >= 50


# ---------------------------------------------------------------------------
# Chunk IDs re-indexed
# ---------------------------------------------------------------------------


def test_chunk_ids_are_sequential(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="seq-1", content=_MARKDOWN_DOC, strategy=ChunkStrategy.HYBRID)
    )
    for i, chunk in enumerate(manifest.chunks):
        assert chunk.chunk_index == i


# ---------------------------------------------------------------------------
# Dict serialization
# ---------------------------------------------------------------------------


def test_manifest_dict_shape(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="dict-1", content="Some content.", strategy=ChunkStrategy.PARAGRAPH, min_chunk_tokens=1)
    )
    d = manifest.dict
    assert "doc_id" in d
    assert "total_chunks" in d
    assert "chunks" in d
    assert "strategy" in d


def test_chunk_dict_shape(pipeline):
    manifest = pipeline.chunk(
        ChunkRequest(doc_id="cd-1", content="Some text here.", strategy=ChunkStrategy.PARAGRAPH, min_chunk_tokens=1)
    )
    if manifest.chunks:
        d = manifest.chunks[0].dict
        assert "chunk_id" in d
        assert "content" in d
        assert "summary" in d
        assert "chunk_type" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    p1 = get_chunking_pipeline()
    p2 = get_chunking_pipeline()
    assert p1 is p2
