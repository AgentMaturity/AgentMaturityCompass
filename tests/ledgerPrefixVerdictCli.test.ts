import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { renderLedgerVerdict } from "../src/cli-evidence-store-commands.js";
import { ledgerExitCode } from "../src/cli-trust-flags.js";
import { startGateway } from "../src/gateway/server.js";
import { LEDGER_UNANCHORED_MESSAGE, verifyLedgerIntegrity, type VerifyResult } from "../src/ledger/ledgerVerification.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * LIVE-INTEGRITY-02: what `amc verify` prints while a running Studio's gateway session is open. The file kept its name
 * (no tracked-file deletion); r2-c's "verified prefix" verdict it used to cover was removed by LIVE-INTEGRITY-01.
 */
const FINGERPRINT = "a".repeat(64);
const verdict = (ok: boolean, trustRoot: Partial<VerifyResult["trustRoot"]> = {}): Pick<VerifyResult, "ok" | "trustRoot" | "sessions"> => ({
  ok,
  trustRoot: { anchored: false, monitorFingerprint: FINGERPRINT, expectedFingerprint: null, ...trustRoot },
  sessions: { open: [], released: [], interrupted: [], closed: [], liveLegacy: [{ sessionId: "gw-1", runtime: "gateway", lastSignedTs: Date.now() - 120_000 }] }
});
const render = (result: Pick<VerifyResult, "ok" | "trustRoot" | "sessions">, allowUnanchored = false) =>
  stripVTControlCharacters(renderLedgerVerdict(result, allowUnanchored));

describe("renderLedgerVerdict with an open session", () => {
  test("anchored: PASSED, then the open session by id, never INCOMPLETE, missing seal or a bad signature", () => {
    const out = render(verdict(true, { anchored: true, expectedFingerprint: FINGERPRINT }));
    expect(out.split("\n")[0]).toBe("Ledger verification PASSED");
    expect(out).toContain(`Anchored to the pinned monitor key ${FINGERPRINT}`);
    expect(out).toContain("1 session open: gw-1 (gateway; last signed activity 2 min ago).");
    expect(out).not.toMatch(/INCOMPLETE|missing seal|signature does not verify/);
  });

  test("unanchored keeps the UNANCHORED message word for word, plus the open-session line", () => {
    const out = render(verdict(true));
    expect(out.split("\n")[0]).toBe(LEDGER_UNANCHORED_MESSAGE);
    expect(out).toContain(`Signed by monitor key ${FINGERPRINT}, read from inside the workspace.`);
    expect(out).toContain("1 session open: gw-1 (gateway;");
  });

  test("a failed verdict prints no open-session line", () => {
    expect(render(verdict(false, { anchored: true }))).toBe("Ledger verification FAILED");
  });

  test("no open session, no line", () => {
    const result = { ...verdict(true, { anchored: true }), sessions: { ...verdict(true).sessions, liveLegacy: [] } };
    expect(render(result)).not.toContain("session open");
  });
});

describe("amc verify against a running gateway", () => {
  test("exit 0 with the gateway session named while it runs; no open-session line once it stopped", { timeout: 120_000 }, async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-open-session-cli-vault");
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
    const root = mkdtempSync(join(tmpdir(), "amc-open-session-cli-"));
    try {
      initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
      const trust = workspaceKeyTrust(root);
      const gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
      try {
        const live = verifyLedgerIntegrity(root, { trust });
        expect(ledgerExitCode(live, trust)).toBe(0);
        const out = render(live);
        expect(out.split("\n")[0]).toBe("Ledger verification PASSED");
        expect(out).toContain(`1 session open: ${gateway.gatewaySessionId} (gateway; last signed activity 0 min ago)`);
      } finally {
        await gateway.close();
      }
      const stopped = verifyLedgerIntegrity(root, { trust });
      expect(ledgerExitCode(stopped, trust)).toBe(0);
      expect(render(stopped)).not.toContain("session open");
    } finally {
      vi.unstubAllEnvs(); lockVault(root); rmSync(root, { recursive: true, force: true });
    }
  });
});
