"""Context Window Optimizer — rank and select context items within token budgets.

Takes a list of context sources and selects the most relevant subset that fits
within a declared token budget.  Uses TF-IDF-style keyword scoring + recency
weighting.  Pure Python, no SQLite required.

API: POST /api/v1/product/context/optimize
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SelectionStrategy(str, Enum):
    GREEDY = "greedy"          # Take highest-scored items that fit
    DIVERSITY = "diversity"    # Ensure variety across source types
    RECENCY = "recency"        # Prefer most recent items
    BALANCED = "balanced"      # Mix of score + recency + diversity


class TokenEstimateMode(str, Enum):
    WORD = "word"              # ~1.3 tokens per word
    CHAR = "char"              # ~4 chars per token
    EXACT = "exact"            # Use caller-supplied token counts


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ContextItem:
    """A single piece of context to be considered."""

    item_id: str
    source_type: str           # e.g. "document", "memory", "tool_output", "chat"
    title: str
    content: str
    token_count: int = 0       # 0 means auto-estimate
    relevance_score: float = 1.0
    recency_score: float = 1.0   # 1.0 = now, 0.0 = very old
    importance: float = 0.5
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "source_type": self.source_type,
            "title": self.title,
            "content": self.content,
            "token_count": self.token_count,
            "relevance_score": self.relevance_score,
            "recency_score": self.recency_score,
            "importance": self.importance,
            "tags": self.tags,
            "metadata": self.metadata,
        }


@dataclass
class OptimizeRequest:
    """Input for the context optimizer."""

    query: str
    items: list[ContextItem]
    token_budget: int = 4000
    strategy: SelectionStrategy = SelectionStrategy.BALANCED
    token_estimate_mode: TokenEstimateMode = TokenEstimateMode.CHAR
    # Weights for BALANCED strategy (must sum to 1.0)
    weight_relevance: float = 0.50
    weight_recency: float = 0.25
    weight_importance: float = 0.25
    max_items: int = 20
    # Source type diversity target (for DIVERSITY strategy)
    max_per_source_type: int = 5
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RankedItem:
    """A context item with its computed final score."""

    item: ContextItem
    final_score: float
    query_relevance: float
    tokens_used: int
    selected: bool
    drop_reason: str    # Why it was excluded (if selected=False)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item.item_id,
            "source_type": self.item.source_type,
            "title": self.item.title,
            "content": self.item.content,
            "final_score": round(self.final_score, 4),
            "query_relevance": round(self.query_relevance, 4),
            "tokens_used": self.tokens_used,
            "selected": self.selected,
            "drop_reason": self.drop_reason,
        }


@dataclass
class OptimizeResult:
    """Result of context window optimization."""

    query: str
    strategy: str
    token_budget: int
    tokens_used: int
    items_considered: int
    items_selected: int
    selected_items: list[RankedItem]
    dropped_items: list[RankedItem]
    utilization_pct: float
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "strategy": self.strategy,
            "token_budget": self.token_budget,
            "tokens_used": self.tokens_used,
            "items_considered": self.items_considered,
            "items_selected": self.items_selected,
            "selected_items": [i.dict for i in self.selected_items],
            "dropped_items": [i.dict for i in self.dropped_items],
            "utilization_pct": round(self.utilization_pct, 2),
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def _estimate_tokens(text: str, mode: TokenEstimateMode) -> int:
    if not text:
        return 0
    if mode == TokenEstimateMode.WORD:
        words = len(re.findall(r"\S+", text))
        return max(1, int(words * 1.3))
    elif mode == TokenEstimateMode.CHAR:
        return max(1, len(text) // 4)
    return max(1, len(text) // 4)  # EXACT mode falls back to char


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _tf_idf_score(query: str, doc: str) -> float:
    """Simplified TF-IDF-like relevance between query and document."""
    query_terms = re.findall(r"\b\w+\b", query.lower())
    if not query_terms:
        return 0.0
    doc_lower = doc.lower()
    doc_words = re.findall(r"\b\w+\b", doc_lower)
    if not doc_words:
        return 0.0

    doc_freq: dict[str, int] = {}
    for w in doc_words:
        doc_freq[w] = doc_freq.get(w, 0) + 1

    total_doc_words = len(doc_words)
    score = 0.0
    for term in set(query_terms):
        tf = doc_freq.get(term, 0) / total_doc_words
        # IDF approximation: penalize very common words
        idf = math.log(1 + 1 / (1 + doc_freq.get(term, 0)))
        score += tf * idf

    # Normalize by number of unique query terms
    return min(1.0, score / max(1, len(set(query_terms))) * 10)


def _compute_scores(
    query: str,
    items: list[ContextItem],
    req: OptimizeRequest,
    token_mode: TokenEstimateMode,
) -> list[RankedItem]:
    ranked = []
    for item in items:
        # Estimate tokens if not provided
        tokens = item.token_count if item.token_count > 0 else _estimate_tokens(item.content, token_mode)

        # Query relevance
        q_relevance = _tf_idf_score(query, item.content + " " + item.title)
        # Blend with caller-supplied relevance_score
        blended_relevance = (q_relevance * 0.6 + item.relevance_score * 0.4)

        # Strategy-specific final score
        if req.strategy == SelectionStrategy.GREEDY:
            final = blended_relevance
        elif req.strategy == SelectionStrategy.RECENCY:
            final = item.recency_score
        elif req.strategy == SelectionStrategy.DIVERSITY:
            final = blended_relevance  # diversity enforced during selection
        else:  # BALANCED
            final = (
                req.weight_relevance * blended_relevance
                + req.weight_recency * item.recency_score
                + req.weight_importance * item.importance
            )

        ranked.append(
            RankedItem(
                item=item,
                final_score=final,
                query_relevance=blended_relevance,
                tokens_used=tokens,
                selected=False,
                drop_reason="",
            )
        )

    ranked.sort(key=lambda r: r.final_score, reverse=True)
    return ranked


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------


def _select_greedy(
    ranked: list[RankedItem],
    budget: int,
    max_items: int,
) -> tuple[list[RankedItem], list[RankedItem]]:
    """Select highest-scored items that fit in the budget."""
    selected, dropped = [], []
    used = 0
    for r in ranked:
        if len(selected) >= max_items:
            r.drop_reason = "max_items reached"
            dropped.append(r)
        elif used + r.tokens_used > budget:
            r.drop_reason = f"exceeds token budget ({used + r.tokens_used} > {budget})"
            dropped.append(r)
        else:
            r.selected = True
            used += r.tokens_used
            selected.append(r)
    return selected, dropped


def _select_diversity(
    ranked: list[RankedItem],
    budget: int,
    max_items: int,
    max_per_type: int,
) -> tuple[list[RankedItem], list[RankedItem]]:
    """Select with source-type diversity enforcement."""
    selected, dropped = [], []
    used = 0
    type_counts: dict[str, int] = {}
    for r in ranked:
        stype = r.item.source_type
        if len(selected) >= max_items:
            r.drop_reason = "max_items reached"
            dropped.append(r)
        elif type_counts.get(stype, 0) >= max_per_type:
            r.drop_reason = f"max_per_source_type ({max_per_type}) reached for '{stype}'"
            dropped.append(r)
        elif used + r.tokens_used > budget:
            r.drop_reason = "exceeds token budget"
            dropped.append(r)
        else:
            r.selected = True
            used += r.tokens_used
            type_counts[stype] = type_counts.get(stype, 0) + 1
            selected.append(r)
    return selected, dropped


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ContextOptimizer:
    """Rank and select context items within a token budget."""

    def optimize(self, request: OptimizeRequest) -> OptimizeResult:
        if not request.items:
            return OptimizeResult(
                query=request.query,
                strategy=request.strategy.value,
                token_budget=request.token_budget,
                tokens_used=0,
                items_considered=0,
                items_selected=0,
                selected_items=[],
                dropped_items=[],
                utilization_pct=0.0,
                metadata=request.metadata,
            )

        ranked = _compute_scores(
            request.query, request.items, request, request.token_estimate_mode
        )

        if request.strategy == SelectionStrategy.DIVERSITY:
            selected, dropped = _select_diversity(
                ranked,
                request.token_budget,
                request.max_items,
                request.max_per_source_type,
            )
        else:
            selected, dropped = _select_greedy(
                ranked, request.token_budget, request.max_items
            )

        tokens_used = sum(r.tokens_used for r in selected)
        utilization = (tokens_used / request.token_budget * 100) if request.token_budget else 0.0

        log.info(
            "context_optimized",
            strategy=request.strategy.value,
            items_in=len(request.items),
            items_selected=len(selected),
            tokens_used=tokens_used,
            budget=request.token_budget,
            utilization_pct=round(utilization, 2),
        )

        return OptimizeResult(
            query=request.query,
            strategy=request.strategy.value,
            token_budget=request.token_budget,
            tokens_used=tokens_used,
            items_considered=len(ranked),
            items_selected=len(selected),
            selected_items=selected,
            dropped_items=dropped,
            utilization_pct=utilization,
            metadata=request.metadata,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_optimizer: ContextOptimizer | None = None


def get_context_optimizer() -> ContextOptimizer:
    global _optimizer
    if _optimizer is None:
        _optimizer = ContextOptimizer()
    return _optimizer


__all__ = [
    "SelectionStrategy",
    "TokenEstimateMode",
    "ContextItem",
    "OptimizeRequest",
    "RankedItem",
    "OptimizeResult",
    "ContextOptimizer",
    "get_context_optimizer",
]
