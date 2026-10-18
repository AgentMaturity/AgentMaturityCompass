import { decodedFinds, keyedSpan, MAX_PROTECTED_TEXT_CHARS, MAX_REQUEST_SCAN_CHARS, nestedJsonRedactor, redactJsonLeaves,
  redactProtectedText, secretMember } from "../dataflow/detectors.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { sha256Hex } from "../utils/hash.js";
import type { GatewayConfig } from "./config.js";

export interface RedactionResult {
  redactedBytes: Buffer;
  wasRedacted: boolean;
  redactionReasons: string[];
  originalPayloadSha256: string | null;
  originalHashOmitted: boolean;
}

function buildRegex(pattern: string): RegExp {
  const trimmed = pattern.trim();
  if (trimmed.startsWith("(?i)")) {
    return new RegExp(trimmed.slice(4), "gi");
  }
  return new RegExp(trimmed, "g");
}

/** Headers and query keys that carry an agent's credential or lease; the gateway strips them before forwarding. */
export const AGENT_AUTH_HEADER_KEYS = [
  "x-amc-lease",
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "api-key",
  "x-openai-key",
  "x-anthropic-api-key"
] as const;
export const AGENT_AUTH_QUERY_KEYS = ["key", "api_key", "api-key", "access_token", "amc_lease"] as const;
// Never stored, whatever the configured denylist says: the credential carriers, proxy and cloud session credentials,
// session cookies, and any header whose name ends in a credential word (x-auth-token, helicone-auth, x-portkey-api-key).
const ALWAYS_REDACTED_HEADER_KEYS: readonly string[] = [...AGENT_AUTH_HEADER_KEYS, "proxy-authorization", "x-amz-security-token",
  "cookie", "set-cookie"];
const CREDENTIAL_HEADER_NAME = /(?:^|-)(?:token|secret|auth|session|password|api-?key)$/;

/**
 * The header values a gateway row stores. The denylist, the always-redacted names above and credential-named headers
 * become `[REDACTED]`. Every other value gets the shared secret table and the configured `textRegexDenylist` in every
 * workspace, and, where the workspace opted in (`protectedData`), the protected-data detectors as a stored text is
 * (the header name as its member name); a value whose scan fails is replaced whole. `redactionReasons` lists what changed.
 */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
  denylist: string[],
  options: { readonly textRegexDenylist?: readonly string[]; readonly protectedData?: boolean } = {}
): { headers: Record<string, string>; wasRedacted: boolean; redactionReasons: string[] } {
  const deny = new Set([...denylist, ...ALWAYS_REDACTED_HEADER_KEYS].map((key) => key.toLowerCase()));
  const out = Object.create(null) as Record<string, string>;
  const reasons = new Set<string>();
  const unscanned = () => { reasons.add("protectedData:unscanned"); return "[REDACTED]"; };
  const scan = options.protectedData ? nestedJsonRedactor(protectedRedactor(reasons), unscanned) : undefined;
  let redacted = false;

  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    const normalized = Array.isArray(value) ? value.join(",") : value ?? "";
    if (deny.has(key) || CREDENTIAL_HEADER_NAME.test(key)) {
      out[rawKey] = "[REDACTED]";
      redacted = true;
      continue;
    }
    let stored = redactSecrets(normalized, () => "[REDACTED]").redacted;
    if (stored !== normalized) reasons.add("secretPattern");
    const regexResult = applyTextRegexRedaction(stored, options.textRegexDenylist ?? []);
    regexResult.reasons.forEach((reason) => reasons.add(reason));
    stored = regexResult.value;
    if (scan) {
      try { stored = scan(stored, key); } catch { stored = unscanned(); }
    }
    redacted ||= stored !== normalized;
    out[rawKey] = stored;
  }

  return { headers: out, wasRedacted: redacted, redactionReasons: [...reasons].sort() };
}

