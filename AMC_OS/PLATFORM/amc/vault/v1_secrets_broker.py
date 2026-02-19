"""
AMC Platform — Vault v1: Just-in-Time Secrets Broker
=====================================================

Provides short-lived, scoped, audited credential tokens so that agents
never hold long-lived secrets.  Two concrete backends are shipped:

  * ``FileVaultBackend``  – reads secrets from a .env-style file on disk.
  * ``EnvVaultBackend``   – reads secrets from ``os.environ``.

Neither backend ever writes a full secret value to disk or to the usage log.

Quick-start
-----------
::

    from amc.vault.v1_secrets_broker import FileVaultBackend, EnvVaultBackend

    # --- File-backed vault ---
    broker = FileVaultBackend("/run/secrets/.env")

    token = broker.mint_token(
        secret_name="OPENAI_API_KEY",
        scope="llm:infer",
        ttl_seconds=300,
        agent_id="agent-abc123",
    )
    print(token.masked_value)   # ****7f3a
    print(token.scope)          # llm:infer

    # Validate before use
    if broker.is_valid(token.token_id):
        full_key = broker.resolve(token.token_id)   # retrieve full value inside TTL

    broker.revoke(token.token_id)
    print(broker.is_valid(token.token_id))  # False

    # Audit trail
    for entry in broker.get_usage_log():
        print(entry.action, entry.agent_id, entry.timestamp)

    # --- Env-backed vault ---
    env_broker = EnvVaultBackend()
    token2 = env_broker.mint_token("STRIPE_SECRET_KEY", "payments:charge", 600)
    # token2.masked_value is a sha256-derived masked handle; the full derived
    # token is retrievable via env_broker.resolve(token2.token_id).


Security properties
-------------------
* Tokens are in-memory only — process restart clears all state.
* masked_value exposes only the last 4 characters (file backend) or last 4
  chars of the sha256 hex (env backend) — never the full secret.
* Every mint / revoke / is_valid call appends a ``UsageLogEntry``; callers can
  ship the log to a SIEM via ``get_usage_log()``.
* ``resolve()`` is intentionally separated from the public ABC so it can be
  removed or wrapped with additional authz in higher-trust contexts.
"""
import hashlib
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel, PolicyDecision, SessionTrust  # noqa: F401 — re-exported

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class ScopedToken(BaseModel):
    """A short-lived, scoped credential handle returned by the broker.

    The ``masked_value`` field is safe to log; it contains only the last
    4 characters of the underlying secret (or derived token), padded with
    asterisks.  The full value lives exclusively in the backend's in-memory
    store and is accessible only via ``SecretsBroker.resolve()``.
    """

    token_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="UUID v4 identifier for this token lease.",
    )
    masked_value: str = Field(
        description="Last-4-char preview of the secret, e.g. '****abcd'.",
    )
    scope: str = Field(
        description="Colon-delimited permission scope, e.g. 'llm:infer'.",
    )
    expires_at: datetime = Field(
        description="UTC datetime after which the token is no longer valid.",
    )
    revoked: bool = Field(
        default=False,
        description="True once the token has been explicitly revoked.",
    )
    minted_by: str = Field(
        default="",
        description="Identifier of the backend/service that minted this token.",
    )
    minted_for: str = Field(
        default="",
        description="Agent or caller ID that requested the token.",
    )

    class Config:
        frozen = True  # tokens are immutable value objects


ScopedToken.model_rebuild()


class UsageLogEntry(BaseModel):
    """Immutable audit record appended on every broker operation."""

    token_id: str = Field(description="Token this entry relates to.")
    secret_name: str = Field(description="Logical name of the secret (never the value).")
    scope: str = Field(description="Scope associated with this token.")
    agent_id: str = Field(description="Agent or caller that triggered this action.")
    action: str = Field(
        description="One of: 'mint', 'revoke', 'is_valid_true', 'is_valid_false', "
                    "'is_valid_expired', 'resolve'.",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC wall-clock time of the event.",
    )

    class Config:
        frozen = True


UsageLogEntry.model_rebuild()


# ---------------------------------------------------------------------------
# Abstract Base
# ---------------------------------------------------------------------------


