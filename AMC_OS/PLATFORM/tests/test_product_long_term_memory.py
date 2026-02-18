"""Tests for amc.product.long_term_memory — Long-Term Memory Store."""
from __future__ import annotations

import time

import pytest

from amc.product.long_term_memory import (
    LongTermMemoryStore,
    MemoryEntry,
    get_long_term_memory_store,
)


@pytest.fixture()
def store(tmp_path) -> LongTermMemoryStore:
    return LongTermMemoryStore(db_path=tmp_path / "lt_memory.db")


def _entry(**kwargs) -> MemoryEntry:
    defaults = dict(
        content="The user prefers concise output.",
        tenant_id="tenant-1",
        session_id="sess-1",
        key="",
        tags=["preference"],
        importance=0.8,
    )
    defaults.update(kwargs)
    return MemoryEntry(**defaults)


# ---------------------------------------------------------------------------
# Store and retrieve
# ---------------------------------------------------------------------------


def test_store_returns_record(store):
    entry = _entry()
    rec = store.store(entry)
    assert rec.memory_id
    assert rec.content == entry.content
    assert rec.tenant_id == "tenant-1"


def test_get_retrieves_by_id(store):
    rec = store.store(_entry())
    fetched = store.get(rec.memory_id)
    assert fetched is not None
    assert fetched.memory_id == rec.memory_id


def test_get_increments_access_count(store):
    rec = store.store(_entry())
    store.get(rec.memory_id)
    store.get(rec.memory_id)
    fetched = store.get(rec.memory_id)
    assert fetched is not None
    assert fetched.access_count >= 2


def test_get_nonexistent_returns_none(store):
    assert store.get("does-not-exist") is None


# ---------------------------------------------------------------------------
# Key-based upsert
# ---------------------------------------------------------------------------


def test_upsert_by_key_overwrites_content(store):
    e1 = _entry(key="pref:output_format", content="Short outputs preferred.")
    store.store(e1)
    e2 = _entry(key="pref:output_format", content="Detailed outputs preferred.")
    rec = store.store(e2)
    assert rec.content == "Detailed outputs preferred."

    # Only one record for this key should exist
    records = store.list("tenant-1")
    keyed = [r for r in records if r.key == "pref:output_format"]
    assert len(keyed) == 1


# ---------------------------------------------------------------------------
# TTL / expiration
# ---------------------------------------------------------------------------


def test_expired_record_not_returned(store):
    rec = store.store(_entry(ttl_seconds=1))
    time.sleep(1.1)
    fetched = store.get(rec.memory_id)
    assert fetched is None


def test_non_expired_record_returned(store):
    rec = store.store(_entry(ttl_seconds=300))
    fetched = store.get(rec.memory_id)
    assert fetched is not None


def test_purge_expired_removes_old(store):
    store.store(_entry(ttl_seconds=1))
    time.sleep(1.1)
    count = store.purge_expired()
    assert count >= 1


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def test_list_by_tenant(store):
    store.store(_entry(tenant_id="t-a"))
    store.store(_entry(tenant_id="t-a"))
    store.store(_entry(tenant_id="t-b"))
    results = store.list("t-a")
    assert all(r.tenant_id == "t-a" for r in results)
    assert len(results) == 2


def test_list_filtered_by_content_type(store):
    store.store(_entry(content_type="fact"))
    store.store(_entry(content_type="preference"))
    facts = store.list("tenant-1", content_type="fact")
    assert all(r.content_type == "fact" for r in facts)


def test_list_filtered_by_tags(store):
    store.store(_entry(tags=["finance", "invoice"]))
    store.store(_entry(tags=["marketing"]))
    results = store.list("tenant-1", tags=["finance"])
    assert all("finance" in r.tags for r in results)


def test_list_min_importance(store):
    store.store(_entry(importance=0.9))
    store.store(_entry(importance=0.2))
    results = store.list("tenant-1", min_importance=0.5)
    assert all(r.importance >= 0.5 for r in results)


# ---------------------------------------------------------------------------
# Retrieval (keyword-based)
# ---------------------------------------------------------------------------


def test_retrieve_finds_relevant_memory(store):
    store.store(_entry(content="Customer ACME Corp owes $10,000 for project Alpha.", tags=[]))
    store.store(_entry(content="The sky is blue today.", tags=[], importance=0.3))
    result = store.retrieve("ACME Corp invoice amount", "tenant-1", top_k=2)
    assert result.total_found >= 1
    assert any("ACME" in m.content for m in result.matches)


def test_retrieve_fallback_when_no_overlap(store):
    store.store(_entry(content="Irrelevant content.", importance=0.9))
    result = store.retrieve("totally different query xyz abc", "tenant-1", top_k=1)
    # Should fall back to importance-based ranking
    assert result.total_found >= 1


def test_retrieve_empty_store(store):
    result = store.retrieve("anything", "empty-tenant")
    assert result.total_found == 0
    assert result.matches == []


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete_removes_record(store):
    rec = store.store(_entry())
    ok = store.delete(rec.memory_id)
    assert ok
    assert store.get(rec.memory_id) is None


def test_delete_nonexistent_returns_false(store):
    assert not store.delete("nonexistent-id")


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def test_stats_for_tenant(store):
    store.store(_entry(importance=0.8))
    store.store(_entry(importance=0.6))
    stats = store.stats("tenant-1")
    assert stats["total_memories"] >= 2
    assert stats["avg_importance"] > 0


# ---------------------------------------------------------------------------
# Dict serialization
# ---------------------------------------------------------------------------


def test_memory_record_dict(store):
    rec = store.store(_entry())
    d = rec.dict
    assert "memory_id" in d
    assert "content" in d
    assert "tags" in d
    assert "importance" in d
    assert "is_expired" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton_same_instance():
    s1 = get_long_term_memory_store()
    s2 = get_long_term_memory_store()
    assert s1 is s2
