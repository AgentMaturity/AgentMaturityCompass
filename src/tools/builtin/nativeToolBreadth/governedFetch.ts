import { redactSecrets } from "../../../shield/redaction/redactSecrets.js";
import { NativeToolRefusal, type OriginPolicy } from "./originPolicy.js";

/**
 * The one outbound GET the native web tools make (AMC-1549).
 *
 * Every refusal here happens BEFORE `fetch` is called, except the two that
 * can only be known from the response: a redirect (body cancelled unread) and
 * an oversize body (cancelled within one chunk of the cap). Node's built-in
 * fetch only — no dependency.
 *
 * NO CALLER HEADERS. The request carries a fixed accept and user-agent and
 * nothing the model chose, so there is no way to attach a cookie or an
 * authorization header through these tools. A secret-looking value in the
 * URL itself is refused: on an allowlisted origin it would still be an
 * exfiltration channel.
 *
 * REDIRECTS ARE NOT FOLLOWED, even to an allowlisted origin. Following one
 * would mean the destination was decided by the remote server after the
 * allowlist check ran.
 */

export const DEFAULT_TIMEOUT_MS = 20_000;
const REQUEST_HEADERS = Object.freeze({ accept: "text/*, application/json;q=0.9, */*;q=0.1", "user-agent": "amc-native-web-tool" });

export interface GovernedResponse {
  readonly url: string;
  readonly origin: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
}

export interface GovernedGetInput {
  readonly tool: string;
  readonly url: string;
  readonly policy: OriginPolicy;
  /** Already resolved: min(caller's request, signed cap). */
  readonly maxBytes: number;
  readonly fetchImpl: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Parse and check a destination without touching the network. */
export function admitUrl(tool: string, raw: string, policy: OriginPolicy): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new NativeToolRefusal(tool, "url cannot be parsed"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new NativeToolRefusal(tool, `scheme ${url.protocol} is not fetchable`);
  }
  if (url.username || url.password || redactSecrets(raw, () => "").findings.length > 0) {
    throw new NativeToolRefusal(tool, "the url carries credentials or a secret-looking value");
  }
  if (!policy.origins.has(url.origin)) {
    throw new NativeToolRefusal(tool, policy.origins.size === 0
      ? "the signed tools policy grants no allowlisted origins"
      : `${url.origin} is not on the signed allowlist`);
  }
  return url;
}

/**
 * Counts bytes as they arrive and cancels at the cap. There is deliberately no
 * separate content-length pre-check: a mutation removing one was survived by
 * every test, because this loop already stops within one chunk of the cap
 * whatever the server declares — the pre-check was decoration, not defence.
 */
async function readCapped(tool: string, response: Response, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Refuse, do not truncate: a clipped document read as complete is a
      // claim about the source nobody checked.
      await reader.cancel().catch(() => undefined);
      throw new NativeToolRefusal(tool, `response exceeds the ${maxBytes}-byte cap`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function governedGet(input: GovernedGetInput): Promise<GovernedResponse> {
  const url = admitUrl(input.tool, input.url, input.policy);
  const timeout = AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const response = await input.fetchImpl(url.href, { method: "GET", redirect: "manual", headers: REQUEST_HEADERS, signal });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new NativeToolRefusal(input.tool, `redirect (${response.status}) not followed; fetch the target explicitly if its origin is allowlisted`);
  }
  const body = await readCapped(input.tool, response, input.maxBytes);
  return { url: url.href, origin: url.origin, status: response.status, contentType: response.headers.get("content-type") ?? "", body };
}

/** Redact for the model and the receipt; counts by secret type. */
export function redactFetched(text: string): { readonly text: string; readonly redactions: Record<string, number> } {
  const { redacted, findings } = redactSecrets(text, (type) => `[AMC_REDACTED:${type}]`);
  const redactions: Record<string, number> = {};
  for (const finding of findings) redactions[finding.type] = (redactions[finding.type] ?? 0) + 1;
  return { text: redacted, redactions };
}

/** A body is rendered as text only when its declared type is textual. */
export function isTextual(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "" || type.startsWith("text/") || /[/+](json|xml|javascript|x-www-form-urlencoded)$/.test(type);
}
