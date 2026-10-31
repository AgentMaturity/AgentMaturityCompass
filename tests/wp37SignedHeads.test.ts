import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  prepareWorkspaceRecordAsync, readTrustedWorkspaceRecords, saveWorkspaceRecord, updateWorkspaceRecord, verifyWorkspaceRecords, withWorkspaceRecordPublicationLock
} from "../src/storage/workspaceRecordStore.js";
import * as keyFacade from "../src/crypto/keys.js";
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
