import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerSteerFrame, INBOX_RECEIPT_FRAME, listenForSteerFrames, parseSteerFrame, parseWithdrawFrame, STEER_FRAME, WITHDRAW_FRAME, type InboxReceiptFrame } from "../src/agent/steerIpc.js";
import { runComposedTurn, type ComposedTurnHandle } from "../src/kernel/agentLoopRunner.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { echoToolSeam } from "../src/agent/echoTool.js";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * SH-LOOP-02: steering, queueing and withdrawing reach the durable inbox from a live surface. The composed handle
 * exposes them; `--interactive-steer` answers validated IPC frames with the signed inbox receipt.
 */
const rowsOf = (rows: readonly EvidenceEvent[], type: string) => rows.filter(row => row.event_type === type);
function events(workspace: string, sessionId: string): EvidenceEvent[] {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); } finally { ledger.close(); }
}

describe("frame validation", () => {
  it("accepts the exact shape and refuses the rest with a reason; other features' frames are ignored", () => {
    expect(parseSteerFrame({ type: STEER_FRAME, v: 1, lane: "next-step", text: "focus on tests", clientRequestId: "req-1" })).toMatchObject({ ok: true, frame: { lane: "next-step", clientRequestId: "req-1" } });
    // MUTATION: drop the lane check and `lane: "now"` is accepted.
    expect(parseSteerFrame({ type: STEER_FRAME, v: 1, lane: "now", text: "x" })).toMatchObject({ ok: false, refused: expect.stringContaining("lane") });
    expect(parseSteerFrame({ type: STEER_FRAME, v: 1, lane: "next-turn", text: "   " })).toMatchObject({ ok: false });
    expect(parseSteerFrame({ type: STEER_FRAME, v: 1, lane: "next-turn", text: "x".repeat(256 * 1024 + 1) })).toMatchObject({ ok: false, refused: expect.stringContaining("bytes") });
    expect(parseSteerFrame({ type: STEER_FRAME, v: 1, lane: "next-turn", text: "x", clientRequestId: "bad id" })).toMatchObject({ ok: false });
    expect(parseSteerFrame({ type: STEER_FRAME, v: 2, lane: "next-turn", text: "x" })).toBeNull();
    expect(parseSteerFrame({ type: "amc/native-ask-user-answer", v: 1 })).toBeNull();
    expect(parseWithdrawFrame({ type: WITHDRAW_FRAME, v: 1, messageId: "../x" })).toMatchObject({ ok: false });
    expect(answerSteerFrame({ steer: () => { throw new Error("x"); }, queue: () => { throw new Error("x"); }, withdraw: () => false }, { unrelated: true })).toBeNull();
  });

  it("answers a refused driver with a refusal, never a receipt", () => {
    const target = { steer: () => { throw new Error("AgentDriver is disposed: new work is refused"); }, queue: () => { throw new Error("x"); }, withdraw: () => false };
    expect(answerSteerFrame(target, { type: STEER_FRAME, v: 1, lane: "next-step", text: "late", clientRequestId: "r" })).toMatchObject({ ok: false, frame: "steer", refused: expect.stringContaining("disposed"), clientRequestId: "r" });
    const sent: InboxReceiptFrame[] = [];
    const listeners: ((value: unknown) => void)[] = [];
    const dispose = listenForSteerFrames(target, { send: frame => sent.push(frame), on: (_event, listener) => listeners.push(listener), removeListener: (_event, listener) => listeners.splice(listeners.indexOf(listener), 1) });
    listeners[0]!({ type: WITHDRAW_FRAME, v: 1, messageId: "m1" });
    expect(sent).toEqual([{ type: INBOX_RECEIPT_FRAME, v: 1, ok: true, frame: "withdraw", messageId: "m1", withdrawn: false }]);
    dispose();
    expect(listeners).toHaveLength(0);
  });
});

describe("the composed handle", () => {
  let dir: string; let home: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "amc-steer-handle-")); home = mkdtempSync(join(tmpdir(), "amc-steer-home-")); initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" }); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

  it("steers the first turn, queues a second, and withdraws a queued message with a signed splice", async () => {
    let handle!: ComposedTurnHandle;
    let withdrawn: boolean | null = null; let withdrawnId = "";
    const outcome = await runComposedTurn({
      workspace: dir, agentId: "default", systemPrompt: "You are an AMC-governed agent.", prompt: "hello",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
      routes: [stubProviderRoute()], transport: stubProviderTransport({ thinkMs: 40 }), tools: echoToolSeam(),
      credentials: { homeDir: home, env: {}, watch: false, projectDir: null },
      onReady: ready => {
        handle = ready;
        handle.steer("steer: mention the budget", "client-steer-1");
        handle.queue("second turn please", "client-queue-1");
        const doomed = handle.queue("never run");
        withdrawnId = doomed.messageId;
        withdrawn = handle.withdraw(doomed.messageId);
      }
    });
    expect(outcome.status).toBe("idle");
    expect(withdrawn).toBe(true);
    const rows = events(dir, outcome.sessionId);
    const inserts = rowsOf(rows, "loop/inbox").map(row => readLoopInboxMeta(row.meta_json)!).filter(meta => meta.op === "insert");
    // onReady runs before the opening prompt is queued, so the steer is the first insert.
    expect(inserts.map(meta => meta.origin)).toEqual(["steer", "followup", "followup", "followup"]);
    expect(rowsOf(rows, "loop/inbox").map(row => readLoopInboxMeta(row.meta_json)!).some(meta => meta.op !== "insert" && meta.messageIds.includes(withdrawnId))).toBe(true);
    expect(rowsOf(rows, "turn/start")).toHaveLength(2);
    expect(rowsOf(rows, "user/message").map(row => extractEnvelope(row.meta_json)?.turn)).toEqual([1, 1, 2]);
  });
});

