import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { registerWireCommands } from "../src/wire/wireCli.js";
import * as listenerModule from "../src/wire/wireListener.js";
import type { WireListenerInit } from "../src/wire/wireListener.js";
import { createWireDispatcher } from "../src/wire/wireDispatcher.js";
import { describeAcceptedWork } from "../src/wire/workAcceptance.js";

it("wires the owner CLI to bounded native execution through the real dispatcher", async () => {
  process.env["AMC_VAULT_PASSPHRASE"] = "wire-runtime-pass";
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wire-runtime-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const signals = ["exit", "SIGINT", "SIGTERM"] as const;
  const before = new Map(signals.map(signal => [signal, new Set<unknown>(process.listeners(signal))]));
  let owner: WireListenerInit | undefined;
  const listen = vi.spyOn(listenerModule, "startWireListener").mockImplementation(async init => {
    owner = init;
    return { socketPath: "/transport-free-test.sock", connections: 0, close: async () => {} };
  });
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const program = new Command().exitOverride(); registerWireCommands(program);
    await program.parseAsync(["wire", "--execute-accepted", "--provider", "stub", "--json"], { from: "user" });
    expect(owner?.onAccepted).toBeTypeOf("function");
    const token = issueLeaseForCli({ workspace, agentId: "default", ttl: "60m", scopes: "wire:submit", routes: "/wire", models: "amc-stub-1",
      rpm: 100, tpm: 10000, maxCostUsdPerDay: null }).token;
    const dispatcher = createWireDispatcher(owner!);
    const message = (id: number) => JSON.stringify({ jsonrpc: "2.0", id, method: "work/accept", lease: token,
      params: { prompt: "complete this wire task", providerId: "stub" } }) + "\n";
    const replies = dispatcher.handle(Buffer.from(message(1) + message(2))).replies.map(bytes => JSON.parse(bytes.toString()) as {
      result: { receipt: string; workSessionId: string } });
    const ledger = openLedger(workspace), monitorPublicKeys = getPublicKeyHistory(workspace, "monitor");
    try {
      await vi.waitFor(() => {
        expect(describeAcceptedWork({ ledger, monitorPublicKeys, receipt: replies[0]!.result.receipt })).toMatchObject({ ok: true, state: "finished" });
        expect(ledger.getAllEvents().some(row => JSON.parse(row.meta_json).type === "wire_work_completed")).toBe(true);
      });
      expect(describeAcceptedWork({ ledger, monitorPublicKeys, receipt: replies[1]!.result.receipt })).toMatchObject({ ok: true, state: "refused" });
      const first = ledger.getAllEvents().find(row => row.session_id === replies[0]!.result.workSessionId)!;
      expect(first.event_type).toBe("session/open");
      expect(JSON.parse(first.meta_json)).toMatchObject({ acceptedWork: { receipt: replies[0]!.result.receipt } });
      expect(JSON.stringify(ledger.getAllEvents())).not.toContain(token);
      for (const handler of process.listeners("exit")) if (!before.get("exit")!.has(handler)) handler(0);
      expect((await verifyLedgerIntegrity(workspace)).errors).toEqual([]);
    } finally { ledger.close(); }
  } finally {
    for (const signal of signals) for (const handler of process.listeners(signal)) {
      if (!before.get(signal)!.has(handler)) process.removeListener(signal, handler);
    }
    listen.mockRestore(); cwd.mockRestore(); log.mockRestore(); rmSync(workspace, { recursive: true, force: true });
  }
}, 30_000);
