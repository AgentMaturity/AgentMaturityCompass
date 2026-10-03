import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../../../toolhub/toolhubValidators.js";

/**
 * The signed origin allowlist for a native web tool (AMC-1549).
 *
 * WHY THE BODY READS POLICY ITSELF. `networkEgressGuard` checks hostnames
 * through `hostAllowedForTool`, which reads an EMPTY hostAllowlist without
 * `denyByDefault` as "any host" and ignores scheme and port. A web tool that
 * relied on it alone would fetch `http://127.0.0.1:1/` from a policy that
 * lists nothing. `tests/webFetchTool.test.ts` proves that guard permits the
 * case; this module is what refuses it.
 *
 * ORIGINS, NOT HOSTS. A policy entry is either:
 *   - a bare hostname (`docs.example.org`) — grants `https://docs.example.org`
 *     on the default port and nothing else: no subdomains, no plain http;
 *   - an explicit origin (`http://127.0.0.1:8080`) — grants exactly that
 *     scheme, host and port.
 * Anything else (paths, wildcards, credentials) is ignored, never widened.
 * Note the composed `networkEgressGuard` still checks the HOSTNAME against the
 * same list, so an explicit-origin entry only passes that guard when its bare
 * host is also listed — the two checks intersect, they never union.
 */

export const HARD_MAX_BYTES = 5_000_000;
export const DEFAULT_MAX_BYTES = 1_000_000;

export interface OriginPolicy {
  readonly origins: ReadonlySet<string>;
  /** The signed cap, already clamped to HARD_MAX_BYTES. */
  readonly maxBytes: number;
  readonly policyDigestSha256: string;
}

/** Thrown for every policy refusal, so callers can tell refusal from failure. */
export class NativeToolRefusal extends Error {
  readonly code = "AMC_NATIVE_TOOL_REFUSED";
  constructor(tool: string, reason: string) {
    super(`${tool} refused: ${reason}`);
    this.name = "NativeToolRefusal";
  }
}

const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** One policy entry as an origin, or null when it is not a well-formed grant. */
export function originForEntry(entry: string): string | null {
  const value = entry.trim().toLowerCase();
  if (!value.includes("://")) return HOSTNAME.test(value) ? `https://${value}` : null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
  return url.origin;
}

export function loadOriginPolicy(workspace: string, tool: string): OriginPolicy {
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config || !snapshot.digestSha256) {
    throw new NativeToolRefusal(tool, `tools policy is not verifiable (${snapshot.reason ?? "unknown reason"})`);
  }
  const definition = findToolDefinition(snapshot.config, tool);
  if (!definition) throw new NativeToolRefusal(tool, `"${tool}" is not in the signed tools policy`);
  if (definition.actionClass !== "NETWORK_EXTERNAL") {
    throw new NativeToolRefusal(tool, `signed policy declares ${definition.actionClass}, not NETWORK_EXTERNAL`);
  }
  const origins = new Set<string>();
  for (const entry of definition.allow?.hostAllowlist ?? []) {
    const origin = originForEntry(entry);
    if (origin) origins.add(origin);
  }
  // An empty set is returned, not refused here: `assertOriginAllowed` is the
  // ONE membership check, and an empty set fails it for every request.
  return {
    origins,
    maxBytes: Math.min(definition.maxBytes ?? DEFAULT_MAX_BYTES, HARD_MAX_BYTES),
    policyDigestSha256: snapshot.digestSha256
  };
}
