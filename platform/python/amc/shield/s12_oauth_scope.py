"""
s12_oauth_scope — OAuth Scope Drift and Integration Permission Reviewer
========================================================================

Tracks OAuth integrations, reviews scope permissions, detects drift,
and provides actionable revocation/rotation guidance.

Usage::

    from amc.shield.s12_oauth_scope import OAuthScopeReviewer

    reviewer = OAuthScopeReviewer()

    # Register an integration
    integration = reviewer.register_integration(
        provider="google",
        app_name="My Mail App",
        scopes=["gmail.readonly", "gmail.send", "drive", "contacts"],
    )

    # Review for excess permissions
    review = reviewer.review_integration(integration.integration_id)
    print(review.excess_scopes)       # scopes beyond minimal need
    print(review.recommendations)     # actionable advice

    # Detect drift when scopes change
    drift = reviewer.detect_drift(
        integration.integration_id,
        new_scopes=["gmail.readonly", "gmail.send", "drive", "admin.directory.user"],
    )
    print(drift.added_scopes)   # ['admin.directory.user']
    print(drift.removed_scopes) # ['contacts']

    # Get minimal scopes for a use case
    minimal = reviewer.recommend_minimal("google", "read_email")
    # ['gmail.readonly', 'userinfo.email']

    # Revocation steps
    print(reviewer.generate_revoke_instructions(integration.integration_id))

    # Schedule token rotation
    schedule = reviewer.schedule_rotation(integration.integration_id, interval_days=90)
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Scope Risk Database (50+ scopes)
# ---------------------------------------------------------------------------

SCOPE_RISK_DB: dict[str, RiskLevel] = {
    # Google (29)
    "gmail.readonly": RiskLevel.LOW,
    "gmail.send": RiskLevel.MEDIUM,
    "gmail.modify": RiskLevel.HIGH,
    "gmail.settings.basic": RiskLevel.HIGH,
    "gmail.compose": RiskLevel.MEDIUM,
    "drive.file": RiskLevel.LOW,
    "drive": RiskLevel.HIGH,
    "drive.metadata.readonly": RiskLevel.LOW,
    "calendar.readonly": RiskLevel.LOW,
    "calendar": RiskLevel.MEDIUM,
    "calendar.events": RiskLevel.MEDIUM,
    "contacts.readonly": RiskLevel.LOW,
    "contacts": RiskLevel.MEDIUM,
    "admin.directory.user": RiskLevel.CRITICAL,
    "admin.directory.user.readonly": RiskLevel.HIGH,
    "admin.directory.group": RiskLevel.CRITICAL,
    "spreadsheets": RiskLevel.LOW,
    "presentations": RiskLevel.LOW,
    "documents": RiskLevel.LOW,
    "cloud-platform": RiskLevel.CRITICAL,
    "compute": RiskLevel.CRITICAL,
    "storage": RiskLevel.HIGH,
    "bigquery": RiskLevel.HIGH,
    "pubsub": RiskLevel.MEDIUM,
    "userinfo.email": RiskLevel.LOW,
    "userinfo.profile": RiskLevel.LOW,
    "youtube.readonly": RiskLevel.LOW,
    "youtube.upload": RiskLevel.MEDIUM,
    "adsense.readonly": RiskLevel.MEDIUM,
    # Microsoft (14)
    "Mail.Read": RiskLevel.LOW,
    "Mail.Send": RiskLevel.MEDIUM,
    "Mail.ReadWrite": RiskLevel.HIGH,
    "Files.Read": RiskLevel.LOW,
    "Files.ReadWrite": RiskLevel.HIGH,
    "Files.ReadWrite.All": RiskLevel.CRITICAL,
    "Calendars.Read": RiskLevel.LOW,
    "Calendars.ReadWrite": RiskLevel.MEDIUM,
    "User.Read": RiskLevel.LOW,
    "User.ReadWrite.All": RiskLevel.CRITICAL,
    "Directory.Read.All": RiskLevel.HIGH,
    "Directory.ReadWrite.All": RiskLevel.CRITICAL,
    "Sites.Read.All": RiskLevel.MEDIUM,
    "Sites.ReadWrite.All": RiskLevel.HIGH,
    # Slack (7)
    "channels:read": RiskLevel.LOW,
    "channels:write": RiskLevel.MEDIUM,
    "chat:write": RiskLevel.MEDIUM,
    "users:read": RiskLevel.LOW,
    "admin": RiskLevel.CRITICAL,
    "files:read": RiskLevel.LOW,
    "files:write": RiskLevel.MEDIUM,
    # GitHub (8)
    "repo": RiskLevel.HIGH,
    "read:org": RiskLevel.MEDIUM,
    "admin:org": RiskLevel.CRITICAL,
    "gist": RiskLevel.LOW,
    "user": RiskLevel.LOW,
    "delete_repo": RiskLevel.CRITICAL,
    "workflow": RiskLevel.HIGH,
    "admin:repo_hook": RiskLevel.HIGH,
    # Stripe (6)
    "charges:read": RiskLevel.MEDIUM,
    "charges:write": RiskLevel.HIGH,
    "customers:read": RiskLevel.LOW,
    "customers:write": RiskLevel.MEDIUM,
    "transfers:write": RiskLevel.CRITICAL,
    "balance:read": RiskLevel.LOW,
}

_RISK_SCORE: dict[RiskLevel, int] = {
    RiskLevel.SAFE: 0,
    RiskLevel.LOW: 10,
    RiskLevel.MEDIUM: 25,
    RiskLevel.HIGH: 50,
    RiskLevel.CRITICAL: 100,
}

# ---------------------------------------------------------------------------
# Use-case → minimal scopes
# ---------------------------------------------------------------------------

USE_CASE_SCOPES: dict[tuple[str, str], list[str]] = {
    # Google
    ("google", "read_email"): ["gmail.readonly", "userinfo.email"],
    ("google", "send_email"): ["gmail.send", "gmail.compose", "userinfo.email"],
    ("google", "file_storage"): ["drive.file", "drive.metadata.readonly"],
    ("google", "calendar"): ["calendar.readonly", "calendar.events"],
    ("google", "contacts"): ["contacts.readonly"],
    ("google", "spreadsheets"): ["spreadsheets", "drive.file"],
    ("google", "youtube_read"): ["youtube.readonly"],
    # Microsoft
    ("microsoft", "read_email"): ["Mail.Read", "User.Read"],
    ("microsoft", "send_email"): ["Mail.Send", "Mail.Read", "User.Read"],
    ("microsoft", "file_storage"): ["Files.Read", "User.Read"],
    ("microsoft", "calendar"): ["Calendars.Read", "User.Read"],
    # Slack
    ("slack", "read_channels"): ["channels:read", "users:read"],
    ("slack", "post_messages"): ["chat:write", "channels:read"],
    ("slack", "file_sharing"): ["files:read", "files:write", "channels:read"],
    # GitHub
    ("github", "read_repos"): ["repo"],
    ("github", "ci_cd"): ["repo", "workflow"],
    ("github", "org_read"): ["read:org"],
    # Stripe
    ("stripe", "read_charges"): ["charges:read", "balance:read"],
    ("stripe", "manage_customers"): ["customers:read", "customers:write"],
    ("stripe", "payments"): ["charges:read", "charges:write", "customers:read"],
}

# ---------------------------------------------------------------------------
# Revoke instructions per provider
# ---------------------------------------------------------------------------

REVOKE_INSTRUCTIONS: dict[str, str] = {
    "google": (
        "1. Go to https://myaccount.google.com/permissions\n"
        "2. Find the application in the list of third-party apps.\n"
        "3. Click the application name to expand details.\n"
        "4. Click 'Remove Access' and confirm.\n"
        "5. If the app uses a service account, go to Google Cloud Console → IAM & Admin → Service Accounts and revoke keys.\n"
        "6. Verify removal by refreshing the permissions page."
    ),
    "microsoft": (
        "1. Go to https://account.microsoft.com/consent\n"
        "2. Locate the application under 'Apps and services'.\n"
        "3. Click 'Edit' next to the app.\n"
        "4. Click 'Remove these permissions' and confirm.\n"
        "5. For Azure AD enterprise apps: Azure Portal → Enterprise Applications → select app → Properties → Delete.\n"
        "6. Verify the app no longer appears in your consent list."
    ),
    "slack": (
        "1. Go to https://slack.com/apps/manage (sign in to your workspace).\n"
        "2. Find the app under 'Installed Apps'.\n"
        "3. Click the app name, then click 'Remove App'.\n"
        "4. Confirm removal.\n"
        "5. If you are a workspace admin, also check Settings → Manage Apps → Approved Apps.\n"
        "6. Rotate any bot tokens that were shared with the app."
    ),
    "github": (
        "1. Go to https://github.com/settings/applications\n"
        "2. Under 'Authorized OAuth Apps', find the application.\n"
        "3. Click 'Revoke' next to the app.\n"
        "4. Also check 'Authorized GitHub Apps' tab and revoke if present.\n"
        "5. Review personal access tokens at https://github.com/settings/tokens and delete related ones.\n"
        "6. If org-level: ask an org admin to review Settings → Third-party access."
    ),
    "stripe": (
        "1. Log in to https://dashboard.stripe.com\n"
        "2. Go to Settings → Connect → Platform controls (or Settings → API keys).\n"
        "3. Identify the connected application or restricted key.\n"
        "4. Click 'Revoke access' or delete the restricted key.\n"
        "5. Roll your API keys if the app had access to your secret key.\n"
        "6. Review webhook endpoints and remove any owned by the revoked app."
    ),
    "other": (
        "1. Identify the provider's account/security settings page.\n"
        "2. Look for 'Connected apps', 'Third-party access', or 'API keys'.\n"
        "3. Find the application and revoke its access.\n"
        "4. Rotate any API keys or tokens that were shared.\n"
        "5. Verify the application can no longer access your data."
    ),
}

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class OAuthIntegration(BaseModel):
    """Registered OAuth integration with tracked scopes."""
    integration_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    provider: str = Field(..., pattern=r"^(google|microsoft|slack|github|stripe|other)$")
    app_name: str
    scopes: list[str]
    granted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_reviewed_at: Optional[datetime] = None
    risk_level: RiskLevel = RiskLevel.LOW
    access_token_hint: str = ""


class ScopeReview(BaseModel):
    """Result of reviewing an integration's scopes."""
    integration_id: str
    current_scopes: list[str]
    recommended_minimal_scopes: list[str]
    excess_scopes: list[str]
    risk_score: int
    recommendations: list[str]


