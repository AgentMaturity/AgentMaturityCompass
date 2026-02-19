"""
AMC Score — Adversarial Robustness Tester

Systematically attempts to inflate AMC scores without real implementation
to prove (and document) the execution-proof evidence system's resistance to gaming.

Attack surface tested:
  1. keyword_stuffing_attack    — Floods answers with all rubric keywords
  2. execution_proof_defense    — Same stuffed text re-scored via EvidenceCollector
  3. mock_execution_attack      — Patches sys.modules with MagicMocks to fake imports
  4. hardcoded_output_attack    — Directly forges EvidenceArtifact objects

Usage::

    tester = AdversarialTester()
    summary = tester.run_all_attacks()
    print(tester.generate_report())
"""
from __future__ import annotations

import sys
import tempfile
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import structlog

from amc.score.dimensions import (
    DIMENSION_RUBRICS,
    Dimension,
    MaturityLevel,
    ScoringEngine,
)
from amc.score.evidence import (
    TRUST_MULTIPLIERS,
    EvidenceArtifact,
    EvidenceKind,
)
from amc.score.evidence_collector import QID_TO_MODULE, EvidenceCollector

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    """Return current UTC timestamp as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _all_rubrics() -> list[dict[str, Any]]:
    """Flatten all rubrics from all dimensions into a single list."""
    return [
        rubric
        for rubrics in DIMENSION_RUBRICS.values()
        for rubric in rubrics
    ]


def _build_stuffed_answers() -> dict[str, str]:
    """
    Build maximally keyword-stuffed answers for every rubric question.

    Each answer contains every 'yes' keyword and every 'evidence' keyword
    from its rubric, repeated twice to maximise keyword hit count while
    containing zero real information.

    Example for gov_1:
        "policy documented approval review soc2 iso framework committee
         policy documented approval review soc2 iso framework committee"
    """
    answers: dict[str, str] = {}
    for rubric in _all_rubrics():
        all_kw = rubric["yes"] + rubric["evidence"]
        answers[rubric["qid"]] = " ".join(all_kw * 2)  # double-stuff
    return answers


def _score_keyword_baseline(stuffed: dict[str, str]) -> int:
    """Run the old keyword-based ScoringEngine and return overall_score."""
    return ScoringEngine().score_all(stuffed).overall_score


def _honest_evidence_score(engine: ScoringEngine) -> int:
    """Return the evidence-based score when NO artifacts exist (zero evidence)."""
    composite = engine.score_with_evidence([])
    return composite.overall_score


def _build_fake_source_comments() -> str:
    """
    Build a Python-like source file that mentions every module path as a
    comment — simulating an agent that 'name-drops' modules without importing
    them (keyword stuffing inside code).
    """
    lines = ["# Fake agent — module names present as comments only\n"]
    for qid, (mod_path, cls_name) in QID_TO_MODULE.items():
        lines.append(f"# {qid}: {mod_path} {cls_name or ''}\n")
        lines.append(f"# import {mod_path}\n")
        if cls_name:
            lines.append(f"# {cls_name}\n")
    return "".join(lines)


def _build_fake_source_imports() -> str:
    """
    Build a fake source file with real import statements for every mapped
    module — used in mock_execution_attack to trigger the 'module referenced
    in source' check inside EvidenceCollector.
    """
    lines = ["# Mock-attack agent — real import statements, no real logic\n"]
    for qid, (mod_path, cls_name) in QID_TO_MODULE.items():
        lines.append(f"import {mod_path}  # {qid}\n")
        if cls_name:
            lines.append(f"from {mod_path} import {cls_name}\n")
    return "".join(lines)


def _collect_via_temp_file(collector: EvidenceCollector, source_text: str) -> list[EvidenceArtifact]:
    """Write source_text to a temp file, run collect_all, then delete it."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, prefix="amc_adversarial_"
    ) as f:
        f.write(source_text)
        temp_path = Path(f.name)
    try:
        return collector.collect_all(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# AdversarialTester
# ---------------------------------------------------------------------------

class AdversarialTester:
    """
    Systematically probes the AMC scoring system for gaming vectors.

    Each attack method returns a result dict with at minimum:
        {
            "attack":            str,
            "description":       str,
            "old_score":         int,   # inflated / attacker score
            "new_score":         int | None,  # defended score (or None if N/A)
            "inflation_blocked": bool,  # True if defense prevents significant inflation
            "detail":            dict,  # attack-specific diagnostics
        }
    """

    def __init__(self) -> None:
        self.engine = ScoringEngine()
        self.collector = EvidenceCollector()
        self._results: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Attack 1 — Keyword Stuffing
    # ------------------------------------------------------------------

    def keyword_stuffing_attack(self) -> dict[str, Any]:
        """
        Creates answers packed with all rubric keywords for every question
        and scores them with the OLD keyword-based ScoringEngine.

        This exposes the baseline vulnerability: a motivated attacker who
        reads the rubric YAML can achieve near-perfect scores with zero
        real AI-agent infrastructure by simply echoing keywords back.

        Expected result:
            overall_score ≈ 84–100  (despite zero real implementation)
            inflation_blocked = False  (old scorer cannot detect this)
        """
        stuffed = _build_stuffed_answers()
        composite = self.engine.score_all(stuffed)

        result: dict[str, Any] = {
            "attack": "keyword_stuffing",
            "description": (
                "Every answer is built from all 'yes' and 'evidence' keywords in its rubric, "
                "doubled for maximum hit count. Scored with the keyword-matching ScoringEngine. "
                "No real implementation exists — just word salad."
            ),
            "old_score": composite.overall_score,
            "new_score": None,  # Only the old scorer is tested in this method
            "inflation_blocked": False,  # Old scorer has no defence
            "detail": {
                "questions_stuffed": len(stuffed),
                "level_achieved": composite.overall_level.value,
                "verdict": (
                    "VULNERABLE — keyword system awards full maturity to empty claims"
                ),
                "per_dimension": {
                    ds.dimension.value: ds.score
                    for ds in composite.dimension_scores
                },
            },
        }

        log.info(
            "adversarial.keyword_stuffing",
            old_score=composite.overall_score,
            level=composite.overall_level.value,
        )
        self._results["keyword_stuffing"] = result
        return result

    # ------------------------------------------------------------------
    # Attack 2 — Execution-Proof Defense
    # ------------------------------------------------------------------

    def execution_proof_defense(self) -> dict[str, Any]:
        """
        Applies the SAME keyword-stuffed content but now scores via the
        EvidenceCollector that requires actual module import and instantiation.

        A fake 'agent' source file is created that references every module
        name as a comment (simulating code that names modules without using
        them). The collector tries real imports:

          - Modules that cannot be imported  →  CODE_PRESENT artifact
                                                 + execution_error set
                                                 → 0 points in score_with_evidence
          - structlog (genuinely importable) →  IMPORT_VERIFIED (0.70×)
                                                 → partial points only

        Expected result:
            old_score ≈ 84+ (keyword system)
            new_score ≈  0–5 (evidence system, nearly nothing provable)
            inflation_blocked = True
        """
        stuffed = _build_stuffed_answers()
        old_composite = self.engine.score_all(stuffed)

        # Build fake source with module names only in comments
        source_text = _build_fake_source_comments()
        artifacts = _collect_via_temp_file(self.collector, source_text)

        new_composite = self.engine.score_with_evidence(artifacts)

        # Summarise trust distribution
        trust_breakdown: dict[str, int] = {k.value: 0 for k in EvidenceKind}
        failed_count = 0
        for art in artifacts:
            trust_breakdown[art.kind.value] += 1
            if art.execution_error:
                failed_count += 1

        result: dict[str, Any] = {
            "attack": "execution_proof_defense",
            "description": (
                "Same keyword-stuffed content, now scored by the evidence system. "
                "A fake source file contains module names only as comments. "
                "EvidenceCollector finds references but cannot import real modules "
                "→ execution_error is set → score_with_evidence awards 0 points."
            ),
            "old_score": old_composite.overall_score,
            "new_score": new_composite.overall_score,
            "inflation_blocked": (
                new_composite.overall_score < old_composite.overall_score - 20
            ),
            "detail": {
                "artifacts_collected": len(artifacts),
                "failed_execution": failed_count,
                "trust_breakdown": trust_breakdown,
                "score_delta": old_composite.overall_score - new_composite.overall_score,
                "old_level": old_composite.overall_level.value,
                "new_level": new_composite.overall_level.value,
                "verdict": (
                    "BLOCKED — execution-proof scoring collapses inflated keyword score"
                ),
            },
        }

        log.info(
            "adversarial.execution_proof_defense",
            old_score=old_composite.overall_score,
            new_score=new_composite.overall_score,
            delta=old_composite.overall_score - new_composite.overall_score,
        )
        self._results["execution_proof_defense"] = result
        return result

    # ------------------------------------------------------------------
    # Attack 3 — Mock Execution Attack
    # ------------------------------------------------------------------

    def mock_execution_attack(self) -> dict[str, Any]:
        """
        Pre-patches ``sys.modules`` with ``MagicMock`` objects so that every
        ``importlib.import_module()`` call inside EvidenceCollector appears to
        succeed and every ``cls()`` call appears to instantiate normally.

        How it works:
          1. For each module path in QID_TO_MODULE, a MagicMock is inserted
             into sys.modules under the full dotted name.
          2. A fake source file is written with real ``import`` statements so
             EvidenceCollector's source-reference check passes.
          3. Within the ``patch.dict`` context, collect_all() is invoked;
             importlib finds the mocks immediately in sys.modules.

        Why it partially succeeds today:
          EvidenceCollector escalates to EXECUTION_VERIFIED when
          ``instance = cls()`` does not raise — and MagicMock never raises.
          score_with_evidence() trusts ``kind`` alone; it does not validate
          what ``execution_result`` actually contains.

        Detection signal (partial):
          execution_result strings that contain "MagicMock" are detectable
          with a simple string check — but only if the real collector is also
          patched to record the repr of the instance.

        Expected result:
            mocked_score ≈ 35–50 (inflated via mock, higher than honest baseline)
            honest_score ≈  0–5  (what the system reports without mocking)
            inflation_blocked = False  (mocking elevates trust scores)
        """
        source_text = _build_fake_source_imports()

        # Build mock registry: patch only modules NOT already loaded
        mock_modules: dict[str, Any] = {}
        for _qid, (mod_path, cls_name) in QID_TO_MODULE.items():
            # Patch the leaf module
            if mod_path not in sys.modules:
                if mod_path not in mock_modules:
                    mock_mod = MagicMock()
                    mock_modules[mod_path] = mock_mod
                if cls_name:
                    mock_cls = MagicMock(return_value=MagicMock())
                    setattr(mock_modules[mod_path], cls_name, mock_cls)

            # Patch parent packages that aren't loaded yet
            parts = mod_path.split(".")
            for depth in range(1, len(parts)):
                partial = ".".join(parts[:depth])
                if partial not in sys.modules and partial not in mock_modules:
                    mock_modules[partial] = MagicMock()

        # Run collection under mock
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, prefix="amc_mock_attack_"
        ) as f:
            f.write(source_text)
            temp_path = Path(f.name)

        try:
            with patch.dict(sys.modules, mock_modules):
                mocked_artifacts = self.collector.collect_all(temp_path)
        finally:
            temp_path.unlink(missing_ok=True)

        mocked_composite = self.engine.score_with_evidence(mocked_artifacts)

        # Honest baseline: evidence system with no artifacts
        honest_score = _honest_evidence_score(self.engine)

        # Detection heuristics
        exec_verified_count = sum(
            1 for a in mocked_artifacts
            if a.kind == EvidenceKind.EXECUTION_VERIFIED
        )
        trivial_mock_results = sum(
            1 for a in mocked_artifacts
            if a.execution_result is not None
            and "MagicMock" in str(type(a.execution_result).__name__)
        )
        # Heuristic: all artifacts collected in <1 ms from each other (batch timing)
        mock_detected = trivial_mock_results > 0

        result: dict[str, Any] = {
            "attack": "mock_execution_attack",
            "description": (
                "sys.modules is patched with MagicMock objects before EvidenceCollector "
                "runs. Fake import statements in source pass the reference check. "
                "MagicMock never raises on cls() → EXECUTION_VERIFIED trust (1.0×). "
                "This partially inflates the score for all mapped qids."
            ),
            "old_score": mocked_composite.overall_score,   # attacker achieves this
            "new_score": honest_score,                      # honest baseline (no evidence)
            "inflation_blocked": False,  # mocking does elevate scores above honest baseline
            "detail": {
                "modules_mocked": len(mock_modules),
                "artifacts_collected": len(mocked_artifacts),
                "exec_verified_via_mock": exec_verified_count,
                "trivial_mock_results_detected": trivial_mock_results,
                "mock_detected_by_string_check": mock_detected,
                "mocked_score": mocked_composite.overall_score,
                "honest_score": honest_score,
                "verdict": (
                    "PARTIAL GAP — mocking elevates mapped qids to EXECUTION_VERIFIED; "
                    "unmapped qids still score 0; net inflation is real but capped"
                ),
                "known_gap": (
                    "score_with_evidence() trusts kind alone. "
                    "Mitigation: validate execution_result type/structure; "
                    "require artifacts to carry a server-signed provenance token."
                ),
            },
        }

        log.info(
            "adversarial.mock_execution",
            exec_verified=exec_verified_count,
            mock_detected=mock_detected,
            mocked_score=mocked_composite.overall_score,
            honest_score=honest_score,
        )
        self._results["mock_execution_attack"] = result
        return result

    # ------------------------------------------------------------------
    # Attack 4 — Hardcoded Output Attack
    # ------------------------------------------------------------------

    def hardcoded_output_attack(self) -> dict[str, Any]:
        """
        Bypasses the EvidenceCollector entirely by manually constructing
        ``EvidenceArtifact`` objects with ``kind=EXECUTION_VERIFIED`` and
        hardcoded ``execution_result`` strings that mimic genuine collector
        output (e.g. ``"ToolPolicyFirewall instance created"``).

        This simulates an attacker who has read the EvidenceCollector source
        and knows the exact format of legitimate artifacts.

        Why it works today:
          score_with_evidence() only inspects ``kind`` and ``execution_error``;
          it does not verify *who* created the artifact or how.

        Detection heuristics (passive):
          - All artifacts share an identical verified_at timestamp (batch-created).
          - All execution_result strings follow the same "ClassName instance created"
            / "module: path" template (no live entropy).

        Expected result:
            fabricated_score ≈ 35–50  (same as mock attack, same qid coverage)
            honest_score     ≈  0     (no real evidence)
            inflation_blocked = False  (fabrication is not caught by scorer)
        """
        now_ts = _now()
        fabricated_artifacts: list[EvidenceArtifact] = []

        for qid, (mod_path, cls_name) in QID_TO_MODULE.items():
            # Mirror the exact strings that the real EvidenceCollector emits
            fake_result = (
                f"{cls_name} instance created"
                if cls_name
                else f"module: {mod_path}"
            )
            art = EvidenceArtifact(
                qid=qid,
                kind=EvidenceKind.EXECUTION_VERIFIED,
                claim=f"Hardcoded: {cls_name or mod_path} instantiated successfully",
                execution_result=fake_result,
                execution_error=None,
                verified_at=now_ts,  # identical timestamp — a tell
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.EXECUTION_VERIFIED),
            )
            fabricated_artifacts.append(art)

        fabricated_composite = self.engine.score_with_evidence(fabricated_artifacts)
        honest_score = _honest_evidence_score(self.engine)

        # Apply detection heuristics
        timestamps = [a.verified_at for a in fabricated_artifacts]
        same_timestamp_batch: bool = len(set(timestamps)) == 1

        identical_result_pattern: bool = all(
            (
                isinstance(a.execution_result, str)
                and (
                    a.execution_result.endswith("instance created")
                    or a.execution_result.startswith("module:")
                )
            )
            for a in fabricated_artifacts
        )

        detection_triggered: bool = same_timestamp_batch or identical_result_pattern

        result: dict[str, Any] = {
            "attack": "hardcoded_output_attack",
            "description": (
                "Manually constructs EvidenceArtifact objects with kind=EXECUTION_VERIFIED "
                "and hardcoded execution_result strings that mirror legitimate collector output. "
                "Bypasses EvidenceCollector entirely. "
                "Scoring engine trusts the artifact kind without provenance verification."
            ),
            "old_score": fabricated_composite.overall_score,   # what attacker achieves
            "new_score": honest_score,                          # honest zero-evidence score
            "inflation_blocked": False,  # scorer cannot detect fabricated artifacts
            "detail": {
                "fabricated_artifacts": len(fabricated_artifacts),
                "fabricated_score": fabricated_composite.overall_score,
                "honest_score": honest_score,
                "same_timestamp_batch_detected": same_timestamp_batch,
                "identical_result_pattern_detected": identical_result_pattern,
                "passive_heuristics_triggered": detection_triggered,
                "verdict": (
                    "GAP — forged artifacts score identically to real ones; "
                    "passive heuristics (timestamp + string pattern) fire but are not enforced"
                ),
                "known_gap": (
                    "Artifacts lack cryptographic provenance. "
                    "Mitigation: sign artifacts with a server-side HMAC using "
                    "collector host identity + timestamp + qid + execution_result hash."
                ),
            },
        }

        log.info(
            "adversarial.hardcoded_output",
            fabricated_score=fabricated_composite.overall_score,
            heuristics_triggered=detection_triggered,
        )
        self._results["hardcoded_output_attack"] = result
        return result

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------

    def run_all_attacks(self) -> dict[str, dict[str, Any]]:
        """
        Run all four adversarial attacks in sequence.

        Returns:
            A summary dict keyed by attack name, each value containing:
                {
                    "old_score":         int | None,
                    "new_score":         int | None,
                    "inflation_blocked": bool,
                }
        """
        attacks: list[tuple[str, Any]] = [
            ("keyword_stuffing",       self.keyword_stuffing_attack),
            ("execution_proof_defense", self.execution_proof_defense),
            ("mock_execution_attack",   self.mock_execution_attack),
            ("hardcoded_output_attack", self.hardcoded_output_attack),
        ]

        summary: dict[str, dict[str, Any]] = {}
        for name, fn in attacks:
            try:
                result = fn()
                summary[name] = {
                    "old_score": result["old_score"],
                    "new_score": result["new_score"],
                    "inflation_blocked": result["inflation_blocked"],
                }
            except Exception as exc:  # noqa: BLE001
                log.error("adversarial.attack_failed", attack=name, error=str(exc))
                summary[name] = {
                    "old_score": None,
                    "new_score": None,
                    "inflation_blocked": False,
                    "error": str(exc),
                }

        return summary

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------

    def generate_report(self) -> str:
        """
        Generate a human-readable adversarial robustness report.

        Runs all attacks if they haven't already been run, then formats
        results as a structured plain-text document showing:
          - Per-attack scores, deltas, and block status
          - Per-dimension breakdown where available
          - Known gaps and recommended mitigations
          - Summary table

        Returns:
            Multi-line string suitable for printing to stdout.
        """
        if not self._results:
            self.run_all_attacks()

        W = 72  # total line width
        sep = "═" * W
        thin = "─" * W

        lines: list[str] = [
            sep,
            "  AMC SCORING SYSTEM — ADVERSARIAL ROBUSTNESS REPORT",
            sep,
            f"  Generated : {_now()}",
            f"  Purpose   : Prove the execution-proof evidence system resists gaming",
            f"  Coverage  : {len(DIMENSION_RUBRICS)} dimensions, "
            f"{len(_all_rubrics())} rubric questions, "
            f"{len(QID_TO_MODULE)} module mappings",
            "",
        ]

        _attacks_meta: list[tuple[str, str]] = [
            ("keyword_stuffing",        "Attack 1 — Keyword Stuffing"),
            ("execution_proof_defense", "Attack 2 — Execution-Proof Defense"),
            ("mock_execution_attack",   "Attack 3 — Mock Execution"),
            ("hardcoded_output_attack", "Attack 4 — Hardcoded Output Fabrication"),
        ]

        for key, label in _attacks_meta:
            res = self._results.get(key, {})
            old: int | None = res.get("old_score")
            new: int | None = res.get("new_score")
            blocked: bool = res.get("inflation_blocked", False)
            desc: str = res.get("description", "—")
            detail: dict[str, Any] = res.get("detail", {})
            error: str | None = res.get("error")

            lines += [thin, f"  {label}", thin]

            if error:
                lines.append(f"  ⚠  ERROR: {error}")
                lines.append("")
                continue

            # Description (wrapped)
            wrapped_desc = textwrap.fill(
                desc, width=W - 4,
                initial_indent="  ",
                subsequent_indent="  ",
            )
            lines.append(wrapped_desc)
            lines.append("")

            # Scores
            if old is not None:
                lines.append(f"  Attacker score  (old / inflated) : {old:>3}/100")
            if new is not None:
                lines.append(f"  Defended score  (new / evidence)  : {new:>3}/100")
            if old is not None and new is not None:
                delta = old - new
                status = "✓ BLOCKED" if blocked else "✗ NOT BLOCKED"
                lines.append(f"  Score inflation delta             : {delta:>+4} pts  [{status}]")
            elif old is not None:
                status = "✓ BLOCKED" if blocked else "✗ NOT BLOCKED"
                lines.append(f"  Status                            : [{status}]")
            lines.append("")

            # Per-dimension detail
            if "per_dimension" in detail:
                lines.append("  Per-dimension scores (keyword-stuffed keyword scorer):")
                for dim, score in detail["per_dimension"].items():
                    bar = "█" * (score // 5)
                    lines.append(f"    {dim:<22} {score:>3}/100  {bar}")
                lines.append("")

            # Trust breakdown
            if "trust_breakdown" in detail:
                lines.append("  Evidence trust breakdown:")
                for kind, count in detail["trust_breakdown"].items():
                    if count > 0:
                        mult = TRUST_MULTIPLIERS.get(EvidenceKind(kind), 0.0)
                        lines.append(
                            f"    {kind:<30} {count:>2} artifact(s)  "
                            f"(multiplier {mult:.2f}×)"
                        )
                lines.append("")

            # Verdict
            verdict = detail.get("verdict", "")
            if verdict:
                wrapped_v = textwrap.fill(
                    f"  Verdict: {verdict}", width=W - 2,
                    subsequent_indent="           ",
                )
                lines.append(wrapped_v)
                lines.append("")

            # Known gap
            gap = detail.get("known_gap", "")
            if gap:
                wrapped_g = textwrap.fill(
                    f"  ⚠  Gap: {gap}", width=W - 2,
                    subsequent_indent="          ",
                )
                lines.append(wrapped_g)
                lines.append("")

        # ── Summary table ─────────────────────────────────────────────
        lines += [
            sep,
            "  SUMMARY TABLE",
            sep,
            f"  {'Attack':<34} {'Attacker':>8} {'Defended':>8} {'Blocked':>9}",
            f"  {'-' * 34} {'-'*8} {'-'*8} {'-'*9}",
        ]
        for key, label in _attacks_meta:
            res = self._results.get(key, {})
            old = res.get("old_score")
            new = res.get("new_score")
            blocked = res.get("inflation_blocked", False)

            old_s = f"{old:>5}/100" if old is not None else "    N/A"
            new_s = f"{new:>5}/100" if new is not None else "    N/A"
            blk_s = "YES ✓" if blocked else "NO  ✗"
            short = label.split("—", 1)[-1].strip()[:33]
            lines.append(f"  {short:<34} {old_s:>8} {new_s:>8} {blk_s:>9}")

        # ── Conclusions ────────────────────────────────────────────────
        lines += [
            "",
            sep,
            "  CONCLUSIONS",
            thin,
            "  [STRONG ✓]  Keyword stuffing is fully neutralised by evidence scoring.",
            "  [STRONG ✓]  Execution-proof defense drops inflated scores to near-zero.",
            "  [GAP    ✗]  Mock-import attack (sys.modules patching) partially inflates",
            "              scores for mapped qids; unmapped qids remain at zero.",
            "  [GAP    ✗]  Fabricated EvidenceArtifact objects score identically to real",
            "              ones — no cryptographic provenance check exists today.",
            "",
            "  RECOMMENDED MITIGATIONS",
            thin,
            "  1. Semantic validation — inspect execution_result type, structure, and",
            "     value range; reject MagicMock / None / static string patterns.",
            "  2. Artifact signing — HMAC-sign each EvidenceArtifact at collection",
            "     time using collector host identity + qid + result hash.",
            "  3. Live trace anchoring — require a verified OpenTelemetry trace-id",
            "     from the AMC observability layer, linking artifact to real execution.",
            "  4. Re-score rate-limiting — detect score-farming by rate-limiting",
            "     how often the same organisation can re-submit assessments.",
            "  5. Expand QID_TO_MODULE — currently only 18 of "
            f"{len(_all_rubrics())} qids have",
            "     module mappings; unmapped qids fall back to low-trust keyword claims.",
            sep,
        ]

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("AMC Adversarial Robustness Tester")
    print("Attempting score inflation via 4 attack vectors...\n")

    tester = AdversarialTester()

    # Run all attacks and capture summary
    summary = tester.run_all_attacks()

    # Print structured report
    report = tester.generate_report()
    print(report)

    # Print machine-readable summary
    print("\nMachine-readable summary:")
    print("-" * 60)
    for attack_name, stats in summary.items():
        old = stats.get("old_score")
        new = stats.get("new_score")
        blocked = stats.get("inflation_blocked", False)
        err = stats.get("error")
        if err:
            print(f"  {attack_name:<30}  ERROR: {err[:40]}")
        else:
            old_s = f"{old:>3}" if old is not None else "N/A"
            new_s = f"{new:>3}" if new is not None else "N/A"
            blk_s = "BLOCKED ✓" if blocked else "NOT BLOCKED ✗"
            print(f"  {attack_name:<30}  old={old_s}  new={new_s}  {blk_s}")

    sys.exit(0)
