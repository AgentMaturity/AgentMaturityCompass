"""
AMC Enforce — E25: Agent Config Risk Linter
===========================================

Purpose
-------
Static analysis for agent configuration files/dicts that flags dangerous
combinations of tool capabilities and settings before the agent starts.
Detects misconfigurations that could lead to security incidents such as
remote code execution via untrusted input, data exfiltration, or
persistence through cron-like mechanisms.

Usage
-----

.. code-block:: python

    from amc.enforce.e25_config_linter import ConfigRiskLinter, LintConfig
    from pathlib import Path

    linter = ConfigRiskLinter(LintConfig())
    result = linter.lint_dict({"tools": {"exec": True}, "ingress": {"allow_external": True}})
    if not result.passed:
        for risk in result.risks:
            print(f"[{risk.severity}] {risk.title}: {risk.description}")
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ConfigRisk(BaseModel):
    """A single identified risk within an agent configuration."""

    risk_id: str = Field(description="Unique identifier for this risk rule")
    severity: Literal["low", "medium", "high", "critical"] = Field(
        description="Severity level of the identified risk"
    )
    title: str = Field(description="Short human-readable title of the risk")
    description: str = Field(description="Detailed description of why this is risky")
    remediation: str = Field(description="Recommended remediation steps")
    config_path: str = Field(
        description="Dot-notation path to the offending config key(s)"
    )


class LintConfig(BaseModel):
    """Configuration controlling which risk checks are active."""

    check_exec_ingress: bool = Field(
        default=True,
        description="Check for exec enabled alongside untrusted ingress surfaces",
    )
    check_browser_download: bool = Field(
        default=True,
        description="Check for browser with downloads enabled and no domain allowlist",
    )
    check_control_plane: bool = Field(
        default=True,
        description="Check for gateway/control-plane tools with no approval gate",
    )
    check_cron_persistence: bool = Field(
        default=True,
        description="Check for cron scheduling enabled for untrusted session types",
    )
    custom_rules: list[dict[str, Any]] = Field(
        default_factory=list,
        description="User-supplied rule dicts with keys: id, severity, title, description, remediation, check_fn_src (not executed; reserved for future DSL)",
    )


class LintResult(BaseModel):
    """Result of linting a single configuration source."""

    config_source: str = Field(
        description="Name or path of the configuration source that was linted"
    )
    risks: list[ConfigRisk] = Field(
        default_factory=list,
        description="All risks identified in this configuration",
    )
    risk_score: float = Field(
        description="Aggregate numeric risk score (0.0–10.0); higher is riskier"
    )
    risk_level: str = Field(
        description="Human-readable risk tier: safe | low | medium | high | critical"
    )
    passed: bool = Field(
        description="True only when no high/critical risks were found"
    )
    checked_at: datetime = Field(
        description="UTC timestamp when the lint was performed"
    )

    @property
    def overall_risk(self) -> str:
        """Alias for risk_level for backward compatibility."""
        return self.risk_level


# ---------------------------------------------------------------------------
# Severity weights used for score computation
# ---------------------------------------------------------------------------
_SEVERITY_WEIGHTS: dict[str, float] = {
    "low": 1.0,
    "medium": 2.5,
    "high": 5.0,
    "critical": 10.0,
}

_SCORE_THRESHOLDS: list[tuple[float, str]] = [
    (0.0, "safe"),
    (1.0, "low"),
    (3.0, "medium"),
    (6.0, "high"),
    (9.0, "critical"),
]


def _compute_score(risks: list[ConfigRisk]) -> float:
    """Return a capped aggregate risk score between 0.0 and 10.0."""
    if not risks:
        return 0.0
    raw = sum(_SEVERITY_WEIGHTS[r.severity] for r in risks)
    return min(raw, 10.0)


def _score_to_level(score: float) -> str:
    """Convert a numeric score to a human-readable risk level."""
    level = "safe"
    for threshold, label in _SCORE_THRESHOLDS:
        if score >= threshold:
            level = label
    return level


# ---------------------------------------------------------------------------
# Helper accessors — safely traverse nested config dicts
# ---------------------------------------------------------------------------


def _get(config: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Safely traverse a nested dict using dot-notation key segments."""
    node: Any = config
    for key in keys:
        if not isinstance(node, dict):
            return default
        node = node.get(key, default)
        if node is default:
            return default
    return node


