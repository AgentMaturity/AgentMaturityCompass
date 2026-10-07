# Claim Provenance

Evidence provenance lifecycle in AMC: how claims are labeled, tracked, promoted, and protected against hallucination.

---

## The Problem

Agent systems produce claims constantly: "I completed the task," "the test passed," "the policy was enforced." Without provenance tracking, these claims are indistinguishable from hallucinations. A claim without provenance is noise.

the prior art's Pathfinder system had the right idea — provenance labels like `USER-VERIFIED`, `DERIVED`, `HYPOTHESIS` that tracked how knowledge was established. That granularity was lost when Pathfinder was restructured. AMC builds this into the core evidence model with cryptographic backing.

---

## 1. Claim-Level Provenance Labels

Every evidence claim in AMC carries a provenance label that describes how the claim was established:

| Label | Definition | Trust Weight | Can Promote? |
|-------|-----------|-------------|-------------|
| `OBSERVED` | AMC gateway/monitor directly witnessed the behavior | 1.0× | Already at production tier |
| `OBSERVED_HARDENED` | Observed with additional assurance context (notary, sandbox) | 1.1× | Already at highest tier |
| `ATTESTED` | Human or notary cryptographically attested the claim | 0.8× | Yes → OBSERVED via re-observation |
| `SELF_REPORTED` | Agent or external system declared the claim | 0.4× | Yes → ATTESTED via attestation |
| `DERIVED` | Computed from other evidence (e.g., score from multiple observations) | Inherits from sources | Yes → OBSERVED via direct verification |
| `HYPOTHESIS` | Inferred but not yet verified (e.g., forecast, prediction) | 0.0× (informational) | Yes → DERIVED via evidence accumulation |
| `SESSION_LOCAL` | Valid only within the session that produced it | 0.3× | Yes → SELF_REPORTED via cross-session confirmation |
| `REFERENCE_ONLY` | Context/documentation, not an evidence claim | 0.0× (not scored) | No |

### Label Assignment

Labels are assigned automatically based on the evidence source:

```
Gateway observation     → OBSERVED
Notary attestation      → ATTESTED (or OBSERVED_HARDENED if notary + sandbox)
Agent self-report       → SELF_REPORTED
amc ingest (external)   → SELF_REPORTED
amc forecast            → HYPOTHESIS
Score computation       → DERIVED
Session-scoped claim    → SESSION_LOCAL
Documentation reference → REFERENCE_ONLY
```

### Label Storage

Every evidence entry in the ledger includes its provenance label:

```json
{
  "eventId": "ev_20260223_001",
  "agentId": "my-agent",
  "type": "POLICY_ENFORCEMENT",
  "provenance": "OBSERVED",
  "provenanceChain": [
    { "label": "OBSERVED", "source": "gateway", "timestamp": "2026-02-23T14:00:00Z" }
  ],
  "hash": "sha256:...",
  "prevHash": "sha256:...",
  "signature": "..."
}
```

The `provenanceChain` array tracks the full history of label changes (e.g., if a claim was promoted from `SELF_REPORTED` to `ATTESTED`).

---

## 2. Promotion Gates

Claims can be promoted to higher provenance tiers through defined gates. Promotion is never automatic — it requires new evidence or explicit attestation.

### Promotion Paths

```
HYPOTHESIS → DERIVED → SELF_REPORTED → ATTESTED → OBSERVED → OBSERVED_HARDENED
     ↑            ↑           ↑              ↑          ↑
  evidence    computation   cross-session   human/     gateway
  accumulation  from        confirmation    notary     re-observation
               sources                     attestation  + assurance
```

### Gate Requirements

| Promotion | Gate | Command |
|-----------|------|---------|
| HYPOTHESIS → DERIVED | 2+ supporting evidence artifacts from different sessions | Automatic during scoring |
| DERIVED → SELF_REPORTED | Cross-session confirmation (same claim observed in 2+ sessions) | Automatic during scoring |
| SESSION_LOCAL → SELF_REPORTED | Same claim confirmed in a subsequent session | Automatic during scoring |
| SELF_REPORTED → ATTESTED | A third party's signature from a key pinned for `independent-attestation`; the operator's own attestation does not count (docs/EVIDENCE_TRUST.md) | `amc attest --attester-signature <file>` |
| ATTESTED → OBSERVED | AMC gateway/monitor directly observes the behavior | Automatic when gateway captures matching evidence |
| OBSERVED → OBSERVED_HARDENED | Observation occurs in hardened context (notary + sandbox + assurance pack) | Automatic when assurance context is present |