function applyJsonPathRedaction(obj: unknown, jsonPaths: string[]): { changed: boolean; value: unknown } {
  if (!obj || typeof obj !== "object") {
    return { changed: false, value: obj };
  }

  let changed = false;
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

  for (const path of jsonPaths) {
    const parts = path.replace(/^\$\./, "").split(".").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let cursor: unknown = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!cursor || typeof cursor !== "object") {
        cursor = null;
        break;
      }
      const part = parts[i];
      if (!part) {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    if (cursor && typeof cursor === "object") {
      const key = parts[parts.length - 1];
      if (!key) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(cursor, key)) {
        (cursor as Record<string, unknown>)[key] = "[REDACTED]";
        changed = true;
      }
    }
  }

  return { changed, value: clone };
}

function applyTextRegexRedaction(text: string, patterns: readonly string[]): { changed: boolean; value: string; reasons: string[] } {
  let current = text;
  let changed = false;
  const reasons: string[] = [];

  for (const pattern of patterns) {
    const re = buildRegex(pattern);
    const before = current;
    current = current.replace(re, "[REDACTED]");
    if (current !== before) {
      changed = true;
      reasons.push(`textRegex:${pattern}`);
    }
  }

  return { changed, value: current, reasons };
}

class ScanBudgetExceeded extends Error {}

/**
 * The protected-data detectors (P2-02), as the native session uses them, over stored gateway evidence, in a workspace that
 * opted in (a processor registry or its `.sig` exists). A detected value becomes `[REDACTED]` (no key or token here, so
 * nothing is restorable). A text over the detectors' per-leaf limit is replaced whole, and once one body's scanned keys and
 * leaves pass the request-wide scan budget the whole body is: never stored unscanned. So is a JSON integer that parsing
 * rounded (a 17-19 digit card number sent as a number), whose digits can no longer be checked. A member's value is also
 * checked with its name (`key`): a secret name (`secretMember`) or a detection only the name beside it shows (`keyedSpan`)
 * replaces it whole.
 * ponytail: the budget is the native path's (16 MiB), so hostile text (IBAN-shaped words) can still hold the event loop
 * for about 10 s per body before the whole body is replaced; a smaller gateway budget trades that for whole-body
 * replacement of large ordinary bodies.
 */
function protectedRedactor(reasons: Set<string>): (text: string, key?: string) => string {
  let scanned = 0;
  const charge = (length: number) => { scanned += length; if (scanned > MAX_REQUEST_SCAN_CHARS) throw new ScanBudgetExceeded(); };
  return (text, key) => {
    if (text.length > MAX_PROTECTED_TEXT_CHARS) { reasons.add("protectedData:unscanned"); return "[REDACTED]"; }
    charge(text.length);
    if (secretMember(key, text)) { reasons.add("protectedData:credential"); return "[REDACTED]"; }
    const redacted = redactProtectedText(text, (region) => { reasons.add(`protectedData:${region.dataClass}`); return "[REDACTED]"; }).text;
    const keyed = keyedSpan(key, redacted, undefined, charge);
    if (keyed === undefined) return redacted;
    reasons.add(`protectedData:${keyed.dataClass}`);
    return "[REDACTED]";
  };
}

/** The whole stored body replaced, as a JSON string so a JSON body still parses. */
function unscannedJsonBody(): RedactionResult {
  return { redactedBytes: Buffer.from(JSON.stringify("[REDACTED]"), "utf8"), wasRedacted: true,
    redactionReasons: ["protectedData:unscanned"], originalPayloadSha256: null, originalHashOmitted: true };
}

// The string leaves a streamed delta carries: Anthropic's delta.text, .partial_json and .thinking, OpenAI's
// choices[i].delta.content, .reasoning_content (DeepSeek and compatible) and tool_calls[j].function.arguments,
// OpenRouter's delta.reasoning, the Responses API's delta, Gemini's parts[k].text, Ollama's /api/chat message.content and
// /api/generate response (only string leaves join, so the Responses API's response object is not one).
const STREAM_DELTA_LEAVES = new Set(["text", "partial_json", "thinking", "content", "arguments", "delta", "refusal", "reasoning",
  "reasoning_content", "response"]);
