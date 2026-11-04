import { fork } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { compactionSummaryRows } from "../src/agent/compaction/summaryPrompt.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { forkSession, resumeSession } from "../src/session/sessionResume.js";
import type { SessionService } from "../src/session/sessionService.js";
import { sessionTokenCounts } from "../src/session/sessionTokenCounts.js";
import { validateSurfaceCompactions } from "../src/session/surfaceCompaction.js";
import { compactionReceipt } from "../src/session/surfaceCompactionValidation.js";
import { foldSurfaceEntries } from "../src/session/surfaceProjection.js";
import type { EvidenceEvent } from "../src/types.js";

// The loop harness opens its session with this identity; resume must present the same one.
const OPEN = { agentId: "default", harnessVersion: "3.2.0", compositionDigest: "composition-digest", policyDigest: "policy-digest" };
const B = { pid: 2002, hostId: "host-b", bootId: "boot-2", startedAt: 1_700_000_100 };
const roots: string[] = [], services: SessionService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) { try { service.disposeWithoutClosing(); } catch { /* already closed */ } }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Point = "in-summary-step" | "after-summary" | "complete";
/** Runs the real loop in a child and returns once it has exited, by SIGKILL or normally. */
async function runChild(point: Point): Promise<{ dir: string; sessionId: string; signal: NodeJS.Signals | null }> {
  const child = fork(fileURLToPath(new URL("./fixtures/compactionCrashProcess.ts", import.meta.url)), [point], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env }
  });
  let stderr = "", ready: { dir: string; sessionId: string } | null = null;
  child.stderr?.on("data", chunk => { stderr += String(chunk); });
  child.on("message", (message: { ready?: boolean; dir?: string; sessionId?: string }) => {
    if (message.ready) ready = { dir: message.dir!, sessionId: message.sessionId! };
  });
  const signal = await new Promise<NodeJS.Signals | null>(resolve => child.once("exit", (_code, killed) => resolve(killed)));
  if (ready === null) throw new Error(`child exited before it was ready: ${stderr}`);
  roots.push((ready as { dir: string }).dir);
  if (point !== "complete" && signal !== "SIGKILL") throw new Error(`crash point ${point} was not reached: ${stderr}`);
  return { ...(ready as { dir: string; sessionId: string }), signal };
}
function rowsOf(dir: string, sessionId: string): readonly EvidenceEvent[] {
  const store = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}
function text(dir: string, id: string, rows: readonly EvidenceEvent[]): string {
  const payload = readEventPayload(dir, rows.find(row => row.id === id)!);
  if (payload.status !== "ok") throw new Error(`payload ${id} is ${payload.status}`);
  return payload.bytes.toString("utf8");
}
/** The model-visible conversation as role-prefixed text, so lost or duplicated content is visible in one assertion. */
function visible(dir: string, rows: readonly EvidenceEvent[]): string[] {
  return foldSurfaceEntries(rows).filter(entry => entry.role !== "system")
    .map(entry => `${entry.role}:${text(dir, entry.sourceEventId, rows).slice(0, 24)}`);
}
const audits = (rows: readonly EvidenceEvent[]) => rows.map(row => JSON.parse(row.meta_json) as Record<string, unknown>)
  .filter(meta => meta.auditType === "COMPACTION_RECOVERED");
const summaries = (rows: readonly EvidenceEvent[]) => rows.filter(row => row.event_type === "loop/compact" && compactionReceipt(row).mode === "summarize");
function resume(dir: string, sessionId: string) {
  const resumed = resumeSession({ workspace: dir, sessionId, claimant: B, staleAfterMs: 0, ...OPEN });
  services.push(resumed.service);
  return resumed;
}

