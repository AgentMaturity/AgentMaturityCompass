# Evidence Chain Documentation

How AMC proves what agents actually did — cryptographically, not by convention.

---

## Overview

AMC's evidence chain is a three-layer system that captures, classifies, and proves agent behavior. Every action an agent takes is recorded in a tamper-evident ledger, classified by trust tier, and anchored in a Merkle tree for offline verification.

The core principle: **math beats convention**. Entries aren't trusted because a file exists — they're trusted because their SHA-256 hashes chain correctly and signatures verify.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Level 3: Knowledge / Relationship                       │
│   CGX (Context Graph) + Contradiction Detection         │
│   + Correction Memory + Lessons                         │
│   Signed, hash-verified, evidence-referenced            │
├─────────────────────────────────────────────────────────┤
│ Level 2: Behavior / Evidence                            │
│   EPES (Execution-Proof Evidence System)                │
│   Trust tiers: OBSERVED_HARDENED > OBSERVED > ATTESTED  │
│   > SELF_REPORTED                                       │
│   Cryptographically signed, Merkle-anchored             │
├─────────────────────────────────────────────────────────┤
│ Level 1: Artifact                                       │
│   Evidence Ledger (append-only, hash-chained)           │
│   Gateway/Monitor/Adapter capture                       │
│   Every entry: SHA-256 hash + chain link + signature    │
└─────────────────────────────────────────────────────────┘
```

---

## Level 1: The Receipts Ledger (W1)

### What It Is

An append-only, hash-chained SQLite database that records every agent action as a tamper-evident receipt. Implemented in `amc.watch.w1_receipts.ReceiptsLedger`.

### How It Works

Every action produces an `ActionReceipt` with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `receipt_id` | UUID | Unique identifier for this receipt |
| `session_id` | string | Which session produced the action |
| `sender_id` | string | Who triggered it (user ID, agent ID) |
| `trust_level` | `SessionTrust` | Trust tier of the sender |
| `tool_name` | string | Which tool was called |
| `tool_category` | `ToolCategory` | Category (exec, read, write, etc.) |
| `parameters_redacted` | dict | DLP-cleaned parameters (no secrets) |
| `outcome_summary` | string | One-line result description |
| `policy_decision` | `PolicyDecision` | allow / deny / stepup / etc. |
| `policy_reasons` | list[str] | Why the policy engine decided this |
| `approved_by` | string? | Human approver if step-up was required |
| `timestamp` | datetime | When it happened (UTC) |
| `prev_hash` | string | SHA-256 hash of the previous receipt |
| `receipt_hash` | string | SHA-256 hash of this receipt |

### Hash Chaining

Each receipt's hash is computed from a deterministic concatenation of its core fields plus the previous receipt's hash:

```python
content = (
    f"{receipt_id}|{session_id}|{sender_id}|"
    f"{tool_name}|{policy_decision}|"
    f"{outcome_summary}|"
    f"{timestamp.isoformat()}|{prev_hash}"
)
receipt_hash = SHA-256(content)
```

This creates a **hash chain**: tampering with any historical receipt changes its hash, which breaks the `prev_hash` link in every subsequent receipt. One bit changed anywhere invalidates the entire chain from that point forward.

### Tamper Detection

```python
ledger = ReceiptsLedger(db_path="amc_receipts.db")
await ledger.init()

ok, message = await ledger.verify_chain()
# ok=True,  message="Chain OK — 1,247 receipts verified"
# ok=False, message="Chain broken at receipt #892 (abc123): prev_hash mismatch"
# ok=False, message="Hash mismatch at receipt #892 (abc123): content tampered"
```

Verification walks the entire chain from genesis, recomputing every hash and checking every link. Two failure modes:

1. **prev_hash mismatch** — a receipt was inserted, deleted, or reordered
2. **content tampered** — a receipt's fields were modified after sealing

### Usage

```python
from amc.watch.w1_receipts import ReceiptsLedger, log_action
from amc.core.models import ActionReceipt, PolicyDecision, SessionTrust, ToolCategory

# Initialize
ledger = ReceiptsLedger(db_path="amc_receipts.db")
await ledger.init()

