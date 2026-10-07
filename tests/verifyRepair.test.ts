import * as fs from "node:fs";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { SignedDigest } from "../src/crypto/signing/signerTypes.js";
import {
  applyVerifyRepair, planVerifyRepair, RepairRefused, type HoldState, type RepairPlan, type RepairReceipt
} from "../src/ledger/verifyRepair.js";

// A plain-object copy of node:fs, so `vi.spyOn` can replace renameSync for the rename-failure case.
vi.mock("node:fs", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:fs")>()) }));

/**
 * P0-45: `amc verify --repair` used to delete .amc/blobs, .amc/reports and then the ledger. Repair now plans, and its
 * apply step only moves a failing evidence store into .amc/quarantine/<id>/ behind a legal-hold check and a signed
 * receipt. Every case below checks the same invariant: each pre-repair file's bytes are still at their original path
 * or at the quarantine path the receipt names.
 */
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const REPORT = "reports/kept-report.md";

function blobWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-verify-repair-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default" });
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "s", runtime: "unknown", binaryPath: "/bin/true", binarySha256: "0".repeat(64) });
    for (const payload of ["first blob payload", "second blob payload"]) {
      const id = ledger.appendEvidence({ sessionId: "s", runtime: "unknown", eventType: "stdout", payload, inline: false });
      expect(ledger.getAllEvents().find((event) => event.id === id)?.payload_path).toMatch(/\.blob$/);
    }
    ledger.sealSession("s");
  } finally {
    ledger.close();
    // The writer's pooled connection would keep -wal/-shm live; a repair runs with no writer attached.
    closeAllSqlitePools();
  }
  mkdirSync(join(workspace, ".amc", "reports"), { recursive: true });
  writeFileSync(join(workspace, ".amc", REPORT), "# a generated report repair must never touch\n");
  return workspace;
}

/** SHA-256 of every file under .amc/, keyed by workspace-relative POSIX path. */
function snapshot(workspace: string): Record<string, string> {
  const root = join(workspace, ".amc");
  return Object.fromEntries(readdirSync(root, { recursive: true }).map(String).sort().flatMap((rel) => {
    const path = join(root, rel);
    return statSync(path).isFile() ? [[`.amc/${rel.split("\\").join("/")}`, sha256Hex(readFileSync(path))]] : [];
  }));
}

/** SQLite may coordinate a reader through sidecars; plan mode compares everything else byte for byte. */
const withoutSidecars = (snap: Record<string, string>) =>
  Object.fromEntries(Object.entries(snap).filter(([path]) => !/evidence\.sqlite-(wal|shm)$/.test(path)));

function blobFiles(workspace: string): string[] {
  return readdirSync(join(workspace, ".amc", "blobs")).filter((name) => name.endsWith(".blob")).map((name) => join(workspace, ".amc", "blobs", name));
}

function flipByte(path: string): void {
  const bytes = readFileSync(path);
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
  writeFileSync(path, bytes);
}

/** Each pre-repair file is byte-identical at its original path or at the quarantine path the receipt names. */
function expectEveryByteReachable(workspace: string, before: Record<string, string>, receipt?: RepairReceipt): void {
  const movedTo = new Map((receipt?.moved ?? []).map((row) => [row.from, row.to]));
  for (const [path, sha] of Object.entries(before)) {
    const at = existsSync(join(workspace, path)) ? path : movedTo.get(path);
    expect(at, `${path} is neither in place nor in the receipt`).toBeDefined();
    expect(sha256Hex(readFileSync(join(workspace, at!))), `${path} bytes at ${at}`).toBe(sha);
  }
}

const noHolds = (): HoldState => ({ state: "none" });
const stubSign = (digestHex: string): SignedDigest =>
  ({ digestSha256: digestHex, signature: `stub:${digestHex}`, signedTs: 1, signer: "auditor" });
const FIXED_NOW = () => new Date("2026-10-07T12:34:56.789Z");

function expectRefused(run: () => unknown, message: RegExp): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RepairRefused);
  expect((caught as Error).message).toMatch(message);
}

const quarantineExists = (workspace: string) => existsSync(join(workspace, ".amc", "quarantine"));

