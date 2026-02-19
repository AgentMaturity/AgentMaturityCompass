"""
AMC Shield — S8: Channel Ingress Shield
========================================
Validates, classifies, and rate-limits every inbound message before any AMC
reasoning layer sees it.

Every channel message (WhatsApp, Slack, email, webhook, etc.) passes through
``IngressShield.check_message()`` first.  The shield answers three questions:

1. **Who is this sender?**
   Resolves to OWNER / TRUSTED / UNTRUSTED / HOSTILE using a precedence
   table built from ``IngressConfig`` at startup.

2. **Are they sending too fast?**
   Sliding-window rate limiting (no token-bucket drift) tracks timestamps per
   sender (hourly + daily) and per channel (hourly).  Persistent violators are
   automatically quarantined when ``quarantine_on_rate_limit=True``.

3. **Does this group message actually target AMC?**
   In group/channel contexts, the message must contain an ``@``-mention or one
   of the configured ``bot_names`` (case-insensitive) to be forwarded to AMC.

Pairing Flow (adding a new trusted sender)
------------------------------------------
::

    # 1. Operator generates a 6-digit code and sends it to the new user
    code = shield.generate_pairing_code()
    print(f"Share this code: {code}")

    # 2. The new user sends the code back over the channel
    # 3. Operator (or callback handler) approves it
    ok = shield.approve_pairing(code, sender_id="+15559999999")
    # ok == True → sender added to allowlist with TRUSTED tier

Quick Start
-----------
::

    from amc.shield.s8_ingress import (
        IngressShield,
        IngressConfig,
        RateLimitConfig,
        GroupPolicy,
    )

    config = IngressConfig(
        owner_ids=["+1555000DEMO"],
        sender_allowlist=["+15551234567"],
        rate_limits=RateLimitConfig(
            per_sender_per_hour=30,
            per_sender_per_day=200,
            per_channel_per_hour=100,
        ),
        group_policy=GroupPolicy(
            require_mention=True,
            bot_names=["amc", "bot"],
        ),
        hostile_senders=set(),
        quarantine_on_rate_limit=True,
    )
    shield = IngressShield(config)

    # Direct message from the owner — always allowed
    decision = shield.check_message(
        sender_id="+1555000DEMO",
        channel="whatsapp",
        message_content="What's my schedule today?",
    )
    # decision.allowed == True
    # decision.trust_tier == SessionTrust.OWNER

    # Group message without mention — silently skipped (not allowed, not hostile)
    decision = shield.check_message(
        sender_id="+15558887777",
        channel="slack-general",
        message_content="Hey everyone, what's for lunch?",
        group_id="C0123ABCDEF",
    )
    # decision.allowed == False
    # decision.quarantined == False
    # decision.reasons[0] → "Group message ... does not mention bot ..."

    # Group message WITH mention — forwarded to AMC
    decision = shield.check_message(
        sender_id="+15558887777",
        channel="slack-general",
        message_content="@amc summarise the thread above",
        group_id="C0123ABCDEF",
    )
    # decision.allowed == True
    # decision.trust_tier == SessionTrust.UNTRUSTED

Observability
-------------
All decisions are logged via ``structlog`` at INFO/WARNING/ERROR level with
full context (sender_id, channel, group_id, trust_tier, reasons).
Call ``shield.stats()`` for a runtime snapshot of counters and quarantine state.
"""
from __future__ import annotations

import random
import string
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import SessionTrust

__all__ = [
    "PairingRequest",
    "IngressDecision",
    "RateLimitConfig",
    "GroupPolicy",
    "IngressConfig",
    "IngressShield",
]

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_HOUR: float = 3600.0        # seconds
_DAY: float = 86400.0        # seconds
_PAIRING_TTL_SECONDS: int = 300   # 5-minute code expiry
_PAIRING_CODE_LENGTH: int = 6


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class PairingRequest(BaseModel):
    """Tracks a pending device/sender pairing attempt."""

    code: str
    created_at: datetime
    expires_at: datetime
    approved: bool = False

    @property
    def is_expired(self) -> bool:
        """Return True if the code has passed its TTL."""
        return datetime.now(timezone.utc) > self.expires_at


