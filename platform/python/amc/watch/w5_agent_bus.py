"""W5 Agent Bus – Ed25519-authenticated inter-agent messaging with capability tokens.

Provides cryptographically signed, replay-protected messaging between agents
with delegatable capability tokens and full SQLite-backed audit trail.

Usage::

    from amc.watch.w5_agent_bus import AgentBus

    bus = AgentBus()
    alice, alice_sk = bus.register_agent("alice", ["read", "write"])
    bob, bob_sk = bus.register_agent("bob", ["read"])

    msg = bus.send("alice", alice_sk, "bob", {"action": "hello"})
    verified = bus.receive("bob")
    assert verified[0].payload == {"action": "hello"}
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from pydantic import BaseModel, ConfigDict

from amc.core.models import ActionReceipt  # noqa: F401 – shared types available

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class AgentIdentity(BaseModel):
    """Registered agent with its public key and granted capabilities.

    Example::

        identity = AgentIdentity(
            agent_id="scanner-01",
            public_key_bytes=b"...",
            capabilities=["scan", "report"],
            registered_at=datetime.now(timezone.utc),
        )
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_id: str
    public_key_bytes: bytes
    capabilities: list[str]
    registered_at: datetime


class CapabilityToken(BaseModel):
    """A signed token delegating specific capabilities from issuer to grantee.

    Example::

        token = CapabilityToken(
            token_id="tok-abc",
            issuer_agent_id="alice",
            grantee_agent_id="bob",
            capabilities=["read"],
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=300),
            signature=b"...",
        )
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    token_id: str
    issuer_agent_id: str
    grantee_agent_id: str
    capabilities: list[str]
    expires_at: datetime
    signature: bytes


class SignedMessage(BaseModel):
    """An Ed25519-signed message stored in the bus.

    Example::

        msg = SignedMessage(
            message_id="msg-1",
            from_agent_id="alice",
            to_agent_id="bob",
            payload_hash="sha256:...",
            signature=b"...",
            capability_token_id=None,
            timestamp=datetime.now(timezone.utc),
            nonce="unique-nonce",
        )
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    message_id: str
    from_agent_id: str
    to_agent_id: str
    payload_hash: str
    signature: bytes
    capability_token_id: Optional[str]
    timestamp: datetime
    nonce: str


class VerifiedMessage(BaseModel):
    """A message whose signature and capabilities have been verified.

    Example::

        vm = VerifiedMessage(
            message=signed_msg,
            sender_identity=identity,
            verified_capabilities=["read"],
            payload={"action": "hello"},
        )
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    message: SignedMessage
    sender_identity: AgentIdentity
    verified_capabilities: list[str]
    payload: dict


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AgentBusError(Exception):
    """Base exception for AgentBus errors."""


class CapabilityEscalationError(AgentBusError):
    """Raised when an agent tries to delegate capabilities it does not possess."""


class ReplayDetectedError(AgentBusError):
    """Raised when a replayed nonce is detected."""


class SignatureVerificationError(AgentBusError):
    """Raised when a message signature fails verification."""


class AgentNotFoundError(AgentBusError):
    """Raised when a referenced agent is not registered."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NONCE_TTL_SECONDS = 300  # 5-minute replay window


def _hash_payload(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode()).hexdigest()


def _sign_data(private_key_bytes: bytes, data: bytes) -> bytes:
    sk = Ed25519PrivateKey.from_private_bytes(private_key_bytes)
    return sk.sign(data)


def _verify_signature(public_key_bytes: bytes, signature: bytes, data: bytes) -> None:
    pk = Ed25519PublicKey.from_public_bytes(public_key_bytes)
    pk.verify(signature, data)  # raises InvalidSignature on failure


# ---------------------------------------------------------------------------
# AgentBus
# ---------------------------------------------------------------------------