describe("PI-025: an interrupted automatic compaction recovers to its last consistent state on resume", () => {
  it("killed inside the summary step: no summary is applied and its prompt leaves the context", async () => {
    const { dir, sessionId } = await runChild("in-summary-step");
    const crashed = rowsOf(dir, sessionId);
    const inStep = compactionSummaryRows(crashed);
    // Red before the fix: the summary prompt stays on the model-visible surface as a user message.
    expect(foldSurfaceEntries(crashed).some(entry => inStep(crashed.find(row => row.id === entry.originEventId)!))).toBe(true);

    const { service, report } = resume(dir, sessionId);
    expect(report.recovery?.verdict).toBe("RECOVERED");
    expect(report.interruptedCompactions).toBe(1);
    const rows = rowsOf(dir, sessionId);
    expect(summaries(rows)).toEqual([]);
    // Every turn is still there, verbatim; nothing from the summary step is.
    expect(visible(dir, rows)).toEqual(["user:first request", "assistant:first: prior agent work ", "user:second request",
      "assistant:second: prior agent work", "user:third request", "assistant:third answer"]);
    const recovered = rows.slice(crashed.length).filter(row => row.event_type === "loop/compact");
    expect(recovered).toHaveLength(1);
    expect(compactionReceipt(recovered[0]!)).toMatchObject({ v: 1, mode: "drop", reason: expect.stringMatching(/^recovery: interrupted automatic compaction/) });
    expect(audits(rows)).toEqual([expect.objectContaining({ outcome: "rolled-back", summaryEventId: null, compactionEventIds: [recovered[0]!.id] })]);
    validateSurfaceCompactions(dir, rows);
    expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
    // The resumed writer continues on the recovered surface.
    service.startTurn({ trigger: "user" }); service.recordUserMessage("after recovery"); service.endTurn({ reason: "complete" }); service.sealTurn();
    expect(visible(dir, rowsOf(dir, sessionId)).at(-1)).toBe("user:after recovery");
  }, 60_000);

  it("killed after the summary receipt: the summary is kept once and the remaining planned drops complete", async () => {
    const { dir, sessionId } = await runChild("after-summary");
    const crashed = rowsOf(dir, sessionId);
    expect(summaries(crashed)).toHaveLength(1);
    // Red before the fix: the first request's answer is still live beside a summary that already covers it.
    expect(visible(dir, crashed)).toContain("assistant:first: prior agent work ");

    const { report } = resume(dir, sessionId);
    expect(report.interruptedCompactions).toBe(1);
    const rows = rowsOf(dir, sessionId), [summary] = summaries(rows);
    expect(summaries(rows)).toHaveLength(1);
    const settled = rows.slice(crashed.length).filter(row => row.event_type === "loop/compact");
    expect(settled.map(row => compactionReceipt(row).mode)).toEqual(["drop", "drop"]);
    expect(audits(rows)).toEqual([expect.objectContaining({ outcome: "rolled-forward", summaryEventId: summary!.id, compactionEventIds: settled.map(row => row.id) })]);
    // Settling is idempotent: a later resume finds nothing left to do.
    services.pop()!.releaseWithoutClosing();
    expect(resume(dir, sessionId).report.interruptedCompactions).toBeUndefined();
    const shown = visible(dir, rows);
    expect(shown.filter(line => line.startsWith("user:"))).toEqual(["user:first request", "user:second request", "user:third request"]);
    expect(shown).not.toContain("assistant:first: prior agent work ");
    expect(shown).not.toContain("assistant:second: prior agent work");
    expect(foldSurfaceEntries(rows).filter(entry => entry.sourceEventId === summary!.id)).toHaveLength(1);
    expect(shown.at(-1)).toBe("assistant:third answer");
    const inStep = compactionSummaryRows(rows);
    expect(foldSurfaceEntries(rows).some(entry => inStep(rows.find(row => row.id === entry.originEventId)!))).toBe(false);
    validateSurfaceCompactions(dir, rows);
    expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
  }, 60_000);
});

describe("PXA-12: measured token counts stay with the session across resume and fork", () => {
  it("keeps per-turn and per-compaction counts, and leaves what was never measured null", async () => {
    const { dir, sessionId } = await runChild("complete");
    const before = sessionTokenCounts(rowsOf(dir, sessionId));
    expect(before.turns.map(turn => [turn.turn, turn.steps, turn.measuredSteps, turn.tokens.inputTokens])).toEqual([[1, 1, 1, 1000], [2, 1, 1, 1000], [3, 2, 2, 11_000]]);
    expect(before.compactions).toHaveLength(3); // the summary, the drop of the run it covers, the drop of the summary step
    expect(before.compactions.every(compaction => compaction.promptTokensBefore === 9000)).toBe(true);
    // No step followed the compaction, so its effect was never measured: null, not 0.
    expect(before.compactions.every(compaction => compaction.promptTokensAfter === null)).toBe(true);
    expect(before.inherited).toBeNull();

    const { service } = resume(dir, sessionId);
    service.startTurn({ trigger: "user" }); service.recordUserMessage("unmeasured turn"); service.startStep();
    service.endStep({ stopReason: null, usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
    service.releaseWithoutClosing();
    const resumed = sessionTokenCounts(rowsOf(dir, sessionId));
    expect(resumed.turns.slice(0, 3)).toEqual(before.turns);
    expect(resumed.compactions).toEqual(before.compactions);
    expect(resumed.turns[3]).toEqual({ turn: 4, steps: 1, measuredSteps: 0,
      tokens: { inputTokens: null, outputTokens: null, cacheRead: null, cacheWrite: null } });

    const child = forkSession({ workspace: dir, parentSessionId: sessionId, forkTurn: 3, claimant: B, ...OPEN }).service;
    services.push(child);
    const forked = sessionTokenCounts(child.readEvents());
    expect(forked.turns).toEqual([]);
    expect(forked.inherited).toEqual({ parentSessionId: sessionId, turns: before.turns, compactions: before.compactions, inherited: null });
  }, 60_000);
});
