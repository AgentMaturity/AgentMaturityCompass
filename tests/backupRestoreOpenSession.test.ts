import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { GATEWAY_SESSION_STALE_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { createBackup, restoreBackup } from "../src/ops/backup/backupEngine.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { pinnedTrust, workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * LIVE-INTEGRITY-04: a trusted backup's ledger is verified as of the backup's createdTs, so a gateway session that was
 * open when it was taken reads open (an INFO line, no RESTORE_WARNING.txt) however much later it is restored; a session
 * already stale at createdTs is still a missing seal with the warning file.
 */
const BACKUP_PASS = "restore-open-session-backup-passphrase";
const HOUR = 60 * 60_000;
const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { for (const ws of ["a", "c"]) lockVault(join(root, ws)); rmSync(root, { recursive: true, force: true }); }
});

async function restoreWithOpenGateway(tailAgeMs: number, unpinned = false) {
  const root = mkdtempSync(join(tmpdir(), "amc-restore-open-session-"));
  roots.push(root);
  vi.stubEnv("AMC_BACKUP_PASSPHRASE", BACKUP_PASS);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "restore-open-session-vault");
  const a = join(root, "a"), c = join(root, "c");
  mkdirSync(a);
  initWorkspace({ workspacePath: a, trustBoundaryMode: "isolated" });
  const ledger = openLedger(a);
  try {
    ledger.startSession({ sessionId: "gw-open", runtime: "gateway", binaryPath: "gateway", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "gw-open", runtime: "gateway", eventType: "gateway", payload: '{"stage":"start"}', inline: true, ts: Date.now() - tailAgeMs });
  } finally { ledger.close(); }
  const trust = unpinned ? pinnedTrust([], { allowUnpinned: true }) : workspaceKeyTrust(a);
  const backup = createBackup({ workspace: a, outFile: join(root, "a.amcbackup") });
  const createdTs = Date.now(); // the signed manifest.createdTs is at most this
  vi.setSystemTime(createdTs + HOUR); // restored an hour later: at the real time the session would be stale
  const restored = await restoreBackup({ backupFile: backup.outFile, toDir: c, passphrase: BACKUP_PASS, trust });
  return { restored, warningFile: join(c, ".amc", "RESTORE_WARNING.txt") };
}

test("a session open when the backup was taken reads open as of createdTs: an INFO line, no warning file", { timeout: 120_000 }, async () => {
  const { restored, warningFile } = await restoreWithOpenGateway(5 * 60_000);
  expect(restored.warnings.filter((warning) => warning.startsWith("ledger:"))).toEqual([]);
  expect(restored.warnings).toContainEqual(expect.stringMatching(/^INFO: 1 session open: gw-open \(gateway; last signed activity \d+ min ago\)\. .*\(as of .+\)$/));
  expect(restored.trusted).toBe(true);
  expect(existsSync(warningFile)).toBe(false);
});

test("a session already stale at createdTs is a missing seal, with the warning file", { timeout: 120_000 }, async () => {
  const { restored, warningFile } = await restoreWithOpenGateway(GATEWAY_SESSION_STALE_AFTER_MS + 5 * 60_000);
  expect(restored.warnings).toContain("ledger: Session gw-open missing seal");
  expect(restored.trusted).toBe(false);
  expect(readFileSync(warningFile, "utf8")).toContain("ledger: Session gw-open missing seal");
});

test("an untrusted (--allow-unpinned) backup's createdTs is not a verification instant: the real time applies", { timeout: 120_000 }, async () => {
  const { restored } = await restoreWithOpenGateway(5 * 60_000, true);
  expect(restored.report.trusted).toBe(false);
  expect(restored.warnings).toContain("ledger: Session gw-open missing seal");
});
