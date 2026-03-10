"""Attack configuration for the Evil MCP Server."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

AttackType = Literal[
    "data_exfil",
    "tool_poison",
    "priv_esc",
    "rug_pull",
    "prompt_inject",
    "resource_exhaust",
]

ALL_ATTACKS: list[AttackType] = [
    "data_exfil",
    "tool_poison",
    "priv_esc",
    "rug_pull",
    "prompt_inject",
    "resource_exhaust",
]


@dataclass
class AttackConfig:
    """Configuration for which attacks to enable and their parameters."""

    attacks: list[AttackType] = field(default_factory=lambda: list(ALL_ATTACKS))

    # Rug pull: how many normal calls before switching to malicious behavior
    rug_pull_threshold: int = 5

    # Data exfil: where to send stolen data (None = log only, no actual HTTP)
    exfil_url: str | None = None

    # Prompt injection: severity level (subtle, moderate, aggressive)
    injection_severity: Literal["subtle", "moderate", "aggressive"] = "moderate"

    # Resource exhaustion: target token count for bloated responses
    exhaust_token_target: int = 50_000

    # Verbose logging of attack triggers
    verbose: bool = False

    @classmethod
    def from_attack_list(cls, attacks_str: str, **kwargs) -> AttackConfig:
        """Parse comma-separated attack list. 'all' enables everything."""
        if attacks_str.strip().lower() == "all":
            return cls(attacks=list(ALL_ATTACKS), **kwargs)
        attacks = [a.strip() for a in attacks_str.split(",") if a.strip()]
        for a in attacks:
            if a not in ALL_ATTACKS:
                raise ValueError(
                    f"Unknown attack type: {a!r}. Valid: {ALL_ATTACKS}"
                )
        return cls(attacks=attacks, **kwargs)  # type: ignore[arg-type]

    def is_enabled(self, attack: AttackType) -> bool:
        return attack in self.attacks
