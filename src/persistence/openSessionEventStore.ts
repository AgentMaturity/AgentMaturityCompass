/**
 * Backend selection for the session spine.
 *
 * Selection is per-workspace and STICKY, recorded in `.amc/session-store.json`
 * the first time a store is opened. Each backend keeps its own `prev_event_hash`
 * chain from its own genesis, so a workspace whose session spine was written
 * half to SQLite and half to JSONL ends up with two PARTIAL chains — each of
 * which verifies cleanly on its own while neither is the session's real
 * history, and nothing announces the split. Refusing the mismatched open turns
 * that into an error at the one moment a human is present to read it.
 *
 * Rollback posture (plan P2.3): "JSONL-only default" is a supported
 * configuration, not a degraded mode — `AMC_SESSION_STORE=jsonl` runs the whole
 * spine, and the shared conformance suite runs the identical assertions against
 * it. What JSONL-only does NOT get today is coverage from
 * `verifyLedgerIntegrity`, which reads `evidence_events` through a concrete
 * `Ledger`; a JSONL workspace is verified through
 * `verifyStoredSessionEvents` (./sessionStoreVerification.ts) instead. That is
 * a real gap, stated here rather than left to be discovered.
 */
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { JsonlSessionEventStore } from "./jsonl/jsonlSessionEventStore.js";
import { SqliteSessionEventStore } from "./sqliteSessionEventStore.js";
import type {
  SessionEventStore,
  SessionStoreBackendId,
  SessionStoreOpenOptions
} from "./sessionEventStore.js";

const DEFAULT_BACKEND: SessionStoreBackendId = "sqlite";

function markerPath(workspace: string): string {
  return join(workspace, ".amc", "session-store.json");
}

function isBackendId(value: unknown): value is SessionStoreBackendId {
  return value === "sqlite" || value === "jsonl";
}

/** The backend this workspace has already committed to, if any. */
export function readSessionStoreMarker(workspace: string): SessionStoreBackendId | null {
  const path = markerPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readUtf8(path)) as { backend?: unknown };
    return isBackendId(parsed.backend) ? parsed.backend : null;
  } catch {
    return null;
  }
}

/**
 * Which backend to open.
 *
 * `AMC_SESSION_STORE` wins so ops can pin a backend without editing a signed
 * config; otherwise the workspace's own marker wins, so an existing JSONL
 * workspace keeps working with no environment at all — which is what makes
 * JSONL-only a default rather than a flag someone must remember.
 */
export function resolveSessionStoreBackend(workspace: string): SessionStoreBackendId {
  const requested = process.env.AMC_SESSION_STORE?.trim().toLowerCase();
  if (isBackendId(requested)) {
    return requested;
  }
  return readSessionStoreMarker(workspace) ?? DEFAULT_BACKEND;
}

function pinBackend(workspace: string, backendId: SessionStoreBackendId): void {
  const existing = readSessionStoreMarker(workspace);
  if (existing === backendId) {
    return;
  }
  if (existing !== null) {
    throw new Error(
      `workspace session store is ${existing}, refusing to open ${backendId}: ` +
        `two backends would write two disjoint hash chains. Export and re-import the session log to switch.`
    );
  }
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(
    markerPath(workspace),
    `${JSON.stringify({ v: 1, backend: backendId, pinnedTs: Date.now() }, null, 2)}\n`,
    0o644
  );
}

/**
 * Open the workspace's session event store.
 *
 * Pins the backend on first open and refuses a mismatch thereafter. A read-only
 * open does NOT pin: writing a marker is a write, and a verifier that mutated
 * the workspace it is inspecting would be a poor verifier.
 */
export function openSessionEventStore(
  workspace: string,
  backendId: SessionStoreBackendId = resolveSessionStoreBackend(workspace),
  options: SessionStoreOpenOptions = {}
): SessionEventStore {
  if (options.readOnly !== true) {
    pinBackend(workspace, backendId);
  }
  return backendId === "jsonl"
    ? new JsonlSessionEventStore(workspace, options)
    : new SqliteSessionEventStore(workspace, options);
}
