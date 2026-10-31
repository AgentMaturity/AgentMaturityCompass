import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  adoptWorkspaceRecordHead, prepareWorkspaceRecordAsync, readTrustedWorkspaceRecords, saveWorkspaceRecord, updateWorkspaceRecord, verifyWorkspaceRecords, withWorkspaceRecordPublicationLock
} from "../src/storage/workspaceRecordStore.js";
import * as keyFacade from "../src/crypto/keys.js";
import { generateResidencyReport, registerTenant, resetDataResidencyState } from "../src/compliance/dataResidency.js";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { openLedger } from "../src/ledger/ledger.js";
import * as files from "../src/utils/fs.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "wp37-signed-heads"; });
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A workspace with keys: records and head anchors are signed. */
function keyed(prefix: string): string {
  const root = scratch(prefix);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

const AT = { area: ["compliance", "residency"], kind: "tenants" };
const recordFile = (ws: string, id: string) => join(ws, ".amc", "compliance", "residency", "tenants", `${id}.json`);
const codes = (ws: string) => verifyWorkspaceRecords(ws, AT).findings.map((row) => row.code);
const headFile = (ws: string) => join(ws, ".amc", "compliance", "residency", "tenants.head.json");
const headCodes = (ws: string) => codes(ws).filter((code) => code.startsWith("HEAD_"));

/** What a writer without the workspace key can produce: a well-formed, chained record marked unsigned. */
function forgeUnsigned(ws: string, id: string, body: Record<string, unknown>, prev: string, storedTs: number): void {
  const record = { ...body, prev_record_hash: prev, record_hash: sha256Hex(canonicalize({ ...body, prev_record_hash: prev })), signature: "unsigned", storedTs };
  writeFileSync(recordFile(ws, id), JSON.stringify(record, null, 2));
}

describe("an unverifiable key set (WP37 review)", () => {
  test("refuses unsigned records instead of treating the workspace as keyless, and says why", () => {
    const ws = keyed("amc-wp37s-keyset-");
    const genuine = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    forgeUnsigned(ws, "forged", { tenantId: "forged" }, genuine.record_hash, 2);
    const pinned = join(ws, ".amc", "keys", "auditor_ed25519.pub"), bytes = readFileSync(pinned);
    bytes[bytes.length - 5]! ^= 1;
    writeFileSync(pinned, bytes);

    const read = readTrustedWorkspaceRecords<{ tenantId: string }>(ws, AT);
    expect(read.records.map((row) => row.tenantId)).not.toContain("forged");
    expect(codes(ws)).toContain("KEYSET_UNVERIFIABLE");
    expect(read.unverified.join("\n")).toMatch(/UNVERIFIED: tenants KEYSET_UNVERIFIABLE/);
  });
});

describe("the trusted read returns what it verified (WP37 review)", () => {
  test("a record swapped on disk after verification is not what the read returns", () => {
    const ws = keyed("amc-wp37s-toctou-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    const file = recordFile(ws, "a"), genuine = readFileSync(file, "utf8");
    const swapped = genuine.replace('"tenantId": "a"', '"tenantId": "swapped"');
    const actual = files.readUtf8;
    let reads = 0;
    vi.spyOn(files, "readUtf8").mockImplementation((path) => path === file && ++reads > 1 ? swapped : actual(path));

    expect(readTrustedWorkspaceRecords<{ tenantId: string }>(ws, AT).records.map((row) => row.tenantId)).toEqual(["a"]);
    expect(reads).toBe(1);
  });
});

describe("the head anchor is signed like a record (WP37 review)", () => {
  test("an intact keyed register reads clean through its signed anchor", () => {
    const ws = keyed("amc-wp37s-head-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    expect(codes(ws)).toEqual([]);
  });

  test("deleting the newest record and rewriting the anchor to the older hash is caught", () => {
    const ws = keyed("amc-wp37s-head-");
    const older = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    unlinkSync(recordFile(ws, "b"));
    writeFileSync(headFile(ws), JSON.stringify({ record_hash: older.record_hash, lost: [] }, null, 2));
    expect(headCodes(ws)).toEqual(["HEAD_UNVERIFIED"]);
  });

  test("rolling a record back to its kept revision and re-pointing the anchor is caught", () => {
    const ws = keyed("amc-wp37s-head-");
    const first = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a", region: "eu" }, 1);
    updateWorkspaceRecord(ws, AT, "a", { ...first, region: "us" }, 2);
    const revisions = join(ws, ".amc", "compliance", "residency", "tenants", "revisions");
    copyFileSync(join(revisions, readdirSync(revisions)[0]!), recordFile(ws, "a"));
    const anchor = JSON.parse(readFileSync(headFile(ws), "utf8")) as Record<string, unknown>;
    writeFileSync(headFile(ws), JSON.stringify({ ...anchor, record_hash: first.record_hash }, null, 2));
    expect(headCodes(ws)).toEqual(["HEAD_UNVERIFIED"]);
  });

  test("a later write carries a rewritten anchor forward instead of re-signing it", () => {
    const ws = keyed("amc-wp37s-head-");
    const older = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    unlinkSync(recordFile(ws, "b"));
    writeFileSync(headFile(ws), JSON.stringify({ record_hash: older.record_hash, lost: [] }, null, 2));
    saveWorkspaceRecord(ws, AT, "c", { tenantId: "c" }, 3);
    expect(verifyWorkspaceRecords(ws, AT).findings.filter((row) => row.code.startsWith("HEAD_")).map((row) => [row.code, row.detail]))
      .toEqual([["HEAD_UNVERIFIED", expect.stringMatching(/did not verify when a later record was written/)]]);
  });

  test("an anchor rewritten while a publication was being signed refuses it before the record is written", async () => {
    const ws = keyed("amc-wp37s-head-");
    const older = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    const prepared = await prepareWorkspaceRecordAsync(ws, AT, "b", { tenantId: "b" }, 2);
    writeFileSync(headFile(ws), JSON.stringify({ record_hash: older.record_hash, lost: [] }, null, 2));
    expect(() => withWorkspaceRecordPublicationLock(ws, AT, () => prepared.publish())).toThrow(/head anchor changed while signing was prepared; retry/);
    expect(existsSync(recordFile(ws, "b"))).toBe(false);
  });

  test("the prepared publishers never write an unsigned anchor", async () => {
    const ws = keyed("amc-wp37s-head-");
    vi.spyOn(keyFacade, "getSigningKey").mockImplementation(() => { throw new Error("owned anchor signing refusal"); });
    await expect(prepareWorkspaceRecordAsync(ws, AT, "a", { tenantId: "a" }, 1)).rejects.toThrow("owned anchor signing refusal");
    expect(existsSync(recordFile(ws, "a"))).toBe(false);
    expect(existsSync(headFile(ws))).toBe(false);
  });
});

/** Records as the store wrote them before head anchors existed: chained and signed, with no anchor and no ledger row. */
function legacyStore(ws: string): Array<{ record_hash: string }> {
  const out: Array<{ record_hash: string }> = [];
  let prev = "GENESIS_TENANTS";
  for (const [id, storedTs] of [["a", 1], ["b", 2]] as const) {
    const body = { tenantId: id }, hash = sha256Hex(canonicalize({ ...body, prev_record_hash: prev }));
    const record = { ...body, prev_record_hash: prev, record_hash: hash, signature: keyFacade.signHexDigest(hash, keyFacade.getSigningKey(ws, "artifact-seal")), storedTs };
    files.ensureDir(join(ws, ".amc", "compliance", "residency", "tenants"));
    writeFileSync(recordFile(ws, id), JSON.stringify(record, null, 2));
    out.push(record);
    prev = hash;
  }
  return out;
}

/** The ledger rows that record a store's head being anchored. */
function headAudits(ws: string): Array<Record<string, unknown>> {
  const ledger = openLedger(ws, { readonly: true });
  try {
    return (ledger.db.prepare("SELECT payload_inline FROM evidence_events WHERE session_id LIKE 'ops-workspace_record_head_anchored-%' ORDER BY rowid")
      .all() as Array<{ payload_inline: string }>).map((row) => JSON.parse(row.payload_inline) as Record<string, unknown>);
  } finally { ledger.close(); }
}

describe("stores written before head anchors are anchored once (WP37 review)", () => {
  const headCheck = async (ws: string) => (await runDoctorRules(ws)).checks.find((row) => row.id === "workspace-record-heads");

  test("doctor anchors the store once with an audit row, it reads clean, and a deleted newest record is then caught", async () => {
    const ws = keyed("amc-wp37s-adopt-");
    const [, newest] = legacyStore(ws);
    expect(await headCheck(ws)).toMatchObject({ status: "INFO", message: expect.stringContaining(`compliance/residency/tenants at ${newest!.record_hash.slice(0, 16)}`) });
    expect(headAudits(ws)).toEqual([expect.objectContaining({ auditType: "WORKSPACE_RECORD_HEAD_ANCHORED", kind: "tenants", recordHash: newest!.record_hash, adopted: true })]);
    expect(codes(ws)).toEqual([]);
    expect(await headCheck(ws)).toMatchObject({ status: "PASS" });
    expect(headAudits(ws)).toHaveLength(1);
    unlinkSync(recordFile(ws, "b"));
    expect(headCodes(ws)).toEqual(["HEAD_MISSING"]);
  }, 60_000);

  test("the first verifying read of a keyed workspace anchors the store, and a later anchor deletion is not re-anchored", () => {
    const ws = keyed("amc-wp37s-adopt-");
    legacyStore(ws);
    expect(codes(ws)).toEqual([]);
    expect(headAudits(ws)).toHaveLength(1);
    unlinkSync(recordFile(ws, "b"));
    unlinkSync(headFile(ws));
    expect(headCodes(ws)).toEqual(["HEAD_MISSING"]);
    expect(existsSync(headFile(ws))).toBe(false);
    expect(headAudits(ws)).toHaveLength(1);
  });

  test("a store anchored by its first write is never re-anchored after its anchor is deleted; doctor fails it", async () => {
    const ws = keyed("amc-wp37s-adopt-");
    const first = saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    expect(headAudits(ws)).toEqual([expect.objectContaining({ kind: "tenants", recordHash: first.record_hash, adopted: false })]);
    unlinkSync(recordFile(ws, "b"));
    unlinkSync(headFile(ws));
    expect(headCodes(ws)).toEqual(["HEAD_MISSING"]);
    expect(await headCheck(ws)).toMatchObject({ status: "FAIL", message: expect.stringContaining("compliance/residency/tenants") });
    expect(existsSync(headFile(ws))).toBe(false);
  }, 60_000);

  test("a record written while the adopted anchor was being signed refuses the adoption", () => {
    const ws = keyed("amc-wp37s-adopt-");
    legacyStore(ws);
    const actual = keyFacade.getSigningKey;
    vi.spyOn(keyFacade, "getSigningKey").mockImplementationOnce((workspace, purpose) => {
      const late = JSON.parse(readFileSync(recordFile(ws, "b"), "utf8")) as Record<string, unknown>;
      writeFileSync(recordFile(ws, "late"), JSON.stringify({ ...late, tenantId: "late", record_hash: "f".repeat(64), storedTs: 3 }, null, 2));
      return actual(workspace, purpose);
    });
    expect(adoptWorkspaceRecordHead(ws, AT)).toEqual({ status: "refused", reason: "workspace records changed while their head anchor was prepared; retry" });
    expect(existsSync(headFile(ws))).toBe(false);
  });

  test("residency reports unanchored history at its own severity, not as a HIGH breach", () => {
    const ws = scratch("amc-wp37s-residency-");
    resetDataResidencyState();
    registerTenant({ tenantId: "t1", workspaceId: "w1", region: "eu-west-1" }, ws);
    registerTenant({ tenantId: "t2", workspaceId: "w2", region: "eu-west-1" }, ws);
    unlinkSync(headFile(ws));
    resetDataResidencyState();
    const unanchored = generateResidencyReport("t1", {}, ws).violations.filter((line) => line.includes("HEAD_UNANCHORED"));
    expect(unanchored).toEqual([expect.stringMatching(/^\[MEDIUM\] Residency record history unanchored \(tenants\): HEAD_UNANCHORED /)]);
  });
});
