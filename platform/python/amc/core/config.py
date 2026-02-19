"""Pydantic settings for AMC Platform.

Includes feature toggles, security policy settings, and paths.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Runtime
    app_name: str = "AMC Platform"
    env: str = Field(default="dev", alias="AMC_ENV")
    debug: bool = False
    log_level: str = "INFO"
    log_json: bool = False

    # API / server
    api_host: str = "0.0.0.0"
    api_port: int = 8080
    api_reload: bool = False
    api_workers: int = 1
    api_secret: str = ""

    # Storage / file paths
    workspace_dir: Path = Field(default_factory=lambda: Path.home() / ".openclaw" / "workspace")
    receipts_db: Path = Field(default_factory=lambda: Path("amc_receipts.db"))
    logs_dir: Path = Field(default_factory=lambda: Path("./logs"))
    cache_dir: Path = Field(default_factory=lambda: Path("./.amc_cache"))
    receipts_export_path: Path = Field(default_factory=lambda: Path("./exports/amc_receipts.jsonl"))

    # Module enable / disable flags
    module_shield_enabled: bool = True
    module_enforce_enabled: bool = True
    module_vault_enabled: bool = True
    module_watch_enabled: bool = True
    module_score_enabled: bool = True
    module_api_enabled: bool = True
    module_scanner_enabled: bool = True
    module_policy_enabled: bool = True

    # Product submodules
    module_product_enabled: bool = True
    module_product_features_enabled: bool = True
    module_product_metering_enabled: bool = True
    module_product_feedback_enabled: bool = True
    module_product_analytics_enabled: bool = True
    module_product_versions_enabled: bool = True
    module_product_tool_contract_enabled: bool = True
    module_product_failures_enabled: bool = True

    # Policy/firewall settings
    policy_preset: str = "enterprise-secure"
    policy_strict_mode: bool = True
    policy_allow_hostile_exec: bool = False
    policy_max_risk_level: str = "critical"

    # Scanner and detector settings
    shield_scan_timeout_ms: int = 5000
    shield_max_file_size: int = 1024 * 1024
    shield_max_skill_files: int = 1000

    # DLP settings
    dlp_redact_emails: bool = True
    dlp_redact_phones: bool = True
    dlp_entropy_scan: bool = True
    dlp_entropy_min_length: int = 20

    # Watch / receipts
    watch_chain_tamper_hard_fail: bool = True
    watch_append_only: bool = True

    # Score module
    score_max_questions: int = 6
    score_default_score_name: str = "safety-confidence"

    # Paths normalization
    model_config = SettingsConfigDict(
        env_prefix="AMC_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


def _ensure_directories(cfg: Settings) -> None:
    for p in (cfg.logs_dir, cfg.cache_dir, cfg.receipts_export_path.parent):
        p.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cfg = Settings()
    _ensure_directories(cfg)
    return cfg


# Backwards-compatible singleton alias
settings = get_settings()
