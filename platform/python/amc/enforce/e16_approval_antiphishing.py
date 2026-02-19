"""
e16_approval_antiphishing.py — Approval Anti-Phishing UI for Step-Up Actions

Renders human-readable approval cards for risky actions, with type-confirmation
challenges to prevent blind approvals. Supports Markdown, HTML, plain text, and
Slack Block Kit output formats.

Usage::

    from amc.enforce.e16_approval_antiphishing import (
        PendingAction, ApprovalCardRenderer,
    )
    from amc.core.models import RiskLevel

    action = PendingAction(
        action_type="payment",
        description="Wire transfer to vendor",
        risk_level=RiskLevel.HIGH,
        parameters={"amount": 50000, "currency": "INR", "payee": "Acme Corp"},
        tainted_inputs=["email_body"],
    )
    renderer = ApprovalCardRenderer()
    card = renderer.render_approval_card(action)
    print(renderer.render_markdown(card))

    # User responds with the challenge value to approve
    validation = renderer.validate_approval_response(card, "50000")
    assert validation.challenge_passed

    # Approve with limits
    validation = renderer.validate_approval_response(card, "approve max:10000")
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from html import escape as html_escape
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel, PolicyDecision  # noqa: F401

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class TypeConfirmationChallenge(BaseModel):
    """A challenge the user must type to confirm the action."""
    challenge_text: str
    expected_value: str
    case_sensitive: bool = False
    field_name: str


class PendingAction(BaseModel):
    """An action awaiting human approval."""
    action_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action_type: str
    description: str
    risk_level: RiskLevel
    parameters: dict[str, Any] = {}
    tainted_inputs: list[str] = []
    evidence: list[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None
    auto_deny_seconds: int = 300


class ApprovalCard(BaseModel):
    """Rendered approval card ready for display."""
    action: PendingAction
    intent_summary: str
    risk_badge: str
    tainted_warning: str | None = None
    detail_preview: str
    challenge: TypeConfirmationChallenge | None = None
    time_remaining_display: str
    allows_limits: bool = True
    limit_options: dict[str, Any] = {}


class ApprovalValidation(BaseModel):
    """Result of validating a user's approval response."""
    action_id: str
    challenge_passed: bool
    user_typed_value: str | None = None
    validated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    limits_applied: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------

_RISK_BADGES: dict[RiskLevel, str] = {
    RiskLevel.SAFE: "✅ SAFE",
    RiskLevel.LOW: "🟢 LOW",
    RiskLevel.MEDIUM: "🟡 MEDIUM",
    RiskLevel.HIGH: "🔴 HIGH",
    RiskLevel.CRITICAL: "⛔ CRITICAL",
}


