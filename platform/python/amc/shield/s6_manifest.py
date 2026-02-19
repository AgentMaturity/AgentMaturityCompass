"""
AMC Shield — S6: Skill Permission Manifest Validator & Runtime Enforcer
=======================================================================

Every AMC skill must ship a ``skill_manifest.json`` that declares exactly
which platform capabilities it needs, why it needs them, and what scope
each capability operates within.  S6 has two jobs:

1. **Validation** (pre-load / CI gate)  — parse the manifest, enforce
   schema, flag dangerous capability combinations, verify justifications
   are non-trivial, and produce a ``ValidationResult`` with ordered
   ``Finding`` objects.

2. **Runtime enforcement** — the ``RuntimeEnforcer`` wraps every live
   tool call and rejects anything that falls outside the declared scopes
   using ``fnmatch`` for paths and suffix-based domain matching for URLs.

Manifest format (``skill_manifest.json``):
::

    {
      "name": "my-research-skill",
      "version": "1.2.0",
      "publisher": "acme-corp",
      "description": "Searches the web and summarises results.",
      "homepage": "https://acme-corp.example.com/skills/research",
      "min_amc_version": "0.8.0",
      "capabilities": [
        {
          "type": "outbound_network",
          "scope": "*.wikipedia.org",
          "justification": "Fetches Wikipedia articles for summarisation."
        },
        {
          "type": "filesystem_write",
          "scope": "/tmp/amc-research/*",
          "justification": "Caches downloaded articles to avoid repeat fetches."
        }
      ]
    }

Usage — Validation::

    from amc.shield.s6_manifest import ManifestValidator

    validator = ManifestValidator()
    result = validator.validate("/path/to/skill/skill_manifest.json")
    print(result.passed)          # True / False
    print(result.risk_level)      # RiskLevel.MEDIUM
    for finding in result.findings:
        print(finding.rule_id, finding.title)

Usage — Runtime enforcement::

    from amc.shield.s6_manifest import ManifestValidator, RuntimeEnforcer

    result = ManifestValidator().validate("/path/to/skill/skill_manifest.json")
    enforcer = RuntimeEnforcer(result.manifest)

    # Before calling a tool:
    allowed = enforcer.check_capability("web_fetch", {"url": "https://en.wikipedia.org/wiki/Python"})
    # → True  (matches declared "*.wikipedia.org" scope)

    allowed = enforcer.check_capability("web_fetch", {"url": "https://evil.example.com/payload"})
    # → False  (not in declared scopes)

Usage — Template generation::

    from amc.shield.s6_manifest import generate_manifest_template

    path = generate_manifest_template("/path/to/skill/")
    # Writes /path/to/skill/skill_manifest.json with detected capabilities pre-filled.

Usage — CLI::

    # Invoked via amc CLI:
    # amc shield manifest validate skill_manifest.json
"""
from __future__ import annotations

import fnmatch
import json
import re
import time
from enum import Enum
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import structlog
from pydantic import BaseModel, Field, field_validator, model_validator

from amc.core.models import Finding, RiskLevel, score_to_risk

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Capability Type Enum
# ---------------------------------------------------------------------------

class CapabilityType(str, Enum):
    """Exhaustive set of platform capabilities a skill may request."""
    FILESYSTEM_READ    = "filesystem_read"
    FILESYSTEM_WRITE   = "filesystem_write"
    SHELL_EXEC         = "shell_exec"
    BROWSER_CONTROL    = "browser_control"
    OUTBOUND_NETWORK   = "outbound_network"
    MESSAGING_SEND     = "messaging_send"
    CRON_SCHEDULING    = "cron_scheduling"
    CONFIG_CHANGE      = "config_change"
    MEMORY_READ        = "memory_read"
    MEMORY_WRITE       = "memory_write"


# ---------------------------------------------------------------------------
# Risk map: base risk for each capability type (before scope/justification)
# ---------------------------------------------------------------------------

CAPABILITY_RISK_MAP: dict[CapabilityType, RiskLevel] = {
    CapabilityType.FILESYSTEM_READ:  RiskLevel.LOW,
    CapabilityType.FILESYSTEM_WRITE: RiskLevel.MEDIUM,
    CapabilityType.SHELL_EXEC:       RiskLevel.CRITICAL,
    CapabilityType.BROWSER_CONTROL:  RiskLevel.HIGH,
    CapabilityType.OUTBOUND_NETWORK: RiskLevel.MEDIUM,
    CapabilityType.MESSAGING_SEND:   RiskLevel.HIGH,
    CapabilityType.CRON_SCHEDULING:  RiskLevel.HIGH,
    CapabilityType.CONFIG_CHANGE:    RiskLevel.CRITICAL,
    CapabilityType.MEMORY_READ:      RiskLevel.LOW,
    CapabilityType.MEMORY_WRITE:     RiskLevel.MEDIUM,
}

# ---------------------------------------------------------------------------
# Tool → Capability mapping (OpenClaw tool names → CapabilityType)
# ---------------------------------------------------------------------------

