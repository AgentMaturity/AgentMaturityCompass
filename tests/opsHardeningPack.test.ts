import { request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { opsPolicyPath, verifyOpsPolicySignature } from "../src/ops/policy.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../src/utils/fs.js";
import { storeEncryptedBlob, loadBlobPlaintext, blobPathFromId } from "../src/storage/blobs/blobStore.js";
import { retentionRunCli, retentionVerifyCli } from "../src/ops/retention/retentionCli.js";
import { createBackup, verifyBackup, restoreBackup } from "../src/ops/backup/backupEngine.js";
import {
  maintenanceRotateLogsCli,
  maintenanceStatsCli,
  maintenanceVacuumCli
} from "../src/ops/maintenance/maintenanceCli.js";
import { ensureMetricsBaseline } from "../src/ops/metrics/metricsMiddleware.js";
import { startMetricsServer } from "../src/ops/metrics/metricsServer.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-ops-pack-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "ops-pack-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolvePromise({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", rejectPromise);
    req.setTimeout(3_000, () => {
      req.destroy(new Error("request timeout"));
    });
    req.end();
  });
}

describe("ops hardening pack", () => {
  test(
    "ops policy tamper fails verification and /readyz fails closed",
    async () => {
      const workspace = newWorkspace();
      const token = "ops-token";
      const server = await startStudioApiServer({
        workspace,
        host: "127.0.0.1",
        port: 0,
        token
      });
      try {
        const address = server.server.address();
        if (!address || typeof address === "string") {
          throw new Error("failed to bind studio test server");
        }
        const port = address.port;
        const readyBefore = await httpGet(`http://127.0.0.1:${port}/readyz`);
        const beforeBody = JSON.parse(readyBefore.body) as { reasons?: unknown };
        const beforeReasons = Array.isArray(beforeBody.reasons) ? beforeBody.reasons.map((row) => String(row)) : [];
      expect(beforeReasons.some((row) => row.includes("OPS_POLICY_UNTRUSTED"))).toBe(false);

      writeFileAtomic(opsPolicyPath(workspace), `${readUtf8(opsPolicyPath(workspace))}\n# tampered\n`, 0o644);
      const verify = verifyOpsPolicySignature(workspace);
      expect(verify.valid).toBe(false);

      const readyAfter = await httpGet(`http://127.0.0.1:${port}/readyz`);
      expect(readyAfter.status).toBe(503);
      expect(readyAfter.body).toContain("OPS_POLICY_UNTRUSTED");
      } finally {
        await server.close();
      }
    },
    15_000
  );

  test("encrypted blob store roundtrip and tamper detection", () => {
    const workspace = newWorkspace();
    const payload = Buffer.from("highly sensitive payload");
    const stored = storeEncryptedBlob(workspace, payload);
    const blobFile = join(workspace, blobPathFromId(stored.blobId));
    const onDisk = readFileSync(blobFile);

    expect(onDisk.includes(payload)).toBe(false);

    const loaded = loadBlobPlaintext(workspace, stored.path);
    expect(loaded.bytes.toString("utf8")).toBe(payload.toString("utf8"));
    expect(loaded.payloadSha256).toBe(stored.payloadSha256);

    // Wrong key version in header should fail.
    const wrongVersion = Buffer.from(onDisk);
    wrongVersion.writeUInt32BE(9_999, "AMC_BLOB_V1".length);
    writeFileSync(blobFile, wrongVersion);
    expect(() => loadBlobPlaintext(workspace, stored.path)).toThrow();

    // Restore original then tamper ciphertext bytes should fail auth.
    writeFileSync(blobFile, onDisk);
    const tampered = Buffer.from(onDisk);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
    writeFileSync(blobFile, tampered);
    expect(() => loadBlobPlaintext(workspace, stored.path)).toThrow();
  });

  test("retention archives and prunes payloads without breaking ledger chain", async () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    const ts = Date.now() - 20 * 24 * 60 * 60 * 1000;
    try {
      ledger.startSession({
        sessionId: "retention-test",
        runtime: "unknown",
        binaryPath: "amc",
        binarySha256: "amc"
      });
      ledger.appendEvidenceDetailed({
        id: "evt-retention-1",
        ts,
        sessionId: "retention-test",
        runtime: "unknown",
        eventType: "stdout",
        payload: "payload one",
        payloadExt: "txt",
        inline: false,
        meta: { test: true }
      });
      ledger.appendEvidenceDetailed({
        id: "evt-retention-2",
        ts: ts + 1,
        sessionId: "retention-test",
        runtime: "unknown",
        eventType: "stderr",
        payload: "payload two",
        payloadExt: "txt",
        inline: false,
        meta: { test: true }
      });
      ledger.sealSession("retention-test");
    } finally {
      ledger.close();
    }

    const dryRun = retentionRunCli(workspace, true);
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.archivedEventCount).toBeGreaterThan(0);
    expect(dryRun.segmentPath).toBeNull();
    expect(dryRun.manifestPath).toBeNull();
    expect(dryRun.manifestSha256).toBeNull();

    const result = retentionRunCli(workspace, false);
    expect(result.segmentId).toBeTruthy();
    expect(result.archivedEventCount).toBeGreaterThan(0);
    expect(result.prunedEventCount).toBeGreaterThan(0);

    const verifyRetention = await retentionVerifyCli(workspace);
    expect(verifyRetention.ok).toBe(true);

    const verifyLedger = await verifyLedgerIntegrity(workspace);
    expect(verifyLedger.ok).toBe(true);

    writeFileSync(result.segmentPath!, Buffer.from("not-a-gzip-segment", "utf8"));
    const invalidRetention = await retentionVerifyCli(workspace);
    expect(invalidRetention.ok).toBe(false);
    expect(invalidRetention.errors.join("\n")).toMatch(/segment sha mismatch|segment read failure/i);
    const invalidLedger = await verifyLedgerIntegrity(workspace);
    expect(invalidLedger.ok).toBe(false);
    expect(invalidLedger.errors.join("\n")).toMatch(/segment sha mismatch|segment read failure/i);
  });

  test("backup create/verify/restore works and tamper fails verify", async () => {
    const workspace = newWorkspace();
    process.env.AMC_BACKUP_PASSPHRASE = "backup-passphrase";
    const backupPath = ".amc/backups/test.amcbackup";
    const created = createBackup({
      workspace,
      outFile: backupPath
    });
    expect(created.backupId.startsWith("bkp_")).toBe(true);

    const verifyOk = verifyBackup({
      backupFile: created.outFile,
      passphrase: "backup-passphrase"
    });
    expect(verifyOk.ok).toBe(true);

    const tamperedPath = join(workspace, ".amc", "backups", "tampered.amcbackup");
    const tampered = Buffer.from(readFileSync(created.outFile));
    tampered[Math.floor(tampered.length / 2)] = tampered[Math.floor(tampered.length / 2)] ^ 0xff;
    writeFileSync(tamperedPath, tampered);
    const verifyTampered = verifyBackup({
      backupFile: tamperedPath,
      passphrase: "backup-passphrase"
    });
    expect(verifyTampered.ok).toBe(false);

    const restoreTo = join(tmpdir(), `amc-restore-${Date.now()}`);
    const restored = await restoreBackup({
      backupFile: created.outFile,
      toDir: restoreTo,
      force: true,
      passphrase: "backup-passphrase"
    });
    expect(restored.restoredTo).toBe(restoreTo);
    expect(Array.isArray(restored.warnings)).toBe(true);
    roots.push(restoreTo);
  });

  test("maintenance stats/vacuum/rotate logs are operational", () => {
    const workspace = newWorkspace();
    const stats = maintenanceStatsCli(workspace);
    expect(stats.dbSizeBytes).toBeGreaterThan(0);

    const vacuum = maintenanceVacuumCli(workspace);
    expect(vacuum.ok).toBe(true);
    expect(vacuum.lastVacuumTs).toBeGreaterThan(0);

    const logsDir = join(workspace, ".amc", "studio", "logs");
    ensureDir(logsDir);
    const stale = join(logsDir, "stale.log");
    writeFileSync(stale, "stale");
    const old = Date.now() / 1000 - 40 * 24 * 60 * 60;
    utimesSync(stale, old, old);
    const rotation = maintenanceRotateLogsCli(workspace);
    expect(rotation.removed.some((row) => row.endsWith("stale.log"))).toBe(true);
  });

  test(
    "metrics endpoint exports required names and no secret patterns",
    async () => {
      const workspace = newWorkspace();
      ensureMetricsBaseline();
      const metrics = await startMetricsServer({
        workspace,
        host: "127.0.0.1",
        port: 0
      });
      try {
      const out = await httpGet(`http://127.0.0.1:${metrics.port}/metrics`);
      expect(out.status).toBe(200);
      const payload = out.body;
      expect(payload).toContain("amc_http_requests_total");
      expect(payload).toContain("amc_http_request_duration_seconds_bucket");
      expect(payload).toContain("amc_leases_issued_total");
      expect(payload).toContain("amc_toolhub_intents_total");
      expect(payload).toContain("amc_toolhub_exec_total");
      expect(payload).toContain("amc_approvals_requests_total");
      expect(payload).toContain("amc_approvals_decisions_total");
      expect(payload).toContain("amc_retention_segments_total");
      expect(payload).toContain("amc_blobs_total");
      expect(payload).toContain("amc_blobs_bytes_total");
      expect(payload).toContain("amc_db_size_bytes");
      expect(payload).toContain("amc_transparency_root_changes_total");
      expect(payload).toContain("amc_integrity_index_gauge");
      expect(payload).not.toMatch(/Bearer\s+/i);
      expect(payload).not.toMatch(/lease_/i);
      expect(payload).not.toMatch(/BEGIN PRIVATE KEY/i);
      } finally {
        await metrics.close();
      }
    },
    15_000
  );
});
