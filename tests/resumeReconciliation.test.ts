import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { openActionJournal, type ActionJournal } from "../src/actions/actionJournal.js";
import type { ReconcileAdapter } from "../src/actions/reconcile.js";
import { reconcileInterruptedCalls } from "../src/session/resumeRules.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { sha256Hex } from "../src/utils/hash.js";
import { FAULT_ARGUMENTS, faultTools, PAYMENT_ADAPTER, PAYMENT_TOOL, prepareFaultWorkspace } from "./helpers/actionFaults.js";
import { FakeSystemOfRecord } from "./fixtures/actions/fakeSystemOfRecord.js";

// P2-12: after a crash, each interrupted call follows its resume rule. A call that cannot safely repeat is reconciled
// with its system of record before the next turn, and nothing is dispatched again by resume.
const roots: string[] = [];
const identity = { agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const claimant = { pid: process.pid, hostId: "test", bootId: "parent", startedAt: Date.now() };
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

async function crashed(mode: "payment" | "read" | "write"): Promise<{ dir: string; sessionId: string; sor: FakeSystemOfRecord }> {
  const dir = prepareFaultWorkspace(); roots.push(dir);
  writeFileSync(join(dir, "notes.txt"), "before\n");
  const oracle = join(dir, "system-of-record.json"); const sessionId = randomUUID();
  const child = fork(fileURLToPath(new URL("./fixtures/sessionCrashAfterEffect.ts", import.meta.url)), [dir, oracle, mode, sessionId], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env } });
  let stderr = ""; child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  const signal = await new Promise<NodeJS.Signals | null>((resolve) => child.once("close", (_code, closed) => resolve(closed)));
  expect(signal, stderr).toBe("SIGKILL");
  return { dir, sessionId, sor: new FakeSystemOfRecord(oracle) };
}
function blocking(dir: string): string[] {
  const journal = openActionJournal(dir);
  try { return journal.blockingExecutions({ workspaceId: journal.workspaceId, agentId: "default" }); } finally { journal.close(); }
}
const unknownAdapter: ReconcileAdapter = { adapterId: PAYMENT_ADAPTER, lookup: async () => ({ kind: "unknown", reason: "system of record offline" }) };

test("an UNKNOWN FINANCIAL call is reconciled before the next turn: completed, recorded once, never repeated", async () => {
  const { dir, sessionId, sor } = await crashed("payment");
  expect(sor.effects).toHaveLength(1);
  const resumed = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  try {
    expect(resumed.report.recovery?.unknownToolOutcomes).toBe(1);
    const adapters = new Map([[PAYMENT_ADAPTER, sor.adapter(PAYMENT_ADAPTER)]]);
    const calls = await reconcileInterruptedCalls({ workspace: dir, session: resumed.service, adapters });
    expect(calls).toEqual([expect.objectContaining({ toolCallId: "pay-1", toolName: PAYMENT_TOOL, rule: "reconcile-first",
      result: "completed", effect: "applied" })]);
    const recorded = resumed.service.readEvents().filter((row) => row.event_type === "tool/reconciled");
    expect(recorded).toHaveLength(1);
    expect(JSON.parse(recorded[0]!.meta_json)).toMatchObject({ toolCallId: "pay-1", executionId: calls[0]!.executionId,
      rule: "reconcile-first", result: "completed", effect: "applied" });
    expect(sor.effects).toHaveLength(1);
    expect(blocking(dir)).toEqual([]);
    // A later pass finds the call settled and records nothing again.
    expect(await reconcileInterruptedCalls({ workspace: dir, session: resumed.service, adapters })).toEqual([]);
  } finally { resumed.service.close({ reason: "completed" }); }
});

test("an outcome the system of record cannot answer stays unknown and blocks the agent's dependent calls", async () => {
  const { dir, sessionId, sor } = await crashed("payment");
  const resumed = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  let journal: ActionJournal | undefined;
  try {
    const calls = await reconcileInterruptedCalls({ workspace: dir, session: resumed.service, adapters: new Map([[PAYMENT_ADAPTER, unknownAdapter]]) });
    expect(calls).toEqual([expect.objectContaining({ toolCallId: "pay-1", rule: "reconcile-first", result: "unknown" })]);
    expect(blocking(dir)).toEqual([calls[0]!.executionId]);
    const registry = new ToolRegistry();
    for (const definition of faultTools(sor)) registry.define(definition);
    const pipeline = new ToolPipeline({ registry, workspace: dir, journal: () => (journal ??= openActionJournal(dir)) });
    const dependent = await pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL], amount: "5.00" }, requestedMode: "EXECUTE" });
    expect(dependent.ok).toBe(false);
    expect(dependent.denied?.reason).toContain(`blocked_by_unreconciled:${calls[0]!.executionId}`);
    expect(sor.effects).toHaveLength(1);
  } finally { journal?.close(); resumed.service.close({ reason: "completed" }); }
});

test("an interrupted READ_ONLY call may run again: it is not reconciled and blocks nothing", async () => {
  const { dir, sessionId, sor } = await crashed("read");
  const resumed = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  try {
    const calls = await reconcileInterruptedCalls({ workspace: dir, session: resumed.service, adapters: new Map([[PAYMENT_ADAPTER, sor.adapter(PAYMENT_ADAPTER)]]) });
    expect(calls).toEqual([expect.objectContaining({ toolCallId: "read-1", toolName: "fs.read", rule: "may-repeat", result: "not-found", executionId: null })]);
    expect(sor.lookups).toBe(0);
    expect(blocking(dir)).toEqual([]);
  } finally { resumed.service.close({ reason: "completed" }); }
});

test("an interrupted workspace write repeats only while its file still has the recorded beforeSha256", async () => {
  const { dir, sessionId } = await crashed("write");
  const resumed = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  try {
    expect(await reconcileInterruptedCalls({ workspace: dir, session: resumed.service, adapters: new Map() })).toEqual([expect.objectContaining({
      toolCallId: "write-1", toolName: "fs.write", rule: "repeat-with-same-idempotency-key", result: "not-found" })]);
  } finally { resumed.service.close({ reason: "completed" }); }
  // The same crash, but the file changed since the recorded beforeSha256: the call reconciles first.
  const changed = await crashed("write");
  writeFileSync(join(changed.dir, "notes.txt"), "after\n");
  const again = resumeSession({ workspace: changed.dir, sessionId: changed.sessionId, claimant, staleAfterMs: 0, ...identity });
  try {
    expect(await reconcileInterruptedCalls({ workspace: changed.dir, session: again.service, adapters: new Map() })).toEqual([expect.objectContaining({
      toolCallId: "write-1", rule: "reconcile-first", result: "not-found" })]);
  } finally { again.service.close({ reason: "completed" }); }
});
