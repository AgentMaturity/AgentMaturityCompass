import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionEventStore, SessionStoreAppendInput } from "../src/persistence/sessionEventStore.js";
import { recoverSession } from "../src/session/sessionRecovery.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { lockVault } from "../src/vault/vault.js";
import { startOwnerProcess, type OwnerProcess } from "./helpers/sessionOwnerProcess.js";

test.each(["before-result", "after-claim-commit"] as const)("a one-shot %s failure releases recovery ownership for a safe retry in the same live process", async (fault) => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-recovery-retry-"));
  const priorPhrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "synthetic-recovery-retry-passphrase";
  let child: OwnerProcess | undefined;
  let store: SessionEventStore | undefined;
  try {
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    child = await startOwnerProcess(workspace, "tool");
    const sessionId = String(child.ready.sessionId);
    await child.kill();
    store = openSessionEventStore(workspace);
    const before = store.readSessionEvents(sessionId);
    let failOnce = true;
    const borrowed = new Proxy(store, {
      get(target, key) {
        if (key === "appendSessionEvent") return (input: SessionStoreAppendInput) => {
          if (failOnce && fault === "before-result" && input.eventType === "tool/result") {
            failOnce = false;
            throw new Error("synthetic one-shot failure after claim");
          }
          const committed = target.appendSessionEvent(input);
          if (failOnce && fault === "after-claim-commit" && input.eventType === "session/recovery-claim") {
            failOnce = false;
            throw new Error("synthetic one-shot failure after claim");
          }
          return committed;
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const options = {
      workspace, sessionId, store: borrowed, staleAfterMs: 0, force: true,
      claimant: { pid: process.pid, hostId: "test-audit-input", bootId: "test", startedAt: Date.now() }
    };
    expect(() => recoverSession(options)).toThrow("synthetic one-shot failure after claim");
    const failedAttempt = borrowed.readSessionEvents(sessionId);
    expect(failedAttempt[failedAttempt.length - 1]?.event_type).toBe("session/release");
    expect(failedAttempt.filter((event) => event.event_type === "tool/result")).toHaveLength(0);

    const retry = recoverSession(options);
    expect(retry.verdict).toBe("RECOVERED");
    expect(retry.wonClaim).toBe(true);
    expect(retry.unknownToolOutcomes).toBe(1);
    // The caller's store remains readable after failure and successful return.
    const after = borrowed.readSessionEvents(sessionId);
    expect(borrowed.readSessionRecord(sessionId)).not.toBeNull();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.filter((event) => event.event_type === "tool/call")).toHaveLength(1);
    const results = after.filter((event) => event.event_type === "tool/result");
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0]!.meta_json).outcome).toBe("TOOL_OUTCOME_UNKNOWN");
    expect(after.map((event) => extractEnvelope(event.meta_json)?.seq)).toEqual(after.map((_, index) => index));
    expect(verifyLedgerIntegrity(workspace).chain).toEqual({ ok: true, errors: [] });
  } finally {
    await child?.kill();
    store?.close();
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (priorPhrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = priorPhrase;
  }
});
