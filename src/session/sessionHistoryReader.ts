import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { SessionStoreBackendId } from "../persistence/sessionEventStore.js";

export type SessionHistoryRefusal = "INVALID_INPUT" | "MISSING" | "UNSUPPORTED_FORMAT" | "BACKEND_MISMATCH" | "UNSAFE_PATH" | "UNREADABLE" | "TAMPERED" | "CHANGED" | "UNSEALED" | "IDENTITY_MISMATCH";
export class SessionHistoryRefused extends Error {
  constructor(readonly code: SessionHistoryRefusal, message: string) {
    super(`${code}: ${message}`); this.name = "SessionHistoryRefused";
  }
}
export function historyRefuse(code: SessionHistoryRefusal, message: string): never {
  throw new SessionHistoryRefused(code, message);
}
function stat(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return historyRefuse("UNREADABLE", "A selected history path cannot be inspected; restore readable evidence, not another backend.");
  }
}
function required(path: string, directory = false): void {
  const info = stat(path);
  if (!info) historyRefuse("MISSING", "Selected persisted history is missing; restore its original evidence and backend marker.");
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
    historyRefuse("UNSAFE_PATH", "History below the selected workspace must use real directories and regular files, not links.");
  }
}
export function exactHistoryId(value: unknown, name: string): void {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
    historyRefuse("INVALID_INPUT", `${name} must be an exact nonempty identity without surrounding whitespace or control characters.`);
  }
}

/** Read-only admission. Never initialize a workspace, switch stores or take ownership. */
export function openHistoryReader(workspacePath: string) {
  if (typeof workspacePath !== "string" || !workspacePath.trim() || workspacePath.includes("\0")) {
    historyRefuse("INVALID_INPUT", "workspace must name an existing directory.");
  }
  let workspace: string;
  try { workspace = realpathSync(resolve(workspacePath)); }
  catch { return historyRefuse("MISSING", "Select an existing readable workspace; history loading never initializes one."); }
  required(workspace, true);
  const amc = join(workspace, ".amc"), marker = join(amc, "session-store.json");
  required(amc, true);
  let pinned: SessionStoreBackendId | null = null;
  if (stat(marker)) {
    required(marker);
    let value: unknown;
    try { value = JSON.parse(readFileSync(marker, "utf8")); }
    catch { return historyRefuse("UNSUPPORTED_FORMAT", "Session-store marker is unreadable or malformed; restore the reviewed marker."); }
    if (!value || typeof value !== "object" || Array.isArray(value)
      || !("v" in value) || value.v !== 1 || !("backend" in value)
      || (value.backend !== "sqlite" && value.backend !== "jsonl")) {
      historyRefuse("UNSUPPORTED_FORMAT", "Session-store marker has an unsupported format or backend; no fallback was attempted.");
    }
    pinned = value.backend;
  }
  const raw = process.env.AMC_SESSION_STORE, requested = raw?.trim().toLowerCase();
  if (raw !== undefined && requested !== "sqlite" && requested !== "jsonl") {
    historyRefuse("INVALID_INPUT", "AMC_SESSION_STORE must be sqlite or jsonl, or unset to select persisted history.");
  }
  if (pinned && requested && pinned !== requested) {
    historyRefuse("BACKEND_MISMATCH", "AMC_SESSION_STORE conflicts with the recorded workspace backend; unset it rather than switch history.");
  }
  if (!pinned && (requested === "jsonl" || stat(join(amc, "jsonl")))) {
    historyRefuse("MISSING", "JSONL backend authority is missing; restore its original session-store marker. Operations SQLite is not a substitute.");
  }
  const backend: SessionStoreBackendId = pinned ?? "sqlite";
  const files = [marker];
  if (backend === "jsonl") {
    required(join(amc, "jsonl"), true);
    for (const name of ["events.jsonl", "sessions.jsonl"]) {
      const path = join(amc, "jsonl", name); required(path); files.push(path);
    }
  } else {
    const database = join(amc, "evidence.sqlite"); required(database);
    files.push(database, `${database}-wal`, `${database}-journal`);
  }
  required(join(amc, "keys"), true);
  required(join(amc, "keys", "monitor_ed25519.pub"));
  files.push(join(amc, "keys", "monitor_ed25519.pub"), join(amc, "keys", "monitor_history.json"));
  // Detect ordinary concurrent append, retention, replacement and trust changes.
  // This is not an atomic cross-file transaction or a hostile-filesystem lock.
  const snapshot = () => files.map(path => {
    const info = stat(path);
    if (info && (!info.isFile() || info.isSymbolicLink())) historyRefuse("UNSAFE_PATH", "A history or trust path became unsafe.");
    return { path, identity: info ? { dev: info.dev, ino: info.ino, size: info.size, mtime: info.mtimeMs, ctime: info.ctimeMs } : null };
  });
  const before = snapshot();
  try {
    const store = openSessionEventStore(workspace, backend, { readOnly: true });
    return { workspace, backend, store, assertUnchanged: () => {
      const after = snapshot();
      const unchanged = before.every((prior, index) => {
        const current = after[index]!;
        // A cold read-only SQLite SELECT can create an empty WAL coordination
        // file. It contains no evidence. Permit only this absent-to-empty case;
        // existing WAL identity/timestamps and every populated WAL stay fenced.
        // The database, marker, trust and rollback journal remain strict too.
        if (backend === "sqlite" && prior.path === join(amc, "evidence.sqlite-wal")
          && prior.identity === null && current.identity?.size === 0) return true;
        return JSON.stringify(current) === JSON.stringify(prior);
      });
      if (!unchanged) historyRefuse("CHANGED", "History or trust changed during loading; quiesce writers and explicitly load a new snapshot.");
    } };
  } catch (error) {
    if (error instanceof SessionHistoryRefused) throw error;
    return historyRefuse("UNREADABLE", "The selected persisted store could not be opened read-only; no other backend was tried.");
  }
}
