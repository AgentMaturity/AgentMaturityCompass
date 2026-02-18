"""Dependency Graph Resolver — Wave-2 Tool Intelligence.

Builds a directed acyclic graph (DAG) of task/tool dependencies:
  - Cycle detection with detailed path reporting
  - Topological sort (Kahn's algorithm) for execution ordering
  - Critical path identification
  - Parallel execution layer grouping

Pure Python, no external graph library required.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dependency_graphs (
    graph_id        TEXT PRIMARY KEY,
    name            TEXT NOT NULL DEFAULT '',
    nodes_json      TEXT NOT NULL DEFAULT '[]',
    edges_json      TEXT NOT NULL DEFAULT '[]',
    has_cycle       INTEGER NOT NULL DEFAULT 0,
    cycle_path_json TEXT NOT NULL DEFAULT '[]',
    exec_order_json TEXT NOT NULL DEFAULT '[]',
    layers_json     TEXT NOT NULL DEFAULT '[]',
    critical_path_json TEXT NOT NULL DEFAULT '[]',
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dep_graphs_tenant ON dependency_graphs(tenant_id);
"""


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class DepNode:
    node_id: str
    label: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def dict(self) -> dict[str, Any]:
        return {"node_id": self.node_id, "label": self.label, "metadata": self.metadata}


@dataclass
class DepEdge:
    from_node: str
    to_node: str
    label: str = ""

    @property
    def dict(self) -> dict[str, Any]:
        return {"from_node": self.from_node, "to_node": self.to_node, "label": self.label}


@dataclass
class DependencyGraph:
    graph_id: str
    name: str
    nodes: list[DepNode]
    edges: list[DepEdge]
    has_cycle: bool
    cycle_path: list[str]
    execution_order: list[str]      # node_ids in topo order
    layers: list[list[str]]         # parallel execution layers
    critical_path: list[str]        # longest path
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "graph_id": self.graph_id,
            "name": self.name,
            "nodes": [n.dict for n in self.nodes],
            "edges": [e.dict for e in self.edges],
            "has_cycle": self.has_cycle,
            "cycle_path": self.cycle_path,
            "execution_order": self.execution_order,
            "layers": self.layers,
            "critical_path": self.critical_path,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Graph algorithms
# ---------------------------------------------------------------------------


def _build_adjacency(
    nodes: list[DepNode], edges: list[DepEdge]
) -> tuple[dict[str, list[str]], dict[str, int]]:
    """Return adjacency list and in-degree map."""
    adj: dict[str, list[str]] = {n.node_id: [] for n in nodes}
    in_degree: dict[str, int] = {n.node_id: 0 for n in nodes}
    for edge in edges:
        if edge.from_node in adj:
            adj[edge.from_node].append(edge.to_node)
        if edge.to_node in in_degree:
            in_degree[edge.to_node] += 1
    return adj, in_degree


def _kahn_topo_sort(
    adj: dict[str, list[str]], in_degree: dict[str, int]
) -> tuple[list[str], bool, list[list[str]]]:
    """
    Kahn's algorithm for topological sort + cycle detection + layer grouping.

    Returns (order, has_cycle, layers).
    """
    in_deg = dict(in_degree)
    queue: deque[str] = deque(sorted(k for k, v in in_deg.items() if v == 0))
    order: list[str] = []
    layers: list[list[str]] = []

    while queue:
        layer = list(sorted(queue))  # sort for determinism
        queue.clear()
        layers.append(layer)
        for node in layer:
            order.append(node)
            for neighbor in adj.get(node, []):
                in_deg[neighbor] -= 1
                if in_deg[neighbor] == 0:
                    queue.append(neighbor)

    has_cycle = len(order) < len(in_degree)
    return order, has_cycle, layers


