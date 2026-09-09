import Database from "better-sqlite3";
import { join } from "node:path";
import type { EvidenceEvent } from "../types.js";
import { inventorySessionSpills, restoreSessionSpills } from "../session/spill/spillLifecycle.js";
import { pathExists } from "../utils/fs.js";

/** Restore only against the destination evidence rows and installed bundle role keys. */
export function restoreBundleSpills(root: string, workspace: string): string[] {
  const spillGaps: string[] = [];
  const spillSource = join(root, "evidence", "spill");
  const spillDb = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const events = spillDb.prepare("SELECT * FROM evidence_events ORDER BY rowid ASC").all() as EvidenceEvent[];
    if (pathExists(spillSource)) {
      const restored = restoreSessionSpills({ workspace, events, source: spillSource });
      const failed = restored.entries.filter((entry) => entry.status === "failed");
      if (failed.length > 0) {
        throw new Error(`Bundle spill restore refused: ${failed.map((entry) => entry.detail).join("; ")}`);
      }
      spillGaps.push(...restored.entries.filter((entry) => entry.status !== "restored")
        .map((entry) => `${entry.locator ?? "unretrievable output"}: ${entry.status}: ${entry.detail ?? ""}`));
    } else {
      const inventory = inventorySessionSpills({ workspace, events });
      if (!inventory.ok) throw new Error(`Bundle spill references invalid: ${inventory.errors.join("; ")}`);
      spillGaps.push(...inventory.entries.map((entry) => `${entry.locator ?? "unretrievable output"}: historical bundle has no spill transport index`));
    }
    return spillGaps;
  } finally {
    spillDb.close();
  }
}

/** Project stored tier metadata; bundle and ledger authentication remain separate. */
export function trustTierByEventIdFromBundle(root: string): Map<string, string> {
  const db = new Database(join(root, "evidence", "evidence.sqlite"), { readonly: true });
  try {
    const rows = db.prepare("SELECT id, meta_json, event_type FROM evidence_events").all() as Array<{
      id: string;
      meta_json: string;
      event_type: string;
    }>;

    const out = new Map<string, string>();
    for (const row of rows) {
      let trustTier = "OBSERVED";
      try {
        const parsed = JSON.parse(row.meta_json) as Record<string, unknown>;
        if (
          parsed.trustTier === "OBSERVED" ||
          parsed.trustTier === "OBSERVED_HARDENED" ||
          parsed.trustTier === "ATTESTED" ||
          parsed.trustTier === "SELF_REPORTED"
        ) {
          trustTier = parsed.trustTier;
        } else if (row.event_type === "review") {
          trustTier = "SELF_REPORTED";
        }
      } catch {
        if (row.event_type === "review") {
          trustTier = "SELF_REPORTED";
        }
      }
      out.set(row.id, trustTier);
    }

    return out;
  } finally {
    db.close();
  }
}
