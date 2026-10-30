/**
 * AMC as an OWASP Agent Control Standard (ACS) v0.1 guardian for the hooks it can serve (P2-19). One JSON-RPC 2.0
 * request in, one JSON-RPC 2.0 response out. `steps/toolCallRequest` is decided by AMC's existing hook control path
 * (hookControlRoute.ts: signed ToolHub, Action and Approval policy, P1-02 authorization record, signed receipt); this
 * module only translates. Every other hook is answered "unsupported", never allow. Field names and codes come from the
 * pinned ACS release only: docs/source-reviews/P2-19-owasp-acs.md. AMC implements these hooks; it claims no ACS
 * conformance (docs/standards/ACS.md).
 */
import { z } from "zod";
import { handleHookControlRequest } from "../../bridge/hookControlRoute.js";
import type { ProviderHookControlResult } from "../../bridge/hookControl.js";
import { assertUnambiguousJson, HookControlError } from "../../bridge/hookProviders.js";
import type { HookLease } from "../../bridge/hookAuthorization.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { ACS_TOOL_CALL_METHOD } from "./acsProvider.js";

/** The ACS version AMC speaks: the v0.1.0 wire contract of the pinned release; any 0.1.z request is read as it. */
const ACS_VERSION = "0.1.0";
const SUPPORTED_VERSION = /^0\.1\.\d+$/;
/** ACS §10.3's RECOMMENDED skew window, which AMC also announces in its ServerHello. */
const ACS_SKEW_WINDOW_MS = 300_000;
/** The only methods AMC evaluates (ServerHello.methods_evaluated). */
const ACS_EVALUATED_METHODS: readonly string[] = [ACS_TOOL_CALL_METHOD];

/** JSON-RPC 2.0 codes and ACS §17.1's registry, as the pinned release names them. */
export const ACS_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  SESSION_REFUSED: -32000,
  UNSUPPORTED_VERSION: -32001,
  CAPABILITY_NOT_NEGOTIATED: -32003,
  REPLAY_DETECTED: -32005,
  TIMESTAMP_OUT_OF_WINDOW: -32006,
} as const;

type JsonRpcId = string | number | null;
export type AcsResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: Record<string, unknown> } };

const METHOD = /^(steps\/|protocols\/|agbom\/|trace\/|system\/|handshake\/|wrapped:).+/;
const envelopeSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  id: z.union([z.string(), z.number()]),
  params: z.record(z.string(), z.unknown()),
});
const paramsSchema = z.object({
  acs_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  request_id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  nonce: z.string().min(16).max(64).optional(),
  tenant_id: z.string().optional(),
  metadata: z.object({ agent_id: z.string().min(1), session_id: z.string().uuid() }).passthrough(),
  payload: z.record(z.string(), z.unknown()),
}).passthrough();
type AcsParams = z.infer<typeof paramsSchema>;
const clientHelloSchema = z.object({
  acs_versions_supported: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)).min(1),
  methods_implemented: z.array(z.string().regex(METHOD)),
  transports_supported: z.array(z.enum(["http", "https", "stdio"])).min(1),
  provenance_producer: z.enum(["deterministic", "none"]),
}).passthrough();
const toolCallRequestSchema = z.object({
  tool: z.object({ name: z.string().min(1).max(512) }).passthrough(),
  arguments: z.record(z.string(), z.object({ value: z.unknown() }).passthrough()),
  operation: z.string().optional(),
  raw_command: z.string().optional(),
}).passthrough();

const fail = (id: JsonRpcId, code: number, message: string, data?: Record<string, unknown>): AcsResponse =>
  ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

/**
 * The ACS decision for an AMC outcome. Only an AMC allow is an ACS allow; every other value, including one this
 * module does not know, is deny (fail closed).
 */
export function toAcsDecision(outcome: unknown): "allow" | "deny" {
  return outcome === "allow" ? "allow" : "deny";
}