def _is_truthy(value: Any) -> bool:
    """Return True for truthy config values including string 'true'/'yes'/'1'."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "enabled", "on")
    if isinstance(value, int):
        return value != 0
    return bool(value)


# ---------------------------------------------------------------------------
# Individual rule implementations
# ---------------------------------------------------------------------------


def _check_exec_ingress(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when exec is enabled AND an external/untrusted messaging ingress
    surface exists.  An attacker who can send messages can craft payloads
    that trick the agent into executing arbitrary shell commands.
    """
    exec_enabled = (
        _is_truthy(_get(config, "tools", "exec"))
        or _is_truthy(_get(config, "tools", "exec", "enabled"))
        or "exec" in (_get(config, "tools", "enabled_tools") or [])
    )
    if not exec_enabled:
        return None

    allow_external = (
        _is_truthy(_get(config, "ingress", "allow_external"))
        or _is_truthy(_get(config, "messaging", "allow_external_senders"))
        or _get(config, "ingress", "trusted_senders") is None
        and _is_truthy(_get(config, "ingress", "enabled"))
    )
    if not allow_external:
        return None

    return ConfigRisk(
        risk_id="exec_enabled_with_untrusted_ingress",
        severity="critical",
        title="Exec tool enabled with untrusted message ingress",
        description=(
            "The exec tool is enabled and the messaging ingress surface accepts "
            "messages from external or unauthenticated senders.  A prompt-injection "
            "attack via an inbound message could result in arbitrary shell code "
            "execution on the host."
        ),
        remediation=(
            "Either disable the exec tool for this agent, restrict ingress to "
            "trusted sender allow-lists only, or add a human-approval gate before "
            "any exec invocation when external messages are present."
        ),
        config_path="tools.exec + ingress.allow_external",
    )


