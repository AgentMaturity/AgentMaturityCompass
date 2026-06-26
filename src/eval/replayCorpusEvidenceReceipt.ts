import type { AMCSurfaceName } from "../types.js";
import type { ReplayBenchmarkCorpusResult } from "../benchmarks/replayBenchmarkCorpus.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type EvalReplayCorpusEvidenceStatus = "ready" | "fail_closed";

export interface EvalReplayCorpusEvidenceReceipt {
  source: "eval-replay-corpus";
  status: EvalReplayCorpusEvidenceStatus;
  manifestHash: string;
  fixtureHash: string;
  ciReceiptHash: string;
  scoreDelta0to1: number;
  rowCount: number;
  failedRowIds: string[];
  surfaces: AMCSurfaceName[];
  sourceRefs: string[];
  signedEvidenceRefCount: number;
  replayManifestPresent: boolean;
  fixtureHashPresent: boolean;
  ciReceiptPresent: boolean;
  scoreDeltaPresent: boolean;
  failClosed: boolean;
  issues: string[];
  recommendation: string;
}

const requiredEvalReplaySurfaces: AMCSurfaceName[] = ["Score", "Shield", "Watch"];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function hasAllRequiredSurfaces(surfaces: AMCSurfaceName[]): boolean {
  return requiredEvalReplaySurfaces.every((surface) => surfaces.includes(surface));
}

function isHashLike(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function buildEvalReplayCorpusEvidenceReceipt(
  result: ReplayBenchmarkCorpusResult,
): EvalReplayCorpusEvidenceReceipt {
  const surfaces = unique(result.manifest.rows.flatMap((row) => row.surfaces));
  const signedEvidenceRefCount = result.manifest.rows.reduce(
    (count, row) => count + row.signedEvidenceRefs.length,
    0,
  );
  const failedRowIds = unique([
    ...result.ciReceipt.failedRowIds,
    ...result.manifest.rows.filter((row) => row.status !== "passed").map((row) => row.rowId),
  ]);
  const rowIssues = result.manifest.rows.flatMap((row) => row.issues.map((issue) => `${row.rowId}: ${issue}`));
  const issues = [...rowIssues];

  if (!hasAllRequiredSurfaces(surfaces)) {
    issues.push("eval replay corpus must cover Score, Shield, and Watch surfaces");
  }
  if (result.manifest.sourceRefs.length === 0) {
    issues.push("eval replay corpus source refs missing");
  }
  if (signedEvidenceRefCount === 0) {
    issues.push("eval replay corpus signed evidence missing");
  }
  if (!isHashLike(result.manifest.manifestHash)) {
    issues.push("eval replay corpus manifest hash invalid");
  }
  if (!isHashLike(result.manifest.fixtureHash)) {
    issues.push("eval replay corpus fixture hash invalid");
  }

  const pass = result.manifest.replayable && result.ciReceipt.passed && !result.ciReceipt.failClosed && issues.length === 0;
  const ciReceiptHash = sha256Hex(canonicalize(result.ciReceipt));

  return {
    source: "eval-replay-corpus",
    status: pass ? "ready" : "fail_closed",
    manifestHash: result.manifest.manifestHash,
    fixtureHash: result.manifest.fixtureHash,
    ciReceiptHash,
    scoreDelta0to1: result.manifest.scoreDelta0to1,
    rowCount: result.manifest.rowCount,
    failedRowIds,
    surfaces,
    sourceRefs: result.manifest.sourceRefs,
    signedEvidenceRefCount,
    replayManifestPresent: isHashLike(result.manifest.manifestHash),
    fixtureHashPresent: isHashLike(result.manifest.fixtureHash),
    ciReceiptPresent: isHashLike(ciReceiptHash),
    scoreDeltaPresent: Number.isFinite(result.manifest.scoreDelta0to1),
    failClosed: !pass,
    issues,
    recommendation: pass
      ? "Eval replay corpus evidence is bound to manifest, fixture hash, score delta, signed rows, and CI receipt for Score/Shield/Watch use."
      : "Fail closed: do not use source metadata or unsigned eval rows as Score/Shield/Watch evidence until replay manifest, fixture hash, score delta, signed rows, and CI receipt proof are complete.",
  };
}