# Append a receipt
receipt = ActionReceipt(
    session_id="main",
    sender_id="+9163...",
    trust_level=SessionTrust.OWNER,
    tool_name="exec",
    tool_category=ToolCategory.EXEC,
    parameters_redacted={"command": "ls -la"},
    outcome_summary="Listed 12 files in workspace",
    policy_decision=PolicyDecision.ALLOW,
    policy_reasons=["exec allowed for owner in workspace scope"],
)
sealed = await ledger.append(receipt)
print(sealed.receipt_hash)  # e.g. "a3f8c2d1..."

# Or use the convenience one-liner
sealed = await log_action(
    session_id="main",
    sender_id="+9163...",
    trust_level=SessionTrust.OWNER,
    tool_name="exec",
    tool_category=ToolCategory.EXEC,
    parameters_redacted={"command": "ls -la"},
    outcome_summary="Listed 12 files",
    policy_decision=PolicyDecision.ALLOW,
)

# Query receipts
denied = await ledger.query(decision=PolicyDecision.DENY, limit=10)

# Export for SIEM ingestion
count = await ledger.export_jsonl(Path("receipts_export.jsonl"))

# Summary stats
stats = await ledger.stats()
# {"total_receipts": 1247, "by_decision": {"allow": 1200, "deny": 47}, ...}
```

### Storage Schema

SQLite with two tables:

- **`receipts`** — every sealed receipt (indexed by session, timestamp, tool, decision)
- **`chain_meta`** — single row tracking `last_hash`, `total_count`, `last_updated`

---

## Level 2: EPES (Execution-Proof Evidence System)

### What It Is

The system that converts raw ledger events into scored maturity evidence. Not "what tool was called" but "what trust-relevant behavior was demonstrated."

### Evidence Kinds (Escalation Ladder)

Evidence is classified by how it was verified, from lowest to highest trust:

| Kind | Trust Multiplier | Meaning |
|------|:---:|---------|
| `KEYWORD_CLAIM` | 0.40× | Agent claims capability via keywords (lowest trust) |
| `CODE_PRESENT` | 0.55× | Relevant code exists in the agent's source |
| `IMPORT_VERIFIED` | 0.70× | Module successfully imports |
| `EXECUTION_VERIFIED` | 1.00× | Module called and returned a real result |
| `CONTINUOUS_VERIFIED` | 1.10× | Running in production with verified logs (highest trust) |

### How Evidence Is Collected

The `EvidenceCollector` inspects agent source files and automatically escalates through trust levels:

```
1. Check if module is referenced in agent source → CODE_PRESENT
2. Try to import the module                     → IMPORT_VERIFIED
3. Try to instantiate the class                 → EXECUTION_VERIFIED
```

Each maturity question (`qid`) maps to a specific module and class that proves the capability:

| Question | Module | Class | What It Proves |
|----------|--------|-------|----------------|
| `gov_1` | `amc.enforce.e1_policy` | `ToolPolicyFirewall` | Tool access control |
| `gov_3` | `amc.watch.w1_receipts` | `ReceiptsLedger` | Audit trail |
| `sec_2` | `amc.shield.s10_detector` | `InjectionDetector` | Prompt injection resistance |
| `sec_3` | `amc.vault.v2_dlp` | `DLPRedactor` | Secret redaction |
| `rel_1` | `amc.enforce.e5_circuit_breaker` | `CircuitBreaker` | Failure recovery |
| `obs_4` | `amc.watch.w1_receipts` | `ReceiptsLedger` | Observability |
| `cost_2` | `amc.product.cost_latency_router` | `CostLatencyRouter` | Cost optimization |

### Evidence Trust Tiers (for Ledger Events)

When raw ledger events are classified as maturity evidence, they receive a trust tier:

| Tier | Source | Multiplier | Verification |
|------|--------|:---:|--------------|
| `OBSERVED_HARDENED` | AMC-controlled traces + strong assurance | 1.1× | Hash-chained, notary-signed |
| `OBSERVED` | Directly observed by AMC gateway/monitor | 1.0× | Hash-chained, vault-signed |
| `ATTESTED` | Cryptographic attestation (vault/notary/human) | 0.8× | Hash-chained, counter-signed |
| `SELF_REPORTED` | Agent claims (ingested external logs) | 0.4× | Hash-chained, flagged |

### Mapping Events to Evidence

| Ledger Event | Evidence For | Maturity Question |
|-------------|-------------|-------------------|
| Gateway blocked a prompt injection | S-02 (Injection Resistance) | "How does the agent detect adversarial content?" |
| Agent hit budget limit, stopped gracefully | C-06 (Budget Enforcement) | "How are per-task cost budgets enforced?" |
| Human approved high-risk action via dual-control | G-03 (Policy Enforcement) | "How does the agent enforce compliance?" |
| Agent retried after timeout with backoff | R-05 (Graceful Degradation) | "What happens when the primary model is unavailable?" |

---

## Level 3: Merkle Tree & Inclusion Proofs

### What It Is

A Merkle tree index over the transparency log that enables offline-verifiable inclusion proofs. Any receipt can be proven to exist in the chain without trusting the log maintainer.

### Storage

```
.amc/transparency/log.jsonl          # Hash chain (append-only)
.amc/transparency/merkle/leaves.jsonl # Leaf hashes
.amc/transparency/merkle/roots.jsonl  # Historical roots
.amc/transparency/merkle/current.root.json  # Current Merkle root
.amc/transparency/merkle/current.root.sig   # Root signature (auditor key)
```

### How Merkle Proofs Work

1. Every transparency log entry's hash becomes a **leaf** in the Merkle tree
2. Leaves are paired and hashed upward to produce a single **root hash**
3. The root is **signed by the auditor key** — if the signature is invalid, certificate issuance is blocked
4. An **inclusion proof** for any entry consists of O(log n) sibling hashes — enough to recompute the root from the leaf

```
         Root Hash (signed)
        /              \
    H(AB)              H(CD)
   /     \            /     \
 H(A)   H(B)      H(C)   H(D)     ← leaf hashes
  |       |         |       |
 R₁      R₂        R₃      R₄     ← receipts
