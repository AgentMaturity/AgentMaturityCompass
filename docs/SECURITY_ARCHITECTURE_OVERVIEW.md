# AMC Security Architecture Overview

*How AMC makes AI agent trust scores tamper-resistant and verifiable.*

---

## Design Philosophy: Behavioral Over Documentary

Every AI governance framework today shares a fundamental weakness: the agent being evaluated provides its own evidence. An agent can claim it logs every decision, handles errors gracefully, and respects data boundaries — and score perfectly — without any of it being true.

AMC was built on a different premise: **trust must be earned through observed behavior, not documentation.**

The Execution-Proof Evidence System (EPES) is AMC's answer to documentation inflation. Rather than asking "did you implement logging?" and accepting a config file as proof, EPES observes whether the agent actually logs during execution, verifies the logs are structurally sound, and weights the resulting score based on how that evidence was collected.

This is the difference between a self-reported credit score and one built from transaction history.

## The Four Trust Tiers

EPES classifies every piece of evidence into one of four tiers, each carrying a different weight in the final maturity score:

| Tier | Description | Trust Weight |
|------|-------------|-------------|
| **Observed Hardened** | Evidence collected by AMC-controlled instrumentation in a hardened environment the agent cannot tamper with. | Highest |
| **Observed** | Evidence directly observed by AMC's gateway proxy during live agent execution. | High |
| **Attested** | Evidence cryptographically signed by a trusted third party (vault, notary service, external auditor). | Moderate |
| **Self-Reported** | Claims made by the agent itself, with no independent verification. | Lowest (capped) |

The tier system means an agent cannot achieve a high maturity score through self-reported claims alone. The ceiling on self-reported evidence is deliberate — it forces agents (and their operators) to submit to independent observation if they want meaningful scores.

## Cryptographic Foundation

AMC's evidence chain is built on two cryptographic primitives:

### Digital Signatures (Ed25519)

Every evidence artifact — a log entry, a test result, an observation record — is digitally signed using Ed25519 elliptic curve signatures. This provides:

- **Authenticity**: proof that the evidence came from a specific, identified source
- **Integrity**: any modification to the evidence after signing invalidates the signature
- **Non-repudiation**: the signer cannot later deny having produced the evidence

Ed25519 was chosen for its speed, small key/signature size, and resistance to timing side-channel attacks — properties that matter when signing thousands of evidence artifacts during a scoring run.

### Transparency Logs (Merkle Trees)

Individual signed artifacts are organized into Merkle tree structures — append-only transparency logs where:

- Each entry is cryptographically linked to all previous entries
- Any tampering with historical records breaks the chain and is immediately detectable
- Third parties can independently verify the integrity of the entire log without trusting AMC
- Inclusion proofs allow verification of specific evidence without downloading the full log

Together, these primitives create an evidence chain where every score can be traced back to specific, signed, tamper-evident observations.

## Anti-Gaming: Closing the 84-Point Gap

In testing, AMC demonstrated an 84-point gap between keyword-based scoring (which gave a test agent 100/100) and execution-verified scoring (which revealed the true score of 16/100). This gap represents the documentation inflation that EPES is designed to eliminate.

EPES resists gaming through several reinforcing mechanisms:

- **Tiered evidence weighting** — Self-reported claims are mathematically capped. No amount of documentation can substitute for observed behavior.
- **Execution observation** — AMC's gateway proxy watches what agents actually do, not what they say they do. The agent doesn't control the observation pipeline.
- **Cryptographic binding** — Evidence is signed at the point of collection. Retroactive fabrication requires compromising the signing key, which is held in the vault — not by the agent.
- **Temporal verification** — Evidence carries timestamps that are cross-referenced against observation windows. Claims outside observed execution periods are flagged.
- **Structural analysis** — AMC doesn't just check if evidence exists; it analyzes whether the evidence is structurally consistent with genuine behavior (e.g., log entries that follow realistic timing patterns vs. bulk-generated artifacts).

The design principle: **make honest behavior the path of least resistance, and dishonest behavior cryptographically expensive.**

## Key Management

AMC's trust model depends on the integrity of its signing keys. The key management approach follows defense-in-depth:

- **Vault-based storage** — Signing keys are managed through AMC Vault, which supports software-based key storage for development and HSM/TPM-backed storage for production deployments.
- **Key rotation** — Keys have defined lifetimes. Rotation is automated, with overlap periods to ensure continuity of evidence chains during transitions.
- **Compromise recovery** — If a key is compromised, AMC's revocation mechanism invalidates the key and flags all evidence signed during the suspected compromise window for re-evaluation. The Merkle tree structure means historical evidence signed by uncompromised keys remains valid.
- **Separation of concerns** — Different keys serve different purposes (observation signing, attestation, vault sealing). Compromise of one key type does not automatically compromise others.

## Trust Boundary Model

AMC defines clear trust boundaries between components:

