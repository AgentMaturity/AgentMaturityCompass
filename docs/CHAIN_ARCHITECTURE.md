# Chain Architecture

AMC's evidence chain structure mapped to three levels of chaining, and how AMC covers or integrates all three.

---

## Three Levels of Chaining

Modern agent systems produce chains at three distinct levels. Most tools address only one. AMC is designed to cover all three.

```
Level 3: Relationship / Knowledge Chains
         (typed knowledge graphs, cross-session learning, contradiction detection)
              ↑ built from
Level 2: Behavior / Evidence Chains
         (what the agent actually did, signed and hash-chained)
              ↑ built from
Level 1: Artifact Chains
         (raw session logs, file diffs, tool call records)
```

---

## Level 1: Artifact Chaining

### What It Is

Raw records of what happened during agent sessions: JSONL logs, file changes, tool invocations, model responses. This is the ground truth layer — the uninterpreted record of events.

### Who Does This

- **Codex / Claude Code**: Records every action automatically as JSONL ground truth. Sessions produce raw action logs.
- **Convention-based systems**: JSONL ground truth is Layer 1 of their 4-layer architecture. Claude Code records every action automatically.
- **AMC**: The evidence ledger (`.amc/ledger/`) captures raw events from gateway proxy, monitor wrapping, and adapter instrumentation.

### AMC's Implementation

```
Agent → AMC Gateway/Monitor → Ledger (append-only, hash-chained)
```

Every event in the ledger includes:
- Event payload (tool call, model response, policy decision, etc.)
- SHA-256 content hash
- Previous event hash (chain link)
- Timestamp
- Agent ID + session ID
- Trust tier (`OBSERVED`, `ATTESTED`, `SELF_REPORTED`, `OBSERVED_HARDENED`)

```bash
amc transparency tail --agent my-agent --limit 20   # View recent chain entries
amc verify all --json                                 # Verify full chain integrity
```

### Key Difference from prior art

the prior art's JSONL entries are **not hashed**. Authorship is by convention (the file exists, so Claude must have written it). AMC's ledger entries are **individually hashed and chain-linked**, with the chain signed by the vault or notary key. Tampering with any entry breaks the chain — detectable by `amc verify`.

---

## Level 2: Behavior / Evidence Chaining

### What It Is

Interpreted, structured evidence derived from raw artifacts. Not "what tool was called" but "what trust-relevant behavior was demonstrated." This is where raw logs become maturity evidence.

### Who Does This

- **Convention-based**: Session blockchain (Layer 2) — blocks hash-link across ~85 sessions with ~3,500 traced edges. Each block represents a session with typed relationships to prior sessions.
- **AMC**: The Execution-Proof Evidence System (EPES) — evidence artifacts are derived from ledger events, classified by trust tier, and scored with calibrated multipliers.

### AMC's Implementation

Raw ledger events are processed into evidence artifacts:

```
Ledger Events → Evidence Extraction → Trust Classification → Scoring
```

Evidence artifacts answer specific maturity questions:

| Ledger Event | Evidence Artifact | Maturity Question |
|-------------|-------------------|-------------------|
| Gateway blocked a prompt injection attempt | `OBSERVED` evidence for S-02 (Prompt Injection Resistance) | "How does the agent detect and respond to adversarial content?" |
| Agent hit budget limit and gracefully stopped | `OBSERVED` evidence for C-06 (Budget Enforcement) | "How are per-task token/cost budgets enforced?" |
| Human approved a high-risk action via dual-control | `ATTESTED` evidence for G-03 (Policy Enforcement) | "How does the agent enforce compliance with operational policies?" |
| Agent retried after model timeout with backoff | `OBSERVED` evidence for R-05 (Graceful Degradation) | "What is the agent's behavior when its primary model is unavailable?" |

### Evidence Trust Tiers (EPES)

| Tier | Source | Multiplier | Chain Property |
|------|--------|-----------|----------------|
| `OBSERVED_HARDENED` | AMC-controlled traces + stronger assurance context | 1.1× | Hash-chained, notary-signed |
| `OBSERVED` | Directly observed by AMC gateway/monitor | 1.0× | Hash-chained, vault-signed |
| `ATTESTED` | Cryptographic attestation (vault/notary/human) | 0.8× | Hash-chained, counter-signed |
| `SELF_REPORTED` | Agent claims (ingested external logs) | 0.4× | Hash-chained, flagged as self-reported |

### Key Difference from prior art

the prior art's session blockchain links sessions together but entries are **not cryptographically signed** — verification is by timestamp convention. AMC's evidence chain is **cryptographically signed at every link** with the vault or notary key. The trust tier system means AMC can distinguish between "we observed this" (1.0×) and "the agent claims this" (0.4×) — a distinction prior art does not make.

---

## Level 3: Relationship / Knowledge Chaining

### What It Is