/** Answer one ACS request from the agent the hook lease authenticated. */
export function handleAcsGuardianRequest(input: { workspace: string; authenticatedAgentId: string; lease?: HookLease; rawBody: string; now?: number }):
  AcsResponse {
  let body: unknown;
  try {
    body = JSON.parse(input.rawBody) as unknown;
  } catch {
    return fail(null, ACS_ERRORS.PARSE_ERROR, "Parse error");
  }
  try {
    assertUnambiguousJson(input.rawBody);
  } catch {
    return fail(null, ACS_ERRORS.INVALID_REQUEST, "request contains duplicate JSON keys");
  }
  if (Array.isArray(body)) return fail(null, ACS_ERRORS.INVALID_REQUEST, "AMC does not accept JSON-RPC batches; send requests one at a time");
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    const id = (body as { id?: unknown } | null)?.id;
    return fail(typeof id === "string" || typeof id === "number" ? id : null, ACS_ERRORS.INVALID_REQUEST, "not an ACS request envelope");
  }
  const { id, method } = envelope.data;
  if (!METHOD.test(method)) return fail(id, ACS_ERRORS.METHOD_NOT_FOUND, "Method not found");
  const parsed = paramsSchema.safeParse(envelope.data.params);
  if (!parsed.success) return fail(id, ACS_ERRORS.INVALID_PARAMS, "Invalid params", { reason: parsed.error.issues[0]?.path.join(".") ?? "params" });
  const params = parsed.data;
  // ACS §13: system/ping is answered before any ACS-specific check and never returns an ACS-specific error.
  if (method === "system/ping") return ping(id, params, input.now);
  const refusal = sessionRefusal(id, params, input.authenticatedAgentId, input.now ?? Date.now());
  if (refusal) return refusal;
  if (method === "handshake/hello") return hello(id, params);
  if (method === ACS_TOOL_CALL_METHOD) return toolCallRequest(id, params, input);
  return fail(id, ACS_ERRORS.CAPABILITY_NOT_NEGOTIATED, "AMC does not evaluate this ACS method", { reason: "unsupported", method });
}

function ping(id: JsonRpcId, params: AcsParams, now = Date.now()): AcsResponse {
  const echo = typeof params.payload.echo === "string" ? params.payload.echo.slice(0, 256) : undefined;
  return { jsonrpc: "2.0", id, result: { type: "final", acs_version: ACS_VERSION, request_id: params.request_id, decision: "allow",
    payload: { status: "ok", ...(echo === undefined ? {} : { echo }), server_timestamp: new Date(now).toISOString() } } };
}

/** Version, clock skew (ACS §10.3) and identity: the lease names the agent, and a request naming another is refused. */
function sessionRefusal(id: JsonRpcId, params: AcsParams, agentId: string, now: number): AcsResponse | null {
  if (!SUPPORTED_VERSION.test(params.acs_version)) {
    return fail(id, ACS_ERRORS.UNSUPPORTED_VERSION, "UNSUPPORTED_VERSION", { reason: "unsupported_version", supported_versions: [ACS_VERSION] });
  }
  if (Math.abs(now - Date.parse(params.timestamp)) > ACS_SKEW_WINDOW_MS) {
    return fail(id, ACS_ERRORS.TIMESTAMP_OUT_OF_WINDOW, "TIMESTAMP_OUT_OF_WINDOW", { reason: "timestamp_out_of_window", skew_window_ms: ACS_SKEW_WINDOW_MS });
  }
  if (params.metadata.agent_id !== agentId) {
    return fail(id, ACS_ERRORS.SESSION_REFUSED, "SESSION_REFUSED", { reason: "agent_id_mismatch", message: "metadata.agent_id is not the agent the AMC hook lease names" });
  }
  return null;
}

/** ACS §4: AMC's ServerHello. It evaluates toolCallRequest only, verifies no ACS signature and accepts no profile. */
function hello(id: JsonRpcId, params: AcsParams): AcsResponse {
  const client = clientHelloSchema.safeParse(params.payload);
  if (!client.success) return fail(id, ACS_ERRORS.INVALID_PARAMS, "Invalid params", { reason: "payload is not a ClientHello" });
  if (!client.data.acs_versions_supported.some((version) => SUPPORTED_VERSION.test(version))) {
    return fail(id, ACS_ERRORS.UNSUPPORTED_VERSION, "UNSUPPORTED_VERSION", { reason: "unsupported_version", supported_versions: [ACS_VERSION] });
  }
  if (!client.data.transports_supported.includes("http")) {
    return fail(id, ACS_ERRORS.SESSION_REFUSED, "SESSION_REFUSED", { reason: "transport_unsupported", message: "AMC serves ACS over loopback HTTP only" });
  }
  return { jsonrpc: "2.0", id, result: {
    negotiated_version: ACS_VERSION,
    methods_evaluated: client.data.methods_implemented.filter((method) => ACS_EVALUATED_METHODS.includes(method)),
    selected_transport: "http",
    signature_algorithms_supported: [],
    timeout_config: { default_ms: 10_000 },
    skew_window_ms: ACS_SKEW_WINDOW_MS,
    on_decision_failure: "deny",
    approver_types_supported: [],
    policy_requires_provenance: false,
    profiles_accepted: [],
  } };
}

