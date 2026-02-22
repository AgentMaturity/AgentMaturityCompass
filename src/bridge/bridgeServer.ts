import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { openLedger, hashBinaryOrPath } from "../ledger/ledger.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { bridgeConfigSchema } from "./bridgeConfigSchema.js";
import { loadBridgeConfig, verifyBridgeConfigSignature } from "./bridgeConfigStore.js";
import { verifyBridgeLease } from "./bridgeAuth.js";
import { resolveBridgeRoute, buildModelIntent } from "./bridgeRoutes.js";
import { summarizeBridgeBody, bridgeSha256 } from "./bridgeRedaction.js";
import { appendBridgeAudit, appendBridgeOutputValidated, appendBridgeRequestReceipt, appendBridgeResponseReceipt } from "./bridgeReceipts.js";
import { appendBridgeTelemetryEvent, bridgeTelemetryEventSchema } from "./bridgeTelemetry.js";
import { enforceBridgePolicy } from "./bridgePolicyEnforcer.js";
import { preparePromptForBridgeRequest, validateBridgeResponseWithPromptPolicy } from "../prompt/promptPackApi.js";
import type { PromptPackProvider } from "../prompt/promptPackSchema.js";
import type { PromptPolicy } from "../prompt/promptPolicySchema.js";

interface HandleBridgeRequestOptions {
  workspace: string;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  maxRequestBytes: number;
  gatewayBaseUrl: string | null;
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readUpstreamBody(
  body: ReadableStream<Uint8Array> | null,
  onChunk?: (chunk: Buffer) => void | Promise<void>
): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value || value.byteLength === 0) {
      continue;
    }
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    if (onChunk) {
      await onChunk(chunk);
    }
  }
  return Buffer.concat(chunks);
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseJsonBody(body: Buffer): unknown {
  if (body.byteLength === 0) {
    return {};
  }
  return JSON.parse(body.toString("utf8")) as unknown;
}

function extractUsage(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const row = payload as Record<string, unknown>;
  if (row.usage && typeof row.usage === "object") {
    return row.usage as Record<string, unknown>;
  }
  if (row.usageMetadata && typeof row.usageMetadata === "object") {
    return row.usageMetadata as Record<string, unknown>;
  }
  return null;
}

function extractModel(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const row = payload as Record<string, unknown>;
  if (typeof row.model === "string") {
    return row.model;
  }
  if (typeof row.modelId === "string") {
    return row.modelId;
  }
  return null;
}

function promptProviderForBridge(provider: string): PromptPackProvider {
  if (provider === "openai" || provider === "anthropic" || provider === "gemini" || provider === "xai" || provider === "openrouter") {
    return provider;
  }
  return "generic";
}

function isStreamingBridgeRequest(req: IncomingMessage, body: unknown): boolean {
  const row = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  if (row?.stream === true) {
    return true;
  }
  const accept = req.headers.accept;
  const acceptValue = typeof accept === "string" ? accept : "";
  return acceptValue.toLowerCase().includes("text/event-stream");
}

export function shouldBlockStreamingForTruthguard(params: {
  streamPassthrough: boolean;
  promptPolicy: PromptPolicy | null;
}): boolean {
  if (!params.streamPassthrough || !params.promptPolicy) {
    return false;
  }
  return (
    params.promptPolicy.promptPolicy.truth.requireTruthguardForBridgeResponses === true &&
    params.promptPolicy.promptPolicy.truth.enforcementMode === "ENFORCE"
  );
}