```

To prove R₃ is in the tree, you only need: `H(D)` and `H(AB)`. Recompute `H(CD) = H(H(C) || H(D))`, then `Root = H(H(AB) || H(CD))`, and verify the root signature.

### Commands

```bash
# Rebuild Merkle tree from existing transparency log
amc transparency merkle rebuild

# Show current Merkle root
amc transparency merkle root

# Generate inclusion proof for a specific entry
amc transparency merkle prove --entry-hash <hash> --out proof.amcproof

# Verify a proof offline (no network required)
amc transparency merkle verify-proof proof.amcproof
```

### Guarantees

- **Append-only**: new entries can be added but existing entries cannot be modified
- **Tamper-evident**: any modification changes the root hash, breaking the auditor signature
- **Offline-verifiable**: proofs can be checked without network access or trusting the log server
- **O(log n) proof size**: a tree of 1 million entries needs only ~20 hashes to prove inclusion

---

## Ed25519 Signing (S3)

### What It Is

Ed25519-based cryptographic signing and verification of skill packages, with a SQLite-backed publisher registry and revocation support. Implemented in `amc.shield.s3_signing.SkillSigner`.

### Key Properties

- **Algorithm**: Ed25519 (fast, small keys, deterministic signatures)
- **Key size**: 32 bytes (private), 32 bytes (public)
- **Signature size**: 64 bytes
- **No nonce required**: deterministic — same input always produces same signature

### Publisher Registry

Publishers (individuals, orgs, enterprises) register with Ed25519 keypairs stored in SQLite:

| Tier | Trust Level | Use Case |
|------|:-----------:|----------|
| `individual` | Lowest | Personal/hobby skills |
| `org` | Medium | Company-published skills |
| `enterprise` | Highest | Enterprise-verified skills |

### Signing a Skill

```python
from amc.shield.s3_signing import SkillSigner

signer = SkillSigner(db_path="publishers.db")

# Register a publisher (generates Ed25519 keypair)
identity, private_key_pem = signer.register_publisher(
    name="Acme Corp", domain="acme.com",
    email="dev@acme.com", tier="org",
)

# Sign a skill directory
sig = signer.sign_skill(
    Path("./my-skill"),
    identity.publisher_id,
    private_key_pem,
)
# Writes .amc-signature.json into the skill directory
```

### Skill Hash Computation

The skill hash is a deterministic SHA-256 over all files in the directory:

1. List all files recursively (excluding `.amc-signature.json`)
2. Sort by relative POSIX path
3. For each file: feed `relative_path + file_contents` into the SHA-256 digest
4. Final hash = the digest

This means any file change — content, name, addition, or deletion — changes the hash.

### Verifying a Skill

```python
result = signer.verify_skill(Path("./my-skill"))