A typed knowledge graph that captures relationships between concepts, decisions, and learnings across sessions. Not just "what happened" but "what do we know, and how does it relate to what we knew before?"

### Who Does This

- **Convention-based**: Knowledge graph (Layer 3) — a knowledge graph with typed edges like `[REQUIRES]`, `[USES]`, `[CONTRADICTS]`. Represents accumulated understanding across sessions.
- **the prior art's lost Pathfinder feature**: Had provenance labels (`USER-VERIFIED`, `DERIVED`, `HYPOTHESIS`, `SESSION-LOCAL`, `REFERENCE-ONLY`) that tracked how knowledge claims were established. Claims couldn't be promoted without cross-session evidence. This granularity was lost during prior art restructuring.

### AMC's Implementation

AMC covers Level 3 through three subsystems:

**1. Context Graph (CGX)**

A deterministic, signed graph of the operating context per workspace and per agent:

```bash
amc cgx build --scope agent --id my-agent
amc cgx verify
```

CGX contains typed nodes and edges for:
- Governance relationships (agent → policy → approval chain)
- Tool/model dependencies (agent → tool → provider)
- Evidence references (score → run → evidence artifacts)
- Trust relationships (agent → delegate → receipt chain)

**2. Fleet Contradiction Detection**

Cross-agent knowledge consistency checking:

```bash
amc fleet contradictions
```

Detects cases where agents in the same fleet produce conflicting evidence or policy decisions — analogous to the prior art's `[CONTRADICTS]` edges but computed from signed evidence rather than convention.

**3. Correction Memory and Lessons**

AMC tracks corrections and learnings across sessions:

```bash
amc memory-extract --agent my-agent          # Extract correction patterns
amc memory-advisories --agent my-agent       # Advisories from memory analysis
amc lessons-list --agent my-agent            # List learned corrections
amc lessons-promote --agent my-agent --id L1 # Promote lesson to policy
```

Lessons are signed and tracked with provenance — you can trace why a correction was made, what evidence supported it, and whether it was promoted to policy.

### Key Difference from prior art

the prior art's Atlas is richer as a pure knowledge graph (typed edges, explicit relationship semantics). AMC's CGX is more constrained but **every node and edge is signed and hash-verified**. the prior art's Atlas entries are verified by timestamp only — AMC's are cryptographically bound to the evidence that produced them.

The Pathfinder provenance labels that prior art lost are addressed by AMC's Claim Provenance system (see [CLAIM_PROVENANCE.md](CLAIM_PROVENANCE.md)).

---

## How AMC Covers All Three Levels

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

### Comparison Table

| Property | Codex/Claude Code | prior art | AMC |
|----------|------------------|-----|-----|
| **L1: Artifact capture** | JSONL auto-record | JSONL ground truth | Hash-chained ledger |
| **L1: Tamper evidence** | None | None (convention) | SHA-256 chain + signature |
| **L2: Session linking** | None | Session blockchain (~85 sessions) | Evidence chain (unlimited) |
| **L2: Trust classification** | None | None | 4-tier EPES with multipliers |
| **L2: Cryptographic signing** | None | None | Vault/notary signing |
| **L3: Knowledge graph** | None | Atlas (typed edges) | CGX (signed, deterministic) |
| **L3: Contradiction detection** | None | `[CONTRADICTS]` edges | `amc fleet contradictions` |
| **L3: Provenance labels** | None | Lost (was in Pathfinder) | Claim Provenance system |
| **L3: Cross-session learning** | None | Atlas accumulation | Correction Memory + Lessons |
| **Offline verification** | No | No | Yes (Merkle proofs) |
| **Multi-agent composition** | No | No | Fleet trust composition |

### The "Convention vs. Math" Gap

the prior art's architecture is thoughtful and well-structured, but it operates on convention:
- JSONL entries exist because Claude wrote them (convention)
- Session blocks link because timestamps are sequential (convention)
- Atlas edges are valid because the system created them (convention)

AMC operates on math:
- Ledger entries are valid because their SHA-256 hashes chain correctly (cryptography)
- Evidence is trusted because it's signed by an isolated notary process (cryptography)
- Merkle proofs demonstrate inclusion without trusting the log maintainer (cryptography)

This is the L4→L5 gap that prior art itself identified: moving from "it works because we follow the rules" to "it works because the math prevents cheating."

---

## Integration Points

AMC can ingest evidence from systems that operate at Level 1 only:

```bash
# Ingest external JSONL logs (e.g., from Codex or any agent)
amc ingest ./external-agent-logs/ --type generic_json --agent imported-agent

# Evidence arrives as SELF_REPORTED (0.4× trust)
# Upgrade to ATTESTED via human/notary attestation
amc attest --agent imported-agent --run <runId> --reason "verified against source logs"
```

This means AMC doesn't require replacing existing tooling. It can sit on top of any Level 1 artifact source and add Level 2 (trust classification + signing) and Level 3 (knowledge graph + provenance) capabilities.
