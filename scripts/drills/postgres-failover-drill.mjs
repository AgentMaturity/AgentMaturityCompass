#!/usr/bin/env node
/**
 * P2-09d Postgres session-store drill, against a REAL Postgres (never a fake):
 *   node scripts/drills/postgres-failover-drill.mjs --out <receipt.json> [--seconds <n>] [--interval-ms <n>]
 * Needs `npm run build`, `npm install --no-save pg`, and AMC_POSTGRES_URL_FILE naming a chmod-600 file whose URL sets
 * sslmode=verify-full. Steps:
 *   1. the shared session-store conformance suite and the SQLite/Postgres determinism check;
 *   2. an append loop for --seconds (default 120) in a fresh temporary workspace. Kill or fail over the primary while
 *      it runs; every append either commits or fails closed with POSTGRES_UNAVAILABLE and is retried with the same id;
 *   3. the chain read back must verify, hold no duplicate ids, and contain every acknowledged append.
 * Records per-append latency (p50/p95/max), the unavailable window and the verdict. Exits 0 only on "pass".
 * The receipt is evidence of one drill on one HA setup, not a claim about any other.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg("--out");
if (!out) { console.error("usage: postgres-failover-drill.mjs --out <receipt.json> [--seconds <n>] [--interval-ms <n>]"); process.exit(2); }
const seconds = Number(arg("--seconds") ?? 120);
const intervalMs = Number(arg("--interval-ms") ?? 200);
const load = (rel) => import(pathToFileURL(join(root, "dist", rel)).href);
// A throwaway vault for throwaway workspaces; nothing here touches an operator workspace.
process.env.AMC_VAULT_PASSPHRASE ??= randomBytes(24).toString("hex");

const { initWorkspace } = await load("workspace.js");
const { openSessionEventStore } = await load("persistence/openSessionEventStore.js");
const { runSessionStoreConformance, compareBackendDeterminism } = await load("persistence/conformance/sessionStoreConformance.js");
const { verifyStoredSessionEvents } = await load("persistence/sessionStoreVerification.js");
const { embedEnvelope, SESSION_GENESIS } = await load("session/sessionTypes.js");

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "amc-pg-drill-")));
const createWorkspace = () => {
  const workspace = mkdtempSync(join(scratch, "ws-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  return { workspace, dispose: () => rmSync(workspace, { recursive: true, force: true }) };
};
const backend = (id) => ({ backendId: id, createWorkspace, open: (ws) => openSessionEventStore(ws, id),
  openReadOnly: (ws) => openSessionEventStore(ws, id, { readOnly: true }) });

const conformance = runSessionStoreConformance(backend("postgres"));
const determinism = compareBackendDeterminism([backend("sqlite"), backend("postgres")]);

const { workspace } = createWorkspace();
const store = openSessionEventStore(workspace, "postgres");
const sessionId = randomUUID();
store.startSession({ sessionId, runtime: "amc", binaryPath: "postgres-failover-drill", binarySha256: "0".repeat(64) });
const latencies = [];
const acknowledged = [];
let unavailable = 0, otherErrors = [], firstFailTs = null, lastFailTs = null, seq = 0, prev = SESSION_GENESIS;
const deadline = Date.now() + seconds * 1000;
while (Date.now() < deadline) {
  const id = randomUUID();
  const meta = embedEnvelope({ drill: "postgres-failover" }, { v: 1, sessionId, seq, prevSessionEventHash: prev, turn: null, step: null, surface: { op: "none" }, synthetic: false });
  for (;;) {
    const started = performance.now();
    try {
      const result = store.appendSessionEvent({ sessionId, runtime: "amc", eventType: seq === 0 ? "session/open" : "turn/start", meta, id });
      latencies.push(performance.now() - started);
      acknowledged.push(result.id);
      prev = result.eventHash;
      seq += 1;
      break;
    } catch (error) {
      if (error?.code !== "POSTGRES_UNAVAILABLE") { otherErrors.push(String(error?.message ?? error)); break; }
      unavailable += 1;
      firstFailTs ??= Date.now();
      lastFailTs = Date.now();
      if (Date.now() > deadline + 300_000) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  if (otherErrors.length > 0) break;
  await new Promise((r) => setTimeout(r, intervalMs));
}
const rows = store.readAllEvents();
store.close();
const verdict = verifyStoredSessionEvents(workspace, rows);
const ids = rows.map((row) => row.id);
const sorted = [...latencies].sort((a, b) => a - b);
const pct = (p) => sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const checks = {
  conformance: conformance.ok,
  determinism: determinism.ok,
  chainVerifies: verdict.ok,
  noDuplicateIds: new Set(ids).size === ids.length,
  everyAcknowledgedAppendPresent: acknowledged.every((id) => ids.includes(id)),
  noUnexpectedErrors: otherErrors.length === 0
};
const receipt = {
  kind: "amc.drill/postgres-failover", v: 1, ts: new Date().toISOString(), node: process.version,
  result: Object.values(checks).every(Boolean) ? "pass" : "fail", checks,
  conformanceFailures: conformance.failed, determinismErrors: determinism.errors, verifyErrors: verdict.errors.slice(0, 20), otherErrors,
  appends: acknowledged.length, unavailableAttempts: unavailable,
  unavailableWindowMs: firstFailTs === null ? 0 : lastFailTs - firstFailTs,
  latencyMs: { p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1) ?? null, budgetP95: 50 }
};
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`);
rmSync(scratch, { recursive: true, force: true });
console.log(`${receipt.result}: ${receipt.appends} appends, ${unavailable} unavailable attempts, p95 ${receipt.latencyMs.p95?.toFixed(1)} ms -> ${resolve(out)}`);
process.exit(receipt.result === "pass" ? 0 : 1);
