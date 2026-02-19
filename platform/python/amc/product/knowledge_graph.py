"""AMC Product — Knowledge Graph Builder for Operations.

Entity/relationship store, customer→contract→invoice linking, graph queries.
SQLite-backed.

API: /api/v1/product/graph/*
"""
from __future__ import annotations

import json
import sqlite3
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NS = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

# ── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS kg_entities (
    entity_id       TEXT NOT NULL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    name            TEXT NOT NULL,
    properties_json TEXT NOT NULL DEFAULT '{}',
    tenant_id       TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_entities_type    ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_tenant  ON kg_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kg_entities_name    ON kg_entities(name);

CREATE TABLE IF NOT EXISTS kg_relationships (
    rel_id              TEXT NOT NULL PRIMARY KEY,
    from_entity_id      TEXT NOT NULL REFERENCES kg_entities(entity_id),
    to_entity_id        TEXT NOT NULL REFERENCES kg_entities(entity_id),
    rel_type            TEXT NOT NULL,
    properties_json     TEXT NOT NULL DEFAULT '{}',
    tenant_id           TEXT NOT NULL DEFAULT '',
    weight              REAL NOT NULL DEFAULT 1.0,
    created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_rel_from    ON kg_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_to      ON kg_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_type    ON kg_relationships(rel_type);

CREATE TABLE IF NOT EXISTS kg_queries (
    query_id        TEXT NOT NULL PRIMARY KEY,
    query_type      TEXT NOT NULL,
    params_json     TEXT NOT NULL DEFAULT '{}',
    result_json     TEXT NOT NULL DEFAULT '{}',
    executed_at     TEXT NOT NULL,
    duration_ms     REAL NOT NULL DEFAULT 0.0
);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class EntityType(str, Enum):
    CUSTOMER  = "customer"
    CONTRACT  = "contract"
    INVOICE   = "invoice"
    PRODUCT   = "product"
    CONTACT   = "contact"
    TASK      = "task"
    WORKFLOW  = "workflow"
    GENERIC   = "generic"


class RelType(str, Enum):
    HAS_CONTRACT  = "has_contract"
    HAS_INVOICE   = "has_invoice"
    REFERENCES    = "references"
    RELATES_TO    = "relates_to"
    DEPENDS_ON    = "depends_on"
    OWNS          = "owns"
    CREATED_BY    = "created_by"
    ASSIGNED_TO   = "assigned_to"
    CUSTOM        = "custom"


# ── Dataclasses ───────────────────────────────────────────────────────────────


@dataclass
class Entity:
    entity_id:   str
    entity_type: EntityType
    name:        str
    properties:  dict[str, Any]
    tenant_id:   str
    created_at:  str
    updated_at:  str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "entity_id":   self.entity_id,
            "entity_type": self.entity_type.value,
            "name":        self.name,
            "properties":  self.properties,
            "tenant_id":   self.tenant_id,
            "created_at":  self.created_at,
            "updated_at":  self.updated_at,
        }


@dataclass
class Relationship:
    rel_id:         str
    from_entity_id: str
    to_entity_id:   str
    rel_type:       RelType
    properties:     dict[str, Any]
    tenant_id:      str
    weight:         float
    created_at:     str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "rel_id":         self.rel_id,
            "from_entity_id": self.from_entity_id,
            "to_entity_id":   self.to_entity_id,
            "rel_type":       self.rel_type.value,
            "properties":     self.properties,
            "tenant_id":      self.tenant_id,
            "weight":         self.weight,
            "created_at":     self.created_at,
        }


@dataclass
class GraphPath:
    nodes:         list[str]           # entity_ids in order
    relationships: list[str]           # rel_ids in order
    length:        int
    total_weight:  float

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "nodes":         self.nodes,
            "relationships": self.relationships,
            "length":        self.length,
            "total_weight":  self.total_weight,
        }


@dataclass
class QueryResult:
    query_id:    str
    query_type:  str
    params:      dict[str, Any]
    result:      Any
    executed_at: str
    duration_ms: float

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "query_id":    self.query_id,
            "query_type":  self.query_type,
            "params":      self.params,
            "result":      self.result,
            "executed_at": self.executed_at,
            "duration_ms": self.duration_ms,
        }


# ── Helper ────────────────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_entity_id(entity_type: str, name: str, tenant_id: str) -> str:
    return str(uuid5(_NS, f"entity:{entity_type}:{name}:{tenant_id}:{_now()}"))


