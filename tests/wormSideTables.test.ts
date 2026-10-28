/**
 * P2-36: a WORM export carries the ledger side tables (A4's `a4_*`, the action journal's `action_*`) beside its
 * retention segments, named by the signed index, so a restore from WORM covers A4 state and not only its audit rows.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signHexDigest } from "../src/crypto/keys.js";
import { getSigningKey } from "../src/keys/signingKeys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { exportRetentionSegments, verifyWormExport } from "../src/ops/retention/wormExport.js";
import { sideTableSegment, verifySideTableSegment } from "../src/ops/retention/wormSideTables.js";
import { filesystemTestTarget } from "../src/ops/retention/wormTargets.js";
import { LEDGER_SIDE_TABLES } from "../src/persistence/postgres/postgresLedgerSideTables.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { operatorTrustHome, workspaceKeyPem } from "./helpers/trustContext.js";

const DAY = 86_400_000;
let root: string;
let workspace: string;
let bucket: string;
let home: string;
const retainUntil = () => new Date(Date.now() + 7 * DAY);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-worm-side-"));
  workspace = join(root, "ws");
  bucket = join(root, "bucket");
  mkdirSync(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  try {
    // An effect liveness row: an a4_* table with no trigger or foreign key, standing in for A4 state.
    ledger.db.prepare(`INSERT INTO a4_effects (effect_id, project_id, gate_id, execution_id, approval_request_id, owner_pid, owner_host, started_ts,
      heartbeat_ts, state) VALUES ('eff_1', 'a4p_${"0".repeat(32)}', 'gate_1', 'exec_1', NULL, 1, 'host', 1, 1, 'running')`).run();
  } finally {
    ledger.close();
  }
  home = operatorTrustHome([{ publicKeyPem: workspaceKeyPem(workspace, "auditor"), purposes: ["artifact-seal"] }]);
  vi.stubEnv("AMC_HOME", home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  lockVault(workspace);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const trustList = () => join(home, "trust", "amc-trust-list.json");

describe("WORM side-table segment (P2-36)", () => {
  it("an export names every side table's rows under the signed index, and verifies offline", async () => {
    const receipt = await exportRetentionSegments({ workspace, target: filesystemTestTarget(bucket), retainUntil: retainUntil });
    const signed = JSON.parse(readFileSync(join(bucket, receipt.indexKey), "utf8"));
    const snapshot = JSON.parse(gunzipSync(readFileSync(join(bucket, signed.index.sideTables.data))).toString("utf8"));
    expect(Object.keys(snapshot.tables).sort()).toEqual(LEDGER_SIDE_TABLES.map((table) => table.name).sort());
    expect(snapshot.tables.a4_effects).toEqual([expect.objectContaining({ effect_id: "eff_1", state: "running" })]);
    expect(verifyWormExport({ indexFile: join(bucket, receipt.indexKey), objectsDir: bucket, trustList: trustList() })).toEqual({ ok: true, errors: [] });
  });

  it("an altered side-table object fails verification", async () => {
    const receipt = await exportRetentionSegments({ workspace, target: filesystemTestTarget(bucket), retainUntil: retainUntil });
    const copy = join(root, "copy");
    cpSync(bucket, copy, { recursive: true });
    const key = JSON.parse(readFileSync(join(copy, receipt.indexKey), "utf8")).index.sideTables.data as string;
    const bytes = readFileSync(join(copy, key));
    bytes[bytes.length - 5]! ^= 1;
    writeFileSync(join(copy, key), bytes);
    const verdict = verifyWormExport({ indexFile: join(copy, receipt.indexKey), objectsDir: copy, trustList: trustList() });
    expect(verdict.errors).toEqual(expect.arrayContaining([`object sha256 mismatch: ${key}`, "side tables: objects missing or altered"]));
  });

  it("an index without a side-table segment verifies its segments but reports that it does not cover A4", async () => {
    const receipt = await exportRetentionSegments({ workspace, target: filesystemTestTarget(bucket), retainUntil: retainUntil });
    const signed = JSON.parse(readFileSync(join(bucket, receipt.indexKey), "utf8"));
    delete signed.index.sideTables;
    signed.digestSha256 = sha256Hex(canonicalize(signed.index));
    signed.signature = signHexDigest(signed.digestSha256, getSigningKey(workspace, "artifact-seal"));
    const older = join(root, "older-index.json");
    writeFileSync(older, JSON.stringify(signed));
    expect(verifyWormExport({ indexFile: older, objectsDir: bucket, trustList: trustList() }).errors)
      .toEqual(["side tables: this export carries no ledger side-table segment, so it does not cover A4 or the action journal"]);
  });

  it("a manifest whose table digest or row count does not match the snapshot is refused", () => {
    const { data, manifest } = sideTableSegment(workspace, retainUntil);
    const errors: string[] = [];
    verifySideTableSegment(data, manifest, errors);
    expect(errors).toEqual([]);
    const forged = JSON.parse(manifest.toString("utf8"));
    forged.tables.a4_effects.rows = 0;
    verifySideTableSegment(data, Buffer.from(JSON.stringify(forged)), errors);
    expect(errors).toEqual(["side tables: a4_effects rows do not match the manifest"]);
    const dropped = JSON.parse(manifest.toString("utf8"));
    delete dropped.tables.action_transitions;
    const more: string[] = [];
    verifySideTableSegment(data, Buffer.from(JSON.stringify(dropped)), more);
    expect(more).toEqual(["side tables: action_transitions is missing"]);
  });

  it("the snapshot bytes are deterministic, so an unchanged re-export uploads nothing", async () => {
    const until = retainUntil();
    const fixed = () => until;
    expect(sideTableSegment(workspace, fixed).data.equals(sideTableSegment(workspace, fixed).data)).toBe(true);
    const target = filesystemTestTarget(bucket);
    await exportRetentionSegments({ workspace, target, retainUntil: fixed });
    const again = await exportRetentionSegments({ workspace, target, retainUntil: fixed });
    expect(again.uploaded).toEqual([]);
  });
});
