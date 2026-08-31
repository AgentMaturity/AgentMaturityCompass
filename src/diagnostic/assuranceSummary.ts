import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sealedRunReportVerifies } from "./reportSeal.js";

/**
 * The assurance evidence a diagnostic run may count, and what it refused.
 *
 * Extracted from runner.ts when verification was added: the loader used to
 * parse reports/assurance/*.json and BELIEVE EVERY FIELD — a hand-written file
 * claiming `trustTier: "OBSERVED"` and a score of 100 flowed into maturity
 * scoring as measured evidence. The runner signs every report it writes and
 * `verifyLedgerIntegrity` checks those signatures; the scoring path was the
 * one consumer that never looked.
 */
export interface AssuranceSummary {
  packScores: Map<string, number>;
  packSucceeded: Map<string, number>;
  packObserved: Set<string>;
  auditCounts: Map<string, number>;
  /**
   * Report files inside the window whose hash did not recompute or whose seal
   * did not verify. They contributed nothing above; they are named here so the
   * diagnostic can say so instead of silently scoring around them.
   */
  unverifiableReports: string[];
}

interface ParsedReport {
  ts?: number;
  windowStartTs?: number;
  windowEndTs?: number;
  trustTier?: string;
  reportJsonSha256?: string;
  runSealSig?: string;
  packResults?: Array<{
    packId?: string;
    score0to100?: number;
    scenarioResults?: Array<{ auditEventTypes?: string[] }>;
  }>;
}

export function loadAssuranceSummary(
  workspace: string,
  agentId: string,
  windowStartTs: number,
  windowEndTs: number
): AssuranceSummary {
  const summary: AssuranceSummary = {
    packScores: new Map<string, number>(),
    packSucceeded: new Map<string, number>(),
    packObserved: new Set<string>(),
    auditCounts: new Map<string, number>(),
    unverifiableReports: []
  };
  const agentPaths = getAgentPaths(workspace, agentId);
  const dir = join(agentPaths.reportsDir, "assurance");
  if (!pathExists(dir)) {
    return summary;
  }

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    let parsed: ParsedReport;
    try {
      parsed = JSON.parse(readUtf8(file)) as ParsedReport;
    } catch {
      /* malformed payload JSON — score as no-evidence */
      continue;
    }
    const ts = parsed.ts ?? 0;
    const runStart = parsed.windowStartTs ?? ts;
    const runEnd = parsed.windowEndTs ?? ts;
    if (runEnd < windowStartTs || runStart > windowEndTs) {
      continue;
    }

    // Verified AFTER the window filter: a stale report is merely absent, but an
    // in-window report that fails verification is a finding worth naming.
    if (!sealedRunReportVerifies(workspace, parsed as Record<string, unknown>)) {
      summary.unverifiableReports.push(file);
      continue;
    }

    const observedTier = parsed.trustTier === "OBSERVED" || parsed.trustTier === "OBSERVED_HARDENED";
    for (const pack of parsed.packResults ?? []) {
      const packId = pack.packId;
      if (!packId) {
        continue;
      }
      const score = typeof pack.score0to100 === "number" ? pack.score0to100 : 0;
      let succeeded = 0;
      const prior = summary.packScores.get(packId) ?? 0;
      const priorSucceeded = summary.packSucceeded.get(packId) ?? Number.MAX_SAFE_INTEGER;
      for (const scenario of pack.scenarioResults ?? []) {
        for (const auditType of scenario.auditEventTypes ?? []) {
          if (auditType.endsWith("_SUCCEEDED")) {
            succeeded += 1;
          }
        }
      }
      if (score > prior || (score === prior && succeeded < priorSucceeded)) {
        summary.packScores.set(packId, score);
        summary.packSucceeded.set(packId, succeeded);
      }
      if (observedTier) {
        summary.packObserved.add(packId);
      }
      for (const scenario of pack.scenarioResults ?? []) {
        for (const auditType of scenario.auditEventTypes ?? []) {
          const count = summary.auditCounts.get(auditType) ?? 0;
          summary.auditCounts.set(auditType, count + 1);
        }
      }
    }
  }
  return summary;
}