class SecretsBroker(ABC):
    """Abstract interface for the AMC Just-in-Time secrets broker.

    Concrete subclasses must implement all four abstract methods.  They
    should also call ``_log()`` (provided here) to maintain the audit trail
    rather than appending to ``_usage_log`` directly.
    """

    def __new__(cls, *args, **kwargs):
        if cls is SecretsBroker:
            # Return a concrete EnvVaultBackend when instantiating the abstract class directly
            from amc.vault.v1_secrets_broker import EnvVaultBackend
            return object.__new__(EnvVaultBackend)
        return object.__new__(cls)

    def __init__(self) -> None:
        self._usage_log: list[UsageLogEntry] = []

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    def mint_token(
        self,
        secret_name: str,
        scope: str,
        ttl_seconds: int,
        agent_id: str = "",
    ) -> ScopedToken:
        """Create a new short-lived scoped token for *secret_name*.

        Args:
            secret_name: Logical key name (e.g. ``"OPENAI_API_KEY"``).
            scope:       Permission scope string (e.g. ``"llm:infer"``).
            ttl_seconds: Lifetime of the token in seconds.
            agent_id:    Optional identifier of the requesting agent.

        Returns:
            A :class:`ScopedToken` with ``masked_value`` safe for logging.

        Raises:
            KeyError:   If *secret_name* is not found in the backing store.
            ValueError: If *ttl_seconds* is not a positive integer.
        """

    @abstractmethod
    def revoke(self, token_id: str) -> None:
        """Immediately invalidate *token_id*.

        Args:
            token_id: The ``token_id`` field of a previously minted token.

        Raises:
            KeyError: If *token_id* is not known to this broker instance.
        """

    @abstractmethod
    def is_valid(self, token_id: str) -> bool:
        """Return ``True`` iff the token exists, is not revoked, and has not expired.

        Also appends a usage log entry reflecting the validation outcome.

        Args:
            token_id: The ``token_id`` to check.

        Returns:
            ``True`` if the token may be used; ``False`` otherwise.
        """

    @abstractmethod
    def get_usage_log(self) -> list[UsageLogEntry]:
        """Return the full ordered audit trail for this broker instance."""

    # ------------------------------------------------------------------
    # Shared helpers (non-abstract)
    # ------------------------------------------------------------------

    def _log(
        self,
        *,
        token_id: str,
        secret_name: str,
        scope: str,
        agent_id: str,
        action: str,
    ) -> None:
        """Append an audit entry and emit a structured log line."""
        entry = UsageLogEntry(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action=action,
        )
        self._usage_log.append(entry)
        logger.info(
            "secrets_broker.event",
            action=action,
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
        )

    @staticmethod
    def _mask(value: str) -> str:
        """Return a masked representation exposing only the last 4 characters."""
        if len(value) <= 4:
            return "****"
        return "****" + value[-4:]

    @staticmethod
    def _validate_ttl(ttl_seconds: int) -> None:
        if not isinstance(ttl_seconds, int) or ttl_seconds <= 0:
            raise ValueError(
                f"ttl_seconds must be a positive integer, got {ttl_seconds!r}"
            )


# ---------------------------------------------------------------------------
# FileVaultBackend
# ---------------------------------------------------------------------------

# Internal record stored in memory for FileVaultBackend
# (full_value, expiry, revoked, secret_name, scope, agent_id)
_FileRecord = tuple[str, datetime, bool, str, str, str]


