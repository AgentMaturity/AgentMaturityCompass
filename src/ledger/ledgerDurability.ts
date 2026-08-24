/**
 * How durably the ledger commits, resolved from environment and config.
 *
 * Two independent knobs, both defaulting to fast:
 *
 *  - synchronous mode (AMC_LEDGER_SQLITE_SYNCHRONOUS, default FULL) — how hard
 *    SQLite flushes on commit.
 *  - fullfsync (AMC_LEDGER_FULLFSYNC or amc.config.yaml security.durability,
 *    default off) — whether to force fcntl(F_FULLFSYNC). synchronous=FULL alone
 *    is process/OS-crash durable, but on macOS/APFS its fsync() does not flush
 *    the drive write cache; only F_FULLFSYNC does, at ~96x the per-commit cost.
 *    So real power-loss durability is opt-in — a mission-critical regulated
 *    deployment turns it on; a laptop accepts the crash-durable default.
 *
 * Split from ledger.ts so the pragma policy lives in one small place and the
 * ledger reads as storage, not configuration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { pathExists } from "../utils/fs.js";

export type SqliteSyncMode = "OFF" | "NORMAL" | "FULL" | "EXTRA";

export function ledgerSynchronousMode(): SqliteSyncMode {
  const raw = (process.env.AMC_LEDGER_SQLITE_SYNCHRONOUS ?? "FULL").trim().toUpperCase();
  if (raw === "OFF" || raw === "NORMAL" || raw === "FULL" || raw === "EXTRA") {
    return raw;
  }
  return "FULL";
}

/**
 * Whether to force fcntl(F_FULLFSYNC) on commit (SQLite PRAGMA fullfsync).
 *
 * synchronous=FULL alone is process/OS-crash durable, but on macOS/APFS its
 * fsync() does not flush the drive's write cache — only F_FULLFSYNC does. That
 * real durability costs ~96x per commit here, so it is OPT-IN, not the default:
 * losing a row to a power cut is the operator's accepted risk unless they say
 * otherwise. A mission-critical regulated deployment turns it on.
 *
 * Resolution order: AMC_LEDGER_FULLFSYNC ("1"/"0") wins for ops; otherwise the
 * workspace's signed amc.config.yaml security.durability === "power-loss". The
 * config is read directly here rather than through loadAMCConfig, because
 * workspace.ts imports this module — reading the one field avoids the cycle and
 * a config read on ledger open (not a per-event path). Any failure falls back
 * to the fast default; durability never fails a workspace open.
 */
export function ledgerFullFsync(workspace: string): boolean {
  const env = process.env.AMC_LEDGER_FULLFSYNC;
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  try {
    const configPath = join(workspace, ".amc", "amc.config.yaml");
    if (!pathExists(configPath)) return false;
    const parsed = YAML.parse(readFileSync(configPath, "utf8")) as
      | { security?: { durability?: unknown } }
      | null;
    return parsed?.security?.durability === "power-loss";
  } catch {
    return false;
  }
}
