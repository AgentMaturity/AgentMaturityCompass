/**
 * Real agent execution for assurance / red-team scans.
 *
 * Historically the assurance runner graded a hardcoded `syntheticResponse()`
 * that always produced a policy-compliant refusal, so every scan reported
 * "no vulnerabilities" before it ran. This module replaces that with genuine
 * invocation of the agent under test.
 *
 * There is deliberately NO synthetic implementation here. When a real target
 * cannot be reached, `resolveAgentResponder` throws
 * `AgentResponderUnavailableError` and callers must record the scan as
 * inconclusive rather than emitting a passing score.
 *
 * Preferred transport is the AMC gateway: requests carry a signed lease, and
 * the gateway records redacted `llm_request`/`llm_response` evidence with
 * receipts, so scan results are OBSERVED-tier. A direct-to-provider transport
 * exists for workspaces without a running gateway; AMC still sends each
 * request and captures each reply itself, so it is OBSERVED too (P0-18).
 */

import { resolve } from "node:path";
import type { TrustTier } from "../types.js";
import { loadAgentConfig } from "../fleet/registry.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { issueLeaseToken } from "../leases/leaseSigner.js";
import { checkScopedEgress, EgressBlocked } from "../residency/checkEgress.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

/** How the agent under test was reached. */
export type AgentResponderTransport = "gateway" | "direct";

/** Identifies exactly what was exercised, recorded alongside scan evidence. */
export interface AgentResponderTarget {
  agentId: string;
  transport: AgentResponderTransport;
  /** Endpoint the prompt was sent to (never contains credentials). */
  endpoint: string;
  model: string;
  routePrefix: string;
  upstreamId: string;
  providerTemplateId: string;
  /**
   * Evidence tier justified by this transport. Both are OBSERVED: gateway
   * traffic is captured as signed ledger evidence, and on the direct transport
   * AMC sends the request and captures the reply itself.
   */
  trustTier: TrustTier;
}

/** A tool the agent under test is offered, in OpenAI function-tool shape. */
export interface AgentToolDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

/** A tool invocation the agent under test chose to make. */
export interface AgentToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface AgentRespondOptions {
  /**
   * Tools to offer the agent. Required for tool-boundary tests: whether an
   * agent *calls* a dangerous tool is the measurement, and it cannot be
   * observed from prose alone.
   */
  tools?: AgentToolDefinition[];
}

export interface AgentResponse {
  /** Assistant text returned by the agent under test. */
  text: string;
  /** Tools the agent chose to call, when tools were offered. */
  toolCalls: AgentToolCall[];
  target: AgentResponderTarget;
  latencyMs: number;
  /** Gateway receipt id, when the gateway captured this exchange. */
  receiptId?: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/**
 * No real agent could be reached. Scans MUST treat this as inconclusive —
 * never as a pass.
 */
export class AgentResponderUnavailableError extends Error {
  readonly code = "AGENT_RESPONDER_UNAVAILABLE";
  readonly reason: string;
  readonly remediation: string;

  constructor(reason: string, remediation: string) {
    super(`No real agent target available: ${reason}`);
    this.name = "AgentResponderUnavailableError";
    this.reason = reason;
    this.remediation = remediation;
  }
}

/** The target was reachable but the individual invocation failed. */
export class AgentResponderInvocationError extends Error {
  readonly code = "AGENT_RESPONDER_FAILED";
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentResponderInvocationError";
    this.status = status;
  }
}

export interface AgentResponder {
  readonly target: AgentResponderTarget;
  respond(prompt: string, options?: AgentRespondOptions): Promise<AgentResponse>;
}

export interface ResolveAgentResponderInput {
  workspace: string;
  agentId?: string;
  /** Model id to exercise. Falls back to $AMC_ASSURANCE_MODEL. */
  model?: string;
  timeoutMs?: number;
  /** Escape hatch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const LEASE_TTL_MS = 15 * 60_000;
/** Conservative caps; the gateway independently enforces workspace budgets. */
const LEASE_MAX_RPM = 60;
const LEASE_MAX_TPM = 120_000;

function resolveModel(explicit: string | undefined, env: NodeJS.ProcessEnv): string {
  const model = explicit ?? env.AMC_ASSURANCE_MODEL;
  if (!model || model.trim().length === 0) {
    throw new AgentResponderUnavailableError(
      "no model configured for the agent under test",
      "Set AMC_ASSURANCE_MODEL=<model-id> (or pass --model) to name the model the scan should exercise."
    );
  }
  return model.trim();
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts assistant text from either an OpenAI-compatible or an Anthropic
 * response envelope. Returns null when the payload carries no text, which the
 * caller reports as a failed invocation rather than an empty pass.
 */
export function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  // OpenAI-compatible: choices[].message.content
  const choices = body.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first?.text;
    if (typeof content === "string" && content.length > 0) return content;
    // Some gateways return content as an array of parts.
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => (typeof part === "string" ? part : (part as Record<string, unknown> | null)?.text))
        .filter((part): part is string => typeof part === "string")
        .join("");
      if (joined.length > 0) return joined;
    }
  }

  // Anthropic: content[].text
  const anthropicContent = body.content;
  if (Array.isArray(anthropicContent)) {
    const joined = anthropicContent
      .map((part) => (part as Record<string, unknown> | null)?.text)
      .filter((part): part is string => typeof part === "string")
      .join("");
    if (joined.length > 0) return joined;
  }

  return null;
}

