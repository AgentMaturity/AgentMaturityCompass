import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { governedGet, redactFetched } from "./nativeToolBreadth/governedFetch.js";
import { loadOriginPolicy, NativeToolRefusal } from "./nativeToolBreadth/originPolicy.js";

/**
 * `web_search` — a provider abstraction with NO default provider (AMC-1549).
 *
 * AMC does not choose a search vendor for a regulated deployment. Until the
 * composing caller supplies a `WebSearchProvider`, every call refuses. A
 * provider never gets a raw `fetch`: it gets `get`, bound to the signed
 * `web_search` origin allowlist and size cap — the same governed GET as
 * `web_fetch` — so a provider cannot reach an origin the policy did not grant.
 * Provider credentials, if a vendor needs them, are the composition's concern
 * and are never accepted from the model.
 */

const MAX_PROVIDER_REQUESTS = 3;
const MAX_FIELD_CHARS = 1_000;

const argsSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().positive().max(20).default(5)
}).strict();

export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface WebSearchProviderRequest {
  readonly query: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
  /** Governed GET: origin-allowlisted, size-capped, no redirects, no caller headers. */
  readonly get: (url: string) => Promise<{ readonly status: number; readonly contentType: string; readonly body: string }>;
}

export interface WebSearchProvider {
  readonly id: string;
  search(request: WebSearchProviderRequest): Promise<readonly WebSearchResult[]>;
}

export interface WebSearchReceipt {
  readonly schemaVersion: "2026-10-03";
  readonly auditType: "NATIVE_WEB_SEARCH";
  readonly tool: "web_search";
  readonly provider: string;
  readonly agentId: string;
  readonly callId: string;
  readonly token: string;
  readonly querySha256: string;
  readonly requests: readonly { readonly origin: string; readonly status: number; readonly bytes: number; readonly contentSha256: string }[];
  readonly resultCount: number;
  readonly deliveredSha256: string;
  readonly redactions: Readonly<Record<string, number>>;
  readonly policyDigestSha256: string;
  readonly searchedAt: number;
}

export interface WebSearchToolOptions {
  /** Omitted means unconfigured, and every call refuses. There is no default. */
  readonly provider?: WebSearchProvider;
  readonly record: (receipt: WebSearchReceipt) => void;
  readonly fetch?: typeof fetch;
}

const clip = (value: unknown): string => String(value ?? "").slice(0, MAX_FIELD_CHARS);

export function webSearchTool(options: WebSearchToolOptions): ToolDefinition {
  return defineTool({
    name: "web_search",
    actionClass: "NETWORK_EXTERNAL",
    description: "Search the web through the operator-configured provider. Refuses when none is configured.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer" } },
      required: ["query"],
      additionalProperties: false
    },
    body: async (execution) => {
      const args = argsSchema.parse(execution.arguments);
      const provider = options.provider;
      if (!provider) throw new NativeToolRefusal("web_search", "no search provider is configured (AMC ships none by default)");
      const policy = loadOriginPolicy(execution.workspace, "web_search");
      if (execution.effectiveMode === "SIMULATE") {
        return { output: `[amc: SIMULATE web_search via ${provider.id}; no request made]` };
      }
      const requests: { origin: string; status: number; bytes: number; contentSha256: string }[] = [];
      let spent = 0;
      const get: WebSearchProviderRequest["get"] = async (url) => {
        if (requests.length >= MAX_PROVIDER_REQUESTS) {
          throw new NativeToolRefusal("web_search", `provider exceeded ${MAX_PROVIDER_REQUESTS} requests for one search`);
        }
        // One byte budget across all of a search's requests, not one each.
        const response = await governedGet({
          tool: "web_search", url, policy, maxBytes: policy.maxBytes - spent,
          fetchImpl: options.fetch ?? fetch,
          ...(execution.signal ? { signal: execution.signal } : {})
        });
        spent += response.body.byteLength;
        requests.push({ origin: response.origin, status: response.status, bytes: response.body.byteLength, contentSha256: sha256Hex(response.body) });
        return { status: response.status, contentType: response.contentType, body: response.body.toString("utf8") };
      };
      const results = (await provider.search({ query: args.query, limit: args.limit, get, ...(execution.signal ? { signal: execution.signal } : {}) }))
        .slice(0, args.limit);
      const rendered = results.length === 0
        ? `[amc: no results for ${args.query}]`
        : results.map((result, index) => `${index + 1}. ${clip(result.title)}\n   ${clip(result.url)}\n   ${clip(result.snippet)}`).join("\n");
      const redacted = redactFetched(rendered);
      options.record({
        schemaVersion: "2026-10-03",
        auditType: "NATIVE_WEB_SEARCH",
        tool: "web_search",
        provider: provider.id,
        agentId: execution.agentId,
        callId: execution.callId,
        token: execution.token,
        querySha256: sha256Hex(args.query),
        requests,
        resultCount: results.length,
        deliveredSha256: sha256Hex(redacted.text),
        redactions: redacted.redactions,
        policyDigestSha256: policy.policyDigestSha256,
        searchedAt: Date.now()
      });
      return { output: redacted.text };
    }
  });
}
