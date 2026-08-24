import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import type { CredentialDescription } from "../src/credentials/credentialSources.js";
import { LLM_SEAM, llmServices, type LlmSeamService } from "../src/kernel/services/llmServices.js";
import { anthropicAdapter, openaiAdapter } from "../src/llm/index.js";
import type { StreamChunk } from "../src/llm/index.js";
import { anthropicTextStream, okStream, stubUpstream } from "./helpers/llmStubUpstream.js";

/**
 * P3.1: the model seam on the composed tree.
 *
 * Same shape as the P2.1 evidence-services and P3.0 credentials tests, and for
 * the same reason: the value of composing a capability is that a consumer
 * declaring `inject: ["amcLlm"]` stays PENDING when no provider is composed,
 * rather than falling through to some module-level default and behaving as
 * though a model route had been configured.
 *
 * The extra concern here is HMR. This service is the one that owns the adapter
 * registry, so "a route can be swapped without disturbing a call that already
 * pinned" is a property of the composed object and not only of the registry.
 */
const REF: CredentialRef = credentialRef("AMC_TEST_LLM_KEY");
const MODEL = "claude-test-1";

const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 20));

class FixedCredentials implements CredentialsService {
  resolve(): string | null {
    return "test-credential-value";
  }

  describe(): CredentialDescription {
    return Object.freeze({ configured: true, source: "file" as const, writable: true });
  }

  async set(): Promise<void> {
    throw new Error("not used");
  }

  async unset(): Promise<boolean> {
    throw new Error("not used");
  }
}

function serviceOn(ctx: Context): LlmSeamService {
  return (ctx as unknown as Record<string, LlmSeamService>)[LLM_SEAM.name]!;
}

describe("the llm service on the composed tree", () => {
  let dir: string;
  let session: SessionService;
  let systemPromptEventId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-llm-seam-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    session = new SessionService(dir);
    session.open({
      agentId: "default",
      harnessVersion: "3.1.0",
      compositionDigest: "composition-digest",
      policyDigest: "policy-digest"
    });
    systemPromptEventId = session.recordSystemPrompt("You are terse.").eventId;
    session.startTurn({ trigger: "user" });
    session.recordUserMessage("hello");
    session.startStep();
  });

  afterEach(() => {
    try {
      session.close({ reason: "completed" });
    } catch {
      // Already closed. Cleanup, not an assertion.
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("gates a consumer until an llm provider is composed", async () => {
    const ctx = new Context();
    const seen: string[] = [];
    ctx.plugin({
      name: "llm-consumer",
      inject: [LLM_SEAM.name],
      apply: () => {
        seen.push("applied");
      }
    });
    await settle();
    // PENDING, not "applied with an undefined service": a consumer that ran here
    // would be a consumer that could call a model with no route configured.
    expect(seen).toEqual([]);

    ctx.plugin(llmServices, {
      session,
      credentials: new FixedCredentials(),
      routes: [],
      transport: stubUpstream([() => okStream([])]).transport
    });
    await settle();
    expect(seen).toEqual(["applied"]);
    expect(serviceOn(ctx).providers()).toEqual([]);
  });

  it("streams through the composed seam and records the settlement", async () => {
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["composed"], inputTokens: 7, outputTokens: 2 }))
    ]);
    const ctx = new Context();
    ctx.plugin(llmServices, {
      session,
      credentials: new FixedCredentials(),
      transport: upstream.transport,
      routes: [
        {
          providerId: "anthropic",
          adapter: anthropicAdapter,
          baseUrl: "https://api.anthropic.invalid",
          credentialRef: REF,
          models: [MODEL]
        }
      ]
    });
    await settle();

    const service = serviceOn(ctx);
    expect(service.providers()).toEqual(["anthropic"]);

    const chunks: StreamChunk[] = [];
    for await (const chunk of service.stream({
      providerId: "anthropic",
      model: MODEL,
      params: { max_tokens: 64, stream: true },
      systemPromptEventId,
      tools: null
    })) {
      chunks.push(chunk);
    }
    expect(chunks[chunks.length - 1]).toEqual({ type: "finish", reason: { kind: "stop" } });
    expect(upstream.sent).toHaveLength(1);
    expect(upstream.sent[0]?.headers["x-api-key"]).toBe("test-credential-value");
  });

  it("swaps a route without disturbing a call that already pinned", async () => {
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["pinned"], inputTokens: 7, outputTokens: 2 }))
    ]);
    const ctx = new Context();
    ctx.plugin(llmServices, {
      session,
      credentials: new FixedCredentials(),
      transport: upstream.transport,
      routes: [
        {
          providerId: "anthropic",
          adapter: anthropicAdapter,
          baseUrl: "https://api.anthropic.invalid",
          credentialRef: REF,
          models: [MODEL]
        }
      ]
    });
    await settle();
    const service = serviceOn(ctx);

    const call = service.prepare({
      providerId: "anthropic",
      model: MODEL,
      params: { max_tokens: 64, stream: true },
      systemPromptEventId,
      tools: null
    });
    service.replaceRoute({
      providerId: "anthropic",
      adapter: openaiAdapter,
      baseUrl: "https://replaced.invalid",
      credentialRef: REF,
      models: [MODEL]
    });

    for await (const chunk of call.stream()) void chunk;

    expect(upstream.sent[0]?.url).toBe("https://api.anthropic.invalid/v1/messages");
    expect(call.settled?.failure).toBeNull();
    // And the swap did take effect for the NEXT call, so the test is not merely
    // observing a replacement that never happened.
    expect(service.pin({ providerId: "anthropic", model: MODEL }).adapter).toBe(openaiAdapter);
  });

  it("rejects a duplicate route rather than silently shadowing one", async () => {
    const ctx = new Context();
    const route = {
      providerId: "anthropic",
      adapter: anthropicAdapter,
      baseUrl: "https://api.anthropic.invalid",
      credentialRef: REF,
      models: [MODEL]
    };
    ctx.plugin(llmServices, {
      session,
      credentials: new FixedCredentials(),
      transport: stubUpstream([() => okStream([])]).transport,
      routes: [route]
    });
    await settle();
    const service = serviceOn(ctx);
    expect(() => service.addRoute(route)).toThrow(/already registered/);
    expect(service.removeRoute("anthropic")).toBe(true);
    expect(service.providers()).toEqual([]);
  });
});
