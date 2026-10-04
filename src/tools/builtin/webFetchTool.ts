import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { admitUrl, governedGet, isTextual, redactFetched } from "./nativeToolBreadth/governedFetch.js";
import { loadOriginPolicy } from "./nativeToolBreadth/originPolicy.js";

/**
 * `web_fetch` — a governed, refuse-by-default GET (AMC-1549).
 *
 * Order inside the body: signed policy -> url admission (scheme, credentials,
 * exact origin) -> SIMULATE stops here -> fetch without redirects or caller
 * headers -> size cap -> redaction -> receipt -> output. Every step before the
 * fetch refuses without a socket being opened.
 *
 * NETWORK_EXTERNAL so the composed budget guard meters it per call and the
 * composed egress guard also sees its `url` argument. Those guards are the
 * pipeline's; this body does not repeat them.
 *
 * THE RECEIPT IS NOT OPTIONAL. `record` is required, and a receipt that fails
 * to record fails the call before any content is returned — fetched content
 * without its receipt is content nobody can account for. The receipt carries
 * digests and a redacted excerpt, never the raw body.
 */

const EXCERPT_CHARS = 512;

const argsSchema = z.object({
  url: z.string().min(1).max(4_096),
  /** May narrow the signed cap, never widen it. */
  maxBytes: z.number().int().positive().optional()
}).strict();

export interface WebFetchReceipt {
  readonly schemaVersion: "2026-10-03";
  readonly auditType: "NATIVE_WEB_FETCH";
  readonly tool: "web_fetch";
  readonly agentId: string;
  readonly callId: string;
  readonly rootCallId: string;
  readonly token: string;
  readonly url: string;
  readonly origin: string;
  readonly status: number;
  readonly contentType: string;
  readonly bytes: number;
  /** SHA-256 of the body exactly as received. */
  readonly contentSha256: string;
  /** SHA-256 of what the model was given (redacted). */
  readonly deliveredSha256: string;
  readonly redactions: Readonly<Record<string, number>>;
  readonly excerpt: string;
  readonly policyDigestSha256: string;
  readonly fetchedAt: number;
}

export interface WebFetchToolOptions {
  readonly record: (receipt: WebFetchReceipt) => void;
  /** Injected for tests; defaults to Node's built-in fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export function webFetchTool(options: WebFetchToolOptions): ToolDefinition {
  return defineTool({
    name: "web_fetch",
    actionClass: "NETWORK_EXTERNAL",
    description: "GET a URL whose exact origin is on the signed allowlist. No redirects, no custom headers; size-capped; secrets redacted.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "absolute http(s) URL on an allowlisted origin" },
        maxBytes: { type: "integer", description: "optional lower cap than the signed policy's" }
      },
      required: ["url"],
      additionalProperties: false
    },
    body: async (execution) => {
      const args = argsSchema.parse(execution.arguments);
      const policy = loadOriginPolicy(execution.workspace, "web_fetch");
      const maxBytes = Math.min(args.maxBytes ?? policy.maxBytes, policy.maxBytes);
      if (execution.effectiveMode === "SIMULATE") {
        const url = admitUrl("web_fetch", args.url, policy);
        return { output: `[amc: SIMULATE web_fetch ${url.href}; no request made]` };
      }
      const response = await governedGet({
        tool: "web_fetch", url: args.url, policy, maxBytes,
        fetchImpl: options.fetch ?? fetch,
        ...(execution.signal ? { signal: execution.signal } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
      });
      const raw = isTextual(response.contentType)
        ? response.body.toString("utf8")
        : `[amc: ${response.contentType} body of ${response.body.byteLength} bytes not rendered as text]`;
      const redacted = redactFetched(raw);
      const ok = response.status >= 200 && response.status < 300;
      const output = ok ? redacted.text : `[amc: HTTP ${response.status}]\n${redacted.text}`;
      options.record({
        schemaVersion: "2026-10-03",
        auditType: "NATIVE_WEB_FETCH",
        tool: "web_fetch",
        agentId: execution.agentId,
        callId: execution.callId,
        rootCallId: execution.rootCallId,
        token: execution.token,
        url: response.url,
        origin: response.origin,
        status: response.status,
        contentType: response.contentType,
        bytes: response.body.byteLength,
        contentSha256: sha256Hex(response.body),
        deliveredSha256: sha256Hex(output),
        redactions: redacted.redactions,
        excerpt: redacted.text.slice(0, EXCERPT_CHARS),
        policyDigestSha256: policy.policyDigestSha256,
        fetchedAt: Date.now()
      });
      return { ok, output };
    }
  });
}
