import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { readSessionSpillRange, MAX_SPILL_READ_BYTES } from "../src/session/spill/spillRead.js";
import { DEFAULT_SPILL_POLICY, extractSpillRef } from "../src/session/spill/spillTypes.js";
import { resolveSpillPath, SessionSpillStore } from "../src/session/spill/spillStore.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBlobKey } from "../src/storage/blobs/blobKeys.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { sessionSpillReadTool } from "../src/tools/builtin/sessionSpillReadTool.js";

const FULL = Buffer.from("header\n" + "界🧭retained-private-middle\n".repeat(1_500));
const ENV = ["AMC_VAULT_PASSPHRASE", "AMC_NO_SIGN", "AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT"] as const;

describe("session.spill_read session-bound retained output", () => {
  let workspace: string;
  let prior: Record<string, string | undefined>;
  beforeEach(() => {
    prior = Object.fromEntries(ENV.map(key => [key, process.env[key]]));
    for (const key of ENV) delete process.env[key];
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-spill-tool-passphrase";
    workspace = mkdtempSync(join(tmpdir(), "amc-spill-tool-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => {
    lockVault(workspace); rmSync(workspace, { recursive: true, force: true });
    for (const key of ENV) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
  });

  function fixture(sessionId = "origin", backend: "sqlite" | "jsonl" = "sqlite", content: Buffer = FULL) {
    const service = new SessionService(workspace, openSessionEventStore(workspace, backend));
    try {
      service.open({ sessionId, agentId: "default", harnessVersion: "synthetic-fixture",
        compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
      service.startTurn({ trigger: "user" }); service.startStep();
      service.recordToolCall({ toolCallId: "fixture-call", toolName: "grep", args: "{}", dispatch: "native", parentToken: null });
      service.recordToolResult({ toolCallId: "fixture-call", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content });
    } finally { service.disposeWithoutClosing(); }
    const events = readNativeSessionEvents(workspace, sessionId);
    const commitment = events.find(row => row.event_type === "tool/spill-commitment")!;
    const locator = extractSpillRef(commitment.meta_json)!.locator!;
    return { events, commitment, locator, path: resolveSpillPath(workspace, locator)! };
  }

  function tool(sessionId: string | (() => string) = "origin") {
    return sessionSpillReadTool({ workspace, agentId: "default", sessionId });
  }
  function execution(arguments_: Record<string, unknown>, overrides: Partial<ToolExecution> = {}): ToolExecution {
    return { token: "token", callId: "spill-read", rootCallId: "spill-read", name: "session.spill_read", agentId: "default",
      workspace, actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: arguments_, parentToken: null,
      ...overrides };
  }
  async function run(arguments_: Record<string, unknown>, overrides: Partial<ToolExecution> = {}, sessionId: string | (() => string) = "origin") {
    return tool(sessionId).body(execution(arguments_, overrides));
  }
  function rawEdit(edit: (db: Database.Database) => void) {
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      edit(db);
    } finally { db.close(); }
  }

  it("publishes a bounded READ_ONLY schema without a caller-selected session", () => {
    const definition = tool();
    expect(definition.name).toBe("session.spill_read");
    expect(definition.actionClass).toBe("READ_ONLY");
    expect(definition.parameters).toMatchObject({ type: "object", required: ["locator"], additionalProperties: false,
      properties: { locator: { type: "string" }, offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: MAX_SPILL_READ_BYTES } } });
    expect((definition.parameters!.properties as Record<string, unknown>).sessionId).toBeUndefined();
    expect(DEFAULT_SPILL_POLICY.retrievalHint).toContain("session.spill_read");
    expect(DEFAULT_SPILL_POLICY.retrievalHint).not.toContain("amc session spill-read");
  });

  it.each(["sqlite", "jsonl"] as const)("reads exact bounded bytes from current %s history without changing stored evidence", async backend => {
    const f = fixture("origin", backend);
    const marker = readFileSync(join(workspace, ".amc", "session-store.json"));
    const ciphertext = readFileSync(f.path);
    const before = readNativeSessionEvents(workspace, "origin");
    const result = await run({ locator: f.locator, offset: 41, limit: 73 });
    expect(result.ok).toBe(true);
    const page = JSON.parse(result.output);
    expect(Buffer.from(page.content, page.encoding === "base64" ? "base64" : "utf8")).toEqual(FULL.subarray(41, 114));
    expect(page).toMatchObject({ locator: f.locator, offset: 41, returnedBytes: 73, totalBytes: FULL.length,
      nextOffset: 114, sessionIds: ["origin"], verification: { fullContentVerified: true } });
    expect(page.eventIds).toContain(f.commitment.id);
    expect(readFileSync(f.path)).toEqual(ciphertext);
    expect(readFileSync(join(workspace, ".amc", "session-store.json"))).toEqual(marker);
    expect(readNativeSessionEvents(workspace, "origin")).toEqual(before);
  });

  it("defaults to a page and keeps the largest response below the inline cap", async () => {
    const f = fixture();
    const defaultPage = JSON.parse((await run({ locator: f.locator })).output);
    expect(defaultPage.offset).toBe(0); expect(defaultPage.returnedBytes).toBe(4_096);
    const largest = await run({ locator: f.locator, limit: MAX_SPILL_READ_BYTES });
    expect(largest.ok).toBe(true);
    expect(JSON.parse(largest.output).returnedBytes).toBe(MAX_SPILL_READ_BYTES);
    expect(Buffer.byteLength(largest.output)).toBeLessThanOrEqual(DEFAULT_SPILL_POLICY.maxInlineBytes);
    const eof = await run({ locator: f.locator, offset: FULL.length, limit: 1 });
    expect(eof.ok).toBe(true);
    expect(JSON.parse(eof.output)).toMatchObject({ content: "", encoding: "utf8", returnedBytes: 0, nextOffset: null });
  });

  it("returns readable log text and preserves split UTF-8 bytes as base64", async () => {
    const f = fixture();
    const plain = await run({ locator: f.locator, limit: 7 });
    expect(plain.ok).toBe(true);
    expect(JSON.parse(plain.output)).toMatchObject({ content: "header\n", encoding: "utf8", returnedBytes: 7 });
    expect(JSON.parse(plain.output).contentBase64).toBeUndefined();
    const offset = FULL.indexOf(Buffer.from("界")) + 1;
    const split = JSON.parse((await run({ locator: f.locator, offset, limit: 1 })).output);
    expect(split.encoding).toBe("base64");
    expect(Buffer.from(split.content, "base64")).toEqual(FULL.subarray(offset, offset + 1));
  });

  it("refuses a JSON-escaped response larger than the inline cap", async () => {
    const f = fixture("origin", "sqlite", Buffer.alloc(40_000, 1));
    await expect(run({ locator: f.locator, limit: MAX_SPILL_READ_BYTES })).rejects.toThrow(/inline|smaller|limit/);
    const bounded = await run({ locator: f.locator, limit: 128 });
    expect(bounded.ok).toBe(true);
    expect(Buffer.byteLength(bounded.output)).toBeLessThanOrEqual(DEFAULT_SPILL_POLICY.maxInlineBytes);
  });

  it("uses the rebound current session and never grants its predecessor's locators", async () => {
    const origin = fixture("origin"), fork = fixture("fork");
    let current = "origin";
    const definition = tool(() => current);
    expect((await definition.body(execution({ locator: origin.locator, limit: 1 }))).ok).toBe(true);
    current = "fork";
    await expect(definition.body(execution({ locator: origin.locator, limit: 1 }))).rejects.toThrow(/session|commitment|reference/);
    expect((await definition.body(execution({ locator: fork.locator, limit: 1 }))).ok).toBe(true);
  });

  it("refuses an encrypted file and signed result without a tool/spill-commitment row", async () => {
    const sessionId = "result-only";
    initBlobKey(workspace);
    const object = new SessionSpillStore(workspace, sessionId).prepare("fixture", FULL);
    const ref = { v: 2 as const, format: "amc-blob-v1" as const, keyVersion: object.object.keyVersion,
      encodedBytes: object.object.encodedBytes, encodedSha256: object.object.encodedSha256,
      locator: object.object.locator, contentSha256: sha256Hex(FULL), bytes: FULL.length, previewBytes: 0,
      maxInlineBytes: DEFAULT_SPILL_POLICY.maxInlineBytes, retrievalHint: "synthetic fixture", unretrievable: null };
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId, runtime: "amc", binaryPath: "fixture", binarySha256: sha256Hex("fixture") });
      ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "tool/result", meta: { spilled: ref } });
    } finally { ledger.close(); }
    object.persist();
    // Existing operator retrieval authenticates this legacy-shaped carrier. The model tool needs the stronger commitment boundary.
    expect(readSessionSpillRange({ workspace, events: readNativeSessionEvents(workspace, sessionId), locator: ref.locator, limit: 1 }).returnedBytes).toBe(1);
    await expect(run({ locator: ref.locator, limit: 1 }, {}, sessionId)).rejects.toThrow(/commitment/);
  });

  it.each([
    { locator: "/etc/passwd" }, { locator: "amc-spill:v2:../../etc:passwd" },
    { offset: -1 }, { offset: 0.5 }, { offset: Number.MAX_SAFE_INTEGER + 1 },
    { limit: 0 }, { limit: 1.5 }, { limit: MAX_SPILL_READ_BYTES + 1 }, { limit: Number.NaN },
    { sessionId: "other" }, { workspace: "/tmp" }, { extra: true }
  ])("rejects invalid or caller-selected context arguments %j", async args => {
    const f = fixture();
    await expect(run({ locator: f.locator, ...args })).rejects.toThrow();
  });

  it("refuses an offset beyond the committed object size", async () => {
    const f = fixture();
    await expect(run({ locator: f.locator, offset: FULL.length + 1 })).rejects.toThrow(/exceeds/);
  });

  it("refuses an execution outside its composed workspace or agent identity", async () => {
    const f = fixture();
    await expect(run({ locator: f.locator }, { workspace: join(workspace, "other") })).rejects.toThrow(/workspace|identity/);
    await expect(run({ locator: f.locator }, { agentId: "other" })).rejects.toThrow(/agent|identity/);
  });

  it("refuses unauthentic commitments even when a valid tool/result still names the object", async () => {
    const f = fixture();
    rawEdit(db => db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("unsigned", f.commitment.id));
    await expect(run({ locator: f.locator, limit: 1 })).rejects.toThrow(/refused|signature|unauthentic/);
  });

  it("refuses a forged result instead of hiding it behind its authentic commitment", async () => {
    const f = fixture();
    const result = f.events.find(row => row.event_type === "tool/result")!;
    rawEdit(db => db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("unsigned", result.id));
    await expect(run({ locator: f.locator, limit: 1 })).rejects.toThrow(/refused|signature|unauthentic/);
  });

  it("verifies bytes outside the requested range and reports missing retained output", async () => {
    const f = fixture();
    const ciphertext = readFileSync(f.path);
    ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;
    writeFileSync(f.path, ciphertext);
    await expect(run({ locator: f.locator, limit: 1 })).rejects.toThrow(/tampered|commitment/);
    unlinkSync(f.path);
    await expect(run({ locator: f.locator, limit: 1 })).rejects.toThrow(/missing/);
  });

  it("fails closed when decryption keys are unavailable", async () => {
    const f = fixture();
    lockVault(workspace); delete process.env.AMC_VAULT_PASSPHRASE;
    await expect(run({ locator: f.locator, limit: 1 })).rejects.toThrow(/key-unavailable/);
  });
});
