import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest } from "../../src/crypto/keys.js";
import { createIncidentStore, computeIncidentHash, verifyIncidentSignature } from "../../src/incidents/incidentStore.js";
import type { Incident } from "../../src/incidents/incidentTypes.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { lockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
export const PASS = "console-oversight-owner-passphrase";
const roots: Array<{root: string; workspace: string}> = [];
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-console-oversight-")), workspace = join(root, "workspace"); roots.push({root, workspace});
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({workspacePath: workspace, trustBoundaryMode: "isolated"}); return {root, workspace};
}
export function cleanupFixtures() {
  for (const f of roots.splice(0)) { closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`); lockVault(f.workspace); rmSync(f.root, {recursive: true, force: true}); }
  vi.restoreAllMocks(); vi.unstubAllEnvs();
}
export function seedIncident(workspace: string, id = "incident-" + randomUUID()): Incident {
  const ledger = openLedger(workspace);
  try {
    const store = createIncidentStore(ledger.db); store.initTables(); const now = Date.now() - 60_000;
    const base: Omit<Incident, "incident_hash" | "signature"> = {incidentId: id, agentId: "default", severity: "WARN", state: "OPEN",
      title: "Owned oversight drill", description: "Synthetic stored incident; no authenticated-person claim", triggerType: "MANUAL", triggerId: "owned",
      rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [], timelineEventIds: [], createdTs: now, updatedTs: now,
      resolvedTs: null, postmortemRef: null, prev_incident_hash: store.getLastIncidentHash("default")};
    const incident_hash = computeIncidentHash(base), incident = {...base, incident_hash,
      signature: signHexDigest(sha256Hex(canonicalize({...base, incident_hash})), getPrivateKeyPem(workspace, "monitor"))};
    if (!verifyIncidentSignature(workspace, incident, getPublicKeyHistory(workspace, "monitor"))) throw new Error("owned incident signature did not verify");
    store.insertIncident(incident); return incident;
  } finally { ledger.close(); }
}
export function oversightInput(workspace: string, incident: Incident) {
  return {workspace, incident, reviewerId: "owned-reviewer", decision: "ACKNOWLEDGED", rationale: "Actual local oversight test",
    clockIds: [] as string[], reviewedTs: Date.now()};
}
export function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => {resolve = done;}); return {promise, resolve}; }
