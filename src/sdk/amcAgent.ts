import { randomUUID } from "node:crypto";
import { AMCClient, type AMCClientConfig } from "./amcClient.js";
import { runSpan, type AMCSpanRecord } from "./amcSpan.js";
import { instrumentOpenAIClient } from "./integrations/openai.js";
import { instrumentAnthropicClient } from "./integrations/anthropic.js";
import { instrumentGeminiClient } from "./integrations/gemini.js";
import { createVercelAIFetchBridge } from "./integrations/vercelAiSdk.js";
import { createLangChainJsBridge } from "./integrations/langchainJs.js";
import { createLangGraphJsBridge } from "./integrations/langgraphJs.js";
import { instrumentOpenAIAgentsSdk } from "./integrations/openaiAgentsSdk.js";
import { AMCNativeClient, type AMCNativeClientOptions } from "./nativeAgentClient.js";

export class AMCAgent {
  readonly client: AMCClient;

  /** Explicit local operator execution, separate from bridge instrumentation.
   * No bridge lease, telemetry field or provider default becomes native authority.
   * The caller owns close/release and may use newSession or verified resumeSession.
   */
  static startNative(options: AMCNativeClientOptions): Promise<AMCNativeClient> {
    return AMCNativeClient.start(options);
  }

  constructor(client: AMCClient) {
    this.client = client;
  }

  instrumentOpenAI<T extends object>(client: T): T {
    return instrumentOpenAIClient(client, this.client);
  }

  instrumentAnthropic<T extends object>(client: T): T {
    return instrumentAnthropicClient(client, this.client);
  }

  instrumentGemini<T extends object>(client: T): T {
    return instrumentGeminiClient(client, this.client);
  }

  instrumentOpenAIAgentsSdk<T extends object>(client: T): T {
    return instrumentOpenAIAgentsSdk(client, this.client);
  }

  createVercelAIFetch(provider: Parameters<typeof createVercelAIFetchBridge>[1] = "openai"): typeof fetch {
    return createVercelAIFetchBridge(this.client, provider);
  }

  createLangChainBridge(model = "gpt-4o-mini"): ReturnType<typeof createLangChainJsBridge> {
    return createLangChainJsBridge(this.client, model);
  }

  createLangGraphBridge(model = "gpt-4o-mini"): ReturnType<typeof createLangGraphJsBridge> {
    return createLangGraphJsBridge(this.client, model);
  }

  async span<T>(name: string, fn: () => Promise<T> | T): Promise<{ result: T; span: AMCSpanRecord }> {
    const sessionId = `sdk_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await this.client.sendTelemetry({
      sessionId,
      eventType: "agent_process_started",
      payload: { name }
    }).catch(() => {});
    const out = await runSpan(name, fn);
    await this.client.sendTelemetry({
      sessionId,
      eventType: "agent_process_exited",
      payload: {
        spanId: out.span.spanId,
        ok: out.span.ok,
        durationMs: out.span.durationMs
      }
    }).catch(() => {});
    return out;
  }

  async reportOutput(params: {
    sessionId: string;
    value: string | Record<string, unknown>;
    provider?: string;
    runId?: string;
  }): Promise<void> {
    await this.client.reportOutput(params);
  }
}

export function createAMCAgent(config: AMCClientConfig): AMCAgent {
  return new AMCAgent(new AMCClient(config));
}