TOOL_CAPABILITY_MAP: dict[str, CapabilityType] = {
    # Execution
    "exec":         CapabilityType.SHELL_EXEC,
    "process":      CapabilityType.SHELL_EXEC,
    # Filesystem
    "read":         CapabilityType.FILESYSTEM_READ,
    "write":        CapabilityType.FILESYSTEM_WRITE,
    "edit":         CapabilityType.FILESYSTEM_WRITE,
    # Browser
    "browser":      CapabilityType.BROWSER_CONTROL,
    "canvas":       CapabilityType.BROWSER_CONTROL,
    # Network
    "web_fetch":    CapabilityType.OUTBOUND_NETWORK,
    "web_search":   CapabilityType.OUTBOUND_NETWORK,
    "image":        CapabilityType.OUTBOUND_NETWORK,
    # Messaging
    "message":      CapabilityType.MESSAGING_SEND,
    "tts":          CapabilityType.MESSAGING_SEND,
    # Scheduling / config
    "nodes":        CapabilityType.CONFIG_CHANGE,
    # Memory
    "sessions_list":    CapabilityType.MEMORY_READ,
    "sessions_history": CapabilityType.MEMORY_READ,
    "sessions_spawn":   CapabilityType.MEMORY_WRITE,
    "subagents":        CapabilityType.MEMORY_WRITE,
}

# Capabilities whose scope is a URL / domain pattern
_URL_SCOPED_CAPABILITIES: frozenset[CapabilityType] = frozenset({
    CapabilityType.OUTBOUND_NETWORK,
    CapabilityType.BROWSER_CONTROL,
})

# Capabilities whose scope is a filesystem path pattern
_PATH_SCOPED_CAPABILITIES: frozenset[CapabilityType] = frozenset({
    CapabilityType.FILESYSTEM_READ,
    CapabilityType.FILESYSTEM_WRITE,
})

# Overly broad scopes that should trigger a warning
_WILDCARD_SCOPES: frozenset[str] = frozenset({"*", "**", "/**", "/*", "*.*"})

