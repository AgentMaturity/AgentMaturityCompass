import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { resolveSpillPath } from "../src/session/spill/spillStore.js";
import { readSessionSpillRange, MAX_SPILL_READ_BYTES } from "../src/session/spill/spillRead.js";
import { registerSessionSpillReadCommand } from "../src/cli-session-spill-read-command.js";
import { getPublicKeyPem } from "../src/crypto/keys.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// Disposable signed native history; no model execution or human evidence.
const FULL = Buffer.concat([Buffer.from("header\n\u001b[31mcontrol\u001b[0m\n"), Buffer.from("界🧭private-middle\n".repeat(900))]);
const ENV = ["AMC_VAULT_PASSPHRASE", "AMC_NO_SIGN", "AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT"] as const;

describe("authenticated bounded retained-output reading", () => {
  let base: string, workspace: string;
  let prior: Record<string, string | undefined>;
  let exitCode: typeof process.exitCode;
  beforeEach(() => {
    prior = Object.fromEntries(ENV.map(key => [key, process.env[key]]));
    for (const key of ENV) delete process.env[key];
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-spill-read-passphrase";
    exitCode = process.exitCode; process.exitCode = undefined;
    base = mkdtempSync(join(tmpdir(), "amc-spill-read-")); workspace = join(base, "workspace");
  });
  afterEach(() => {
    vi.restoreAllMocks(); lockVault(workspace); rmSync(base, { recursive: true, force: true });
    for (const key of ENV) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
    process.exitCode = exitCode;
  });

  function fixture(backend: "sqlite" | "jsonl" = "sqlite", withSibling = false) {
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    const service = new SessionService(workspace, openSessionEventStore(workspace, backend),
      { maxInlineBytes: 1024, previewHeadBytes: 32, previewTailBytes: 16 });
    try {
      service.open({ sessionId: "read-origin", agentId: "default", harnessVersion: "synthetic-fixture",
        compositionDigest: sha256Hex("fixture-composition"), policyDigest: sha256Hex("fixture-policy") });
      service.startTurn({ trigger: "user" }); service.startStep();
      service.recordToolCall({ toolCallId: "read-fixture", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
      service.recordToolResult({ toolCallId: "read-fixture", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: FULL });
      if (withSibling) {
        service.recordToolCall({ toolCallId: "sibling-fixture", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
        service.recordToolResult({ toolCallId: "sibling-fixture", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: FULL });
      }
    } finally { service.disposeWithoutClosing(); }
    const reader = openSessionEventStore(workspace, backend, { readOnly: true });
    let events: readonly EvidenceEvent[];
    try { events = reader.readAllEvents(); } finally { reader.close(); }
    const ref = extractSpillRef(events.find(event => event.event_type === "tool/result")!.meta_json)!;
    const locator = ref.locator!;
    const fingerprint = sha256Hex(Buffer.from(getPublicKeyPem(workspace, "monitor"), "utf8"));
    return { events, locator, fingerprint, path: resolveSpillPath(workspace, locator)! };
  }

  async function cli(args: string[]) {
    const messages: string[] = [], errors: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...parts) => { messages.push(parts.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...parts) => { errors.push(parts.join(" ")); });
    const program = new Command().name("amc").exitOverride();
    registerSessionSpillReadCommand(program.command("session"));
    await program.parseAsync(["node", "amc", "session", "spill-read", ...args]);
    return { messages, errors };
  }

  it.each(["sqlite", "jsonl"] as const)("reads exact byte ranges and both origins from %s without rewriting the object or backend", async backend => {
    const f = fixture(backend);
    const marker = readFileSync(join(workspace, ".amc", "session-store.json"));
    const ciphertext = readFileSync(f.path);
    const offset = 41, limit = 73;
    const result = readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset, limit,
      options: { expectedMonitorFingerprint: f.fingerprint } });
    expect(Buffer.from(result.contentBase64, "base64")).toEqual(FULL.subarray(offset, offset + limit));
    expect(result).toMatchObject({ totalBytes: FULL.length, offset, returnedBytes: limit,
      nextOffset: offset + limit, contentSha256: sha256Hex(FULL), storage: "encrypted-v2",
      verification: { fullContentVerified: true, expectedMonitorFingerprint: f.fingerprint, history: "supplied-references-only" } });
    expect(result.eventIds).toEqual(f.events.filter(event => extractSpillRef(event.meta_json)?.locator === f.locator).map(event => event.id).sort());
    expect(result.eventIds).toHaveLength(2);
    const output = await cli([f.locator, "--workspace", workspace, "--offset", String(offset), "--limit", String(limit), "--expect-monitor", f.fingerprint, "--json"]);
    expect(JSON.parse(output.messages[0]!)).toEqual(result);
    expect(process.exitCode).toBeUndefined();
    expect(readFileSync(f.path)).toEqual(ciphertext);
    expect(readFileSync(join(workspace, ".amc", "session-store.json"))).toEqual(marker);
  });

  it("returns a bounded final page and explicit end offset, including an empty read at EOF", () => {
    const f = fixture();
    const last = readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset: FULL.length - 5, limit: MAX_SPILL_READ_BYTES });
    expect(Buffer.from(last.contentBase64, "base64")).toEqual(FULL.subarray(-5));
    expect(last.returnedBytes).toBe(5); expect(last.nextOffset).toBeNull();
    const eof = readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset: FULL.length });
    expect(eof.contentBase64).toBe(""); expect(eof.returnedBytes).toBe(0); expect(eof.nextOffset).toBeNull();
    expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset: FULL.length + 1 })).toThrow(/exceeds/);
    for (const limit of [0, -1, 0.5, MAX_SPILL_READ_BYTES + 1, Number.NaN]) {
      expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator, limit })).toThrow(/limit/);
    }
  });

  it("refuses a modification outside the requested range instead of verifying only the page", () => {
    const f = fixture(); const bytes = readFileSync(f.path);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; writeFileSync(f.path, bytes);
    expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset: 0, limit: 1 })).toThrow(/tampered|commitment/);
  });

  it("authenticates every reference but reads only the selected retained object", () => {
    const f = fixture("sqlite", true);
    const sibling = f.events.find(event => event.event_type === "tool/result" && extractSpillRef(event.meta_json)?.locator !== f.locator)!;
    const siblingPath = resolveSpillPath(workspace, extractSpillRef(sibling.meta_json)!.locator!)!;
    writeFileSync(siblingPath, "corrupt unrelated ciphertext fixture");
    const page = readSessionSpillRange({ workspace, events: f.events, locator: f.locator, limit: 2 });
    expect(Buffer.from(page.contentBase64, "base64")).toEqual(FULL.subarray(0, 2));
    // Selection must not hide an unauthentic declaration in the supplied log.
    const forged = f.events.map(event => event.id === sibling.id ? { ...event, writer_sig: "unsigned" } : event);
    expect(() => readSessionSpillRange({ workspace, events: forged, locator: f.locator, limit: 2 })).toThrow(/refused/);
  });

  it("refuses forged origins, unknown locators and unavailable decryption", () => {
    const f = fixture();
    const forged = f.events.map(event => event.event_type === "tool/result" ? { ...event, writer_sig: "unsigned" } : event);
    expect(() => readSessionSpillRange({ workspace, events: forged, locator: f.locator })).toThrow(/refused/);
    const unknown = f.locator.replace(/:[^:]+$/, ":" + "f".repeat(32) + "-unknown");
    expect(() => readSessionSpillRange({ workspace, events: f.events, locator: unknown })).toThrow(/No authenticated reference/);
    lockVault(workspace); delete process.env.AMC_VAULT_PASSPHRASE;
    expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator })).toThrow(/key-unavailable/);
  });

  it("never labels an empty or mismatched trust pin as identity verification", () => {
    const f = fixture();
    for (const expectedMonitorFingerprint of ["", " ", "not-a-fingerprint", "0".repeat(64)]) {
      expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator,
        options: { expectedMonitorFingerprint } })).toThrow(/fingerprint|refused/);
    }
    expect(readSessionSpillRange({ workspace, events: f.events, locator: f.locator }).verification.expectedMonitorFingerprint).toBeNull();
  });

  it("escapes terminal control bytes while JSON retains exact bytes", async () => {
    const f = fixture();
    const output = await cli([f.locator, "--workspace", workspace, "--limit", "64"]);
    expect(output.messages.join("\n")).toContain("\\u001b[31m");
    expect(output.messages.join("\n")).not.toContain("\u001b");
    expect(output.messages.join("\n")).toContain("unanchored");
  });

  it("refuses conflicting backend selection and malformed markers without replacing them", async () => {
    const f = fixture("jsonl");
    process.env.AMC_SESSION_STORE = "sqlite";
    const output = await cli([f.locator, "--workspace", workspace, "--json"]);
    expect(JSON.parse(output.messages[0]!)).toMatchObject({ ok: false, error: expect.stringContaining("conflicting AMC_SESSION_STORE") });
    expect(process.exitCode).toBe(1);
    delete process.env.AMC_SESSION_STORE; process.exitCode = undefined;
    const marker = join(workspace, ".amc", "session-store.json"); writeFileSync(marker, "malformed-fixture");
    const broken = await cli([f.locator, "--workspace", workspace, "--json"]);
    expect(JSON.parse(broken.messages[0]!)).toMatchObject({ ok: false, error: expect.stringContaining("Invalid session-store marker") });
    expect(readFileSync(marker, "utf8")).toBe("malformed-fixture");
  });

  it("missing workspace and invalid numeric options do not initialize state", async () => {
    const locator = "amc-spill:v2:" + "a".repeat(64) + ":" + "b".repeat(32) + "-fixture";
    for (const extra of [[], ["--offset", "1e3"], ["--limit", "2junk"]]) {
      process.exitCode = undefined;
      const output = await cli([locator, "--workspace", workspace, "--json", ...extra]);
      expect(JSON.parse(output.messages[0]!).ok).toBe(false);
      expect(process.exitCode).toBe(1); expect(existsSync(workspace)).toBe(false);
    }
  });

  it("a dangling backend marker cannot be mistaken for absent configuration", async () => {
    const f = fixture("jsonl");
    const marker = join(workspace, ".amc", "session-store.json");
    unlinkSync(marker); symlinkSync(join(base, "absent-marker-target"), marker);
    const result = await cli([f.locator, "--workspace", workspace, "--json"]);
    expect(JSON.parse(result.messages[0]!)).toMatchObject({ ok: false, error: expect.stringContaining("must be a regular file") });
    expect(process.exitCode).toBe(1); expect(lstatSync(marker).isSymbolicLink()).toBe(true);
    expect(existsSync(join(base, "absent-marker-target"))).toBe(false);
  });
});