class FileVaultBackend(SecretsBroker):
    """Secrets broker that reads key/value pairs from a ``.env``-style file.

    The file is parsed once per ``mint_token`` call so that secret rotations
    are picked up without restarting the process.  Token state is **never**
    written back to disk — everything lives in ``self._tokens``.

    File format (one assignment per line, ``#`` comments ignored)::

        OPENAI_API_KEY=sk-abc123...
        STRIPE_SECRET_KEY=rk_live_XYZ...
        # This is a comment
        DATABASE_URL=postgres://user:pass@host/db

    Args:
        env_file_path: Path to the ``.env``-style secrets file.

    Raises:
        FileNotFoundError: Propagated if the file does not exist at mint time.
    """

    BACKEND_ID = "FileVaultBackend"

    def __init__(self, env_file_path: str | Path) -> None:
        super().__init__()
        self._env_path = Path(env_file_path)
        # token_id → (full_value, expires_at, revoked, secret_name, scope, agent_id)
        self._tokens: dict[str, _FileRecord] = {}
        logger.info(
            "secrets_broker.file_backend.init",
            env_file=str(self._env_path),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _read_secret(self, secret_name: str) -> str:
        """Parse the env file and return the value for *secret_name*.

        Raises:
            FileNotFoundError: If the file does not exist.
            KeyError:          If *secret_name* is not present in the file.
        """
        secrets: dict[str, str] = {}
        with self._env_path.open("r", encoding="utf-8") as fh:
            for raw_line in fh:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, val = line.partition("=")
                secrets[key.strip()] = val.strip()

        if secret_name not in secrets:
            raise KeyError(
                f"Secret '{secret_name}' not found in {self._env_path}"
            )
        return secrets[secret_name]

    # ------------------------------------------------------------------
    # SecretsBroker interface
    # ------------------------------------------------------------------

    def mint_token(
        self,
        secret_name: str,
        scope: str,
        ttl_seconds: int,
        agent_id: str = "",
    ) -> ScopedToken:
        """Mint a new scoped token backed by a secret in *env_file_path*.

        Args:
            secret_name: Key in the .env file (e.g. ``"OPENAI_API_KEY"``).
            scope:       Colon-delimited scope (e.g. ``"llm:infer"``).
            ttl_seconds: Positive integer lifetime in seconds.
            agent_id:    Optional requesting agent identifier.

        Returns:
            :class:`ScopedToken` with ``masked_value`` showing last 4 chars.

        Raises:
            ValueError:        If *ttl_seconds* ≤ 0.
            FileNotFoundError: If the backing file cannot be read.
            KeyError:          If *secret_name* is absent from the file.
        """
        self._validate_ttl(ttl_seconds)
        full_value = self._read_secret(secret_name)

        token_id = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        masked = self._mask(full_value)

        self._tokens[token_id] = (
            full_value,
            expires_at,
            False,       # revoked
            secret_name,
            scope,
            agent_id,
        )

        token = ScopedToken(
            token_id=token_id,
            masked_value=masked,
            scope=scope,
            expires_at=expires_at,
            revoked=False,
            minted_by=self.BACKEND_ID,
            minted_for=agent_id,
        )

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="mint",
        )
        logger.info(
            "secrets_broker.file_backend.mint",
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            ttl_seconds=ttl_seconds,
            expires_at=expires_at.isoformat(),
            agent_id=agent_id,
        )
        return token

    def revoke(self, token_id: str) -> None:
        """Mark *token_id* as revoked immediately.

        Args:
            token_id: ID of the token to revoke.

        Raises:
            KeyError: If *token_id* is not known to this broker instance.
        """
        if token_id not in self._tokens:
            raise KeyError(f"Unknown token_id: {token_id!r}")

        full_value, expires_at, _, secret_name, scope, agent_id = self._tokens[token_id]
        # Replace record with revoked=True
        self._tokens[token_id] = (full_value, expires_at, True, secret_name, scope, agent_id)

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="revoke",
        )
        logger.warning(
            "secrets_broker.file_backend.revoke",
            token_id=token_id,
            secret_name=secret_name,
        )

    def is_valid(self, token_id: str) -> bool:
        """Return ``True`` iff the token exists, unexpired, and not revoked.

        Args:
            token_id: ID to validate.

        Returns:
            Boolean validity status.
        """
        if token_id not in self._tokens:
            self._log(
                token_id=token_id,
                secret_name="<unknown>",
                scope="<unknown>",
                agent_id="<unknown>",
                action="is_valid_false",
            )
            return False

        full_value, expires_at, revoked, secret_name, scope, agent_id = self._tokens[token_id]
        now = datetime.now(timezone.utc)

        if revoked:
            self._log(
                token_id=token_id,
                secret_name=secret_name,
                scope=scope,
                agent_id=agent_id,
                action="is_valid_false",
            )
            return False

        if now >= expires_at:
            self._log(
                token_id=token_id,
                secret_name=secret_name,
                scope=scope,
                agent_id=agent_id,
                action="is_valid_expired",
            )
            return False

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="is_valid_true",
        )
        return True

    def get_usage_log(self) -> list[UsageLogEntry]:
        """Return the ordered audit trail for this broker instance."""
        return list(self._usage_log)

    def resolve(self, token_id: str) -> str:
        """Retrieve the full secret value for a *currently valid* token.

        This method is intentionally **not** part of the abstract interface so
        that higher-trust layers can wrap or remove it.  Always call
        :meth:`is_valid` before ``resolve``; this method raises if the token
        has expired or been revoked.

        Args:
            token_id: A previously minted token ID.

        Returns:
            The full plaintext secret value.

        Raises:
            KeyError:      If *token_id* is not known.
            PermissionError: If the token is revoked or expired.
        """
        if token_id not in self._tokens:
            raise KeyError(f"Unknown token_id: {token_id!r}")

        full_value, expires_at, revoked, secret_name, scope, agent_id = self._tokens[token_id]

        if revoked:
            raise PermissionError(f"Token {token_id!r} has been revoked.")
        if datetime.now(timezone.utc) >= expires_at:
            raise PermissionError(f"Token {token_id!r} has expired.")

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="resolve",
        )
        return full_value


