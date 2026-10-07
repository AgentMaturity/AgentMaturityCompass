import Database from "better-sqlite3";
import { join } from "node:path";
import { trustTierByEventId } from "../claims/evidenceProvenance.js";
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

/** Provenance tiers of the bundle's rows (P0-18), never the stored tier; bundle and ledger authentication remain separate. */
export function trustTierByEventIdFromBundle(root: string): Map<string, string> {
  const db = new Database(join(root, "evidence", "evidence.sqlite"), { readonly: true });
  try {
    return trustTierByEventId(db.prepare("SELECT id, meta_json FROM evidence_events").all() as Array<{ id: string; meta_json: string }>);
  } finally {
    db.close();
  }
}