describe("planVerifyRepair", () => {
  it("plans nothing for a healthy store and apply moves nothing", () => {
    const workspace = blobWorkspace();
    const before = snapshot(workspace);
    const plan = planVerifyRepair(workspace);
    expect(plan.verified).toBe(true);
    expect(plan.action).toBe("none");
    expect(plan.files).toEqual([]);
    expectRefused(() => applyVerifyRepair(workspace, plan, { legalHolds: noHolds, sign: stubSign }), /nothing to archive/);
    expect(withoutSidecars(snapshot(workspace))).toEqual(withoutSidecars(before));
    expect(quarantineExists(workspace)).toBe(false);
  });

  it("leaves evidence alone when only a signed config failed", () => {
    const workspace = blobWorkspace();
    appendFileSync(join(workspace, ".amc", "tools.yaml"), "# edited after signing\n");
    const before = snapshot(workspace);
    const plan = planVerifyRepair(workspace);
    expect(plan.verified).toBe(false);
    expect(plan.chainOk).toBe(true);
    expect(plan.errorCounts.governance).toBeGreaterThan(0);
    expect(plan.action).toBe("none");
    expect(plan.files).toEqual([]);
    expect(withoutSidecars(snapshot(workspace))).toEqual(withoutSidecars(before));
  });

  it("counts a tampered blob and plans to archive the ledger, the blobs, the index and its signature", () => {
    const workspace = blobWorkspace();
    flipByte(blobFiles(workspace)[0]!);
    const before = snapshot(workspace);
    const plan = planVerifyRepair(workspace);
    const after = snapshot(workspace);
    expect(plan.chainOk).toBe(false);
    expect(plan.errorCounts.payload_mismatch).toBe(1);
    expect(plan.action).toBe("archive_evidence_store");
    const planned = plan.files.map((file) => file.path);
    expect(planned).toContain(".amc/evidence.sqlite");
    expect(planned).toContain(".amc/blobs/index.jsonl");
    expect(planned).toContain(".amc/blobs/index.jsonl.sig");
    for (const blob of blobFiles(workspace)) expect(planned).toContain(`.amc/blobs/${blob.split(/[\\/]/).pop()}`);
    // Nothing outside the evidence store is ever listed.
    expect(planned.every((path) => /^\.amc\/(evidence\.sqlite(-wal|-shm)?|blobs\/.+)$/.test(path))).toBe(true);
    for (const file of plan.files) expect(file.sha256).toBe(after[file.path]);
    expect(withoutSidecars(snapshot(workspace))).toEqual(withoutSidecars(before));
  });

  it("counts a missing blob and keeps the ledger in plan mode", () => {
    const workspace = blobWorkspace();
    unlinkSync(blobFiles(workspace)[0]!);
    const before = snapshot(workspace);
    const plan = planVerifyRepair(workspace);
    expect(plan.errorCounts.missing_blob).toBe(1);
    expect(plan.action).toBe("archive_evidence_store");
    expect(existsSync(join(workspace, ".amc", "evidence.sqlite"))).toBe(true);
    expect(withoutSidecars(snapshot(workspace))).toEqual(withoutSidecars(before));
  });
});