### Promotion Audit Trail

Every promotion is recorded in the transparency log:

```json
{
  "type": "PROVENANCE_PROMOTION",
  "claimId": "ev_20260223_001",
  "fromLabel": "SELF_REPORTED",
  "toLabel": "ATTESTED",
  "gate": "human_attestation",
  "attestor": "user:owner",
  "reason": "Verified against production logs",
  "timestamp": "2026-02-23T15:00:00Z",
  "hash": "sha256:...",
  "signature": "..."
}
```

### Demotion

Claims can also be demoted if contradicting evidence appears:

```bash
amc claim-confidence --agent my-agent --claim ev_20260223_001
# → confidence: 0.42, recommendation: DEMOTE to SESSION_LOCAL

amc claim-confidence-gate --agent my-agent --claim ev_20260223_001 --action demote
```

Demotion is also recorded in the transparency log. Evidence is never deleted — only re-labeled.

---

## 3. How Claims Become Policy

The promotion path from individual claim to fleet-wide policy:

```
Observation → Evidence Claim → Lesson → Policy Proposal → Approved Policy
```

### Step by Step

**Step 1: Observation produces a claim**
```bash
# Gateway observes agent behavior
# Ledger entry created with provenance: OBSERVED
```

**Step 2: Pattern detection produces a lesson**
```bash
amc memory-extract --agent my-agent
# Identifies recurring patterns across sessions
# Creates lesson entries with evidence references

amc lessons-list --agent my-agent
# ID   | Pattern                        | Sessions | Confidence
# L001 | Agent retries without backoff   | 5        | 0.89
# L002 | Budget exceeded before warning  | 3        | 0.72
```

**Step 3: Lesson promotion to policy proposal**
```bash
amc lessons-promote --agent my-agent --id L001
# Creates a policy proposal:
# "Require exponential backoff on retry (min 1s, max 60s)"
# Backed by 5 sessions of OBSERVED evidence
```

**Step 4: Human approval**
```bash
amc approvals list
# Shows pending policy proposals

amc approvals approve <proposalId> --reason "Confirmed: backoff policy needed"
# Policy is signed and activated
```

**Step 5: Fleet propagation (optional)**
```bash
amc policy pack apply --scope fleet
# Propagates approved policy to all agents in fleet
```

### Policy Provenance

Every active policy carries its provenance chain:

```yaml
policy:
  id: POL-RETRY-BACKOFF
  rule: "require_exponential_backoff"
  provenance:
    - type: OBSERVED
      sessions: [s_001, s_002, s_003, s_004, s_005]
      lesson: L001
      confidence: 0.89
    - type: ATTESTED
      attestor: "user:owner"
      approval: "apr_20260223_001"
      timestamp: "2026-02-23T16:00:00Z"
  signature: "..."
```

This means you can always answer: "Why does this policy exist?" with a chain of evidence back to specific observed behaviors.

---

## 4. Anti-Hallucination Provenance Tracking

### The Hallucination Problem

LLM-based agents hallucinate. They produce confident-sounding claims with no factual basis. In a trust system, a hallucinated claim that gets treated as evidence is catastrophic — it poisons the entire scoring chain.

### AMC's Defenses

**Defense 1: Source-of-Truth Separation**

The agent (untrusted) never writes directly to the evidence ledger. Only the AMC gateway/monitor (trusted) writes `OBSERVED` evidence. The agent can only produce `SELF_REPORTED` claims, which are capped at 0.4× trust weight and cannot unlock maturity levels.

```
Agent claims "I enforced the policy"  → SELF_REPORTED (0.4×, capped)
Gateway observes policy enforcement   → OBSERVED (1.0×, counts)
```

**Defense 2: Truthguard Output Validation**

AMC's Truthguard validates agent output claims against evidence:

```json
{
  "v": 1,
  "answer": "I completed the security scan",
  "claims": [
    {
      "text": "Security scan completed with 0 findings",
      "evidenceRefs": ["ev_scan_001"]
    }
  ],
  "unknowns": []
}
```

