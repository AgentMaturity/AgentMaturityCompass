# Evidence System Report — Execution-Proof Scoring for AMC

**Date**: 2026-02-19  
**Status**: Implemented and validated (27/27 tests pass)

## Problem

AMC's `ScoringEngine.score_all()` uses keyword matching on free-text answers. This is trivially gameable:

```python
# Attacker answers every question with rubric keywords:
answers["rel_1"] = "circuit-breaker exponential-backoff fallback-model retry"
# → Scores L5 with zero actual capability
```

**Result**: Anyone can score L5 (100/100) by copying keywords from the rubric, without any code, modules, or execution.

## Solution: Execution-Proof Evidence System

### New Files Created

| File | Purpose |
|------|---------|
| `amc/score/evidence.py` | `EvidenceArtifact` model + `EvidenceKind` enum + trust multipliers |
| `amc/score/evidence_collector.py` | `EvidenceCollector` — auto-inspects agent source, imports modules, instantiates classes |
| `amc/agents/evidence_comparison_test.py` | Side-by-side comparison: old vs new scoring |

### Modified Files

| File | Change |
|------|--------|
| `amc/score/dimensions.py` | Added `score_with_evidence()` method (existing `score_all()` untouched) |
| `amc/agents/run_cmb_harness.py` | Added evidence-based re-score with trust breakdown |
| `amc/agents/run_dpb_selfimprove.py` | Added evidence-based re-score comparison |
| `run_full_validation.py` | Added `evidence_scoring_works` check (Phase 7) |

## Design Decisions

1. **Additive, not destructive** — `score_all()` is untouched. `score_with_evidence()` is a new method alongside it.
2. **Escalating trust** — Evidence automatically escalates: code reference → import → instantiation.
3. **Zero trust on failure** — If `execution_error` is set, the artifact scores 0% regardless of `EvidenceKind`.
4. **Best-of per qid** — When multiple artifacts exist for one qid, the highest-trust one wins.

## Trust Score Breakdown

| EvidenceKind | Multiplier | What It Proves |
|-------------|-----------|----------------|
| `KEYWORD_CLAIM` | 40% | Nothing — just words in an answer |
| `CODE_PRESENT` | 55% | Module name appears in source file |
| `IMPORT_VERIFIED` | 70% | Module actually imports without error |
| `EXECUTION_VERIFIED` | 100% | Class instantiates and returns a result |
| `CONTINUOUS_VERIFIED` | 110% | Proven operational with production logs (bonus) |
| Any kind + `execution_error` | **0%** | Claimed but broken — worst possible |

## Comparison: ContentModerationBot (Old vs New)

### Old Method (keyword-stuffed answers)
| Dimension | Score | Level |
|-----------|-------|-------|
| Governance | 100 | L5 |
| Security | 100 | L5 |
| Reliability | 100 | L5 |
| Evaluation | 100 | L5 |
| Observability | 100 | L5 |
| Cost Efficiency | 100 | L5 |
| Operating Model | 100 | L5 |
| **Overall** | **100** | **L5** |

### New Method (evidence-based)
| Dimension | Score | Level |
|-----------|-------|-------|
| Governance | 22 | L1 |
| Security | 32 | L2 |
| Reliability | 13 | L1 |
| Evaluation | 20 | L1 |
| Observability | 13 | L1 |
| Cost Efficiency | 13 | L1 |
| Operating Model | 0 | L1 |
| **Overall** | **16** | **L1** |

**Inflation prevented: 84 points** (L5 → L1)

ContentModerationBot V1 is an ungoverned keyword matcher with zero AMC module integration. The evidence system correctly identifies this — none of the AMC modules are imported or used in its source.

## Gaming Examples That No Longer Work

| Attack | Old Score | New Score | Why |
|--------|-----------|-----------|-----|
| Answer "circuit-breaker exponential-backoff fallback-model" to rel_1 | 25/25 | 0/25 | No CircuitBreaker import in source |
| Answer "vault redact dlp kms" to sec_3 | 20/20 | 0/20 | No DLPRedactor import in source |
| Copy all rubric keywords into every answer | 100/100 | 40/100 max | KEYWORD_CLAIM capped at 40% |
| Import module but don't use it | N/A | 70% | IMPORT_VERIFIED, not full credit |
| Import module that fails to instantiate | N/A | 0% | execution_error → zero trust |

## Validation

```
FINAL: 27 passed, 0 failed | elapsed=20.6s
```

All 26 existing tests pass unchanged. New `evidence_scoring_works` test verifies:
- EvidenceArtifact model construction
- Trust score computation (including 0% on error)
- `score_with_evidence()` end-to-end
- Anti-gaming proof: keyword-stuffed (100) > keyword-claim evidence (40)
- EvidenceCollector file inspection
