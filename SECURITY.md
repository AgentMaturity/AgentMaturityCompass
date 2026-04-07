# SECURITY

## Threat Model

See also: `docs/THREAT_MODEL.md` for expanded STRIDE coverage, attack-path mapping, and enforceable controls.

AMC assumes three actors:

1. Evaluated agent (untrusted): can produce claims but cannot be trusted as evidence writer.
2. Monitor/wrapper (trusted): writes hash-chained ledger events and signs them.
3. Owner/auditor (trusted): signs target profiles and diagnostic run seals.

Gateway extension:

4. AMC gateway (trusted proxy): captures upstream LLM HTTP request/response evidence as signed events.

Fleet extension:

5. Fleet/agent signed config boundary: `.amc/fleet.yaml` and `.amc/agents/<id>/agent.config.yaml` are auditor-signed.

## Trust Boundary

Security guarantee:

If monitor and auditor signing keys are isolated from the evaluated agent process, then:

- evidence tampering is detectable,
- run tampering is detectable,
- target tampering is detectable,
- scoring cannot exceed evidence gates.
- gateway traffic tampering is detectable.

If the evaluated agent can access signing keys, AMC marks runs `INVALID` and emits explicit trust-boundary violation messaging.

## What AMC Guarantees

- Append-only evidence ledger (`evidence_events`) with chain verification.
- Ed25519 signatures for event hashes, session seals, run seals, target profiles.
- Signed evidence bundles (`.amcbundle`) with offline verification (`manifest + ledger + run + target`).
- Gateway request/response evidence (`llm_request`, `llm_response`) signed by monitor key.
- Monitor-signed AMC receipts (`x-amc-receipt`) binding runtime traces to ledger `event_hash`.
- Optional proxy-mode network evidence (CONNECT host:port + byte counts) signed by monitor key.
- Fleet and agent configuration integrity checks via signatures.
- Signed CI gate policy support (`gatePolicy.json.sig`) for deterministic release blocking.
- Trust-tier-aware scoring (OBSERVED > ATTESTED > SELF_REPORTED).
- Signed gateway config (`.amc/gateway.yaml.sig`) using auditor key.
- Blob hashing and hash-match verification.
- Deterministic scoring with evidence-gated level caps.
- Cherry-pick defense for high maturity levels.
- Deterministic trace correlation audits (`TRACE_*`) to detect forged self-logs.
- Encrypted vault at rest for signing keys (`.amc/vault.amcvault`).

## What AMC Does Not Guarantee

- It does not guarantee semantic correctness of every model output.
- It does not prevent misuse when key isolation is deliberately bypassed.
- It does not auto-install runtime CLIs.
- It cannot force an evaluated agent to use provided base URL env vars; bypassed routing is treated as missing evidence and maturity is capped.
- Docker sandbox hardening relies on host Docker/network policy. AMC records sandbox attestations and blocked egress evidence, but host-level misconfiguration can weaken enforcement.

## Gateway Config Trust

- `amc gateway init` creates and signs `.amc/gateway.yaml`.
- If config signature is missing/invalid, gateway still runs but writes audit `CONFIG_UNSIGNED`.
- Diagnostics apply trust penalties and avoid high-trust labeling while config remains unsigned.
- If signature file exists but is invalid, `amc verify` fails.

## Trust Tiers

- `OBSERVED`: captured live by AMC monitor/gateway and signed.
- `OBSERVED_HARDENED`: observed evidence collected under sandbox + strict proxy posture.
- `ATTESTED`: imported evidence later attested by auditor signature.
- `SELF_REPORTED`: ingested without attestation, treated as lowest trust.

Scoring enforcement:

- Level >=4 cannot be supported by SELF_REPORTED-only evidence.
- Level 5 requires OBSERVED-class evidence (`OBSERVED` or `OBSERVED_HARDENED`) and, for high-risk questions, sandbox attestation evidence.

CI gate enforcement:

- `requireObservedForLevel5=true` fails release gates when any level-5 claim uses non-OBSERVED evidence.
- `denyIfLowTrust=true` fails release gates when report trust label is not HIGH TRUST.

## Receipts + Correlation Hardening

Receipts are minted only by trusted monitor/gateway components and signed with monitor Ed25519 keys.  
Each receipt includes `event_hash` and `body_sha256`, allowing offline proof that a trace line maps to a real ledger event.

Correlation checks in diagnostics:
- verify receipt signature with monitor public key history,
- verify `event_hash` exists in verified ledger slice,
- verify `body_sha256` equals ledger `payload_sha256`,
- verify agent attribution consistency.