# ---------------------------------------------------------------------------
# EnvVaultBackend
# ---------------------------------------------------------------------------

# Internal record stored in memory for EnvVaultBackend
# (derived_token, expiry, revoked, secret_name, scope, agent_id)
_EnvRecord = tuple[str, datetime, bool, str, str, str]


class EnvVaultBackend(SecretsBroker):
    """Secrets broker that reads key/value pairs from ``os.environ``.

    Instead of exposing a slice of the raw secret, the derived token value is
    a ``sha256(secret_value + token_id + expiry_isoformat)`` hex digest.
    This gives each token a unique, time-scoped identity without ever
    materialising the underlying secret in an auditable field.

    Usage::

        import os
        os.environ["STRIPE_SECRET_KEY"] = "rk_live_XYZ..."

        from amc.vault.v1_secrets_broker import EnvVaultBackend

        broker = EnvVaultBackend()
        token = broker.mint_token("STRIPE_SECRET_KEY", "payments:charge", 300)
        # token.masked_value == "****<last4 of sha256>"

        if broker.is_valid(token.token_id):
            derived = broker.resolve(token.token_id)  # full sha256 hex

        broker.revoke(token.token_id)
    """

    BACKEND_ID = "EnvVaultBackend"

    def __init__(self) -> None:
        super().__init__()
        logger.info("secrets_broker.env_backend.init")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_token(secret_value: str, token_id: str, expires_at: datetime) -> str:
        """Produce a deterministic sha256 token tied to value + id + expiry."""
        payload = f"{secret_value}{token_id}{expires_at.isoformat()}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _read_env(secret_name: str) -> str:
        value = os.environ.get(secret_name)
        if value is None:
            raise KeyError(
                f"Environment variable '{secret_name}' is not set."
            )
        return value

    # ------------------------------------------------------------------
    # SecretsBroker interface
    # ------------------------------------------------------------------

    def mint_token(
        self,
        secret_name: str,
        scope: str,
        ttl_seconds: int,
        agent_id: str = "",
    ) -> ScopedToken:
        """Mint a new scoped token backed by an environment variable.

        The ``masked_value`` is derived from ``sha256(secret + token_id + expiry)``
        and shows only the last 4 hex characters, making it safe to log.

        Args:
            secret_name: Environment variable name (e.g. ``"STRIPE_SECRET_KEY"``).
            scope:       Colon-delimited scope (e.g. ``"payments:charge"``).
            ttl_seconds: Positive integer lifetime in seconds.
            agent_id:    Optional requesting agent identifier.

        Returns:
            :class:`ScopedToken` with ``masked_value`` showing last 4 hex chars.

        Raises:
            ValueError: If *ttl_seconds* ≤ 0.
            KeyError:   If *secret_name* is not in ``os.environ``.
        """
        self._validate_ttl(ttl_seconds)
        secret_value = self._read_env(secret_name)

        token_id = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        derived = self._derive_token(secret_value, token_id, expires_at)
        masked = self._mask(derived)

        # We store the derived token (not the raw secret) in memory
        self._tokens: dict[str, _EnvRecord]  # type: ignore[attr-defined]
        if not hasattr(self, "_tokens"):
            self._tokens = {}
        self._tokens[token_id] = (derived, expires_at, False, secret_name, scope, agent_id)

        token = ScopedToken(
            token_id=token_id,
            masked_value=masked,
            scope=scope,
            expires_at=expires_at,
            revoked=False,
            minted_by=self.BACKEND_ID,
            minted_for=agent_id,
        )

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="mint",
        )
        logger.info(
            "secrets_broker.env_backend.mint",
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            ttl_seconds=ttl_seconds,
            expires_at=expires_at.isoformat(),
            agent_id=agent_id,
        )
        return token

    def _ensure_tokens(self) -> dict[str, _EnvRecord]:
        """Lazy-init the token store (needed because __init__ doesn't create it)."""
        if not hasattr(self, "_tokens"):
            self._tokens: dict[str, _EnvRecord] = {}  # type: ignore[attr-defined]
        return self._tokens  # type: ignore[return-value]

    def revoke(self, token_id: str) -> None:
        """Mark *token_id* as revoked immediately.

        Args:
            token_id: ID of the token to revoke.

        Raises:
            KeyError: If *token_id* is not known to this broker instance.
        """
        tokens = self._ensure_tokens()
        if token_id not in tokens:
            raise KeyError(f"Unknown token_id: {token_id!r}")

        derived, expires_at, _, secret_name, scope, agent_id = tokens[token_id]
        tokens[token_id] = (derived, expires_at, True, secret_name, scope, agent_id)

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="revoke",
        )
        logger.warning(
            "secrets_broker.env_backend.revoke",
            token_id=token_id,
            secret_name=secret_name,
        )

    def is_valid(self, token_id: str) -> bool:
        """Return ``True`` iff the token exists, unexpired, and not revoked.

        Args:
            token_id: ID to validate.

        Returns:
            Boolean validity status.
        """
        tokens = self._ensure_tokens()
        if token_id not in tokens:
            self._log(
                token_id=token_id,
                secret_name="<unknown>",
                scope="<unknown>",
                agent_id="<unknown>",
                action="is_valid_false",
            )
            return False

        derived, expires_at, revoked, secret_name, scope, agent_id = tokens[token_id]
        now = datetime.now(timezone.utc)

        if revoked:
            self._log(
                token_id=token_id,
                secret_name=secret_name,
                scope=scope,
                agent_id=agent_id,
                action="is_valid_false",
            )
            return False

        if now >= expires_at:
            self._log(
                token_id=token_id,
                secret_name=secret_name,
                scope=scope,
                agent_id=agent_id,
                action="is_valid_expired",
            )
            return False

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="is_valid_true",
        )
        return True

    def get_usage_log(self) -> list[UsageLogEntry]:
        """Return the ordered audit trail for this broker instance."""
        return list(self._usage_log)

    def resolve(self, token_id: str) -> str:
        """Retrieve the sha256-derived token value for a *currently valid* token.

        The returned value is the full sha256 hex digest bound to this specific
        token's ID and expiry — it can be passed to downstream services that
        accept bearer tokens without exposing the underlying env-var secret.

        Args:
            token_id: A previously minted token ID.

        Returns:
            The full sha256 hex digest for the derived token.

        Raises:
            KeyError:      If *token_id* is not known.
            PermissionError: If the token is revoked or expired.
        """
        tokens = self._ensure_tokens()
        if token_id not in tokens:
            raise KeyError(f"Unknown token_id: {token_id!r}")

        derived, expires_at, revoked, secret_name, scope, agent_id = tokens[token_id]

        if revoked:
            raise PermissionError(f"Token {token_id!r} has been revoked.")
        if datetime.now(timezone.utc) >= expires_at:
            raise PermissionError(f"Token {token_id!r} has expired.")

        self._log(
            token_id=token_id,
            secret_name=secret_name,
            scope=scope,
            agent_id=agent_id,
            action="resolve",
        )
        return derived


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------


def make_broker(
    backend: str = "env",
    env_file_path: Optional[str | Path] = None,
) -> SecretsBroker:
    """Factory to create a broker by name.

    Args:
        backend:       ``"env"`` for :class:`EnvVaultBackend` (default) or
                       ``"file"`` for :class:`FileVaultBackend`.
        env_file_path: Required when *backend* is ``"file"``.

    Returns:
        A concrete :class:`SecretsBroker` instance.

    Raises:
        ValueError: If *backend* is unknown or *env_file_path* is missing.

    Example::

        broker = make_broker("file", "/run/secrets/.env")
        token = broker.mint_token("DB_PASSWORD", "db:read", ttl_seconds=120)
    """
    if backend == "env":
        return EnvVaultBackend()
    if backend == "file":
        if env_file_path is None:
            raise ValueError("env_file_path is required for FileVaultBackend")
        return FileVaultBackend(env_file_path)
    raise ValueError(f"Unknown backend: {backend!r}. Choose 'env' or 'file'.")
