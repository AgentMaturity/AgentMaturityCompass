"""AMC Shield — S2 Behavioral Sandbox (Detonation service).

The service executes a skill in a confined environment and records runtime
signals for risk triage:

- processes spawned (via ``psutil`` when available)
- files written (snapshot diff)
- network activity (``/proc/net/tcp`` on Linux, log/regex fallback on macOS)
- persistence attempts (cron/startup file writes)
- findings merged with static analysis (S1) for behavioral-vs-static delta.

Example
-------

.. code-block:: python

    svc = BehavioralSandbox()
    report = svc.detonate("/path/to/skill", timeout_seconds=30)
    print(report.risk_level, report.network_calls)
"""

from __future__ import annotations

import os
import random
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel

from amc.core.models import Finding, RiskLevel, score_to_risk
from amc.shield.s1_analyzer import SkillAnalyzer

log = structlog.get_logger(__name__)

try:
    import psutil  # type: ignore[import-not-found]
    _PSUTIL_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    psutil = None  # type: ignore[assignment]
    _PSUTIL_AVAILABLE = False


_PERSISTENCE_PATH_HINTS = (
    ".bashrc",
    ".bash_profile",
    ".zshrc",
    ".profile",
    "launchagents",
    "crontab",
    "cron.d",
    "launchd",
    "startup",
)

_ORCHESTRATOR_ERROR: str | None = None
try:
    from amc.enforce.e7_sandbox_orchestrator import SandboxOrchestrator, SandboxSpec
except Exception as exc:  # pragma: no cover
    _ORCHESTRATOR_ERROR = str(exc)
    SandboxOrchestrator = None  # type: ignore[assignment]
    SandboxSpec = None  # type: ignore[assignment]


class DetonationReport(BaseModel):
    """Behavioral findings observed in one execution run."""

    skill_path: str
    duration_ms: int
    processes_spawned: list[str]
    files_written: list[str]
    network_calls: list[str]
    persistence_attempts: list[str]
    risk_findings: list[Finding]
    risk_level: RiskLevel


