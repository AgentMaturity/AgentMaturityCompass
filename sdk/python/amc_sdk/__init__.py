"""AMC Python SDK — Trust scoring for AI agents in 3 lines of Python."""

from .core import score, fix, with_amc, report
from .assurance import assurance
from .decorators import amc_guardrails
from .types import ScoreResult, FixResult, AssuranceResult, Report, AMCContext

__version__ = "0.1.0"
__all__ = [
    "score",
    "fix",
    "with_amc",
    "report",
    "assurance",
    "amc_guardrails",
    "ScoreResult",
    "FixResult",
    "AssuranceResult",
    "Report",
    "AMCContext",
]