class IngressDecision(BaseModel):
    """
    Outcome of ``IngressShield.check_message()``.

    Attributes
    ----------
    allowed : bool
        Whether the message should be forwarded to AMC reasoning.
    trust_tier : SessionTrust
        Resolved trust level for the sender.
    reasons : list[str]
        Human-readable explanations for the decision.
    quarantined : bool
        True if the sender was quarantined as a result of this decision.
    timestamp : datetime
        UTC timestamp of this decision.
    """

    allowed: bool
    trust_tier: SessionTrust
    reasons: list[str] = Field(default_factory=list)
    quarantined: bool = False
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class RateLimitConfig(BaseModel):
    """
    Sliding-window rate-limit thresholds.

    All counts are exclusive upper bounds (≥ threshold → denied).
    """

    per_sender_per_hour: int = 30
    per_sender_per_day: int = 200
    per_channel_per_hour: int = 100


class GroupPolicy(BaseModel):
    """
    Policy applied to messages arriving in a group/channel context.

    When ``require_mention=True`` (default), the message must contain at
    least one of ``bot_names`` (case-insensitive substring match) to be
    forwarded to AMC.  DMs always bypass this check.
    """

    require_mention: bool = True
    bot_names: list[str] = Field(default_factory=lambda: ["amc", "bot"])


class IngressConfig(BaseModel):
    """
    Full configuration for ``IngressShield``.

    Attributes
    ----------
    owner_ids : list[str]
        Senders with OWNER trust (authenticated operator).
    sender_allowlist : list[str]
        Senders with TRUSTED tier (approved team members / integrations).
    rate_limits : RateLimitConfig
        Sliding-window thresholds.
    group_policy : GroupPolicy
        Mention/trigger requirements for group contexts.
    hostile_senders : set[str]
        Senders permanently blocked. Updated at runtime by ``_quarantine_sender``.
    quarantine_on_rate_limit : bool
        If True, automatically quarantine senders that breach rate limits.
    """

    owner_ids: list[str]
    sender_allowlist: list[str]
    rate_limits: RateLimitConfig = Field(default_factory=RateLimitConfig)
    group_policy: GroupPolicy = Field(default_factory=GroupPolicy)
    hostile_senders: set[str] = Field(default_factory=set)
    quarantine_on_rate_limit: bool = True

    model_config = {"arbitrary_types_allowed": True}


# ---------------------------------------------------------------------------
# IngressShield
# ---------------------------------------------------------------------------