/**
 * Extracts tool invocations from an OpenAI-compatible or Anthropic response.
 * Malformed argument JSON is preserved as a raw string rather than dropped, so
 * a dangerous call is never silently lost.
 */
export function extractToolCalls(payload: unknown): AgentToolCall[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const calls: AgentToolCall[] = [];

  const choices = body.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown> | undefined)?.message as
      | Record<string, unknown>
      | undefined;
    const toolCalls = message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const entry of toolCalls) {
        const fn = (entry as Record<string, unknown>)?.function as Record<string, unknown> | undefined;
        const name = typeof fn?.name === "string" ? fn.name : undefined;
        if (!name) continue;
        let args: Record<string, unknown> = {};
        const raw = fn?.arguments;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw) as unknown;
            args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { _raw: raw };
          } catch {
            args = { _raw: raw };
          }
        } else if (raw && typeof raw === "object") {
          args = raw as Record<string, unknown>;
        }
        calls.push({ toolName: name, arguments: args });
      }
    }
  }

  // Anthropic tool_use blocks.
  const content = body.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const block = part as Record<string, unknown> | null;
      if (block?.type === "tool_use" && typeof block.name === "string") {
        const rawInput = block.input;
        calls.push({
          toolName: block.name,
          arguments: rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>) : {}
        });
      }
    }
  }

  return calls;
}

function extractUsage(payload: unknown): AgentResponse["usage"] {
  if (!payload || typeof payload !== "object") return undefined;
  const usage = (payload as Record<string, unknown>).usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens;
  return {
    promptTokens: typeof promptTokens === "number" ? promptTokens : undefined,
    completionTokens: typeof completionTokens === "number" ? completionTokens : undefined
  };
}

function extractFinishReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  const choices = body.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const reason = (choices[0] as Record<string, unknown> | undefined)?.finish_reason;
    if (typeof reason === "string") return reason;
  }
  const stopReason = body.stop_reason;
  return typeof stopReason === "string" ? stopReason : undefined;
}

/** Builds the request body for the provider dialect in use. */
export function buildRequestBody(params: {
  model: string;
  prompt: string;
  openaiCompatible: boolean;
  tools?: AgentToolDefinition[];
}): Record<string, unknown> {
  const hasTools = params.tools !== undefined && params.tools.length > 0;

  if (params.openaiCompatible) {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      max_tokens: 1024,
      temperature: 0
    };
    if (hasTools) {
      body.tools = params.tools!.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description ?? "", parameters: tool.parameters }
      }));
      body.tool_choice = "auto";
    }
    return body;
  }

  // Anthropic messages dialect.
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: params.prompt }]
  };
  if (hasTools) {
    body.tools = params.tools!.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.parameters
    }));
  }
  return body;
}

/** Chat-completions path for the provider dialect in use. */
export function completionsPathFor(openaiCompatible: boolean): string {
  return openaiCompatible ? "/v1/chat/completions" : "/v1/messages";
}

/** Injected fetch is trusted: DNS is not pinned, response bodies are uncapped,
 * and the request timeout ends after response headers.
 */
