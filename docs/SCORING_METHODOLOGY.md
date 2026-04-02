# AMC Scoring Methodology

## 1. Introduction

The Agent Maturity Compass (AMC) scoring methodology is designed to provide **evidence-weighted, tamper-resistant** maturity assessments for AI agents. Unlike checklist-based frameworks that rely on self-reported capabilities, AMC scores reflect observed behavior verified through cryptographic evidence chains.

This document describes the complete scoring pipeline: from evidence collection through trust-tiered weighting to final maturity score computation.

## 2. Evidence Collection

AMC collects evidence through multiple channels, each assigned a trust tier based on the degree of verification:

| Trust Tier | Weight | Source | Verification Method |
|-----------|--------|--------|---------------------|
| `OBSERVED_HARDENED` | 1.1× | AMC-controlled adversarial scenarios | Sandbox execution with cryptographic attestation |
| `OBSERVED` | 1.0× | Captured via gateway proxy | Network-level interception and recording |
| `ATTESTED` | 0.8× | Third-party cryptographic attestation | Signature verification against known keys |
| `SELF_REPORTED` | 0.4× | Agent's own claims | Capped weight; cannot exceed L3 alone |

### 2.1 Evidence Events

Each piece of evidence is recorded as an immutable **Evidence Event** in the AMC ledger:

```
Event {
  id: string              // Unique event identifier
  ts: number              // Unix timestamp
  session_id: string      // Assessment session
  runtime: string         // Execution runtime
  event_type: string      // Classification
  payload_sha256: string  // Content hash
  prev_event_hash: string // Hash chain link
  event_hash: string      // This event's hash
  writer_sig: string      // Cryptographic signature
}
```

Events form a hash chain — each event references the previous event's hash, creating a tamper-evident ledger.

### 2.2 Evidence Staleness

Evidence degrades over time to reflect that agent behavior may change:

- Evidence older than 90 days is downgraded by one trust tier
- `OBSERVED_HARDENED` → `OBSERVED` → `ATTESTED` → `SELF_REPORTED`
- Stale `SELF_REPORTED` evidence is discarded entirely

## 3. Question Bank

AMC assesses agents across **235 diagnostic questions** organized into 5 layers:

| Layer | Questions | Focus Area |
|-------|-----------|------------|
| Strategic Agent Ops | 18 | Operational maturity, cost efficiency |
| Leadership & Autonomy | 23 | Governance, decision-making authority |
| Culture & Alignment | 94 | Safety culture, value alignment, compliance |
| Resilience | 53 | Fault tolerance, recovery, monitoring |
| Skills | 47 | Technical capabilities, tool use, learning |

Each question has:
- A maturity scale from L0 (absent) to L5 (industry-leading)
- Required evidence types for each level
- Scoring rubric with specific pass/fail criteria

## 4. Scoring Pipeline

### 4.1 Per-Question Scoring

For each question, AMC computes:

1. **Claimed Level** — The level the agent (or its operator) claims to achieve
2. **Supported Max Level** — The highest level supportable by available evidence
3. **Final Level** — `min(claimedLevel, supportedMaxLevel)`, adjusted by confidence

```
finalLevel = min(claimedLevel, supportedMaxLevel) × confidenceMultiplier
```

Where `confidenceMultiplier` ranges from 0.5 (minimal evidence) to 1.0 (strong evidence).

### 4.2 Confidence Computation

Confidence for each question is derived from:

- **Evidence count**: More evidence items → higher confidence
- **Evidence diversity**: Multiple trust tiers → higher confidence than single-tier
- **Evidence recency**: Recent evidence weighted more heavily
- **Cross-correlation**: Evidence that corroborates across questions boosts confidence

```
confidence = min(1.0, 
  evidenceCountFactor × 0.4 +
  evidenceDiversityFactor × 0.3 +
  evidenceRecencyFactor × 0.2 +
  crossCorrelationFactor × 0.1
)
```

### 4.3 Layer Scoring

Each layer score is the **confidence-weighted average** of its question scores:

```
layerScore = Σ(questionFinalLevel × questionConfidence) / Σ(questionConfidence)
```

This ensures that high-confidence assessments carry more weight than low-confidence ones.

### 4.4 Overall Score

The overall maturity score is the average of layer scores:

```
overallScore = Σ(layerScore) / layerCount
```

## 5. Integrity Index

The **Integrity Index** measures the trustworthiness of the assessment itself:

```
integrityIndex = hashChainIntegrity × evidenceCoverage × signatureValidity
```

Where:
- `hashChainIntegrity`: 1.0 if all ledger hashes verify, 0.0 on any break
- `evidenceCoverage`: Proportion of questions with at least one evidence event
- `signatureValidity`: Proportion of evidence events with valid signatures

An integrity index below 0.9 triggers a warning. Below 0.7 marks the report as `DEGRADED`.

## 6. Trust Labels

Based on the integrity index and evidence composition, AMC assigns a trust label:

| Label | Criteria |
|-------|---------|
| `VERIFIED` | integrityIndex ≥ 0.95, ≥70% OBSERVED evidence |
| `HIGH TRUST` | integrityIndex ≥ 0.9, ≥50% OBSERVED evidence |
| `MODERATE TRUST` | integrityIndex ≥ 0.7 |
| `LOW TRUST` | integrityIndex ≥ 0.5 |
| `UNVERIFIED` | integrityIndex < 0.5 or insufficient evidence |
| `DEGRADED` | Hash chain broken or signatures invalid |

## 7. Anti-Gaming Defenses

AMC includes multiple mechanisms to prevent score inflation:

### 7.1 Self-Report Caps
Self-reported evidence alone cannot push a question above L3 (0.4× weight cap).

### 7.2 Statistical Anomaly Detection
- **Uniform distribution detection**: Real assessments have natural variance. Suspiciously uniform scores trigger review.
- **Speed anomalies**: Assessments completed too quickly relative to evidence collection are flagged.
- **Score-confidence mismatch**: High scores with low confidence indicate potential gaming.

### 7.3 Session Fingerprinting
Cross-session analysis detects patterns suggesting coordinated gaming:
- Similar answer patterns across different assessments
- Timing correlations suggesting automation
- Evidence reuse across unrelated assessments

## 8. Score Explainability

Every AMC score is fully decomposable:

1. **Score Decomposition** — Break each score into contributing factors (base assessment, evidence quality, confidence, adjustments)
2. **Evidence Tracing** — Link every score to specific evidence events with SHA-256 hashes
3. **Natural Language Explanations** — Human-readable rationale for each score
4. **Confidence Intervals** — Statistical uncertainty bounds based on evidence quality
5. **Benchmark Comparison** — Percentile ranking against population statistics
6. **Audit Trail** — Complete record of all score adjustments with reasons

## 9. Continuous Monitoring

AMC supports continuous maturity monitoring through:

- **Drift Detection** — Alerts when scores change significantly between assessments
- **Regression Alerts** — Automated notification when maturity decreases
- **Trend Analysis** — Longitudinal time-series tracking with EWMA smoothing
- **Control Charts** — Statistical process control for score stability

## 10. Architectural Principles

1. **Evidence over claims** — Observed behavior always trumps stated capability
2. **Fail-closed** — Any integrity violation degrades the trust label, never ignores it
3. **Tamper-evident** — Hash chain + signatures make manipulation detectable
4. **Composable** — Scores are independently verifiable per question, layer, or overall
5. **Reproducible** — Same evidence + same questions = same score (deterministic)
6. **Transparent** — Every score decision is explainable and auditable

---

*This methodology is implemented in the AMC scoring engine. For implementation details, see the source code documentation.*
