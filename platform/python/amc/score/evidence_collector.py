"""
AMC Score — Evidence Collector
Inspects agent source files and automatically collects execution-proof evidence.
Escalates from CODE_PRESENT → IMPORT_VERIFIED → EXECUTION_VERIFIED.
"""
from __future__ import annotations

import importlib
import re
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.score.evidence import EvidenceArtifact, EvidenceKind

log = structlog.get_logger(__name__)


# Maps rubric qid → (module_path, class_name) that proves the capability.
# class_name=None means just importing the module is sufficient proof.
QID_TO_MODULE: dict[str, tuple[str, str | None]] = {
    "gov_1": ("amc.enforce.e1_policy", "ToolPolicyFirewall"),
    "gov_3": ("amc.watch.w1_receipts", "ReceiptsLedger"),
    "gov_4": ("amc.enforce.e6_stepup", "StepUpAuth"),
    "gov_5": ("amc.product.approval_workflow", "ApprovalWorkflowManager"),
    "sec_1": ("amc.enforce.e1_policy", "ToolPolicyFirewall"),
    "sec_2": ("amc.shield.s10_detector", "InjectionDetector"),
    "sec_3": ("amc.vault.v2_dlp", "DLPRedactor"),
    "sec_4": ("amc.shield.s1_analyzer", "SkillAnalyzer"),
    "sec_5": ("amc.shield.s15_threat_intel", "ThreatIntelFeed"),
    "rel_1": ("amc.enforce.e5_circuit_breaker", "CircuitBreaker"),
    "rel_3": ("amc.product.tool_reliability", "ToolReliabilityPredictor"),
    "eval_1": ("amc.watch.w7_explainability_packet", "ExplainabilityPacketer"),
    "eval_2": ("amc.watch.w2_assurance", "AssuranceSuite"),
    "eval_4": ("amc.watch.w4_safety_testkit", "SafetyTestkit"),
    "obs_1": ("structlog", None),
    "obs_4": ("amc.watch.w1_receipts", "ReceiptsLedger"),
    "cost_2": ("amc.product.cost_latency_router", "CostLatencyRouter"),
    "cost_4": ("amc.product.metering", "UsageMeteringLedger"),
}


class EvidenceCollector:
    """
    Inspects an agent's source file and collects execution-proof evidence
    for each rubric question, escalating through trust levels.
    """

    def __init__(self, qid_to_module: dict[str, tuple[str, str | None]] | None = None):
        self.qid_to_module = qid_to_module or QID_TO_MODULE

    def collect_from_file(
        self, agent_file: Path, qid: str, module_path: str | None = None, class_name: str | None = None,
    ) -> EvidenceArtifact:
        """
        Collect evidence for a single qid by inspecting agent source and
        attempting import + instantiation of the mapped module.

        Escalation:
          1. Check if module is referenced in agent source → CODE_PRESENT
          2. Try to import the module                     → IMPORT_VERIFIED
          3. Try to instantiate the class                 → EXECUTION_VERIFIED

        Args:
            agent_file: Path to the agent's source file.
            qid: Question ID from the rubric.
            module_path: Override module path (else uses QID_TO_MODULE).
            class_name: Override class name (else uses QID_TO_MODULE).

        Returns:
            EvidenceArtifact with the highest trust level achieved.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Resolve module mapping
        if module_path is None:
            mapping = self.qid_to_module.get(qid)
            if mapping is None:
                return EvidenceArtifact(
                    qid=qid, kind=EvidenceKind.KEYWORD_CLAIM,
                    claim=f"No module mapping for {qid}",
                    verified_at=now,
                    trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.KEYWORD_CLAIM),
                )
            module_path, class_name = mapping

        # Step 1: Check if module is referenced in source
        try:
            source = agent_file.read_text()
        except Exception as e:
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.KEYWORD_CLAIM,
                claim=f"Could not read {agent_file}: {e}",
                execution_error=str(e), verified_at=now,
                trust_score=0.0,
            )

        # Check for import/reference of the module in source
        module_short = module_path.split(".")[-1]
        module_referenced = (
            module_path in source
            or module_short in source
            or (class_name and class_name in source)
        )

        if not module_referenced:
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.KEYWORD_CLAIM,
                claim=f"Module {module_path} not referenced in {agent_file.name}",
                verified_at=now,
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.KEYWORD_CLAIM),
            )

        # Step 2: Try to import the module
        try:
            mod = importlib.import_module(module_path)
        except Exception as e:
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.CODE_PRESENT,
                claim=f"{module_path} referenced in source but import failed: {e}",
                execution_error=str(e), verified_at=now,
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.CODE_PRESENT),
            )

        if class_name is None:
            # Module-only check (e.g. structlog)
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.IMPORT_VERIFIED,
                claim=f"{module_path} imported successfully",
                execution_result=f"module: {module_path}",
                verified_at=now,
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.IMPORT_VERIFIED),
            )

        # Step 3: Try to get and instantiate the class
        cls = getattr(mod, class_name, None)
        if cls is None:
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.IMPORT_VERIFIED,
                claim=f"{module_path} imported but {class_name} not found",
                execution_result=f"module imported, class missing",
                verified_at=now,
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.IMPORT_VERIFIED),
            )

        try:
            instance = cls()
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.EXECUTION_VERIFIED,
                claim=f"{class_name} from {module_path} instantiated successfully",
                execution_result=f"{class_name} instance created",
                verified_at=now,
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.EXECUTION_VERIFIED),
            )
        except Exception as e:
            return EvidenceArtifact(
                qid=qid, kind=EvidenceKind.IMPORT_VERIFIED,
                claim=f"{class_name} imported but instantiation failed: {e}",
                execution_error=str(e),
                verified_at=now,
                trust_score=0.0,  # Failed execution = 0
            )

    def collect_all(self, agent_file: Path) -> list[EvidenceArtifact]:
        """Collect evidence for all mapped qids from an agent source file."""
        artifacts = []
        for qid in self.qid_to_module:
            artifact = self.collect_from_file(agent_file, qid)
            artifacts.append(artifact)
            log.debug("evidence.collected", qid=qid, kind=artifact.kind.value, trust=artifact.trust_score)
        return artifacts