def _check_browser_download(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when the browser tool is enabled with downloads not explicitly blocked
    and no domain allow-list configured.
    """
    browser_enabled = (
        _is_truthy(_get(config, "tools", "browser"))
        or _is_truthy(_get(config, "tools", "browser", "enabled"))
        or "browser" in (_get(config, "tools", "enabled_tools") or [])
    )
    if not browser_enabled:
        return None

    domain_allowlist = _get(config, "tools", "browser", "domain_allowlist") or _get(
        config, "browser", "domain_allowlist"
    )
    download_blocked = _is_truthy(
        _get(config, "tools", "browser", "block_downloads")
    ) or _is_truthy(_get(config, "browser", "block_downloads"))

    if domain_allowlist or download_blocked:
        return None

    return ConfigRisk(
        risk_id="browser_download_no_allowlist",
        severity="high",
        title="Browser downloads enabled without domain allowlist",
        description=(
            "The browser tool can navigate to arbitrary URLs and downloads are not "
            "explicitly blocked.  Without a domain allowlist, a malicious actor or "
            "redirected page could trigger drive-by downloads of malware or exfiltrate "
            "data via browser-initiated file writes."
        ),
        remediation=(
            "Set tools.browser.domain_allowlist to an explicit list of approved "
            "domains, or set tools.browser.block_downloads = true.  For read-only "
            "browsing tasks, block all file downloads."
        ),
        config_path="tools.browser + browser.domain_allowlist + browser.block_downloads",
    )


def _check_control_plane(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when gateway configuration or restart tools are enabled without
    a human-approval requirement.
    """
    control_tools = {"gateway_config", "gateway_restart", "config_apply", "restart_service"}
    enabled_tools: list[str] = list(_get(config, "tools", "enabled_tools") or [])

    # Also check nested tool flags
    for tool in control_tools:
        if _is_truthy(_get(config, "tools", tool)):
            enabled_tools.append(tool)

    active_control = control_tools.intersection(enabled_tools)
    if not active_control:
        return None

    require_approval = _is_truthy(
        _get(config, "approval", "require_for_control_plane")
    ) or _is_truthy(_get(config, "tools", "require_human_approval"))
    if require_approval:
        return None

    return ConfigRisk(
        risk_id="control_plane_tools_open",
        severity="critical",
        title="Control-plane tools enabled without approval gate",
        description=(
            f"The following control-plane tools are enabled: {sorted(active_control)}. "
            "Without a human-approval gate, a compromised or misbehaving agent could "
            "reconfigure the gateway, restart services, or apply arbitrary config "
            "changes autonomously."
        ),
        remediation=(
            "Set approval.require_for_control_plane = true or "
            "tools.require_human_approval = true.  Alternatively, remove control-plane "
            "tools from the enabled_tools list and use a separate privileged agent with "
            "strict access controls."
        ),
        config_path=f"tools.enabled_tools ({sorted(active_control)}) + approval.require_for_control_plane",
    )


def _check_cron_persistence(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when cron/scheduled-task tools are enabled for untrusted session types.
    """
    cron_enabled = (
        _is_truthy(_get(config, "tools", "cron"))
        or _is_truthy(_get(config, "tools", "cron", "enabled"))
        or "cron_add" in (_get(config, "tools", "enabled_tools") or [])
        or "scheduler" in (_get(config, "tools", "enabled_tools") or [])
    )
    if not cron_enabled:
        return None

    session_types: list[str] = list(
        _get(config, "session", "allowed_types") or _get(config, "sessions", "types") or []
    )
    trusted_only_types = {"internal", "admin", "service", "trusted"}
    has_untrusted = not session_types or bool(
        set(session_types) - trusted_only_types
    )

    if not has_untrusted:
        return None

    return ConfigRisk(
        risk_id="cron_persistence_untrusted",
        severity="high",
        title="Cron/scheduler tool enabled for untrusted session types",
        description=(
            "The cron or scheduler tool is available in sessions that include "
            f"untrusted session types ({session_types or 'all types'}).  A malicious "
            "instruction could schedule persistent tasks that survive session termination, "
            "creating a foothold on the host system."
        ),
        remediation=(
            "Restrict cron/scheduler tools to admin or internal session types only "
            "by setting session.allowed_types = ['admin', 'internal'].  "
            "Alternatively, disable the cron tool and handle scheduling externally "
            "with appropriate access controls."
        ),
        config_path="tools.cron + session.allowed_types",
    )


def _check_debug_mode(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when debug or verbose mode is enabled, which can leak internal state,
    secrets, and system info.
    """
    debug_on = (
        _is_truthy(_get(config, "debug"))
        or _is_truthy(_get(config, "logging", "verbose"))
        or _is_truthy(_get(config, "logging", "debug"))
        or _is_truthy(_get(config, "verbose"))
        or str(_get(config, "log_level") or "").upper() in ("DEBUG", "TRACE")
    )
    if not debug_on:
        return None

    environment = str(_get(config, "environment") or _get(config, "env") or "").lower()
    is_non_prod = environment in ("dev", "development", "local", "test", "staging")
    if is_non_prod:
        return None

    return ConfigRisk(
        risk_id="debug_mode_production",
        severity="medium",
        title="Debug/verbose mode enabled in production-like environment",
        description=(
            "Debug or verbose logging is active.  This can cause the agent to emit "
            "sensitive information including API keys, user data, internal tool arguments, "
            "and system paths into logs or response payloads — creating an information "
            "leakage vector."
        ),
        remediation=(
            "Set debug = false and logging.verbose = false for production environments.  "
            "If detailed logging is needed, use structured audit logs with appropriate "
            "redaction rather than enabling debug mode."
        ),
        config_path="debug / logging.verbose / log_level",
    )


def _check_audit_logging(config: dict[str, Any]) -> ConfigRisk | None:
    """
    Flag when audit logging is explicitly disabled or entirely absent from config.
    """
    audit_config = _get(config, "audit") or _get(config, "audit_logging")
    if audit_config is None:
        # Audit config not specified at all
        return ConfigRisk(
            risk_id="no_audit_logging",
            severity="medium",
            title="Audit logging not configured",
            description=(
                "No audit logging configuration was found.  Without audit logging, "
                "there is no record of tool invocations, configuration changes, or "
                "security events — making forensic investigation impossible and "
                "compliance requirements unmet."
            ),
            remediation=(
                "Add an audit section to your configuration with at minimum: "
                "audit.enabled = true and audit.log_path set to a secure location. "
                "Consider shipping audit events to a SIEM (e.g., via AMC W1 receipts)."
            ),
            config_path="audit (missing)",
        )

    audit_enabled = _is_truthy(
        _get(config, "audit", "enabled") if isinstance(audit_config, dict) else audit_config
    )
    if not audit_enabled:
        return ConfigRisk(
            risk_id="no_audit_logging",
            severity="high",
            title="Audit logging explicitly disabled",
            description=(
                "Audit logging has been explicitly disabled in the configuration.  "
                "Tool invocations, privilege escalations, and security events will not "
                "be recorded.  This violates most compliance frameworks and prevents "
                "incident response."
            ),
            remediation=(
                "Set audit.enabled = true.  Audit logging should never be disabled in "
                "production environments.  If storage constraints are a concern, "
                "use log rotation rather than disabling audit entirely."
            ),
            config_path="audit.enabled",
        )
    return None


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class ConfigRiskLinter:
    """
    Static risk linter for agent configuration dicts, YAML/JSON files, and
    environment variable sets.

    Each enabled check is a pure function that receives the flattened config
    dict and returns a ConfigRisk if a problem is detected, or None if safe.
    """

    def __init__(self, config: LintConfig | None = None) -> None:
        """
        Initialise the linter with the provided LintConfig.

        Args:
            config: Controls which checks are active.  Defaults to all checks on.
        """
        self.config: LintConfig = config or LintConfig()
        log.info("config_linter_initialized", checks=self.config.model_dump())

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _run_checks(self, cfg: dict[str, Any]) -> list[ConfigRisk]:
        """Run all enabled checks against the provided config dict."""
        risks: list[ConfigRisk] = []

        if self.config.check_exec_ingress:
            r = _check_exec_ingress(cfg)
            if r:
                risks.append(r)
                log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        if self.config.check_browser_download:
            r = _check_browser_download(cfg)
            if r:
                risks.append(r)
                log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        if self.config.check_control_plane:
            r = _check_control_plane(cfg)
            if r:
                risks.append(r)
                log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        if self.config.check_cron_persistence:
            r = _check_cron_persistence(cfg)
            if r:
                risks.append(r)
                log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        # Debug-mode and audit checks are always active
        r = _check_debug_mode(cfg)
        if r:
            risks.append(r)
            log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        r = _check_audit_logging(cfg)
        if r:
            risks.append(r)
            log.warning("config_risk_detected", risk_id=r.risk_id, severity=r.severity)

        return risks

    @staticmethod
    def _build_result(source: str, risks: list[ConfigRisk]) -> LintResult:
        """Assemble a LintResult from a list of risks."""
        score = _compute_score(risks)
        level = _score_to_level(score)
        passed = not any(r.severity in ("high", "critical") for r in risks)
        return LintResult(
            config_source=source,
            risks=risks,
            risk_score=round(score, 2),
            risk_level=level,
            passed=passed,
            checked_at=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def lint_dict(self, config: dict[str, Any], source: str = "inline") -> LintResult:
        """
        Lint a configuration dictionary.

        Args:
            config: The agent configuration dict to analyse.
            source: A descriptive label for the config source (used in the result).

        Returns:
            LintResult containing all identified risks and aggregate score.
        """
        log.info("linting_config_dict", source=source)
        risks = self._run_checks(config)
        result = self._build_result(source, risks)
        log.info(
            "lint_complete",
            source=source,
            risk_count=len(risks),
            risk_score=result.risk_score,
            passed=result.passed,
        )
        return result

    def lint_file(self, path: Path) -> LintResult:
        """
        Load a YAML or JSON configuration file and lint it.

        Args:
            path: Filesystem path to a ``.yaml``, ``.yml``, or ``.json`` file.

        Returns:
            LintResult for the file contents.

        Raises:
            ValueError: If the file extension is not recognised or content is
                        not a mapping.
            FileNotFoundError: If the path does not exist.
        """
        log.info("linting_config_file", path=str(path))
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")

        suffix = path.suffix.lower()
        if suffix in (".yaml", ".yml"):
            try:
                import yaml  # type: ignore[import-untyped]
            except ImportError as exc:
                raise ImportError(
                    "PyYAML is required to lint YAML files. Install with: pip install pyyaml"
                ) from exc
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        elif suffix == ".json":
            with path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        else:
            raise ValueError(
                f"Unsupported config file extension '{suffix}'. Supported: .yaml, .yml, .json"
            )

        if not isinstance(data, dict):
            raise ValueError(
                f"Config file {path} must contain a YAML/JSON object (dict), got {type(data).__name__}"
            )

        return self.lint_dict(data, source=str(path))

    def lint_startup_env(self) -> LintResult:
        """
        Inspect the current process environment variables for dangerous
        configuration combinations.

        Maps well-known env vars to a synthetic config dict and runs the
        standard lint checks against it.

        Returns:
            LintResult derived from environment variable inspection.
        """
        log.info("linting_startup_env")
        env = os.environ

        def _env_bool(key: str) -> bool:
            return _is_truthy(env.get(key, "false"))

        enabled_tools: list[str] = []
        if _env_bool("AMC_TOOL_EXEC"):
            enabled_tools.append("exec")
        if _env_bool("AMC_TOOL_BROWSER"):
            enabled_tools.append("browser")
        if _env_bool("AMC_TOOL_CRON") or _env_bool("AMC_TOOL_CRON_ADD"):
            enabled_tools.append("cron_add")
        if _env_bool("AMC_TOOL_GATEWAY_CONFIG"):
            enabled_tools.append("gateway_config")
        if _env_bool("AMC_TOOL_GATEWAY_RESTART"):
            enabled_tools.append("gateway_restart")

        synthetic: dict[str, Any] = {
            "environment": env.get("AMC_ENV", env.get("ENV", env.get("ENVIRONMENT", ""))),
            "debug": _env_bool("AMC_DEBUG") or _env_bool("DEBUG"),
            "verbose": _env_bool("AMC_VERBOSE"),
            "log_level": env.get("AMC_LOG_LEVEL", env.get("LOG_LEVEL", "")),
            "tools": {
                "enabled_tools": enabled_tools,
                "exec": _env_bool("AMC_TOOL_EXEC"),
                "browser": {
                    "enabled": _env_bool("AMC_TOOL_BROWSER"),
                    "domain_allowlist": env.get("AMC_BROWSER_ALLOWLIST"),
                    "block_downloads": _env_bool("AMC_BROWSER_BLOCK_DOWNLOADS"),
                },
                "require_human_approval": _env_bool("AMC_REQUIRE_APPROVAL"),
            },
            "ingress": {
                "enabled": _env_bool("AMC_INGRESS_ENABLED"),
                "allow_external": _env_bool("AMC_INGRESS_ALLOW_EXTERNAL"),
                "trusted_senders": env.get("AMC_INGRESS_TRUSTED_SENDERS"),
            },
            "messaging": {
                "allow_external_senders": _env_bool("AMC_MESSAGING_ALLOW_EXTERNAL"),
            },
            "audit": {
                "enabled": _env_bool("AMC_AUDIT_ENABLED"),
                "log_path": env.get("AMC_AUDIT_LOG_PATH"),
            },
            "approval": {
                "require_for_control_plane": _env_bool("AMC_REQUIRE_APPROVAL"),
            },
            "session": {
                "allowed_types": (
                    [t.strip() for t in env["AMC_SESSION_TYPES"].split(",")]
                    if "AMC_SESSION_TYPES" in env
                    else []
                )
            },
        }

        return self.lint_dict(synthetic, source="environment")


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def lint_dict(
    config: dict[str, Any],
    source: str = "inline",
    lint_config: LintConfig | None = None,
) -> LintResult:
    """
    Convenience wrapper: lint a config dict with default or custom LintConfig.

    Args:
        config: Agent configuration dict.
        source: Label for the source.
        lint_config: Optional LintConfig; defaults to all checks enabled.

    Returns:
        LintResult.
    """
    return ConfigRiskLinter(lint_config).lint_dict(config, source=source)


def lint_file(path: Path, lint_config: LintConfig | None = None) -> LintResult:
    """
    Convenience wrapper: lint a YAML/JSON file with default or custom LintConfig.

    Args:
        path: Path to the config file.
        lint_config: Optional LintConfig.

    Returns:
        LintResult.
    """
    return ConfigRiskLinter(lint_config).lint_file(path)


def lint_startup_env(lint_config: LintConfig | None = None) -> LintResult:
    """
    Convenience wrapper: lint current process environment variables.

    Args:
        lint_config: Optional LintConfig.

    Returns:
        LintResult.
    """
    return ConfigRiskLinter(lint_config).lint_startup_env()


# Alias for backward compatibility
ConfigLinter = ConfigRiskLinter
