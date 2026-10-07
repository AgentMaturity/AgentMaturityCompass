import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { verifySignedDigest } from "../src/crypto/signing/signer.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * P0-45 through the built CLI. `amc verify --repair` used to delete .amc/blobs and .amc/reports before checking
 * anything, then the ledger itself, and exit 0. It now prints a plan and changes nothing; only --apply with a
 * confirmation moves a failing store into .amc/quarantine/, with a receipt signed as REPAIR_RECEIPT.
 */
const CLI = resolve("dist/cli.js");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function blobWorkspace(inline = false): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-verify-repair-cli-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default" });
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "s", runtime: "unknown", binaryPath: "/bin/true", binarySha256: "0".repeat(64) });
  ledger.appendEvidence({ sessionId: "s", runtime: "unknown", eventType: "stdout", payload: "blob-backed evidence one", inline });
  ledger.appendEvidence({ sessionId: "s", runtime: "unknown", eventType: "stdout", payload: "blob-backed evidence two", inline });
  ledger.sealSession("s");
  ledger.close();
  // The writer's pooled connection would keep -wal/-shm live; a repair runs with no writer attached.
  closeAllSqlitePools();
  mkdirSync(join(workspace, ".amc", "reports"), { recursive: true });
  writeFileSync(join(workspace, ".amc", "reports", "kept.md"), "# report\n");
  return workspace;
}

function tamper(workspace: string): void {
  const blobs = join(workspace, ".amc", "blobs");
  const blob = join(blobs, readdirSync(blobs).find((name) => name.endsWith(".blob"))!);
  const bytes = readFileSync(blob);
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
  writeFileSync(blob, bytes);
}

function snapshot(workspace: string): Record<string, string> {
  const root = join(workspace, ".amc");
  return Object.fromEntries(readdirSync(root, { recursive: true }).map(String).sort().flatMap((rel) => {
    const path = join(root, rel);
    if (!statSync(path).isFile() || /evidence\.sqlite-(wal|shm)$/.test(rel)) return [];
    return [[rel, sha256Hex(readFileSync(path))]];
  }));
}

function amc(cwd: string, args: string[]) {
  const amcHome = mkdtempSync(join(tmpdir(), "amc-verify-repair-home-"));
  roots.push(amcHome);
  // The passphrase initWorkspace used under vitest: a locked vault cannot open blobs, which reads as tampering.
  const env: NodeJS.ProcessEnv = {
    ...process.env, NO_COLOR: "1", AMC_HOME: amcHome, AMC_VAULT_PASSPHRASE: process.env.AMC_VAULT_PASSPHRASE ?? "amc-test-passphrase"
  };
  delete env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  // stdin is a pipe, never a TTY, so --apply without --yes must refuse rather than prompt.
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 60_000, input: "" });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe("amc verify --repair", () => {
  it("changes nothing on a healthy workspace and exits 0", () => {
    const workspace = blobWorkspace();
    const before = snapshot(workspace);
    const result = amc(workspace, ["verify", "--repair"]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("Removed");
    expect(snapshot(workspace)).toEqual(before);
  });

  it("prints a plan for a tampered workspace, exits 1 and changes nothing", () => {
    const workspace = blobWorkspace();
    tamper(workspace);
    const before = snapshot(workspace);
    const result = amc(workspace, ["verify", "--repair"]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).not.toContain("Removed");
    expect(result.output).toContain("Nothing has been changed.");
    expect(result.output).toContain(".amc/evidence.sqlite");
    expect(snapshot(workspace)).toEqual(before);
  });

  it("refuses --apply without a TTY or --yes, exits 2 and moves nothing", () => {
    const workspace = blobWorkspace();
    tamper(workspace);
    const before = snapshot(workspace);
    const result = amc(workspace, ["verify", "--repair", "--apply"]);
    expect(result.status, result.output).toBe(2);
    expect(snapshot(workspace)).toEqual(before);
    expect(existsSync(join(workspace, ".amc", "quarantine"))).toBe(false);
  });

  it("archives a tampered store with --apply --yes under a receipt signed as REPAIR_RECEIPT", () => {
    const workspace = blobWorkspace();
    tamper(workspace);
    const before = snapshot(workspace);
    const result = amc(workspace, ["verify", "--repair", "--apply", "--yes"]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("Removed");

    const quarantine = join(workspace, ".amc", "quarantine");
    const [id] = readdirSync(quarantine);
    const receiptPath = join(quarantine, id!, "repair-receipt.json");
    const receiptBytes = readFileSync(receiptPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8")) as { moved: Array<{ from: string; to: string; sha256: string }> };
    expect(receipt.moved.length).toBeGreaterThan(0);
    const movedFrom = new Set(receipt.moved.map((row) => row.from.replace(/^\.amc\//, "")));
    for (const row of receipt.moved) expect(sha256Hex(readFileSync(join(workspace, row.to)))).toBe(row.sha256);
    // Every pre-repair file is byte-identical in place or at the quarantine path the receipt names.
    for (const [rel, sha] of Object.entries(before)) {
      if (movedFrom.has(rel)) expect(receipt.moved.find((row) => row.from === `.amc/${rel}`)?.sha256).toBe(sha);
      else expect(sha256Hex(readFileSync(join(workspace, ".amc", rel))), rel).toBe(sha);
    }
    expect(movedFrom.has("evidence.sqlite")).toBe(true);
    // .amc/reports is never moved or modified.
    expect(readFileSync(join(workspace, ".amc", "reports", "kept.md"), "utf8")).toBe("# report\n");

    const signed = JSON.parse(readFileSync(`${receiptPath}.sig`, "utf8")) as { signature: string; envelope?: unknown };
    expect(verifySignedDigest({ workspace, digestHex: sha256Hex(receiptBytes), signed })).toBe(true);
    const altered = Buffer.from(receiptBytes);
    altered[10] = (altered[10] ?? 0) ^ 0x01;
    expect(verifySignedDigest({ workspace, digestHex: sha256Hex(altered), signed })).toBe(false);

    const later = amc(workspace, ["verify"]);
    expect(later.status, later.output).toBe(1);
    expect(later.output).toContain("Note: 1 archived evidence store(s) failed verification; latest receipt: .amc/quarantine/");
  });
});

describe("amc verify messages", () => {
  it("no longer recommends cleaning and rebuilding when every signature fails", () => {
    // Inline payloads, so the only failures are signatures (a blob's authentication also binds the monitor key).
    const workspace = blobWorkspace(true);
    // A substituted monitor key: every event and seal signature fails, which is what tampering looks like.
    const { publicKey } = generateKeyPairSync("ed25519");
    writeFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), publicKey.export({ format: "pem", type: "spki" }).toString());
    const result = amc(workspace, ["verify"]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("signature");
    expect(result.output).not.toContain("clean and rebuild");
    expect(result.output).not.toContain("auto-clean");
  });
});
