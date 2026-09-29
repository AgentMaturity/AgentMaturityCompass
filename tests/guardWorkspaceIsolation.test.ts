import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkExec } from "../src/enforce/execGuard.js";
import { emitGuardDecisionReceipt, readGuardEvents, verifyGuardDecisionReceipt } from "../src/enforce/evidenceEmitter.js";
import { compareGuardEventStores } from "../src/storage/consolidation/guardEventConsolidation.js";

describe("implicit guard persistence stays in the test-file workspace", () => {
  it("keeps real guard events, dual writes and signing keys in the disposable workspace", () => {
    const workspace = process.env.AMC_GUARD_RECEIPTS_WORKSPACE!;
    const legacyDbPath = process.env.AMC_GUARD_EVENTS_DB_PATH!;
    expect(workspace).toBeTruthy();
    expect(resolve(workspace)).not.toBe(process.cwd());
    expect(legacyDbPath).toBe(join(workspace, ".amc", "guard_events.sqlite"));
    expect(dirname(dirname(legacyDbPath))).toBe(workspace);

    // Restoring a test's own env stubs must retain the setup's safe baseline.
    vi.stubEnv("AMC_GUARD_EVENTS_DB_PATH", join(workspace, "unused.sqlite"));
    vi.unstubAllEnvs();
    expect(process.env.AMC_GUARD_EVENTS_DB_PATH).toBe(legacyDbPath);

    const result = checkExec("echo isolated-guard-event");
    expect(result.allowed).toBe(true);
    expect(readGuardEvents("system").some(row => row.module_code === "E2")).toBe(true);
    const comparison = compareGuardEventStores({ workspace, legacyDbPath });
    expect(comparison.identical).toBe(true);
    expect(comparison.legacyRows).toBeGreaterThan(0);
    expect(comparison.consolidatedRows).toBe(comparison.legacyRows);
    expect(existsSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"))).toBe(true);
  });

  it("signs an implicit-workspace receipt against the same disposable trust anchor", () => {
    const workspace = process.env.AMC_GUARD_RECEIPTS_WORKSPACE!;
    const receipt = emitGuardDecisionReceipt({
      agentId: "isolated-receipt",
      moduleCode: "isolation-test",
      decision: "block",
      matchedRule: "fixture",
      inputHash: "a".repeat(64),
      outputHash: "b".repeat(64),
    });
    expect(receipt).not.toBeNull();
    const publicKey = readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), "utf8");
    expect(verifyGuardDecisionReceipt(receipt!, { publicKeys: [publicKey] }).ok).toBe(true);
  });
});
