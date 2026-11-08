import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { startGateway, type GatewayHandle } from "../src/gateway/server.js";
import { SessionService } from "../src/session/sessionService.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * A-1 (work/plan/verify-results.md, A4 track): Assemble Review verifies a build session with the strict verifier while
 * Studio runs, so its gateway session is open. That open session is named, never a chain error.
 */
let root: string, gateway: GatewayHandle | undefined;
beforeEach(async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-agent-run-live-gateway");
  root = mkdtempSync(join(tmpdir(), "amc-agent-run-live-gateway-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
});
afterEach(async () => {
  await gateway?.close(); gateway = undefined;
  lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs();
});

function closedNativeSession(): string {
  const service = new SessionService(root);
  service.open({ agentId: "default", harnessVersion: "a1-fixture", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
  service.startTurn({ trigger: "user" }); service.startStep(); service.recordUserMessage("Synthetic build request.");
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "Synthetic build output." });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
  service.close({ reason: "done" });
  return service.sessionId;
}

test("A-1: a closed native session verifies strictly while a gateway runs, and the gateway session is named", { timeout: 60_000 }, async () => {
  const sessionId = closedNativeSession();
  const report = await verifyAgentRun(root, sessionId, workspaceKeyTrust(root));
  expect(report).toMatchObject({ ok: true, integrityOk: true, ledgerOk: true, ledgerErrors: [], sessionChainErrors: [], scope: "complete-ledger" });
  expect(report.unfinalizedSessions).toEqual([gateway!.gatewaySessionId]);
});
