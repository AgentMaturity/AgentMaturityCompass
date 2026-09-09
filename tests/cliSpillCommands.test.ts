import { randomUUID } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSpillCommands, type SpillCliIo } from "../src/cli-spill-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { openLedger } from "../src/ledger/ledger.js";
import * as stores from "../src/persistence/openSessionEventStore.js";
import { JsonlSessionEventStore } from "../src/persistence/jsonl/jsonlSessionEventStore.js";
import { serializeEventRow } from "../src/persistence/jsonl/jsonlEventLog.js";
import type { SessionStoreBackendId } from "../src/persistence/sessionEventStore.js";
import * as lifecycle from "../src/session/spill/spillLifecycle.js";
import * as storage from "../src/session/spill/spillStore.js";
import { spillLifecycleEventAuthenticityError } from "../src/session/spill/spillEvidence.js";
import * as audits from "../src/ops/audit.js";
import * as policy from "../src/ops/policy.js";
import * as keys from "../src/crypto/keys.js";
import { encodeBlobV1, encryptBlobV1 } from "../src/storage/blobs/blobEncryptor.js";
import { formatSpillLocator, type SpillRef, type SpillRefV2 } from "../src/session/spill/spillTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// AUTHORED, NOT EXECUTED in the implementation session. These are synthetic local
// signed-store/CLI controls, not human observations, model runs or release receipts.
const PASS = "synthetic-cli-spill-passphrase";
const PRIVATE = "SYNTHETIC_PRIVATE_TOOL_OUTPUT_AND_HINT";
const REASON = "Synthetic exact local retention request";
let root: string;
let workspaces: string[];
const originalCwd = process.cwd();

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-spill-")));
  workspaces = [];
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_SESSION_STORE", undefined);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_NO_SIGN", undefined);
  vi.stubEnv("AMC_EVALUATED_AGENT", undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  for (const workspace of workspaces) lockVault(workspace);
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function workspace(backend: SessionStoreBackendId = "sqlite"): string {
  const path = realpathSync(mkdtempSync(join(root, "workspace-")));
  workspaces.push(path);
  initWorkspace({ workspacePath: path, trustBoundaryMode: "isolated", agentId: "default" });
  const store = stores.openSessionEventStore(path, backend);
  store.close();
  return path;
}
function rows(path: string): readonly EvidenceEvent[] {
  const store = stores.openSessionEventStore(path, undefined, { readOnly: true });
  try { return store.readAllEvents(); } finally { store.close(); }
}
function append(path: string, sessionId: string, ref?: SpillRef, eventType: EvidenceEvent["event_type"] = "tool/spill-commitment") {
  const store = stores.openSessionEventStore(path);
  try {
    if (!store.readSessionRecord(sessionId)) store.startSession({ sessionId, runtime: "unknown", binaryPath: "synthetic-cli-spill", binarySha256: sha256Hex("fixture") });
    return store.appendSessionEvent({ sessionId, runtime: "unknown", eventType,
      meta: { fixtureKind: "SYNTHETIC_CLI_LIFECYCLE_CONTROL", ...(ref ? { spilled: ref } : {}) } });
  } finally { store.close(); }
}
function object(path: string, sessionId: string = randomUUID(), materialize = true) {
  const plaintext = Buffer.from(`${PRIVATE}\n`.repeat(128));
  const locator = formatSpillLocator({ version: 2, sessionHash: sha256Hex(sessionId), objectName: `${randomUUID().replaceAll("-", "")}-result` });
  // Deliberately NOT the workspace's decryption key. Transport can authenticate
  // this ciphertext, but a successful CLI report cannot establish plaintext.
  const encoded = encodeBlobV1(encryptBlobV1({ blobId: locator, keyVersion: 1, key: Buffer.alloc(32, 7), plaintext }));
  const ref: SpillRefV2 = { v: 2, format: "amc-blob-v1", locator, contentSha256: sha256Hex(plaintext), bytes: plaintext.length,
    previewBytes: 64, maxInlineBytes: 128, retrievalHint: PRIVATE, unretrievable: null,
    keyVersion: 1, encodedBytes: encoded.length, encodedSha256: sha256Hex(encoded) };
  const commitment = append(path, sessionId, ref);
  if (materialize) storage.restoreSpillObject(path, ref, encoded);
  const result = append(path, sessionId, ref, "tool/result");
  return { sessionId, ref, plaintext, encoded, commitment, result, path: storage.resolveSpillPath(path, locator)! };
}
function legacy(path: string, sessionId = "legacy-session") {
  const plaintext = Buffer.from(PRIVATE);
  const locator = formatSpillLocator({ version: 1, sessionHash: sha256Hex(sessionId), objectName: `${randomUUID().replaceAll("-", "")}-legacy` });
  const ref: SpillRef = { v: 1, locator, bytes: plaintext.length, contentSha256: sha256Hex(plaintext),
    previewBytes: 4, maxInlineBytes: 8, retrievalHint: PRIVATE, unretrievable: null };
  const event = append(path, sessionId, ref);
  const objectPath = storage.resolveSpillPath(path, locator)!;
  mkdirSync(dirname(objectPath), { recursive: true, mode: 0o700 });
  writeFileSync(objectPath, plaintext, { mode: 0o600 });
  return { sessionId, ref, event, path: objectPath, plaintext };
}
function unavailable(path: string, sessionId = "unavailable-session") {
  const ref: SpillRefV2 = { v: 2, format: "amc-blob-v1", locator: null, contentSha256: sha256Hex(PRIVATE), bytes: PRIVATE.length,
    previewBytes: 4, maxInlineBytes: 8, retrievalHint: PRIVATE, unretrievable: PRIVATE,
    keyVersion: null, encodedBytes: null, encodedSha256: null };
  const event = append(path, sessionId, ref);
  return { sessionId, ref, event };
}
function auditRows(path: string, type?: string): EvidenceEvent[] {
  const ledger = openLedger(path, { readonly: true });
  try { return ledger.getAllEvents().filter(row => {
    const auditType: unknown = JSON.parse(row.meta_json).auditType;
    return type ? auditType === type : typeof auditType === "string" && auditType.startsWith("SESSION_SPILL_ERASURE_");
  }); } finally { ledger.close(); }
}
function snapshot(path: string, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const name of readdirSync(path).sort()) {
    // Native read-only SQLite admits WAL coordination sidecars, not schema/key writes.
    if (/^evidence\.sqlite-(wal|shm)$/.test(name)) continue;
    const file = join(path, name), label = `${prefix}${name}`, stat = lstatSync(file);
    result[label] = { mode: stat.mode, ...(stat.isFile() ? { digest: sha256Hex(readFileSync(file)) } : {}) };
    if (stat.isDirectory()) Object.assign(result, snapshot(file, `${label}/`));
  }
  return result;
}
interface Report {
  ok: boolean; status: string; mutationAttempted: boolean; mutationState?: string; plaintextVerified: boolean;
  backend?: SessionStoreBackendId; error?: { code: string; message: string; repair: string; outsideScopeEventIds?: string[] };
  inspection?: {
    phase: string; eventCount: number; chainVerification: string; plaintextVerified: boolean;
    contentVerification: string; retainedOutputComplete: boolean;
    monitorTrust: { anchored: boolean; assurance: string };
    entries: Array<{ locator: string | null; eventIds: string[]; sessionIds: string[]; status: string }>;
  };
  plan?: { planSha256: string; selectedObjects: Array<{ eventIds: string[]; sessionIds: string[]; locator: string | null }> };
  outcomes?: Array<{ locator: string | null; status: string; eventIds?: string[]; objectFile?: string | null }>;
  auditEventIds?: string[]; auditStore?: string;
}
function programWith() {
  const out: string[] = [], errors: string[] = [], failures: number[] = [];
  const io: SpillCliIo = { log: line => out.push(line), error: line => errors.push(line), fail: () => { failures.push(1); } };
  const program = new Command().name("amc").exitOverride();
  program.configureOutput({ writeOut: line => out.push(line), writeErr: line => errors.push(line) });
  registerSpillCommands(program, io);
  return { program, out, errors, failures };
}
async function invoke(path: string, command: string, extra: string[] = []) {
  const capture = programWith();
  await capture.program.parseAsync(["spill", command, "--workspace", path, "--json", ...extra], { from: "user" });
  expect(capture.out).toHaveLength(1);
  const report = JSON.parse(capture.out[0]!) as Report;
  expect(report.plaintextVerified).toBe(false);
  expect([...capture.out, ...capture.errors].join("\n")).not.toContain(PRIVATE);
  return { ...capture, report };
}
const selection = (sessionId: string, reason = REASON) => ["--session", sessionId, "--reason", reason];
async function review(path: string, flags: string[]) {
  const result = await invoke(path, "erase", flags);
  expect(result.report.plan?.planSha256).toMatch(/^[a-f0-9]{64}$/);
  return result.report.plan!.planSha256;
}
function observeReadHandles() {
  const original = stores.openSessionEventStore;
  const handles: Array<{ closed: boolean; readOnly: boolean }> = [];
  vi.spyOn(stores, "openSessionEventStore").mockImplementation((...args) => {
    const store = original(...args), observed = { closed: false, readOnly: store.readOnly };
    handles.push(observed);
    const close = store.close.bind(store);
    vi.spyOn(store, "close").mockImplementation(() => { close(); observed.closed = true; });
    return store;
  });
  return () => {
    expect(handles.length).toBeGreaterThan(0);
    expect(handles.every(handle => handle.readOnly && handle.closed)).toBe(true);
  };
}

