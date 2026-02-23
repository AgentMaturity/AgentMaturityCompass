# BENCHMARKS

AMC `bench` artifacts are deterministic, signed, privacy-safe ecosystem checkpoints.

## What A `.amcbench` Contains

- `bench.json` with allowlisted numeric/categorical metrics only
- `bench.sig` signature envelope for offline verification
- signer public key
- transparency/merkle root snapshots and inclusion proofs
- strict PII/secret scan report (`checks/pii-scan.json`)
- deterministic build metadata

## What It Does NOT Contain

- raw prompts
- raw model responses
- transcripts/tool outputs
- secrets/tokens/keys
- free-form user text/PII

## Privacy Guarantees

- allowlist-only export model
- free-text export blocked
- optional scope anonymization and hashed IDs
- strict scanner blocks emails, URLs, file paths, key/token patterns

## Evidence + Proof Anchoring

Bench exports bind metrics to signed transparency + Merkle artifacts and inclusion proofs so claims are verifiable without exposing evidence payloads.

If proofs are unavailable, exports are still possible, but trust is downgraded and publishing gates can block distribution.

## CLI

```bash
amc bench init
amc bench verify-policy

amc bench create --scope workspace --out .amc/bench/exports/workspace/workspace/latest.amcbench
amc bench verify .amc/bench/exports/workspace/workspace/latest.amcbench
amc bench print .amc/bench/exports/workspace/workspace/latest.amcbench
```

## Publishing Governance

Publishing is dual-control:

1. Create publish request (requires explicit irreversible-sharing ack)
2. Satisfy approval quorum
3. Execute publish

```bash
amc bench publish request \
  --agent default \
  --file .amc/bench/exports/workspace/workspace/latest.amcbench \
  --registry ./bench-registry \
  --registry-key ./bench-registry/registry.key \
  --ack

amc bench publish execute --approval-request <apprreq_id>
```

## METR-Style Task Horizon Scoring

Based on METR research, task-completion time horizon is the single most predictive metric for agent capability. AMC scores agents on the longest task they can reliably complete autonomously, and maps each horizon level to required governance controls.

| Level | Horizon | Example Tasks | Governance Requirements |
|-------|---------|---------------|------------------------|
| L0 | <1 min | Single-turn Q&A, lookups | Basic output validation |
| L1 | 1-5 min | Multi-step retrieval, short workflows | + tool allowlist |
| L2 | 5-30 min | Code generation, document drafting | + checkpoint logging, cost budget |
| L3 | 30 min-2 hr | Complex analysis, multi-file refactors | + human-in-the-loop, rollback |
| L4 | 2-8 hr | Project-level work, research synthesis | + progress reporting, circuit breaker, dual-control |
| L5 | 8+ hr | Autonomous multi-day projects | + drift monitoring, kill switch, tamper-evident audit |

Key principle: longer task horizons trigger stricter governance requirements. An agent operating at L4 without dual-control approvals is flagged as high risk.

```typescript
import { scoreTaskHorizon } from "agent-maturity-compass";

const result = scoreTaskHorizon({
  taskDurationMinutes: 120,
  completedAutonomously: true,
  activeGovernanceControls: ["output validation", "tool allowlist", "checkpoint logging"],
});
// result.level → "L3"
// result.governanceSufficient → false (missing human-in-the-loop, rollback, cost budget)
// result.riskLabel → "high"
```

## FACTS-Style Factuality Dimensions

Inspired by Google DeepMind's FACTS benchmark, AMC scores agent factuality across three orthogonal dimensions:

1. **Parametric factuality** — accuracy of the model's internal knowledge. Measures hallucination rate, uncertainty calibration, and refusal when unsure.
2. **Search/retrieval factuality** — accuracy when using RAG or search tools. Measures citation correctness, source verification, and contradiction flagging.
3. **Grounded factuality** — accuracy when answering from provided context. Measures faithfulness to context, inference distinction, and insufficient-context flagging.

```typescript
import { scoreFactuality } from "agent-maturity-compass";

const result = scoreFactuality({
  parametric: {
    totalClaims: 10, verifiedCorrect: 9, verifiedIncorrect: 1,
    unverifiable: 0, expressesUncertainty: true, refusesWhenUnsure: true,
  },
  searchRetrieval: {
    totalClaims: 10, correctlyAttributed: 9, fabricatedCitations: 0,
    sourcesVerified: true, contradictionsFlagged: true,
  },
  grounded: {
    totalClaims: 10, faithfulClaims: 10, unfaithfulClaims: 0,
    distinguishesInference: true, flagsInsufficientContext: true,
  },
});
// result.overallScore, result.parametric.score, etc.
```

Truthguard now supports FACTS-style factuality annotations on individual claims via `TruthguardFactualityAnnotation`, classifying each claim as `parametric`, `search_retrieval`, `grounded`, or `unknown`.
