import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { lockVault } from "../src/vault/vault.js";
import { encodeBlobV1, encryptBlobV1 } from "../src/storage/blobs/blobEncryptor.js";
import { sha256Hex } from "../src/utils/hash.js";
import * as audits from "../src/ops/audit.js";
import * as storage from "../src/session/spill/spillStore.js";
import { formatSpillLocator, type SpillRef, type SpillRefV2 } from "../src/session/spill/spillTypes.js";
import { eraseSessionSpills, exportSessionSpills, inventorySessionSpills, restoreSessionSpills, type SpillExportIndex } from "../src/session/spill/spillLifecycle.js";
import type { EvidenceEvent } from "../src/types.js";

// Synthetic ciphertext and signed local ledger fixtures exercise the lifecycle,
// not a model, measured maturity, installed package, or deployed service.
const PASS = "synthetic-spill-lifecycle-fixture";
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-spill-lifecycle-")));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated", agentId: "default" });
});
afterEach(() => { vi.restoreAllMocks(); lockVault(workspace); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function events(): EvidenceEvent[] {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents(); } finally { ledger.close(); }
}
function appendReference(sessionId: string, ref: SpillRef, eventType: EvidenceEvent["event_type"] = "tool/spill-commitment"): EvidenceEvent {
  const ledger = openLedger(workspace);
  try {
    if (!ledger.getAllEvents().some(row => row.session_id === sessionId)) {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "synthetic-lifecycle-fixture", binarySha256: sha256Hex("fixture") });
    }
    const result = ledger.appendEvidenceDetailed({ sessionId, runtime: "unknown", eventType,
      meta: { spilled: ref, fixtureKind: "SYNTHETIC_LIFECYCLE_CONTROL_INPUT", agentId: "default" } });
    return ledger.getAllEvents().find(row => row.id === result.id)!;
  } finally { ledger.close(); }
}
function object(sessionId: string = randomUUID(), materialize = true) {
  const plaintext = Buffer.from("synthetic retained tool output\n".repeat(128));
  const locator = formatSpillLocator({ version: 2, sessionHash: sha256Hex(sessionId), objectName: `${randomUUID().replaceAll("-", "")}-result` });
  const encoded = encodeBlobV1(encryptBlobV1({ blobId: locator, keyVersion: 1, key: Buffer.alloc(32, 7), plaintext }));
  const ref: SpillRefV2 = { v: 2, format: "amc-blob-v1", locator, contentSha256: sha256Hex(plaintext), bytes: plaintext.length,
    previewBytes: 64, maxInlineBytes: 128, retrievalHint: "Synthetic fixture ciphertext", unretrievable: null,
    keyVersion: 1, encodedBytes: encoded.length, encodedSha256: sha256Hex(encoded) };
  const commitment = appendReference(sessionId, ref);
  if (materialize) storage.restoreSpillObject(workspace, ref, encoded);
  const result = appendReference(sessionId, ref, "tool/result");
  return { sessionId, ref, plaintext, encoded, commitment, result, path: storage.resolveSpillPath(workspace, locator)! };
}
function auditRows(type: string) { return events().filter(row => JSON.parse(row.meta_json).auditType === type); }
function input() { return { workspace, events: events() }; }
function indexAt(source: string): SpillExportIndex { return JSON.parse(readFileSync(join(source, "index.json"), "utf8")) as SpillExportIndex; }

