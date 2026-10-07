/**
 * Route-level refusal of named top-level JSON request fields (P1-24), for example DSH's `dsh_session_log`.
 *
 * Fail closed: once an upstream has refused fields, only an empty body or a plain UTF-8 JSON object without
 * those keys passes. Encoded, BOM-prefixed, non-UTF-8, non-JSON and non-object bodies are refused, because the
 * upstream may read a field from a body this parser cannot. Field values are never read or kept.
 */
import type { IncomingHttpHeaders } from "node:http";
import type { GatewayConfig } from "./config.js";

export type FieldRefusalReason = "refused-field" | "content-encoding" | "charset" | "byte-order-mark" | "invalid-utf8" | "not-json" | "not-object";
export interface FieldRefusal { reason: FieldRefusalReason; fields: string[] }

const BOMS = [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xfe, 0xff]), Buffer.from([0xff, 0xfe])];
// Some upstream JSON decoders match keys case-insensitively with Unicode folding; compare folded names (refuses more, never less).
const fold = (key: string): string => key.normalize("NFKC").toLowerCase();
const normalizeHost = (host: string): string => host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

function upstreamHost(config: GatewayConfig, upstream: string): string | null {
  try { return normalizeHost(new URL(config.upstreams[upstream]?.baseUrl ?? "").hostname) || null; } catch { return null; }
}

/** Refused fields belong to the upstream: the union over every route that reaches the same upstream name or host. */
export function refusedFieldsForUpstream(config: GatewayConfig, upstream: string): string[] {
  const host = upstreamHost(config, upstream);
  return [...new Set(config.routes
    .filter((route) => route.upstream === upstream || (host !== null && upstreamHost(config, route.upstream) === host))
    .flatMap((route) => route.refuseRequestFields ?? []))];
}

/**
 * The forward proxy cannot inspect a tunnel, so it refuses the host (and subdomains) of every upstream with refused
 * fields. When such an upstream's host is unknown, every proxied host is refused. IP literals are not resolved.
 */
export function guardedUpstreamHostRefused(config: GatewayConfig, host: string): boolean {
  const target = normalizeHost(host);
  return config.routes.some((route) => {
    if (!route.refuseRequestFields?.length) return false;
    const guarded = upstreamHost(config, route.upstream);
    return guarded === null || target === guarded || target.endsWith(`.${guarded}`);
  });
}

/** null means the request may be forwarded; an empty body carries no field. */
export function requestFieldRefusal(body: Buffer, headers: IncomingHttpHeaders, fields: readonly string[]): FieldRefusal | null {
  if (fields.length === 0 || body.byteLength === 0) return null;
  const encoding = headers["content-encoding"];
  if (encoding !== undefined && encoding.split(",").some((token) => token.trim().toLowerCase() !== "identity")) return { reason: "content-encoding", fields: [] };
  const charset = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(headers["content-type"] ?? "")?.[1]?.toLowerCase();
  if (charset !== undefined && charset !== "utf-8" && charset !== "utf8") return { reason: "charset", fields: [] };
  if (BOMS.some((bom) => body.subarray(0, bom.length).equals(bom))) return { reason: "byte-order-mark", fields: [] };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body); } catch { return { reason: "invalid-utf8", fields: [] }; }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { reason: "not-json", fields: [] }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { reason: "not-object", fields: [] };
  const keys = new Set(Object.keys(parsed).map(fold));
  const present = fields.filter((field) => keys.has(fold(field)));
  return present.length > 0 ? { reason: "refused-field", fields: present } : null;
}