describe.each(["sqlite", "jsonl"] as const)("native spill commands over %s history", backend => {
  it("reads full signed history read-only, deduplicates origins, and distinguishes consistency from an external pin", async () => {
    const path = workspace(backend), selected = object(path), other = object(path);
    const before = snapshot(join(path, ".amc")), all = rows(path);
    const inventory = vi.spyOn(lifecycle, "inventorySessionSpills");
    const provision = vi.spyOn(keys, "ensureSigningKeys");
    const assertClosed = observeReadHandles();
    lockVault(path); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const result = await invoke(path, "inventory");
    expect(result.failures).toEqual([]);
    expect(result.report).toMatchObject({ ok: true, backend, inspection: { phase: "read-only", eventCount: all.length,
      chainVerification: "not-performed", contentVerification: "not-decrypted", plaintextVerified: false,
      monitorTrust: { anchored: false, assurance: "workspace-consistency-only" } } });
    expect(result.report.inspection!.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ locator: selected.ref.locator, status: "retained", eventIds: [selected.commitment.id, selected.result.id].sort(), sessionIds: [selected.sessionId] }),
      expect.objectContaining({ locator: other.ref.locator, status: "retained" })
    ]));
    expect(inventory).toHaveBeenCalledWith(expect.objectContaining({ events: all }));
    assertClosed(); expect(provision).not.toHaveBeenCalled();
    expect(snapshot(join(path, ".amc"))).toEqual(before);
    const pin = sha256Hex(keys.getPublicKeyPem(path, "monitor")); // Synthetic test anchor, not production pin-discovery advice.
    const pinned = await invoke(path, "inventory", ["--expect-monitor", pin]);
    expect(pinned.report.inspection!.monitorTrust).toMatchObject({ anchored: true, assurance: "out-of-band-pin-matched" });
    expect((await invoke(path, "inventory", ["--expect-monitor", "0".repeat(64)])).report.error?.code).toBe("monitor-trust-unavailable-or-mismatched");
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", pin);
    expect((await invoke(path, "inventory")).report.inspection!.monitorTrust.anchored).toBe(true);
  });

  it("refuses a conflicting explicit backend before opening the unrelated store", async () => {
    const path = workspace(backend); object(path);
    const before = snapshot(join(path, ".amc"));
    const opened = vi.spyOn(stores, "openSessionEventStore");
    vi.stubEnv("AMC_SESSION_STORE", backend === "jsonl" ? "sqlite" : "jsonl");
    const result = await invoke(path, "inventory");
    expect(result.report.error?.code).toBe("backend-mismatch");
    expect(result.failures).not.toEqual([]); expect(opened).not.toHaveBeenCalled();
    expect(snapshot(join(path, ".amc"))).toEqual(before);
  });

  it("calls through ciphertext export/restore with full evidence after every read handle closes", async () => {
    const path = workspace(backend), fixture = object(path), all = rows(path), source = join(root, "transport");
    const assertClosed = observeReadHandles(), exportNative = lifecycle.exportSessionSpills, restoreNative = lifecycle.restoreSessionSpills;
    const exporting = vi.spyOn(lifecycle, "exportSessionSpills").mockImplementation(input => {
      assertClosed(); expect(input.events).toEqual(all); return exportNative(input);
    });
    const restoring = vi.spyOn(lifecycle, "restoreSessionSpills").mockImplementation(input => {
      assertClosed(); expect(input.events).toEqual(all); return restoreNative(input);
    });
    lockVault(path); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const exported = await invoke(path, "export", ["--out", source]);
    expect(exported.failures).toEqual([]); expect(exporting).toHaveBeenCalledOnce();
    expect(exported.report.outcomes).toMatchObject([{ status: "exported", locator: fixture.ref.locator }]);
    const file = exported.report.outcomes![0]!.objectFile!;
    expect(readFileSync(join(source, file))).toEqual(fixture.encoded);
    expect(readdirSync(source).sort()).toEqual(["index.json", "objects"]);
    expect(readFileSync(join(source, file)).includes(fixture.plaintext)).toBe(false);
    unlinkSync(fixture.path); // Synthetic fixture only; no application erasure is simulated.
    const restored = await invoke(path, "restore", ["--from", source]);
    expect(restored.failures).toEqual([]); expect(restoring).toHaveBeenCalledOnce();
    expect(restored.report).toMatchObject({ ok: true, plaintextVerified: false,
      inspection: { phase: "before-operation", retainedOutputComplete: false }, outcomes: [{ status: "restored" }] });
    expect(readFileSync(fixture.path)).toEqual(fixture.encoded);
  });

  it("plans read-only, canonicalizes repeated exact IDs, then calls native intent/unlink/outcome for only the reviewed scope", async () => {
    const path = workspace(backend), fixture = object(path, "selected"), other = object(path, "other"), all = rows(path);
    const flags = ["--event", fixture.commitment.id, "--event", fixture.result.id, "--reason", REASON];
    const before = snapshot(join(path, ".amc"));
    const erased = vi.spyOn(lifecycle, "eraseSessionSpills");
    const digest = await review(path, flags);
    expect(erased).not.toHaveBeenCalled(); expect(auditRows(path)).toEqual([]);
    expect(snapshot(join(path, ".amc"))).toEqual(before);
    expect(await review(path, ["--event", fixture.result.id, "--event", fixture.commitment.id, "--event", fixture.result.id, "--reason", REASON])).toBe(digest);
    const assertClosed = observeReadHandles(), removeNative = storage.removeSpillObject;
    vi.spyOn(storage, "removeSpillObject").mockImplementation((...args) => {
      assertClosed(); expect(auditRows(path, "SESSION_SPILL_ERASURE_INTENDED")).toHaveLength(1);
      expect(auditRows(path, "SESSION_SPILL_ERASURE_FINISHED")).toEqual([]);
      return removeNative(...args);
    });
    const applied = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(applied.failures).toEqual([]); expect(erased).toHaveBeenCalledOnce();
    expect(erased.mock.calls[0]![0].events).toEqual(all);
    expect(applied.report.outcomes).toMatchObject([{ locator: fixture.ref.locator, eventIds: [fixture.commitment.id, fixture.result.id].sort(), status: "removed" }]);
    expect(existsSync(fixture.path)).toBe(false); expect(readFileSync(other.path)).toEqual(other.encoded);
    const actualAudits = auditRows(path);
    expect(applied.report.auditEventIds).toEqual(actualAudits.map(row => row.id));
    expect(actualAudits).toHaveLength(2);
    expect(actualAudits.every(row => row.writer_sig !== "unsigned")).toBe(true);
    expect(actualAudits.map(row => spillLifecycleEventAuthenticityError(path, row))).toEqual([null, null]);
    expect(applied.report.auditStore).toBe("workspace-sqlite-operations-ledger");
    const finished = auditRows(path, "SESSION_SPILL_ERASURE_FINISHED")[0]!;
    expect(JSON.parse(finished.payload_inline!).outcomes).toMatchObject([
      { locator: fixture.ref.locator, eventIds: [fixture.commitment.id, fixture.result.id].sort(), status: "removed" }
    ]);
    if (backend === "jsonl") expect(rows(path)).toEqual(all); // Native ops audit does not pretend to extend JSONL session history.
  });
});

