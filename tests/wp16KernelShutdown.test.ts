import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runComposedTurn, type ComposedTurnHandle } from "../src/kernel/agentLoopRunner.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute } from "../src/agent/stubProvider.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";

const dirs: string[] = [];
beforeEach(() => {
  const checkpoints = realpathSync(mkdtempSync("/private/tmp/amc-wp16-kernel-control-"));
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
  it("stops waiting for a transport that ignores SIGTERM cancellation without sealing the incomplete session", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp16-kernel-")));
    dirs.push(dir);
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    const sessionId = `noncooperative-${randomUUID()}`;
    const entered = deferred<void>();
    const shutdown = deferred<Promise<boolean>>();
    let requestSignal: AbortSignal | undefined;
    let assertWriterWritable: (() => void) | undefined;
    let stoppedAt = 0;
    const transport: HttpTransport = request => {
      requestSignal = request.signal;
      entered.resolve();
      // Intentionally ignore AbortSignal. No sockets, timers or OS processes
      // are opened; only the host's bounded ownership wait can settle this run.
      return new Promise(() => undefined);
    };
    let handle!: ComposedTurnHandle;
    const execution = runComposedTurn({ workspace: dir, agentId: "default", sessionId, prompt: "wait forever",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 32, stream: true } },
      routes: [stubProviderRoute()], transport, config: { toolAbandonGraceMs: 0 },
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
    expect(await shutdown.promise).toBe(false);
    expect(requestSignal?.aborted).toBe(true);
    const result = await execution;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Noncooperative shutdown must not return a completed run.");
    expect(String(result.error)).toContain("TOOL_OUTCOME_UNKNOWN");
    expect(Date.now() - stoppedAt, "1s driver grace must not become an unbounded whenIdle wait").toBeLessThan(5_000);
    expect(await handle.shutdown(), "the published unknown result is idempotent").toBe(false);
    expect(assertWriterWritable).toBeDefined();
    expect(() => assertWriterWritable!(), "bounded failure must drop the writer without sealing or releasing it").toThrow();
    const ledger = openLedger(dir);
    try {
      const rows = ledger.getAllEvents().filter(event => event.session_id === sessionId);
      const signalCancel = rows.find(event => event.event_type === "loop/cancel"
        && (JSON.parse(event.meta_json) as { requestedBy?: unknown }).requestedBy === "signal:SIGTERM");
      expect(signalCancel, "SIGTERM requester is recorded before the bounded wait expires").toBeDefined();
      expect(JSON.parse(signalCancel!.meta_json)).toMatchObject({ cause: { kind: "parent" }, requestedBy: "signal:SIGTERM" });
      expect(rows.filter(event => event.event_type === "session/close")).toEqual([]);
      expect(rows.filter(event => event.event_type === "session/release")).toEqual([]);
      expect(ledger.getSessionById(sessionId)?.ended_ts).toBeNull();
    } finally { ledger.close(); }
  }, 15_000);
});
