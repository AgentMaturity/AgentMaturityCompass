import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { startGateway } from "../src/gateway/server.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

/** LIVE-INTEGRITY-02: `amc verify all` while Studio's gateway runs passes its ledger checks and names the open session. */
test("verify all: ledger-hash-chain PASS with the open-session line while a gateway runs, PASS overall when pinned", { timeout: 120_000 }, async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-verify-all-live-gateway");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  const root = mkdtempSync(join(tmpdir(), "amc-verify-all-live-"));
  try {
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const trust = workspaceKeyTrust(root);
    const gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
    try {
      const report = await verifyAll({ workspace: root, trust });
      const chain = report.checks.find((check) => check.id === "ledger-hash-chain");
      expect(chain?.status).toBe("PASS");
      expect(chain?.details[0]).toBe("event hash-chain and signatures verified");
      expect(chain?.details[1]).toMatch(new RegExp(`^1 session open: ${gateway.gatewaySessionId} \\(gateway; last signed activity \\d+ min ago\\)\\. `));
      expect(report.checks.find((check) => check.id === "ledger-trust-root")?.status).toBe("PASS");
      expect(report.status, JSON.stringify(report.checks.filter((check) => check.status !== "PASS"))).toBe("PASS");
    } finally {
      await gateway.close();
    }
    const stopped = await verifyAll({ workspace: root, trust });
    expect(stopped.checks.find((check) => check.id === "ledger-hash-chain")?.details).toEqual(["event hash-chain and signatures verified"]);
  } finally {
    vi.unstubAllEnvs(); lockVault(root); rmSync(root, { recursive: true, force: true });
  }
});
