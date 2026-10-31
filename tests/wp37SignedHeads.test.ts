import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readTrustedWorkspaceRecords, saveWorkspaceRecord, verifyWorkspaceRecords } from "../src/storage/workspaceRecordStore.js";
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