/** The JSON chunks of a stored event stream (`data:` lines) or JSON-lines body (one value per non-empty line). */
function* streamChunks(stored: string, sse: boolean): Generator<unknown> {
  for (const line of stored.split(/\r?\n/)) {
    const data = sse ? (line.startsWith("data:") ? line.slice(5).trim() : "") : line.trim();
    if (data === "" || data === "[DONE]") continue;
    yield JSON.parse(data) as unknown; // a SyntaxError makes the caller replace the body
  }
}
/**
 * Whether a stored stream still hides protected data across its chunks (the events of a `text/event-stream`, the lines of
 * an NDJSON body, the elements of a JSON array such as Gemini's streamGenerateContent). A model streams each value in
 * token-sized deltas, so an email or a card number is split over chunks and no single one shows it. Each chunk's delta
 * leaves are joined per stream (the leaf's path and each object's own index) and all together in stream order, and the
 * joins, made from the stored chunks (each already redacted), are scanned as they are and with their escapes decoded.
 * Anything found, or a chunk that is not JSON, means the caller replaces the whole body.
 */
function streamHidesProtected(chunks: Iterable<unknown>, redact: (text: string) => string): boolean {
  const streams = new Map<string, string>();
  let all = "";
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (!STREAM_DELTA_LEAVES.has(path.slice(path.lastIndexOf(".") + 1))) return;
      streams.set(path, (streams.get(path) ?? "") + value);
      all += value;
    } else if (value !== null && typeof value === "object") {
      // An object's own index names its stream (Anthropic's block index, OpenAI's tool_calls[j].index, the Responses API's
      // output_index and content_index), so parallel tool calls are joined apart.
      const own = ["index", "output_index", "content_index"].map(name => `#${String((value as Record<string, unknown>)[name])}`).join("");
      for (const [key, item] of Object.entries(value)) visit(item, `${path}${own}.${key}`);
    }
  };
  for (const chunk of chunks) visit(chunk, "");
  return [...streams.values(), all].some(text => redact(text) !== text || decodedFinds(text, decoded => redact(decoded) !== decoded));
}

/**
 * The request path and query a gateway row stores. The credential query keys are replaced in every workspace. Where the
 * workspace opted in, each is also scanned like a stored text, percent-decoded too: a detection is replaced in place, and
 * anything only decoding shows replaces it whole.
 */
export function redactRequestTarget(url: URL, protectedData: boolean): { readonly path: string; readonly query: string } {
  const params = new URLSearchParams(url.search);
  const carriesAuth = AGENT_AUTH_QUERY_KEYS.some((key) => params.has(key));
  for (const key of AGENT_AUTH_QUERY_KEYS) if (params.has(key)) params.set(key, "[REDACTED]");
  const query = carriesAuth ? `?${params.toString()}` : url.search;
  if (!protectedData) return { path: url.pathname, query };
  const scan = nestedJsonRedactor(protectedRedactor(new Set()), () => "[REDACTED]");
  try { return { path: scan(url.pathname), query: scan(query) }; } catch { return { path: "[REDACTED]", query: "[REDACTED]" }; }
}

// UTF-8, UTF-16 BE and LE byte-order marks (UTF-32 LE starts like UTF-16 LE; UTF-32 BE starts with a zero byte).
const BOMS = [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xfe, 0xff]), Buffer.from([0xff, 0xfe])];
/**
 * A body's text when it is plainly UTF-8: no charset parameter other than UTF-8, no byte-order mark, valid UTF-8.
 * Otherwise why not. The route field guard refuses such a body, and redaction replaces it whole rather than scan text a
 * reader of the declared charset (UTF-16) would decode differently.
 */
export function plainUtf8(body: Buffer, contentType: string | undefined):
  { readonly text: string } | { readonly refusal: "charset" | "byte-order-mark" | "invalid-utf8" } {
  const charset = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase();
  if (charset !== undefined && charset !== "utf-8" && charset !== "utf8") return { refusal: "charset" };
  if (BOMS.some((bom) => body.subarray(0, bom.length).equals(bom))) return { refusal: "byte-order-mark" };
  try { return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body) }; } catch { return { refusal: "invalid-utf8" }; }
}

