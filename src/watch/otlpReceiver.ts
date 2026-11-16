/**
 * OTLP/HTTP JSON receiver (Watch): `POST /v1/traces`, `/v1/logs` and `/v1/metrics` on Studio, so an agent runtime that
 * exports OpenTelemetry connects by setting a few variables (`amc connect --print-env --runtime <runtime>`). OTLP
 * export is a POST from the agent (OTLP 1.11.1, "OTLP/HTTP", https://opentelemetry.io/docs/specs/otlp/, read
 * 2026-11-16); nothing here pulls.
 *
 * Trust: loopback only, behind an `hook:observe` lease whose route list covers `/hooks/otlp` (the lease is a signed
 * token, checked by signature, never by string comparison), rate-limited per lease. Every failed check answers 401
 * with no detail. Limits are applied before anything is stored: body size (also after gzip is inflated), records per
 * request, attributes per record and string length; over a limit answers 413 and stores nothing.
 * What arrives is what the runtime says about itself, so every row is SELF_REPORTED: AMC did not see the call. The
 * agent is always the lease's own; the ledger runtime is always "unknown"; the runtime the request names is kept only
 * as `reportedBy`. Privacy: digests only. Numbers, booleans and a short list of names (model, tool, event, status, ids)
 * are kept as printable ASCII; every other value is stored as its SHA-256 and length, never its text. The session id
 * is stored as the digest the hook observations use (`<runtime>\0<session id>`), so rows join on session, prompt id
 * and tool_use_id. JSON only: a protobuf body is answered 415 with the setting that fixes it.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { verifyBridgeLease } from "../bridge/bridgeAuth.js";
import { consumeObservedHookRateLimit } from "../bridge/hookIngress.js";
import { openLedger } from "../ledger/ledger.js";
import { isLoopback, readCappedBytes } from "../standards/acs/acsGuardianHttp.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

type OtlpSignal = "traces" | "logs" | "metrics";
const SIGNALS: Readonly<Record<string, OtlpSignal>> = { "/v1/traces": "traces", "/v1/logs": "logs", "/v1/metrics": "metrics" };
/** The lease route OTLP requests are checked against; a lease whose route list holds `/hooks` or `/hooks/otlp` covers it. */
export const OTLP_LEASE_ROUTE = "/hooks/otlp";
export const OTLP_LIMITS = Object.freeze({ bodyBytes: 1_048_576, records: 500, attributesPerRecord: 128, stringBytes: 16_384, depth: 12 });
export const isOtlpPath = (pathname: string): boolean => Object.hasOwn(SIGNALS, pathname);

/** Runtimes AMC names from the prefix of their own event, span and metric names (a label only: the request says so). */
const RUNTIME_PREFIXES: ReadonlyArray<readonly [string, string]> = [["claude_code.", "claude-code"], ["codex.", "codex"], ["gemini_cli.", "gemini-cli"]];
/** String attributes kept as sent when they are short printable text: names and ids, never content. */
const CLEAR_KEYS = new Set([
  "event.name", "prompt.id", "prompt_id", "tool_use_id", "tool_name", "decision", "source", "success", "status", "status_code", "type", "model",
  "agent_id", "parent_agent_id", "app.version", "terminal.type", "service.name", "service.version", "error.type",
  "gen_ai.operation.name", "gen_ai.provider.name", "gen_ai.system", "gen_ai.request.model", "gen_ai.response.model", "gen_ai.tool.name",
  "gen_ai.tool.call.id", "gen_ai.token.type",
]);
/** Counts and durations some runtimes send as text: kept when the text is a plain number. */
const NUMERIC_KEY = /(tokens|_count|_ms|_usd|_length|\.sequence)$/;
const SESSION_KEYS = ["session.id", "gen_ai.conversation.id", "conversation.id"];
const SAFE_TEXT = /^[\x21-\x7e][\x20-\x7e]{0,255}$/;
const SAFE_KEY = /^[A-Za-z0-9_.-]{1,128}$/;
const PLAIN_NUMBER = /^-?\d{1,18}(\.\d{1,9})?$/;

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(object) : []);
const text = (value: unknown): string | null => (typeof value === "string" && SAFE_TEXT.test(value) ? value : null);
const digestOf = (value: string): { sha256: string; length: number } => ({ sha256: sha256Hex(value), length: Buffer.byteLength(value, "utf8") });

