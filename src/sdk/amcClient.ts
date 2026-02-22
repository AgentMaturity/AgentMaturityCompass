import { randomUUID } from "node:crypto";
import { assertNoSelfScoring, requireBridgeUrl } from "./amcGuards.js";
import { hashSdkValue, redactSdkText } from "./amcEvidence.js";
import { sendBridgeTelemetry } from "./amcTelemetry.js";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:3212";

export interface AMCClientConfig {
  bridgeUrl?: string;
  token?: string;
  workspaceId?: string;
  fetchImpl?: typeof fetch;
}

export interface AMCBridgeResponse<T = unknown> {
  status: number;
  body: T;
  requestId: string | null;
  receipt: string | null;
  correlationId: string | null;
}

function resolveClientConfig(config: AMCClientConfig): Required<Pick<AMCClientConfig, "bridgeUrl" | "token">> & AMCClientConfig {
  const bridgeUrl = config.bridgeUrl ?? process.env.AMC_BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
  const token = config.token ?? process.env.AMC_TOKEN ?? "";
  return { ...config, bridgeUrl, token };
}

export class AMCClient {
  readonly bridgeUrl: string;
  readonly token: string;
  readonly workspaceId: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AMCClientConfig) {
    const resolved = resolveClientConfig(config);
    this.bridgeUrl = requireBridgeUrl(resolved.bridgeUrl);
    this.token = resolved.token;
    this.workspaceId = resolved.workspaceId ?? null;
    this.fetchImpl = resolved.fetchImpl ?? fetch;
  }

  private async callBridge<T>(path: string, payload: Record<string, unknown>): Promise<AMCBridgeResponse<T>> {
    assertNoSelfScoring(payload);
    const correlationId = randomUUID();
    const response = await this.fetchImpl(`${this.bridgeUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
        "x-amc-correlation-id": correlationId
      },
      body: JSON.stringify(payload)
    });
    const bodyText = await response.text();
    const parsed = (() => {
      try {
        return JSON.parse(bodyText) as T;
      } catch {
        return ({ raw: bodyText } as unknown) as T;
      }
    })();
    return {
      status: response.status,
      body: parsed,
      requestId: response.headers.get("x-amc-bridge-request-id"),
      receipt: response.headers.get("x-amc-receipt"),
      correlationId: response.headers.get("x-amc-correlation-id")
    };
  }

  async openaiChat(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openai/v1/chat/completions", payload);
  }

  async openaiResponses(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openai/v1/responses", payload);
  }

  async openaiEmbeddings(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openai/v1/embeddings", payload);
  }

  async openaiImages(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openai/v1/images/generations", payload);
  }

  async openaiAudioSpeech(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openai/v1/audio/speech", payload);
  }

  async anthropicMessages(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/anthropic/v1/messages", payload);
  }

  async geminiGenerateContent(model: string, payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge(`/bridge/gemini/v1beta/models/${encodeURIComponent(model)}:generateContent`, payload);
  }

  async openrouterChat(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/openrouter/v1/chat/completions", payload);
  }

  async xaiChat(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/xai/v1/chat/completions", payload);
  }

  async localChat(payload: Record<string, unknown>): Promise<AMCBridgeResponse> {
    return this.callBridge("/bridge/local/v1/chat/completions", payload);
  }

  async reportOutput(params: {
    sessionId: string;
    value: string | Record<string, unknown>;
    provider?: string;
    runId?: string;
  }): Promise<void> {
    const serialized = typeof params.value === "string" ? params.value : JSON.stringify(params.value);
    await sendBridgeTelemetry({
      bridgeUrl: this.bridgeUrl,
      token: this.token,
      fetchImpl: this.fetchImpl,
      event: {
        sessionId: params.sessionId,
        eventType: "agent_stdout",
        provider: params.provider,
        runId: params.runId,
        payload: redactSdkText(serialized)
      }
    });
  }

  outputHash(value: string | Record<string, unknown>): string {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return hashSdkValue(serialized);
  }
}

export function createAMCClient(config: AMCClientConfig): AMCClient {
  return new AMCClient(config);
}

export function createAMCClientFromEnv(overrides: Omit<AMCClientConfig, "bridgeUrl" | "token"> = {}): AMCClient {
  return new AMCClient({ ...overrides });
}
