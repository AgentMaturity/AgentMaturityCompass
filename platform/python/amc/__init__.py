"""AMC Platform package.

Public package entry-point and re-exports for convenience.
"""

from importlib.metadata import PackageNotFoundError, version as _version

from .core.config import settings
from .core.exceptions import (
    AMCError,
    AuthorizationError,
    PolicyViolationError,
    ReceiptError,
    ScanError,
    ValidationError,
    VerificationError,
)
from .core.models import (
    ActionReceipt,
    Finding,
    PolicyDecision,
    RiskLevel,
    ScanResult,
    SessionTrust,
    ToolCategory,
    AMCRequest,
    AMCResponse,
)

try:
    __version__ = _version("amc-platform")
except PackageNotFoundError:
    __version__ = "0.0.0"

__all__ = [
    "__version__",
    "settings",
    "AMCError",
    "AuthorizationError",
    "PolicyViolationError",
    "ReceiptError",
    "ScanError",
    "ValidationError",
    "VerificationError",
    "ActionReceipt",
    "Finding",
    "PolicyDecision",
    "RiskLevel",
    "ScanResult",
    "SessionTrust",
    "ToolCategory",
    "AMCRequest",
    "AMCResponse",
]

