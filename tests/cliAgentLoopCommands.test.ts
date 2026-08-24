import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { readLoopRetryMeta } from "../src/session/loopEventMeta.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport
} from "../src/agent/stubProvider.js";
import { echoToolSeam } from "../src/agent/echoTool.js";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * P3.2 stage 4 — the operator surface, and the composed path it runs on.
 *
 * These are the VERIFY clauses as an OPERATOR meets them: not a hand-built
 * driver in a test, but the same `runComposedTurn` the CLI calls, over the same
 * keyless stub route an operator gets with no API key.
 *
 *   VERIFY-1  a multi-step turn calling stub tools     → "a turn with a tool …"
 *   VERIFY-2  steering mid-turn                        → "a steer sent mid-turn …"
 *   VERIFY-3  cancel leaves a clean interrupted turn   → "a cancel mid-request …"
 *   VERIFY-4  reconstructable and signed               → "the run verifies …"
 *
 * On VERIFY-3's wording: the plan says "clean INTERRUPTED turn", and what this
 * asserts is a clean CANCELLED turn carrying `{kind:"user"}`. That is the user's
 * binding decision of 2026-08-25 — a live stop and a dead process are two
 * different facts, and `interrupted` is reserved for the second. "Clean" is the
 * part that is unchanged and is what these assertions are really about: the turn
 * is BALANCED, not truncated.
 */