describe("read-only admission and honest failures", () => {
  it("registration and help create no workspace, marker, schema or keys", async () => {
    const opened = vi.spyOn(stores, "openSessionEventStore"), provision = vi.spyOn(keys, "ensureSigningKeys");
    const before = snapshot(root);
    for (const args of [["spill"], ...["inventory", "export", "restore", "erase"].map(command => ["spill", command])]) {
      const capture = programWith();
      await expect(capture.program.parseAsync([...args, "--help"], { from: "user" })).rejects.toMatchObject({ code: "commander.helpDisplayed", exitCode: 0 });
      expect(capture.out.join("\n")).toContain("Usage:");
    }
    expect(opened).not.toHaveBeenCalled(); expect(provision).not.toHaveBeenCalled(); expect(snapshot(root)).toEqual(before);
  });

  it("sets the default failure exitCode without calling process.exit", async () => {
    const previous = process.exitCode;
    const logged = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation((): never => { throw new Error("process.exit must not be used"); });
    try {
      process.exitCode = undefined;
      const program = new Command().exitOverride(); registerSpillCommands(program);
      await program.parseAsync(["spill", "inventory", "--workspace", join(root, "absent"), "--json"], { from: "user" });
      expect(process.exitCode).toBe(1); expect(exit).not.toHaveBeenCalled();
      expect(JSON.parse(logged.mock.calls[0]![0] as string).ok).toBe(false);
    } finally { process.exitCode = previous; }
  });

  it("keeps human-readable inventory free of payloads and retrieval hints", async () => {
    const path = workspace(); object(path); unavailable(path);
    const capture = programWith();
    await capture.program.parseAsync(["spill", "inventory", "--workspace", path], { from: "user" });
    expect(capture.out.join("\n")).toContain("incomplete");
    expect(capture.out.join("\n")).not.toContain(PRIVATE); expect(capture.failures).not.toEqual([]);
  });

  it("refuses a missing or malformed selected SQLite file without initializing schema or keys", async () => {
    const opened = vi.spyOn(stores, "openSessionEventStore"), provision = vi.spyOn(keys, "ensureSigningKeys");
    mkdirSync(join(root, ".amc"), { mode: 0o700 });
    expect((await invoke(root, "inventory")).report.error?.code).toBe("history-missing");
    expect(opened).not.toHaveBeenCalled();
    writeFileSync(join(root, ".amc", "evidence.sqlite"), PRIVATE, { mode: 0o600 });
    const before = snapshot(root), result = await invoke(root, "inventory");
    expect(result.report.error?.code).toBe("history-read-failed");
    expect(result.failures).not.toEqual([]); expect(provision).not.toHaveBeenCalled(); expect(snapshot(root)).toEqual(before);
  });

  it.each([
    { backend: "sqlite", relativePath: ".amc", dangling: false },
    { backend: "sqlite", relativePath: ".amc/session-store.json", dangling: false },
    { backend: "sqlite", relativePath: ".amc/session-store.json", dangling: true },
    { backend: "sqlite", relativePath: ".amc/evidence.sqlite", dangling: false },
    { backend: "jsonl", relativePath: ".amc/jsonl", dangling: false },
    { backend: "jsonl", relativePath: ".amc/jsonl/events.jsonl", dangling: false },
    { backend: "jsonl", relativePath: ".amc/jsonl/sessions.jsonl", dangling: false }
  ] as const)("refuses linked $relativePath for $backend history (dangling: $dangling) before opening a store", async ({ backend, relativePath, dangling }) => {
    const path = workspace(backend); object(path);
    const link = join(path, relativePath), relocated = join(root, "external-original");
    const directory = lstatSync(link).isDirectory();
    renameSync(link, relocated);
    const target = dangling ? join(root, "missing-marker-target") : relocated;
    symlinkSync(target, link, directory ? "dir" : "file");
    const before = snapshot(root), opened = vi.spyOn(stores, "openSessionEventStore");
    const provision = vi.spyOn(keys, "ensureSigningKeys");
    const result = await invoke(path, "inventory");
    expect(result.report.error?.code).toBe("history-path-unsafe");
    expect(result.report.mutationAttempted).toBe(false); expect(result.failures).not.toEqual([]);
    expect(opened).not.toHaveBeenCalled(); expect(provision).not.toHaveBeenCalled();
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    // The snapshot includes the relocated real history outside the workspace,
    // so refusal cannot pass after following or modifying that link target.
    expect(snapshot(root)).toEqual(before);
    if (dangling) expect(existsSync(target)).toBe(false);
  });

  it.each([
    ["inventory", []], ["export", ["--out", "new-export"]], ["restore", ["--from", "old-export"]],
    ["erase", selection("unknown")]
  ])("does not initialize a missing workspace for %s", async (command, flags) => {
    const missing = join(root, "does-not-exist"), opened = vi.spyOn(stores, "openSessionEventStore");
    const result = await invoke(missing, command as string, flags as string[]);
    expect(result.report.error?.code).toBe("workspace-missing-or-unreadable");
    expect(result.report.mutationAttempted).toBe(false); expect(result.failures).not.toEqual([]);
    expect(existsSync(missing)).toBe(false); expect(opened).not.toHaveBeenCalled();
  });

  it.each([
    ["export", []], ["restore", []], ["inventory", ["--expect-monitor", "invalid"]],
    ["erase", ["--reason", REASON]], ["erase", selection(" ")], ["erase", selection("s", " ")],
    ["erase", selection("s", "x".repeat(2049))], ["erase", [...selection("s"), "--apply"]],
    ["erase", [...selection("s"), "--expect-plan", "0".repeat(64)]],
    ["erase", [...selection("s"), "--apply", "--expect-plan", "bad"]]
  ])("rejects malformed %s options with a repair example before opening history", async (command, flags) => {
    const opened = vi.spyOn(stores, "openSessionEventStore");
    const result = await invoke(root, command as string, flags as string[]);
    expect(result.report.ok).toBe(false); expect(result.report.error!.repair).toContain("amc spill");
    expect(result.failures).not.toEqual([]); expect(opened).not.toHaveBeenCalled();
  });

  it("refuses unsupported all/force selectors and resolves default cwd only on invocation", async () => {
    const path = workspace(); object(path);
    const capture = programWith(); process.chdir(path);
    await capture.program.parseAsync(["spill", "inventory", "--json"], { from: "user" });
    expect(JSON.parse(capture.out[0]!).workspace).toBe(path);
    for (const option of ["--all", "--force", "--dry-run"]) {
      const unknown = programWith();
      await expect(unknown.program.parseAsync(["spill", "erase", option], { from: "user" })).rejects.toMatchObject({ code: "commander.unknownOption" });
      expect(unknown.errors.join("\n")).toContain("Example:");
    }
  });

  it("does not create a marker when inspecting a valid legacy SQLite ledger", async () => {
    const path = workspace(); object(path);
    const marker = join(path, ".amc", "session-store.json"); unlinkSync(marker);
    const before = snapshot(join(path, ".amc"));
    expect((await invoke(path, "inventory")).report.ok).toBe(true);
    expect(existsSync(marker)).toBe(false); expect(snapshot(join(path, ".amc"))).toEqual(before);
  });

  it.each(["missing-marker", "malformed-marker", "missing-events", "missing-sessions", "empty-events", "malformed-events", "empty-sessions"])("refuses JSONL %s rather than reading the existing SQLite ops DB", async fault => {
    const path = workspace("jsonl"); object(path);
    const marker = join(path, ".amc", "session-store.json"), events = join(path, ".amc", "jsonl", "events.jsonl"), sessions = join(path, ".amc", "jsonl", "sessions.jsonl");
    if (fault === "missing-marker") unlinkSync(marker);
    if (fault === "malformed-marker") writeFileSync(marker, "{broken");
    if (fault === "missing-events") unlinkSync(events);
    if (fault === "missing-sessions") unlinkSync(sessions);
    if (fault === "empty-events") writeFileSync(events, "");
    if (fault === "malformed-events") writeFileSync(events, PRIVATE);
    if (fault === "empty-sessions") writeFileSync(sessions, "");
    const before = snapshot(join(path, ".amc"));
    const result = await invoke(path, "inventory");
    expect(result.report.ok).toBe(false); expect(result.failures).not.toEqual([]);
    expect(result.report.error!.code).toMatch(/^history-/); expect(snapshot(join(path, ".amc"))).toEqual(before);
  });

  it("closes the actual store when a read fails, without echoing exception secrets", async () => {
    const path = workspace("jsonl"); object(path);
    vi.spyOn(JsonlSessionEventStore.prototype, "readAllEvents").mockImplementationOnce(() => { throw new Error(PRIVATE); });
    const closed = vi.spyOn(JsonlSessionEventStore.prototype, "close");
    const result = await invoke(path, "inventory");
    expect(result.report.error?.code).toBe("history-read-failed"); expect(closed).toHaveBeenCalledOnce();
  });

  it("authenticates rows even when tampering removes the spill key", async () => {
    const path = workspace("jsonl"), fixture = object(path);
    const stripped = rows(path).map(row => ({ ...row, meta_json: JSON.stringify({ fixtureKind: "SYNTHETIC_CLI_LIFECYCLE_CONTROL" }) }));
    writeFileSync(join(path, ".amc", "jsonl", "events.jsonl"), stripped.map(serializeEventRow).join("\n") + "\n");
    const result = await invoke(path, "inventory");
    expect(result.report.error?.code).toBe("history-row-unauthentic");
    expect(existsSync(fixture.path)).toBe(true); expect(result.failures).not.toEqual([]);
  });
});