class BehavioralSandbox:
    """Execute skills in a controlled environment and collect runtime evidence."""

    def __init__(
        self,
        no_internet: bool = True,
        evidence_dir: str | None = None,
        sandbox_orchestrator: Any | None = None,
    ) -> None:
        self.no_internet = no_internet
        self.evidence_dir = Path(evidence_dir or tempfile.mkdtemp(prefix="amc-detonate-"))
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.analyzer = SkillAnalyzer()
        self._orchestrator = sandbox_orchestrator
        if self._orchestrator is None and SandboxOrchestrator is not None:
            self._orchestrator = SandboxOrchestrator()

        log.info(
            "behavioral_sandbox.init",
            no_internet=no_internet,
            orchestrator_available=self._orchestrator is not None,
        )

    def detonate(self, skill_path: str, timeout_seconds: int = 60, *, randomize_env: bool = False) -> DetonationReport:
        """Detonate one skill and return a :class:`DetonationReport`."""
        start_ns = time.perf_counter_ns()
        src = Path(skill_path)
        if not src.exists():
            raise FileNotFoundError(skill_path)

        static_scan = self.analyzer.scan_directory(src)
        run_root = self.evidence_dir / uuid.uuid4().hex
        run_root.mkdir(parents=True, exist_ok=True)

        copied = self._copy_skill(src, run_root)
        entry = self._entrypoint(copied)
        workspace = copied.parent

        before_files = self._list_files(workspace)
        before_net = self._snapshot_network()

        command = [self._python(), str(entry)]
        env = self._build_env(workspace, randomize_env=randomize_env)

        psutil_processes: list[str] = []
        stdout = b""
        stderr = b""
        rc = 0

        if self._orchestrator is not None and SandboxSpec is not None:
            rc, stdout, stderr, psutil_processes = self._run_in_orchestrator(workspace, command, timeout_seconds)
        else:
            rc, stdout, stderr, psutil_processes = self._run_plain(workspace, command, env, timeout_seconds)

        after_files = self._list_files(workspace)
        network_after = self._snapshot_network()

        new_files = sorted(after_files - before_files)
        network_calls = self._diff_network(before_net, network_after)
        captured = stderr.decode(errors="replace") + stdout.decode(errors="replace")
        network_calls.extend(self._extract_urls(captured))
        persistence_attempts = self._detect_persistence(workspace, new_files)

        risk_findings = self._behavioral_findings(
            processes_spawned=psutil_processes,
            files_written=new_files,
            network_calls=network_calls,
            persistence_attempts=persistence_attempts,
            return_code=rc,
            stdout=stdout.decode(errors="replace"),
            stderr=stderr.decode(errors="replace"),
        )

        # Merge S1 findings as context + evasion-style delta.
        evasions = self._compare_static_vs_behavioral(static_scan.findings, risk_findings)
        risk_findings.extend(evasions)

        report = DetonationReport(
            skill_path=str(src),
            duration_ms=int((time.perf_counter_ns() - start_ns) / 1_000_000),
            processes_spawned=sorted(psutil_processes),
            files_written=new_files,
            network_calls=sorted(set(network_calls)),
            persistence_attempts=sorted(set(persistence_attempts)),
            risk_findings=risk_findings,
            risk_level=score_to_risk(self._risk_score(risk_findings)),
        )

        (workspace / "detonation_report.json").write_text(report.model_dump_json(indent=2))
        return report

    def detonate_multi(self, skill_path: str, runs: int = 3) -> list[DetonationReport]:
        """Run multiple detonations with randomized environment each run."""
        reports: list[DetonationReport] = []
        for idx in range(max(1, runs)):
            rep = self.detonate(skill_path, randomize_env=(idx > 0))
            reports.append(rep)
            log.info("behavioral_sandbox.multi_run", run=idx + 1, risk=rep.risk_level.value)
        return reports

    # -- internals ----------------------------------------------------------

    @staticmethod
    def _python() -> str:
        import sys
        return sys.executable

    def _copy_skill(self, src: Path, run_root: Path) -> Path:
        if src.is_file():
            dst = run_root / src.name
            shutil.copy2(src, dst)
            return dst
        dst = run_root / src.name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        return dst

    def _entrypoint(self, skill_path: Path) -> Path:
        if skill_path.is_file():
            return skill_path
        for cand in ("main.py", "__main__.py", "run.py", "skill.py"):
            p = skill_path / cand
            if p.exists():
                return p
        py_files = sorted(skill_path.glob("*.py"))
        if not py_files:
            raise RuntimeError("No executable entrypoint found")
        return py_files[0]

    def _build_env(self, workspace: Path, randomize_env: bool = False) -> dict[str, str]:
        env = {
            **os.environ.copy(),
            "HOME": str(workspace),
            "TMPDIR": str(workspace / "tmp"),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
            "AMC_SANDBOX": "1",
            "AMC_SANDBOX_TYPE": "behavioral",
            "AMC_NO_NETWORK": "1" if self.no_internet else "0",
        }
        (workspace / "tmp").mkdir(exist_ok=True)

        if self.no_internet:
            # best-effort hard-disable known proxy envs
            env.update({"http_proxy": "", "https_proxy": "", "HTTP_PROXY": "", "HTTPS_PROXY": ""})

        if randomize_env:
            env.update(
                {
                    "AMC_RUN_ID": uuid.uuid4().hex[:8],
                    "AMC_TENANT": random.choice(["org-a", "org-b", "sandbox-1", "sandbox-2"]),
                    "USERNAME": random.choice(["worker", "agent", "runner"]),
                    "LANG": random.choice(["en_US.UTF-8", "C", "en_GB.UTF-8"]),
                }
            )
        return env

    def _run_plain(
        self,
        workspace: Path,
        command: list[str],
        env: dict[str, str],
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes, list[str]]:
        proc = subprocess.Popen(
            command,
            cwd=str(workspace),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
        )

        processes: list[str] = []
        try:
            if _PSUTIL_AVAILABLE and psutil is not None:
                p = psutil.Process(proc.pid)
                for c in p.children(recursive=True):
                    processes.append(f"{c.pid}:{c.name()}")

            stdout, stderr = proc.communicate(timeout=timeout_seconds)
            return int(proc.returncode or 0), stdout or b"", stderr or b"", processes
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=5)
            return -1, stdout or b"", (stderr or b"") + b"TIMEOUT", ["timeout"]
        except Exception as exc:  # pragma: no cover - defensive
            proc.kill()
            return -1, b"", str(exc).encode(), processes

    def _run_in_orchestrator(
        self,
        workspace: Path,
        command: list[str],
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes, list[str]]:
        if SandboxSpec is None or self._orchestrator is None:
            raise RuntimeError(_ORCHESTRATOR_ERROR or "orchestrator unavailable")

        spec = SandboxSpec(
            session_id=f"det-{uuid.uuid4().hex[:8]}",
            session_type="untrusted_api",
            allowed_paths=[str(workspace)],
            network_allowlist=[] if self.no_internet else ["*"],
            memory_limit_mb=256,
            cpu_limit_percent=50,
        )
        handle = self._orchestrator.create_sandbox(spec)
        try:
            output = self._orchestrator.run_in_sandbox(handle.sandbox_id, command, timeout=timeout_seconds)
            if not isinstance(output, dict):
                return -1, b"", b"invalid orchestrator result", ["orchestrator"]
            stdout = output.get("stdout", "").encode() if isinstance(output.get("stdout"), str) else (output.get("stdout") or b"")
            stderr = output.get("stderr", "").encode() if isinstance(output.get("stderr"), str) else (output.get("stderr") or b"")
            rc = int(output.get("returncode", -1))
            return rc, stdout, stderr, [f"orchestrator:{handle.sandbox_id}"]
        finally:
            try:
                self._orchestrator.teardown(handle.sandbox_id)
            except Exception:
                log.warning("behavioral_sandbox.orchestrator_teardown_failed", sandbox_id=handle.sandbox_id)

    @staticmethod
    def _list_files(workspace: Path) -> set[str]:
        out: set[str] = set()
        for fp in workspace.rglob("*"):
            if fp.is_file():
                out.add(str(fp.relative_to(workspace)))
        return out

    @staticmethod
    def _snapshot_network() -> list[str]:
        tcp = Path("/proc/net/tcp")
        if tcp.exists():
            rows = tcp.read_text(errors="ignore").splitlines()[1:]
            conn: list[str] = []
            for row in rows:
                parts = row.split()
                if len(parts) >= 4 and parts[3] in {"01", "02", "03", "04", "05"}:
                    conn.append(f"{parts[1]}->{parts[2]}:{parts[3]}")
            return conn

        # macOS fallback (best-effort): no procfs. Callers often have command output
        # captured in stdout/stderr; this snapshot remains empty and will be enriched by
        # pattern extraction from captured output.
        return []

    @staticmethod
    def _diff_network(before: list[str], after: list[str]) -> list[str]:
        return sorted(set(after) - set(before))

    @staticmethod
    def _extract_urls(text: str) -> list[str]:
        return re.findall(r"https?://[^\s'\"]+", text)

    @staticmethod
    def _detect_persistence(workspace: Path, new_files: list[str]) -> list[str]:
        attempts: list[str] = []
        for rel in new_files:
            low = rel.lower()
            if any(h in low for h in _PERSISTENCE_PATH_HINTS):
                attempts.append(f"persistence:{rel}")
            # inspect for suspicious shell snippets
            try:
                fp = workspace / rel
                if fp.is_file() and fp.stat().st_size < 200_000:
                    txt = fp.read_text(errors="replace").lower()
                    if any(k in txt for k in ("crontab", "launchctl", "systemctl", "autostart", "@reboot")):
                        attempts.append(f"persistence-content:{rel}")
            except Exception:
                pass
        return attempts

    def _behavioral_findings(
        self,
        processes_spawned: list[str],
        files_written: list[str],
        network_calls: list[str],
        persistence_attempts: list[str],
        return_code: int,
        stdout: str,
        stderr: str,
    ) -> list[Finding]:
        findings: list[Finding] = []

        if persistence_attempts:
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-PERSISTENCE",
                title="Persistence indicators observed",
                description="Skill wrote files in persistence-sensitive locations",
                risk_level=RiskLevel.HIGH,
                evidence=", ".join(persistence_attempts[:5]),
            ))

        if network_calls:
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-NETWORK",
                title="Network activity observed",
                description="Skill attempted outbound network activity during detonation",
                risk_level=RiskLevel.MEDIUM,
                evidence=", ".join(sorted(set(network_calls))[:8]),
            ))

        if len(files_written) > 20:
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-FILES",
                title="High file-write footprint",
                description=f"Skill wrote {len(files_written)} files",
                risk_level=RiskLevel.MEDIUM,
                evidence=", ".join(sorted(files_written[:8])),
            ))

        if len(processes_spawned) > 5:
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-PROC",
                title="Potential process abuse",
                description="Skill spawned many child processes",
                risk_level=RiskLevel.MEDIUM,
                evidence=", ".join(processes_spawned[:8]),
            ))

        if return_code not in (0, -1):
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-EXIT",
                title="Non-zero exit",
                description="Process exited with non-zero return code",
                risk_level=RiskLevel.LOW,
                evidence=str(return_code),
            ))

        if return_code == -1 and ("timeout" in stdout.lower() or "timeout" in stderr.lower()):
            findings.append(Finding(
                module="s2_behavioral_sandbox",
                rule_id="S2-TIMEOUT",
                title="Execution timed out",
                description="Skill timed out before the configured limit",
                risk_level=RiskLevel.MEDIUM,
                evidence="timeout",
            ))

        for marker in ("rm -rf", "chmod 777", "socket", "subprocess"):
            if marker in stdout.lower() or marker in stderr.lower():
                findings.append(Finding(
                    module="s2_behavioral_sandbox",
                    rule_id=f"S2-OUTPUT-{marker.replace(' ', '').upper()}",
                    title=f"Runtime output suspicious marker: {marker}",
                    description="Suspicious token emitted to process output",
                    risk_level=RiskLevel.LOW,
                    evidence=marker,
                ))

        return findings

    @staticmethod
    def _compare_static_vs_behavioral(static_findings: list[Finding], behavioral: list[Finding]) -> list[Finding]:
        static_ids = {f.rule_id for f in static_findings}
        evasions: list[Finding] = []
        for bf in behavioral:
            if bf.rule_id not in static_ids:
                evasions.append(Finding(
                    module="s2_behavioral_sandbox",
                    rule_id=f"S2-EVASION-{bf.rule_id}",
                    title="Behavior-only finding",
                    description=(
                        f"Observed at runtime but not by S1 static analysis: {bf.description}"
                    ),
                    risk_level=bf.risk_level,
                    evidence=bf.evidence,
                ))
        return evasions

    @staticmethod
    def _risk_score(findings: list[Finding]) -> int:
        weight = {
            RiskLevel.SAFE: 0,
            RiskLevel.LOW: 5,
            RiskLevel.MEDIUM: 12,
            RiskLevel.HIGH: 25,
            RiskLevel.CRITICAL: 50,
        }
        score = sum(weight[f.risk_level] for f in findings)
        return min(100, score)


__all__ = ["BehavioralSandbox", "DetonationReport"]
