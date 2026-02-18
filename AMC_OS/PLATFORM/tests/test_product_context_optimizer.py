"""Tests for amc.product.context_optimizer — Context Window Optimizer."""
from __future__ import annotations

import pytest

from amc.product.context_optimizer import (
    ContextItem,
    ContextOptimizer,
    OptimizeRequest,
    SelectionStrategy,
    TokenEstimateMode,
    get_context_optimizer,
)


@pytest.fixture()
def optimizer() -> ContextOptimizer:
    return ContextOptimizer()


def _item(
    item_id: str,
    content: str,
    source_type: str = "document",
    importance: float = 0.5,
    recency_score: float = 1.0,
    relevance_score: float = 1.0,
    token_count: int = 0,
) -> ContextItem:
    return ContextItem(
        item_id=item_id,
        source_type=source_type,
        title=f"Item {item_id}",
        content=content,
        token_count=token_count,
        relevance_score=relevance_score,
        recency_score=recency_score,
        importance=importance,
    )


# ---------------------------------------------------------------------------
# Basic optimization
# ---------------------------------------------------------------------------


def test_empty_items_returns_empty_result(optimizer):
    result = optimizer.optimize(OptimizeRequest(query="test", items=[], token_budget=1000))
    assert result.items_selected == 0
    assert result.tokens_used == 0


def test_all_items_fit_in_budget(optimizer):
    items = [_item(f"i{i}", "short text", token_count=50) for i in range(5)]
    result = optimizer.optimize(
        OptimizeRequest(query="test", items=items, token_budget=1000)
    )
    assert result.items_selected == 5
    assert result.tokens_used == 250


def test_items_truncated_by_budget(optimizer):
    items = [_item(f"i{i}", "x" * 400, token_count=100) for i in range(10)]
    result = optimizer.optimize(
        OptimizeRequest(query="test", items=items, token_budget=300)
    )
    assert result.items_selected <= 3
    assert result.tokens_used <= 300


def test_items_truncated_by_max_items(optimizer):
    items = [_item(f"i{i}", "short", token_count=10) for i in range(20)]
    result = optimizer.optimize(
        OptimizeRequest(query="test", items=items, token_budget=10000, max_items=5)
    )
    assert result.items_selected <= 5


# ---------------------------------------------------------------------------
# Relevance scoring
# ---------------------------------------------------------------------------


def test_high_relevance_item_selected_first(optimizer):
    items = [
        _item("relevant", "invoice ACME Corp payment amount", relevance_score=0.9),
        _item("irrelevant", "weather in London today sunny", relevance_score=0.1),
    ]
    result = optimizer.optimize(
        OptimizeRequest(
            query="invoice ACME",
            items=items,
            token_budget=5000,
            strategy=SelectionStrategy.GREEDY,
        )
    )
    selected_ids = [r.item.item_id for r in result.selected_items]
    assert "relevant" in selected_ids


def test_recency_strategy_prefers_recent_items(optimizer):
    items = [
        _item("old", "some content", recency_score=0.1),
        _item("new", "some content", recency_score=0.9),
    ]
    result = optimizer.optimize(
        OptimizeRequest(
            query="content",
            items=items,
            token_budget=5000,
            strategy=SelectionStrategy.RECENCY,
        )
    )
    selected_ids = [r.item.item_id for r in result.selected_items]
    assert selected_ids[0] == "new"


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


def test_greedy_strategy(optimizer):
    items = [_item(f"i{i}", "content " * 20, token_count=80) for i in range(5)]
    result = optimizer.optimize(
        OptimizeRequest(
            query="content",
            items=items,
            token_budget=200,
            strategy=SelectionStrategy.GREEDY,
        )
    )
    assert result.strategy == "greedy"
    assert result.tokens_used <= 200


def test_diversity_strategy_limits_per_type(optimizer):
    items = [_item(f"doc{i}", "document content", source_type="document") for i in range(6)]
    items += [_item(f"mem{i}", "memory content", source_type="memory") for i in range(6)]
    result = optimizer.optimize(
        OptimizeRequest(
            query="content",
            items=items,
            token_budget=100000,
            strategy=SelectionStrategy.DIVERSITY,
            max_per_source_type=3,
        )
    )
    doc_count = sum(1 for r in result.selected_items if r.item.source_type == "document")
    mem_count = sum(1 for r in result.selected_items if r.item.source_type == "memory")
    assert doc_count <= 3
    assert mem_count <= 3


def test_balanced_strategy(optimizer):
    items = [
        _item("a", "content relevant to query", importance=0.9, recency_score=0.5, relevance_score=0.8),
        _item("b", "unrelated old content", importance=0.1, recency_score=0.1, relevance_score=0.1),
    ]
    result = optimizer.optimize(
        OptimizeRequest(
            query="query relevant",
            items=items,
            token_budget=5000,
            strategy=SelectionStrategy.BALANCED,
        )
    )
    selected_ids = [r.item.item_id for r in result.selected_items]
    # Item "a" should score higher overall
    assert selected_ids[0] == "a"


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def test_word_based_estimation(optimizer):
    # 4 words ≈ 5-6 tokens in WORD mode
    items = [_item("w1", "word one two three", token_count=0)]
    result = optimizer.optimize(
        OptimizeRequest(
            query="word",
            items=items,
            token_budget=100,
            token_estimate_mode=TokenEstimateMode.WORD,
        )
    )
    assert result.selected_items[0].tokens_used >= 5


def test_explicit_token_count_used(optimizer):
    items = [_item("t1", "short", token_count=999)]
    result = optimizer.optimize(
        OptimizeRequest(query="short", items=items, token_budget=2000)
    )
    assert result.selected_items[0].tokens_used == 999


# ---------------------------------------------------------------------------
# Utilization
# ---------------------------------------------------------------------------


def test_utilization_calculated(optimizer):
    items = [_item("u1", "content", token_count=200)]
    result = optimizer.optimize(
        OptimizeRequest(query="content", items=items, token_budget=1000)
    )
    assert result.utilization_pct == pytest.approx(20.0, abs=1.0)


# ---------------------------------------------------------------------------
# Drop reasons
# ---------------------------------------------------------------------------


def test_dropped_items_have_reason(optimizer):
    items = [_item(f"i{i}", "content", token_count=100) for i in range(10)]
    result = optimizer.optimize(
        OptimizeRequest(query="content", items=items, token_budget=250)
    )
    for r in result.dropped_items:
        assert r.drop_reason


# ---------------------------------------------------------------------------
# Dict
# ---------------------------------------------------------------------------


def test_result_dict_shape(optimizer):
    items = [_item("x1", "some content")]
    result = optimizer.optimize(OptimizeRequest(query="content", items=items, token_budget=100))
    d = result.dict
    assert "query" in d
    assert "strategy" in d
    assert "token_budget" in d
    assert "selected_items" in d
    assert "utilization_pct" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    o1 = get_context_optimizer()
    o2 = get_context_optimizer()
    assert o1 is o2
