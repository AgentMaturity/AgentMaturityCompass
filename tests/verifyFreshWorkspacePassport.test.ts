import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { LEDGER_UNANCHORED_MESSAGE } from "../src/ledger/ledgerVerification.js";
import { verifyAll, verifyAllTopReasons } from "../src/verify/verifyAll.js";
import { ed25519KeyId } from "../src/trust/index.js";
import { pinnedTrust, workspaceKeyPem, workspaceKeyTrust } from "./helpers/trustContext.js";
import { tinyReleaseBundle, type TinyReleaseBundle } from "./helpers/tinyReleaseBundle.js";
import { createBackup } from "../src/ops/backup/backupEngine.js";
import { distrustEntry } from "./trust/trustFixtures.js";

describe("verify all on a fresh workspace (first-run passport boundary)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-verify-fresh-"));
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("uninitialized passport reports SKIP, not a critical failure", async () => {
    const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
    const policy = report.checks.find((check) => check.id === "passport-policy-signature");
    const integrity = report.checks.find((check) => check.id === "passport-workspace-integrity");
    expect(policy?.status).toBe("SKIP");
    expect(policy?.details).toEqual(["passport not initialized yet"]);
    expect(integrity?.status).toBe("SKIP");
    const passportFailures = report.checks.filter(
      (check) => check.id.startsWith("passport-") && check.status === "FAIL"
    );
    expect(passportFailures).toEqual([]);
  });

  test("fails closed when passport artifacts exist without a signed policy", async () => {
    const cacheDir = join(dir, ".amc", "passport", "cache");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "latest_agent_default.json"), "{}");
    const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
    const policy = report.checks.find((check) => check.id === "passport-policy-signature");
    expect(policy?.status).toBe("FAIL");
    expect(report.criticalFail).toBe(true);
  });
});

