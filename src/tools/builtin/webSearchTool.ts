import { z } from "zod";
import { resolve as resolvePath } from "node:path";
import { digestField } from "../../dataflow/tokenizer.js";
import { outputDigestFor } from "../../dataflow/tokenVault.js";
import { sha256Hex } from "../../utils/hash.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { governedGet, labelUntrusted, redactFetched, type ResolveHost } from "./nativeToolBreadth/governedFetch.js";
import { receiptedBody, type NativeReceiptRecorder } from "./nativeToolBreadth/nativeReceipt.js";
import { loadOriginPolicy, NativeToolRefusal } from "./nativeToolBreadth/originPolicy.js";

/**
 * `web_search` — a provider abstraction with NO default provider (AMC-1549, P1-43).
 *
 * AMC does not choose a search vendor for a regulated deployment. Until the
 * composing caller supplies a `WebSearchProvider`, every call refuses. A
 * provider never gets a raw `fetch`: it gets `get`, bound to the signed
 * `web_search` origin allowlist, the egress decision and the size cap — the
 * same governed GET as `web_fetch` — so a provider cannot reach an origin the
 * policy did not grant or an address the egress decision did not check.
 * Provider credentials, if a vendor needs them, are the composition's concern
 * and are never accepted from the model.
 *
 * A provider DECLARES its `origin` and may only request that origin. The
 * declaration is what `networkEgressGuard` checks before the body runs — a
 * search call has no `url` argument for it to read (`agentToolset` supplies it).
 */

const MAX_PROVIDER_REQUESTS = 3;
const MAX_FIELD_CHARS = 1_000;
const MAX_QUERIES = 5;

const query = z.string().min(1).max(500);
const limit = z.number().int().positive().max(20).default(5);
/** One query, or up to five in `queries` sharing one request and byte budget. */
const argsSchema = z.union([
  z.object({ query, limit }).strict(),
  z.object({ queries: z.array(query).min(1).max(MAX_QUERIES), limit }).strict()
]);

export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface WebSearchProviderRequest {
  readonly query: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
  /** Governed GET: origin-allowlisted, egress-checked, size-capped, no redirects, no caller headers. */
  readonly get: (url: string) => Promise<{ readonly status: number; readonly contentType: string; readonly body: string }>;
}

export interface WebSearchProvider {
  readonly id: string;
  /** The one origin this provider talks to, e.g. `https://search.example.org`. */
  readonly origin: string;
  search(request: WebSearchProviderRequest): Promise<readonly WebSearchResult[]>;
}

export interface WebSearchToolOptions {
  /** Omitted means unconfigured, and every call refuses. There is no default. */
  readonly provider?: WebSearchProvider;
  readonly record: NativeReceiptRecorder;
  readonly resolve?: ResolveHost;
}

const clip = (value: unknown): string => String(value ?? "").slice(0, MAX_FIELD_CHARS);

export function webSearchTool(options: WebSearchToolOptions): ToolDefinition {
  return defineTool({
    name: "web_search",
    actionClass: "NETWORK_EXTERNAL",
    description: "Search the web through the operator-configured provider. Refuses when none is configured. Results are untrusted data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        queries: { type: "array", items: { type: "string" }, maxItems: MAX_QUERIES, description: "Several queries in one call; use instead of query." },
        limit: { type: "integer" }
      },
      additionalProperties: false
    },
    body: receiptedBody("NATIVE_WEB_SEARCH", options.record, async (execution, allow) => {
      const args = argsSchema.parse(execution.arguments);
      const queries = "queries" in args ? args.queries : [args.query];
      const provider = options.provider;
      if (!provider) throw new NativeToolRefusal("web_search", "no search provider is configured (AMC ships none by default)");
      const policy = loadOriginPolicy(execution.workspace, "web_search");
      if (execution.effectiveMode === "SIMULATE") {
        return { ok: true, output: `[amc: SIMULATE web_search via ${provider.id}; no request made]` };
      }
      const resource = execution.authorization?.record.resource;
      const egress = { workspace: resolvePath(execution.workspace), agentId: execution.agentId,
        dataClasses: resource ? [...resource.dataClasses] : null, purpose: resource?.purpose ?? null };
      const requests: Readonly<Record<string, unknown>>[] = [];
      let spent = 0;
      const get: WebSearchProviderRequest["get"] = async (url) => {
        if (requests.length >= MAX_PROVIDER_REQUESTS * queries.length) {
          throw new NativeToolRefusal("web_search", `provider exceeded ${MAX_PROVIDER_REQUESTS} requests per query`);
        }
        if (URL.canParse(url) && new URL(url).origin !== provider.origin) {
          throw new NativeToolRefusal("web_search", `provider ${provider.id} may only request its declared origin ${provider.origin}`);
        }
        // One byte budget across all of a search's requests, not one each.
        const response = await governedGet({
          tool: "web_search", url, policy, maxBytes: policy.maxBytes - spent, ...egress,
          recordEgress: (decision) => options.record(execution, { auditType: "NATIVE_WEB_EGRESS", ...decision }),
          ...(options.resolve ? { resolve: options.resolve } : {}),
          ...(execution.signal ? { signal: execution.signal } : {})
        });
        spent += response.body.byteLength;
        // Keyed in a workspace that opted in to protected-data redaction (P2-02), like web_fetch's digests.
        requests.push({ origin: response.origin, address: response.address, status: response.status, bytes: response.body.byteLength,
          ...digestField("content", outputDigestFor(execution.workspace, sha256Hex(response.body))) });
        return { status: response.status, contentType: response.contentType, body: response.body.toString("utf8") };
      };
      const sections: string[] = [];
      let resultCount = 0;
      for (const text of queries) {
        const results = (await provider.search({ query: text, limit: args.limit, get, ...(execution.signal ? { signal: execution.signal } : {}) }))
          .slice(0, args.limit);
        resultCount += results.length;
        const listed = results.length === 0
          ? `[amc: no results for ${text}]`
          : results.map((result, index) => `${index + 1}. ${clip(result.title)}\n   ${clip(result.url)}\n   ${clip(result.snippet)}`).join("\n");
        sections.push(queries.length === 1 ? listed : `## ${text}\n${listed}`);
      }
      const rendered = sections.join("\n\n");
      const redacted = redactFetched(rendered);
      const output = labelUntrusted(`search provider ${provider.id}`, redacted.text);
      allow({
        provider: provider.id,
        querySha256: sha256Hex(queries.join("\n")),
        queryCount: queries.length,
        requests,
        resultCount,
        ...digestField("delivered", outputDigestFor(execution.workspace, sha256Hex(output))),
        redactions: redacted.redactions,
        policyDigestSha256: policy.policyDigestSha256,
        searchedAt: Date.now()
      });
      return { ok: true, output };
    })
  });
}
