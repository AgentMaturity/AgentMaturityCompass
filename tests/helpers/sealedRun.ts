import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLedger } from "../../src/ledger/ledger.js";
import { ensureSigningKeys, getSigningKey, signHexDigest } from "../../src/crypto/keys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";

/** Writes a run/assurance report sealed the way the runner seals it: hash with seal fields emptied, sign with the artifact-seal key. */
export function writeSealedReport(workspace: string, dir: string, name: string, report: object): string {
  ensureSigningKeys(workspace);
  const base = { ...report, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(base));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: signHexDigest(hash, getSigningKey(workspace, "artifact-seal")) }, null, 2));
  return file;
}

/**
 * `writeSealedReport` for a diagnostic run a gate reads (governor, ToolHub, transformation): also anchored in the ledger
 * `runs` table, as the runner publishes it. `anchor: false` leaves a sealed but unrecorded run.
 */
export function writeAnchoredRun<T extends { runId: string; windowStartTs: number; windowEndTs: number;
  targetProfileId?: string | null; status: "VALID" | "INVALID" | "UNSIGNED" }>(workspace: string, dir: string, report: T, opts: { anchor?: boolean } = {}): string {
  const file = writeSealedReport(workspace, dir, report.runId, report);
  if (opts.anchor === false) return file;
  const sealed = JSON.parse(readFileSync(file, "utf8")) as { reportJsonSha256: string; runSealSig: string };
  const ledger = openLedger(workspace);
  try {
    ledger.insertRun({ run_id: report.runId, window_start_ts: report.windowStartTs, window_end_ts: report.windowEndTs,
      target_profile_id: report.targetProfileId ?? null, report_json_sha256: sealed.reportJsonSha256, run_seal_sig: sealed.runSealSig, status: report.status });
  } finally {
    ledger.close();
  }
  return file;
}

/** Edits a sealed file in place without resealing it — what an attacker with workspace write access can do. */
export function tamperReport(file: string, edit: (report: Record<string, unknown>) => void): void {
  const report = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  edit(report);
  writeFileSync(file, JSON.stringify(report, null, 2));
}
