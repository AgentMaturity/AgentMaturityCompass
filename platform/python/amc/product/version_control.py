"""Prompt + workflow version control with file-backed JSON history.

This module keeps immutable snapshots for prompt and workflow artifacts in a
single JSON file so feature state can be diffed and rolled back.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from pydantic import BaseModel, Field

ArtifactKind = Literal["prompt", "workflow"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _flatten(prefix: str, value: Any, out: dict[str, str]) -> None:
    """Flatten dict-like payload into path->typed-string map for diffing."""
    if isinstance(value, dict):
        if not value:
            out[prefix] = "{}"
            return
        for k, v in value.items():
            _flatten(f"{prefix}.{k}" if prefix else str(k), v, out)
        return

    if isinstance(value, list):
        if not value:
            out[prefix] = "[]"
            return
        for idx, item in enumerate(value):
            _flatten(f"{prefix}[{idx}]", item, out)
        return

    out[prefix] = json.dumps(value, sort_keys=True, separators=",:")


def _diff_payloads(old: dict[str, Any], new: dict[str, Any]) -> dict[str, list[str]]:
    old_flat: dict[str, str] = {}
    new_flat: dict[str, str] = {}
    _flatten("", old, old_flat)
    _flatten("", new, new_flat)

    old_keys = set(old_flat)
    new_keys = set(new_flat)

    added: list[str] = sorted(new_keys - old_keys)
    removed: list[str] = sorted(old_keys - new_keys)
    changed: list[str] = []

    for key in sorted(old_keys & new_keys):
        if old_flat[key] != new_flat[key]:
            changed.append(key)

    return {
        "added": added,
        "removed": removed,
        "changed": changed,
    }


# ---------------------------------------------------------------------------
# Persistence model
# ---------------------------------------------------------------------------


@dataclass
class SnapshotRecord:
    """Single immutable snapshot for one artifact."""

    artifact_type: ArtifactKind
    artifact_id: str
    version: int
    content: dict[str, Any]
    created_at: str
    note: str = ""
    parent_version: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_type": self.artifact_type,
            "artifact_id": self.artifact_id,
            "version": self.version,
            "content": self.content,
            "created_at": self.created_at,
            "note": self.note,
            "parent_version": self.parent_version,
        }


class VersionDiff(BaseModel):
    artifact_type: ArtifactKind
    artifact_id: str
    from_version: int | None
    to_version: int | None
    changed: list[str] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    from_content: dict[str, Any] = Field(default_factory=dict)
    to_content: dict[str, Any] = Field(default_factory=dict)


class VersionControlStore:
    """Simple JSON-backed history store for prompt/workflow artifacts."""

    def __init__(self, history_file: str | Path = "amc_prompt_workflow_versions.json") -> None:
        self._file = Path(history_file)
        self._lock = Lock()
        self._ensure_store_exists()

    # ---------------------------------------------------------------
    # Public API
    # ---------------------------------------------------------------

    def snapshot(
        self,
        artifact_type: ArtifactKind,
        artifact_id: str,
        content: dict[str, Any],
        note: str = "",
    ) -> SnapshotRecord:
        """Create a new snapshot and return the stored record."""
        payload = dict(content or {})
        with self._lock:
            history = self._load()
            bucket = history.setdefault(artifact_type, {})
            versions = bucket.setdefault(artifact_id, [])
            next_version = len(versions) + 1

            parent_version = versions[-1]["version"] if versions else None
            record = SnapshotRecord(
                artifact_type=artifact_type,
                artifact_id=artifact_id,
                version=next_version,
                content=payload,
                created_at=_now(),
                note=note,
                parent_version=parent_version,
            )
            versions.append(record.as_dict())
            self._save(history)
            return record

    def get_snapshot(
        self,
        artifact_type: ArtifactKind,
        artifact_id: str,
        version: int | None = None,
    ) -> SnapshotRecord | None:
        """Fetch one snapshot by version (latest if version omitted)."""
        with self._lock:
            history = self._load()
            records = history.get(artifact_type, {}).get(artifact_id, [])
            if not records:
                return None

            if version is None:
                raw = records[-1]
            else:
                raw = next((r for r in records if r["version"] == version), None)
                if raw is None:
                    return None

            return SnapshotRecord(
                artifact_type=artifact_type,
                artifact_id=artifact_id,
                version=raw["version"],
                content=raw["content"],
                created_at=raw["created_at"],
                note=raw.get("note", ""),
                parent_version=raw.get("parent_version"),
            )

    def list_snapshots(
        self,
        artifact_type: ArtifactKind,
        artifact_id: str,
    ) -> list[SnapshotRecord]:
        with self._lock:
            history = self._load()
            return [
                SnapshotRecord(
                    artifact_type=artifact_type,
                    artifact_id=artifact_id,
                    version=r["version"],
                    content=r["content"],
                    created_at=r["created_at"],
                    note=r.get("note", ""),
                    parent_version=r.get("parent_version"),
                )
                for r in history.get(artifact_type, {}).get(artifact_id, [])
            ]

    def diff(
        self,
        artifact_type: ArtifactKind,
        artifact_id: str,
        from_version: int | None = None,
        to_version: int | None = None,
    ) -> VersionDiff:
        """Compare snapshots for the same artifact with deterministic ordering."""
        records = self.list_snapshots(artifact_type, artifact_id)
        if len(records) < 1:
            return VersionDiff(
                artifact_type=artifact_type,
                artifact_id=artifact_id,
                from_version=from_version,
                to_version=to_version,
            )

        if from_version is None:
            if len(records) < 2:
                from_version = records[0].version
            else:
                from_version = records[-2].version

        if to_version is None:
            to_version = records[-1].version

        source = self.get_snapshot(artifact_type, artifact_id, from_version)
        target = self.get_snapshot(artifact_type, artifact_id, to_version)
        if source is None or target is None:
            raise ValueError("Requested versions not found")

        delta = _diff_payloads(source.content, target.content)
        return VersionDiff(
            artifact_type=artifact_type,
            artifact_id=artifact_id,
            from_version=source.version,
            to_version=target.version,
            from_content=source.content,
            to_content=target.content,
            **delta,
        )

    def rollback(
        self,
        artifact_type: ArtifactKind,
        artifact_id: str,
        target_version: int,
        create_new_snapshot: bool = True,
    ) -> SnapshotRecord:
        """Rollback to target version and optionally create a new snapshot entry."""
        target = self.get_snapshot(artifact_type, artifact_id, target_version)
        if target is None:
            raise ValueError("Target version not found")

        if not create_new_snapshot:
            return SnapshotRecord(
                artifact_type=target.artifact_type,
                artifact_id=target.artifact_id,
                version=target.version,
                content=target.content,
                created_at=target.created_at,
                note=target.note,
                parent_version=target.parent_version,
            )

        return self.snapshot(
            artifact_type=artifact_type,
            artifact_id=artifact_id,
            content=target.content,
            note=f"rollback-to-v{target.version}",
        )

    def reset(self) -> None:
        """Clear the store file (test helper)."""
        self._save({"prompt": {}, "workflow": {}})

    # ---------------------------------------------------------------
    # Storage helpers
    # ---------------------------------------------------------------

    def _ensure_store_exists(self) -> None:
        if self._file.exists():
            return
        self._file.parent.mkdir(parents=True, exist_ok=True)
        self._save({"prompt": {}, "workflow": {}})

    def _load(self) -> dict[str, dict[str, list[dict[str, Any]]]]:
        raw = self._file.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {"prompt": {}, "workflow": {}}
        return {
            "prompt": data.get("prompt", {}) if isinstance(data.get("prompt", {}), dict) else {},
            "workflow": data.get("workflow", {}) if isinstance(data.get("workflow", {}), dict) else {},
        }

    def _save(self, payload: dict[str, Any]) -> None:
        data = {
            "prompt": payload.get("prompt", {}),
            "workflow": payload.get("workflow", {}),
            "updated_at": _now(),
        }
        self._file.write_text(
            json.dumps(data, sort_keys=True, indent=2, ensure_ascii=True),
            encoding="utf-8",
        )


# Singleton helper
_default_store: VersionControlStore | None = None

def get_version_control_store(
    history_file: str | Path = "amc_prompt_workflow_versions.json",
) -> VersionControlStore:
    global _default_store
    if _default_store is None or str(_default_store._file) != str(Path(history_file)):
        _default_store = VersionControlStore(history_file=history_file)
    return _default_store


def reset_version_history(history_file: str | Path = "amc_prompt_workflow_versions.json") -> None:
    """Clear history; convenience for tests and clean startup."""
    get_version_control_store(history_file).reset()


__all__ = [
    "ArtifactKind",
    "SnapshotRecord",
    "VersionControlStore",
    "VersionDiff",
    "get_version_control_store",
    "reset_version_history",
]