def _detect_cycle_path(
    adj: dict[str, list[str]], nodes: list[DepNode]
) -> list[str]:
    """DFS-based cycle path detection. Returns path of a cycle if found."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n.node_id: WHITE for n in nodes}
    path: list[str] = []
    cycle: list[str] = []

    def dfs(node: str) -> bool:
        color[node] = GRAY
        path.append(node)
        for nbr in adj.get(node, []):
            if color[nbr] == GRAY:
                # Found cycle: slice from nbr to end
                idx = path.index(nbr)
                cycle.extend(path[idx:] + [nbr])
                return True
            if color[nbr] == WHITE and dfs(nbr):
                return True
        path.pop()
        color[node] = BLACK
        return False

    for node in nodes:
        if color[node.node_id] == WHITE:
            if dfs(node.node_id):
                return cycle
    return []


def _critical_path(
    adj: dict[str, list[str]], nodes: list[DepNode]
) -> list[str]:
    """Find the longest path (by node count) using DP on DAG."""
    node_ids = [n.node_id for n in nodes]
    dist: dict[str, int] = {n: 0 for n in node_ids}
    pred: dict[str, str | None] = {n: None for n in node_ids}

    # Simple DP: iterate in topological order
    try:
        _, _, layers = _kahn_topo_sort(adj, {n: 0 for n in node_ids})
        topo = [node for layer in layers for node in layer]
    except Exception:
        return []

    for node in topo:
        for nbr in adj.get(node, []):
            if dist[node] + 1 > dist.get(nbr, 0):
                dist[nbr] = dist[node] + 1
                pred[nbr] = node

    if not dist:
        return []

    end = max(dist, key=lambda k: dist[k])
    path: list[str] = []
    cur: str | None = end
    while cur is not None:
        path.append(cur)
        cur = pred.get(cur)
    return list(reversed(path))


# ---------------------------------------------------------------------------
# Core resolver
# ---------------------------------------------------------------------------


class DependencyGraphResolver:
    """Build, analyse, and persist dependency graphs."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def resolve(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        name: str = "",
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> DependencyGraph:
        """Build graph, detect cycles, compute execution order."""
        dep_nodes = [
            DepNode(node_id=n["node_id"], label=n.get("label", n["node_id"]), metadata=n.get("metadata", {}))
            for n in nodes
        ]
        dep_edges = [
            DepEdge(from_node=e["from_node"], to_node=e["to_node"], label=e.get("label", ""))
            for e in edges
        ]

        adj, in_degree = _build_adjacency(dep_nodes, dep_edges)
        exec_order, has_cycle, layers = _kahn_topo_sort(adj, in_degree)
        cycle_path = _detect_cycle_path(adj, dep_nodes) if has_cycle else []
        crit = _critical_path(adj, dep_nodes) if not has_cycle else []

        graph_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO dependency_graphs
               (graph_id,name,nodes_json,edges_json,has_cycle,cycle_path_json,
                exec_order_json,layers_json,critical_path_json,
                tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                graph_id, name,
                json.dumps([n.dict for n in dep_nodes]),
                json.dumps([e.dict for e in dep_edges]),
                1 if has_cycle else 0,
                json.dumps(cycle_path),
                json.dumps(exec_order),
                json.dumps(layers),
                json.dumps(crit),
                tenant_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return DependencyGraph(
            graph_id=graph_id, name=name,
            nodes=dep_nodes, edges=dep_edges,
            has_cycle=has_cycle, cycle_path=cycle_path,
            execution_order=exec_order, layers=layers,
            critical_path=crit, tenant_id=tenant_id,
            metadata=metadata or {}, created_at=now,
        )

    def get(self, graph_id: str) -> DependencyGraph | None:
        row = self._conn.execute(
            "SELECT * FROM dependency_graphs WHERE graph_id=?", (graph_id,)
        ).fetchone()
        return self._row_to_graph(row) if row else None

    def list_graphs(self, tenant_id: str | None = None, limit: int = 50) -> list[DependencyGraph]:
        q = "SELECT * FROM dependency_graphs WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_graph(r) for r in self._conn.execute(q, params).fetchall()]

    def delete(self, graph_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM dependency_graphs WHERE graph_id=?", (graph_id,))
        self._conn.commit()
        return cur.rowcount > 0

    @staticmethod
    def _row_to_graph(row: sqlite3.Row) -> DependencyGraph:
        nodes = [
            DepNode(node_id=n["node_id"], label=n["label"], metadata=n.get("metadata", {}))
            for n in json.loads(row["nodes_json"])
        ]
        edges = [
            DepEdge(from_node=e["from_node"], to_node=e["to_node"], label=e.get("label", ""))
            for e in json.loads(row["edges_json"])
        ]
        return DependencyGraph(
            graph_id=row["graph_id"], name=row["name"],
            nodes=nodes, edges=edges,
            has_cycle=bool(row["has_cycle"]),
            cycle_path=json.loads(row["cycle_path_json"]),
            execution_order=json.loads(row["exec_order_json"]),
            layers=json.loads(row["layers_json"]),
            critical_path=json.loads(row["critical_path_json"]),
            tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_resolver: DependencyGraphResolver | None = None


def get_dependency_graph_resolver(db_path: str | Path | None = None) -> DependencyGraphResolver:
    global _resolver
    if _resolver is None:
        _resolver = DependencyGraphResolver(db_path=db_path)
    return _resolver


__all__ = [
    "DepNode",
    "DepEdge",
    "DependencyGraph",
    "DependencyGraphResolver",
    "get_dependency_graph_resolver",
]
