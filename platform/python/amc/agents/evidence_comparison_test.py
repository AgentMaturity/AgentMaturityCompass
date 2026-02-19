#!/usr/bin/env python3
"""
Evidence Comparison Test
========================
Demonstrates how the old keyword-matching scoring is gameable,
and how the new evidence-based scoring produces honest results.

Compares:
  1. OLD: score_all() with keyword-stuffed answers → inflated score
  2. NEW: score_with_evidence() with actual module verification → honest score
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from amc.score.dimensions import ScoringEngine, DIMENSION_RUBRICS, Dimension
from amc.score.evidence import EvidenceArtifact, EvidenceKind
from amc.score.evidence_collector import EvidenceCollector

CMB_PATH = Path(__file__).resolve().parent / "content_moderation_bot.py"


def run_comparison():
    engine = ScoringEngine()

    # ── OLD METHOD: keyword-stuffed answers ──────────────────────────
    # An attacker just jams all rubric keywords into every answer.
    print("=" * 70)
    print("OLD METHOD: Keyword-stuffed answers (gameable)")
    print("=" * 70)

    keyword_answers: dict[str, str] = {}
    for dim, rubrics in DIMENSION_RUBRICS.items():
        for rubric in rubrics:
            # Just concatenate all yes + evidence keywords — instant max score
            keyword_answers[rubric["qid"]] = " ".join(rubric["yes"] + rubric["evidence"])

    old_score = engine.score_all(keyword_answers)
    print(f"  Overall: {old_score.overall_level.value} (score={old_score.overall_score})")
    for ds in old_score.dimension_scores:
        print(f"    {ds.dimension.value:20s}: {ds.level.value} score={ds.score}")

    # ── NEW METHOD: evidence-based scoring ───────────────────────────
    # Collector inspects ContentModerationBot source and verifies modules.
    print(f"\n{'=' * 70}")
    print("NEW METHOD: Evidence-based scoring (execution-proof)")
    print("=" * 70)

    collector = EvidenceCollector()
    evidence = collector.collect_all(CMB_PATH)

    new_score = engine.score_with_evidence(evidence)
    print(f"  Overall: {new_score.overall_level.value} (score={new_score.overall_score})")
    for ds in new_score.dimension_scores:
        print(f"    {ds.dimension.value:20s}: {ds.level.value} score={ds.score}")

    # ── DELTA ────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("DELTA: How much keyword gaming inflated scores")
    print("=" * 70)
    print(f"  Overall: {old_score.overall_score} (keyword) vs {new_score.overall_score} (evidence) → inflation = +{old_score.overall_score - new_score.overall_score} points")

    for old_ds, new_ds in zip(old_score.dimension_scores, new_score.dimension_scores):
        delta = old_ds.score - new_ds.score
        print(f"    {old_ds.dimension.value:20s}: {old_ds.score:3d} → {new_ds.score:3d}  (Δ={delta:+d})")

    # ── TRUST BREAKDOWN ──────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("TRUST BREAKDOWN per evidence artifact")
    print("=" * 70)
    for art in evidence:
        icon = "✗" if art.execution_error else "✓"
        print(f"  {icon} {art.qid:10s} {art.kind.value:25s} trust={art.trust_score:.2f}  {art.claim[:60]}")

    return old_score, new_score, evidence


if __name__ == "__main__":
    old_score, new_score, evidence = run_comparison()
    print(f"\n✓ Comparison complete. Keyword inflation: +{old_score.overall_score - new_score.overall_score} points.")