class HttpAgentResponder implements AgentResponder {
  readonly target: AgentResponderTarget;
  private readonly workspace: string;
  private readonly auditAgentId: string | undefined;
  private readonly channel: "provider" | "bridge";
  private readonly headers: Record<string, string>;
  private readonly body: (prompt: string, tools?: AgentToolDefinition[]) => Record<string, unknown>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(params: {
    target: AgentResponderTarget;
    workspace: string;
    agentId: string | undefined;
    headers: Record<string, string>;
    openaiCompatible: boolean;
    timeoutMs: number;
    fetchImpl: typeof fetch;
  }) {
    this.target = params.target;
    this.workspace = params.workspace;
    this.auditAgentId = params.agentId;
    this.channel = params.target.transport === "direct" ? "provider" : "bridge";
    this.headers = params.headers;
    this.timeoutMs = params.timeoutMs;
    this.fetchImpl = params.fetchImpl;
    this.body = (prompt: string, tools?: AgentToolDefinition[]) =>
      buildRequestBody({
        model: params.target.model,
        prompt,
        openaiCompatible: params.openaiCompatible,
        tools
      });
  }

  async respond(prompt: string, options?: AgentRespondOptions): Promise<AgentResponse> {
    const endpoint = this.target.endpoint;
    const started = Date.now();
    let response: Response;
    try {
      response = await withTimeout(this.timeoutMs, (signal) => {
        const init: RequestInit = {
          method: "POST",
          headers: { "content-type": "application/json", ...this.headers },
          body: JSON.stringify(this.body(prompt, options?.tools)),
          redirect: "manual",
          signal
        };
        // Opaque prompts remain unclassified; the verified profile supplies jurisdiction facts.
        checkScopedEgress(this.workspace, this.channel, endpoint, {
          agentId: this.auditAgentId, dataClasses: null, purpose: null
        });
        return this.fetchImpl(endpoint, init);
      });
    } catch (error) {
      if (error instanceof EgressBlocked) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new AgentResponderInvocationError(
        `request to ${endpoint} failed: ${detail}`
      );
    }

    const latencyMs = Date.now() - started;
    const text = await response.text();

    if (!response.ok) {
      throw new AgentResponderInvocationError(
        `agent endpoint returned ${response.status}: ${text.slice(0, 400)}`,
        response.status
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AgentResponderInvocationError(
        `agent endpoint returned non-JSON payload: ${text.slice(0, 200)}`,
        response.status
      );
    }

    const toolCalls = extractToolCalls(parsed);
    const content = extractResponseText(parsed);
    // An agent that only issues tool calls legitimately returns no prose; that
    // is a measurable outcome, not a failed invocation.
    if (content === null && toolCalls.length === 0) {
      throw new AgentResponderInvocationError(
        "agent response contained no assistant text or tool calls; cannot score an empty answer"
      );
    }

    return {
      text: content ?? "",
      toolCalls,
      target: this.target,
      latencyMs,
      receiptId: response.headers.get("x-amc-request-receipt") ?? undefined,
      finishReason: extractFinishReason(parsed),
      usage: extractUsage(parsed)
    };
  }
}

async function gatewayReachable(endpoint: string, fetchImpl: typeof fetch, workspace: string, agentId: string | undefined): Promise<boolean> {
  try {
    return await withTimeout(2_000, async (signal) => {
      // Any HTTP answer proves the listener is up; a 401/404 still means "reachable".
      const init: RequestInit = { method: "GET", redirect: "manual", signal };
      checkScopedEgress(workspace, "bridge", endpoint, { agentId, dataClasses: null, purpose: null });
      await fetchImpl(endpoint, init);
      return true;
    });
  } catch (error) {
    if (error instanceof EgressBlocked) throw error;
    return false;
  }
}

/**
 * Builds a responder that invokes the real agent under test.
 *
 * @throws {AgentResponderUnavailableError} when no real target can be reached.
 */
export async function resolveAgentResponder(
  input: ResolveAgentResponderInput
): Promise<AgentResponder> {
  // Capture explicit scope and caller attribution before probing or awaiting any provider.
  const explicitWorkspace = input.workspace;
  const workspace = explicitWorkspace.trim() ? resolve(explicitWorkspace) : explicitWorkspace;
  const agentId = input.agentId;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new AgentResponderUnavailableError(
      "global fetch is unavailable in this runtime",
      "Run AMC on Node 20+ where fetch is built in, or pass an explicit fetch implementation."
    );
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // The parsed agent config names the provider; this loader does not verify its signature.
  // Unconfigured workspaces can still be scanned when the operator names the
  // endpoint explicitly, using an OpenAI-compatible shape.
  let agentConfig: Pick<ReturnType<typeof loadAgentConfig>, "id" | "provider">;
  try {
    agentConfig = loadAgentConfig(workspace, agentId);
  } catch {
    agentConfig = {
      id: agentId ?? "default",
      provider: {
        templateId: "openai",
        routePrefix: "/openai",
        upstreamId: "openai",
        baseUrl: "https://api.openai.com",
        openaiCompatible: true,
        auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
      }
    } as Pick<ReturnType<typeof loadAgentConfig>, "id" | "provider">;
  }

  const model = resolveModel(input.model, process.env);
  const provider = agentConfig.provider;
  const routePrefix = provider.routePrefix;
  const completionsPath = completionsPathFor(provider.openaiCompatible);

  // Preferred: through the AMC gateway, so the exchange becomes signed evidence.
  // A workspace without gateway config simply has no gateway to use; that is a
  // fallback condition, not a failure.
  let gatewayBase: string | null = null;
  try {
    const gatewayConfig = loadGatewayConfig(workspace);
    const gatewayHost = gatewayConfig.listen.host === "0.0.0.0" ? "127.0.0.1" : gatewayConfig.listen.host;
    gatewayBase = `http://${gatewayHost}:${gatewayConfig.listen.port}`;
  } catch {
    gatewayBase = null;
  }

  // An explicitly named endpoint always wins: if the operator pointed the scan
  // at a specific address, silently routing through the gateway instead would
  // scan the wrong target.
  const explicitEndpoint = process.env.AMC_AGENT_BASE_URL?.trim();
  const useGateway =
    !explicitEndpoint && gatewayBase !== null && (await gatewayReachable(gatewayBase, fetchImpl, workspace, agentId));

  if (useGateway && gatewayBase !== null) {
    const lease = issueLeaseToken({
      workspace,
      workspaceId: workspaceIdFromDirectory(workspace),
      agentId: agentConfig.id,
      ttlMs: LEASE_TTL_MS,
      scopes: ["gateway:llm"],
      routeAllowlist: [routePrefix],
      modelAllowlist: [model],
      maxRequestsPerMinute: LEASE_MAX_RPM,
      maxTokensPerMinute: LEASE_MAX_TPM,
      maxCostUsdPerDay: null
    });

    return new HttpAgentResponder({
      workspace,
      agentId,
      target: {
        agentId: agentConfig.id,
        transport: "gateway",
        endpoint: `${gatewayBase}${routePrefix}${completionsPath}`,
        model,
        routePrefix,
        upstreamId: provider.upstreamId,
        providerTemplateId: provider.templateId,
        trustTier: "OBSERVED"
      },
      headers: {
        authorization: `Bearer ${lease.token}`,
        "x-amc-lease": lease.token
      },
      openaiCompatible: provider.openaiCompatible,
      timeoutMs,
      fetchImpl
    });
  }

  // Fallback: straight to the provider, without the gateway's signed capture.
  const auth = provider.auth;
  const apiKeyEnv = "env" in auth && typeof auth.env === "string" ? auth.env : undefined;
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined;

  if (!apiKey || apiKey.trim().length === 0) {
    const reason = explicitEndpoint
      ? `AMC_AGENT_BASE_URL is set to ${explicitEndpoint} but ${apiKeyEnv ?? "the provider credential"} is not set`
      : `${gatewayBase === null ? "no gateway is configured for this workspace" : `the AMC gateway is not running at ${gatewayBase}`} and ${apiKeyEnv ?? "the provider credential"} is not set`;
    throw new AgentResponderUnavailableError(
      reason,
      `Start the gateway with 'amc up' (preferred — captures signed evidence), or export ${apiKeyEnv ?? "the provider API key"} to scan without evidence capture.`
    );
  }

  const headers: Record<string, string> =
    auth.type === "header_env"
      ? { [("header" in auth && typeof auth.header === "string" ? auth.header : "x-api-key")]: apiKey }
      : { authorization: `Bearer ${apiKey}` };

  // Operators may point a scan at a staging or self-hosted endpoint that speaks
  // the same dialect as the configured provider. This still requires a real,
  // reachable endpoint — it is an address override, not a stub.
  const effectiveBaseUrl = explicitEndpoint || provider.baseUrl;

  if (!provider.openaiCompatible) {
    headers["anthropic-version"] = process.env.ANTHROPIC_VERSION ?? "2023-06-01";
  }

  return new HttpAgentResponder({
    workspace,
    agentId,
    target: {
      agentId: agentConfig.id,
      transport: "direct",
      endpoint: `${effectiveBaseUrl.replace(/\/+$/, "")}${completionsPath}`,
      model,
      routePrefix,
      upstreamId: provider.upstreamId,
      providerTemplateId: provider.templateId,
      // AMC sends the request and captures the reply itself, so it observed the exchange (P0-18).
      trustTier: "OBSERVED"
    },
    headers,
    openaiCompatible: provider.openaiCompatible,
    timeoutMs,
    fetchImpl
  });
}
