import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionStoreAppendInput, SessionStoreAppendResult } from "../src/persistence/sessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { inspectSpilledEvent, retrieveSpilledContent, verifySpilledContent } from "../src/session/spill/spillEvidence.js";
import { inventorySessionSpills } from "../src/session/spill/spillLifecycle.js";
import { resolveSpillPath, spillRoot } from "../src/session/spill/spillStore.js";
import { extractSpillRef, type SpillRef } from "../src/session/spill/spillTypes.js";
import { blobCurrentKeyPath, blobCurrentKeySigPath, loadCurrentBlobKey } from "../src/storage/blobs/blobKeys.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { getVaultSecretReadOnly, lockVault, setVaultSecret, vaultPaths } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// All keys, sessions and content below are disposable synthetic fixtures. These
// regressions exercise real signed store writes; the injected seam only controls
// admission/return failures and observes filesystem state at those boundaries.
const CONFIG = { maxInlineBytes: 1024, previewHeadBytes: 64, previewTailBytes: 32 };
const SESSION = "spill-commitment-fixture";
const FULL = Buffer.from(`fixture-head\n${"private-middle-sentinel-".repeat(300)}\nfixture-tail`);
const RESULT = { toolCallId: "call-1", outcome: "OK" as const, exitCode: 0, timedOut: false, denied: false, content: FULL };

type Admission = (input: SessionStoreAppendInput, commit: () => SessionStoreAppendResult) => SessionStoreAppendResult;

class FixtureSession extends SessionService {
  recordImportedSpill(value: unknown): void {
    // Produces a genuinely signed malformed producer row to distinguish schema
    // refusal from an unrelated writer-signature failure.
    this.appendSessionEvent({ eventType: "tool/spill-commitment", typeMeta: { spilled: value },
      surface: { op: "none" }, turn: null, step: null });
  }
}

function objectFiles(root: string): string[] {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return [];
  return readdirSync(root).flatMap(name => {
    const path = join(root, name);
    return lstatSync(path).isDirectory() ? objectFiles(path) : [path];
  }).sort();
}

function reference(event: EvidenceEvent): SpillRef {
  const ref = extractSpillRef(event.meta_json);
  if (!ref) throw new Error("fixture did not produce a spill reference");
  return ref;
}