describe("verify all and the operator's trust (P0-09)", () => {
  let dir: string;
  const releaseRoots: string[] = [];

  beforeEach(() => {
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
    dir = mkdtempSync(join(tmpdir(), "amc-verify-trust-"));
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
    for (const root of releaseRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const check = (report: Awaited<ReturnType<typeof verifyAll>>, id: string) => report.checks.find((row) => row.id === id);
  const monitorId = () => ed25519KeyId(workspaceKeyPem(dir, "monitor"))!;

  test("passes the ledger trust root when the operator pinned the monitor key, and names the key", async () => {
    const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
    expect(check(report, "ledger-hash-chain")?.status).toBe("PASS");
    expect(check(report, "ledger-trust-root")).toEqual({
      id: "ledger-trust-root", status: "PASS", critical: true, details: [`monitor key ${monitorId()} admitted for ledger-row`]
    });
  });

  test("fails a ledger whose monitor key nobody pinned as a critical UNANCHORED failure", async () => {
    const report = await verifyAll({ workspace: dir, trust: pinnedTrust([]) });
    expect(check(report, "ledger-hash-chain")?.status).toBe("PASS");
    expect(check(report, "ledger-trust-root")).toEqual({ id: "ledger-trust-root", status: "FAIL", critical: true, details: [LEDGER_UNANCHORED_MESSAGE] });
    expect(report.criticalFail).toBe(true);
    expect(report.status).toBe("FAIL");
    expect(verifyAllTopReasons(report)).toContain(`ledger-trust-root: ${LEDGER_UNANCHORED_MESSAGE}`);
  });

  test("skips, rather than fails, the trust root under --allow-unanchored, so the run is integrity-only and not a critical failure", async () => {
    const report = await verifyAll({ workspace: dir, trust: pinnedTrust([], { allowUnanchored: true }) });
    expect(check(report, "ledger-hash-chain")?.status).toBe("PASS");
    expect(check(report, "ledger-trust-root")).toEqual({
      id: "ledger-trust-root", status: "SKIP", critical: true, details: ["UNANCHORED (--allow-unanchored): internal consistency only"]
    });
    expect(report.criticalFail).toBe(false);
  });

  test("fails a distrusted monitor key even when it is pinned and --allow-unanchored was used", async () => {
    const trust = workspaceKeyTrust(dir, { allowUnanchored: true, distrust: [distrustEntry(monitorId(), { note: "verify all test" })] });
    const report = await verifyAll({ workspace: dir, trust });
    const root = check(report, "ledger-trust-root");
    expect(root?.status).toBe("FAIL");
    expect(root?.details[0]).toContain("monitor key distrusted: ");
    expect(root?.details[0]).toContain("verify all test");
    expect(report.criticalFail).toBe(true);
  });

  describe("backups", () => {
    /** A backup signed by another workspace's auditor key, placed in this workspace: integrity intact, signer not admitted. */
    function foreignBackup(): string {
      const other = mkdtempSync(join(tmpdir(), "amc-verify-foreign-"));
      releaseRoots.push(other);
      initWorkspace({ workspacePath: other, trustBoundaryMode: "isolated" });
      mkdirSync(join(dir, "backups"), { recursive: true });
      const file = join(dir, "backups", "foreign.amcbackup");
      writeFileSync(file, readFileSync(createBackup({ workspace: other, outFile: join(other, "ws.amcbackup") }).outFile));
      return readFileSync(join(other, ".amc", "keys", "auditor_ed25519.pub"), "utf8");
    }

    test("fails, never skips, a backup whose signer is not admitted, naming the key, with or without a passphrase", async () => {
      vi.stubEnv("AMC_BACKUP_PASSPHRASE", "verify-all-backup-passphrase");
      const keyId = ed25519KeyId(foreignBackup())!;
      for (const passphrase of ["verify-all-backup-passphrase", undefined]) {
        vi.stubEnv("AMC_BACKUP_PASSPHRASE", passphrase);
        const row = check(await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) }), "backup-manifests");
        expect(row?.status, String(passphrase)).toBe("FAIL");
        expect(row?.details[0]).toContain(`manifest.sig (artifact-seal): not-pinned`);
        expect(row?.details[0]).toContain(`key ${keyId} is not pinned`);
      }
    });

    test("passes this workspace's own backup, and skips it only when the passphrase is missing", async () => {
      vi.stubEnv("AMC_BACKUP_PASSPHRASE", "verify-all-backup-passphrase");
      mkdirSync(join(dir, "backups"), { recursive: true });
      createBackup({ workspace: dir, outFile: join(dir, "backups", "own.amcbackup") });
      expect(check(await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) }), "backup-manifests")?.status).toBe("PASS");
      vi.stubEnv("AMC_BACKUP_PASSPHRASE", undefined);
      expect(check(await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) }), "backup-manifests")?.status).toBe("SKIP");
    });
  });

  describe("release bundles", () => {
    function withBundle(): TinyReleaseBundle {
      const root = mkdtempSync(join(tmpdir(), "amc-verify-release-"));
      releaseRoots.push(root);
      const bundle = tinyReleaseBundle(root);
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "release.amcrelease"), readFileSync(bundle.file));
      return bundle;
    }
    const withReleasePin = (bundle: TinyReleaseBundle) => {
      const ledger = workspaceKeyTrust(dir);
      return { ...ledger, explicitPins: [...ledger.explicitPins, ...pinnedTrust([{ publicKeyPem: bundle.publicKeyPem, purposes: ["release"] }]).explicitPins] };
    };

    test("skips the check when dist/ holds no .amcrelease", async () => {
      const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
      expect(check(report, "release-bundles")).toEqual({ id: "release-bundles", status: "SKIP", critical: false, details: ["no .amcrelease files found in dist/"] });
    });

    test("passes a bundle signed by a key the operator pinned for release", async () => {
      const bundle = withBundle();
      const report = await verifyAll({ workspace: dir, trust: withReleasePin(bundle) });
      expect(check(report, "release-bundles")).toEqual({ id: "release-bundles", status: "PASS", critical: false, details: ["verified 1 release bundles"] });
    });

    test("refuses a bundle whose signer is only the key it carries, naming the key to pin", async () => {
      const bundle = withBundle();
      const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
      const row = check(report, "release-bundles");
      expect(row?.status).toBe("FAIL");
      expect(row?.critical).toBe(false);
      expect(row?.details).toEqual([expect.stringContaining(`release.amcrelease: manifest.sig (release): not-pinned`)]);
      expect(row?.details[0]).toContain(`key ${bundle.keyId} is not pinned for release`);
      expect(report.status).toBe("FAIL");
    });

    test("does not turn --allow-unanchored into a pass for a release bundle nobody pinned", async () => {
      withBundle();
      const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir, { allowUnanchored: true }) });
      expect(check(report, "release-bundles")?.status).toBe("FAIL");
    });

    test("reports a bundle that is not an archive as one failure line that names the file", async () => {
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "broken.amcrelease"), "not an archive");
      const report = await verifyAll({ workspace: dir, trust: workspaceKeyTrust(dir) });
      const row = check(report, "release-bundles");
      expect(row?.status).toBe("FAIL");
      expect(row?.details).toEqual([expect.stringContaining(`${join(dir, "dist", "broken.amcrelease")}: `)]);
    });
  });
});
