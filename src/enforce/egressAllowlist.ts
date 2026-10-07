import { BlockList, isIP } from "node:net";

/**
 * The one egress host decision (P1-05). The gateway forward proxy and the
 * native shell's egress proxy both call it, so a host means the same thing to
 * both.
 *
 * Deny by default. An entry is an exact host name, a `.suffix` that matches
 * subdomains (`.example.com` matches `api.example.com`, never
 * `evil-example.com` or `example.com` itself), or an exact IP literal. A suffix
 * never matches an IP literal.
 *
 * An address that is not public (unspecified, loopback, link-local including
 * the 169.254.169.254 metadata service, private, carrier-grade NAT,
 * unique-local, multicast and reserved) is reachable only when that exact IP
 * literal is listed. A listed name that resolves inward is denied, which stops
 * DNS rebinding and metadata SSRF through an allowed name. The caller passes
 * the addresses it will actually connect to; an empty list means the caller
 * resolves nothing and only IP-literal hosts meet the address rule.
 */
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv6");

export interface EgressDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

/** Lowercase and without IPv6 brackets; IPv6 literals in canonical form so `::1` and `0:0::1` compare equal. */
export function canonicalHost(value: string): string {
  const host = value.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (isIP(host) !== 6) return host;
  try { return new URL(`http://[${host}]`).hostname.slice(1, -1); } catch { return host; } // A zone id has no URL form.
}

/** Anything that is not a plain public address counts as non-public, including a value that is not an address at all. */
export function isNonPublicAddress(address: string): boolean {
  const bare = canonicalHost(address).replace(/%.*$/, ""); // A zone id would otherwise defeat the range check.
  const family = isIP(bare);
  return family === 0 || NON_PUBLIC.check(bare, family === 4 ? "ipv4" : "ipv6");
}

export function decideEgress(host: string, resolved: readonly string[], policy: { readonly allowHosts: readonly string[] }): EgressDecision {
  const name = canonicalHost(host);
  if (name === "") return { allowed: false, reason: "the request names no destination host" };
  const entries = new Set(policy.allowHosts.map(canonicalHost));
  if (isIP(name) !== 0) {
    return entries.has(name) ? { allowed: true, reason: `${name} is listed as an IP literal` }
      : { allowed: false, reason: `${name} is not listed; an IP literal matches only an identical entry` };
  }
  const entry = [...entries].find(candidate => candidate === name || (candidate.startsWith(".") && name.endsWith(candidate)));
  if (entry === undefined) return { allowed: false, reason: `${name} is not in the egress allowlist` };
  const inward = resolved.map(canonicalHost).find(address => isNonPublicAddress(address) && !entries.has(address));
  return inward === undefined ? { allowed: true, reason: `${name} matches ${entry}` }
    : { allowed: false, reason: `${name} resolves to non-public address ${inward}, which is not listed as an IP literal` };
}