class ApprovalCardRenderer:
    """Builds and renders approval cards for step-up actions."""

    # ---- public API -------------------------------------------------------

    def render_approval_card(self, action: PendingAction) -> ApprovalCard:
        """Create an ApprovalCard from a PendingAction."""
        logger.info("rendering_approval_card", action_id=action.action_id, action_type=action.action_type)

        badge = _RISK_BADGES.get(action.risk_level, "🟡 MEDIUM")
        tainted = (
            f"⚠️ Untrusted content influenced this action: {', '.join(action.tainted_inputs)}"
            if action.tainted_inputs else None
        )
        remaining_sec = self._seconds_remaining(action)
        challenge = self._generate_challenge(action)

        card = ApprovalCard(
            action=action,
            intent_summary=self._generate_intent_summary(action),
            risk_badge=badge,
            tainted_warning=tainted,
            detail_preview=self._generate_detail_preview(action),
            challenge=challenge,
            time_remaining_display=self._format_time_remaining(remaining_sec),
            allows_limits=action.action_type in {"payment", "message", "exec"},
            limit_options=self._build_limit_options(action),
        )
        logger.info("approval_card_rendered", action_id=action.action_id)
        return card

    # ---- renderers --------------------------------------------------------

    def render_markdown(self, card: ApprovalCard) -> str:
        """Telegram-friendly Markdown."""
        lines = [
            f"**{card.risk_badge} — Action Approval Required**",
            "",
            f"**Intent:** {card.intent_summary}",
            f"**Risk:** {card.risk_badge}",
        ]
        if card.tainted_warning:
            lines.append(f"\n{card.tainted_warning}")
        lines += ["", "```", card.detail_preview, "```"]
        if card.challenge:
            lines += [
                "",
                f"🔐 **{card.challenge.challenge_text}**",
                f"Type the {card.challenge.field_name} to confirm.",
            ]
        lines.append(f"\n⏱ {card.time_remaining_display}")
        if card.allows_limits:
            lines.append("_Tip: reply `approve max:<value>` to set a limit._")
        return "\n".join(lines)

    def render_html(self, card: ApprovalCard) -> str:
        """Styled HTML card."""
        warn = (
            f'<div style="background:#fff3cd;padding:8px;border-radius:4px;margin:8px 0">'
            f'{html_escape(card.tainted_warning)}</div>'
            if card.tainted_warning else ""
        )
        challenge_html = ""
        if card.challenge:
            challenge_html = (
                f'<div style="margin-top:12px;padding:8px;background:#f0f0f0;border-radius:4px">'
                f'🔐 <strong>{html_escape(card.challenge.challenge_text)}</strong><br>'
                f'<em>Type the {html_escape(card.challenge.field_name)} to confirm.</em></div>'
            )
        return (
            f'<div style="border:2px solid #ccc;border-radius:8px;padding:16px;max-width:480px;font-family:sans-serif">'
            f'<h3>{html_escape(card.risk_badge)} — Action Approval Required</h3>'
            f'<p><strong>Intent:</strong> {html_escape(card.intent_summary)}</p>'
            f'{warn}'
            f'<pre style="background:#f8f8f8;padding:8px;border-radius:4px;overflow-x:auto">'
            f'{html_escape(card.detail_preview)}</pre>'
            f'{challenge_html}'
            f'<p style="color:#666">⏱ {html_escape(card.time_remaining_display)}</p>'
            f'</div>'
        )

    def render_plain_text(self, card: ApprovalCard) -> str:
        """WhatsApp-friendly plain text."""
        lines = [
            f"{card.risk_badge} — ACTION APPROVAL REQUIRED",
            "",
            f"Intent: {card.intent_summary}",
            f"Risk: {card.risk_badge}",
        ]
        if card.tainted_warning:
            lines.append(f"\n{card.tainted_warning}")
        lines += ["", card.detail_preview]
        if card.challenge:
            lines += ["", f"🔐 {card.challenge.challenge_text}", f"Type the {card.challenge.field_name} to confirm."]
        lines.append(f"\n⏱ {card.time_remaining_display}")
        if card.allows_limits:
            lines.append('Tip: reply "approve max:<value>" to set a limit.')
        return "\n".join(lines)

    def render_slack_blocks(self, card: ApprovalCard) -> list[dict[str, Any]]:
        """Slack Block Kit JSON blocks."""
        blocks: list[dict[str, Any]] = [
            {"type": "header", "text": {"type": "plain_text", "text": f"{card.risk_badge} — Action Approval Required"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Intent:* {card.intent_summary}\n*Risk:* {card.risk_badge}"}},
        ]
        if card.tainted_warning:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": card.tainted_warning}})
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"```{card.detail_preview}```"}})
        if card.challenge:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"🔐 *{card.challenge.challenge_text}*\nType the {card.challenge.field_name} to confirm."},
            })
        blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text": f"⏱ {card.time_remaining_display}"}]})
        if card.allows_limits:
            blocks.append({
                "type": "actions",
                "elements": [
                    {"type": "button", "text": {"type": "plain_text", "text": "✅ Approve"}, "style": "primary", "action_id": "approve"},
                    {"type": "button", "text": {"type": "plain_text", "text": "❌ Deny"}, "style": "danger", "action_id": "deny"},
                ],
            })
        return blocks

    # ---- validation -------------------------------------------------------

    def validate_approval_response(self, card: ApprovalCard, user_response: str) -> ApprovalValidation:
        """Validate user's typed response against the challenge."""
        logger.info("validating_approval", action_id=card.action.action_id)
        response = user_response.strip()

        # Parse limits: "approve max:1000 max_recipients:5"
        limits: dict[str, Any] = {}
        limit_matches = re.findall(r"(\w+):(\S+)", response)
        for key, val in limit_matches:
            if key in ("max", "max_recipients", "max_amount", "max_files"):
                try:
                    limits[key] = int(val)
                except ValueError:
                    limits[key] = val

        # Strip "approve" prefix and limit tokens to get the typed value
        clean = re.sub(r"(?i)^approve\s*", "", response)
        clean = re.sub(r"\w+:\S+", "", clean).strip()

        challenge_passed = False
        typed_value = clean or None

        if card.challenge is None:
            # No challenge required — auto-pass
            challenge_passed = True
        else:
            expected = card.challenge.expected_value
            actual = clean
            if card.challenge.case_sensitive:
                challenge_passed = actual == expected
            else:
                challenge_passed = actual.lower() == expected.lower()

        validation = ApprovalValidation(
            action_id=card.action.action_id,
            challenge_passed=challenge_passed,
            user_typed_value=typed_value,
            limits_applied=limits,
        )
        logger.info(
            "approval_validated",
            action_id=card.action.action_id,
            passed=challenge_passed,
            limits=limits,
        )
        return validation

    # ---- private helpers --------------------------------------------------

    def _generate_intent_summary(self, action: PendingAction) -> str:
        p = action.parameters
        mapping: dict[str, str] = {
            "payment": f"Send {p.get('currency', '₹')}{p.get('amount', '?')} to {p.get('payee', 'unknown')}",
            "message": f"Send message to {p.get('recipient_count', len(p.get('recipients', [])))} recipient(s)",
            "file_write": f"Modify file {p.get('path', p.get('file', '?'))}",
            "file_delete": f"Delete file {p.get('path', p.get('file', '?'))}",
            "exec": f"Run command: {str(p.get('command', '?'))[:80]}",
            "api_call": f"Call API: {p.get('method', 'GET')} {p.get('url', '?')}",
        }
        summary = mapping.get(action.action_type, f"{action.action_type}: {action.description[:100]}")
        logger.debug("intent_summary_generated", action_type=action.action_type, summary=summary)
        return summary

    def _generate_detail_preview(self, action: PendingAction) -> str:
        p = action.parameters
        at = action.action_type

        if at == "payment":
            return (
                f"Amount : {p.get('currency', 'INR')} {p.get('amount', '?')}\n"
                f"Payee  : {p.get('payee', '?')}\n"
                f"Account: {p.get('account', 'N/A')}\n"
                f"Ref    : {p.get('reference', 'N/A')}"
            )
        if at == "message":
            recipients = p.get("recipients", [])
            body = str(p.get("body", ""))[:200]
            return (
                f"Recipients: {', '.join(recipients[:5])}"
                + (f" (+{len(recipients)-5} more)" if len(recipients) > 5 else "")
                + f"\nBody preview: {body}"
            )
        if at in ("file_write", "file_delete"):
            diff = p.get("diff", p.get("content", ""))
            if isinstance(diff, str) and len(diff) > 500:
                diff = diff[:500] + "\n... (truncated)"
            return f"File: {p.get('path', p.get('file', '?'))}\n{diff}"
        if at == "exec":
            cmd = str(p.get("command", "?"))
            return f"Command: {cmd[:300]}\nWorkdir: {p.get('cwd', 'N/A')}"
        if at == "api_call":
            return f"{p.get('method', 'GET')} {p.get('url', '?')}\nHeaders: {len(p.get('headers', {}))} set"

        # Fallback
        preview_items = [f"{k}: {str(v)[:100]}" for k, v in list(p.items())[:10]]
        return "\n".join(preview_items) if preview_items else action.description[:300]

    def _generate_challenge(self, action: PendingAction) -> TypeConfirmationChallenge | None:
        p = action.parameters
        at = action.action_type

        if at == "payment":
            amount = str(p.get("amount", ""))
            if amount:
                return TypeConfirmationChallenge(
                    challenge_text=f"Type the payment amount ({amount}) to confirm",
                    expected_value=amount,
                    field_name="amount",
                )
        elif at == "message":
            recipients = p.get("recipients", [])
            if recipients:
                first = str(recipients[0])
                return TypeConfirmationChallenge(
                    challenge_text=f"Type the first recipient ({first}) to confirm",
                    expected_value=first,
                    field_name="recipient",
                )
        elif at == "exec":
            cmd = str(p.get("command", ""))
            snippet = cmd.split()[0] if cmd.split() else cmd[:20]
            if snippet:
                return TypeConfirmationChallenge(
                    challenge_text=f"Type the command name ({snippet}) to confirm",
                    expected_value=snippet,
                    field_name="command",
                )
        elif at in ("file_write", "file_delete"):
            path = str(p.get("path", p.get("file", "")))
            if path:
                short = path.rsplit("/", 1)[-1] if "/" in path else path
                return TypeConfirmationChallenge(
                    challenge_text=f"Type the filename ({short}) to confirm",
                    expected_value=short,
                    field_name="filename",
                )

        # HIGH/CRITICAL with no specific challenge: require action_type
        if action.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
            return TypeConfirmationChallenge(
                challenge_text=f"Type '{action.action_type}' to confirm this {action.risk_level.value}-risk action",
                expected_value=action.action_type,
                field_name="action type",
            )

        return None

    @staticmethod
    def _format_time_remaining(seconds: int) -> str:
        if seconds <= 0:
            return "⚠️ EXPIRED — action will be auto-denied"
        if seconds < 60:
            return f"{seconds}s remaining"
        minutes = seconds // 60
        secs = seconds % 60
        if minutes < 60:
            return f"{minutes}m {secs}s remaining"
        hours = minutes // 60
        mins = minutes % 60
        return f"{hours}h {mins}m remaining"

    @staticmethod
    def _seconds_remaining(action: PendingAction) -> int:
        now = datetime.now(timezone.utc)
        if action.expires_at:
            delta = (action.expires_at - now).total_seconds()
        else:
            elapsed = (now - action.created_at).total_seconds()
            delta = action.auto_deny_seconds - elapsed
        return max(0, int(delta))

    @staticmethod
    def _build_limit_options(action: PendingAction) -> dict[str, Any]:
        at = action.action_type
        if at == "payment":
            return {"max": "Maximum amount (e.g. max:1000)"}
        if at == "message":
            return {"max_recipients": "Maximum recipients (e.g. max_recipients:5)"}
        if at == "exec":
            return {"max": "Timeout seconds (e.g. max:60)"}
        return {}