/** The provider input AMC's control path decides for one ACS tool call (acsProvider.ts reads its `acs` context). */
export function acsProviderInput(params: AcsParams, payload: z.infer<typeof toolCallRequestSchema>): string {
  const { signature: _signature, ...signed } = params as AcsParams & { signature?: unknown };
  return canonicalize({
    hook_event_name: ACS_TOOL_CALL_METHOD,
    tool_name: payload.tool.name,
    tool_input: Object.fromEntries(Object.entries(payload.arguments).map(([name, argument]) => [name, argument.value])),
    acs: {
      version: params.acs_version,
      sessionId: params.metadata.session_id,
      requestId: params.request_id,
      paramsSha256: sha256Hex(canonicalize(signed)),
      unevaluable: (["raw_command", "operation"] as const).filter((field) => payload[field] !== undefined),
    },
  });
}

function toolCallRequest(id: JsonRpcId, params: AcsParams, input: { workspace: string; authenticatedAgentId: string; lease?: HookLease }): AcsResponse {
  const payload = toolCallRequestSchema.safeParse(params.payload);
  if (!payload.success) return fail(id, ACS_ERRORS.INVALID_PARAMS, "Invalid params", { reason: "payload is not a toolCallRequest" });
  const final = (fields: Record<string, unknown>): AcsResponse =>
    ({ jsonrpc: "2.0", id, result: { type: "final", acs_version: ACS_VERSION, request_id: params.request_id, ...fields, metadata: { evaluator: "deterministic" } } });
  let decided: ProviderHookControlResult;
  try {
    decided = handleHookControlRequest({ workspace: input.workspace, authenticatedAgentId: input.authenticatedAgentId, provider: "acs",
      lease: input.lease, rawInput: acsProviderInput(params, payload.data) }) as ProviderHookControlResult;
  } catch (error) {
    if (error instanceof HookControlError && error.statusCode === 409) {
      return fail(id, ACS_ERRORS.REPLAY_DETECTED, "REPLAY_DETECTED", { reason: "replay_conflict", message: error.message });
    }
    if (error instanceof HookControlError && error.statusCode < 500 && error.statusCode !== 429) {
      return fail(id, ACS_ERRORS.INVALID_PARAMS, "Invalid params", { reason: error.code, message: error.message });
    }
    // No decision could be recorded: AMC answers deny rather than an error the runtime may fail open on (ACS §6.4). Only
    // a HookControlError's own message reaches the caller, as on the generic route; any other detail stays in local stderr.
    if (!(error instanceof HookControlError)) process.stderr.write(`[amc] ACS guardian: ${error instanceof Error ? error.message : String(error)}\n`);
    return final({ decision: "deny", reasoning: `AMC could not record a decision, so it denied the call${error instanceof HookControlError ? `: ${error.message}` : "."}`,
      reason_codes: ["amc_decision_unrecorded"] });
  }
  // ACS §10.3: a duplicate request_id within the session is rejected, even when AMC holds its earlier decision.
  if (decided.idempotentReplay) return fail(id, ACS_ERRORS.REPLAY_DETECTED, "REPLAY_DETECTED", { reason: "duplicate_request_id" });
  const response = decided.providerResponse as { decision?: unknown; reasoning?: string; reason_codes?: string[] };
  return final({
    decision: toAcsDecision(response.decision),
    reasoning: response.reasoning ?? decided.reason,
    ...(response.reason_codes ? { reason_codes: response.reason_codes } : {}),
    policy_data: { amc: { actionId: decided.actionId, eventId: decided.eventId, requestedDecision: decided.requestedDecision,
      capabilityLossy: decided.capabilityLossy, receipt: decided.receipt, receiptId: decided.receiptId, receiptSha256: decided.receiptSha256 } },
  });
}
