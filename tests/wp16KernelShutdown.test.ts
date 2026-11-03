import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runComposedTurn, type ComposedTurnHandle } from "../src/kernel/agentLoopRunner.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import type { AgentToolSeam } from "../src/agent/toolSeam.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

const dirs: string[] = [];
beforeEach(() => {
  const checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp16-kernel-control-")));
  dirs.push(checkpoints);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  process.env["AMC_VAULT_PASSPHRASE"] ??= "wp16-kernel-shutdown-pass";
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

describe("WP16 bounded native kernel shutdown", () => {
  // Since aa5963795 a stalled provider request is aborted at cancellation rather than awaited, and an abandoned tool
  // lets the driver drain within its grace. The noncooperative part is therefore a tool that ignores its AbortSignal
  // and whose owned work never confirms cleanup.
  it("stops waiting for a tool that ignores SIGTERM cancellation and never seals unconfirmed cleanup as success", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp16-kernel-")));
    dirs.push(dir);
    initWorkspaceWithoutActionPolicy({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" }); // AXR-02 "not configured": never had an Action Policy; this file is not about it.
    const sessionId = `noncooperative-${randomUUID()}`;
    const entered = deferred<void>();
    const shutdown = deferred<Promise<boolean>>();
    let requestSignal: AbortSignal | undefined;
    let assertWriterWritable: (() => void) | undefined;
    let stoppedAt = 0;
    const tools: AgentToolSeam = {
      schemas: () => [{ name: "hang", description: "Never settles.", parameters: { type: "object", properties: {} } }],
      executionMode: () => "exclusive",
      hasOwnedWork: () => true,
      shutdown: () => Promise.resolve(false),
      execute: request => {
        requestSignal = request.signal;
        entered.resolve();
        // Intentionally ignore AbortSignal. No sockets, timers or OS processes
        // are opened; only the host's bounded ownership wait can settle this run.
        return new Promise(() => undefined);
      }
    };
    let handle!: ComposedTurnHandle;
    const execution = runComposedTurn({ workspace: dir, agentId: "default", sessionId, prompt: "wait forever",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 32, stream: true } },
      routes: [stubProviderRoute()], transport: stubProviderTransport(), tools, config: { toolAbandonGraceMs: 0 },
      bindToolSession: writer => { assertWriterWritable = writer.assertWritable; },
      credentials: { homeDir: join(dir, "empty-home"), env: {}, watch: false, projectDir: null },
      onReady: ready => {
        handle = ready;
        void entered.promise.then(() => {
          stoppedAt = Date.now();
          ready.cancel({ kind: "parent" }, { by: "signal:SIGTERM" });
          shutdown.resolve(ready.shutdown());
        });
      } }).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    await entered.promise;
    expect(requestSignal).toBeDefined();
    expect(await shutdown.promise, "the driver drains once the tool is abandoned").toBe(true);
    expect(requestSignal?.aborted).toBe(true);
    const result = await execution;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Unconfirmed cleanup must not return a completed run.");
    expect(String(result.error)).toContain("TOOL_OUTCOME_UNKNOWN");
    expect(Date.now() - stoppedAt, "1s driver grace must not become an unbounded whenIdle wait").toBeLessThan(5_000);
    expect(await handle.shutdown(), "the published shutdown result is idempotent").toBe(true);
    expect(assertWriterWritable).toBeDefined();
    expect(() => assertWriterWritable!(), "the writer is no longer usable after the bounded failure").toThrow();
    const ledger = openLedger(dir);
    try {
      const rows = ledger.getAllEvents().filter(event => event.session_id === sessionId);
      const signalCancel = rows.find(event => event.event_type === "loop/cancel"
        && (JSON.parse(event.meta_json) as { requestedBy?: unknown }).requestedBy === "signal:SIGTERM");
      expect(signalCancel, "SIGTERM requester is recorded before the bounded wait expires").toBeDefined();
      expect(JSON.parse(signalCancel!.meta_json)).toMatchObject({ cause: { kind: "parent" }, requestedBy: "signal:SIGTERM" });
      expect(rows.filter(event => event.event_type === "tool/result")
        .map(event => (JSON.parse(event.meta_json) as { outcome?: unknown }).outcome)).toEqual(["TOOL_OUTCOME_UNKNOWN"]);
      expect(rows.filter(event => event.event_type === "session/close")
        .map(event => (JSON.parse(event.meta_json) as { reason?: unknown }).reason)).toEqual(["resource_outcome_unknown"]);
    } finally { ledger.close(); }
  });
});