describe("signed spill commitment precedes encrypted persistence", () => {
  let workspace: string;
  let service: FixtureSession | undefined;
  let priorPass: string | undefined;
  let priorNoSign: string | undefined;

  beforeEach(() => {
    priorPass = process.env.AMC_VAULT_PASSPHRASE;
    priorNoSign = process.env.AMC_NO_SIGN;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-spill-commitment-passphrase";
    delete process.env.AMC_NO_SIGN;
    workspace = mkdtempSync(join(tmpdir(), "amc-spill-commitment-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    service?.disposeWithoutClosing();
    service = undefined;
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (priorPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = priorPass;
    if (priorNoSign === undefined) delete process.env.AMC_NO_SIGN;
    else process.env.AMC_NO_SIGN = priorNoSign;
  });

  function start(admission?: Admission): FixtureSession {
    const inner = openSessionEventStore(workspace);
    const store = admission ? new Proxy(inner, {
      get(target, key) {
        if (key === "appendSessionEvent") return (input: SessionStoreAppendInput) =>
          admission(input, () => target.appendSessionEvent(input));
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) : inner;
    service = new FixtureSession(workspace, store, CONFIG);
    service.open({ sessionId: SESSION, agentId: "default", harnessVersion: "synthetic-fixture",
      compositionDigest: sha256Hex("fixture-composition"), policyDigest: sha256Hex("fixture-policy") });
    service.startTurn({ trigger: "user" });
    service.startStep();
    service.recordToolCall({ toolCallId: "call-1", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
    // The ordinary tool/call blob provisions the existing workspace key before
    // spill starts; none of these tests attributes provisioning to spill.
    expect(loadCurrentBlobKey(workspace).keyVersion).toBeGreaterThan(0);
    return service;
  }

  function rows(): EvidenceEvent[] {
    const reader = openSessionEventStore(workspace, "sqlite", { readOnly: true });
    try { return [...reader.readSessionEvents(SESSION)]; }
    finally { reader.close(); }
  }

  function coldRows(): EvidenceEvent[] {
    service?.disposeWithoutClosing();
    service = undefined;
    return rows();
  }

  function keySnapshot(): Record<string, string | null> {
    return Object.fromEntries([blobCurrentKeyPath(workspace), blobCurrentKeySigPath(workspace),
      vaultPaths(workspace).vaultFile, join(workspace, ".amc", "blobs", "unvaulted.key")]
      .map(path => [path, existsSync(path) ? sha256Hex(readFileSync(path)) : null]));
  }

  it("admits the signed non-surface commitment before any spill file, then admits the result after persistence", () => {
    const phases: string[] = [];
    const writer = start((input, commit) => {
      if (input.eventType === "tool/spill-commitment") {
        phases.push("commitment-admission");
        expect(input.payload).toBeUndefined();
        expect(extractEnvelope(JSON.stringify(input.meta))?.surface).toEqual({ op: "none" });
        expect(objectFiles(spillRoot(workspace))).toEqual([]);
        const ref = extractSpillRef(JSON.stringify(input.meta));
        expect(ref?.locator).toMatch(/^amc-spill:v2:/);
        expect(existsSync(resolveSpillPath(workspace, ref!.locator!)!)).toBe(false);
        const written = commit();
        const persisted = rows().find(row => row.id === written.id)!;
        expect(persisted.writer_sig).not.toBe("unsigned");
        expect(inspectSpilledEvent(workspace, persisted).status).toBe("missing");
        expect(objectFiles(spillRoot(workspace))).toEqual([]);
        phases.push("commitment-durable");
        return written;
      }
      if (input.eventType === "tool/result") {
        phases.push("result-admission");
        const commitment = rows().find(row => row.event_type === "tool/spill-commitment")!;
        expect(retrieveSpilledContent(workspace, commitment)).toEqual(FULL);
        expect(objectFiles(spillRoot(workspace))).toHaveLength(1);
        expect(typeof input.payload === "string" ? Buffer.from(input.payload) : input.payload).not.toEqual(FULL);
      }
      return commit();
    });
    const keyBefore = keySnapshot();
    writer.recordToolResult(RESULT);
    expect(phases).toEqual(["commitment-admission", "commitment-durable", "result-admission"]);
    const events = coldRows();
    const commitment = events.find(row => row.event_type === "tool/spill-commitment")!;
    const result = events.find(row => row.event_type === "tool/result")!;
    expect(reference(commitment)).toEqual(reference(result));
    expect(extractEnvelope(result.meta_json)?.prevSessionEventHash).toBe(commitment.event_hash);
    expect(extractEnvelope(result.meta_json)?.seq).toBe(extractEnvelope(commitment.meta_json)!.seq + 1);
    const ref = reference(commitment);
    if (ref.v !== 2) throw new Error("expected v2");
    const encoded = readFileSync(resolveSpillPath(workspace, ref.locator!)!);
    expect(encoded.length).toBe(ref.encodedBytes);
    expect(sha256Hex(encoded)).toBe(ref.encodedSha256);
    expect(encoded.includes(Buffer.from("private-middle-sentinel-"))).toBe(false);
    expect(ref.contentSha256).toBe(sha256Hex(FULL));
    expect(retrieveSpilledContent(workspace, result)).toEqual(FULL);
    expect(verifySpilledContent(workspace, events).checked).toBe(2);
    expect(keySnapshot()).toEqual(keyBefore);
  });

  it.each(["before-admission", "after-commit-return-lost"] as const)(
    "a commitment failure at %s never persists an object or publishes a result", fault => {
      const writer = start((input, commit) => {
        if (input.eventType === "tool/spill-commitment") {
          expect(objectFiles(spillRoot(workspace))).toEqual([]);
          if (fault === "after-commit-return-lost") commit();
          throw new Error("synthetic commitment admission failure");
        }
        return commit();
      });
      expect(() => writer.recordToolResult(RESULT)).toThrow("synthetic commitment admission failure");
      const events = coldRows();
      expect(events.filter(row => row.event_type === "tool/result")).toEqual([]);
      const commitments = events.filter(row => row.event_type === "tool/spill-commitment");
      expect(commitments).toHaveLength(fault === "before-admission" ? 0 : 1);
      expect(objectFiles(spillRoot(workspace))).toEqual([]);
      if (commitments[0]) {
        expect(inspectSpilledEvent(workspace, commitments[0]).status).toBe("missing");
        expect(inventorySessionSpills({ workspace, events }).entries[0]?.status).toBe("missing");
      }
    }
  );

  it("a final result admission failure leaves encrypted bytes discoverable through the durable commitment", () => {
    const writer = start((input, commit) => {
      if (input.eventType === "tool/result") {
        const commitment = rows().find(row => row.event_type === "tool/spill-commitment")!;
        expect(retrieveSpilledContent(workspace, commitment)).toEqual(FULL);
        throw new Error("synthetic final result admission failure");
      }
      return commit();
    });
    expect(() => writer.recordToolResult(RESULT)).toThrow("synthetic final result admission failure");
    const events = coldRows();
    expect(events.filter(row => row.event_type === "tool/result")).toHaveLength(0);
    const commitment = events.find(row => row.event_type === "tool/spill-commitment")!;
    expect(retrieveSpilledContent(workspace, commitment)).toEqual(FULL);
    const inventory = inventorySessionSpills({ workspace, events });
    expect(inventory.ok, inventory.errors.join("; ")).toBe(true);
    expect(inventory.contentVerification).toBe("not-decrypted");
    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0]).toMatchObject({ locator: reference(commitment).locator,
      eventIds: [commitment.id], sessionIds: [SESSION], status: "retained" });
  });

  it("missing current-key signature produces only an explicit unretrievable preview and creates no key", () => {
    const writer = start();
    unlinkSync(blobCurrentKeySigPath(workspace));
    const before = keySnapshot();
    writer.recordToolResult(RESULT);
    const events = coldRows();
    const result = events.find(row => row.event_type === "tool/result")!;
    const ref = reference(result);
    expect(ref).toMatchObject({ v: 2, format: "amc-blob-v1", locator: null,
      keyVersion: null, encodedBytes: null, encodedSha256: null });
    expect(ref.unretrievable).toBeTruthy();
    expect(ref.contentSha256).toBe(sha256Hex(FULL));
    expect(inspectSpilledEvent(workspace, result).status).toBe("unretrievable");
    const preview = loadBlobPlaintext(workspace, result.canonical_payload_path ?? result.payload_path!).bytes;
    expect(preview.toString("utf8")).toContain("full output NOT retained");
    expect(preview.includes(Buffer.from("private-middle-sentinel-".repeat(10)))).toBe(false);
    expect(objectFiles(spillRoot(workspace))).toEqual([]);
    expect(keySnapshot()).toEqual(before);
  });

  it("unavailable vault cannot produce a signed result or spill plaintext, fallback keys or replacement material", () => {
    const writer = start();
    lockVault(workspace);
    delete process.env.AMC_VAULT_PASSPHRASE;
    const before = keySnapshot();
    expect(() => writer.recordToolResult(RESULT)).toThrow();
    expect(objectFiles(spillRoot(workspace))).toEqual([]);
    expect(keySnapshot()).toEqual(before);
    expect(coldRows().filter(row => row.event_type === "tool/result")).toHaveLength(0);
  });

  it("missing versioned key material on read is key-unavailable and never regenerated", () => {
    const writer = start();
    writer.recordToolResult(RESULT);
    const result = rows().find(row => row.event_type === "tool/result")!;
    const ref = reference(result);
    if (ref.v !== 2 || ref.keyVersion === null) throw new Error("expected exact versioned key");
    const keyName = `vault.secrets.blobKeys.${ref.keyVersion}`;
    setVaultSecret(workspace, keyName, "");
    const before = keySnapshot();
    expect(inspectSpilledEvent(workspace, result).status).toBe("key-unavailable");
    expect(() => retrieveSpilledContent(workspace, result)).toThrow(/key-unavailable/);
    expect(getVaultSecretReadOnly(workspace, keyName)).toBe("");
    expect(keySnapshot()).toEqual(before);
  });

  it.each(["spill-root", "session-directory"] as const)("refuses a %s symlink without creating or changing files through it", part => {
    const writer = start();
    const outside = join(workspace, "outside-spill-target");
    mkdirSync(outside);
    const sentinel = join(outside, "sentinel");
    writeFileSync(sentinel, "unchanged private fixture");
    const path = part === "spill-root" ? spillRoot(workspace) : join(spillRoot(workspace), `session-${sha256Hex(SESSION)}`);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    symlinkSync(outside, path);
    writer.recordToolResult(RESULT);
    const result = rows().find(row => row.event_type === "tool/result")!;
    expect(reference(result).locator).toBeNull();
    expect(reference(result).unretrievable).toBeTruthy();
    expect(readdirSync(outside)).toEqual(["sentinel"]);
    expect(readFileSync(sentinel, "utf8")).toBe("unchanged private fixture");
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
  });

  it.each([17, [], {}, { v: 99 }, { v: 2, format: "plaintext" }, { v: 1, bytes: -1 }].map(value => [value]))(
    "a signed malformed spill declaration is invalid-reference rather than not-spilled: %j", value => {
      const writer = start();
      writer.recordImportedSpill(value);
      const events = rows();
      const imported = events[events.length - 1]!;
      expect(imported.writer_sig).not.toBe("unsigned");
      const inspected = inspectSpilledEvent(workspace, imported);
      expect(inspected.status).toBe("invalid-reference");
      expect(inspected.bytes).toBeNull();
      const sweep = verifySpilledContent(workspace, events);
      expect(sweep.ok).toBe(false);
      expect(sweep.checked).toBe(1);
      expect(sweep.errors.join("; ")).toContain(imported.id);
    }
  );
});