# Minimum meaningful justification length (chars)
_MIN_JUSTIFICATION_LEN = 20


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CapabilityDeclaration(BaseModel):
    """A single declared capability with its scope and justification."""
    type: CapabilityType
    scope: str = Field(
        ...,
        min_length=1,
        description=(
            "Path glob (filesystem), domain pattern (network/browser), "
            "or free-text constraint describing the allowed scope."
        ),
    )
    justification: str = Field(
        ...,
        min_length=1,
        description="Human-readable reason this capability is required.",
    )
    # Optional: hard rate-limit guard (requests per minute, 0 = no limit)
    max_calls_per_minute: int = Field(default=0, ge=0)
    # Optional: allow_list of explicit values (commands, domains, …)
    allow_list: list[str] = Field(default_factory=list)

    @field_validator("justification")
    @classmethod
    def justification_must_be_meaningful(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < _MIN_JUSTIFICATION_LEN:
            raise ValueError(
                f"Justification is too short ({len(stripped)} chars). "
                f"Provide at least {_MIN_JUSTIFICATION_LEN} characters explaining "
                "why this capability is needed."
            )
        return stripped

    @field_validator("scope")
    @classmethod
    def scope_must_not_be_empty_wildcard(cls, v: str) -> str:
        return v.strip()


class ManifestSchema(BaseModel):
    """Top-level skill permission manifest schema."""
    name: str = Field(..., min_length=1, pattern=r"^[a-z0-9][a-z0-9\-_]*$")
    version: str = Field(
        ...,
        pattern=r"^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?$",
        description="Semantic version string (e.g. 1.2.3, 0.1.0-beta).",
    )
    publisher: str = Field(..., min_length=1)
    capabilities: list[CapabilityDeclaration] = Field(default_factory=list)
    description: str = ""
    homepage: str = ""
    min_amc_version: str = ""
    # Extra fields are stored but flagged
    model_config = {"extra": "allow"}

    @model_validator(mode="after")
    def no_duplicate_capability_types(self) -> "ManifestSchema":
        seen: dict[CapabilityType, int] = {}
        for i, cap in enumerate(self.capabilities):
            if cap.type in seen:
                log.warning(
                    "s6_manifest.duplicate_capability",
                    capability=cap.type.value,
                    first_index=seen[cap.type],
                    second_index=i,
                )
            seen[cap.type] = i
        return self


class ValidationResult(BaseModel):
    """Result of validating a skill_manifest.json."""
    passed: bool
    risk_level: RiskLevel
    findings: list[Finding] = Field(default_factory=list)
    manifest: ManifestSchema | None = None
    per_capability_risks: dict[str, str] = Field(
        default_factory=dict,
        description="Maps each declared capability type → its base RiskLevel value.",
    )
    duration_ms: int = 0
    validated_at: str = ""   # ISO timestamp string


# ---------------------------------------------------------------------------
# Internal validation rules
# ---------------------------------------------------------------------------

_MODULE = "s6_manifest"


def _finding(
    rule_id: str,
    title: str,
    description: str,
    risk_level: RiskLevel,
    evidence: str = "",
    remediation: str = "",
    fp_likelihood: float = 0.0,
) -> Finding:
    return Finding(
        module=_MODULE,
        rule_id=rule_id,
        title=title,
        description=description,
        risk_level=risk_level,
        evidence=evidence,
        remediation=remediation,
        false_positive_likelihood=fp_likelihood,
    )


def _check_overbroad_scope(cap: CapabilityDeclaration) -> Finding | None:
    """Warn when a scope is effectively a wildcard."""
    scope = cap.scope.strip()
    if scope in _WILDCARD_SCOPES:
        return _finding(
            rule_id="S6-010",
            title=f"Over-broad scope for {cap.type.value}",
            description=(
                f"Capability '{cap.type.value}' uses an unrestricted scope "
                f"'{scope}'. This grants access to everything with no guardrails."
            ),
            risk_level=RiskLevel.HIGH,
            evidence=scope,
            remediation=(
                "Narrow the scope to the smallest path/domain/pattern needed. "
                "Example: '/tmp/my-skill/*' instead of '*'."
            ),
        )
    return None


def _check_dangerous_singleton(cap: CapabilityDeclaration) -> Finding | None:
    """Flag inherently dangerous capabilities that warrant extra review."""
    dangerous = {
        CapabilityType.SHELL_EXEC:    (RiskLevel.CRITICAL, "S6-020", "Shell execution capability declared"),
        CapabilityType.CONFIG_CHANGE: (RiskLevel.CRITICAL, "S6-021", "Configuration change capability declared"),
        CapabilityType.CRON_SCHEDULING: (RiskLevel.HIGH,   "S6-022", "Cron scheduling capability declared"),
        CapabilityType.BROWSER_CONTROL: (RiskLevel.HIGH,   "S6-023", "Browser control capability declared"),
        CapabilityType.MESSAGING_SEND:  (RiskLevel.HIGH,   "S6-024", "Messaging send capability declared"),
    }
    if cap.type in dangerous:
        lvl, rid, title = dangerous[cap.type]
        return _finding(
            rule_id=rid,
            title=title,
            description=(
                f"Capability '{cap.type.value}' carries inherent risk "
                f"({lvl.value}) and requires mandatory human review before skill load."
            ),
            risk_level=lvl,
            evidence=f"type={cap.type.value}, scope={cap.scope}",
            remediation=(
                "Ensure this capability is strictly necessary. "
                "Prefer a narrower alternative (e.g. FILESYSTEM_READ instead of SHELL_EXEC). "
                "Provide a detailed justification and restrict scope as tightly as possible."
            ),
        )
    return None


def _check_dangerous_combination(caps: list[CapabilityDeclaration]) -> list[Finding]:
    """Detect particularly risky capability combinations."""
    findings: list[Finding] = []
    types = {c.type for c in caps}

    # shell_exec + outbound_network → trivial exfiltration / C2 channel
    if CapabilityType.SHELL_EXEC in types and CapabilityType.OUTBOUND_NETWORK in types:
        findings.append(_finding(
            rule_id="S6-030",
            title="Dangerous combination: shell_exec + outbound_network",
            description=(
                "A skill with both shell execution and outbound network access "
                "can trivially exfiltrate data or establish a C2 channel. "
                "This combination requires highest-level scrutiny."
            ),
            risk_level=RiskLevel.CRITICAL,
            evidence="shell_exec ∩ outbound_network",
            remediation=(
                "Split into separate, minimal-privilege skills. "
                "If both are genuinely needed, require explicit step-up approval "
                "at runtime for every invocation."
            ),
        ))

    # filesystem_write + outbound_network → data leak via write-then-fetch
    if CapabilityType.FILESYSTEM_WRITE in types and CapabilityType.OUTBOUND_NETWORK in types:
        findings.append(_finding(
            rule_id="S6-031",
            title="Potentially dangerous combination: filesystem_write + outbound_network",
            description=(
                "A skill that can both write files and make outbound network calls "
                "could stage exfiltration via the filesystem. Review carefully."
            ),
            risk_level=RiskLevel.HIGH,
            evidence="filesystem_write ∩ outbound_network",
            remediation=(
                "Confirm write paths are strictly in isolated temp directories "
                "and outbound network scope does not allow arbitrary domains."
            ),
            fp_likelihood=0.2,
        ))

    # config_change + cron_scheduling → persistent backdoor
    if CapabilityType.CONFIG_CHANGE in types and CapabilityType.CRON_SCHEDULING in types:
        findings.append(_finding(
            rule_id="S6-032",
            title="Critical combination: config_change + cron_scheduling",
            description=(
                "Config + cron together enable persistent, self-reinstalling backdoors. "
                "This is the highest-risk capability combination in the catalog."
            ),
            risk_level=RiskLevel.CRITICAL,
            evidence="config_change ∩ cron_scheduling",
            remediation=(
                "This combination is almost never legitimate. "
                "Deny unless explicitly approved by a security officer."
            ),
        ))

    return findings


def _check_filesystem_scope_escape(cap: CapabilityDeclaration) -> Finding | None:
    """Detect filesystem scopes that could escape the workspace."""
    dangerous_prefixes = ["/etc/", "/usr/", "/bin/", "/sbin/", "/boot/",
                          "/root/", "/var/", "/proc/", "/sys/", "/dev/"]
    for prefix in dangerous_prefixes:
        if cap.scope.startswith(prefix) or cap.scope.strip() == "/":
            return _finding(
                rule_id="S6-040",
                title=f"Filesystem scope escapes workspace: {cap.scope}",
                description=(
                    f"Scope '{cap.scope}' grants access to a system directory "
                    "outside the AMC workspace. This is almost certainly malicious."
                ),
                risk_level=RiskLevel.CRITICAL,
                evidence=cap.scope,
                remediation=(
                    "Restrict filesystem scope to within the AMC workspace "
                    "(e.g. /Users/<user>/.openclaw/workspace/... or /tmp/...)."
                ),
            )
    return None


def _check_trivial_justification(cap: CapabilityDeclaration) -> Finding | None:
    """Flag copy-paste / boilerplate justifications."""
    boilerplate_patterns = [
        re.compile(r"^(n/?a|none|todo|fixme|tbd|required|needed|yes|true)\.?$", re.IGNORECASE),
        re.compile(r"^(this capability is needed|required for functionality|needed for the skill)\.?$", re.IGNORECASE),
        re.compile(r"^(placeholder|fill.?in|see.?readme)\.?$", re.IGNORECASE),
    ]
    j = cap.justification.strip().lower()
    for pat in boilerplate_patterns:
        if pat.match(j):
            return _finding(
                rule_id="S6-050",
                title=f"Trivial/boilerplate justification for {cap.type.value}",
                description=(
                    f"The justification '{cap.justification}' is a placeholder. "
                    "Every capability must have a meaningful explanation."
                ),
                risk_level=RiskLevel.MEDIUM,
                evidence=cap.justification,
                remediation=(
                    "Replace with a specific explanation: "
                    "what the capability is used for, which data, and why alternatives "
                    "were not viable."
                ),
            )
    return None


def _check_no_capabilities(caps: list[CapabilityDeclaration]) -> Finding | None:
    """A manifest with zero capabilities is suspicious (may be incomplete)."""
    if not caps:
        return _finding(
            rule_id="S6-060",
            title="Manifest declares no capabilities",
            description=(
                "A skill that claims no capabilities may have omitted its manifest "
                "content or may be hiding real capability usage."
            ),
            risk_level=RiskLevel.LOW,
            evidence="capabilities: []",
            remediation=(
                "If the skill truly needs no capabilities (pure computation), "
                "this is fine — add a comment to SKILL.md confirming it. "
                "Otherwise, declare all capabilities explicitly."
            ),
            fp_likelihood=0.3,
        )
    return None


# ---------------------------------------------------------------------------
# ManifestValidator
# ---------------------------------------------------------------------------

class ManifestValidator:
    """
    Validates a ``skill_manifest.json`` against the AMC permission schema.

    Checks performed:
    - JSON parsability
    - Pydantic schema conformance
    - Per-capability: dangerous singletons, over-broad scopes, trivial justifications,
      filesystem scope escape
    - Cross-capability: dangerous combinations
    - Aggregate risk scoring
    """

    def __init__(self, passing_threshold: RiskLevel = RiskLevel.HIGH) -> None:
        """
        Args:
            passing_threshold: Manifests at or above this risk level will have
                               ``passed=False`` in the result.  Defaults to HIGH
                               (i.e. MEDIUM and below pass; HIGH and CRITICAL fail).
        """
        self.passing_threshold = passing_threshold
        self._risk_order = [
            RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM,
            RiskLevel.HIGH, RiskLevel.CRITICAL,
        ]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate(self, manifest_path: str | Path) -> ValidationResult:
        """
        Validate a skill manifest file.

        Args:
            manifest_path: Path to the ``skill_manifest.json`` file.

        Returns:
            A :class:`ValidationResult` with full finding detail.
        """
        from datetime import datetime, timezone
        path = Path(manifest_path)
        start = time.monotonic()
        findings: list[Finding] = []

        log.info("s6_manifest.validate.start", path=str(path))

        # --- 1. File existence ---
        if not path.exists():
            findings.append(_finding(
                rule_id="S6-001",
                title="Manifest file not found",
                description=f"No skill_manifest.json found at: {path}",
                risk_level=RiskLevel.HIGH,
                remediation=(
                    "Run `amc shield manifest generate <skill_dir>` to create "
                    "a starter manifest, then fill in the required fields."
                ),
            ))
            return self._build_result(
                findings=findings, manifest=None, start=start
            )

        # --- 2. JSON parse ---
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            findings.append(_finding(
                rule_id="S6-002",
                title="Manifest is not valid JSON",
                description=f"JSON parse error: {exc}",
                risk_level=RiskLevel.HIGH,
                evidence=str(exc),
                remediation="Fix the JSON syntax error. Use a linter like `jq .` to validate.",
            ))
            return self._build_result(
                findings=findings, manifest=None, start=start
            )

        # --- 3. Pydantic schema ---
        try:
            manifest = ManifestSchema.model_validate(data)
        except Exception as exc:
            findings.append(_finding(
                rule_id="S6-003",
                title="Manifest fails schema validation",
                description=f"Schema error: {exc}",
                risk_level=RiskLevel.HIGH,
                evidence=str(exc)[:500],
                remediation=(
                    "Ensure all required fields (name, version, publisher, capabilities) "
                    "are present and correctly typed. See AMC skill manifest docs."
                ),
            ))
            return self._build_result(
                findings=findings, manifest=None, start=start
            )

        # --- 4. Extra/unknown top-level fields ---
        known_fields = {"name", "version", "publisher", "capabilities",
                        "description", "homepage", "min_amc_version"}
        extra_keys = set(data.keys()) - known_fields
        if extra_keys:
            findings.append(_finding(
                rule_id="S6-004",
                title="Unknown fields in manifest",
                description=(
                    f"Unexpected top-level keys: {sorted(extra_keys)}. "
                    "Unknown fields are ignored but may indicate a schema mismatch."
                ),
                risk_level=RiskLevel.LOW,
                evidence=str(sorted(extra_keys)),
                remediation="Remove unknown fields or update to the latest manifest schema.",
                fp_likelihood=0.1,
            ))

        # --- 5. Zero-capability check ---
        zero_cap = _check_no_capabilities(manifest.capabilities)
        if zero_cap:
            findings.append(zero_cap)

        # --- 6. Per-capability checks ---
        per_capability_risks: dict[str, str] = {}
        for cap in manifest.capabilities:
            base_risk = CAPABILITY_RISK_MAP[cap.type]
            per_capability_risks[cap.type.value] = base_risk.value

            # Dangerous singleton
            f = _check_dangerous_singleton(cap)
            if f:
                findings.append(f)

            # Over-broad scope
            f = _check_overbroad_scope(cap)
            if f:
                findings.append(f)

            # Trivial justification
            f = _check_trivial_justification(cap)
            if f:
                findings.append(f)

            # Filesystem escape
            if cap.type in _PATH_SCOPED_CAPABILITIES:
                f = _check_filesystem_scope_escape(cap)
                if f:
                    findings.append(f)

        # --- 7. Cross-capability combination checks ---
        combination_findings = _check_dangerous_combination(manifest.capabilities)
        findings.extend(combination_findings)

        result = self._build_result(
            findings=findings,
            manifest=manifest,
            start=start,
            per_capability_risks=per_capability_risks,
        )
        log.info(
            "s6_manifest.validate.complete",
            path=str(path),
            passed=result.passed,
            risk_level=result.risk_level.value,
            findings=len(findings),
            duration_ms=result.duration_ms,
        )
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _aggregate_risk(self, findings: list[Finding]) -> RiskLevel:
        """Highest risk level among all findings, or SAFE if none."""
        if not findings:
            return RiskLevel.SAFE
        order = self._risk_order
        worst = RiskLevel.SAFE
        for f in findings:
            if order.index(f.risk_level) > order.index(worst):
                worst = f.risk_level
        return worst

    def _build_result(
        self,
        findings: list[Finding],
        manifest: ManifestSchema | None,
        start: float,
        per_capability_risks: dict[str, str] | None = None,
    ) -> ValidationResult:
        from datetime import datetime, timezone
        risk_level = self._aggregate_risk(findings)
        risk_order = self._risk_order
        passed = (
            risk_order.index(risk_level) < risk_order.index(self.passing_threshold)
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        # Sort findings: most severe first
        sorted_findings = sorted(
            findings,
            key=lambda f: risk_order.index(f.risk_level),
            reverse=True,
        )
        return ValidationResult(
            passed=passed,
            risk_level=risk_level,
            findings=sorted_findings,
            manifest=manifest,
            per_capability_risks=per_capability_risks or {},
            duration_ms=duration_ms,
            validated_at=datetime.now(timezone.utc).isoformat(),
        )


# ---------------------------------------------------------------------------
# RuntimeEnforcer
# ---------------------------------------------------------------------------

class RuntimeEnforcer:
    """
    Enforces capability scopes at tool call time.

    Each tool call is checked against the capabilities declared in the
    manifest.  If the tool is not mapped to any capability type, or the
    requested resource is outside the declared scope, the call is denied.

    Scope matching:
    - Filesystem capabilities → ``fnmatch.fnmatch(path, scope)``
    - Network/browser capabilities → suffix-based domain matching
    - Others → any declared scope for that capability is a blanket allow

    Example::

        enforcer = RuntimeEnforcer(manifest)
        ok = enforcer.check_capability("web_fetch", {"url": "https://api.openai.com/v1/chat"})
    """

    def __init__(self, manifest: ManifestSchema) -> None:
        self.manifest = manifest
        # Pre-index: capability type → list of declared CapabilityDeclaration
        self._index: dict[CapabilityType, list[CapabilityDeclaration]] = {}
        for cap in manifest.capabilities:
            self._index.setdefault(cap.type, []).append(cap)

        log.info(
            "s6_manifest.runtime_enforcer.init",
            skill=manifest.name,
            capability_types=list(self._index.keys()),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_capability(self, tool_name: str, params: dict[str, Any]) -> bool:
        """
        Check whether a tool call is permitted by the manifest.

        Args:
            tool_name: Exact tool name as used in OpenClaw (e.g. ``"exec"``, ``"read"``).
            params:    Tool parameters dict (as passed to the tool call).

        Returns:
            ``True`` if the call is within declared, scoped capabilities;
            ``False`` if denied.
        """
        cap_type = TOOL_CAPABILITY_MAP.get(tool_name)
        if cap_type is None:
            log.warning(
                "s6_manifest.enforcer.unknown_tool",
                tool=tool_name,
                skill=self.manifest.name,
            )
            # Unknown tool: fail closed
            return False

        declared = self._index.get(cap_type)
        if not declared:
            log.info(
                "s6_manifest.enforcer.denied.undeclared",
                tool=tool_name,
                capability=cap_type.value,
                skill=self.manifest.name,
            )
            return False

        # Extract the resource identifier from params
        resource = self._extract_resource(tool_name, cap_type, params)

        # If no resource to scope-check, a declared capability is a blanket allow
        if resource is None:
            log.debug(
                "s6_manifest.enforcer.allowed.no_scope_needed",
                tool=tool_name,
                capability=cap_type.value,
                skill=self.manifest.name,
            )
            return True

        # Try each declared scope for a match
        for cap_decl in declared:
            if self._scope_matches(cap_type, resource, cap_decl):
                log.debug(
                    "s6_manifest.enforcer.allowed",
                    tool=tool_name,
                    capability=cap_type.value,
                    resource=resource,
                    matched_scope=cap_decl.scope,
                    skill=self.manifest.name,
                )
                return True

        log.warning(
            "s6_manifest.enforcer.denied.out_of_scope",
            tool=tool_name,
            capability=cap_type.value,
            resource=resource,
            declared_scopes=[c.scope for c in declared],
            skill=self.manifest.name,
        )
        return False

    def declared_types(self) -> list[CapabilityType]:
        """Return list of capability types declared in this manifest."""
        return list(self._index.keys())

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_resource(
        self,
        tool_name: str,
        cap_type: CapabilityType,
        params: dict[str, Any],
    ) -> str | None:
        """
        Extract the resource identifier (path, URL, …) from tool params.

        Returns ``None`` if no scope check is applicable for this tool.
        """
        if cap_type in _PATH_SCOPED_CAPABILITIES:
            # Filesystem tools: try common param names in order
            for key in ("path", "file_path", "file", "filepath"):
                if key in params:
                    return str(params[key])
            return None  # No path to check → blanket allow

        if cap_type in _URL_SCOPED_CAPABILITIES:
            for key in ("url", "targetUrl", "target_url", "uri"):
                if key in params:
                    return str(params[key])
            return None

        if cap_type == CapabilityType.MESSAGING_SEND:
            for key in ("target", "targets", "recipient", "channel"):
                if key in params:
                    val = params[key]
                    if isinstance(val, list):
                        return str(val[0]) if val else None
                    return str(val)
            return None

        if cap_type == CapabilityType.SHELL_EXEC:
            for key in ("command", "cmd"):
                if key in params:
                    return str(params[key])
            return None

        # For other capability types (memory, config, cron), no resource
        # scoping is applied — presence in manifest is sufficient.
        return None

    @staticmethod
    def _scope_matches(
        cap_type: CapabilityType,
        resource: str,
        cap_decl: CapabilityDeclaration,
    ) -> bool:
        """Dispatch to the appropriate scope-matching strategy."""
        scope = cap_decl.scope

        # check_list first (exact or fnmatch)
        if cap_decl.allow_list:
            if resource in cap_decl.allow_list:
                return True
            if any(fnmatch.fnmatch(resource, pat) for pat in cap_decl.allow_list):
                return True

        if cap_type in _PATH_SCOPED_CAPABILITIES:
            return _match_path(resource, scope)

        if cap_type in _URL_SCOPED_CAPABILITIES:
            return _match_domain(resource, scope)

        if cap_type == CapabilityType.MESSAGING_SEND:
            return _match_messaging_target(resource, scope)

        if cap_type == CapabilityType.SHELL_EXEC:
            return _match_shell_command(resource, scope)

        # Fallback: wildcard or equality
        return scope in _WILDCARD_SCOPES or fnmatch.fnmatch(resource, scope)


# ---------------------------------------------------------------------------
# Scope matching helpers
# ---------------------------------------------------------------------------

def _match_path(path: str, scope: str) -> bool:
    """
    Match a filesystem path against a scope pattern.

    Strategy (tried in order):
    1. Wildcard scope (``*``, ``**``, etc.) → allow all.
    2. ``fnmatch`` — works for same-directory patterns (``/tmp/skill-*.log``).
    3. Recursive glob: strip trailing ``/*`` / ``/**`` from the scope and
       use prefix matching so that ``/tmp/my-skill/*`` matches any nested
       path under ``/tmp/my-skill/``.
    4. Plain directory prefix: scope ``/tmp/my-skill/`` (with or without
       trailing slash) matches any path below it.
    """
    if scope in _WILDCARD_SCOPES:
        return True

    # Try fnmatch first (handles same-level wildcards like /tmp/*.json)
    if fnmatch.fnmatch(path, scope):
        return True

    # Strip trailing glob chars to get a base directory for prefix matching.
    # "/tmp/skill/*"  → "/tmp/skill"
    # "/tmp/skill/**" → "/tmp/skill"
    # "/tmp/skill/"   → "/tmp/skill"
    scope_base = scope.rstrip("/*").rstrip("/")
    if scope_base and path.startswith(scope_base + "/"):
        return True

    return False


def _match_domain(url_or_domain: str, scope: str) -> bool:
    """
    Match a URL or hostname against a domain scope pattern.

    Supports:
    - Exact domain: ``api.example.com``
    - Wildcard subdomain: ``*.example.com``
    - Wildcard scope: ``*``
    - Full URL scope: ``https://api.example.com/v1/*``
    """
    if scope in _WILDCARD_SCOPES:
        return True

    # If scope looks like a full URL pattern, match the whole URL
    if scope.startswith(("http://", "https://")):
        return fnmatch.fnmatch(url_or_domain, scope)

    # Extract hostname from the resource URL
    try:
        parsed = urlparse(url_or_domain)
        hostname = parsed.hostname or url_or_domain
    except Exception:
        hostname = url_or_domain

    # Exact match
    if hostname == scope:
        return True

    # Wildcard subdomain: *.example.com
    if scope.startswith("*."):
        parent = scope[2:]  # strip leading "*."
        return hostname == parent or hostname.endswith("." + parent)

    # fnmatch fallback
    return fnmatch.fnmatch(hostname, scope)


def _match_messaging_target(target: str, scope: str) -> bool:
    """Match a messaging target (phone, user, channel) against scope."""
    if scope in _WILDCARD_SCOPES:
        return True
    return fnmatch.fnmatch(target, scope) or target == scope


def _match_shell_command(command: str, scope: str) -> bool:
    """
    Match a shell command against a declared scope.

    Since shell commands are inherently dangerous, we use a conservative
    matching strategy: the scope can be a glob pattern for the command
    prefix (e.g. ``"git *"``), or ``*`` for unrestricted.
    """
    if scope in _WILDCARD_SCOPES:
        return True
    # First-token match: scope "git" allows all git subcommands
    first_token = command.strip().split()[0] if command.strip() else ""
    if first_token == scope:
        return True
    return fnmatch.fnmatch(command, scope)


# ---------------------------------------------------------------------------
# Template generator
# ---------------------------------------------------------------------------

# Patterns used to detect capability usage in source files
_CAPABILITY_DETECTORS: list[tuple[CapabilityType, re.Pattern[str]]] = [
    # shell_exec
    (CapabilityType.SHELL_EXEC, re.compile(
        r"subprocess\.|os\.system\s*\(|os\.popen\s*\(|"
        r"exec\s*\(|Popen\s*\(|execvp|run_shell|shell=True",
        re.IGNORECASE,
    )),
    # filesystem_write
    (CapabilityType.FILESYSTEM_WRITE, re.compile(
        r"open\s*\([^)]+['\"]w[ab]?['\"]|"
        r"\.write\s*\(|write_text\s*\(|write_bytes\s*\(|"
        r"shutil\.copy|shutil\.move|os\.makedirs|mkdir\s*\(",
        re.IGNORECASE,
    )),
    # filesystem_read
    (CapabilityType.FILESYSTEM_READ, re.compile(
        r"open\s*\([^)]+['\"]r[ab]?['\"]|"
        r"read_text\s*\(|read_bytes\s*\(|"
        r"os\.listdir\s*\(|Path\s*\(|glob\s*\(",
        re.IGNORECASE,
    )),
    # outbound_network
    (CapabilityType.OUTBOUND_NETWORK, re.compile(
        r"requests\.\w+\s*\(|httpx\.\w+\s*\(|aiohttp\.|"
        r"urllib\.request\.|web_fetch\s*\(|fetch\s*\(|"
        r"http\.get\s*\(|axios\.",
        re.IGNORECASE,
    )),
    # browser_control
    (CapabilityType.BROWSER_CONTROL, re.compile(
        r"playwright|selenium|puppeteer|pyppeteer|"
        r"browser\s*\(|webdriver\.|page\.goto\s*\(",
        re.IGNORECASE,
    )),
    # messaging_send
    (CapabilityType.MESSAGING_SEND, re.compile(
        r"message\s*\(|send_message\s*\(|whatsapp\.|telegram\.|"
        r"smtp\.|smtplib\.|sendmail\s*\(|twilio\.",
        re.IGNORECASE,
    )),
    # cron_scheduling
    (CapabilityType.CRON_SCHEDULING, re.compile(
        r"schedule\.\w+|APScheduler|crontab|"
        r"asyncio\.sleep.*while True|celery\.task|"
        r"@periodic_task",
        re.IGNORECASE,
    )),
    # config_change
    (CapabilityType.CONFIG_CHANGE, re.compile(
        r"write.*config|update.*settings|"
        r"configparser.*write|toml.*dump|yaml\.dump.*open",
        re.IGNORECASE,
    )),
    # memory_write
    (CapabilityType.MEMORY_WRITE, re.compile(
        r"vector.*store\.add|chroma.*add|pinecone\.upsert|"
        r"session.*save|memory.*write|qdrant.*upsert",
        re.IGNORECASE,
    )),
    # memory_read
    (CapabilityType.MEMORY_READ, re.compile(
        r"vector.*store\.search|chroma.*query|pinecone\.query|"
        r"session.*load|memory.*read|qdrant.*search",
        re.IGNORECASE,
    )),
]

_TEMPLATE_TEXT_EXTENSIONS: set[str] = {".py", ".js", ".ts", ".sh", ".rb"}


def generate_manifest_template(skill_path: str | Path) -> Path:
    """
    Analyse a skill directory and write a starter ``skill_manifest.json``.

    Scans ``*.py``, ``*.js``, and ``*.ts`` files for capability usage
    patterns and pre-populates the manifest with likely-needed capabilities.
    The justification fields are left as TODO placeholders to force the
    developer to fill in real explanations.

    Args:
        skill_path: Root directory of the skill.

    Returns:
        Path to the written ``skill_manifest.json``.

    Raises:
        ValueError: If ``skill_path`` does not exist or is not a directory.
    """
    path = Path(skill_path).resolve()
    if not path.exists() or not path.is_dir():
        raise ValueError(f"Skill path does not exist or is not a directory: {path}")

    detected: dict[CapabilityType, list[str]] = {}  # type → list of evidence snippets

    source_files = [
        f for f in path.rglob("*")
        if f.is_file() and f.suffix.lower() in _TEMPLATE_TEXT_EXTENSIONS
        and f.stat().st_size < 1_048_576  # 1 MB guard
    ]

    log.info("s6_manifest.generate_template.scanning", path=str(path), files=len(source_files))

    for src_file in source_files:
        try:
            content = src_file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        for cap_type, pattern in _CAPABILITY_DETECTORS:
            m = pattern.search(content)
            if m:
                snippet = m.group(0)[:80]
                detected.setdefault(cap_type, []).append(
                    f"{src_file.relative_to(path)}: {snippet!r}"
                )

    # Build capability list, sorted by risk (most dangerous last so manifest reads least-scary-first)
    risk_order = [
        RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM,
        RiskLevel.HIGH, RiskLevel.CRITICAL,
    ]
    capabilities = []
    for cap_type in sorted(
        detected.keys(),
        key=lambda ct: risk_order.index(CAPABILITY_RISK_MAP[ct]),
    ):
        evidences = detected[cap_type]
        capabilities.append({
            "type": cap_type.value,
            "scope": _suggest_scope(cap_type),
            "justification": (
                f"TODO: Explain why {cap_type.value} is required. "
                f"Detected usage: {evidences[0]}"
            ),
        })

    skill_name = path.name.lower().replace(" ", "-")
    manifest = {
        "name": skill_name,
        "version": "0.1.0",
        "publisher": "TODO: your-org-name",
        "description": f"TODO: Describe what {skill_name} does.",
        "homepage": "",
        "min_amc_version": "0.8.0",
        "capabilities": capabilities,
        "_generated_by": "amc shield s6_manifest generate_manifest_template",
        "_detected_from": [str(f.relative_to(path)) for f in source_files],
    }

    out_path = path / "skill_manifest.json"
    out_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    log.info(
        "s6_manifest.generate_template.done",
        output=str(out_path),
        capabilities_detected=len(capabilities),
        capability_types=[c["type"] for c in capabilities],
    )
    return out_path


def _suggest_scope(cap_type: CapabilityType) -> str:
    """Return a sensible default scope suggestion for each capability type."""
    suggestions = {
        CapabilityType.FILESYSTEM_READ:  "/Users/<user>/.openclaw/workspace/<skill-name>/*",
        CapabilityType.FILESYSTEM_WRITE: "/tmp/amc-<skill-name>/*",
        CapabilityType.SHELL_EXEC:       "TODO: restrict to specific command (e.g. 'git *')",
        CapabilityType.BROWSER_CONTROL:  "*.example.com",
        CapabilityType.OUTBOUND_NETWORK: "api.example.com",
        CapabilityType.MESSAGING_SEND:   "TODO: specific channel or user pattern",
        CapabilityType.CRON_SCHEDULING:  "TODO: describe schedule (e.g. 'every 1h')",
        CapabilityType.CONFIG_CHANGE:    "TODO: restrict to specific config key/file",
        CapabilityType.MEMORY_READ:      "amc:memory:<skill-name>:*",
        CapabilityType.MEMORY_WRITE:     "amc:memory:<skill-name>:*",
    }
    return suggestions.get(cap_type, "*")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def cli_validate(args: Any) -> int:
    """
    CLI entry point for ``amc shield manifest validate <path>``.

    Args:
        args: argparse Namespace with at least ``args.manifest`` (path string)
              and optionally ``args.json`` (bool, output as JSON).

    Returns:
        Exit code: 0 = passed, 1 = failed, 2 = error.
    """
    import sys

    manifest_path = getattr(args, "manifest", None)
    as_json = getattr(args, "json", False)

    if not manifest_path:
        print("ERROR: No manifest path provided.", file=sys.stderr)
        return 2

    validator = ManifestValidator()
    result = validator.validate(manifest_path)

    if as_json:
        print(result.model_dump_json(indent=2))
        return 0 if result.passed else 1

    # Human-readable output
    _RISK_ICONS = {
        RiskLevel.SAFE:     "✅",
        RiskLevel.LOW:      "🟡",
        RiskLevel.MEDIUM:   "🟠",
        RiskLevel.HIGH:     "🔴",
        RiskLevel.CRITICAL: "🚨",
    }
    _PASS_ICON = "✅ PASSED" if result.passed else "❌ FAILED"

    print()
    print(f"  AMC Shield — S6 Manifest Validation Report")
    print(f"  {'─' * 50}")
    print(f"  Manifest  : {manifest_path}")
    print(f"  Result    : {_PASS_ICON}")
    print(f"  Risk Level: {_RISK_ICONS.get(result.risk_level, '?')} {result.risk_level.value.upper()}")
    print(f"  Findings  : {len(result.findings)}")
    print(f"  Duration  : {result.duration_ms} ms")

    if result.manifest:
        m = result.manifest
        print()
        print(f"  Skill     : {m.name}  v{m.version}  ({m.publisher})")
        print(f"  Capabilities declared: {len(m.capabilities)}")
        if m.capabilities:
            for cap in m.capabilities:
                base_risk = CAPABILITY_RISK_MAP[cap.type]
                icon = _RISK_ICONS.get(base_risk, "?")
                print(f"    {icon} {cap.type.value:<22} scope={cap.scope!r}")

    if result.findings:
        print()
        print(f"  Findings:")
        for i, f in enumerate(result.findings, 1):
            icon = _RISK_ICONS.get(f.risk_level, "?")
            print(f"  {i:>2}. {icon} [{f.rule_id}] {f.title}")
            print(f"      {f.description}")
            if f.evidence:
                print(f"      Evidence   : {f.evidence[:100]}")
            if f.remediation:
                print(f"      Remediation: {f.remediation}")
            print()

    if result.per_capability_risks:
        print(f"  Per-capability base risks:")
        for cap_type, risk_val in result.per_capability_risks.items():
            icon = _RISK_ICONS.get(RiskLevel(risk_val), "?")
            print(f"    {icon} {cap_type:<22} → {risk_val}")

    print()
    return 0 if result.passed else 1
