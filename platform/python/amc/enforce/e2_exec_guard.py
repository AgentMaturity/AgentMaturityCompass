"""
AMC Enforce — E2: ExecGuard
Shell command interception and privilege-escalation gating.

ExecGuard enforces a strict allow-list + sequence analysis for shell commands
before execution. It is intentionally conservative and logs every evaluated
command, including why it was accepted/rejected and a hash of any command
output.

Usage:
    from amc.enforce.e2_exec_guard import ExecGuard, ExecDecision

    guard = ExecGuard(profile="safe_exec")
    decision = guard.assess(
        command="ls -la /Users/sid/.openclaw/workspace",
        args=["-la", "/Users/sid/.openclaw/workspace"],
        workdir="/Users/sid/.openclaw/workspace",
        stdout="listing...",
    )

    if decision.allowed:
        print("OK", decision.sanitized_command)
    else:
        print("BLOCKED:", decision.reason)
"""

from __future__ import annotations

import hashlib
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import structlog

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)


class ExecDecision(BaseModel):
    """Result of an execution decision.

    Attributes
    ----------
    allowed:
        Whether the command may execute.
    reason:
        Human-readable reason and risk explanation.
    sanitized_command:
        A sanitized/normalized command string (if allowed and sanitized).
    suspicious_count:
        Number of suspicious patterns detected while evaluating this command.
    """

    allowed: bool
    reason: str
    sanitized_command: str | None = None
    suspicious_count: int = 0
    output_hash: str | None = None
    session_quarantined: bool = False
    risk_level: RiskLevel = RiskLevel.SAFE


class ExecGuardConfig(BaseModel):
    """Runtime policy for ExecGuard."""

    profile: str = "safe_exec"
    allowlist_commands: set[str] = Field(default_factory=set)
    allowlist_prefixes: set[str] = Field(default_factory=set)
    allowlist_cwd_prefixes: set[str] = Field(default_factory=set)
    forbidden_substrings: set[str] = Field(default_factory=set)
    suspicious_threshold: int = 2
    max_chain_ops: int = 3
    require_absolute_paths: bool = False

    @field_validator("profile")
    @classmethod
    def _sanitize_profile(cls, value: str) -> str:
        if value not in {"no_exec", "safe_exec", "operator_exec"}:
            raise ValueError("profile must be one of: no_exec, safe_exec, operator_exec")
        return value


@dataclass
class ExecRule:
    """Simple rule descriptor for command validation."""

    id: str
    description: str
    risk_level: RiskLevel
    matcher: callable
    reason: str


# Profile definitions intentionally explicit, easy to override.
_PRESET_RULES: dict[str, ExecGuardConfig] = {
    "no_exec": ExecGuardConfig(
        profile="no_exec",
        allowlist_commands={"ls", "pwd", "cat", "head", "tail", "grep", "find", "git", "python", "python3", "node", "npm", "pip"},
        allowlist_prefixes={"/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin"},
        allowlist_cwd_prefixes={"/Users/sid/.openclaw/workspace", "/tmp/amc"},
        forbidden_substrings={"rm", "mkfs", "dd", "> ", ">>", "mkfs", ":(){", "sudo", "su", "chmod +s", "setuid"},
        suspicious_threshold=999,
        max_chain_ops=1,
        require_absolute_paths=False,
    ),
    "safe_exec": ExecGuardConfig(
        profile="safe_exec",
        allowlist_commands={"ls", "pwd", "cat", "sed", "awk", "grep", "find", "git", "python", "python3", "node", "npm", "pip", "npm", "rg", "jq", "awk", "echo"},
        allowlist_prefixes={"/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin"},
        allowlist_cwd_prefixes={"/Users/sid/.openclaw/workspace", "/tmp/amc"},
        forbidden_substrings={"rm -rf", "sudo", "curl", "wget", "knife", "ssh", "nc ", "nc\t", "chown", "chmod", "chgrp", "mkfs", "dd", "nohup", "reboot", "shutdown", "systemctl"},
        suspicious_threshold=2,
        max_chain_ops=2,
        require_absolute_paths=False,
    ),
    "operator_exec": ExecGuardConfig(
        profile="operator_exec",
        allowlist_commands={"ls", "pwd", "cat", "sed", "awk", "grep", "find", "git", "python", "python3", "node", "npm", "pip", "pip3", "du", "df", "cp", "mv", "mkdir", "touch", "chmod", "chown", "systemctl", "docker", "kubectl", "helm", "terraform"},
        allowlist_prefixes={"/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin", "/usr/sbin", "/sbin", "/usr/local/sbin"},
        allowlist_cwd_prefixes={"/Users/sid/.openclaw/workspace", "/tmp/amc", "/var/tmp"},
        forbidden_substrings={"rm -rf /", "rm -r /", "dd if=", ":(){", "mkfs", "reboot", "shutdown", r"curl .*\|.*sh"},
        suspicious_threshold=4,
        max_chain_ops=4,
        require_absolute_paths=False,
    ),
}