class ScopeDrift(BaseModel):
    """Detected scope changes for an integration."""
    integration_id: str
    added_scopes: list[str]
    removed_scopes: list[str]
    risk_change: int
    summary: str


# ---------------------------------------------------------------------------
# Core Reviewer
# ---------------------------------------------------------------------------


class OAuthScopeReviewer:
    """SQLite-backed OAuth scope reviewer and drift detector.

    Args:
        db_path: Path to the SQLite database file.

    Example::

        reviewer = OAuthScopeReviewer()
        ig = reviewer.register_integration("google", "App", ["gmail.readonly"])
        review = reviewer.review_integration(ig.integration_id)
    """

    def __init__(self, db_path: str = "amc_oauth_integrations.db") -> None:
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()
        logger.info("oauth_scope_reviewer.init", db_path=db_path)

    # -- DB setup ----------------------------------------------------------

    def _init_tables(self) -> None:
        cur = self._conn.cursor()
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS integrations (
                integration_id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                app_name TEXT NOT NULL,
                scopes TEXT NOT NULL,
                granted_at TEXT NOT NULL,
                last_reviewed_at TEXT,
                risk_level TEXT NOT NULL,
                access_token_hint TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS rotation_schedules (
                integration_id TEXT PRIMARY KEY,
                interval_days INTEGER NOT NULL,
                last_rotated_at TEXT,
                next_rotation_at TEXT NOT NULL,
                FOREIGN KEY (integration_id) REFERENCES integrations(integration_id)
            );
        """)
        self._conn.commit()

    # -- Helpers -----------------------------------------------------------

    def _scope_risk(self, scope: str) -> RiskLevel:
        return SCOPE_RISK_DB.get(scope, RiskLevel.MEDIUM)

    def _compute_risk_level(self, scopes: list[str]) -> RiskLevel:
        if not scopes:
            return RiskLevel.SAFE
        return max((self._scope_risk(s) for s in scopes), key=lambda r: _RISK_SCORE[r])

    def _compute_risk_score(self, scopes: list[str]) -> int:
        return sum(_RISK_SCORE[self._scope_risk(s)] for s in scopes)

    def _row_to_integration(self, row: sqlite3.Row) -> OAuthIntegration:
        return OAuthIntegration(
            integration_id=row["integration_id"],
            provider=row["provider"],
            app_name=row["app_name"],
            scopes=json.loads(row["scopes"]),
            granted_at=datetime.fromisoformat(row["granted_at"]),
            last_reviewed_at=datetime.fromisoformat(row["last_reviewed_at"]) if row["last_reviewed_at"] else None,
            risk_level=RiskLevel(row["risk_level"]),
            access_token_hint=row["access_token_hint"] or "",
        )

    def _get_integration(self, integration_id: str) -> OAuthIntegration:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM integrations WHERE integration_id = ?", (integration_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Integration {integration_id!r} not found")
        return self._row_to_integration(row)

    # -- Public API --------------------------------------------------------

    def register_integration(
        self,
        provider: str,
        app_name: str,
        scopes: list[str],
        access_token_hint: str = "",
    ) -> OAuthIntegration:
        """Register a new OAuth integration and persist to SQLite.

        Args:
            provider: One of google, microsoft, slack, github, stripe, other.
            app_name: Human-readable application name.
            scopes: List of OAuth scope strings granted.
            access_token_hint: Optional truncated token for identification.

        Returns:
            The created OAuthIntegration.
        """
        integration = OAuthIntegration(
            provider=provider,
            app_name=app_name,
            scopes=scopes,
            risk_level=self._compute_risk_level(scopes),
            access_token_hint=access_token_hint,
        )
        cur = self._conn.cursor()
        cur.execute(
            "INSERT INTO integrations (integration_id, provider, app_name, scopes, granted_at, last_reviewed_at, risk_level, access_token_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                integration.integration_id,
                integration.provider,
                integration.app_name,
                json.dumps(integration.scopes),
                integration.granted_at.isoformat(),
                None,
                integration.risk_level.value,
                integration.access_token_hint,
            ),
        )
        self._conn.commit()
        logger.info("oauth.register", id=integration.integration_id, provider=provider, app=app_name, scopes=len(scopes), risk=integration.risk_level.value)
        return integration

    def review_integration(self, integration_id: str) -> ScopeReview:
        """Review an integration's scopes against minimal recommendations.

        Returns a ScopeReview with excess scopes, risk score, and recommendations.
        """
        ig = self._get_integration(integration_id)
        current = set(ig.scopes)

        # Find best-matching use-case minimal set
        best_minimal: set[str] = set()
        for (prov, _uc), uc_scopes in USE_CASE_SCOPES.items():
            if prov == ig.provider and set(uc_scopes) <= current:
                best_minimal |= set(uc_scopes)

        # If no use-case matched, recommend only LOW-risk scopes the app already has
        if not best_minimal:
            best_minimal = {s for s in ig.scopes if _RISK_SCORE[self._scope_risk(s)] <= _RISK_SCORE[RiskLevel.LOW]}

        excess = sorted(current - best_minimal)
        risk_score = self._compute_risk_score(ig.scopes)

        recommendations: list[str] = []
        critical = [s for s in ig.scopes if self._scope_risk(s) == RiskLevel.CRITICAL]
        high = [s for s in ig.scopes if self._scope_risk(s) == RiskLevel.HIGH]
        if critical:
            recommendations.append(f"URGENT: Remove CRITICAL scopes if not essential: {', '.join(critical)}")
        if high:
            recommendations.append(f"Review HIGH-risk scopes: {', '.join(high)}")
        if excess:
            recommendations.append(f"Consider removing {len(excess)} excess scope(s): {', '.join(excess)}")
        if not ig.last_reviewed_at:
            recommendations.append("This integration has never been reviewed — schedule regular reviews.")
        elif (datetime.now(timezone.utc) - ig.last_reviewed_at).days > 90:
            recommendations.append("Last review was over 90 days ago — review overdue.")
        if ig.access_token_hint:
            recommendations.append("Rotate access token periodically.")

        # Update last_reviewed_at
        now = datetime.now(timezone.utc)
        cur = self._conn.cursor()
        cur.execute("UPDATE integrations SET last_reviewed_at = ? WHERE integration_id = ?", (now.isoformat(), integration_id))
        self._conn.commit()

        logger.info("oauth.review", id=integration_id, risk_score=risk_score, excess=len(excess))
        return ScopeReview(
            integration_id=integration_id,
            current_scopes=sorted(current),
            recommended_minimal_scopes=sorted(best_minimal),
            excess_scopes=excess,
            risk_score=risk_score,
            recommendations=recommendations,
        )

    def detect_drift(self, integration_id: str, new_scopes: list[str]) -> ScopeDrift:
        """Detect scope changes between stored and new scopes.

        Also updates the stored scopes and risk level in SQLite.

        Args:
            integration_id: ID of the integration.
            new_scopes: The current/new set of scopes from the provider.

        Returns:
            ScopeDrift describing changes and risk impact.
        """
        ig = self._get_integration(integration_id)
        old = set(ig.scopes)
        new = set(new_scopes)
        added = sorted(new - old)
        removed = sorted(old - new)

        old_score = self._compute_risk_score(ig.scopes)
        new_score = self._compute_risk_score(list(new))
        risk_change = new_score - old_score

        parts: list[str] = []
        if added:
            parts.append(f"Added: {', '.join(added)}")
        if removed:
            parts.append(f"Removed: {', '.join(removed)}")
        if not parts:
            parts.append("No scope changes detected.")
        if risk_change > 0:
            parts.append(f"Risk increased by {risk_change} points.")
        elif risk_change < 0:
            parts.append(f"Risk decreased by {abs(risk_change)} points.")
        summary = " | ".join(parts)

        # Persist updated scopes
        new_risk = self._compute_risk_level(list(new))
        cur = self._conn.cursor()
        cur.execute(
            "UPDATE integrations SET scopes = ?, risk_level = ? WHERE integration_id = ?",
            (json.dumps(sorted(new)), new_risk.value, integration_id),
        )
        self._conn.commit()

        logger.info("oauth.drift", id=integration_id, added=len(added), removed=len(removed), risk_change=risk_change)
        return ScopeDrift(
            integration_id=integration_id,
            added_scopes=added,
            removed_scopes=removed,
            risk_change=risk_change,
            summary=summary,
        )

    def recommend_minimal(self, provider: str, use_case: str) -> list[str]:
        """Return the minimal scopes for a given provider and use case.

        Args:
            provider: Provider name (google, microsoft, slack, github, stripe).
            use_case: Use-case key such as 'read_email', 'file_storage', 'calendar'.

        Returns:
            List of minimal scope strings needed.

        Raises:
            ValueError: If the provider/use_case combination is unknown.
        """
        key = (provider.lower(), use_case.lower())
        if key not in USE_CASE_SCOPES:
            available = [uc for (p, uc) in USE_CASE_SCOPES if p == provider.lower()]
            raise ValueError(f"Unknown use case {use_case!r} for {provider}. Available: {available}")
        return list(USE_CASE_SCOPES[key])

    def generate_revoke_instructions(self, integration_id: str) -> str:
        """Generate step-by-step revocation instructions for an integration.

        Returns provider-specific instructions with the app name included.
        """
        ig = self._get_integration(integration_id)
        provider = ig.provider
        instructions = REVOKE_INSTRUCTIONS.get(provider, REVOKE_INSTRUCTIONS["other"])
        header = f"Revoke instructions for '{ig.app_name}' ({provider}):\n{'=' * 50}\n"
        return header + instructions

    def schedule_rotation(self, integration_id: str, interval_days: int) -> dict:
        """Schedule token rotation for an integration.

        Args:
            integration_id: Integration to schedule rotation for.
            interval_days: Days between rotations.

        Returns:
            Dict with schedule details including next_rotation_at.
        """
        ig = self._get_integration(integration_id)
        now = datetime.now(timezone.utc)
        from datetime import timedelta
        next_at = now + timedelta(days=interval_days)

        cur = self._conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO rotation_schedules (integration_id, interval_days, last_rotated_at, next_rotation_at) VALUES (?, ?, ?, ?)",
            (integration_id, interval_days, now.isoformat(), next_at.isoformat()),
        )
        self._conn.commit()

        result = {
            "integration_id": integration_id,
            "app_name": ig.app_name,
            "provider": ig.provider,
            "interval_days": interval_days,
            "last_rotated_at": now.isoformat(),
            "next_rotation_at": next_at.isoformat(),
        }
        logger.info("oauth.rotation_scheduled", **result)
        return result