Truthguard checks:
- Every claim must reference an evidence artifact
- Referenced artifacts must exist in the ledger
- Referenced artifacts must have provenance ≥ `SELF_REPORTED`
- Claims without evidence refs are flagged as `UNSUBSTANTIATED`

```bash
amc truthguard --agent my-agent --output ./agent-output.json
# → PASS: 3/3 claims substantiated
# → FAIL: 1 claim references non-existent evidence (hallucination detected)
```

**Defense 3: Confidence Scoring**

Every claim carries a computed confidence score based on:
- Provenance label weight
- Number of supporting evidence artifacts
- Cross-session confirmation count
- Time since last observation (evidence decay)

```bash
amc claim-confidence --agent my-agent
# Claim                          | Provenance  | Confidence | Status
# "Policy enforced on all calls" | OBSERVED    | 0.94       | HIGH
# "No injection attempts"        | HYPOTHESIS  | 0.12       | LOW (insufficient evidence)
# "Budget always under limit"    | SELF_REPORTED| 0.38      | MEDIUM (needs attestation)
```

Claims with confidence below threshold are excluded from scoring:

```bash
amc claim-confidence-gate --agent my-agent --threshold 0.5
# → 2/3 claims pass gate
# → 1 claim excluded from scoring (confidence 0.38 < threshold 0.5)
```

**Defense 4: Stale Claim Detection**

Claims that haven't been re-observed within their decay window are flagged:

```bash
amc claims-stale --agent my-agent
# Claim                          | Last Observed | Decay Window | Status
# "Logging is structured JSON"   | 45 days ago   | 30 days      | STALE
# "Budget limits enforced"       | 2 days ago    | 30 days      | FRESH

amc claims-sweep --agent my-agent
# Demotes stale claims: OBSERVED → SESSION_LOCAL
# Records demotion in transparency log
```

**Defense 5: Cross-Agent Contradiction Detection**

In multi-agent fleets, contradicting claims across agents are detected:

```bash
amc fleet contradictions
# Agent A claims: "Database write succeeded"
# Agent B claims: "Database write failed"
# → CONTRADICTION detected, both claims flagged for review
```

---

## 5. Provenance Labels vs. the prior art's Pathfinder

AMC's provenance system is a direct response to the granularity that the prior art's Pathfinder had and lost:

| Pathfinder Label | AMC Equivalent | Key Improvement |
|-----------------|----------------|-----------------|
| `USER-VERIFIED` | `ATTESTED` | Cryptographically signed attestation, not just a label |
| `DERIVED` | `DERIVED` | Inherits trust weight from source evidence, with chain |
| `HYPOTHESIS` | `HYPOTHESIS` | 0.0× weight — cannot influence scores until promoted |
| `SESSION-LOCAL` | `SESSION_LOCAL` | 0.3× weight, auto-promotes on cross-session confirmation |
| `REFERENCE-ONLY` | `REFERENCE_ONLY` | Excluded from scoring entirely |

### What AMC Adds Beyond Pathfinder

1. **Cryptographic binding**: Every label is part of a signed, hash-chained entry. Labels can't be changed without breaking the chain.
2. **Quantified trust weights**: Labels aren't just categories — they have calibrated multipliers that directly affect maturity scores.
3. **Promotion gates with audit trails**: Promotion from one label to another requires specific evidence and is recorded in the transparency log.
4. **Anti-hallucination integration**: Provenance labels feed into Truthguard, confidence scoring, and stale claim detection.
5. **Fleet-wide consistency**: Provenance is checked across agents, not just within a single agent's session history.

---

## Commands Reference

```bash
# Claim confidence
amc claim-confidence --agent <id>
amc claim-confidence --agent <id> --claim <claimId>
amc claim-confidence-gate --agent <id> --threshold 0.5

# Stale claims
amc claims-stale --agent <id>
amc claims-sweep --agent <id>

# Lessons and promotion
amc lessons-list --agent <id>
amc lessons-promote --agent <id> --id <lessonId>

# Correction memory
amc memory-extract --agent <id>
amc memory-advisories --agent <id>
amc memory-report --agent <id>
amc memory-expire --agent <id>

# Truthguard
amc truthguard --agent <id> --output <file>

# Attestation
amc attest --agent <id> --claim <claimId> --reason "..."

# Governance lineage
amc lineage-init
amc lineage-report --agent <id>
amc lineage-claim --agent <id> --claim <claimId>
amc lineage-policy-intents --agent <id>
```
