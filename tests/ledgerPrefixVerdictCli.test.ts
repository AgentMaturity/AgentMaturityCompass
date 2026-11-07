import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { exitIfLedgerPrefix, renderLedgerPrefixVerdict } from "../src/cli-evidence-store-commands.js";
import { startGateway } from "../src/gateway/server.js";
import { LEDGER_UNANCHORED_MESSAGE, verifyLedgerIntegrity, type LedgerPrefixVerdict } from "../src/ledger/ledgerVerification.js";
import type { IssuerAdmission } from "../src/trust/admission.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

/** H3: what `amc verify` prints when a running Studio's gateway session is the only thing short of a complete verdict. */
const FINGERPRINT = "a".repeat(64);
const prefix = (trustRoot: Partial<LedgerPrefixVerdict["trustRoot"]> = {}, payloadsNotEvaluated: string[] = []): LedgerPrefixVerdict => ({
  scope: "verified-prefix",
  unfinalizedSessions: [{ sessionId: "gw-1", runtime: "gateway" }],
  trustRoot: { anchored: false, monitorFingerprint: FINGERPRINT, expectedFingerprint: null, ...trustRoot },
  payloadsNotEvaluated
});
const render = (verdict: LedgerPrefixVerdict) => stripVTControlCharacters(renderLedgerPrefixVerdict(verdict));

describe("renderLedgerPrefixVerdict", () => {
  test("an anchored prefix names the open session and never says PASSED", () => {
    const out = render(prefix({ anchored: true, expectedFingerprint: FINGERPRINT }));
    expect(out.split("\n")[0]).toBe("Ledger verification INCOMPLETE: verified prefix, not a complete-ledger verdict");
    expect(out).toContain("1 session is still open, with no end or seal recorded: gw-1 (gateway).");
    expect(out).toContain(`Anchored to the pinned monitor key ${FINGERPRINT}`);
    expect(out).not.toMatch(/PASSED|signature does not verify|missing seal/);
  });

  test("an unanchored prefix keeps the word-for-word UNANCHORED message", () => {
    const out = render(prefix());
    expect(out.split("\n")[0]).toBe("Ledger verification INCOMPLETE: prefix integrity verified, authorship not (UNANCHORED)");
    expect(out).toContain(LEDGER_UNANCHORED_MESSAGE);
    expect(out).toContain(`Signed by monitor key ${FINGERPRINT}, read from inside the workspace.`);
  });

  test.each(["distrusted", "revoked"] as const)("a %s monitor key fails whatever the prefix", (status) => {
    const monitorAdmission: IssuerAdmission = { signature: "ledger monitor key", purpose: "ledger-row", keyId: null, status,
      source: null, listId: null, timeBasis: null, detail: "listed by the operator" };
    expect(render(prefix({ monitorAdmission }))).toBe(`Ledger verification FAILED: monitor key ${status}. listed by the operator`);
  });

  test("payloads the verifier could not check are counted, never verified", () => {
    expect(render(prefix({}, ["Event e1 payload not evaluated: the ledger key is unavailable here"])))
      .toContain("1 payload(s) not evaluated: the ledger key is unavailable here.");
  });
});

describe("exitIfLedgerPrefix (amc verify)", () => {
  test("a live gateway session exits 1 over a named, anchored prefix; a sealed ledger falls through", { timeout: 120_000 }, async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-prefix-cli-vault");
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
    const root = mkdtempSync(join(tmpdir(), "amc-prefix-cli-"));
    const out: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => { out.push(stripVTControlCharacters(String(line))); });
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    try {
      initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
      const trust = workspaceKeyTrust(root);
      const gateway = await startGateway({ workspace: root, listenPort: 0, logger: { log() {}, error() {} } });
      try {
        const complete = verifyLedgerIntegrity(root, { trust });
        expect(complete.ok).toBe(false);
        expect(() => exitIfLedgerPrefix(root, complete, {}, trust)).toThrow("exit 1");
        expect(out[0]).toContain("Ledger verification INCOMPLETE: verified prefix, not a complete-ledger verdict");
        expect(out[0]).toMatch(/1 session is still open, with no end or seal recorded: .+ \(gateway\)\./);
        expect(out.join("\n")).not.toMatch(/PASSED|missing seal/);
      } finally {
        await gateway.close();
      }
      out.length = 0;
      exitIfLedgerPrefix(root, verifyLedgerIntegrity(root, { trust }), {}, trust);
      expect(out).toEqual([]);
      expect(exit).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore(); exit.mockRestore(); vi.unstubAllEnvs();
      lockVault(root); rmSync(root, { recursive: true, force: true });
    }
  });
});
