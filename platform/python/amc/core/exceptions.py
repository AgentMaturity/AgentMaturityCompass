"""Custom exception hierarchy for AMC Platform."""

from __future__ import annotations


class AMCError(Exception):
    """Base exception for all AMC errors."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class ScanError(AMCError):
    """Raised when a scanner (S1/S10) cannot complete."""


class PolicyViolationError(AMCError):
    """Raised when policy evaluation blocks or requires step-up."""

    def __init__(self, message: str, reasons: list[str] | None = None) -> None:
        super().__init__(message, code="POLICY_VIOLATION")
        self.reasons = reasons or []


class AuthorizationError(AMCError):
    """Raised when a session/tool call is unauthorized."""


class ReceiptError(AMCError):
    """Raised when receipts cannot be created/appended/verified."""


class VerificationError(ReceiptError):
    """Raised when hash chain verification fails."""


class ValidationError(AMCError):
    """Raised when input payloads are invalid / malformed."""
