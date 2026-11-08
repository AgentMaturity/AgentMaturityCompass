/**
 * B1 (final overseer review, 2026-11-08): `amc verify` and `amc verify all` run without a terminal and without
 * AMC_VAULT_PASSPHRASE (cron, `docker exec`, `kubectl exec`, an agent shell) reported a healthy workspace as tampered:
 * every encrypted blob payload as `payload authentication failed`, and the running gateway's session as `missing seal`.
 * A payload whose key a locked vault holds is NOT EVALUATED, never an authentication failure; the open session is still
 * named; and the verdict is never PASS: exit 1, in wording apart from tampering. A forged payload still fails wherever its
 * key is reachable.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderLedgerVerdict } from "../src/cli-evidence-store-commands.js";
import { ledgerExitCode, verifyAllExit } from "../src/cli-trust-flags.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity, type VerifyResult } from "../src/ledger/ledgerVerification.js";
import type { TrustContext } from "../src/trust/index.js";
import { lockVault } from "../src/vault/vault.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

const PASSPHRASE = "synthetic-locked-verify-vault";
const TAMPER = /authentication failed|missing seal/;
// The words a verdict that held would use; "AMC_VAULT_PASSPHRASE" and "verification" contain neither as a word.
const HELD = /\bPASS(ED)?\b|\bverified\b/i;

afterEach(() => {
  vi.restoreAllMocks();
});

const render = (result: Pick<VerifyResult, "ok" | "trustRoot" | "sessions" | "payloadsNotEvaluated">) => stripVTControlCharacters(renderLedgerVerdict(result));

/** A new workspace with a running gateway: its session is open and unsealed, and its rows carry encrypted blob payloads. */
async function withRunningGateway(run: (root: string, sessionId: string, trust: TrustContext) => Promise<void>): Promise<void> {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  const root = mkdtempSync(join(tmpdir(), "amc-locked-verify-"));
  try {
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const trust = workspaceKeyTrust(root);
    const gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
    try {
      await run(root, gateway.gatewaySessionId, trust);
    } finally {
      vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE); // the gateway seals its session with the vault on close
      await gateway.close();
    }
  } finally {
    vi.unstubAllEnvs();
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
}

/** As cron, `docker exec` or an agent shell run verification: no passphrase in the environment, no unlocked session here. */
function lockedShell(root: string): void {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  lockVault(root);
}

function blobPaths(root: string): string[] {
  const ledger = openLedger(root);
  try {
    return (ledger.db.prepare("SELECT payload_path FROM evidence_events WHERE payload_path IS NOT NULL").all() as Array<{ payload_path: string }>)
      .map((row) => join(root, row.payload_path));
  } finally {
    ledger.close();
  }
}

/** Runs verifyAllExit and returns the code it exits with (null: it did not exit). */
function exitCodeOf(report: Parameters<typeof verifyAllExit>[0], trust: TrustContext): number | null {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
  try {
    verifyAllExit(report, trust);
    return null;
  } catch (error) {
    const match = /^exit (\d+)$/.exec(error instanceof Error ? error.message : "");
    if (!match) throw error;
    return Number(match[1]);
  } finally {
    exit.mockRestore();
  }
}

describe("verification with the vault locked", () => {
  test("amc verify: payloads NOT EVALUATED, the gateway's session open, exit 1, and no tampering words", { timeout: 120_000 }, async () => {
    await withRunningGateway(async (root, sessionId, trust) => {
      expect(blobPaths(root).length, "the gateway's rows carry encrypted blob payloads").toBeGreaterThan(0);
      lockedShell(root);
      const result = verifyLedgerIntegrity(root, { trust, blobKeyOptional: true });
      expect(result.errors.join("\n")).not.toMatch(TAMPER);
      expect(result.ok).toBe(true);
      expect(result.payloadsNotEvaluated?.length).toBeGreaterThan(0);
      expect(result.sessions.liveLegacy.map((session) => session.sessionId)).toContain(sessionId);
      expect(ledgerExitCode(result, trust)).toBe(1);
      expect(ledgerExitCode(result, { ...trust, allowUnanchored: true })).toBe(1);
      const out = render(result);
      expect(out.split("\n")[0]).toBe("Ledger verification NOT EVALUATED");
      expect(out.split("\n")[1]).toMatch(/^ {2}\d+ payloads? not evaluated: the key that opens/);
      expect(out).toContain("vault locked: export AMC_VAULT_PASSPHRASE");
      expect(out).toContain(`1 session open: ${sessionId} (gateway;`);
      expect(out).not.toMatch(TAMPER);
      expect(out).not.toMatch(HELD);
    });
  });

  test("amc verify all: the ledger check is skipped, never PASS; status INCOMPLETE and exit 1 even with --allow-unanchored", { timeout: 120_000 }, async () => {
    await withRunningGateway(async (root, sessionId, trust) => {
      const unlocked = await verifyAll({ workspace: root, trust });
      expect(unlocked.checks.find((check) => check.id === "ledger-hash-chain")?.status).toBe("PASS");
      lockedShell(root);
      const report = await verifyAll({ workspace: root, trust });
      const chain = report.checks.find((check) => check.id === "ledger-hash-chain")!;
      expect(chain.status).toBe("SKIP");
      expect(chain.details.join("\n")).toContain("vault locked: export AMC_VAULT_PASSPHRASE");
      expect(chain.details.join("\n")).toContain(`1 session open: ${sessionId} (gateway;`);
      expect(chain.details.join("\n")).not.toMatch(HELD);
      expect(JSON.stringify(report.checks)).not.toMatch(TAMPER);
      expect(report.status).toBe("INCOMPLETE");
      expect(report.skippedCritical).toContain("ledger-hash-chain");
      expect(exitCodeOf(report, trust)).toBe(1);
      // Unpinned under --allow-unanchored the trust root is skipped too; "integrity verified, untrusted" (2) would be false.
      const allowed = { ...trust, explicitPins: [], allowUnanchored: true };
      const unanchored = await verifyAll({ workspace: root, trust: allowed });
      expect(unanchored.checks.find((check) => check.id === "ledger-trust-root")?.status).toBe("SKIP");
      expect(exitCodeOf(unanchored, allowed)).toBe(1);
    });
  });

  test("a forged payload still fails with the vault unlocked, and with it locked the verdict is still not PASS", { timeout: 120_000 }, async () => {
    await withRunningGateway(async (root, _sessionId, trust) => {
      const [blob] = blobPaths(root);
      const bytes = readFileSync(blob!);
      bytes[bytes.length - 1] ^= 0xff;
      writeFileSync(blob!, bytes);
      const unlocked = verifyLedgerIntegrity(root, { trust, blobKeyOptional: true });
      expect(unlocked.ok).toBe(false);
      expect(unlocked.errors.join("\n")).toMatch(/payload authentication failed/);
      expect(ledgerExitCode(unlocked, trust)).toBe(1);
      expect(render(unlocked)).toBe("Ledger verification FAILED");
      lockedShell(root);
      const locked = verifyLedgerIntegrity(root, { trust, blobKeyOptional: true });
      expect(ledgerExitCode(locked, trust)).toBe(1);
      expect(render(locked)).not.toMatch(HELD);
    });
  });

  test("every other verifier still fails a payload it cannot open (the option is opt-in)", { timeout: 120_000 }, async () => {
    await withRunningGateway(async (root, _sessionId, trust) => {
      lockedShell(root);
      const result = verifyLedgerIntegrity(root, { trust });
      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(/payload authentication failed/);
      expect(result.payloadsNotEvaluated).toBeUndefined();
    });
  });
});