describe("amc agent-loop — the operator surface", () => {
  let dir: string;
  let home: string;
  let cwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-agent-cli-"));
    home = mkdtempSync(join(tmpdir(), "amc-agent-home-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    cwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function events(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  const rowsOf = (rows: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
    rows.filter((row) => row.event_type === type);

  /** The base composition every test here varies. Keyless: the stub needs no credential. */
  function turnOptions(extra: Partial<Parameters<typeof runComposedTurn>[0]> = {}) {
    return {
      workspace: dir,
      agentId: "default",
      systemPrompt: "You are an AMC-governed agent.",
      prompt: "hello",
      route: {
        providerId: STUB_PROVIDER_ID,
        model: STUB_PROVIDER_MODEL,
        params: { max_tokens: 256, stream: true }
      },
      routes: [stubProviderRoute()],
      transport: stubProviderTransport(),
      tools: echoToolSeam(),
      // An isolated home, so the test never reads the developer's own
      // credentials file — and never fails because of its permissions.
      credentials: { homeDir: home, env: {}, watch: false, projectDir: null },
      ...extra
    };
  }

  it("VERIFY-1: a turn with a tool call takes two steps and completes", async () => {
    const outcome = await runComposedTurn(turnOptions());
    expect(outcome.status).toBe("idle");

    const rows = events(outcome.sessionId);
    expect(rowsOf(rows, "turn/start")).toHaveLength(1);
    expect(rowsOf(rows, "step/start")).toHaveLength(2);
    expect(rowsOf(rows, "tool/call")).toHaveLength(1);
    expect(rowsOf(rows, "tool/result")).toHaveLength(1);
    expect(readTurnEndMeta(rowsOf(rows, "turn/end")[0]!.meta_json)?.reason).toBe("complete");
    // The session is CLOSED, so the verifier reads it as a finished run rather
    // than as an interrupted one.
    expect(rowsOf(rows, "session/close")).toHaveLength(1);
  });

  it("VERIFY-2: a steer sent mid-turn is claimed by a later step of the SAME turn", async () => {
    // The stub thinks for 40ms per answer, so a steer at 10ms lands while step 1
    // is in flight. Without that gap the turn would finish first and the steer
    // would open a second turn — a different (and much weaker) claim.
    const outcome = await runComposedTurn(
      turnOptions({
        transport: stubProviderTransport({ thinkMs: 40 }),
        onSteer: { afterMs: 10, text: "actually, be brief" }
      })
    );

    const rows = events(outcome.sessionId);
    const prompts = rowsOf(rows, "user/message");
    expect(prompts).toHaveLength(2);
    // Both in turn 1: the steer joined the turn already running, and the second
    // one entered at the NEXT step boundary rather than interrupting the step.
    expect(prompts.map((row) => extractEnvelope(row.meta_json)?.turn)).toEqual([1, 1]);
    expect(prompts.map((row) => extractEnvelope(row.meta_json)?.step)).toEqual([1, 2]);
    // Queued durably before it was claimed: an insert row and a claim row.
    const inbox = rowsOf(rows, "loop/inbox").map(
      (row) => (JSON.parse(row.meta_json) as { op: string; origin: string | null }).op
    );
    expect(inbox.filter((op) => op === "insert")).toHaveLength(2);
    expect(readTurnEndMeta(rowsOf(rows, "turn/end")[0]!.meta_json)?.reason).toBe("complete");
  });

  it("VERIFY-3: a cancel mid-request leaves a BALANCED turn that names who stopped it", async () => {
    const outcome = await runComposedTurn(
      turnOptions({
        transport: stubProviderTransport({ thinkMs: 500 }),
        onReady: (handle) => {
          setTimeout(() => handle.cancel({ kind: "user" }), 20);
        }
      })
    );
    expect(outcome.status).toBe("idle");

    const rows = events(outcome.sessionId);
    // Balanced: every opened bracket is closed. A truncated turn would be
    // indistinguishable from a crashed one.
    expect(rowsOf(rows, "turn/start")).toHaveLength(1);
    expect(rowsOf(rows, "turn/end")).toHaveLength(1);
    expect(rowsOf(rows, "step/start")).toHaveLength(1);
    expect(rowsOf(rows, "step/end")).toHaveLength(1);

    const ending = readTurnEndMeta(rowsOf(rows, "turn/end")[0]!.meta_json);
    expect(ending?.reason).toBe("cancelled");
    expect(ending?.cancelCause).toEqual({ kind: "user" });
    // NOT interrupted. That word belongs to crash repair, and a live stop that
    // borrowed it would say this process died.
    expect(ending?.interrupted).toBe(false);

    // The REQUEST to stop is its own row, written before anything unwound, so
    // attribution survives even if the process had died during the unwind.
    const cancelRow = rowsOf(rows, "loop/cancel")[0];
    expect(cancelRow).toBeDefined();
    const meta = JSON.parse(cancelRow!.meta_json) as { cause: unknown; phase: string };
    expect(meta.cause).toEqual({ kind: "user" });
    expect(meta.phase).toBe("running");
    // The in-flight request settled rather than dangling.
    expect(rowsOf(rows, "request/failure")).toHaveLength(1);
  });

  it("VERIFY-4: the run verifies — signed, chained, and every request re-derived", async () => {
    const outcome = await runComposedTurn(
      turnOptions({ transport: stubProviderTransport({ failFirst: 1 }) })
    );

    const rows = events(outcome.sessionId);
    // The injected 429 produced a retried step: two headers under one step.
    const retried = rowsOf(rows, "request/header").filter(
      (row) => extractEnvelope(row.meta_json)?.step === 1
    );
    expect(retried).toHaveLength(2);
    const retryMeta = readLoopRetryMeta(rowsOf(rows, "loop/retry")[0]!.meta_json);
    expect(retryMeta?.decision).toBe("retry");
    expect(retryMeta?.delaySource).toBe("provider");

    const report = await verifyAgentRun(dir, outcome.sessionId);
    expect(report.ledgerErrors).toEqual([]);
    expect(report.sessionChainErrors).toEqual([]);
    expect(report.unsignedRowIds).toEqual([]);
    expect(report.requests.every((request) => request.status === "reconstructed")).toBe(true);
    expect(report.ok).toBe(true);
  });

  describe("the command wiring", () => {
    interface Captured {
      readonly out: string[];
      readonly errors: string[];
      readonly failures: number[];
    }

    function programWith(): { program: Command; captured: Captured } {
      const out: string[] = [];
      const errors: string[] = [];
      const failures: number[] = [];
      const io: AgentLoopCliIo = {
        log: (line) => out.push(line),
        error: (line) => errors.push(line),
        fail: () => failures.push(1)
      };
      const program = new Command();
      program.exitOverride();
      registerAgentCommands(program, io);
      return { program, captured: { out, errors, failures } };
    }

    const run = (program: Command, argv: string[]): Promise<unknown> =>
      program.parseAsync(argv, { from: "user" });

    it("runs a turn from argv and reports what the log recorded", async () => {
      process.chdir(dir);
      const { program, captured } = programWith();
      await run(program, [
        "agent-loop",
        "run",
        "hello",
        "--credentials-home",
        home,
        "--fail-first",
        "1",
        "--json"
      ]);

      expect(captured.failures).toEqual([]);
      const summary = JSON.parse(captured.out[captured.out.length - 1]!) as AgentRunSummary;
      expect(summary.driverStatus).toBe("idle");
      expect(summary.steps).toBe(2);
      // A retried step, so more requests than steps — and the summary says so.
      expect(summary.requests).toBe(3);
      expect(summary.retried).toBe(1);
      expect(summary.toolCalls).toBe(1);
      expect(summary.unsignedRows).toBe(0);
      expect(summary.endings.map((ending) => ending.reason)).toEqual(["complete"]);
      // The model's words are read back out of the signed rows, not remembered.
      expect(summary.assistantText.join(" ")).toContain("stub provider");

      const { program: verifier, captured: verifyOut } = programWith();
      await run(verifier, ["agent-loop", "verify", summary.sessionId]);
      expect(verifyOut.failures).toEqual([]);
      expect(verifyOut.out.join("\n")).toContain("VERIFIED");
    });

    it("cancels on --cancel-after and still exits with a balanced, attributed turn", async () => {
      process.chdir(dir);
      const { program, captured } = programWith();
      await run(program, [
        "agent-loop",
        "run",
        "hello",
        "--credentials-home",
        home,
        "--think-ms",
        "500",
        "--cancel-after",
        "20",
        "--json"
      ]);

      const summary = JSON.parse(captured.out[captured.out.length - 1]!) as AgentRunSummary;
      expect(summary.endings).toEqual([
        { turn: 1, reason: "cancelled", cancelCause: "user", interrupted: false }
      ]);
      expect(summary.unsignedRows).toBe(0);
    });

    it("refuses a run it cannot compose, and names the flag that was wrong", async () => {
      process.chdir(dir);
      for (const [argv, expected] of [
        [["agent-loop", "run"], "a prompt is required"],
        [["agent-loop", "run", "hi", "--provider", "nope"], "unknown provider"],
        [["agent-loop", "run", "hi", "--provider", "anthropic"], "--model is required"],
        [["agent-loop", "run", "hi", "--max-steps", "-3"], "--max-steps"]
      ] as const) {
        const { program, captured } = programWith();
        await run(program, [...argv]);
        // Refused BEFORE anything durable exists: a rejected invocation must not
        // leave a half-opened session behind for the verifier to report.
        expect(captured.failures.length, `${argv.join(" ")} did not fail`).toBe(1);
        expect(captured.errors.join("\n")).toContain(expected);
      }
    });
  });
});