export function redactBody(
  body: Buffer,
  contentType: string | undefined,
  redaction: GatewayConfig["redaction"],
  options: { readonly protectedData: boolean }
): RedactionResult {
  const originalSha = sha256Hex(body);

  if (body.length === 0) {
    return {
      redactedBytes: body,
      wasRedacted: false,
      redactionReasons: [],
      originalPayloadSha256: originalSha,
      originalHashOmitted: false
    };
  }

  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(body.toString("utf8")) as unknown;
      const pathResult = applyJsonPathRedaction(parsed, redaction.jsonPathsDenylist);
      const protectedReasons = new Set<string>();
      let leaves = pathResult.value;
      if (options.protectedData) {
        const opaque = () => { protectedReasons.add("protectedData:unscanned"); return "[REDACTED]"; };
        const redact = protectedRedactor(protectedReasons);
        leaves = redactJsonLeaves(pathResult.value, nestedJsonRedactor(redact, opaque), opaque);
        // A top-level array is how some providers stream as JSON (Gemini's streamGenerateContent): join its elements.
        if (Array.isArray(leaves) && streamHidesProtected(leaves, redact)) return unscannedJsonBody();
      }
      let text = JSON.stringify(leaves);
      const regexResult = applyTextRegexRedaction(text, redaction.textRegexDenylist);
      text = regexResult.value;

      const wasRedacted = pathResult.changed || regexResult.changed || protectedReasons.size > 0;
      const redactedBytes = Buffer.from(text, "utf8");
      return {
        redactedBytes,
        wasRedacted,
        redactionReasons: [
          ...(pathResult.changed ? ["jsonPath"] : []),
          ...[...protectedReasons].sort(),
          ...regexResult.reasons
        ],
        originalPayloadSha256: wasRedacted ? null : originalSha,
        originalHashOmitted: wasRedacted
      };
    } catch {
      // Where the workspace opted in, a JSON body that does not parse, or whose walk fails (nesting too deep for it, the
      // scan budget), is replaced whole rather than stored as text: escaped, a value right after \n or \t has no word
      // boundary, so the text detectors would miss it.
      if (options.protectedData) return unscannedJsonBody();
      // fall through to text mode
    }
  }

  const protectedReasons = new Set<string>();
  let stored = body.toString("utf8");
  if (options.protectedData) {
    // Text another reader decodes differently (a UTF-16 charset or byte-order mark, invalid UTF-8, zero bytes) is not
    // scanned: it is replaced whole.
    const plain = plainUtf8(body, contentType);
    if (!("text" in plain) || plain.text.includes("\u0000")) return unscannedJsonBody();
    const redact = protectedRedactor(protectedReasons);
    const sse = ct.includes("text/event-stream");
    try {
      stored = redact(plain.text);
      // Text can carry JSON escapes too (an event stream of JSON chunks, JSON inside them) and web escapes (a form post):
      // anything the detectors still find in the stored text decoded replaces the whole body, and so does a value a
      // stream (events, or NDJSON lines) split across its chunks. Any failure (the scan budget, a chunk that is not JSON)
      // does too.
      if (decodedFinds(stored, decoded => redact(decoded) !== decoded)
        || ((sse || /application\/(?:x-)?ndjson|application\/jsonl/.test(ct)) && streamHidesProtected(streamChunks(stored, sse), redact))) {
        return unscannedJsonBody();
      }
    } catch {
      return unscannedJsonBody();
    }
  }
  const textResult = applyTextRegexRedaction(stored, redaction.textRegexDenylist);
  const wasRedacted = textResult.changed || protectedReasons.size > 0;
  return {
    redactedBytes: Buffer.from(textResult.value, "utf8"),
    wasRedacted,
    redactionReasons: [...[...protectedReasons].sort(), ...textResult.reasons],
    originalPayloadSha256: wasRedacted ? null : originalSha,
    originalHashOmitted: wasRedacted
  };
}