/** One OTLP AnyValue as AMC stores it: typed numbers and booleans, allow-listed names, and a digest for everything else. */
function reported(key: string, raw: unknown): unknown {
  const value = object(raw);
  if (typeof value.boolValue === "boolean") return value.boolValue;
  if (value.intValue !== undefined || value.doubleValue !== undefined) {
    const number = Number(value.intValue ?? value.doubleValue);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof value.stringValue === "string") {
    if (CLEAR_KEYS.has(key) && SAFE_TEXT.test(value.stringValue)) return value.stringValue;
    if (NUMERIC_KEY.test(key) && PLAIN_NUMBER.test(value.stringValue)) return Number(value.stringValue);
    return digestOf(value.stringValue);
  }
  return digestOf(canonicalize(raw ?? null));
}

/** OTLP `attributes` as a flat map of raw AnyValues; a key that is not a plain dotted name is counted, never stored. */
function rawAttributes(...lists: unknown[]): { attrs: Map<string, unknown>; unreadableKeys: number } {
  const attrs = new Map<string, unknown>();
  let unreadableKeys = 0;
  for (const item of lists.flatMap(list)) {
    if (typeof item.key === "string" && SAFE_KEY.test(item.key)) attrs.set(item.key, item.value);
    else unreadableKeys += 1;
  }
  return { attrs, unreadableKeys };
}

interface OtlpRow {
  signal: OtlpSignal;
  name: string;
  /** The runtime the request names by its event prefix: what it says about itself, never a trust input. */
  reportedBy: string;
  sessionSha256: string | null;
  promptId: string | null;
  toolUseId: string | null;
  body: Json;
}

/** A log body that is an event name (`claude_code.user_prompt`): used to name the row only in that strict form, never as free text. */
const EVENT_NAME_BODY = /^(claude_code|codex|gemini_cli)\.[a-z0-9_.]{1,96}$/;

function row(signal: OtlpSignal, names: unknown[], attributeLists: unknown[], extra: Json, body?: unknown): OtlpRow {
  const { attrs, unreadableKeys } = rawAttributes(...attributeLists);
  const hint = typeof body === "string" && EVENT_NAME_BODY.test(body) ? [body] : [];
  const candidates = [...hint, ...names.map(text).filter((name): name is string => name !== null)];
  const known = RUNTIME_PREFIXES.flatMap(([prefix, runtime]) => {
    const name = candidates.find((candidate) => candidate.startsWith(prefix));
    return name ? [{ name, reportedBy: runtime }] : [];
  })[0] ?? { name: candidates[0] ?? "unreadable", reportedBy: "unknown" };
  const stringOf = (key: string): string | null => text(object(attrs.get(key)).stringValue);
  const session = SESSION_KEYS.map((key) => object(attrs.get(key)).stringValue).find((value): value is string => typeof value === "string" && value.length > 0);
  const attributes = Object.fromEntries([...attrs].filter(([key]) => !SESSION_KEYS.includes(key)).map(([key, value]) => [key, reported(key, value)]));
  const joins = { sessionSha256: session ? sha256Hex(`${known.reportedBy}\0${session}`) : null, promptId: stringOf("prompt.id") ?? stringOf("prompt_id"),
    toolUseId: stringOf("tool_use_id") ?? stringOf("gen_ai.tool.call.id") };
  return { signal, ...known, ...joins, body: { type: "OTLP_RECEIVED", claim: "self-reported", signal, name: known.name, reportedBy: known.reportedBy,
    ...joins, ...extra, attributes, ...(unreadableKeys > 0 ? { unreadableKeys } : {}) } };
}

const nanos = (value: unknown): string | null => (typeof value === "string" || typeof value === "number" ? text(String(value)) : null);

/** The records of one request in OTLP's nesting: one per span, log record or metric data point, with its resource. */
function records(signal: OtlpSignal, request: unknown): Array<{ record: Json; resource: Json; metric?: Json; kind?: string }> {
  const top = object(request);
  const out: Array<{ record: Json; resource: Json; metric?: Json; kind?: string }> = [];
  const [resources, scopes, items] = signal === "traces" ? ["resourceSpans", "scopeSpans", "spans"] as const
    : signal === "logs" ? ["resourceLogs", "scopeLogs", "logRecords"] as const : ["resourceMetrics", "scopeMetrics", "metrics"] as const;
  for (const resource of list(top[resources])) for (const scope of list(resource[scopes])) for (const item of list(scope[items])) {
    if (signal !== "metrics") { out.push({ record: item, resource }); continue; }
    const kind = ["sum", "gauge", "histogram", "exponentialHistogram", "summary"].find((key) => item[key] !== undefined) ?? "unknown";
    for (const point of list(object(item[kind]).dataPoints)) out.push({ record: point, resource, metric: item, kind });
  }
  return out;
}