if result.valid:
    print(f"Signed by: {result.publisher.name} ({result.publisher.tier})")
else:
    print(f"Verification failed: {result.reason}")
    # Possible reasons:
    # - "No signature file found"
    # - "Publisher not found"
    # - "Publisher revoked"
    # - "Skill hash mismatch — files may have been tampered with"
    # - "Invalid signature"
```

### Policy Enforcement

```python
# Require minimum publisher tier
signer.require_signed(Path("./skill"), min_tier="org")
# Raises ValueError if unsigned, invalid, revoked, or tier too low
```

### Revocation

```python
signer.revoke_publisher(publisher_id, reason="Compromised key")
# All signatures from this publisher are now invalid
```

---

## Evidence Lifecycle

The full journey from agent action to verified evidence:

```
┌──────────────────────────────────────────────────────────────────┐
│  1. ACTION                                                       │
│     Agent calls a tool (exec, read, write, API call, etc.)       │
│                        ↓                                         │
│  2. CAPTURE                                                      │
│     Gateway/Monitor intercepts and creates an ActionReceipt      │
│     Parameters are DLP-redacted (no secrets in the ledger)       │
│                        ↓                                         │
│  3. SEAL                                                         │
│     Receipt is sealed: SHA-256(fields + prev_hash)               │
│     Chain link established to previous receipt                   │
│                        ↓                                         │
│  4. STORE                                                        │
│     Sealed receipt appended to SQLite ledger                     │
│     chain_meta updated (last_hash, total_count)                  │
│                        ↓                                         │
│  5. CLASSIFY                                                     │
│     EPES maps the event to maturity evidence                     │
│     Trust tier assigned (OBSERVED > ATTESTED > SELF_REPORTED)    │
│                        ↓                                         │
│  6. ANCHOR                                                       │
│     Receipt hash becomes a Merkle leaf                           │
│     Merkle root recomputed and signed by auditor key             │
│                        ↓                                         │
│  7. SCORE                                                        │
│     Evidence feeds into maturity scoring                         │
│     Trust multiplier applied (1.0× for OBSERVED, 0.4× for SELF) │
│                        ↓                                         │
│  8. VERIFY (anytime)                                             │
│     Full chain verification: walk all receipts, recompute hashes │
│     Merkle proof: verify single entry in O(log n)               │
│     Skill verification: check Ed25519 signature + hash           │
└──────────────────────────────────────────────────────────────────┘
```

---

## CLI Commands

```bash
# View recent chain entries
amc transparency tail --agent my-agent --limit 20

# Verify full chain integrity
amc verify all --json

# Export receipts for SIEM
amc export receipts --format jsonl --out receipts.jsonl

# Merkle operations
amc transparency merkle rebuild
amc transparency merkle root
amc transparency merkle prove --entry-hash <hash> --out proof.amcproof
amc transparency merkle verify-proof proof.amcproof

# Ingest external logs (arrives as SELF_REPORTED, 0.4× trust)
amc ingest --source ./external-logs/ --format jsonl --agent imported-agent

# Upgrade trust tier via attestation
amc attest --agent imported-agent --run <runId> --reason "verified against source"

# Memory and corrections
amc memory-extract --agent my-agent
amc lessons-list --agent my-agent
amc lessons-promote --agent my-agent --id L1

# Context graph
amc cgx build --scope agent --id my-agent
amc cgx verify

# Fleet contradiction detection
amc fleet contradictions
```

---

## Why This Matters

Most agent systems rely on **convention**: logs exist because the agent wrote them, timestamps are sequential because nobody lied, entries are valid because the system created them.

AMC relies on **cryptography**:

- Ledger entries are valid because their SHA-256 hashes chain correctly
- Evidence is trusted because it's signed by an isolated notary process
- Merkle proofs demonstrate inclusion without trusting the log maintainer
- Skill signatures prove authorship via Ed25519 without trusting the registry

This is the difference between "it works because we follow the rules" and "it works because the math prevents cheating." Convention scales trust through reputation. Cryptography scales trust through verification.