If correlation ratio is low or receipts are invalid, AMC emits `TRACE_*` audits, reduces IntegrityIndex, and caps high-trust maturity questions.

## Vault + Studio Control Plane

- Private signing keys are stored encrypted with AES-256-GCM in vault files.
- Vault unlock is required before signing operations.
- Studio API binds to `127.0.0.1` by default.
- Compass Console uses RBAC sessions (`/auth/login`, HttpOnly `amc_session`) for interactive access.
- `x-amc-admin-token` remains available for CLI/bootstrap operations.
- Studio token is generated locally at `.amc/studio/admin.token` and is not given to evaluated agents.
- Signed `users.yaml` controls role mappings; invalid signature forces read-only protections.

If config signatures are invalid (`fleet.yaml`, `agent.config.yaml`, `gateway.yaml`), AMC emits `CONFIG_SIGNATURE_INVALID`, applies integrity penalties, and caps maximum maturity at level 3 until repaired.

## Sandbox Mode

`amc sandbox run` executes the agent command in Docker and records `SANDBOX_EXECUTION_ENABLED` audit evidence with command/image metadata.

- Signing keys are not mounted into the container.
- Gateway/monitor remain outside the sandbox boundary.
- AMC creates a per-run Docker internal network for sandbox execution to block direct internet egress.
- Proxy allowlist + `NETWORK_EGRESS_BLOCKED` audits provide additional bypass evidence.

## Key Isolation Best Practices

- Run monitor/wrapper under a dedicated service account.
- Keep `.amc/vault.amcvault` outside evaluated-agent writable contexts when possible.
- Use `0600` permissions for vault and token files.
- Rotate keys with retained public-key history for old-run verification.

## Separate Deployment Pattern

- Container or VM A: evaluated runtime CLI.
- Container or VM B: AMC monitor/gateway + auditor keys.
- Data exchange: pipe/stdin/stdout + local HTTP gateway route only.
- Mount ledger storage writable only by monitor process.

Set in config only when isolated boundary is real:

```yaml
security:
  trustBoundaryMode: isolated
```

If not isolated, keep `shared` and treat results as untrusted (`INVALID`).

## Bundle Sharing Pattern

- Export: `amc bundle export --agent <id> --run <runId> --out <file.amcbundle>`
- Verify offline: `amc bundle verify <file.amcbundle>`
- Enforce in CI: `amc gate --bundle <file.amcbundle> --policy <gatePolicy.json>`

## Assurance + Certification Pattern

- Run assurance: `amc assurance run --agent <id> --all --mode sandbox --window 14d`
- Verify assurance determinism: `amc assurance verify --agent <id> --assuranceRun <id>`
- Issue cert: `amc certify --agent <id> --run <runId> --policy <gatePolicy.json> --out <file.amccert>`
- Verify cert offline: `amc cert verify <file.amccert>`

---

## Responsible Disclosure

If you discover a security vulnerability in AMC, please report it responsibly:

1. **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/AgentMaturity/AgentMaturityCompass/security/advisories/new)
2. **Email**: Open a GitHub Security Advisory (we don't publish a public email to avoid spam)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

**Please do NOT:**
- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before we've had a chance to fix it
- Test against production systems you don't own

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (current) | ✅ Security updates |
| < 1.0 | ❌ No longer supported |

## Security Architecture Overview

For the full deep-dive — including EPES mechanics, anti-gaming defenses, key management, trust boundaries, and evidence decay — see [Security Architecture Overview](docs/SECURITY_ARCHITECTURE_OVERVIEW.md).

AMC's security model is built on four principles:

1. **Evidence-Provenance Enforcement (EPES)**: Every evidence item carries a trust tier (OBSERVED_HARDENED, OBSERVED, ATTESTED, SELF_REPORTED). Self-reported evidence is capped at 0.4× weight and cannot inflate maturity levels.

2. **Cryptographic Integrity**: Ed25519 signatures on all evidence entries, hash-chained ledger for tamper detection, Merkle tree proofs for efficient verification.

3. **Trust Boundary Isolation**: The evaluated agent process is untrusted. Monitor/wrapper keys must be isolated from the agent. If isolation is compromised, all evidence is marked INVALID.

4. **Four Trust Tiers**: Not all evidence is equal. AMC weights evidence by how it was collected, not what it claims. This prevents documentation inflation (the 84-point gap).

## Hall of Fame

Security researchers who have responsibly disclosed vulnerabilities:

*Be the first! Report a vulnerability to be listed here.*
