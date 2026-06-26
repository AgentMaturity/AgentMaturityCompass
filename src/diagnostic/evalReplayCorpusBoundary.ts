import type { AMCSurfaceName } from "../types.js";
import type { EvalReplayCorpusEvidenceReceipt } from "../eval/replayCorpusEvidenceReceipt.js";

export type DiagnosticEvalReplaySurfaceStatus = "ready" | "blocked";

export interface DiagnosticEvalReplayCorpusBoundary {
  source: "diagnostic-eval-replay-corpus-boundary";
  score: DiagnosticEvalReplaySurfaceStatus;
  shield: DiagnosticEvalReplaySurfaceStatus;
  watch: DiagnosticEvalReplaySurfaceStatus;
  allowedSurfaces: AMCSurfaceName[];
  blockedSurfaces: AMCSurfaceName[];
  failClosed: boolean;
  evidenceSummary: {
    manifestHash: string;
    fixtureHash: string;
    ciReceiptHash: string;
    scoreDelta0to1: number;
    signedEvidenceRefCount: number;
    failedRowIds: string[];
  };
  reason: string;
}

const requiredSurfaces: AMCSurfaceName[] = ["Score", "Shield", "Watch"];

function statusFor(surface: AMCSurfaceName, receipt: EvalReplayCorpusEvidenceReceipt): DiagnosticEvalReplaySurfaceStatus {
  return !receipt.failClosed && receipt.surfaces.includes(surface) ? "ready" : "blocked";
}

export function diagnoseEvalReplayCorpusBoundary(
  receipt: EvalReplayCorpusEvidenceReceipt,
): DiagnosticEvalReplayCorpusBoundary {
  const allowedSurfaces = requiredSurfaces.filter((surface) => statusFor(surface, receipt) === "ready");
  const blockedSurfaces = requiredSurfaces.filter((surface) => !allowedSurfaces.includes(surface));
  const failClosed = blockedSurfaces.length > 0 || receipt.failClosed;

  return {
    source: "diagnostic-eval-replay-corpus-boundary",
    score: statusFor("Score", receipt),
    shield: statusFor("Shield", receipt),
    watch: statusFor("Watch", receipt),
    allowedSurfaces,
    blockedSurfaces,
    failClosed,
    evidenceSummary: {
      manifestHash: receipt.manifestHash,
      fixtureHash: receipt.fixtureHash,
      ciReceiptHash: receipt.ciReceiptHash,
      scoreDelta0to1: receipt.scoreDelta0to1,
      signedEvidenceRefCount: receipt.signedEvidenceRefCount,
      failedRowIds: receipt.failedRowIds,
    },
    reason: failClosed
      ? "Source metadata, dashboard labels, or unsigned eval output cannot diagnose Score/Shield/Watch readiness without complete replay-corpus evidence."
      : "Replay-corpus evidence is sufficient for diagnostic Score/Shield/Watch readiness checks.",
  };
}
