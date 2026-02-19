"""S3 Skill Signing & Verification for AMC OS.

Provides Ed25519-based cryptographic signing and verification of skill
packages, with SQLite-backed publisher registry and revocation support.

Usage::

    signer = SkillSigner()
    identity, private_key = signer.register_publisher(
        name="Acme Corp", domain="acme.com", email="dev@acme.com", tier="org",
    )
    sig = signer.sign_skill(Path("./my-skill"), identity.publisher_id, private_key)
    result = signer.verify_skill(Path("./my-skill"))
    assert result.valid
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
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
    load_pem_private_key,
    load_pem_public_key,
)
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

SIGNATURE_FILENAME = ".amc-signature.json"


# ── Enums ────────────────────────────────────────────────────────────────

class PublisherTier(str, Enum):
    """Trust tier for a skill publisher."""
    INDIVIDUAL = "individual"
    ORG = "org"
    ENTERPRISE = "enterprise"


_TIER_RANK: dict[PublisherTier, int] = {
    PublisherTier.INDIVIDUAL: 0,
    PublisherTier.ORG: 1,
    PublisherTier.ENTERPRISE: 2,
}


# ── Models ───────────────────────────────────────────────────────────────

class PublisherIdentity(BaseModel):
    """Registered skill publisher."""
    publisher_id: str
    name: str
    domain: str
    public_key_pem: str
    verified: bool = False
    verified_at: Optional[datetime] = None
    tier: PublisherTier
    email: str
    registered_at: datetime


class SkillSignature(BaseModel):
    """Cryptographic signature for a skill directory."""
    skill_hash: str
    publisher_id: str
    timestamp: datetime
    signature_bytes_hex: str
    algorithm: str = "ed25519"


class VerificationResult(BaseModel):
    """Outcome of a skill verification check."""
    valid: bool
    publisher: Optional[PublisherIdentity] = None
    reason: str


# ── Core ─────────────────────────────────────────────────────────────────

class SkillSigner:
    """Ed25519 skill signing with SQLite-backed publisher registry.

    Args:
        db_path: Path to SQLite database file, or ``":memory:"`` for in-memory.

    Example::

        signer = SkillSigner()
        pub, pk = signer.register_publisher("Dev", "dev.io", "a@dev.io")
        signer.sign_skill(Path("skill_dir"), pub.publisher_id, pk)
        assert signer.verify_skill(Path("skill_dir")).valid
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db = sqlite3.connect(db_path)
        self._db.row_factory = sqlite3.Row
        self._init_tables()

    # ── DB setup ─────────────────────────────────────────────────────

    def _init_tables(self) -> None:
        cur = self._db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS publishers (
                publisher_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                domain TEXT NOT NULL,
                public_key_pem TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                verified_at TEXT,
                tier TEXT NOT NULL,
                email TEXT NOT NULL,
                registered_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS revocations (
                publisher_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                revoked_at TEXT NOT NULL,
                FOREIGN KEY (publisher_id) REFERENCES publishers(publisher_id)
            )
        """)
        self._db.commit()

    # ── Publisher management ─────────────────────────────────────────

    def register_publisher(
        self,
        name: str,
        domain: str,
        email: str,
        tier: str = "individual",
    ) -> tuple[PublisherIdentity, str]:
        """Register a new publisher, generating an Ed25519 keypair.

        Returns:
            Tuple of (PublisherIdentity, private_key_pem).
        """
        private_key = Ed25519PrivateKey.generate()
        public_key_pem = private_key.public_key().public_bytes(
            Encoding.PEM, PublicFormat.SubjectPublicKeyInfo,
        ).decode()
        private_key_pem = private_key.private_bytes(
            Encoding.PEM, PrivateFormat.PKCS8, NoEncryption(),
        ).decode()

        publisher_id = uuid.uuid4().hex
        now = datetime.now(timezone.utc)
        tier_enum = PublisherTier(tier)

        identity = PublisherIdentity(
            publisher_id=publisher_id,
            name=name,
            domain=domain,
            public_key_pem=public_key_pem,
            tier=tier_enum,
            email=email,
            registered_at=now,
        )

        self._db.execute(
            "INSERT INTO publishers VALUES (?,?,?,?,?,?,?,?,?)",
            (
                publisher_id, name, domain, public_key_pem,
                0, None, tier_enum.value, email, now.isoformat(),
            ),
        )
        self._db.commit()
        log.info("publisher_registered", publisher_id=publisher_id, name=name)
        return identity, private_key_pem

    def revoke_publisher(self, publisher_id: str, reason: str) -> None:
        """Revoke a publisher, invalidating all their signatures."""
        now = datetime.now(timezone.utc)
        self._db.execute(
            "INSERT INTO revocations VALUES (?,?,?)",
            (publisher_id, reason, now.isoformat()),
        )
        self._db.commit()
        log.warning("publisher_revoked", publisher_id=publisher_id, reason=reason)

    def _get_publisher(self, publisher_id: str) -> PublisherIdentity | None:
        row = self._db.execute(
            "SELECT * FROM publishers WHERE publisher_id=?", (publisher_id,),
        ).fetchone()
        if not row:
            return None
        return PublisherIdentity(
            publisher_id=row["publisher_id"],
            name=row["name"],
            domain=row["domain"],
            public_key_pem=row["public_key_pem"],
            verified=bool(row["verified"]),
            verified_at=datetime.fromisoformat(row["verified_at"]) if row["verified_at"] else None,
            tier=PublisherTier(row["tier"]),
            email=row["email"],
            registered_at=datetime.fromisoformat(row["registered_at"]),
        )

    def _is_revoked(self, publisher_id: str) -> bool:
        row = self._db.execute(
            "SELECT 1 FROM revocations WHERE publisher_id=? LIMIT 1",
            (publisher_id,),
        ).fetchone()
        return row is not None

    # ── Hashing ──────────────────────────────────────────────────────

    @staticmethod
    def _compute_skill_hash(skill_path: Path) -> str:
        """Compute deterministic SHA-256 over all files in a skill directory.

        Files are sorted by relative path. For each file the relative
        POSIX path and raw content are fed into the digest.
        """
        h = hashlib.sha256()
        files = sorted(
            p for p in skill_path.rglob("*")
            if p.is_file() and p.name != SIGNATURE_FILENAME
        )
        for fp in files:
            rel = fp.relative_to(skill_path).as_posix()
            h.update(rel.encode())
            h.update(fp.read_bytes())
        return h.hexdigest()

    # ── Sign / Verify ────────────────────────────────────────────────

    def sign_skill(
        self,
        skill_path: Path | str,
        publisher_id: str,
        private_key_pem: str,
    ) -> SkillSignature:
        """Sign a skill directory with the publisher's private key.

        Writes ``{SIGNATURE_FILENAME}`` into the skill directory.
        """
        skill_path = Path(skill_path)
        publisher = self._get_publisher(publisher_id)
        if publisher is None:
            raise ValueError(f"Unknown publisher: {publisher_id}")

        skill_hash = self._compute_skill_hash(skill_path)
        private_key = load_pem_private_key(private_key_pem.encode(), password=None)
        assert isinstance(private_key, Ed25519PrivateKey)

        signature_bytes = private_key.sign(skill_hash.encode())
        now = datetime.now(timezone.utc)

        sig = SkillSignature(
            skill_hash=skill_hash,
            publisher_id=publisher_id,
            timestamp=now,
            signature_bytes_hex=signature_bytes.hex(),
        )

        sig_path = skill_path / SIGNATURE_FILENAME
        sig_path.write_text(sig.model_dump_json(indent=2))
        log.info("skill_signed", skill_path=str(skill_path), publisher_id=publisher_id)
        return sig

    def verify_skill(self, skill_path: Path | str) -> VerificationResult:
        """Verify a signed skill directory.

        Reads ``{SIGNATURE_FILENAME}``, recomputes the hash, and checks
        the Ed25519 signature against the publisher's registered public key.
        """
        skill_path = Path(skill_path)
        sig_file = skill_path / SIGNATURE_FILENAME

        if not sig_file.exists():
            return VerificationResult(valid=False, reason="No signature file found")

        try:
            sig = SkillSignature.model_validate_json(sig_file.read_text())
        except Exception as exc:
            return VerificationResult(valid=False, reason=f"Malformed signature: {exc}")

        publisher = self._get_publisher(sig.publisher_id)
        if publisher is None:
            return VerificationResult(valid=False, reason="Publisher not found")

        if self._is_revoked(sig.publisher_id):
            return VerificationResult(valid=False, publisher=publisher, reason="Publisher revoked")

        current_hash = self._compute_skill_hash(skill_path)
        if current_hash != sig.skill_hash:
            return VerificationResult(valid=False, publisher=publisher, reason="Skill hash mismatch — files may have been tampered with")

        public_key = load_pem_public_key(publisher.public_key_pem.encode())
        assert isinstance(public_key, Ed25519PublicKey)

        try:
            public_key.verify(bytes.fromhex(sig.signature_bytes_hex), sig.skill_hash.encode())
        except InvalidSignature:
            return VerificationResult(valid=False, publisher=publisher, reason="Invalid signature")

        return VerificationResult(valid=True, publisher=publisher, reason="Valid signature")

    def require_signed(
        self,
        skill_path: Path | str,
        min_tier: str = "individual",
    ) -> VerificationResult:
        """Verify a skill and raise ``ValueError`` if it fails policy.

        Raises:
            ValueError: If the skill is unsigned, invalid, revoked, or
                the publisher tier is below *min_tier*.
        """
        result = self.verify_skill(skill_path)
        if not result.valid:
            raise ValueError(f"Skill verification failed: {result.reason}")

        assert result.publisher is not None
        min_rank = _TIER_RANK[PublisherTier(min_tier)]
        pub_rank = _TIER_RANK[result.publisher.tier]
        if pub_rank < min_rank:
            raise ValueError(
                f"Publisher tier '{result.publisher.tier.value}' below required '{min_tier}'"
            )
        return result