describe("authenticated spill inventory", () => {
  it("deduplicates the commitment and actual result without decrypting ciphertext", () => {
    const fixture = object();
    lockVault(workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const inventory = inventorySessionSpills(input());
    expect(inventory).toMatchObject({ ok: true, contentVerification: "not-decrypted", errors: [] });
    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0]).toMatchObject({ locator: fixture.ref.locator, status: "retained", ref: fixture.ref,
      eventIds: [fixture.commitment.id, fixture.result.id].sort(), sessionIds: [fixture.sessionId] });
    expect(readFileSync(fixture.path).includes(fixture.plaintext)).toBe(false);
  });

  it("refuses altered metadata before a narrowed erase scope can hide it", () => {
    const fixture = object(), before = events();
    const tampered = { ...fixture.result, meta_json: JSON.stringify({ spilled: { ...fixture.ref, contentSha256: "0".repeat(64) } }) };
    const candidate = before.map(row => row.id === fixture.result.id ? tampered : row);
    expect(inventorySessionSpills({ workspace, events: candidate })).toMatchObject({ ok: false });
    expect(() => eraseSessionSpills({ workspace, events: candidate, scope: { eventIds: [fixture.commitment.id] }, reason: "scoped fixture deletion" })).toThrow(/authentication|unauthentic|refused/i);
    expect(existsSync(fixture.path)).toBe(true); expect(events()).toEqual(before);
  });

  it("refuses conflicting independently signed references and cross-session locators", () => {
    const fixture = object();
    appendReference(fixture.sessionId, { ...fixture.ref, encodedSha256: "0".repeat(64) });
    const conflict = inventorySessionSpills(input());
    expect(conflict.ok).toBe(false); expect(conflict.errors.join(" ")).toContain("conflicting signed spill");
    const foreign = appendReference("another-session", fixture.ref);
    const result = inventorySessionSpills({ workspace, events: [foreign] });
    expect(result.ok).toBe(false); expect(result.errors.join(" ")).toContain("invalid-reference");
    expect(existsSync(fixture.path)).toBe(true);
  });

  it("distinguishes missing encrypted objects from modified ciphertext", () => {
    const missing = object("missing-object", false), modified = object("modified-object");
    const bytes = readFileSync(modified.path); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    writeFileSync(modified.path, bytes);
    const inventory = inventorySessionSpills(input());
    expect(inventory.ok).toBe(false);
    expect(inventory.entries.find(entry => entry.locator === missing.ref.locator)?.status).toBe("missing");
    expect(inventory.entries.find(entry => entry.locator === modified.ref.locator)?.status).toBe("tampered");
    const destination = join(workspace, "refused-export");
    expect(() => exportSessionSpills({ ...input(), destination })).toThrow(/refused/i);
    expect(existsSync(destination)).toBe(false);
  });
});