describe("explicit gaps and native transport boundaries", () => {
  it("reports missing, unavailable, legacy and retained origins, exports useful ciphertext with gaps and exits nonzero", async () => {
    const path = workspace(), retained = object(path), missing = object(path, "missing", false), old = legacy(path), absent = unavailable(path);
    const result = await invoke(path, "inventory");
    expect(result.report.status).toBe("incomplete"); expect(result.failures).not.toEqual([]);
    expect(result.report.inspection!.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ locator: retained.ref.locator, status: "retained" }),
      expect.objectContaining({ locator: missing.ref.locator, status: "missing" }),
      expect.objectContaining({ locator: old.ref.locator, eventIds: [old.event.id], status: "legacy-plaintext" }),
      expect.objectContaining({ locator: null, eventIds: [absent.event.id], status: "unretrievable" })
    ]));
    const source = join(root, "incomplete-export"), exported = await invoke(path, "export", ["--out", source]);
    expect(exported.report).toMatchObject({ ok: false, status: "incomplete" }); expect(exported.failures).not.toEqual([]);
    expect(exported.report.outcomes!.map(entry => entry.status)).toEqual(["exported", "missing", "legacy-excluded", "unretrievable"]);
    expect(existsSync(join(source, "index.json"))).toBe(true);
    expect(readFileSync(join(source, exported.report.outcomes![0]!.objectFile!))).toEqual(retained.encoded);
    expect(readdirSync(join(source, "objects"))).toHaveLength(1);
  });

  it("surfaces tampered ciphertext with origins and refuses export before creating its destination", async () => {
    const path = workspace(), fixture = object(path), source = join(root, "refused-export");
    const changed = Buffer.from(fixture.encoded); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1; writeFileSync(fixture.path, changed);
    const inspected = await invoke(path, "inventory");
    expect(inspected.report.inspection!.entries[0]).toMatchObject({ locator: fixture.ref.locator, status: "tampered", eventIds: [fixture.commitment.id, fixture.result.id].sort() });
    expect((await invoke(path, "export", ["--out", source])).report.error?.code).toBe("inventory-refused");
    expect(existsSync(source)).toBe(false);
  });

  it("refuses export overwrite, retains actual partial-restore outcomes and does not overwrite destination objects", async () => {
    const path = workspace(), first = object(path, "first"), second = object(path, "second"), source = join(root, "export");
    await invoke(path, "export", ["--out", source]);
    const before = snapshot(source), duplicate = await invoke(path, "export", ["--out", source]);
    expect(duplicate.report.ok).toBe(false); expect(snapshot(source)).toEqual(before);
    unlinkSync(first.path);
    const restored = await invoke(path, "restore", ["--from", source]);
    expect(restored.report.status).toBe("incomplete"); expect(restored.failures).not.toEqual([]);
    expect(restored.report.outcomes).toMatchObject([{ locator: first.ref.locator, status: "restored" }, { locator: second.ref.locator, status: "failed" }]);
    expect(readFileSync(first.path)).toEqual(first.encoded); expect(readFileSync(second.path)).toEqual(second.encoded);
  });

  it("rejects foreign destination authority and repointed transport paths through the real lifecycle", async () => {
    const path = workspace(), fixture = object(path), source = join(root, "export");
    await invoke(path, "export", ["--out", source]);
    const foreign = workspace(); object(foreign);
    expect((await invoke(foreign, "restore", ["--from", source])).report.error?.code).toBe("transport-not-authorized");
    expect(existsSync(storage.resolveSpillPath(foreign, fixture.ref.locator!)!)).toBe(false);
    unlinkSync(fixture.path);
    const index = JSON.parse(readFileSync(join(source, "index.json"), "utf8")) as lifecycle.SpillExportIndex;
    writeFileSync(join(source, "index.json"), JSON.stringify({ ...index, entries: index.entries.map(entry => ({ ...entry, objectFile: "../outside.blob" })) }));
    expect((await invoke(path, "restore", ["--from", source])).report.ok).toBe(false);
    expect(existsSync(fixture.path)).toBe(false);
  });

  it("reports omitted references as not-in-export rather than an empty successful restore", async () => {
    const path = workspace(), fixture = object(path), source = join(root, "export");
    await invoke(path, "export", ["--out", source]); unlinkSync(fixture.path);
    const index = JSON.parse(readFileSync(join(source, "index.json"), "utf8"));
    writeFileSync(join(source, "index.json"), JSON.stringify({ ...index, entries: [] }));
    const result = await invoke(path, "restore", ["--from", source]);
    expect(result.report.outcomes).toMatchObject([{ locator: fixture.ref.locator, status: "not-in-export" }]);
    expect(result.failures).not.toEqual([]); expect(existsSync(fixture.path)).toBe(false);
  });
});