class ExecGuard:
    """Shell command interceptor using deterministic allow-list rules.

    The engine validates each command with:
      1. command allow-list
      2. path/workdir restrictions
      3. dangerous-flag validator
      4. suspicious sequence detector (privilege escalation patterns)

    It also records a short decision record containing output hashing for
    forensic correlation.
    """

    # A compact deny-list for risky flags and escalation primitives.
    _DANGEROUS_PATTERNS = [
        ("rm -rf", "destructive recursive delete"),
        ("-rf /", "destructive recursive delete from root"),
        ("--recursive /", "recursive operation on root"),
        ("sudo", "privilege escalation utility"),
        (" su ", "shell/user context switch"),
        (" | ", "command chaining via pipe"),
        ("&&", "command chaining via boolean operator"),
        ("||", "command chaining via boolean operator"),
        (";", "command chaining via separator"),
        ("mkfs", "filesystem reformat"),
        ("dd if=", "raw-disk write primitive"),
        ("chmod +s", "setuid manipulation"),
        ("setfacl", "permission model tampering"),
        ("sudo -u", "explicit privilege context switch"),
        ("doas", "alternate privilege tool"),
        ("pkexec", "polkit escalation"),
    ]

    def __init__(self, profile: str = "safe_exec", config: ExecGuardConfig | None = None) -> None:
        base = _PRESET_RULES.get(profile)
        if base is None:
            raise ValueError(f"Unknown profile: {profile}")
        if config is None:
            self.config = base
        else:
            values = base.model_dump()
            values.update(config.model_dump(exclude_unset=True))
            self.config = ExecGuardConfig(**values)

        # A quarantine flag for sessions is maintained at per-profile level.
        self._suspicious_counts: dict[str, int] = {}

    @staticmethod
    def _risk_rank(level: RiskLevel) -> int:
        return {RiskLevel.SAFE: 0, RiskLevel.LOW: 1, RiskLevel.MEDIUM: 2, RiskLevel.HIGH: 3, RiskLevel.CRITICAL: 4}.get(level, 0)

    @classmethod
    def from_preset(cls, profile: str) -> "ExecGuard":
        """Build guard from named preset."""
        return cls(profile=profile)

    def _normalize(self, command: str, args: list[str] | None = None) -> tuple[list[str], str]:
        tokens: list[str]
        if args:
            tokens = [command, *[str(a) for a in args]]
        else:
            tokens = shlex.split(command)
        # Keep quotes in sanitized representation for traceability
        sanitized = " ".join(shlex.quote(t) for t in tokens)
        return tokens, sanitized

    def _hash_output(self, output: str | None) -> str | None:
        if output is None:
            return None
        return hashlib.sha256(output.encode("utf-8")).hexdigest()

    def _path_allowed(self, candidate: str) -> bool:
        path = candidate.strip()
        if not path:
            return True
        expanded = str(Path(path).expanduser())
        if self.config.allowlist_prefixes:
            return any(expanded.startswith(prefix) for prefix in self.config.allowlist_prefixes)
        return True

    def _is_command_allowed(self, command: str) -> bool:
        if "/" in command and command.startswith("/"):
            return self._path_allowed(command)
        return command in self.config.allowlist_commands

    def _validate_dangerous_flags(self, raw_cmd: str, tokens: list[str], suspicious: list[str]) -> None:
        lowered = raw_cmd.lower()
        for pattern, reason in self._DANGEROUS_PATTERNS:
            if pattern in lowered:
                suspicious.append(f"dangerous_pattern::{pattern}::{reason}")

        for bad in self.config.forbidden_substrings:
            if bad in lowered:
                suspicious.append(f"policy_forbid::{bad}")

        # Specific argument traps
        if "rm" in tokens[:3] and any(t in {"-rf", "-fr", "-R", "--recursive"} for t in tokens):
            suspicious.append("rm command combined with recursive flag")
        if "/" in tokens and "--recursive" in tokens and any(t in ("/", "//") for t in tokens):
            suspicious.append("recursive operation on root")

    def _suspicious_sequence(self, tokens: list[str], suspicious: list[str]) -> int:
        """Return count of suspicious sequencing events.

        Heuristics target common escalation chains:
          - sudo <cmd> ; rm ...
          - command && sudo ...
          - command | command
          - nested command substitution with privileged calls
        """
        suspicious_count = 0
        lowered = [t.lower() for t in tokens]
        chain_ops = {"&&", "||", ";", "|", "\n"}

        if len([t for t in lowered if t in chain_ops]) > self.config.max_chain_ops:
            suspicious_count += 1
            suspicious.append("excessive command chaining")

        for i, tok in enumerate(lowered[:-1]):
            if tok in {"sudo", "su", "doas", "pkexec"}:
                suspicious_count += 1
                suspicious.append(f"privilege tool '{tok}' at position {i}")
            if tok in {"-exec", "-exec", "-exec;", "-ok"}:
                suspicious_count += 1
                suspicious.append(f"find exec primitive near {tok}")

        # Escalation pattern: chain with privilege token after separator
        for i, tok in enumerate(lowered):
            if tok in chain_ops and i + 1 < len(lowered):
                nxt = lowered[i + 1]
                if nxt in {"sudo", "su", "doas", "pkexec"}:
                    suspicious_count += 1
                    suspicious.append("chained privilege escalation")
                    break

        if "sudo" in lowered and any(p in lowered for p in {"chmod", "chown", "tee", "bash", "sh"}):
            suspicious_count += 1
            suspicious.append("sudo combined with sensitive tool")

        return suspicious_count

    def _cwd_allowed(self, workdir: str | None) -> bool:
        if not workdir:
            return True
        w = str(Path(workdir).expanduser())
        if self.config.allowlist_cwd_prefixes:
            return any(w.startswith(prefix) for prefix in self.config.allowlist_cwd_prefixes)
        return True

    def assess(
        self,
        command: str,
        args: list[str] | None = None,
        workdir: str | None = None,
        session_id: str = "default",
        stdout: str | None = None,
    ) -> ExecDecision:
        """Evaluate a command and return an execution decision.

        Parameters
        ----------
        command:
            Main command name or full shell snippet.
        args:
            Optional command arguments (when already parsed).
        workdir:
            Working directory for the command.
        session_id:
            Session identifier used for quarantine counting.
        stdout:
            Standard output from command execution (for hashing and audit).
        """
        suspicious: list[str] = []
        decision = ExecDecision(
            allowed=True,
            reason="Command appears safe for this profile",
        )
        baseline_ok = True

        output_hash = self._hash_output(stdout)
        if output_hash:
            decision.output_hash = output_hash

        try:
            tokens, sanitized = self._normalize(command, args=args)
        except ValueError:
            decision.allowed = False
            decision.reason = "Unable to parse command safely"
            decision.risk_level = RiskLevel.HIGH
            decision.sanitized_command = command
            log.warning("execguard.parse_error", session_id=session_id, command=command)
            return decision

        command_base = tokens[0] if tokens else command

        if command_base.startswith("/"):
            if not self._path_allowed(command_base):
                decision.allowed = False
                baseline_ok = False
                decision.reason = f"Command path '{command_base}' not in allowed prefixes"
                decision.risk_level = RiskLevel.HIGH
            elif self.config.require_absolute_paths and not self._is_command_allowed(command_base):
                decision.allowed = False
                baseline_ok = False
                decision.risk_level = RiskLevel.MEDIUM
                decision.reason = f"Absolute command '{command_base}' not explicitly allow-listed"

        if baseline_ok and not self._is_command_allowed(command_base):
            decision.allowed = False
            baseline_ok = False
            decision.risk_level = RiskLevel.MEDIUM
            decision.reason = f"Command '{command_base}' not in allow-list for profile '{self.config.profile}'"

        if baseline_ok and not self._cwd_allowed(workdir):
            decision.allowed = False
            baseline_ok = False
            decision.risk_level = RiskLevel.HIGH
            decision.reason = f"Working directory '{workdir}' violates workspace allow-list"

        if decision.allowed:
            self._validate_dangerous_flags(" ".join(tokens), tokens, suspicious)
            seq_count = self._suspicious_sequence(tokens, suspicious)
            decision.suspicious_count = seq_count

            if seq_count >= self.config.suspicious_threshold:
                decision.allowed = False
                decision.risk_level = RiskLevel.CRITICAL
                decision.session_quarantined = True
                decision.reason = "Suspicious command sequence threshold exceeded"

        if decision.allowed:
            # Profile-specific mandatory blocks for no_exec
            if self.config.profile == "no_exec" and command_base not in {"ls", "pwd", "cat", "echo", "find", "git", "python", "python3"}:
                decision.allowed = False
                decision.risk_level = RiskLevel.HIGH
                decision.reason = "No-Exec profile allows only tightly controlled read-only commands"

        # Update session suspicious count and emit quarantine decision when needed
        if suspicious:
            decision.suspicious_count = len(suspicious)
            self._suspicious_counts[session_id] = self._suspicious_counts.get(session_id, 0) + len(suspicious)
            if self._suspicious_counts[session_id] > self.config.suspicious_threshold:
                decision.allowed = False
                decision.session_quarantined = True
                decision.reason = f"Quarantine triggered for session {session_id}: suspicious pattern count"
                if self._risk_rank(RiskLevel.CRITICAL) > self._risk_rank(decision.risk_level):
                    decision.risk_level = RiskLevel.CRITICAL

        # sanitize command for logging/execution (remove newline; keep basic quote escaping)
        decision.sanitized_command = sanitized

        log.info(
            "execguard.decision",
            session_id=session_id,
            allowed=decision.allowed,
            reason=decision.reason,
            suspicious=len(suspicious),
            output_hash=decision.output_hash,
            command=sanitized,
        )
        return decision