describe("explicit local spill erasure", () => {
  it("rejects empty scope and scope that leaves another signed reference outside it", () => {
    const fixture = object();
    expect(() => eraseSessionSpills({ ...input(), scope: {}, reason: "fixture" })).toThrow(/explicit/);
    expect(() => eraseSessionSpills({ ...input(), scope: { eventIds: [fixture.result.id] }, reason: "fixture" })).toThrow(/another signed reference/);
    expect(existsSync(fixture.path)).toBe(true);
    expect(auditRows("SESSION_SPILL_ERASURE_INTENDED")).toEqual([]);
  });

  it("signs intention before real unlink and records exact outcomes while preserving other sessions", () => {
    const selected = object("selected-session"), other = object("other-session");
    const remove = storage.removeSpillObject;
    vi.spyOn(storage, "removeSpillObject").mockImplementation((...args) => {
      expect(auditRows("SESSION_SPILL_ERASURE_INTENDED")).toHaveLength(1);
      expect(auditRows("SESSION_SPILL_ERASURE_FINISHED")).toEqual([]);
      expect(existsSync(selected.path)).toBe(true);
      return remove(...args);
    });
    const result = eraseSessionSpills({ ...input(), scope: { sessionIds: [selected.sessionId] }, reason: "explicit local fixture erasure" });
    expect(result.ok).toBe(true); expect(result.auditEventIds).toHaveLength(2);
    expect(result.entries).toEqual([{ locator: selected.ref.locator, eventIds: [selected.commitment.id, selected.result.id].sort(), status: "removed", detail: null }]);
    expect(existsSync(selected.path)).toBe(false); expect(readFileSync(other.path)).toEqual(other.encoded);
    const finished = auditRows("SESSION_SPILL_ERASURE_FINISHED")[0]!;
    expect(JSON.parse(finished.payload_inline!)).toMatchObject({ outcomes: result.entries, scope: "local-referenced-spill-objects-only" });
    // Raw legacy fixture sessions require seals before whole-ledger verification.
    const ledger = openLedger(workspace);
    try {
      ledger.sealSession(selected.sessionId);
      ledger.sealSession(other.sessionId);
    } finally { ledger.close(); }
    const verification = verifyLedgerIntegrity(workspace);
    expect(verification.chain.ok, verification.chain.errors.join("; ")).toBe(true);
  });

  it("leaves bytes untouched when the signed intention cannot be written", () => {
    const fixture = object();
    vi.spyOn(audits, "appendOpsAuditEvent").mockImplementation(() => { throw new Error("synthetic signing refusal"); });
    expect(() => eraseSessionSpills({ ...input(), scope: { sessionIds: [fixture.sessionId] }, reason: "fixture" })).toThrow("synthetic signing refusal");
    expect(readFileSync(fixture.path)).toEqual(fixture.encoded);
  });

  it("does not report success when final outcome signing fails after deletion", () => {
    const fixture = object(), append = audits.appendOpsAuditEvent;
    vi.spyOn(audits, "appendOpsAuditEvent").mockImplementation(params => {
      if (params.auditType === "SESSION_SPILL_ERASURE_FINISHED") throw new Error("synthetic outcome signing failure");
      return append(params);
    });
    expect(() => eraseSessionSpills({ ...input(), scope: { sessionIds: [fixture.sessionId] }, reason: "fixture" })).toThrow("synthetic outcome signing failure");
    expect(existsSync(fixture.path)).toBe(false);
    expect(auditRows("SESSION_SPILL_ERASURE_INTENDED")).toHaveLength(1);
    expect(auditRows("SESSION_SPILL_ERASURE_FINISHED")).toEqual([]);
  });

  it("explicitly purges legacy plaintext while automatic export excludes it", () => {
    const sessionId = "legacy-session", plaintext = Buffer.from("synthetic legacy private output");
    const locator = formatSpillLocator({ version: 1, sessionHash: sha256Hex(sessionId), objectName: `${"a".repeat(32)}-legacy` });
    const ref: SpillRef = { v: 1, locator, bytes: plaintext.length, contentSha256: sha256Hex(plaintext), previewBytes: 8,
      maxInlineBytes: 16, retrievalHint: "legacy fixture", unretrievable: null };
    const row = appendReference(sessionId, ref), path = storage.resolveSpillPath(workspace, locator)!;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, plaintext, { mode: 0o600 });
    const destination = join(workspace, "legacy-export"), exported = exportSessionSpills({ ...input(), destination });
    expect(exported.entries).toMatchObject([{ locator, status: "legacy-excluded", objectFile: null }]);
    expect(readdirSync(join(destination, "objects"))).toEqual([]);
    expect(eraseSessionSpills({ ...input(), scope: { eventIds: [row.id] }, reason: "explicit legacy fixture purge" }).entries[0]?.status).toBe("removed");
    expect(existsSync(path)).toBe(false);
  });
});

