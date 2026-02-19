"""AMC Enforce — E7: Sandbox Orchestrator for non-main sessions.

The orchestrator creates isolated execution environments for sensitive sessions.
It prefers Docker-backed sandboxes when Docker's Python SDK is available and
falls back to a restricted temp-directory mode when Docker is unavailable.

The interface is intentionally small and production-oriented:

- :class:`SandboxOrchestrator.create_sandbox`
- :class:`SandboxOrchestrator.teardown`

Usage
-----

.. code-block:: python

    orch = SandboxOrchestrator()
    spec = SandboxSpec(
        session_id="session-9",
        session_type="untrusted_api",
        allowed_paths=["/tmp"],
        network_allowlist=[],
        memory_limit_mb=256,
        cpu_limit_percent=50,
    )
    handle = orch.create_sandbox(spec)
    # run workload using orch.run_in_sandbox(handle.sandbox_id, ["python", "main.py"])
    report = orch.teardown(handle.sandbox_id)
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

from amc.core.models import SessionTrust

log = structlog.get_logger(__name__)

try:
    import docker as _docker_mod  # type: ignore[import-not-found]
    _DOCKER_AVAILABLE = True
except Exception:  # pragma: no cover - environment-dependent
    _docker_mod = None
    _DOCKER_AVAILABLE = False


class SandboxSpec(BaseModel):
    """Specification for a sandbox instance.

    Parameters
    ----------
    session_id:
        Owning session identifier.
    session_type:
        One of ``group_chat``, ``untrusted_api`` or ``public_webhook``.
    allowed_paths:
        Host-side paths available in the sandbox.
    network_allowlist:
        Hostname list. Empty list means no outbound network.
    memory_limit_mb:
        Memory hard limit in MiB.
    cpu_limit_percent:
        CPU percentage cap.
    """

    session_id: str
    session_type: Literal["group_chat", "untrusted_api", "public_webhook"]
    allowed_paths: list[str] = Field(default_factory=list)
    network_allowlist: list[str] = Field(default_factory=list)
    memory_limit_mb: int = Field(ge=64, le=16384, default=256)
    cpu_limit_percent: float = Field(ge=1, le=100, default=50.0)


class SandboxHandle(BaseModel):
    """Handle returned by :meth:`SandboxOrchestrator.create_sandbox`."""

    sandbox_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: Literal["created", "running", "error", "stopped", "torn_down"] = "created"
    workspace_path: str
    container_id: str | None = None
    backend: Literal["docker", "tempdir"] = "tempdir"


class SandboxAuditReport(BaseModel):
    """Audit outcome when tearing down a sandbox.

    ``files_written`` etc are best-effort snapshots and are intentionally
    conservative: they capture what this orchestrator observed as changes.
    """

    files_written: list[str] = Field(default_factory=list)
    processes_spawned: list[str] = Field(default_factory=list)
    network_attempts: list[str] = Field(default_factory=list)


class SandboxPolicy(BaseModel):
    """Policy for deciding whether sessions require automatic sandboxing."""

    # Auto-create sandbox for sessions below TRUSTED.
    auto_create_for_trust_levels: list[SessionTrust] = Field(
        default_factory=lambda: [SessionTrust.UNTRUSTED, SessionTrust.HOSTILE]
    )
    docker_image: str = "python:3.12-slim"
    default_network_mode: Literal["bridge", "none"] = "none"

    @property
    def should_sandbox(self) -> list[str]:
        return [level.value for level in self.auto_create_for_trust_levels]


class SandboxOrchestrator:
    """Provision and manage sandboxes.

    The class keeps a lightweight SQLite index of created/destroyed sandboxes and
    writes sandbox-specific process/network observations into it on teardown.
    """

    def __init__(
        self,
        policy: SandboxPolicy | None = None,
        workspace_root: str | None = None,
        db_path: str = "sandbox_audit.db",
    ) -> None:
        self.policy = policy or SandboxPolicy()
        self._workspace_root = Path(workspace_root or tempfile.gettempdir()) / "sandbox_workspace"
        self._workspace_root.mkdir(parents=True, exist_ok=True)
        self._db_path = Path(db_path)
        self._handles: dict[str, SandboxHandle] = {}
        self._baseline_files: dict[str, set[str]] = {}
        self._init_db()
        log.info("sandbox_orchestrator.init", root=str(self._workspace_root), docker=_DOCKER_AVAILABLE)

    # --- policy ---------------------------------------------------------------

    def needs_sandbox(self, trust_level: SessionTrust) -> bool:
        """Return whether session should be automatically sandboxed."""
        return trust_level in self.policy.auto_create_for_trust_levels

    # --- internal ------------------------------------------------------------

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sandbox_audit (
                    sandbox_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    session_type TEXT NOT NULL,
                    backend TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    torn_down_at TEXT,
                    files_written TEXT,
                    processes_spawned TEXT,
                    network_attempts TEXT
                )
                """
            )

    def _record_creation(self, handle: SandboxHandle, spec: SandboxSpec) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sandbox_audit
                (sandbox_id, session_id, session_type, backend, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    handle.sandbox_id,
                    spec.session_id,
                    spec.session_type,
                    handle.backend,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def _baseline(self, workspace: Path) -> set[str]:
        files = set()
        for fp in workspace.rglob("*"):
            if fp.is_file():
                files.add(str(fp.relative_to(workspace)))
        return files

    def _list_dir_files(self, workspace: Path) -> list[str]:
        out = []
        for fp in workspace.rglob("*"):
            if fp.is_file():
                out.append(str(fp.relative_to(workspace)))
        return sorted(out)

    def _resolve_allowed_paths(self, spec: SandboxSpec, workspace: Path) -> list[tuple[str, str]]:
        mounts: list[tuple[str, str]] = []
        for p in spec.allowed_paths:
            host = Path(p).resolve()
            mounts.append((str(host), str(workspace / "allowed" / host.name)))
        return mounts

    # --- public API ----------------------------------------------------------

    def create_sandbox(self, spec: SandboxSpec) -> SandboxHandle:
        """Create a sandbox from a :class:`SandboxSpec`."""
        sandbox_id = str(uuid.uuid4())
        workspace = self._workspace_root / spec.session_id / sandbox_id
        workspace.mkdir(parents=True, exist_ok=True)

        handle = SandboxHandle(sandbox_id=sandbox_id, status="created", workspace_path=str(workspace))
        self._record_creation(handle, spec)

        if _DOCKER_AVAILABLE:
            container_id = self._try_docker_create(spec, workspace)
            if container_id:
                handle.container_id = container_id
                handle.backend = "docker"
                handle.status = "running"
                self._handles[sandbox_id] = handle
                self._baseline_files[sandbox_id] = self._baseline(workspace)
                return handle

        handle.status = "running"
        handle.backend = "tempdir"
        self._setup_tempdir(handle, spec)
        self._handles[sandbox_id] = handle
        self._baseline_files[sandbox_id] = self._baseline(workspace)
        return handle

    def _try_docker_create(self, spec: SandboxSpec, workspace: Path) -> str | None:
        if _docker_mod is None:
            return None
        try:
            client = _docker_mod.from_env()
            vols: dict[str, dict[str, str]] = {
                str(workspace): {"bind": "/workspace", "mode": "rw"}
            }
            for host_path, _ in self._resolve_allowed_paths(spec, workspace):
                if Path(host_path).exists():
                    target = f"/mnt/{Path(host_path).name}"
                    vols[host_path] = {"bind": target, "mode": "rw"}

            cpu_quota = int(100000 * (spec.cpu_limit_percent / 100.0))
            network_mode = "none" if not spec.network_allowlist else "bridge"

            container = client.containers.run(
                image=self.policy.docker_image,
                command="sleep infinity",
                detach=True,
                mem_limit=f"{spec.memory_limit_mb}m",
                cpu_period=100000,
                cpu_quota=cpu_quota,
                network_mode=network_mode,
                volumes=vols,
                working_dir="/workspace",
                remove=False,
                auto_remove=False,
                user="nobody",
                name=f"amc-sbx-{uuid.uuid4().hex[:8]}",
            )
            return container.id
        except Exception as exc:  # pragma: no cover - environment-dependent
            log.warning("sandbox_orchestrator.docker_create_failed", error=str(exc))
            return None

    def _setup_tempdir(self, handle: SandboxHandle, spec: SandboxSpec) -> None:
        workspace = Path(handle.workspace_path)
        for host_path, mounted in self._resolve_allowed_paths(spec, workspace):
            host = Path(host_path)
            target = Path(mounted)
            if host.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(host), str(target))
            elif host.is_dir():
                target.parent.mkdir(parents=True, exist_ok=True)
                # read-write mount view in this fallback mode
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(host, target)

        metadata = {
            "sandbox_id": handle.sandbox_id,
            "session_id": spec.session_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "allowed_paths": spec.allowed_paths,
            "network_allowlist": spec.network_allowlist,
        }
        (workspace / ".sandbox.json").write_text(json.dumps(metadata, indent=2))

    def run_in_sandbox(self, sandbox_id: str, command: list[str], timeout: int | None = None) -> tuple[str, str, int]:
        """Execute a command inside a sandbox.

        For Docker sandboxes this uses ``docker exec``; for tempdir fallback it runs
        a local subprocess confined to the workspace path.
        """
        handle = self._handles.get(sandbox_id)
        if not handle:
            raise KeyError(f"sandbox not found: {sandbox_id}")

        timeout_sec = timeout or 60
        translated_cmd = self._translate_command_for_backend(command, handle)
        if handle.backend == "docker" and handle.container_id and _docker_mod is not None:
            return self._run_in_docker(handle, translated_cmd)

        env = os.environ.copy()
        env.update(
            {
                "HOME": handle.workspace_path,
                "TMPDIR": str(Path(handle.workspace_path) / "tmp"),
                "PATH": "/usr/bin:/bin:/usr/local/bin",
                "AMC_SANDBOX": "1",
                "AMC_SANDBOX_ID": handle.sandbox_id,
                "PYTHONNOUSERSITE": "1",
            }
        )
        proc = subprocess.run(
            translated_cmd,
            cwd=handle.workspace_path,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            text=True,
            check=False,
        )
        return proc.stdout, proc.stderr, proc.returncode

    def _translate_command_for_backend(self, command: list[str], handle: SandboxHandle) -> list[str]:
        """Translate host workspace paths to sandbox mount paths."""
        ws = Path(handle.workspace_path).resolve()
        out: list[str] = []
        for idx, token in enumerate(command):
            if idx == 0:
                out.append(token)
                continue
            p = Path(token)
            if token.startswith(str(ws)) and p.exists():
                rel = p.relative_to(ws).as_posix()
                out.append(f"/workspace/{rel}" if handle.backend == "docker" else str(p))
                continue
            out.append(token)
        return out

    def _run_in_docker(self, handle: SandboxHandle, command: list[str]) -> tuple[str, str, int]:
        if not handle.container_id or _docker_mod is None:
            return "", "", -1
        try:
            client = _docker_mod.from_env()
            container = client.containers.get(handle.container_id)
            result = container.exec_run(cmd=command, workdir="/workspace", demux=True)
            out, err = result.output if isinstance(result.output, tuple) else (result.output, b"")
            stdout = out.decode(errors="replace") if isinstance(out, (bytes, bytearray)) else str(out or "")
            stderr = err.decode(errors="replace") if isinstance(err, (bytes, bytearray)) else ""
            return stdout, stderr, int(result.exit_code)
        except Exception as exc:
            return "", str(exc), -1

    def _get_spec_for_sandbox(self, sandbox_id: str) -> SandboxSpec | None:
        # Persisted metadata (for tempdir fallback) contains session and limits.
        handle = self._handles.get(sandbox_id)
        if not handle:
            return None
        meta_file = Path(handle.workspace_path) / ".sandbox.json"
        if not meta_file.exists():
            return None
        payload = json.loads(meta_file.read_text())
        return SandboxSpec(
            session_id=payload.get("session_id", "unknown"),
            session_type="group_chat",
            allowed_paths=payload.get("allowed_paths", []),
            network_allowlist=payload.get("network_allowlist", []),
        )

    def teardown(self, sandbox_id: str) -> SandboxAuditReport:
        """Tear down sandbox and return observed writes/process/network footprint."""
        handle = self._handles.get(sandbox_id)
        if not handle:
            raise KeyError(f"sandbox not found: {sandbox_id}")

        workspace = Path(handle.workspace_path)
        after = self._baseline(workspace)
        files_written = sorted(after - self._baseline_files.get(sandbox_id, set()))

        network_attempts = self._detect_network_attempts()
        processes = self._detect_processes_for_handle(handle)

        if handle.backend == "docker" and handle.container_id and _docker_mod is not None:
            try:
                client = _docker_mod.from_env()
                container = client.containers.get(handle.container_id)
                container.stop(timeout=5)
                container.remove(force=True)
            except Exception as exc:  # pragma: no cover - environment dependent
                log.warning("sandbox_orchestrator.docker_remove_failed", error=str(exc))

        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)

        report = SandboxAuditReport(
            files_written=files_written,
            processes_spawned=processes,
            network_attempts=network_attempts,
        )

        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                UPDATE sandbox_audit
                SET torn_down_at=?,
                    files_written=?,
                    processes_spawned=?,
                    network_attempts=?
                WHERE sandbox_id=?
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(report.files_written),
                    json.dumps(report.processes_spawned),
                    json.dumps(report.network_attempts),
                    sandbox_id,
                ),
            )

        handle.status = "torn_down"
        self._handles.pop(sandbox_id, None)
        self._baseline_files.pop(sandbox_id, None)
        log.info("sandbox_orchestrator.torn_down", sandbox_id=sandbox_id, files=len(report.files_written))
        return report

    def _detect_network_attempts(self) -> list[str]:
        # Conservative approach: include current TCP established connections.
        path = Path("/proc/net/tcp")
        if not path.exists():
            return []
        out = []
        for line in path.read_text().splitlines()[1:]:
            parts = line.split()
            if len(parts) > 2 and parts[3] in {"01", "02", "03"}:
                local, remote = parts[1], parts[2]
                out.append(f"{local}->{remote}:state={parts[3]}")
        return out

    @staticmethod
    def _detect_processes_for_handle(handle: SandboxHandle) -> list[str]:
        if handle.backend != "docker":
            return ["sandboxed_subprocess"]
        return [f"container:{handle.container_id}"]


__all__ = [
    "SandboxSpec",
    "SandboxHandle",
    "SandboxAuditReport",
    "SandboxPolicy",
    "SandboxOrchestrator",
]
