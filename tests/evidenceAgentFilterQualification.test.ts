import { verify } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { collectVerifierEvidence, exportVerifierEvidence, type VerifierEvidenceDataset } from "../src/evidence/exporter.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { loadTrustContext } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { workspaceKeyPem } from "./helpers/trustContext.js";
import type { EvidenceEventType } from "../src/types.js";

const roots: string[] = [], records: Array<Record<string, unknown>> = [];
let evidence: string;
type Fixture = { root: string; workspace: string; expected: string[]; foreign: string[]; malformed: string[];
  system: string[]; all: string[]; monitorId: string; ownedSession: string };
let matrix: Fixture, taggedSystem: Fixture;

function snapshot(root: string) {
  const rows: Array<Record<string, unknown>> = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    rows.push({ path: relative(root, path) || ".", kind: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
      mode: stat.mode, inode: stat.ino, links: stat.nlink,
      ...(stat.isSymbolicLink() ? { target: readlinkSync(path) } : stat.isFile() ? { sha256: sha256Hex(readFileSync(path)), size: stat.size } : {}) });
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root); return rows;
}

function createFixture(name: string, tagged = false): Fixture {
  const root = mkdtempSync(join(tmpdir(), `amc-p0-27-export-${name}-`)); roots.push(root);
  const workspace = join(root, "workspace"), home = join(root, "operator-home"); mkdirSync(home);
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("AMC_NO_SIGN", undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-p0-27-export-fixture");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  // The operator captures its monitor before any rows are authored, not from exported record signatures.
  const monitorPem = workspaceKeyPem(workspace, "monitor"), monitorId = sha256Hex(monitorPem);
  writeFileSync(join(evidence, `${name}-operator-monitor.pub`), monitorPem);
  const trust = loadTrustContext({ amcHome: home, env: {}, expectMonitor: monitorId });
  const f: Fixture = { root, workspace, expected: [], foreign: [], malformed: [], system: [], all: [], monitorId,
    ownedSession: `p0-27-${name}-owned` };
  const ledger = openLedger(workspace);
  const append = (sessionId: string, id: string, eventType: EvidenceEventType, meta: Record<string, unknown>) => {
    ledger.appendEvidence({ sessionId, id, runtime: "unknown", eventType, inline: true, payloadExt: "json",
      payload: JSON.stringify({ fixture: name, event: id }), meta: { source: "manual", trustTier: "SELF_REPORTED", ...meta } });
    f.all.push(id); return id;
  };
  const start = (sessionId: string) => {
    if (!ledger.getSessionById(sessionId)) ledger.startSession({ sessionId, runtime: "unknown",
      binaryPath: "p0-27-seeded-collector", binarySha256: sha256Hex("owned seeded collector") });
  };
  try {
    expect(ledger.getAllEvents()).toHaveLength(0);
    if (tagged) {
      start("system");
      f.system.push(append("system", "tagged-system-open", "session/open", { agentId: "default" }));
      f.system.push(append("system", "untagged-system-tail", "stdout", {}));
      f.system.push(append("system", "tagged-system-snake", "stdout", { agent_id: "default" }));
      ledger.sealSession("system"); f.expected = [];
    } else {
      start(f.ownedSession); f.expected.push(append(f.ownedSession, "owned-open", "session/open", { agentId: "default" }));
      for (let i = 0; i < 24; i++) f.expected.push(append(f.ownedSession, `owned-${i}`, "stdout", {}));
      f.expected.push(append(f.ownedSession, "owned-close", "session/close", {})); ledger.sealSession(f.ownedSession);
      const foreign = `p0-27-${name}-foreign`; start(foreign);
      f.foreign.push(append(foreign, "foreign-open", "session/open", { agentId: "other" }));
      for (let i = 0; i < 3; i++) f.foreign.push(append(foreign, `foreign-${i}`, "stdout", {}));
      f.foreign.push(append(foreign, "foreign-close", "session/close", {})); ledger.sealSession(foreign);
      const legacy = `p0-27-${name}-legacy`; start(legacy);
      f.expected.push(append(legacy, "legacy-camel", "stdout", { agentId: "default" }));
      f.expected.push(append(legacy, "legacy-snake", "stdout", { agent_id: "default" }));
      append(legacy, "legacy-untagged", "stdout", {}); ledger.sealSession(legacy);
      const malformed = `p0-27-${name}-malformed`; start(malformed);
      for (const [i, agentId] of [null, 7, ["default"], { value: "default" }, true].entries())
        f.malformed.push(append(malformed, `malformed-tag-${i}`, "stdout", { agentId }));
      ledger.sealSession(malformed);
      start("system"); f.system.push(append("system", "untagged-system", "stdout", {})); ledger.sealSession("system");
    }
    const events = ledger.getAllEvents(); expect(events.map(row => row.id)).toEqual(f.all);
    for (const row of events) expect(verify(null, Buffer.from(row.event_hash, "hex"), monitorPem, Buffer.from(row.writer_sig, "base64"))).toBe(true);
    const sessions = ledger.getAllSessions();
    for (const session of sessions) expect(verify(null, Buffer.from(session.session_final_event_hash!, "hex"), monitorPem,
      Buffer.from(session.session_seal_sig!, "base64"))).toBe(true);
    records.push({ kind: "genuine-fixture", name, monitorId, pinCapturedBeforeRows: true, events, sessions,
      expectedIds: f.expected, allIds: f.all, independentEd25519RowsAndSeals: true });
  } finally { ledger.close(); }
  const integrity = verifyLedgerIntegrity(workspace, { expectedMonitorFingerprint: monitorId, trust });
  records.push({ kind: "pinned-integrity", name, integrity });
  expect(integrity.chain.ok).toBe(true); expect(integrity.trustRoot.anchored).toBe(true);
  return f;
}

function collect(name: string, f: Fixture, agentId?: string, includeChain = true): VerifierEvidenceDataset {
  const before = snapshot(f.root), ledger = openLedger(f.workspace);
  let beforeRows;
  try { beforeRows = ledger.getAllEvents(); } finally { ledger.close(); }
  const result = collectVerifierEvidence({ workspace: f.workspace, agentId, includeChain, includeRationale: false });
  const afterLedger = openLedger(f.workspace);
  let afterRows;
  try { afterRows = afterLedger.getAllEvents(); } finally { afterLedger.close(); }
  const after = snapshot(f.root);
  records.push({ name, before, after, beforeRows, afterRows, result });
  expect(afterRows).toEqual(beforeRows);
  // Coordination sidecars can change during SQLite reads; preserve every observed hash without hiding it.
  const persistent = (rows: Array<Record<string, unknown>>) => rows.filter(row =>
    !String(row.path).endsWith("-wal") && !String(row.path).endsWith("-shm"));
  expect(persistent(after)).toEqual(persistent(before));
  return result;
}

beforeAll(() => {
  expect([22, 24]).toContain(Number(process.versions.node.split(".")[0]));
  evidence = process.env.AMC_P0_27_EXPORT_EFFECTS_DIR ?? mkdtempSync(join(tmpdir(), "amc-p0-27-export-effects-"));
  mkdirSync(evidence, { recursive: true });
  records.push({ kind: "inputs", node: process.version, sourceHashes: ["src/evidence/exporter.ts", "src/ledger/ledger.ts",
    "src/ledger/ledgerConnection.ts", "spec/schemas/v1/evidence-event.schema.json"]
    .map(path => ({ path, sha256: sha256Hex(readFileSync(resolve(path))) })) });
  matrix = createFixture("matrix"); taggedSystem = createFixture("tagged", true);
}, 60_000);
afterAll(() => {
  writeFileSync(join(evidence, "export-effects.json"), JSON.stringify(records, null, 2) + "\n");
  for (const root of roots) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

describe("P0-27 genuine seeded evidence collector", () => {
  test("exports every owned session row beyond twenty plus direct legacy agent rows", () => {
    const result = collect("owned-and-legacy", matrix, "default");
    expect(matrix.expected).toHaveLength(28); expect(result.records.map(row => row.eventId)).toEqual(matrix.expected);
    expect(result).toMatchObject({ schemaVersion: 2, eventCount: 28, chainInvalidCount: 0,
      agentFilter: { agentId: "default", mode: "row-meta-or-owned-session", sessionsIncluded: [matrix.ownedSession], rowsExcluded: 12,
        systemSession: "excluded", insufficientFor: ["requires_no_audit"] } });
    expect(result.records.every(row => row.claimKind === "self_reported" && row.chainValid)).toBe(true);
    expect(result.records.every(row => row.writerSignature !== "unsigned")).toBe(true);
  });
  test("excludes foreign, untagged system and non-string malformed agent tags", () => {
    const result = collect("negative-tags", matrix, "default"), ids = result.records.map(row => row.eventId);
    for (const id of [...matrix.foreign, ...matrix.system, ...matrix.malformed, "legacy-untagged"]) expect(ids).not.toContain(id);
  });
  test("returns exactly the other agent's own session", () => {
    const result = collect("foreign-agent", matrix, "other");
    expect(result.records.map(row => row.eventId)).toEqual(matrix.foreign);
    expect(result.agentFilter?.rowsExcluded).toBe(35); expect(result.agentFilter?.sessionsIncluded).toHaveLength(1);
  });
  test("returns an empty measured selection for a missing agent", () => {
    const result = collect("missing-agent", matrix, "missing");
    expect(result.records).toEqual([]); expect(result.agentFilter).toMatchObject({ sessionsIncluded: [], rowsExcluded: 40 });
  });
  test.each([undefined, "", "   "])("unfiltered selection %j retains all genuine ledger rows", agent => {
    const result = collect(`unfiltered-${String(agent)}`, matrix, agent);
    expect(result.agentFilter).toBeNull(); expect(result.records.map(row => row.eventId)).toEqual(matrix.all);
  });
  test("normalizes the requested agent and records disabled-chain semantics", () => {
    const result = collect("trimmed-no-chain", matrix, "  default  ", false);
    expect(result.records.map(row => row.eventId)).toEqual(matrix.expected); expect(result.agentFilter?.agentId).toBe("default");
    expect(result.includeChain).toBe(false); expect(result.records.every(row => row.chainIndex === -1 && row.chainExpectedPrevHash === "")).toBe(true);
  });
  test("writes genuine selected IDs, dataset-two counts and exact output hash through the real exporter", () => {
    const outFile = join(evidence, "selected-evidence.json"), before = openLedger(matrix.workspace);
    let events;
    try { events = before.getAllEvents(); } finally { before.close(); }
    const result = exportVerifierEvidence({ workspace: matrix.workspace, agentId: "default", includeChain: true,
      includeRationale: false, format: "json", outFile });
    const bytes = readFileSync(outFile), dataset = JSON.parse(bytes.toString("utf8")) as VerifierEvidenceDataset;
    records.push({ name: "actual-json-export", result, outputSha256: sha256Hex(bytes), dataset });
    expect(result).toMatchObject({ eventCount: 28, chainInvalidCount: 0, sha256: sha256Hex(bytes),
      agentFilter: { rowsExcluded: 12, sessionsIncluded: [matrix.ownedSession] } });
    expect(dataset.schemaVersion).toBe(2); expect(dataset.records.map(row => row.eventId)).toEqual(matrix.expected);
    const after = openLedger(matrix.workspace); try { expect(after.getAllEvents()).toEqual(events); } finally { after.close(); }
  });
  test("excludes camel- and snake-tagged system rows from named exports and reports their exclusion", () => {
    const result = collect("excluded-tagged-system", taggedSystem, "default");
    expect(result.records).toEqual([]);
    expect(result).toMatchObject({ schemaVersion: 2, eventCount: 0, chainInvalidCount: 0,
      agentFilter: { sessionsIncluded: [], rowsExcluded: 3 } });
  });
  test("never includes a system row even when its direct metadata names the agent", () => {
    const result = collect("strict-system-spec", taggedSystem, "default");
    expect(result.records.filter(row => row.sessionId === "system")).toEqual([]);
  });
  test("unfiltered export retains all tagged and untagged system rows", () => {
    const result = collect("unfiltered-tagged-system", taggedSystem);
    expect(result.records.map(row => row.eventId)).toEqual(taggedSystem.all);
    expect(result).toMatchObject({ eventCount: 3, agentFilter: null, chainInvalidCount: 0 });
    expect(result.records.every(row => row.chainValid)).toBe(true);
  });
});
