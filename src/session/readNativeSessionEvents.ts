import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { EvidenceEvent } from "../types.js";

/**
 * Operator history reads follow the recorded backend, not an environment override
 * or the operations ledger. Reading cannot create a marker, acquire a session
 * writer, repair a tail or silently fall back to a different history.
 * This returns recorded rows, NOT a verification verdict.
 */
export function readNativeSessionEvents(workspace: string, sessionId: string): EvidenceEvent[] {
  let marker: string | undefined;
  try { marker = readFileSync(join(workspace, ".amc", "session-store.json"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("Cannot read the native session-store marker. Inspect .amc/session-store.json and its permissions; no alternate backend was read.");
    }
  }
  let backend: "sqlite" | "jsonl" = "sqlite";
  if (marker !== undefined) {
    let value: unknown;
    try { value = JSON.parse(marker); } catch { value = null; }
    const selected = value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as { backend?: unknown }).backend : undefined;
    if (selected !== "sqlite" && selected !== "jsonl") {
      throw new Error("The native session-store marker is invalid. Inspect .amc/session-store.json against the original workspace configuration; do not switch backends to hide this error.");
    }
    backend = selected;
  }
  if (backend === "jsonl") {
    const store = openSessionEventStore(workspace, "jsonl", { readOnly: true });
    try { return [...store.readSessionEvents(sessionId)]; }
    finally { store.close(); }
  }
  // Legacy SQLite workspaces may predate the marker and session-envelope schema.
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(event => event.session_id === sessionId); }
  finally { ledger.close(); }
}