def _make_rel_id(from_id: str, to_id: str, rel_type: str) -> str:
    return str(uuid5(_NS, f"rel:{from_id}:{to_id}:{rel_type}:{_now()}"))


def _make_query_id(query_type: str, params: dict) -> str:
    return str(uuid5(_NS, f"query:{query_type}:{json.dumps(params, sort_keys=True)}:{_now()}"))


def _row_to_entity(row: sqlite3.Row) -> Entity:
    return Entity(
        entity_id=row["entity_id"],
        entity_type=EntityType(row["entity_type"]),
        name=row["name"],
        properties=json.loads(row["properties_json"] or "{}"),
        tenant_id=row["tenant_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_rel(row: sqlite3.Row) -> Relationship:
    return Relationship(
        rel_id=row["rel_id"],
        from_entity_id=row["from_entity_id"],
        to_entity_id=row["to_entity_id"],
        rel_type=RelType(row["rel_type"]),
        properties=json.loads(row["properties_json"] or "{}"),
        tenant_id=row["tenant_id"],
        weight=row["weight"],
        created_at=row["created_at"],
    )


# ── KnowledgeGraph ────────────────────────────────────────────────────────────


class KnowledgeGraph:
    """SQLite-backed knowledge graph for AMC operations.

    Thread-safe via ``threading.Lock``. All writes are atomic.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._lock    = Lock()
        self._db_path = product_db_path(db_path)
        self._init_db()

    # ── internals ────────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(_SCHEMA)

    def _log_query(
        self,
        conn: sqlite3.Connection,
        query_type: str,
        params: dict,
        result: Any,
        duration_ms: float,
    ) -> None:
        qid = _make_query_id(query_type, params)
        conn.execute(
            """INSERT INTO kg_queries
               (query_id, query_type, params_json, result_json, executed_at, duration_ms)
               VALUES (?,?,?,?,?,?)""",
            (qid, query_type, json.dumps(params), json.dumps(result, default=str),
             _now(), duration_ms),
        )

    # ── Entity CRUD ──────────────────────────────────────────────────────────

    def add_entity(
        self,
        entity_type: EntityType | str,
        name: str,
        properties: dict[str, Any] | None = None,
        tenant_id: str = "",
    ) -> Entity:
        if isinstance(entity_type, str):
            entity_type = EntityType(entity_type)
        now    = _now()
        eid    = _make_entity_id(entity_type.value, name, tenant_id)
        props  = properties or {}
        entity = Entity(
            entity_id=eid,
            entity_type=entity_type,
            name=name,
            properties=props,
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO kg_entities
                       (entity_id, entity_type, name, properties_json,
                        tenant_id, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (eid, entity_type.value, name, json.dumps(props),
                     tenant_id, now, now),
                )
        log.info("kg.entity.added", entity_id=eid, entity_type=entity_type.value, name=name)
        return entity

    def get_entity(self, entity_id: str) -> Entity | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM kg_entities WHERE entity_id = ?", (entity_id,)
                ).fetchone()
        return _row_to_entity(row) if row else None

    def find_entities(
        self,
        entity_type: EntityType | str | None = None,
        name: str | None = None,
        tenant_id: str | None = None,
        limit: int = 50,
    ) -> list[Entity]:
        clauses: list[str] = []
        params:  list[Any] = []
        if entity_type is not None:
            et = entity_type.value if isinstance(entity_type, EntityType) else entity_type
            clauses.append("entity_type = ?")
            params.append(et)
        if name is not None:
            clauses.append("name LIKE ?")
            params.append(f"%{name}%")
        if tenant_id is not None:
            clauses.append("tenant_id = ?")
            params.append(tenant_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        sql = f"SELECT * FROM kg_entities {where} ORDER BY created_at DESC LIMIT ?"
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(sql, params).fetchall()
        return [_row_to_entity(r) for r in rows]

    def update_entity(
        self,
        entity_id: str,
        name: str | None = None,
        properties: dict[str, Any] | None = None,
    ) -> Entity:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM kg_entities WHERE entity_id = ?", (entity_id,)
                ).fetchone()
                if not row:
                    raise ValueError(f"Entity not found: {entity_id}")
                new_name  = name if name is not None else row["name"]
                existing  = json.loads(row["properties_json"] or "{}")
                if properties:
                    existing.update(properties)
                conn.execute(
                    """UPDATE kg_entities
                       SET name = ?, properties_json = ?, updated_at = ?
                       WHERE entity_id = ?""",
                    (new_name, json.dumps(existing), now, entity_id),
                )
                row2 = conn.execute(
                    "SELECT * FROM kg_entities WHERE entity_id = ?", (entity_id,)
                ).fetchone()
        log.info("kg.entity.updated", entity_id=entity_id)
        return _row_to_entity(row2)

    def delete_entity(self, entity_id: str) -> bool:
        """Delete entity and cascade-delete all its relationships."""
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "DELETE FROM kg_relationships WHERE from_entity_id = ? OR to_entity_id = ?",
                    (entity_id, entity_id),
                )
                cur = conn.execute(
                    "DELETE FROM kg_entities WHERE entity_id = ?", (entity_id,)
                )
                deleted = cur.rowcount > 0
        log.info("kg.entity.deleted", entity_id=entity_id, deleted=deleted)
        return deleted

    # ── Relationship CRUD ─────────────────────────────────────────────────────

    def add_relationship(
        self,
        from_entity_id: str,
        to_entity_id: str,
        rel_type: RelType | str,
        properties: dict[str, Any] | None = None,
        weight: float = 1.0,
    ) -> Relationship:
        if isinstance(rel_type, str):
            rel_type = RelType(rel_type)
        now    = _now()
        rid    = _make_rel_id(from_entity_id, to_entity_id, rel_type.value)
        props  = properties or {}

        # Derive tenant_id from the source entity
        with self._lock:
            with self._connect() as conn:
                from_row = conn.execute(
                    "SELECT tenant_id FROM kg_entities WHERE entity_id = ?",
                    (from_entity_id,),
                ).fetchone()
                tenant_id = from_row["tenant_id"] if from_row else ""
                conn.execute(
                    """INSERT INTO kg_relationships
                       (rel_id, from_entity_id, to_entity_id, rel_type,
                        properties_json, tenant_id, weight, created_at)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (rid, from_entity_id, to_entity_id, rel_type.value,
                     json.dumps(props), tenant_id, weight, now),
                )
        rel = Relationship(
            rel_id=rid,
            from_entity_id=from_entity_id,
            to_entity_id=to_entity_id,
            rel_type=rel_type,
            properties=props,
            tenant_id=tenant_id,
            weight=weight,
            created_at=now,
        )
        log.info("kg.rel.added", rel_id=rid, rel_type=rel_type.value)
        return rel

    def get_relationship(self, rel_id: str) -> Relationship | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM kg_relationships WHERE rel_id = ?", (rel_id,)
                ).fetchone()
        return _row_to_rel(row) if row else None

    def find_relationships(
        self,
        from_entity_id: str | None = None,
        to_entity_id: str | None = None,
        rel_type: RelType | str | None = None,
    ) -> list[Relationship]:
        clauses: list[str] = []
        params:  list[Any] = []
        if from_entity_id is not None:
            clauses.append("from_entity_id = ?")
            params.append(from_entity_id)
        if to_entity_id is not None:
            clauses.append("to_entity_id = ?")
            params.append(to_entity_id)
        if rel_type is not None:
            rt = rel_type.value if isinstance(rel_type, RelType) else rel_type
            clauses.append("rel_type = ?")
            params.append(rt)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM kg_relationships {where} ORDER BY created_at DESC"
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(sql, params).fetchall()
        return [_row_to_rel(r) for r in rows]

    def delete_relationship(self, rel_id: str) -> bool:
        with self._lock:
            with self._connect() as conn:
                cur = conn.execute(
                    "DELETE FROM kg_relationships WHERE rel_id = ?", (rel_id,)
                )
                deleted = cur.rowcount > 0
        log.info("kg.rel.deleted", rel_id=rel_id, deleted=deleted)
        return deleted

    # ── Graph traversal ───────────────────────────────────────────────────────

    def get_neighbors(
        self,
        entity_id: str,
        rel_type: RelType | str | None = None,
        direction: str = "both",
    ) -> list[Entity]:
        """Return neighboring entities.

        Args:
            direction: ``"out"`` (outgoing), ``"in"`` (incoming), ``"both"``.
        """
        rt_filter = ""
        params: list[Any] = []

        def _build(col_src: str, col_dst: str) -> str:
            cond = f"WHERE {col_src} = ?"
            p    = [entity_id]
            if rel_type is not None:
                rv = rel_type.value if isinstance(rel_type, RelType) else rel_type
                cond += " AND rel_type = ?"
                p.append(rv)
            return cond, p

        neighbor_ids: set[str] = set()
        with self._lock:
            with self._connect() as conn:
                if direction in ("out", "both"):
                    cond, p = _build("from_entity_id", "to_entity_id")
                    rows = conn.execute(
                        f"SELECT to_entity_id FROM kg_relationships {cond}", p
                    ).fetchall()
                    neighbor_ids.update(r[0] for r in rows)
                if direction in ("in", "both"):
                    cond, p = _build("to_entity_id", "from_entity_id")
                    rows = conn.execute(
                        f"SELECT from_entity_id FROM kg_relationships {cond}", p
                    ).fetchall()
                    neighbor_ids.update(r[0] for r in rows)
                if not neighbor_ids:
                    return []
                placeholders = ",".join("?" * len(neighbor_ids))
                rows = conn.execute(
                    f"SELECT * FROM kg_entities WHERE entity_id IN ({placeholders})",
                    list(neighbor_ids),
                ).fetchall()
        return [_row_to_entity(r) for r in rows]

    def shortest_path(
        self,
        from_entity_id: str,
        to_entity_id: str,
        max_depth: int = 5,
    ) -> GraphPath | None:
        """BFS shortest path between two entities."""
        if from_entity_id == to_entity_id:
            return GraphPath(
                nodes=[from_entity_id],
                relationships=[],
                length=0,
                total_weight=0.0,
            )

        # BFS: queue of (current_node, path_nodes, path_rels, total_weight)
        queue: deque[tuple[str, list[str], list[str], float]] = deque()
        queue.append((from_entity_id, [from_entity_id], [], 0.0))
        visited: set[str] = {from_entity_id}

        t0 = time.perf_counter()

        while queue:
            current, path_nodes, path_rels, weight = queue.popleft()
            if len(path_nodes) - 1 >= max_depth:
                continue

            with self._lock:
                with self._connect() as conn:
                    rows = conn.execute(
                        """SELECT rel_id, to_entity_id, weight
                           FROM kg_relationships
                           WHERE from_entity_id = ?""",
                        (current,),
                    ).fetchall()

            for row in rows:
                nid = row["to_entity_id"]
                if nid in visited:
                    continue
                new_nodes = path_nodes + [nid]
                new_rels  = path_rels  + [row["rel_id"]]
                new_weight = weight + row["weight"]
                if nid == to_entity_id:
                    duration_ms = (time.perf_counter() - t0) * 1000
                    result = GraphPath(
                        nodes=new_nodes,
                        relationships=new_rels,
                        length=len(new_rels),
                        total_weight=new_weight,
                    )
                    with self._lock:
                        with self._connect() as conn:
                            self._log_query(
                                conn,
                                "shortest_path",
                                {"from": from_entity_id, "to": to_entity_id},
                                result.dict,
                                duration_ms,
                            )
                    return result
                visited.add(nid)
                queue.append((nid, new_nodes, new_rels, new_weight))

        return None

    def get_subgraph(self, entity_id: str, depth: int = 2) -> dict[str, Any]:
        """Return all entities and relationships within `depth` hops."""
        visited_entities: dict[str, Entity] = {}
        visited_rels:     dict[str, Relationship] = {}
        frontier = {entity_id}

        for _ in range(depth):
            next_frontier: set[str] = set()
            for eid in frontier:
                if eid in visited_entities:
                    continue
                entity = self.get_entity(eid)
                if entity:
                    visited_entities[eid] = entity
                rels = self.find_relationships(from_entity_id=eid)
                rels += self.find_relationships(to_entity_id=eid)
                for rel in rels:
                    visited_rels[rel.rel_id] = rel
                    next_frontier.add(rel.from_entity_id)
                    next_frontier.add(rel.to_entity_id)
            frontier = next_frontier - set(visited_entities.keys())

        # Fetch any remaining frontier entities
        for eid in frontier:
            entity = self.get_entity(eid)
            if entity:
                visited_entities[eid] = entity

        return {
            "entities":      [e.dict for e in visited_entities.values()],
            "relationships": [r.dict for r in visited_rels.values()],
        }

    # ── Convenience helpers ───────────────────────────────────────────────────

    def link_customer_contract_invoice(
        self,
        customer_id: str,
        contract_id: str,
        invoice_id: str,
    ) -> dict[str, Any]:
        """Create standard customer→contract and contract→invoice links."""
        r1 = self.add_relationship(customer_id, contract_id, RelType.HAS_CONTRACT)
        r2 = self.add_relationship(contract_id, invoice_id, RelType.HAS_INVOICE)
        return {
            "customer_to_contract": r1.dict,
            "contract_to_invoice":  r2.dict,
        }

    def query_by_type_chain(
        self,
        types: list[str],
        tenant_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Follow a chain of entity types and return matching paths.

        Example: ``["customer", "contract", "invoice"]``
        """
        if not types:
            return []

        t0 = time.perf_counter()

        # Start: entities of types[0]
        current_entities = self.find_entities(
            entity_type=types[0],
            tenant_id=tenant_id,
            limit=200,
        )

        paths: list[dict[str, Any]] = []
        for entity in current_entities:
            self._walk_type_chain(entity, types, 1, [entity.dict], paths, tenant_id)

        duration_ms = (time.perf_counter() - t0) * 1000
        with self._lock:
            with self._connect() as conn:
                self._log_query(
                    conn,
                    "type_chain",
                    {"types": types, "tenant_id": tenant_id},
                    paths,
                    duration_ms,
                )
        return paths

    def _walk_type_chain(
        self,
        entity: Entity,
        types: list[str],
        depth: int,
        current_path: list[dict],
        results: list[dict],
        tenant_id: str | None,
    ) -> None:
        if depth >= len(types):
            results.append({"path": current_path})
            return
        next_type = types[depth]
        neighbors = self.get_neighbors(entity.entity_id, direction="out")
        for neighbor in neighbors:
            if neighbor.entity_type.value == next_type:
                if tenant_id is None or neighbor.tenant_id == tenant_id:
                    self._walk_type_chain(
                        neighbor,
                        types,
                        depth + 1,
                        current_path + [neighbor.dict],
                        results,
                        tenant_id,
                    )

    def get_graph_stats(self, tenant_id: str | None = None) -> dict[str, Any]:
        """Return aggregate stats about the graph."""
        with self._lock:
            with self._connect() as conn:
                if tenant_id:
                    total_entities = conn.execute(
                        "SELECT COUNT(*) FROM kg_entities WHERE tenant_id = ?",
                        (tenant_id,),
                    ).fetchone()[0]
                    total_rels = conn.execute(
                        "SELECT COUNT(*) FROM kg_relationships WHERE tenant_id = ?",
                        (tenant_id,),
                    ).fetchone()[0]
                    by_type = conn.execute(
                        """SELECT entity_type, COUNT(*) as cnt
                           FROM kg_entities WHERE tenant_id = ?
                           GROUP BY entity_type""",
                        (tenant_id,),
                    ).fetchall()
                    by_rel_type = conn.execute(
                        """SELECT rel_type, COUNT(*) as cnt
                           FROM kg_relationships WHERE tenant_id = ?
                           GROUP BY rel_type""",
                        (tenant_id,),
                    ).fetchall()
                else:
                    total_entities = conn.execute(
                        "SELECT COUNT(*) FROM kg_entities"
                    ).fetchone()[0]
                    total_rels = conn.execute(
                        "SELECT COUNT(*) FROM kg_relationships"
                    ).fetchone()[0]
                    by_type = conn.execute(
                        "SELECT entity_type, COUNT(*) as cnt FROM kg_entities GROUP BY entity_type"
                    ).fetchall()
                    by_rel_type = conn.execute(
                        "SELECT rel_type, COUNT(*) as cnt FROM kg_relationships GROUP BY rel_type"
                    ).fetchall()
                total_queries = conn.execute(
                    "SELECT COUNT(*) FROM kg_queries"
                ).fetchone()[0]
        return {
            "total_entities":      total_entities,
            "total_relationships": total_rels,
            "total_queries_logged": total_queries,
            "entities_by_type":   {r["entity_type"]: r["cnt"] for r in by_type},
            "rels_by_type":       {r["rel_type"]: r["cnt"] for r in by_rel_type},
            "tenant_id":          tenant_id,
        }


__all__ = [
    "EntityType",
    "RelType",
    "Entity",
    "Relationship",
    "GraphPath",
    "QueryResult",
    "KnowledgeGraph",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_kg_instance: KnowledgeGraph | None = None
_kg_lock = _threading.Lock()


def get_knowledge_graph() -> KnowledgeGraph:
    global _kg_instance
    if _kg_instance is None:
        with _kg_lock:
            if _kg_instance is None:
                _kg_instance = KnowledgeGraph()
    return _kg_instance


def reset_knowledge_graph(db_path: str | None = None) -> KnowledgeGraph:
    global _kg_instance
    with _kg_lock:
        _kg_instance = KnowledgeGraph(db_path=db_path)
    return _kg_instance
