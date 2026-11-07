/** Shared fixture for SH-OBS tests: a signed workspace and governed stub sessions through the experiments' trial runner. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../../../src/workspace.js";
import { initBudgets } from "../../../src/budgets/budgets.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../../../src/runtime/firewall.js";
import { openLedger } from "../../../src/ledger/ledger.js";
import { providerTrialRunner, type NativeTrialRunnerOptions } from "../../../src/experiments/nativeTrialRunner.js";
import { runBounded } from "../../../src/experiments/trialExecutor.js";
import type { EvidenceEvent } from "../../../src/types.js";

export const TEST_PASSPHRASE = "sh-obs-test-passphrase";

export function stubWorkspace(prefix = "amc-sh-obs-"): string {
  process.env.AMC_VAULT_PASSPHRASE ??= TEST_PASSPHRASE;
  const ws = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  initWorkspace({ workspacePath: ws, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(ws, "default");
  writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
  initApprovalPolicy(ws);
  mkdirSync(join(ws, "workspace"), { recursive: true });
  return ws;
}

export function removeWorkspace(ws: string): void {
  rmSync(ws, { recursive: true, force: true });
}

export function allEvents(ws: string): EvidenceEvent[] {
  const ledger = openLedger(ws);
  try { return ledger.getAllEvents(); } finally { ledger.close(); }
}

export function sessionEvents(ws: string, sessionId: string): EvidenceEvent[] {
  return allEvents(ws).filter((event) => event.session_id === sessionId);
}

/** One governed stub session: `prompt` is sent verbatim (a JSON directive performs that tool call). Returns the session id. */
export async function runStubSession(ws: string, prompt: string, options: { tools?: "none" | "workspace"; agentId?: string; extra?: Partial<Pick<NativeTrialRunnerOptions, "verbatimPrompt" | "extraGuard" | "onSession" | "tools">> } = {}): Promise<{ sessionId: string; ok: boolean; reason: string | null }> {
  let sessionId = "";
  const agentId = options.agentId ?? "default";
  const { runTrial } = providerTrialRunner(ws, agentId, { providerId: "stub", maxSteps: 4 },
    { verbatimPrompt: true, tools: options.tools ?? "none", onSession: (id) => { sessionId = id; }, ...(options.extra ?? {}) });
  const stamp = { agentId, caseExecution: { v: 1 as const, casebookId: "test", caseId: "case", caseSha256: "0".repeat(64), trialId: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, configDigest: "0".repeat(64) } };
  const result = await runBounded(runTrial, { view: { caseId: "case", prompt, context: null, allowedActionClasses: ["READ_ONLY", "WRITE_LOW"] },
    config: Buffer.from("You are an AMC-governed agent.", "utf8"), stamp, mode: "supervise" }, 60_000);
  return { sessionId, ok: result.ok, reason: result.ok ? null : result.reason };
}
