import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import type { CredentialDescription } from "../src/credentials/credentialSources.js";
import {
  AGENT_LOOP_SEAM,
  agentLoopServices,
  type AgentLoopSeamService
} from "../src/kernel/services/agentLoopServices.js";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport
} from "../src/agent/stubProvider.js";
import { echoToolSeam } from "../src/agent/echoTool.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * P3.2 stage 4 — the agent loop on the composed tree.
 *
 * Same shape as the P2.1 / P3.0 / P3.1 service tests: the value of composing a
 * capability is that a consumer declaring `inject: ["amcAgentLoop"]` stays
 * PENDING when nothing provides it, rather than dereferencing undefined the
 * first time somebody asks the agent to do something.
 *
 * The concern unique to THIS service is disposal. Unloading the fiber cancels
 * the live turn as `{kind:"disposed"}` and waits for it to close, and both
 * halves are checked — the cause, because a torn-down composition and a person
 * pressing stop are different facts, and the WAIT, because a dispose that
 * returned early would leave the last turn open and make a tidy shutdown
 * indistinguishable from a crash.
 */
const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 20));

class NoCredentials implements CredentialsService {
  resolve(): string | null {
    return null;
  }

  describe(): CredentialDescription {
    return Object.freeze({ configured: false, source: null, writable: false });
  }

  async set(): Promise<void> {
    throw new Error("not used");
  }

  async unset(): Promise<boolean> {
    throw new Error("not used");
  }
}

function serviceOn(ctx: Context): AgentLoopSeamService {
  return (ctx as unknown as Record<string, AgentLoopSeamService>)[AGENT_LOOP_SEAM.name]!;
}