describe("reviewed exact-scope erasure", () => {
  it("refuses unknown IDs and incomplete commitment/result pairs without native erase or audit writes", async () => {
    const path = workspace(), fixture = object(path), erase = vi.spyOn(lifecycle, "eraseSessionSpills"), before = snapshot(join(path, ".amc"));
    const pair = await invoke(path, "erase", ["--event", fixture.result.id, "--reason", REASON]);
    expect(pair.report.error).toMatchObject({ code: "outside-scope-reference", outsideScopeEventIds: [fixture.commitment.id] });
    expect((await invoke(path, "erase", ["--event", "unknown", "--reason", REASON])).report.error?.code).toBe("unknown-event-scope");
    expect((await invoke(path, "erase", selection("*"))).report.error?.code).toBe("unknown-session-scope");
    expect(erase).not.toHaveBeenCalled(); expect(auditRows(path)).toEqual([]); expect(snapshot(join(path, ".amc"))).toEqual(before);
  });

  it.each(["reason", "scope", "history", "new-reference", "missing-object"])("refuses stale review after a %s change before native erase", async change => {
    const path = workspace(), fixture = object(path, "selected"), other = object(path, "other");
    const flags = selection(fixture.sessionId), digest = await review(path, flags);
    const erase = vi.spyOn(lifecycle, "eraseSessionSpills");
    let applyFlags = flags;
    if (change === "reason") applyFlags = selection(fixture.sessionId, "Changed reviewed reason");
    if (change === "scope") applyFlags = [...flags, "--session", other.sessionId];
    if (change === "history") append(path, "new-history-without-spill");
    if (change === "new-reference") append(path, fixture.sessionId, fixture.ref, "tool/result");
    if (change === "missing-object") unlinkSync(fixture.path);
    const result = await invoke(path, "erase", [...applyFlags, "--apply", "--expect-plan", digest]);
    expect(result.report.error?.code).toBe("stale-plan"); expect(result.report.mutationAttempted).toBe(false);
    expect(erase).not.toHaveBeenCalled(); expect(auditRows(path)).toEqual([]);
    expect(existsSync(fixture.path)).toBe(change !== "missing-object"); expect(readFileSync(other.path)).toEqual(other.encoded);
  });

  it("binds legacy inode state without reading plaintext and refuses planted links", async () => {
    const path = workspace(), fixture = legacy(path), flags = selection(fixture.sessionId), digest = await review(path, flags);
    const erase = vi.spyOn(lifecycle, "eraseSessionSpills");
    const replacement = join(root, "replacement"); writeFileSync(replacement, fixture.plaintext, { mode: 0o600 }); renameSync(replacement, fixture.path);
    expect((await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest])).report.error?.code).toBe("stale-plan");
    const outside = join(root, "outside"); writeFileSync(outside, fixture.plaintext, { mode: 0o600 }); unlinkSync(fixture.path); symlinkSync(outside, fixture.path);
    expect((await invoke(path, "erase", flags)).report.error?.code).toBe("unsafe-plan-path");
    expect(erase).not.toHaveBeenCalled(); expect(readFileSync(outside)).toEqual(fixture.plaintext);
  });

  it("refuses unauthentic/out-of-scope history before a reviewed apply can hide it", async () => {
    const path = workspace("jsonl"), fixture = object(path), other = object(path), flags = selection(fixture.sessionId), digest = await review(path, flags);
    const changed = rows(path).map(row => row.id === other.result.id ? { ...row, meta_json: JSON.stringify({ spilled: { ...other.ref, contentSha256: "0".repeat(64) } }) } : row);
    writeFileSync(join(path, ".amc", "jsonl", "events.jsonl"), changed.map(serializeEventRow).join("\n") + "\n");
    const erase = vi.spyOn(lifecycle, "eraseSessionSpills");
    expect((await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest])).report.error?.code).toBe("history-row-unauthentic");
    expect(erase).not.toHaveBeenCalled(); expect(existsSync(fixture.path)).toBe(true); expect(auditRows(path)).toEqual([]);
  });

  it.each(["sqlite", "jsonl"] as const)("refuses an independently signed reference conflict outside the reviewed scope in %s history", async backend => {
    const path = workspace(backend), fixture = object(path, "selected"), other = object(path, "outside-scope");
    const flags = selection(fixture.sessionId), digest = await review(path, flags);
    // Both declarations retain valid signatures and agree with the ciphertext.
    // Only their signed reference metadata conflicts, so row authentication or
    // a mismatched encoded digest cannot substitute for conflict admission.
    const conflicting = append(path, other.sessionId, { ...other.ref, retrievalHint: "Different signed retrieval instruction" }, "tool/result");
    const all = rows(path), signed = all.find(row => row.id === conflicting.id)!;
    expect(spillLifecycleEventAuthenticityError(path, signed)).toBeNull();
    const before = snapshot(join(path, ".amc"));
    const inventory = vi.spyOn(lifecycle, "inventorySessionSpills"), erase = vi.spyOn(lifecycle, "eraseSessionSpills");
    const result = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(result.report.error?.code).toBe("inventory-refused");
    expect(result.report.mutationAttempted).toBe(false); expect(result.failures).not.toEqual([]);
    expect(inventory).toHaveBeenCalledWith(expect.objectContaining({ events: all }));
    expect(erase).not.toHaveBeenCalled(); expect(auditRows(path)).toEqual([]);
    expect(readFileSync(fixture.path)).toEqual(fixture.encoded); expect(readFileSync(other.path)).toEqual(other.encoded);
    expect(snapshot(join(path, ".amc"))).toEqual(before);
  });

  it("reports missing and unavailable native outcomes with audit IDs, not invented removals", async () => {
    const path = workspace(), missing = object(path, "missing", false), absent = unavailable(path);
    const flags = [...selection(missing.sessionId), "--session", absent.sessionId], digest = await review(path, flags);
    const result = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(result.report.outcomes).toMatchObject([{ status: "missing" }, { status: "unretrievable" }]);
    expect(result.report.auditEventIds).toEqual(auditRows(path).map(row => row.id));
    expect(result.report.status).toBe("incomplete"); expect(result.failures).not.toEqual([]);
  });

  it("keeps the native smaller-exact-batch remedy and never truncates an oversized selection", async () => {
    const path = workspace(), fixture = object(path), flags = selection(fixture.sessionId), digest = await review(path, flags);
    const load = policy.loadOpsPolicy;
    vi.spyOn(policy, "loadOpsPolicy").mockImplementation(workspacePath => {
      const original = load(workspacePath);
      return { ...original, opsPolicy: { ...original.opsPolicy, retention: { ...original.opsPolicy.retention, maxPayloadBytesPerEvent: 128 } } };
    });
    const erase = vi.spyOn(lifecycle, "eraseSessionSpills"), result = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(result.report.error?.code).toBe("audit-selection-too-large");
    expect(result.report.error!.message).toContain("smaller batch of exact event IDs");
    expect(erase.mock.calls[0]![0].scope).toEqual({ eventIds: [], sessionIds: [fixture.sessionId] });
    expect(existsSync(fixture.path)).toBe(true); expect(auditRows(path)).toEqual([]);
  });

  it.each(["intent", "outcome"])("does not claim successful erasure when %s signing fails", async fault => {
    const path = workspace(), fixture = object(path), flags = selection(fixture.sessionId), digest = await review(path, flags), realAudit = audits.appendOpsAuditEvent;
    vi.spyOn(audits, "appendOpsAuditEvent").mockImplementation(input => {
      if (input.auditType === (fault === "intent" ? "SESSION_SPILL_ERASURE_INTENDED" : "SESSION_SPILL_ERASURE_FINISHED")) throw new Error(PRIVATE);
      return realAudit(input);
    });
    const result = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(result.report).toMatchObject({ ok: false, status: "failed", mutationState: "unknown-possibly-partial" });
    expect(result.report.auditEventIds).toBeUndefined(); expect(result.failures).not.toEqual([]);
    expect(existsSync(fixture.path)).toBe(fault === "intent");
    expect(auditRows(path, "SESSION_SPILL_ERASURE_INTENDED")).toHaveLength(fault === "intent" ? 0 : 1);
    expect(auditRows(path, "SESSION_SPILL_ERASURE_FINISHED")).toEqual([]);
  });

  it("reports real per-object failure outcomes and exact audit IDs without leaking the thrown detail", async () => {
    const path = workspace(), failed = object(path, "selected"), removed = object(path, "selected"), flags = selection("selected"), digest = await review(path, flags);
    const remove = storage.removeSpillObject;
    vi.spyOn(storage, "removeSpillObject").mockImplementation((...args) => {
      if (args[1].locator === failed.ref.locator) throw new Error(PRIVATE);
      return remove(...args);
    });
    const result = await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest]);
    expect(result.report.outcomes).toMatchObject([{ locator: failed.ref.locator, status: "failed" }, { locator: removed.ref.locator, status: "removed" }]);
    expect(result.report.auditEventIds).toEqual(auditRows(path).map(row => row.id));
    expect(result.failures).not.toEqual([]); expect(existsSync(failed.path)).toBe(true); expect(existsSync(removed.path)).toBe(false);
  });

  it("never enters native erasure in unsigned mode or writes an audit for a scope with no spills", async () => {
    const path = workspace(), fixture = object(path), flags = selection(fixture.sessionId), digest = await review(path, flags);
    append(path, "no-spills");
    const erase = vi.spyOn(lifecycle, "eraseSessionSpills");
    expect((await invoke(path, "erase", selection("no-spills"))).report.error?.code).toBe("no-selected-objects");
    vi.stubEnv("AMC_NO_SIGN", "1");
    expect((await invoke(path, "erase", [...flags, "--apply", "--expect-plan", digest])).report.error?.code).toBe("signing-required");
    expect(erase).not.toHaveBeenCalled(); expect(auditRows(path)).toEqual([]); expect(existsSync(fixture.path)).toBe(true);
  });
});
