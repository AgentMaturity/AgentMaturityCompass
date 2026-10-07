/**
 * Route-level refusal of named top-level JSON request fields (P1-24), for example DSH's `dsh_session_log`.
 *
 * Fail closed: once an upstream has refused fields, only an empty body or a plain UTF-8 JSON object without
 * those keys passes. Encoded, BOM-prefixed, non-UTF-8, non-JSON and non-object bodies are refused, because the
 * upstream may read a field from a body this parser cannot. Field values are never read or kept.
 *
 * Hosts are compared by identity, not spelling: the canonical name (canonicalAddress) and every address it
 * resolves to. Guarded upstreams are resolved once when the gateway starts.
 */
import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import { isIP, type LookupFunction } from "node:net";
import { canonicalAddress, canonicalHost } from "../enforce/egressAllowlist.js";
import type { GatewayConfig } from "./config.js";

export type FieldRefusalReason = "refused-field" | "content-encoding" | "charset" | "byte-order-mark" | "invalid-utf8" | "not-json" | "not-object";
export interface FieldRefusal { reason: FieldRefusalReason; fields: string[] }
export type HostResolver = (host: string) => Promise<string[]>;
export interface ProxyTargetDecision { refused: boolean; addresses: string[] }
export interface FieldGuard {
  /** The union of refused fields over every upstream sharing this upstream's name or an address; all of them when an identity is unknown. */
  fieldsFor(upstream: string): string[];
  /** Forward-proxy decision; an allowed target carries the checked addresses to connect to (none when no upstream is guarded). */
  checkTarget(host: string): Promise<ProxyTargetDecision>;
}

const BOMS = [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xfe, 0xff]), Buffer.from([0xff, 0xfe])];
// Some upstream JSON decoders match keys case-insensitively with Unicode folding; compare folded names (refuses more, never less).
const fold = (key: string): string => key.normalize("NFKC").toLowerCase();
const resolveAll: HostResolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

interface HostIdentity { name: string; addresses: Set<string>; connect: string[] }

/** null when the host is missing or does not resolve, so its identity is unknown. IP literals in any form are resolved too. */
async function identify(host: string, resolve: HostResolver): Promise<HostIdentity | null> {
  const name = canonicalAddress(host);
  if (name === "") return null;
  try {
    // An IP literal is connected to as written; its canonical form (IPv4 for an embedded address) is only for comparison.
    const connect = isIP(name) !== 0 ? [canonicalHost(host.replace(/\.+$/, ""))] : await resolve(name);
    return connect.length > 0 ? { name, addresses: new Set(connect.map(canonicalAddress)), connect } : null;
  } catch { return null; }
}

function upstreamHost(config: GatewayConfig, upstream: string): string {
  try { return new URL(config.upstreams[upstream]?.baseUrl ?? "").hostname; } catch { return ""; }
}

const sameHost = (a: HostIdentity, b: HostIdentity): boolean => a.name === b.name || [...a.addresses].some((address) => b.addresses.has(address));

/** Resolves every upstream once when any route refuses fields; with none, nothing is resolved and nothing changes. */
export async function prepareFieldGuard(config: GatewayConfig, resolve: HostResolver = resolveAll): Promise<FieldGuard> {
  const fieldsByUpstream = new Map<string, string[]>();
  for (const route of config.routes) {
    if (route.refuseRequestFields?.length) fieldsByUpstream.set(route.upstream, [...(fieldsByUpstream.get(route.upstream) ?? []), ...route.refuseRequestFields]);
  }
  if (fieldsByUpstream.size === 0) return { fieldsFor: () => [], checkTarget: async () => ({ refused: false, addresses: [] }) };
  const allFields = [...new Set([...fieldsByUpstream.values()].flat())];
  const names = [...new Set([...Object.keys(config.upstreams), ...config.routes.map((route) => route.upstream)])];
  const identities = new Map(await Promise.all(names.map(async (name) => [name, await identify(upstreamHost(config, name), resolve)] as const)));
  const guarded = [...fieldsByUpstream].map(([name, fields]) => ({ identity: identities.get(name) ?? null, fields }));
  // A guarded upstream that did not resolve could be reached under any name, so every upstream and every proxied host is refused.
  const guardUnknown = guarded.some((guard) => guard.identity === null);
  return {
    fieldsFor(upstream) {
      const self = identities.get(upstream) ?? null;
      if (guardUnknown || self === null) return allFields;
      return [...new Set(guarded.filter((guard) => sameHost(guard.identity!, self)).flatMap((guard) => guard.fields))];
    },
    async checkTarget(host) {
      const target = guardUnknown ? null : await identify(host, resolve);
      // A tunnel cannot be field-checked: refuse a guarded upstream's name, its subdomains and every address it resolved to.
      const refused = target === null || guarded.some(({ identity }) => sameHost(identity!, target)
        || (isIP(identity!.name) === 0 && target.name.endsWith(`.${identity!.name}`)));
      return refused ? { refused: true, addresses: [] } : { refused: false, addresses: target.connect };
    }
  };
}

/** Answers only with the checked addresses, so a DNS change between the check and the connection cannot redirect it. */
export function pinnedLookup(addresses: readonly string[]): LookupFunction | undefined {
  const entries = addresses.map((address) => ({ address, family: isIP(address) }));
  const first = entries[0];
  if (first === undefined) return undefined;
  return (_hostname, options, callback) => { if (options.all) callback(null, entries); else callback(null, first.address, first.family); };
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