/** Why the request is over a limit (strings and depth anywhere in it, attributes per record, record count), or null. */
function otlpLimitBreach(signal: OtlpSignal, request: unknown): string | null {
  const stack: Array<[unknown, number]> = [[request, 0]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (depth > OTLP_LIMITS.depth) return `nesting deeper than ${OTLP_LIMITS.depth}`;
    if (typeof value === "string" && Buffer.byteLength(value, "utf8") > OTLP_LIMITS.stringBytes) return `a string longer than ${OTLP_LIMITS.stringBytes} bytes`;
    if (value !== null && typeof value === "object") for (const item of Object.values(value)) stack.push([item, depth + 1]);
  }
  const found = records(signal, request);
  if (found.length > OTLP_LIMITS.records) return `more than ${OTLP_LIMITS.records} records`;
  const tooMany = found.some(({ record, resource }) => list(record.attributes).length + list(object(resource.resource).attributes).length > OTLP_LIMITS.attributesPerRecord);
  return tooMany ? `a record with more than ${OTLP_LIMITS.attributesPerRecord} attributes` : null;
}

/** The rows of one OTLP/HTTP JSON export request: one per span, log record or metric data point. Call otlpLimitBreach first. */
function otlpRows(signal: OtlpSignal, request: unknown): OtlpRow[] {
  return records(signal, request).map(({ record, resource, metric, kind }) => {
    const resourceAttrs = object(resource.resource).attributes;
    if (signal === "traces") {
      return row(signal, [record.name], [resourceAttrs, record.attributes], { traceId: text(record.traceId), spanId: text(record.spanId),
        parentSpanId: text(record.parentSpanId), startTimeUnixNano: nanos(record.startTimeUnixNano), endTimeUnixNano: nanos(record.endTimeUnixNano),
        statusCode: typeof object(record.status).code === "number" ? object(record.status).code : null });
    }
    if (signal === "logs") {
      const body = object(record.body).stringValue;
      const eventName = list(record.attributes).find((item) => item.key === "event.name");
      return row(signal, [record.eventName, object(eventName?.value).stringValue],[resourceAttrs, record.attributes], { timeUnixNano: nanos(record.timeUnixNano),
        severityText: text(record.severityText), bodyDigest: typeof body === "string" ? digestOf(body) : null }, body);
    }
    const value = Number(record.asInt ?? record.asDouble ?? record.sum);
    const count = Number(record.count);
    return row(signal, [metric!.name], [resourceAttrs, record.attributes], { metricKind: kind, unit: text(metric!.unit),
      value: Number.isFinite(value) ? value : null, count: Number.isFinite(count) && record.count !== undefined ? count : null, timeUnixNano: nanos(record.timeUnixNano) });
  });
}