- **Agent boundary** — The agent under evaluation is untrusted by default. All agent-provided evidence enters at the Self-Reported tier.
- **Gateway boundary** — AMC's gateway proxy sits between the agent and external services, observing behavior. Evidence from the gateway enters at the Observed tier.
- **Vault boundary** — The cryptographic vault is the root of trust. It holds signing keys and produces attestations. Only authenticated, authorized components can request signatures.
- **Notary boundary** — External attestation services (third-party auditors, HSM-backed notaries) provide independent verification. Their evidence enters at the Attested tier.
- **Hardened boundary** — AMC-controlled instrumentation in isolated environments produces the highest-trust evidence. The agent has no access to modify the observation infrastructure.

Each boundary crossing requires authentication and produces a signed record. No component implicitly trusts another.

## Evidence Decay: Why Freshness Matters

Trust is not permanent. An agent that demonstrated robust error handling six months ago may have been updated, retrained, or modified since then. AMC's maturity function includes a formal evidence decay model:

- **Recent evidence carries more weight** than older evidence in score calculations.
- **Decay rates vary by dimension** — security-critical behaviors decay faster than operational ones, reflecting the reality that security posture can change rapidly.
- **Continuous assessment is incentivized** — because scores naturally decay over time, operators are motivated to run regular assessments rather than relying on a single point-in-time evaluation.
- **Stale scores are visibly flagged** — consumers of AMC scores can see when a score is based on aging evidence, enabling informed trust decisions.

Evidence decay ensures that AMC scores reflect current agent behavior, not historical snapshots. It transforms trust scoring from a one-time certification into an ongoing relationship.

---

## Protected native model requests (P2-02, partial source)

The native `LlmRuntime.prepare` boundary reuses the existing committed request assembly and capability assertion. Experimental detectors reuse the DLP patterns and their Luhn/IBAN checks, then identify candidate `phi`, `pii`, `card_number`, `bank_account` and `credential` classes in supported request text. Detected classes require a verified operator processor and purpose declaration before encoding or request-header creation. A permitted request keeps its original content, encoder and digest, preserving historical reconstruction. Supported requests without detections keep the existing flow. Unsupported or excessive traversal refuses preparation with a sanitized error; this is not proof that uninspected content is safe.

The scanner bounds recursive depth to 32, traversal to 10,000 nodes, and scanned text and raw tool-argument JSON to separate 1,048,576-character totals. It does not inspect image/audio bytes or binary buffers. The detector-set digest binds actual pattern metadata, class mappings, declared validator revisions and traversal limits; it is not an executable or binary provenance digest.

The operator-signed processor registry binds a provider and exact canonical route base URL to a processor and purpose. Every detected class needs an effective, unexpired covering contract declaration and purpose permission; the experimental PHI rule also requires a declared BAA. Purpose comes from signed operator data rather than prompt text or provider parameters. The static `model.request` permission applies to this native preparation operation and grants no ToolHub or action authorization. Missing, malformed, unsigned, ambiguous or insufficient declarations refuse admission. Signatures establish who endorsed the data, not whether a contract is legally sufficient or applies to a particular deployment. The experimental backing lives at `.amc/dataflow/processors.yaml` with a detached `.sig`; source helpers `initProcessorRegistry` and `signProcessorRegistry` require owner mode. The loader verifies bounded non-follow byte snapshots against auditor key history. Initialization refuses existing registry/signature paths; the two-file publication is not a transaction. Concurrent owner writes, key/clock trust and registry rollback pinning remain unresolved. This separate preparation registry is not a compiler-pinned extension of the destination registry.

Detection evidence is a signed, non-surface audit row containing only classes, counts, detector-set digest and processor ID. It contains no plaintext, match spans or hashes of protected values. Failure to persist that row refuses preparation. The existing source cutoff and bytes remain unchanged, so the audit does not become model content or alter cold reconstruction. Initial user/tool rows, tool-schema commitment and earlier local effects may already contain raw data; this slice does not redact existing records.

This is preparation-time admission against the pinned route base URL. Final envelope destinations, delayed dispatch, gateway/bridge traffic, ToolHub, exec output, attachments and authorization-purpose binding remain later scope. Regex rules miss names and free-text identifiers; binary content and structured declared fields need separate handling. Counts and detector metadata establish neither complete detection nor clinical, PCI or legal approval. Named expert review, current legal applicability, tokenized redaction, a vault-backed token map and gated restoration remain outstanding. No tokenization or de-identification claim is made. These sources remain partial and unqualified; no product execution, tests, evaluation, CI or release qualification was performed.

## Summary

AMC's security architecture is designed around a single conviction: **trust in AI agents must be grounded in cryptographic proof of observed behavior.** The combination of tiered evidence, digital signatures, transparency logs, anti-gaming mechanisms, disciplined key management, clear trust boundaries, and evidence decay creates a system where scores are meaningful, verifiable, and resistant to manipulation.

The goal is not to make gaming impossible in theory — it's to make gaming harder than simply building a trustworthy agent.

---

*For vulnerability reporting and security contacts, see the [repository security policy](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/SECURITY.md).*
*For technical details, see the [AMC documentation](https://agentmaturity.co).*