describe("encrypted spill transport", () => {
  it("exports and restores ciphertext with locked keys, preserving origin and refusing overwrite", () => {
    const fixture = object(), source = join(workspace, "ciphertext-export");
    lockVault(workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const exported = exportSessionSpills({ ...input(), destination: source });
    expect(exported.entries).toMatchObject([{ status: "exported", encodedSha256: fixture.ref.encodedSha256 }]);
    expect(readFileSync(join(source, exported.entries[0]!.objectFile!))).toEqual(fixture.encoded);
    expect(readdirSync(source).sort()).toEqual(["index.json", "objects"]);
    const noOverwrite = restoreSessionSpills({ ...input(), source });
    expect(noOverwrite.ok).toBe(false); expect(noOverwrite.entries[0]?.status).toBe("failed");
    expect(readFileSync(fixture.path)).toEqual(fixture.encoded);
    unlinkSync(fixture.path);
    const restored = restoreSessionSpills({ ...input(), source });
    expect(restored).toEqual({ ok: true, entries: [{ locator: fixture.ref.locator, status: "restored", detail: null }] });
    expect(readFileSync(fixture.path)).toEqual(fixture.encoded);
  });

  it("never trusts an export index without the destination's authenticated rows", () => {
    const fixture = object(), source = join(workspace, "export");
    exportSessionSpills({ ...input(), destination: source }); unlinkSync(fixture.path);
    expect(() => restoreSessionSpills({ workspace, events: [], source })).toThrow(/not authorized/);
    expect(existsSync(fixture.path)).toBe(false);
  });

  it("preflights altered ciphertext and repointed index entries before creating any destination object", () => {
    const fixture = object(), source = join(workspace, "export");
    exportSessionSpills({ ...input(), destination: source }); unlinkSync(fixture.path);
    const index = indexAt(source), file = join(source, index.entries[0]!.objectFile!);
    const changed = Buffer.from(fixture.encoded); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(file, changed);
    expect(() => restoreSessionSpills({ ...input(), source })).toThrow(/commitment/);
    expect(existsSync(fixture.path)).toBe(false);
    writeFileSync(file, fixture.encoded);
    const altered = { ...index, entries: index.entries.map(entry => ({ ...entry, objectFile: "../outside.blob" })) };
    writeFileSync(join(source, "index.json"), JSON.stringify(altered));
    expect(() => restoreSessionSpills({ ...input(), source })).toThrow(/declared reference/);
    expect(existsSync(fixture.path)).toBe(false);
  });

  it("allows an operator-selected root alias but rejects planted transport file or subtree links", () => {
    const fixture = object(), source = join(workspace, "export");
    exportSessionSpills({ ...input(), destination: source }); unlinkSync(fixture.path);
    const index = indexAt(source), file = join(source, index.entries[0]!.objectFile!), outside = join(workspace, "outside.blob");
    writeFileSync(outside, fixture.encoded); unlinkSync(file); symlinkSync(outside, file);
    expect(() => restoreSessionSpills({ ...input(), source })).toThrow();
    expect(existsSync(fixture.path)).toBe(false);
    unlinkSync(file); writeFileSync(file, fixture.encoded, { mode: 0o600 });
    const directoryLink = join(workspace, "export-link"); symlinkSync(source, directoryLink, "dir");
    expect(restoreSessionSpills({ ...input(), source: directoryLink }).ok).toBe(true);
    const objects = join(source, "objects"), alternate = join(workspace, "alternate-objects");
    mkdirSync(alternate, { mode: 0o700 });
    writeFileSync(join(alternate, index.entries[0]!.objectFile!.slice("objects/".length)), fixture.encoded);
    rmSync(objects, { recursive: true }); symlinkSync(alternate, objects, "dir");
    expect(() => restoreSessionSpills({ ...input(), source: directoryLink })).toThrow(/real directory/);
  });

  it("exports under an explicitly selected parent alias without rejecting its canonical ancestry", () => {
    const fixture = object(), parent = join(workspace, "transport-parent");
    mkdirSync(parent, { mode: 0o700 });
    const alias = join(workspace, "parent-alias"); symlinkSync(parent, alias, "dir");
    const exported = exportSessionSpills({ ...input(), destination: join(alias, "export") });
    expect(exported.entries[0]?.status).toBe("exported");
    expect(readFileSync(join(parent, "export", exported.entries[0]!.objectFile!))).toEqual(fixture.encoded);
  });

  it("reports omitted and unavailable references as gaps instead of a complete restore", () => {
    const fixture = object("not-materialized", false), source = join(workspace, "export");
    const exported = exportSessionSpills({ ...input(), destination: source });
    expect(exported.entries[0]?.status).toBe("missing");
    expect(restoreSessionSpills({ ...input(), source })).toMatchObject({ ok: false, entries: [{ locator: fixture.ref.locator, status: "missing" }] });
    writeFileSync(join(source, "index.json"), JSON.stringify({ ...exported, entries: [] }));
    expect(restoreSessionSpills({ ...input(), source })).toMatchObject({ ok: false, entries: [{ locator: fixture.ref.locator, status: "not-in-export" }] });
  });
});
