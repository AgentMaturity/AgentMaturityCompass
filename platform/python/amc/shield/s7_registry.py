"""AMC Shield — S7: Private Enterprise Skill Registry.

The registry stores signed/unsigned skill artifacts with metadata, persists catalog
rows in SQLite, and exposes simple publish/list/install primitives.

Workflow
--------

.. code-block:: python

    from pathlib import Path
    from amc.shield.s3_signing import SkillSigner
    from amc.shield.s7_registry import SkillRegistry

    signer = SkillSigner()
    identity, private_key = signer.register_publisher("Acme", "acme.io", "eng@acme.io")

    reg = SkillRegistry()
    reg = SkillRegistry()
    artifact = reg.publish("./my-skill", identity.publisher_id, {
        "private_key": private_key,
        "name": "my-skill",
        "version": "1.0.0",
    })
    path = reg.install(artifact.skill_id, artifact.version, "./installed")
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import Finding, RiskLevel, score_to_risk
from amc.shield.s1_analyzer import SkillAnalyzer
from amc.shield.s3_signing import SkillSigner

log = structlog.get_logger(__name__)


class SkillArtifact(BaseModel):
    """Artifact metadata row returned by registry APIs."""

    skill_id: str
    name: str
    version: str
    publisher_id: str
    file_hash: str
    scan_result_summary: str
    signed: bool
    published_at: datetime
    tags: list[str] = Field(default_factory=list)


class PolicyResult(BaseModel):
    """Simple allow/deny response for registry policy checks."""

    allowed: bool
    reasons: list[str] = Field(default_factory=list)


class RegistryPolicy(BaseModel):
    """Source and signature constraints for registry use."""

    allowed_sources: list[str] = Field(default_factory=lambda: ["local"])  # e.g. ["local", "trusted-cdn"]
    block_unsigned: bool = True


class SkillRegistry:
    """Private skill registry with filesystem + sqlite metadata store."""

    def __init__(
        self,
        db_path: str = "skill_registry.db",
        store_root: str = "registry_store",
        policy: RegistryPolicy | None = None,
    ) -> None:
        self._db_path = Path(db_path)
        self._store_root = Path(store_root)
        self._store_root.mkdir(parents=True, exist_ok=True)
        self.policy = policy or RegistryPolicy()
        self.signer = SkillSigner(db_path=self._db_path)
        self._analyzer = SkillAnalyzer()
        self._init_db()

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_artifacts(
                    skill_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    version TEXT NOT NULL,
                    publisher_id TEXT NOT NULL,
                    file_hash TEXT NOT NULL,
                    scan_result_summary TEXT NOT NULL,
                    signed INTEGER NOT NULL,
                    trust_score INTEGER NOT NULL,
                    published_at TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    source TEXT NOT NULL,
                    PRIMARY KEY (skill_id, version)
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _artifact_dir(store_root: Path, skill_id: str) -> Path:
        d = store_root / skill_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    @staticmethod
    def _artifact_path(store_root: Path, skill_id: str, version: str) -> Path:
        return SkillRegistry._artifact_dir(store_root, skill_id) / f"{version}.zip"

    # ------------------------------------------------------------------
    # core APIs
    # ------------------------------------------------------------------

    def publish(
        self,
        skill_path: str,
        publisher_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> SkillArtifact:
        """Publish a skill into registry.

        Publish flow:

        1. S1 static analysis
        2. reject if risk level is ``HIGH`` or above
        3. sign using S3 signer if signing inputs are provided
        4. create deterministic zip artifact under ``registry_store/{skill_id}/{version}.zip``
        5. persist metadata row.
        """

        metadata = metadata or {}
        skill_dir = Path(skill_path)
        if not skill_dir.exists() or not skill_dir.is_dir():
            raise ValueError("skill_path must be an existing directory")

        static_result = self._analyzer.scan_directory(skill_dir)
        scan_summary = f"risk={static_result.risk_level.value};score={static_result.risk_score};" \
            f"findings={len(static_result.findings)}"

        if static_result.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
            raise ValueError(f"skill failed static scan: {static_result.risk_level.value}")

        skill_id = metadata.get("skill_id") or f"skill-{hashlib.md5(str(skill_dir).encode()).hexdigest()[:16]}"
        version = str(metadata.get("version") or "1.0.0")
        name = str(metadata.get("name") or skill_dir.name)
        tags = list(metadata.get("tags") or [])
        source = str(metadata.get("source", "local"))

        signed = False
        if "private_key" in metadata:
            try:
                private_key = str(metadata["private_key"])
                self.signer.sign_skill(skill_dir, publisher_id, private_key)
                signed = True
            except Exception as exc:
                raise ValueError(f"signing failed: {exc}") from exc

        artifact_path = self._artifact_path(self._store_root, str(skill_id), version)
        file_hash = self._build_and_write_archive(skill_dir, artifact_path)

        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(
                """
                INSERT INTO skill_artifacts(
                    skill_id, name, version, publisher_id, file_hash,
                    scan_result_summary, signed, trust_score,
                    published_at, tags, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    skill_id,
                    name,
                    version,
                    publisher_id,
                    file_hash,
                    scan_summary,
                    int(signed),
                    int(static_result.risk_score),
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(tags),
                    source,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        artifact = SkillArtifact(
            skill_id=str(skill_id),
            name=name,
            version=version,
            publisher_id=publisher_id,
            file_hash=file_hash,
            scan_result_summary=scan_summary,
            signed=signed,
            published_at=datetime.now(timezone.utc),
            tags=tags,
        )
        log.info("s7_registry.publish", skill_id=skill_id, version=version, signed=signed, risk=static_result.risk_level.value)
        return artifact

    def install(self, skill_id: str, version: str, target_path: str) -> Path:
        """Install artifact by extracting into ``target_path`` after hash verification."""
        artifact_path = self._artifact_path(self._store_root, skill_id, version)
        if not artifact_path.exists():
            raise FileNotFoundError(f"artifact {skill_id}:{version} not found")

        row = self._get_artifact_row(skill_id, version)
        if row is None:
            raise FileNotFoundError(f"artifact metadata missing for {skill_id}:{version}")

        expected_hash = row["file_hash"]
        with tempfile.TemporaryDirectory(prefix="amc-registry-verify-") as tmp:
            tmp_p = Path(tmp)
            # Re-read zip as bytes and hash-check before extraction
            data = artifact_path.read_bytes()
            got = hashlib.sha256(data).hexdigest()
            if got != expected_hash:
                raise ValueError("artifact hash mismatch")
            with zipfile.ZipFile(artifact_path) as zf:
                zf.extractall(tmp_p)

            # extract dir name to keep each install isolated by skill id
            target = Path(target_path) / skill_id / version
            target.mkdir(parents=True, exist_ok=True)
            # copy tree from temp directory to target (preserve nested content)
            for child in tmp_p.iterdir():
                shutil.copytree(child, target / child.name, dirs_exist_ok=True) if child.is_dir() else shutil.copy2(child, target / child.name)

            return target

    def list_skills(
        self,
        tags: list[str] | None = None,
        min_trust_score: int | None = None,
        publisher_id: str | None = None,
    ) -> list[SkillArtifact]:
        """List published artifacts with optional filtering."""
        con = sqlite3.connect(self._db_path)
        con.row_factory = sqlite3.Row
        try:
            sql = "SELECT * FROM skill_artifacts"
            where: list[str] = []
            params: list[Any] = []

            if publisher_id:
                where.append("publisher_id = ?")
                params.append(publisher_id)
            if min_trust_score is not None:
                where.append("trust_score >= ?")
                params.append(min_trust_score)

            if where:
                sql += " WHERE " + " AND ".join(where)

            rows = con.execute(sql, tuple(params)).fetchall()
            artifacts: list[SkillArtifact] = []
            for row in rows:
                row_tags = json.loads(row["tags"])
                if tags and not set(tags).issubset(set(row_tags)):
                    continue
                artifacts.append(
                    SkillArtifact(
                        skill_id=row["skill_id"],
                        name=row["name"],
                        version=row["version"],
                        publisher_id=row["publisher_id"],
                        file_hash=row["file_hash"],
                        scan_result_summary=row["scan_result_summary"],
                        signed=bool(row["signed"]),
                        published_at=datetime.fromisoformat(row["published_at"]),
                        tags=row_tags,
                    )
                )
            return artifacts
        finally:
            con.close()

    def enforce_policy(self, skill_path: str) -> PolicyResult:
        """Policy gate for publishing or installation."""
        reasons: list[str] = []
        if not os.path.exists(skill_path):
            return PolicyResult(allowed=False, reasons=["skill path missing"])

        p = Path(skill_path).resolve()
        source = "local"
        if p.is_file() and p.suffix == ".zip":
            # if local archive, check metadata path string against allowlist
            source = "local-archive"

        if self.policy.allowed_sources and source not in self.policy.allowed_sources:
            return PolicyResult(allowed=False, reasons=[f"source '{source}' not allowed"])

        if self.policy.block_unsigned:
            sig_file = p / ".amc-signature.json" if p.is_dir() else p.with_name(".amc-signature.json")
            if not sig_file.exists():
                return PolicyResult(allowed=False, reasons=["unsigned artifact blocked by policy"])

        return PolicyResult(allowed=True, reasons=[])

    def sync_from_upstream(self, upstream_url: str, allowlist: list[str]) -> list[SkillArtifact]:
        """Placeholder that validates upstream URL and returns an empty queue.

        TODO: Implement HTTP fetch + signature verification + rescan + publish.
        For now this method validates the upstream URL is in allowlist and returns
        ``[]`` while preserving call compatibility.
        """
        if upstream_url not in allowlist:
            raise PermissionError("upstream source not in allowlist")
        log.info("s7_registry.sync_from_upstream_stub", upstream_url=upstream_url)
        return []

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    def _get_artifact_row(self, skill_id: str, version: str) -> sqlite3.Row | None:
        con = sqlite3.connect(self._db_path)
        con.row_factory = sqlite3.Row
        try:
            return con.execute(
                "SELECT * FROM skill_artifacts WHERE skill_id = ? AND version = ?",
                (skill_id, version),
            ).fetchone()
        finally:
            con.close()

    @staticmethod
    def _hash_archive_bytes(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    def _build_and_write_archive(self, skill_dir: Path, output_zip: Path) -> str:
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.close()
        tmp_path = Path(tmp.name)
        try:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for fp in sorted(skill_dir.rglob("*")):
                    if fp.is_file():
                        rel = fp.relative_to(skill_dir)
                        zf.write(fp, rel.as_posix())
            artifact_bytes = tmp_path.read_bytes()
            output_zip.parent.mkdir(parents=True, exist_ok=True)
            output_zip.write_bytes(artifact_bytes)
            return self._hash_archive_bytes(artifact_bytes)
        finally:
            tmp_path.unlink(missing_ok=True)


__all__ = [
    "SkillRegistry",
    "SkillArtifact",
    "PolicyResult",
    "RegistryPolicy",
]