/** Write the rows as SELF_REPORTED evidence in one sealed ledger session; a row already recorded (an exporter retry) is skipped. */
function recordOtlpRows(input: { workspace: string; agentId: string; leaseId: string; rows: OtlpRow[]; now?: number }): { recorded: number; duplicates: number } {
  const ledger = openLedger(input.workspace, process.env.AMC_NO_SIGN === "1" ? { store: "unsigned" } : {});
  try {
    const sessionId = `otlp-receiver-${randomUUID()}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-otlp-receiver", binarySha256: sha256Hex("amc-otlp-receiver") });
    const exists = ledger.db.prepare("SELECT 1 FROM evidence_events WHERE id = ? LIMIT 1");
    let recorded = 0;
    for (const item of input.rows) {
      const id = `otlp_${sha256Hex(canonicalize([input.agentId, item.body])).slice(0, 44)}`;
      if (exists.get(id)) continue;
      ledger.appendEvidence({ id, ts: input.now, sessionId, runtime: "unknown", eventType: "metric", payload: JSON.stringify(item.body), payloadExt: "json", inline: true,
        meta: { auditType: "OTLP_RECEIVED", trustTier: "SELF_REPORTED", claim: "self-reported", receiver: "otlp-http-json", agentId: input.agentId,
          leaseId: input.leaseId, signal: item.signal, name: item.name, reportedBy: item.reportedBy, sessionSha256: item.sessionSha256, promptId: item.promptId,
          toolUseId: item.toolUseId, rawPayloadStored: false } });
      recorded += 1;
    }
    ledger.sealSession(sessionId);
    return { recorded, duplicates: input.rows.length - recorded };
  } finally {
    ledger.close();
  }
}

function answer(res: ServerResponse, status: number, body: Json): true {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
  return true;
}

/** The request body, at most `max` bytes as read and (for gzip) after inflating; null when over. */
async function readBody(req: IncomingMessage, max: number, gzipped: boolean): Promise<Buffer | null> {
  const raw = await readCappedBytes(req, max);
  if (raw === null || !gzipped) return raw;
  try {
    return await promisify(gunzip)(raw, { maxOutputLength: max });
  } catch (error) {
    if (error instanceof RangeError || (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw Object.assign(new Error("not gzip"), { status: 400 });
  }
}

/**
 * Answer one OTLP/HTTP export request on Studio. Errors are JSON `{ code, message }`; 429 and 503 are retryable, as
 * OTLP defines. Nothing is stored unless every check and limit passed.
 */
export async function handleOtlpHttp(options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL; pathname: string }): Promise<true> {
  const { req, res, workspace } = options;
  const signal = SIGNALS[options.pathname]!;
  const refuse = (status: number, message: string): true => answer(res, status, { code: status, message });
  if (!isLoopback(req.socket.remoteAddress)) return refuse(403, "AMC's OTLP receiver accepts requests from this machine only.");
  const auth = verifyBridgeLease({ workspace, requestUrl: options.url, headers: req.headers, routePath: `${OTLP_LEASE_ROUTE}${options.pathname}`, requiredScope: "hook:observe" });
  if (!auth.ok || !auth.payload) return refuse(401, "Unauthorized");
  if ((req.method ?? "GET").toUpperCase() !== "POST") return refuse(405, "OTLP export is a POST; AMC's receiver answers nothing else on this path.");
  const type = String(req.headers["content-type"] ?? "");
  if (!/^application\/json\b/i.test(type)) {
    return refuse(415, "AMC's OTLP receiver reads JSON only. Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json in the agent's environment.");
  }
  const encoding = String(req.headers["content-encoding"] ?? "identity").toLowerCase();
  if (encoding !== "identity" && encoding !== "gzip") return refuse(415, "AMC's OTLP receiver reads plain or gzip bodies only.");
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > OTLP_LIMITS.bodyBytes) return refuse(413, "The OTLP request is larger than 1 MiB; lower the exporter's batch size.");
  try {
    const limit = consumeObservedHookRateLimit({ workspace, leaseId: auth.payload.leaseId, authenticatedAgentId: auth.payload.agentId,
      maxRequestsPerMinute: auth.payload.maxRequestsPerMinute, routePath: OTLP_LEASE_ROUTE });
    if (!limit.allowed) {
      res.setHeader("retry-after", String(limit.retryAfterSeconds));
      return refuse(429, "Too many OTLP requests for this lease; the exporter may retry later.");
    }
    let raw: Buffer | null;
    try { raw = await readBody(req, OTLP_LIMITS.bodyBytes, encoding === "gzip"); } catch { return refuse(400, "The OTLP request body is not valid gzip."); }
    if (raw === null) return refuse(413, "The OTLP request is larger than 1 MiB; lower the exporter's batch size.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")); } catch { return refuse(400, "The OTLP request body is not JSON."); }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return refuse(400, "The OTLP request body is not an export request.");
    const breach = otlpLimitBreach(signal, parsed);
    if (breach) return refuse(413, `The OTLP request has ${breach}; nothing was recorded. Lower the exporter's batch size.`);
    const rows = otlpRows(signal, parsed);
    if (rows.length > 0) recordOtlpRows({ workspace, agentId: auth.payload.agentId, leaseId: auth.payload.leaseId, rows });
    return answer(res, 200, {});
  } catch (error) {
    process.stderr.write(`[amc] OTLP receiver: ${error instanceof Error ? error.message.replace(/[^\x20-\x7e]/g, "?").slice(0, 300) : "error"}\n`);
    return refuse(503, "AMC could not record this OTLP request; the exporter may retry.");
  }
}