describe("applyVerifyRepair", () => {
  /** A tampered store and its plan. The snapshot is taken after planning: the read-only verifier may leave SQLite sidecars. */
  function tampered(): { workspace: string; plan: RepairPlan; before: Record<string, string> } {
    const workspace = blobWorkspace();
    flipByte(blobFiles(workspace)[0]!);
    const plan = planVerifyRepair(workspace);
    return { workspace, plan, before: snapshot(workspace) };
  }

  it("moves every planned file into quarantine with its original SHA-256 and leaves .amc/reports alone", () => {
    const { workspace, plan, before } = tampered();
    const signed: string[] = [];
    const { quarantineDir, receipt } = applyVerifyRepair(workspace, plan, {
      legalHolds: noHolds, sign: (digest) => { signed.push(digest); return stubSign(digest); }, now: FIXED_NOW
    });
    expect(quarantineDir).toMatch(/[\\/]\.amc[\\/]quarantine[\\/]20261007T123456Z-[0-9a-f]{8}$/);
    expect(receipt.type).toBe("amc.verify-repair");
    expect(receipt.legalHold.state).toBe("none");
    expect(receipt.untouched).toContain(".amc/reports");
    expect(receipt.moved.map((row) => row.from).sort()).toEqual(plan.files.map((file) => file.path).sort());
    for (const row of receipt.moved) {
      expect(existsSync(join(workspace, row.from)), row.from).toBe(false);
      expect(row.to.startsWith(".amc/quarantine/")).toBe(true);
      expect(sha256Hex(readFileSync(join(workspace, row.to)))).toBe(before[row.from]);
      expect(row.sha256).toBe(before[row.from]);
    }
    expectEveryByteReachable(workspace, before, receipt);
    expect(readFileSync(join(workspace, ".amc", REPORT), "utf8")).toContain("never touch");
    expect(snapshot(workspace)[`.amc/${REPORT}`]).toBe(before[`.amc/${REPORT}`]);
    // The receipt on disk is the one returned, and its signature covers its exact bytes.
    const receiptBytes = readFileSync(join(quarantineDir, "repair-receipt.json"));
    expect(JSON.parse(receiptBytes.toString("utf8"))).toEqual(receipt);
    const sig = JSON.parse(readFileSync(join(quarantineDir, "repair-receipt.json.sig"), "utf8")) as SignedDigest;
    expect(sig.digestSha256).toBe(sha256Hex(receiptBytes));
    expect(signed).toHaveLength(2);
    expect(existsSync(join(quarantineDir, "repair-plan.json"))).toBe(true);
  });

  it("refuses when the legal hold state is unknown, and moves nothing", () => {
    const { workspace, plan, before } = tampered();
    expectRefused(() => applyVerifyRepair(workspace, plan, {
      legalHolds: () => ({ state: "unknown", reason: "hold register unreadable" }), sign: stubSign
    }), /legal hold state unknown: hold register unreadable/);
    expect(snapshot(workspace)).toEqual(before);
    expect(quarantineExists(workspace)).toBe(false);
    expectEveryByteReachable(workspace, before);
  });

  it("refuses when the hold check itself throws", () => {
    const { workspace, plan, before } = tampered();
    expectRefused(() => applyVerifyRepair(workspace, plan, {
      legalHolds: () => { throw new Error("register offline"); }, sign: stubSign
    }), /legal hold state unknown: register offline/);
    expect(snapshot(workspace)).toEqual(before);
  });

  it("refuses under an active hold and names it", () => {
    const { workspace, plan, before } = tampered();
    expectRefused(() => applyVerifyRepair(workspace, plan, {
      legalHolds: () => ({ state: "active", holdIds: ["hold-litigation-7"] }), sign: stubSign
    }), /hold-litigation-7/);
    expect(snapshot(workspace)).toEqual(before);
    expect(quarantineExists(workspace)).toBe(false);
  });

  it("refuses when the monitor key does not match the expected fingerprint", () => {
    const workspace = blobWorkspace();
    const before = snapshot(workspace);
    const plan = planVerifyRepair(workspace, { expectedMonitorFingerprint: "ab".repeat(32) });
    expect(plan.errorCounts.trust_root).toBe(1);
    expect(plan.action).toBe("archive_evidence_store");
    expectRefused(() => applyVerifyRepair(workspace, plan, { legalHolds: noHolds, sign: stubSign }), /trust root|expected fingerprint/);
    expect(withoutSidecars(snapshot(workspace))).toEqual(withoutSidecars(before));
    expect(quarantineExists(workspace)).toBe(false);
  });

  it("refuses before any move when signing fails", () => {
    const { workspace, plan, before } = tampered();
    expectRefused(() => applyVerifyRepair(workspace, plan, {
      legalHolds: noHolds, sign: () => { throw new Error("trust config signature invalid: edited"); }
    }), /trust config signature invalid/);
    expect(snapshot(workspace)).toEqual(before);
    expect(quarantineExists(workspace)).toBe(false);
  });

  it("refuses when a planned file changed after the plan", () => {
    const { workspace, plan } = tampered();
    flipByte(blobFiles(workspace)[1]!);
    const changed = snapshot(workspace);
    expectRefused(() => applyVerifyRepair(workspace, plan, { legalHolds: noHolds, sign: stubSign }), /evidence changed since the plan/);
    expect(snapshot(workspace)).toEqual(changed);
    expect(quarantineExists(workspace)).toBe(false);
  });

  it("puts moved files back when a rename fails part way", () => {
    const { workspace, plan, before } = tampered();
    expect(plan.files.length).toBeGreaterThanOrEqual(3);
    const realRename = fs.renameSync;
    let intoQuarantine = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (/[\\/]quarantine[\\/]/.test(String(to)) && !/[\\/]quarantine[\\/]/.test(String(from)) && ++intoQuarantine === 3) {
        throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
      }
      realRename(from, to);
    });
    expectRefused(() => applyVerifyRepair(workspace, plan, { legalHolds: noHolds, sign: stubSign }), /EXDEV/);
    vi.restoreAllMocks();
    expect(intoQuarantine).toBe(3);
    expect(snapshot(workspace)).toEqual(before);
    expect(quarantineExists(workspace)).toBe(false);
    expectEveryByteReachable(workspace, before);
  });
});