class IngressShield:
    """
    Channel Ingress Shield — the first line of defence for all inbound messages.

    Instantiate once per process with an ``IngressConfig`` and call
    ``check_message()`` on every incoming event.

    Thread Safety
    -------------
    ``_rate_counters`` uses ``collections.deque`` which is not thread-safe for
    concurrent writes.  For high-throughput async deployments, wrap public
    methods with ``asyncio.Lock`` or replace the in-process counters with a
    Redis/Valkey sliding-window backend.

    Parameters
    ----------
    config : IngressConfig
        Shield configuration.  ``hostile_senders`` is mutated at runtime by
        ``_quarantine_sender()``; all other fields are treated as immutable.
    """

    def __init__(self, config: IngressConfig) -> None:
        self.config = config

        # ----------------------------------------------------------------
        # Build trust_tiers lookup: sender_id → SessionTrust
        # Precedence (applied in reverse so highest wins):
        #   UNTRUSTED < TRUSTED < OWNER < HOSTILE
        # ----------------------------------------------------------------
        self.trust_tiers: dict[str, SessionTrust] = {}

        for sid in config.sender_allowlist:
            self.trust_tiers[sid] = SessionTrust.TRUSTED

        for sid in config.owner_ids:
            self.trust_tiers[sid] = SessionTrust.OWNER  # owner trumps trusted

        for sid in config.hostile_senders:
            self.trust_tiers[sid] = SessionTrust.HOSTILE  # hostile trumps all

        # ----------------------------------------------------------------
        # Rate counters: key → deque of monotonic timestamps
        # Keys follow the convention:
        #   "sender:<sender_id>"   — per-sender events
        #   "channel:<channel>"    — per-channel events
        # ----------------------------------------------------------------
        self._rate_counters: dict[str, deque[float]] = defaultdict(deque)

        # Pending pairing codes: code_str → PairingRequest
        self._pending_pairings: dict[str, PairingRequest] = {}

        log.info(
            "ingress_shield.initialized",
            owners=len(config.owner_ids),
            allowlisted=len(config.sender_allowlist),
            hostile=len(config.hostile_senders),
            rate_limit_sender_hour=config.rate_limits.per_sender_per_hour,
            rate_limit_sender_day=config.rate_limits.per_sender_per_day,
            rate_limit_channel_hour=config.rate_limits.per_channel_per_hour,
            require_mention=config.group_policy.require_mention,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_message(
        self,
        sender_id: str,
        channel: str,
        message_content: str,
        group_id: str | None = None,
    ) -> IngressDecision:
        """
        Evaluate an inbound message and return an ``IngressDecision``.

        Decision pipeline (short-circuits on first denial):

        1. Trust-tier resolution
        2. HOSTILE → immediate block (no logging of message content)
        3. Rate-limit check (sliding window, sender + channel)
        4. Group-mention policy (only when ``group_id`` is provided)
        5. ALLOW — record event in rate counters

        Parameters
        ----------
        sender_id : str
            Canonical sender identifier (e.g. E.164 phone number, Slack UID).
        channel : str
            Channel name or ID (e.g. ``"whatsapp"``, ``"slack-general"``).
        message_content : str
            Raw text of the incoming message.
        group_id : str | None
            Group/channel ID for messages arriving in a group context.
            ``None`` indicates a direct/private message — group policy skipped.

        Returns
        -------
        IngressDecision
            Always returned (never raises).  Inspect ``.allowed`` first.
        """
        reasons: list[str] = []
        quarantined = False
        now = datetime.now(timezone.utc)

        # ----- Step 1: Trust tier resolution -----
        trust_tier = self._get_trust_tier(sender_id)

        # ----- Step 2: Immediate block for hostile senders -----
        if trust_tier == SessionTrust.HOSTILE:
            reasons.append(
                f"Sender '{sender_id}' is classified HOSTILE — message blocked."
            )
            log.warning(
                "ingress_shield.blocked_hostile",
                sender_id=sender_id,
                channel=channel,
                group_id=group_id,
                trust_tier=trust_tier.value,
            )
            return IngressDecision(
                allowed=False,
                trust_tier=trust_tier,
                reasons=reasons,
                quarantined=False,  # already quarantined; no new action
                timestamp=now,
            )

        # ----- Step 3: Rate limit check -----
        rate_ok, rate_reason = self._check_rate_limit(sender_id, channel)
        if not rate_ok:
            reasons.append(rate_reason)
            if self.config.quarantine_on_rate_limit:
                self._quarantine_sender(sender_id, reason=rate_reason)
                quarantined = True
                trust_tier = SessionTrust.HOSTILE
            log.warning(
                "ingress_shield.rate_limited",
                sender_id=sender_id,
                channel=channel,
                group_id=group_id,
                reason=rate_reason,
                quarantined=quarantined,
            )
            return IngressDecision(
                allowed=False,
                trust_tier=trust_tier,
                reasons=reasons,
                quarantined=quarantined,
                timestamp=now,
            )

        # ----- Step 4: Group-mention policy -----
        if group_id is not None:
            policy_ok, policy_reason = self._check_group_policy(
                message_content, group_id
            )
            if not policy_ok:
                reasons.append(policy_reason)
                log.info(
                    "ingress_shield.group_policy_skip",
                    sender_id=sender_id,
                    channel=channel,
                    group_id=group_id,
                    trust_tier=trust_tier.value,
                    reason=policy_reason,
                )
                # Silently skip — the message wasn't addressed to AMC.
                # Not hostile, not quarantined — just irrelevant.
                return IngressDecision(
                    allowed=False,
                    trust_tier=trust_tier,
                    reasons=reasons,
                    quarantined=False,
                    timestamp=now,
                )

        # ----- Step 5: Allow — record event -----
        self._record_event(sender_id, channel)
        reasons.append(
            f"Sender '{sender_id}' accepted as {trust_tier.value.upper()}."
        )

        log.info(
            "ingress_shield.allowed",
            sender_id=sender_id,
            channel=channel,
            group_id=group_id,
            trust_tier=trust_tier.value,
        )
        return IngressDecision(
            allowed=True,
            trust_tier=trust_tier,
            reasons=reasons,
            quarantined=False,
            timestamp=now,
        )

    def generate_pairing_code(self) -> str:
        """
        Generate a 6-digit numeric pairing code with a 5-minute TTL.

        The code is stored in ``_pending_pairings``.  Distribute it out-of-band
        to the new sender (e.g. via a separate verified channel) and call
        ``approve_pairing()`` once they echo it back.

        Expired pairings are pruned on each call to avoid unbounded growth.

        Returns
        -------
        str
            Zero-padded 6-digit code, e.g. ``"042391"``.

        Example
        -------
        ::

            code = shield.generate_pairing_code()
            # send `code` to the new user via a trusted side-channel
        """
        self._cleanup_expired_pairings()

        code = "".join(random.choices(string.digits, k=_PAIRING_CODE_LENGTH))
        # Ensure uniqueness in the (unlikely) case of collision
        while code in self._pending_pairings:
            code = "".join(random.choices(string.digits, k=_PAIRING_CODE_LENGTH))

        now = datetime.now(timezone.utc)
        pairing = PairingRequest(
            code=code,
            created_at=now,
            expires_at=now + timedelta(seconds=_PAIRING_TTL_SECONDS),
            approved=False,
        )
        self._pending_pairings[code] = pairing

        log.info(
            "ingress_shield.pairing_code_generated",
            code=code,
            expires_at=pairing.expires_at.isoformat(),
            ttl_seconds=_PAIRING_TTL_SECONDS,
        )
        return code

    def approve_pairing(self, code: str, sender_id: str) -> bool:
        """
        Validate a pairing code and promote the sender to TRUSTED tier.

        Validation steps:
        1. Code must exist in ``_pending_pairings``.
        2. Code must not have been used already (``approved == False``).
        3. Code must not be expired (``expires_at > now``).

        On success the sender is added to ``config.sender_allowlist`` and
        ``trust_tiers``.  If the sender was previously in ``hostile_senders``
        (e.g. false positive quarantine) they are un-quarantined.

        Parameters
        ----------
        code : str
            The 6-digit code previously generated by ``generate_pairing_code()``.
        sender_id : str
            Canonical ID of the sender claiming this code.

        Returns
        -------
        bool
            ``True`` if the sender was approved; ``False`` otherwise.
        """
        now = datetime.now(timezone.utc)
        pairing = self._pending_pairings.get(code)

        if pairing is None:
            log.warning(
                "ingress_shield.pairing_unknown_code",
                code=code,
                sender_id=sender_id,
            )
            return False

        if pairing.approved:
            log.warning(
                "ingress_shield.pairing_already_used",
                code=code,
                sender_id=sender_id,
                originally_approved_for=pairing.code,
            )
            return False

        if now > pairing.expires_at:
            log.warning(
                "ingress_shield.pairing_expired",
                code=code,
                sender_id=sender_id,
                expired_at=pairing.expires_at.isoformat(),
                now=now.isoformat(),
            )
            del self._pending_pairings[code]
            return False

        # Mark code as consumed
        pairing.approved = True
        self._pending_pairings[code] = pairing

        # Promote sender (only if not already at OWNER level)
        current_tier = self.trust_tiers.get(sender_id, SessionTrust.UNTRUSTED)
        if current_tier not in (SessionTrust.OWNER, SessionTrust.TRUSTED):
            self.trust_tiers[sender_id] = SessionTrust.TRUSTED

        if sender_id not in self.config.sender_allowlist:
            self.config.sender_allowlist.append(sender_id)

        # Un-quarantine if previously hostile
        if sender_id in self.config.hostile_senders:
            self.config.hostile_senders.discard(sender_id)
            log.info(
                "ingress_shield.pairing_unquarantined",
                sender_id=sender_id,
                code=code,
            )

        log.info(
            "ingress_shield.pairing_approved",
            code=code,
            sender_id=sender_id,
            trust_tier=self.trust_tiers[sender_id].value,
        )
        return True

    def stats(self) -> dict[str, Any]:
        """
        Return a runtime snapshot for dashboards and health checks.

        Returns
        -------
        dict
            Keys: ``owners``, ``trusted``, ``hostile``, ``pending_pairings``,
            ``rate_counter_keys``, ``config_summary``.
        """
        now = time.monotonic()
        cutoff_hour = now - _HOUR

        sender_keys = [
            k for k in self._rate_counters if k.startswith("sender:")
        ]
        hour_counts = {
            k: sum(1 for t in self._rate_counters[k] if t >= cutoff_hour)
            for k in sender_keys
        }

        return {
            "owners": len(self.config.owner_ids),
            "trusted": sum(
                1 for t in self.trust_tiers.values() if t == SessionTrust.TRUSTED
            ),
            "hostile": len(self.config.hostile_senders),
            "pending_pairings": {
                code: {
                    "expires_at": pr.expires_at.isoformat(),
                    "approved": pr.approved,
                }
                for code, pr in self._pending_pairings.items()
            },
            "rate_counter_keys": list(self._rate_counters.keys()),
            "sender_hour_counts": hour_counts,
            "config_summary": {
                "quarantine_on_rate_limit": self.config.quarantine_on_rate_limit,
                "require_mention": self.config.group_policy.require_mention,
                "bot_names": self.config.group_policy.bot_names,
                "rate_limits": self.config.rate_limits.model_dump(),
            },
        }

    # ------------------------------------------------------------------
    # Private Helpers
    # ------------------------------------------------------------------

    def _get_trust_tier(self, sender_id: str) -> SessionTrust:
        """
        Resolve the trust tier for a sender.

        Always re-checks ``config.hostile_senders`` (mutated at runtime by
        ``_quarantine_sender``) to ensure new quarantines take immediate effect
        without requiring a cache invalidation step.

        Precedence (highest → lowest):
          ``HOSTILE`` > ``OWNER`` > ``TRUSTED`` > ``UNTRUSTED``
        """
        if sender_id in self.config.hostile_senders:
            # Sync trust_tiers cache in case it fell out of date
            self.trust_tiers[sender_id] = SessionTrust.HOSTILE
            return SessionTrust.HOSTILE

        return self.trust_tiers.get(sender_id, SessionTrust.UNTRUSTED)

    def _check_rate_limit(
        self, sender_id: str, channel: str
    ) -> tuple[bool, str]:
        """
        Sliding-window rate-limit check (read-only — does not record the event).

        Three independent windows are checked:

        * **Sender / hour**: messages from ``sender_id`` in the last 60 minutes.
        * **Sender / day**: messages from ``sender_id`` in the last 24 hours.
        * **Channel / hour**: all messages in ``channel`` in the last 60 minutes.

        The event is recorded separately by ``_record_event()`` only when all
        checks pass, ensuring the counters remain accurate.

        Parameters
        ----------
        sender_id : str
            Sender to check.
        channel : str
            Channel to check.

        Returns
        -------
        tuple[bool, str]
            ``(True, "")`` if allowed; ``(False, reason)`` if denied.
        """
        now = time.monotonic()
        rl = self.config.rate_limits
        cutoff_hour = now - _HOUR
        cutoff_day = now - _DAY

        # ---- Per-sender checks ----
        sender_key = f"sender:{sender_id}"
        sender_ts = self._rate_counters[sender_key]

        # Prune to the largest window (day) — this also handles hour pruning
        # since any timestamp younger than 24h is retained for the hour count.
        self._prune_window(sender_ts, cutoff_day)

        hour_count = sum(1 for t in sender_ts if t >= cutoff_hour)
        if hour_count >= rl.per_sender_per_hour:
            return (
                False,
                (
                    f"Rate limit: sender '{sender_id}' sent {hour_count} messages "
                    f"in the last hour (limit: {rl.per_sender_per_hour})."
                ),
            )

        day_count = len(sender_ts)  # already pruned to day window
        if day_count >= rl.per_sender_per_day:
            return (
                False,
                (
                    f"Rate limit: sender '{sender_id}' sent {day_count} messages "
                    f"today (limit: {rl.per_sender_per_day})."
                ),
            )

        # ---- Per-channel checks ----
        channel_key = f"channel:{channel}"
        channel_ts = self._rate_counters[channel_key]
        self._prune_window(channel_ts, cutoff_hour)

        ch_count = len(channel_ts)
        if ch_count >= rl.per_channel_per_hour:
            return (
                False,
                (
                    f"Rate limit: channel '{channel}' received {ch_count} messages "
                    f"in the last hour (limit: {rl.per_channel_per_hour})."
                ),
            )

        return (True, "")

    def _record_event(self, sender_id: str, channel: str) -> None:
        """
        Append the current monotonic timestamp to the sender and channel
        rate-counter deques.  Called only after all gate checks pass.
        """
        now = time.monotonic()
        self._rate_counters[f"sender:{sender_id}"].append(now)
        self._rate_counters[f"channel:{channel}"].append(now)

    @staticmethod
    def _prune_window(ts_deque: deque[float], cutoff: float) -> None:
        """
        Remove timestamps older than ``cutoff`` from the *left* of the deque.

        Because events are appended in monotonically increasing order, all
        expired entries are always at the front — O(k) where k is the number
        of entries removed, not the total length.
        """
        while ts_deque and ts_deque[0] < cutoff:
            ts_deque.popleft()

    def _check_group_policy(
        self, message_content: str, group_id: str
    ) -> tuple[bool, str]:
        """
        Apply the group/channel mention policy to a message.

        When ``GroupPolicy.require_mention`` is ``True``, the message text must
        contain at least one string from ``GroupPolicy.bot_names`` as a
        case-insensitive substring.  This prevents AMC from processing every
        message in a busy group channel.

        Parameters
        ----------
        message_content : str
            The full raw text of the incoming message.
        group_id : str
            Group/channel identifier (used in denial reason for context).

        Returns
        -------
        tuple[bool, str]
            ``(True, "")`` if the policy is satisfied or not required;
            ``(False, reason)`` if the message should be skipped.
        """
        policy = self.config.group_policy

        if not policy.require_mention:
            return (True, "")

        content_lower = message_content.lower()
        for bot_name in policy.bot_names:
            if bot_name.lower() in content_lower:
                return (True, "")

        trigger_list = ", ".join(f"'{n}'" for n in policy.bot_names)
        return (
            False,
            (
                f"Group message in '{group_id}' does not mention bot "
                f"({trigger_list}) — skipped (not addressed to AMC)."
            ),
        )

    def _quarantine_sender(self, sender_id: str, reason: str) -> None:
        """
        Permanently add ``sender_id`` to the hostile set and update the
        in-process trust cache.

        Logged at ERROR level because quarantine is a high-severity security event.
        The hostile_senders set and trust_tiers dict are updated atomically
        (within CPython's GIL — use a lock for true multi-threaded setups).

        Parameters
        ----------
        sender_id : str
            The sender to quarantine.
        reason : str
            Human-readable explanation logged alongside the quarantine event.
        """
        self.config.hostile_senders.add(sender_id)
        self.trust_tiers[sender_id] = SessionTrust.HOSTILE

        log.error(
            "ingress_shield.sender_quarantined",
            sender_id=sender_id,
            reason=reason,
            hostile_count=len(self.config.hostile_senders),
        )

    def _cleanup_expired_pairings(self) -> int:
        """
        Remove expired (and unused) pairing requests from ``_pending_pairings``.

        Called automatically by ``generate_pairing_code()`` to prevent the dict
        from growing without bound in long-running processes.

        Returns
        -------
        int
            Number of entries removed.
        """
        now = datetime.now(timezone.utc)
        expired = [
            code
            for code, pr in self._pending_pairings.items()
            if not pr.approved and now > pr.expires_at
        ]
        for code in expired:
            del self._pending_pairings[code]

        if expired:
            log.debug(
                "ingress_shield.pairings_pruned",
                removed=len(expired),
                remaining=len(self._pending_pairings),
            )
        return len(expired)