function auditDeniedBridgeCall(params: {
  workspace: string;
  agentId: string;
  requestId: string;
  auditType: string;
  status: number;
  reason: string;
  provider: string | null;
}): void {
  const ledger = openLedger(params.workspace);
  const sessionId = `bridge-deny-${params.requestId}`;
  try {
    ledger.startSession({
      sessionId,
      runtime: "gateway",
      binaryPath: "amc-bridge",
      binarySha256: hashBinaryOrPath("amc-bridge", "1")
    });
    appendBridgeAudit({
      ledger,
      sessionId,
      auditType: params.auditType,
      severity: params.status >= 500 ? "HIGH" : params.status >= 400 ? "MEDIUM" : "LOW",
      details: {
        requestId: params.requestId,
        agentId: params.agentId,
        status: params.status,
        reason: params.reason,
        provider: params.provider
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

async function forwardToGateway(params: {
  gatewayBaseUrl: string;
  gatewayPath: string;
  search: string;
  method: string;
  requestBody: Buffer<ArrayBufferLike>;
  contentType: string | null;
  leaseToken: string;
  agentId: string;
  workOrderId: string | null;
  correlationId: string;
  runId: string;
}): Promise<{
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}> {
  const target = `${params.gatewayBaseUrl}${params.gatewayPath}${params.search}`;
  const headers = new Headers();
  headers.set("x-amc-lease", params.leaseToken);
  headers.set("x-amc-agent-id", params.agentId);
  headers.set("x-amc-correlation-id", params.correlationId);
  headers.set("x-amc-run-id", params.runId);
  if (params.workOrderId) {
    headers.set("x-amc-workorder-id", params.workOrderId);
  }
  if (params.contentType) {
    headers.set("content-type", params.contentType);
  }
  const response = await fetch(target, {
    method: params.method,
    headers,
    body: params.requestBody.byteLength > 0 ? new Uint8Array(params.requestBody) : undefined
  });
  return {
    status: response.status,
    headers: response.headers,
    body: response.body
  };
}

export async function handleBridgeRequest(options: HandleBridgeRequestOptions): Promise<boolean> {
  if (!options.pathname.startsWith("/bridge/")) {
    return false;
  }

  if (options.pathname === "/bridge/health") {
    if ((options.req.method ?? "GET").toUpperCase() !== "GET") {
      writeJson(options.res, 405, { error: "method not allowed" });
      return true;
    }
    writeJson(options.res, 200, { ok: true, status: "ok", ts: Date.now() });
    return true;
  }

  if (options.pathname === "/bridge/lease/verify") {
    if ((options.req.method ?? "POST").toUpperCase() !== "POST") {
      writeJson(options.res, 405, { error: "method not allowed" });
      return true;
    }
    let raw: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let parsed: unknown = {};
    try {
      raw = await readBody(options.req, options.maxRequestBytes);
      parsed = parseJsonBody(raw);
    } catch (error) {
      if (String(error).includes("PAYLOAD_TOO_LARGE")) {
        writeJson(options.res, 413, { error: "payload too large" });
        return true;
      }
      writeJson(options.res, 400, { error: `invalid bridge request: ${String(error)}` });
      return true;
    }
    const row = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const token = typeof row.token === "string" ? row.token.trim() : "";
    if (!token) {
      writeJson(options.res, 400, { error: "token is required" });
      return true;
    }
    const headers: Record<string, string | string[] | undefined> = {
      ...options.req.headers,
      authorization: `Bearer ${token}`
    };
    const verification = verifyBridgeLease({
      workspace: options.workspace,
      requestUrl: options.url,
      headers,
      model: null
    });
    if (!verification.ok || !verification.payload) {
      writeJson(options.res, verification.status, {
        ok: false,
        valid: false,
        error: verification.error ?? "invalid lease"
      });
      return true;
    }
    writeJson(options.res, 200, {
      ok: true,
      valid: true,
      leaseCarrier: verification.leaseCarrier ?? null,
      payload: {
        leaseId: verification.payload.leaseId,
        agentId: verification.payload.agentId,
        workspaceId: verification.payload.workspaceId,
        scopes: verification.payload.scopes,
        routeAllowlist: verification.payload.routeAllowlist,
        modelAllowlist: verification.payload.modelAllowlist,
        issuedTs: verification.payload.issuedTs,
        expiresTs: verification.payload.expiresTs,
        maxRequestsPerMinute: verification.payload.maxRequestsPerMinute,
        maxTokensPerMinute: verification.payload.maxTokensPerMinute,
        maxCostUsdPerDay: verification.payload.maxCostUsdPerDay
      }
    });
    return true;
  }

  if (options.pathname === "/bridge/evidence") {
    if ((options.req.method ?? "POST").toUpperCase() !== "POST") {
      writeJson(options.res, 405, { error: "method not allowed" });
      return true;
    }
    const auth = verifyBridgeLease({
      workspace: options.workspace,
      requestUrl: options.url,
      headers: options.req.headers,
      model: null
    });
    if (!auth.ok || !auth.payload) {
      writeJson(options.res, auth.status, { error: auth.error ?? "unauthorized" });
      return true;
    }
    try {
      const raw = await readBody(options.req, options.maxRequestBytes);
      const parsed = parseJsonBody(raw);
      const row = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const eventType = typeof row.event_type === "string" ? row.event_type.trim() : "";
      const sessionId = typeof row.session_id === "string" ? row.session_id.trim() : "";
      const payload = row.payload;
      if (!eventType || !sessionId || payload === undefined) {
        writeJson(options.res, 400, { error: "event_type, session_id, and payload are required" });
        return true;
      }
      const ledger = openLedger(options.workspace);
      try {
        try {
          ledger.startSession({
            sessionId,
            runtime: "any",
            binaryPath: "amc-wrap",
            binarySha256: hashBinaryOrPath("amc-wrap", "1")
          });
        } catch {
          // Session may already exist.
        }
        const eventId = ledger.appendEvidence({
          sessionId,
          runtime: "any",
          eventType: "agent_process_started",
          payload: JSON.stringify({
            event_type: eventType,
            payload
          }),
          payloadExt: "json",
          inline: false,
          meta: {
            trustTier: "OBSERVED",
            agentId: auth.payload.agentId
          }
        });
        writeJson(options.res, 200, { received: true, eventId, sessionId });
      } finally {
        ledger.close();
      }
    } catch (error) {
      if (String(error).includes("PAYLOAD_TOO_LARGE")) {
        writeJson(options.res, 413, { error: "payload too large" });
        return true;
      }
      writeJson(options.res, 400, { error: String(error) });
    }
    return true;
  }

  if (options.pathname === "/bridge/telemetry") {
    if ((options.req.method ?? "POST").toUpperCase() !== "POST") {
      writeJson(options.res, 405, { error: "method not allowed" });
      return true;
    }
    const auth = verifyBridgeLease({
      workspace: options.workspace,
      requestUrl: options.url,
      headers: options.req.headers,
      model: null
    });
    if (!auth.ok || !auth.payload) {
      writeJson(options.res, auth.status, { error: auth.error ?? "unauthorized" });
      return true;
    }
    try {
      const raw = await readBody(options.req, options.maxRequestBytes);
      const parsed = bridgeTelemetryEventSchema.parse(parseJsonBody(raw));
      const appended = appendBridgeTelemetryEvent({
        workspace: options.workspace,
        agentId: auth.payload.agentId,
        event: parsed
      });
      writeJson(options.res, 200, {
        ok: true,
        eventId: appended.eventId,
        sessionId: appended.sessionId
      });
    } catch (error) {
      if (String(error).includes("PAYLOAD_TOO_LARGE")) {
        writeJson(options.res, 413, { error: "payload too large" });
        return true;
      }
      writeJson(options.res, 400, { error: String(error) });
    }
    return true;
  }

  const route = resolveBridgeRoute(options.pathname);
  if (!route) {
    writeJson(options.res, 404, { error: "unknown bridge route" });
    return true;
  }
  if ((options.req.method ?? "POST").toUpperCase() !== "POST") {
    writeJson(options.res, 405, { error: "method not allowed" });
    return true;
  }

  const bridgeSig = verifyBridgeConfigSignature(options.workspace);
  if (bridgeSig.signatureExists && !bridgeSig.valid) {
    writeJson(options.res, 503, {
      error: "BRIDGE_CONFIG_UNTRUSTED",
      reason: bridgeSig.reason
    });
    return true;
  }
  const bridgeConfig = bridgeConfigSchema.parse(loadBridgeConfig(options.workspace));

  let requestBody: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let bodyJson: unknown = {};
  try {
    requestBody = await readBody(options.req, options.maxRequestBytes);
    bodyJson = parseJsonBody(requestBody);
  } catch (error) {
    if (String(error).includes("PAYLOAD_TOO_LARGE")) {
      writeJson(options.res, 413, { error: "payload too large" });
      return true;
    }
    writeJson(options.res, 400, { error: `invalid bridge request: ${String(error)}` });
    return true;
  }

  const intent = buildModelIntent(route, bodyJson);
  const lease = verifyBridgeLease({
    workspace: options.workspace,
    requestUrl: options.url,
    headers: options.req.headers,
    routePath: route.gatewayPath,
    model: intent.model
  });
  if (!lease.ok || !lease.payload || !lease.leaseToken) {
    const requestId = randomUUID();
    auditDeniedBridgeCall({
      workspace: options.workspace,
      requestId,
      agentId: "unknown",
      auditType: lease.auditType ?? "LEASE_INVALID_OR_MISSING",
      status: lease.status,
      reason: lease.error ?? "lease verification failed",
      provider: route.provider
    });
    writeJson(options.res, lease.status, { error: lease.error ?? "unauthorized" });
    return true;
  }

  const policy = enforceBridgePolicy({
    workspace: options.workspace,
    config: bridgeConfig,
    provider: route.provider,
    routePath: route.gatewayPath,
    model: intent.model,
    leaseVerification: {
      ok: true,
      payload: lease.payload
    }
  });
  if (!policy.ok) {
    const requestId = randomUUID();
    auditDeniedBridgeCall({
      workspace: options.workspace,
      requestId,
      agentId: lease.payload.agentId,
      auditType: policy.auditType ?? "BRIDGE_POLICY_DENIED",
      status: policy.status,
      reason: policy.reason ?? "bridge policy denied",
      provider: route.provider
    });
    writeJson(options.res, policy.status, { error: policy.reason ?? "bridge policy denied" });
    return true;
  }

  let preparedBodyJson: unknown = bodyJson;
  let preparedRequestBody = requestBody;
  let promptPolicy: PromptPolicy | null = null;
  let promptBinding:
    | {
        packSha256: string;
        packId: string;
        templateId: string;
        cgxPackSha256: string;
      }
    | null = null;
  let overrideMatches: string[] = [];

  const preparedPrompt = await preparePromptForBridgeRequest({
    workspace: options.workspace,
    agentId: lease.payload.agentId,
    provider: promptProviderForBridge(route.provider),
    requestKind: intent.requestKind,
    body: bodyJson
  });
  if (!preparedPrompt.ok) {
    const requestId = randomUUID();
    auditDeniedBridgeCall({
      workspace: options.workspace,
      requestId,
      agentId: lease.payload.agentId,
      auditType: preparedPrompt.code,
      status: preparedPrompt.status,
      reason: preparedPrompt.reasons.join("; ") || "prompt policy denied",
      provider: route.provider
    });
    if (preparedPrompt.code === "PROMPT_OVERRIDE_REJECTED") {
      appendTransparencyEntry({
        workspace: options.workspace,
        type: "PROMPT_OVERRIDE_ATTEMPT",
        agentId: lease.payload.agentId,
        artifact: {
          kind: "policy",
          sha256: bridgeSha256(Buffer.from(preparedPrompt.reasons.join(","), "utf8")),
          id: requestId
        }
      });
    }
    writeJson(options.res, preparedPrompt.status, {
      error: preparedPrompt.code,
      reasons: preparedPrompt.reasons
    });
    return true;
  }
  preparedBodyJson = preparedPrompt.body;
  preparedRequestBody = Buffer.from(JSON.stringify(preparedBodyJson));
  promptPolicy = preparedPrompt.policy;
  promptBinding = preparedPrompt.binding;
  overrideMatches = preparedPrompt.overrideMatches;
  appendTransparencyEntry({
    workspace: options.workspace,
    type: "PROMPT_PACK_ENFORCED",
    agentId: lease.payload.agentId,
    artifact: {
      kind: "policy",
      sha256: promptBinding.packSha256,
      id: promptBinding.packId
    }
  });

  if (!options.gatewayBaseUrl) {
    writeJson(options.res, 503, { error: "gateway unavailable" });
    return true;
  }

  const requestId = randomUUID();
  const correlationId = (options.req.headers["x-amc-correlation-id"] as string | undefined) ?? randomUUID();
  const runId = (options.req.headers["x-amc-run-id"] as string | undefined) ?? `run_${Date.now()}`;
  const started = Date.now();
  const sessionId = `bridge-${requestId}`;
  const ledger = openLedger(options.workspace);
  try {
    ledger.startSession({
      sessionId,
      runtime: "gateway",
      binaryPath: "amc-bridge",
      binarySha256: hashBinaryOrPath("amc-bridge", "1")
    });

    appendBridgeRequestReceipt({
      ledger,
      sessionId,
      agentId: lease.payload.agentId,
      payload: {
        requestId,
        correlationId,
        runId,
        provider: route.provider,
        model: intent.model,
        requestKind: intent.requestKind,
        leaseCarrier: lease.leaseCarrier ?? null,
        bodySha256: bridgeSha256(preparedRequestBody),
        promptPackSha256: promptBinding?.packSha256,
        promptPackId: promptBinding?.packId,
        promptTemplateId: promptBinding?.templateId,
        cgxPackSha256: promptBinding?.cgxPackSha256,
        summary: summarizeBridgeBody({
          payload: {
            model: intent.model,
            requestKind: intent.requestKind,
            messageCount: intent.messageCount,
            toolCount: intent.toolCount,
            temperature: intent.temperature,
            maxTokens: intent.maxTokens,
            promptPackId: promptBinding?.packId
          },
          maxChars: bridgeConfig.bridge.redaction.maxSummaryChars,
          redactPromptText: bridgeConfig.bridge.redaction.redactPromptText
        })
      }
    });
    if (overrideMatches.length > 0) {
      appendBridgeAudit({
        ledger,
        sessionId,
        auditType: "PROMPT_OVERRIDE_ATTEMPT",
        severity: "MEDIUM",
        details: {
          requestId,
          agentId: lease.payload.agentId,
          provider: route.provider,
          model: intent.model,
          overrideMatches
        }
      });
      appendTransparencyEntry({
        workspace: options.workspace,
        type: "PROMPT_OVERRIDE_ATTEMPT",
        agentId: lease.payload.agentId,
        artifact: {
          kind: "policy",
          sha256: bridgeSha256(Buffer.from(overrideMatches.join(","), "utf8")),
          id: requestId
        }
      });
    }

    const streamPassthrough = isStreamingBridgeRequest(options.req, preparedBodyJson);
    if (
      shouldBlockStreamingForTruthguard({
        streamPassthrough,
        promptPolicy
      })
    ) {
      appendBridgeAudit({
        ledger,
        sessionId,
        auditType: "BRIDGE_STREAM_VALIDATION_SKIPPED",
        severity: "HIGH",
        details: {
          requestId,
          agentId: lease.payload.agentId,
          provider: route.provider,
          model: intent.model,
          reason: "streaming disabled while truthguard enforcement mode is ENFORCE"
        }
      });
      ledger.sealSession(sessionId);
      writeJson(options.res, 400, {
        error: "STREAMING_TRUTHGUARD_ENFORCE_CONFLICT",
        reason: "Disable streaming or set promptPolicy.truth.enforcementMode to WARN/OFF."
      });
      return true;
    }

    const response = await forwardToGateway({
      gatewayBaseUrl: options.gatewayBaseUrl,
      gatewayPath: route.gatewayPath,
      search: options.url.search,
      method: "POST",
      requestBody: preparedRequestBody,
      contentType: typeof options.req.headers["content-type"] === "string" ? options.req.headers["content-type"] : null,
      leaseToken: lease.leaseToken,
      agentId: lease.payload.agentId,
      workOrderId: lease.payload.workOrderId ?? null,
      correlationId,
      runId
    });

    if (streamPassthrough) {
      options.res.statusCode = response.status;
      const contentType = response.headers.get("content-type");
      if (contentType) {
        options.res.setHeader("content-type", contentType);
      }
      const upstreamTrailer = response.headers.get("trailer");
      options.res.setHeader(
        "Trailer",
        typeof upstreamTrailer === "string" && upstreamTrailer.trim().length > 0
          ? `${upstreamTrailer}, x-amc-receipt-trailer`
          : "x-amc-receipt-trailer"
      );
      options.res.setHeader("x-amc-receipt-mode", "trailer");
      options.res.setHeader("x-amc-bridge-request-id", requestId);
      options.res.setHeader("x-amc-correlation-id", correlationId);
      if (promptBinding) {
        options.res.setHeader("x-amc-prompt-pack-sha256", promptBinding.packSha256);
        options.res.setHeader("x-amc-prompt-pack-id", promptBinding.packId);
      }

      const streamedBody = await readUpstreamBody(response.body, async (chunk) => {
        if (!options.res.write(chunk)) {
          await once(options.res, "drain");
        }
      });
      let responseJson: unknown = {};
      try {
        responseJson = streamedBody.byteLength > 0 ? JSON.parse(streamedBody.toString("utf8")) : {};
      } catch {
        responseJson = {};
      }
      const usage = extractUsage(responseJson);
      const responseModel = extractModel(responseJson) ?? intent.model;

      if (promptPolicy) {
        appendBridgeAudit({
          ledger,
          sessionId,
          auditType: "BRIDGE_STREAM_VALIDATION_SKIPPED",
          severity: "LOW",
          details: {
            requestId,
            agentId: lease.payload.agentId,
            provider: route.provider,
            model: responseModel,
            reason: "streaming passthrough"
          }
        });
      }

      const responseReceipt = appendBridgeResponseReceipt({
        ledger,
        sessionId,
        agentId: lease.payload.agentId,
        payload: {
          requestId,
          correlationId,
          runId,
          provider: route.provider,
          model: responseModel,
          statusCode: response.status,
          usage,
          bodySha256: bridgeSha256(streamedBody),
          promptPackSha256: promptBinding?.packSha256,
          promptPackId: promptBinding?.packId,
          promptTemplateId: promptBinding?.templateId,
          cgxPackSha256: promptBinding?.cgxPackSha256,
          durationMs: Date.now() - started,
          summary: summarizeBridgeBody({
            payload: {
              statusCode: response.status,
              model: responseModel,
              usage,
              promptPackId: promptBinding?.packId
            },
            maxChars: bridgeConfig.bridge.redaction.maxSummaryChars,
            redactPromptText: true
          })
        }
      });

      ledger.sealSession(sessionId);
      options.res.addTrailers({
        "x-amc-receipt-trailer": responseReceipt.receipt
      });
      options.res.end();
      return true;
    }

    const responseBody = await readUpstreamBody(response.body);
    let responseJson: unknown = {};
    try {
      responseJson = responseBody.byteLength > 0 ? JSON.parse(responseBody.toString("utf8")) : {};
    } catch {
      responseJson = {};
    }
    const usage = extractUsage(responseJson);
    const responseModel = extractModel(responseJson) ?? intent.model;
    let finalStatus = response.status;
    let finalBody = responseBody;
    if (promptPolicy) {
      const truthguard = validateBridgeResponseWithPromptPolicy({
        workspace: options.workspace,
        provider: promptProviderForBridge(route.provider),
        responseBody: responseJson,
        policy: promptPolicy
      });
      appendBridgeOutputValidated({
        ledger,
        sessionId,
        agentId: lease.payload.agentId,
        payload: {
          requestId,
          correlationId,
          runId,
          provider: route.provider,
          model: responseModel,
          status: truthguard.result.status,
          reasons: truthguard.result.reasons,
          missingEvidenceRefs: truthguard.result.missingEvidenceRefs,
          violationCount: truthguard.result.violations.length,
          promptPackSha256: promptBinding?.packSha256,
          promptPackId: promptBinding?.packId,
          promptTemplateId: promptBinding?.templateId,
          cgxPackSha256: promptBinding?.cgxPackSha256
        }
      });
      if (truthguard.result.status === "FAIL") {
        appendBridgeAudit({
          ledger,
          sessionId,
          auditType: "OUTPUT_CONTRACT_VIOLATION",
          severity: truthguard.shouldBlock ? "HIGH" : "MEDIUM",
          details: {
            requestId,
            agentId: lease.payload.agentId,
            provider: route.provider,
            model: responseModel,
            reasons: truthguard.result.reasons,
            missingEvidenceRefs: truthguard.result.missingEvidenceRefs
          }
        });
      }
      if (truthguard.shouldBlock) {
        finalStatus = 422;
        finalBody = Buffer.from(
          JSON.stringify({
            error: {
              code: "OUTPUT_CONTRACT_VIOLATION",
              reasons: truthguard.result.reasons,
              missingEvidenceRefs: truthguard.result.missingEvidenceRefs,
              suggestedFix: "Return amc.output.v1 JSON with evidenceRefs for strong claims or explicit UNKNOWN."
            }
          }),
          "utf8"
        );
      }
    }

    const responseReceipt = appendBridgeResponseReceipt({
      ledger,
      sessionId,
      agentId: lease.payload.agentId,
      payload: {
        requestId,
        correlationId,
        runId,
        provider: route.provider,
        model: responseModel,
        statusCode: finalStatus,
        usage,
        bodySha256: bridgeSha256(finalBody),
        promptPackSha256: promptBinding?.packSha256,
        promptPackId: promptBinding?.packId,
        promptTemplateId: promptBinding?.templateId,
        cgxPackSha256: promptBinding?.cgxPackSha256,
        durationMs: Date.now() - started,
        summary: summarizeBridgeBody({
          payload: {
            statusCode: finalStatus,
            model: responseModel,
            usage,
            promptPackId: promptBinding?.packId
          },
          maxChars: bridgeConfig.bridge.redaction.maxSummaryChars,
          redactPromptText: true
        })
      }
    });

    ledger.sealSession(sessionId);

    options.res.statusCode = finalStatus;
    if (finalStatus === 422) {
      options.res.setHeader("content-type", "application/json; charset=utf-8");
    } else {
      const contentType = response.headers.get("content-type");
      if (contentType) {
        options.res.setHeader("content-type", contentType);
      }
    }
    options.res.setHeader("x-amc-bridge-request-id", requestId);
    options.res.setHeader("x-amc-correlation-id", correlationId);
    options.res.setHeader("x-amc-receipt", responseReceipt.receipt);
    if (promptBinding) {
      options.res.setHeader("x-amc-prompt-pack-sha256", promptBinding.packSha256);
      options.res.setHeader("x-amc-prompt-pack-id", promptBinding.packId);
    }
    options.res.end(finalBody);
  } catch (error) {
    appendBridgeAudit({
      ledger,
      sessionId,
      auditType: "BRIDGE_UPSTREAM_FAILURE",
      severity: "HIGH",
      details: {
        requestId,
        provider: route.provider,
        error: String(error),
        agentId: lease.payload.agentId
      }
    });
    ledger.sealSession(sessionId);
    writeJson(options.res, 502, { error: "bridge upstream failure" });
  } finally {
    ledger.close();
  }
  return true;
}

export async function startBridgeServer(params: {
  workspace: string;
  host: string;
  port: number;
  gatewayBaseUrl: string;
  maxRequestBytes?: number;
}): Promise<{
  server: Server;
  close: () => Promise<void>;
}> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${params.host}:${params.port}`);
    const handled = await handleBridgeRequest({
      workspace: params.workspace,
      req,
      res,
      url,
      pathname: url.pathname,
      maxRequestBytes: params.maxRequestBytes ?? 1_048_576,
      gatewayBaseUrl: params.gatewayBaseUrl
    });
    if (!handled) {
      writeJson(res, 404, { error: "not found" });
    }
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(params.port, params.host, () => resolvePromise());
  });
  return {
    server,
    close: async () => {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  };
}