describe("amc agent-loop run --interactive-steer", () => {
  const CLI = resolve(process.cwd(), "dist/cli.js");
  let workspace: string; let home: string; let child: ChildProcess | null = null;
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-steer-ipc-")));
    home = realpathSync(mkdtempSync(join(tmpdir(), "amc-steer-ipc-home-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { child?.kill("SIGKILL"); rmSync(workspace, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

  it("answers a steer frame with its signed inbox receipt, refuses a malformed one, and the steer is claimed by the same turn", async () => {
    child = fork(CLI, ["agent-loop", "run", "hello over ipc", "--provider", "stub", "--think-ms", "2500", "--interactive-steer", "--credentials-home", home, "--json"],
      { cwd: workspace, stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: process.env.AMC_VAULT_PASSPHRASE ?? "amc-test-passphrase" } });
    const stdout: string[] = []; const stderr: string[] = [];
    child.stdout!.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    const frames: Record<string, unknown>[] = [];
    const waitFor = (predicate: () => boolean, ms: number) => new Promise<void>((done, fail) => {
      const started = Date.now();
      const tick = () => { if (predicate()) done(); else if (Date.now() - started > ms) fail(new Error(`timed out; stderr: ${stderr.join("")}`)); else setTimeout(tick, 20); };
      tick();
    });
    child.on("message", (value) => { frames.push(value as Record<string, unknown>); });
    // Probe with a malformed frame (refused, touches no inbox) until the run's listener answers, then steer once.
    const probe = setInterval(() => { try { child?.send({ type: STEER_FRAME, v: 1, lane: "sideways", text: "nope" }); } catch { /* not yet */ } }, 100);
    try { await waitFor(() => frames.some(frame => frame.ok === false), 20_000); } finally { clearInterval(probe); }
    child.send({ type: STEER_FRAME, v: 1, lane: "next-step", text: "steer from the parent", clientRequestId: "p-1" });
    await waitFor(() => frames.some(frame => frame.ok === true), 10_000);
    const exit = await new Promise<number | null>(done => child!.on("exit", code => done(code)));
    expect(exit, stderr.join("")).toBe(0);
    const accepted = frames.find(frame => frame.ok === true) as { receipt: { messageId: string } } | undefined;
    expect(accepted?.receipt.messageId).toBeTypeOf("string");
    expect(frames.find(frame => frame.ok === false)).toMatchObject({ frame: "steer", refused: expect.stringContaining("lane") });
    const text = stdout.join("");
    const summary = JSON.parse(text.slice(text.indexOf("{"))) as { sessionId: string };
    const rows = events(workspace, summary.sessionId);
    const steer = rowsOf(rows, "loop/inbox").map(row => readLoopInboxMeta(row.meta_json)!).find(meta => meta.origin === "steer");
    expect(steer?.messageIds).toEqual([accepted!.receipt.messageId]);
    expect(rowsOf(rows, "turn/start")).toHaveLength(1);
  }, 40_000);

  it("is refused with --goal-rounds, which runs no root turn to steer, before any session row", async () => {
    // MUTATION: drop the refusal and the run starts goal rounds whose children no frame can reach.
    child = fork(CLI, ["agent-loop", "run", "a goal", "--provider", "stub", "--interactive-steer", "--goal-rounds", "2", "--delegate", "--tools", "workspace",
      "--credentials-home", home], { cwd: workspace, stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: process.env.AMC_VAULT_PASSPHRASE ?? "amc-test-passphrase" } });
    const stderr: string[] = [];
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    const exit = await new Promise<number | null>(done => child!.on("exit", code => done(code)));
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("--goal-rounds runs none");
    const ledger = openLedger(workspace, { readonly: true });
    try { expect(ledger.getAllEvents().filter(row => row.event_type === "session/open")).toHaveLength(0); } finally { ledger.close(); }
  }, 40_000);
});