describe("the agent loop on the composed tree", () => {
  let dir: string;
  let session: SessionService;
  let systemPromptEventId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-agent-seam-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    session = new SessionService(dir);
    session.open({
      agentId: "default",
      harnessVersion: "3.2.0",
      compositionDigest: "composition-digest",
      policyDigest: "policy-digest"
    });
    systemPromptEventId = session.recordSystemPrompt("You are terse.").eventId;
  });

  afterEach(() => {
    try {
      session.close({ reason: "completed" });
    } catch {
      // Already closed, or the driver failed. Cleanup, not an assertion.
    }
    rmSync(dir, { recursive: true, force: true });
  });

  function runtimeOver(transport: HttpTransport): LlmRuntime {
    const registry = new AdapterRegistry();
    registry.register(stubProviderRoute());
    return new LlmRuntime({ session, credentials: new NoCredentials(), registry, transport });
  }

  function events(): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === session.sessionId);
    } finally {
      ledger.close();
    }
  }

  const route = {
    providerId: STUB_PROVIDER_ID,
    model: STUB_PROVIDER_MODEL,
    params: { max_tokens: 256, stream: true }
  };

  it("gates a consumer until an agent loop is composed", async () => {
    const ctx = new Context();
    const seen: string[] = [];
    ctx.plugin({
      name: "agent-consumer",
      inject: [AGENT_LOOP_SEAM.name],
      apply: () => {
        seen.push("applied");
      }
    });
    await settle();
    // PENDING, not "applied with an undefined service": a consumer that ran here
    // would be one that could ask an agent to act with no session behind it.
    expect(seen).toEqual([]);

    const fiber = ctx.plugin(agentLoopServices, {
      session,
      llm: runtimeOver(stubProviderTransport()),
      route,
      systemPromptEventId
    });
    await fiber.await();
    await settle();
    expect(seen).toEqual(["applied"]);
    expect(serviceOn(ctx).sessionId).toBe(session.sessionId);
    await fiber.dispose();
  });

  it("runs a multi-step, tool-calling turn through the composed service", async () => {
    const ctx = new Context();
    const fiber = ctx.plugin(agentLoopServices, {
      session,
      llm: runtimeOver(stubProviderTransport()),
      route,
      systemPromptEventId,
      tools: echoToolSeam()
    });
    await fiber.await();
    const loop = serviceOn(ctx);

    loop.followup("hello");
    await loop.whenIdle();
    await fiber.dispose();

    const rows = events();
    // The stub asks for the echo tool on the first step and answers in text on
    // the second, so this is a genuine multi-step turn — VERIFY-1, driven from
    // the composed tree rather than from a hand-built driver.
    expect(rows.filter((row) => row.event_type === "step/start")).toHaveLength(2);
    expect(rows.filter((row) => row.event_type === "tool/call")).toHaveLength(1);
    expect(rows.filter((row) => row.event_type === "tool/result")).toHaveLength(1);
    const ending = readTurnEndMeta(rows.find((row) => row.event_type === "turn/end")!.meta_json);
    expect(ending?.reason).toBe("complete");
    expect(loop.status).toBe("idle");
    // Disposing an idle driver with an empty inbox stops nothing, so it must
    // write nothing. A `loop/cancel` on every clean shutdown would make the one
    // row an auditor scans for ("was this agent stopped?") worthless.
    expect(rows.filter((row) => row.event_type === "loop/cancel")).toHaveLength(0);
  });

  it("disposal cancels the live turn as `disposed` AND waits for it to close", async () => {
    // The transport hangs until the request is aborted, and then takes a real
    // macrotask to unwind. That gap is the point: a `shutdown` that cancelled
    // without awaiting `whenIdle` would return before the turn closed, and the
    // assertions below would find an open turn.
    const hanging: HttpTransport = (request) =>
      new Promise<HttpResponse>((_resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => {
            setTimeout(() => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            }, 25);
          },
          { once: true }
        );
      });

    const ctx = new Context();
    const fiber = ctx.plugin(agentLoopServices, {
      session,
      llm: runtimeOver(hanging),
      route,
      systemPromptEventId
    });
    await fiber.await();
    const loop = serviceOn(ctx);

    loop.followup("hello");
    await settle();
    expect(loop.status).toBe("running");

    await fiber.dispose();

    const rows = events();
    const closer = rows.find((row) => row.event_type === "turn/end");
    expect(closer, "disposal returned before the turn was closed").toBeDefined();
    const ending = readTurnEndMeta(closer!.meta_json);
    // A LIVE cancellation with the teardown's own cause — not `interrupted`,
    // which is crash repair's word and would claim this process died.
    expect(ending?.reason).toBe("cancelled");
    expect(ending?.cancelCause).toEqual({ kind: "disposed" });
    expect(ending?.interrupted).toBe(false);
    // Balanced one level down too, and the request that was in flight settled.
    expect(rows.filter((row) => row.event_type === "step/start")).toHaveLength(1);
    expect(rows.filter((row) => row.event_type === "step/end")).toHaveLength(1);
    expect(rows.filter((row) => row.event_type === "request/failure")).toHaveLength(1);
    // Attribution survives independently of the closer: the request to stop is
    // its own signed row, written before anything unwound.
    const cancelRow = rows.find((row) => row.event_type === "loop/cancel");
    expect(cancelRow).toBeDefined();
    expect(JSON.parse(cancelRow!.meta_json).cause).toEqual({ kind: "disposed" });
  });

  it("disposal DOES cancel an idle driver that still holds queued work", async () => {
    const ctx = new Context();
    const fiber = ctx.plugin(agentLoopServices, {
      session,
      llm: runtimeOver(stubProviderTransport()),
      route,
      systemPromptEventId
    });
    await fiber.await();
    const loop = serviceOn(ctx);

    // `inject` queues model-facing context WITHOUT waking, so the driver stays
    // idle with real work committed to its inbox.
    loop.inject("context nobody will ever show the model");
    expect(loop.status).toBe("idle");
    await fiber.dispose();

    const rows = events();
    // This work IS being abandoned, so the abandonment is recorded — the other
    // half of the rule that a clean shutdown writes nothing.
    const cancelRow = rows.find((row) => row.event_type === "loop/cancel");
    expect(cancelRow, "queued work was dropped with no row saying so").toBeDefined();
    const meta = JSON.parse(cancelRow!.meta_json) as { cause: unknown; phase: string };
    expect(meta.cause).toEqual({ kind: "disposed" });
    expect(meta.phase).toBe("idle");
    // And the drop itself is a splice marked `cancelled`, not a claim: nothing
    // consumed it.
    const drop = rows
      .filter((row) => row.event_type === "loop/inbox")
      .map((row) => JSON.parse(row.meta_json) as { op: string; outcome: string | null })
      .find((inbox) => inbox.op === "cancel");
    expect(drop?.outcome).toBe("cancelled");
  });

  it("refuses a cancellation that names no cause", async () => {
    const ctx = new Context();
    const fiber = ctx.plugin(agentLoopServices, {
      session,
      llm: runtimeOver(stubProviderTransport()),
      route,
      systemPromptEventId
    });
    await fiber.await();
    const loop = serviceOn(ctx);
    // "Who stopped this agent" is the auditor's question, and an unattributed
    // stop is refused at the door rather than signed as an anonymous one.
    expect(() => loop.cancel({ kind: "nonsense" } as never)).toThrow(/must name its cause/);
    await fiber.dispose();
  });
});