class AgentBus:
    """SQLite-backed agent message bus with Ed25519 signing and capability tokens.

    Args:
        db_path: SQLite database path. Defaults to ``":memory:"``.

    Example::

        bus = AgentBus()
        alice, alice_sk = bus.register_agent("alice", ["read", "write"])
        bob, bob_sk = bus.register_agent("bob", ["read"])
        msg = bus.send("alice", alice_sk, "bob", {"cmd": "ping"})
        results = bus.receive("bob")
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._create_tables()
        log.info("agent_bus.init", db_path=db_path)

    # -- schema -------------------------------------------------------------

    def _create_tables(self) -> None:
        cur = self._db.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS agents (
                agent_id      TEXT PRIMARY KEY,
                public_key    BLOB NOT NULL,
                capabilities  TEXT NOT NULL,
                registered_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                message_id          TEXT PRIMARY KEY,
                from_agent_id       TEXT NOT NULL,
                to_agent_id         TEXT NOT NULL,
                payload_hash        TEXT NOT NULL,
                payload_json        TEXT NOT NULL,
                signature           BLOB NOT NULL,
                capability_token_id TEXT,
                timestamp           TEXT NOT NULL,
                nonce               TEXT NOT NULL,
                delivered           INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS capability_tokens (
                token_id          TEXT PRIMARY KEY,
                issuer_agent_id   TEXT NOT NULL,
                grantee_agent_id  TEXT NOT NULL,
                capabilities      TEXT NOT NULL,
                expires_at        TEXT NOT NULL,
                signature         BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nonces (
                nonce      TEXT PRIMARY KEY,
                created_at REAL NOT NULL
            );
            """
        )
        self._db.commit()

    # -- helpers ------------------------------------------------------------

    def _get_agent(self, agent_id: str) -> AgentIdentity:
        row = self._db.execute(
            "SELECT agent_id, public_key, capabilities, registered_at FROM agents WHERE agent_id = ?",
            (agent_id,),
        ).fetchone()
        if row is None:
            raise AgentNotFoundError(f"Agent not registered: {agent_id}")
        return AgentIdentity(
            agent_id=row[0],
            public_key_bytes=row[1],
            capabilities=json.loads(row[2]),
            registered_at=datetime.fromisoformat(row[3]),
        )

    def _cleanup_nonces(self) -> None:
        cutoff = time.time() - _NONCE_TTL_SECONDS
        self._db.execute("DELETE FROM nonces WHERE created_at < ?", (cutoff,))

    def _check_nonce(self, nonce: str) -> None:
        self._cleanup_nonces()
        exists = self._db.execute(
            "SELECT 1 FROM nonces WHERE nonce = ?", (nonce,)
        ).fetchone()
        if exists:
            raise ReplayDetectedError(f"Nonce already seen: {nonce}")
        self._db.execute(
            "INSERT INTO nonces (nonce, created_at) VALUES (?, ?)",
            (nonce, time.time()),
        )

    # -- public API ---------------------------------------------------------

    def register_agent(
        self, agent_id: str, capabilities: list[str]
    ) -> tuple[AgentIdentity, bytes]:
        """Register a new agent, generating an Ed25519 keypair.

        Args:
            agent_id: Unique agent identifier.
            capabilities: List of capability strings the agent possesses.

        Returns:
            Tuple of (AgentIdentity, private_key_bytes).

        Raises:
            AgentBusError: If agent_id is already registered.

        Example::

            identity, sk = bus.register_agent("scanner", ["scan"])
        """
        existing = self._db.execute(
            "SELECT 1 FROM agents WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        if existing:
            raise AgentBusError(f"Agent already registered: {agent_id}")

        sk = Ed25519PrivateKey.generate()
        sk_bytes = sk.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
        pk_bytes = sk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

        now = datetime.now(timezone.utc)
        self._db.execute(
            "INSERT INTO agents (agent_id, public_key, capabilities, registered_at) VALUES (?, ?, ?, ?)",
            (agent_id, pk_bytes, json.dumps(capabilities), now.isoformat()),
        )
        self._db.commit()

        identity = AgentIdentity(
            agent_id=agent_id,
            public_key_bytes=pk_bytes,
            capabilities=capabilities,
            registered_at=now,
        )
        log.info("agent_bus.register", agent_id=agent_id, capabilities=capabilities)
        return identity, sk_bytes

    def mint_capability_token(
        self,
        issuer_id: str,
        issuer_private_key: bytes,
        grantee_id: str,
        capabilities: list[str],
        ttl_seconds: int = 300,
    ) -> CapabilityToken:
        """Mint a capability token delegating capabilities to another agent.

        Args:
            issuer_id: Agent ID of the issuer.
            issuer_private_key: Raw Ed25519 private key bytes of the issuer.
            grantee_id: Agent ID receiving the delegated capabilities.
            capabilities: Capabilities to delegate (must be subset of issuer's).
            ttl_seconds: Token validity in seconds (default 300).

        Returns:
            Signed CapabilityToken.

        Raises:
            CapabilityEscalationError: If requested capabilities exceed issuer's.
            AgentNotFoundError: If issuer or grantee not registered.

        Example::

            token = bus.mint_capability_token("alice", alice_sk, "bob", ["read"])
        """
        issuer = self._get_agent(issuer_id)
        self._get_agent(grantee_id)  # verify grantee exists

        issuer_caps = set(issuer.capabilities)
        requested = set(capabilities)
        if not requested.issubset(issuer_caps):
            escalated = requested - issuer_caps
            raise CapabilityEscalationError(
                f"Issuer {issuer_id} lacks capabilities: {escalated}"
            )

        token_id = f"tok-{uuid.uuid4().hex[:16]}"
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

        sign_data = f"{token_id}|{issuer_id}|{grantee_id}|{','.join(sorted(capabilities))}|{expires_at.isoformat()}".encode()
        signature = _sign_data(issuer_private_key, sign_data)

        self._db.execute(
            "INSERT INTO capability_tokens (token_id, issuer_agent_id, grantee_agent_id, capabilities, expires_at, signature) VALUES (?, ?, ?, ?, ?, ?)",
            (token_id, issuer_id, grantee_id, json.dumps(capabilities), expires_at.isoformat(), signature),
        )
        self._db.commit()

        token = CapabilityToken(
            token_id=token_id,
            issuer_agent_id=issuer_id,
            grantee_agent_id=grantee_id,
            capabilities=capabilities,
            expires_at=expires_at,
            signature=signature,
        )
        log.info("agent_bus.mint_token", token_id=token_id, issuer=issuer_id, grantee=grantee_id)
        return token

    def send(
        self,
        from_agent_id: str,
        private_key: bytes,
        to_agent_id: str,
        payload: dict,
        capability_token: Optional[CapabilityToken] = None,
    ) -> SignedMessage:
        """Send a signed message to another agent.

        Args:
            from_agent_id: Sender agent ID.
            private_key: Raw Ed25519 private key bytes of the sender.
            to_agent_id: Recipient agent ID.
            payload: Message payload dictionary.
            capability_token: Optional capability token to attach.

        Returns:
            The signed message.

        Raises:
            AgentNotFoundError: If sender or recipient not registered.

        Example::

            msg = bus.send("alice", alice_sk, "bob", {"action": "scan"})
        """
        self._get_agent(from_agent_id)
        self._get_agent(to_agent_id)

        message_id = f"msg-{uuid.uuid4().hex[:16]}"
        nonce = uuid.uuid4().hex
        payload_hash = _hash_payload(payload)
        now = datetime.now(timezone.utc)
        cap_token_id = capability_token.token_id if capability_token else None

        sign_blob = f"{payload_hash}|{to_agent_id}|{nonce}".encode()
        signature = _sign_data(private_key, sign_blob)

        self._db.execute(
            "INSERT INTO messages (message_id, from_agent_id, to_agent_id, payload_hash, payload_json, signature, capability_token_id, timestamp, nonce, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            (message_id, from_agent_id, to_agent_id, payload_hash, json.dumps(payload, sort_keys=True), signature, cap_token_id, now.isoformat(), nonce),
        )
        self._db.commit()

        msg = SignedMessage(
            message_id=message_id,
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            payload_hash=payload_hash,
            signature=signature,
            capability_token_id=cap_token_id,
            timestamp=now,
            nonce=nonce,
        )
        log.info("agent_bus.send", message_id=message_id, from_=from_agent_id, to=to_agent_id)
        return msg

    def receive(self, agent_id: str) -> list[VerifiedMessage]:
        """Receive and verify all undelivered messages for an agent.

        Verifies Ed25519 signatures, checks nonce replay protection (5-min window),
        and validates capability tokens if present.

        Args:
            agent_id: Agent ID to receive messages for.

        Returns:
            List of verified messages.

        Example::

            messages = bus.receive("bob")
            for vm in messages:
                print(vm.payload)
        """
        self._get_agent(agent_id)
        rows = self._db.execute(
            "SELECT message_id, from_agent_id, to_agent_id, payload_hash, payload_json, signature, capability_token_id, timestamp, nonce FROM messages WHERE to_agent_id = ? AND delivered = 0",
            (agent_id,),
        ).fetchall()

        verified: list[VerifiedMessage] = []
        for row in rows:
            msg_id, from_id, to_id, p_hash, p_json, sig, cap_tok_id, ts, nonce = row

            # Replay check
            try:
                self._check_nonce(nonce)
            except ReplayDetectedError:
                log.warning("agent_bus.replay_detected", message_id=msg_id, nonce=nonce)
                continue

            # Verify sender signature
            sender = self._get_agent(from_id)
            sign_blob = f"{p_hash}|{to_id}|{nonce}".encode()
            try:
                _verify_signature(sender.public_key_bytes, sig, sign_blob)
            except InvalidSignature:
                log.warning("agent_bus.bad_signature", message_id=msg_id)
                continue

            # Verify capability token if present
            verified_caps: list[str] = list(sender.capabilities)
            if cap_tok_id:
                tok_row = self._db.execute(
                    "SELECT token_id, issuer_agent_id, grantee_agent_id, capabilities, expires_at, signature FROM capability_tokens WHERE token_id = ?",
                    (cap_tok_id,),
                ).fetchone()
                if tok_row:
                    tok_expires = datetime.fromisoformat(tok_row[4])
                    if datetime.now(timezone.utc) <= tok_expires and tok_row[2] == from_id:
                        issuer = self._get_agent(tok_row[1])
                        tok_sign_data = f"{tok_row[0]}|{tok_row[1]}|{tok_row[2]}|{','.join(sorted(json.loads(tok_row[3])))}|{tok_row[4]}".encode()
                        try:
                            _verify_signature(issuer.public_key_bytes, tok_row[5], tok_sign_data)
                            verified_caps = list(set(verified_caps) | set(json.loads(tok_row[3])))
                        except InvalidSignature:
                            log.warning("agent_bus.bad_token_sig", token_id=cap_tok_id)

            msg = SignedMessage(
                message_id=msg_id,
                from_agent_id=from_id,
                to_agent_id=to_id,
                payload_hash=p_hash,
                signature=sig,
                capability_token_id=cap_tok_id,
                timestamp=datetime.fromisoformat(ts),
                nonce=nonce,
            )

            verified.append(
                VerifiedMessage(
                    message=msg,
                    sender_identity=sender,
                    verified_capabilities=verified_caps,
                    payload=json.loads(p_json),
                )
            )

            self._db.execute("UPDATE messages SET delivered = 1 WHERE message_id = ?", (msg_id,))

        self._db.commit()
        log.info("agent_bus.receive", agent_id=agent_id, count=len(verified))
        return verified

    def get_audit_trail(self, agent_id: Optional[str] = None) -> list[SignedMessage]:
        """Retrieve the full audit trail of messages.

        Args:
            agent_id: If provided, filter to messages involving this agent.

        Returns:
            List of all matching SignedMessage records.

        Example::

            trail = bus.get_audit_trail()
            trail_alice = bus.get_audit_trail("alice")
        """
        if agent_id:
            rows = self._db.execute(
                "SELECT message_id, from_agent_id, to_agent_id, payload_hash, signature, capability_token_id, timestamp, nonce FROM messages WHERE from_agent_id = ? OR to_agent_id = ? ORDER BY timestamp",
                (agent_id, agent_id),
            ).fetchall()
        else:
            rows = self._db.execute(
                "SELECT message_id, from_agent_id, to_agent_id, payload_hash, signature, capability_token_id, timestamp, nonce FROM messages ORDER BY timestamp"
            ).fetchall()

        return [
            SignedMessage(
                message_id=r[0],
                from_agent_id=r[1],
                to_agent_id=r[2],
                payload_hash=r[3],
                signature=r[4],
                capability_token_id=r[5],
                timestamp=datetime.fromisoformat(r[6]),
                nonce=r[7],
            )
            for r in rows
        ]
