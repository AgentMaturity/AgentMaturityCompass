import { lookup } from "node:dns/promises";
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
 * documentation, benchmarking, unique-local, multicast and reserved, also when
 * an IPv6 address embeds such an IPv4 address) is reachable only when that
 * exact IP literal is listed. A listed name that resolves inward is denied, which stops
 * DNS rebinding and metadata SSRF through an allowed name. The caller passes
 * the addresses it will actually connect to; an empty list means the caller
 * resolves nothing and only IP-literal hosts meet the address rule, which is
 * why a caller that connects by name uses resolveAndCheck (P1-66).
 */
const NON_PUBLIC = new BlockList();
// 240.0.0.0/4 includes the 255.255.255.255 broadcast address.
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv4");
// 6to4 (2002::/16), Teredo (2001::/32) and local-use NAT64 (64:ff9b:1::/48) embed IPv4 addresses that
// cannot be checked reliably, so they fail closed. Forms with a fixed embedding are unwrapped below.
for (const [network, prefix] of [["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv6");

/** The eight 16-bit words of a canonical IPv6 literal (hex groups, at most one `::`), or null. */
function ipv6Words(address: string): number[] | null {
  const halves = address.split("::");
  const words = (part: string | undefined): number[] => !part ? [] : part.split(":").map(word => /^[0-9a-f]{1,4}$/.test(word) ? parseInt(word, 16) : NaN);
  const head = words(halves[0]);
  const tail = words(halves[1]);
  const fill = 8 - head.length - tail.length;
  if (halves.length > 2 || (halves.length === 2 ? fill < 1 : fill !== 0) || [...head, ...tail].some(Number.isNaN)) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

/** The IPv4 address an IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) or NAT64 (64:ff9b::/96) address carries. */
function embeddedIPv4(words: readonly number[]): string | null {
  const [a, b, c, d, e, f, g = 0, h = 0] = words;
  const embeds = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0 || f === 0xffff)
    || a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0;
  return embeds ? `${g >> 8}.${g & 0xff}.${h >> 8}.${h & 0xff}` : null;
}

export interface EgressDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export interface EgressCheck {
  /** What the host resolved to (an IP literal is its own only address). Connect only to one of these, and only when allowed. */
  readonly addresses: readonly string[];
  readonly decision: EgressDecision;
  /** True when the refusal is a DNS failure (EGRESS_UNRESOLVED), not a policy decision; nothing was attempted. */
  readonly unresolved?: boolean;
}

/** Lowercase and without IPv6 brackets; IPv6 literals in canonical form so `::1` and `0:0::1` compare equal. */
export function canonicalHost(value: string): string {
  const host = value.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (isIP(host) !== 6) return host;
  try { return new URL(`http://[${host}]`).hostname.slice(1, -1); } catch { return host; } // A zone id has no URL form.
}

/**
 * One spelling per host for identity comparison: canonicalHost without a trailing dot or IPv6 zone id, and an IPv6
 * address that embeds an IPv4 one (mapped, compatible or NAT64) written as that IPv4 address.
 */
export function canonicalAddress(value: string): string {
  const host = canonicalHost(value.replace(/\.+$/, ""));
  const unzoned = host.replace(/%.*$/, "");
  if (isIP(unzoned) !== 6) return host;
  const address = canonicalHost(unzoned); // without the zone id the URL form applies
  const words = ipv6Words(address);
  return (words && embeddedIPv4(words)) ?? address;
}

/** Anything that is not a plain public address counts as non-public, including a value that is not an address at all. */
export function isNonPublicAddress(address: string): boolean {
  // Drop a zone id before canonicalizing: it would defeat both the URL form and the range check.
  const bare = canonicalHost(address.replace(/%.*$/, ""));
  const family = isIP(bare);
  if (family === 4) return NON_PUBLIC.check(bare, "ipv4");
  if (family !== 6) return true;
  const words = ipv6Words(bare);
  if (words === null) return true;
  const ipv4 = embeddedIPv4(words);
  return ipv4 === null ? NON_PUBLIC.check(bare, "ipv6") : NON_PUBLIC.check(ipv4, "ipv4");
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

/** Every A and AAAA address of `host`, in resolver order. */
export async function resolveAddresses(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map(entry => entry.address);
}

/**
 * decideEgress on the addresses `host` resolves to now (P1-66). A name the allowlist does not cover is refused before
 * any DNS query, so lookups carry nothing out; a name that resolves to nothing is refused (EGRESS_UNRESOLVED), never
 * allowed. The caller connects only to a returned address (a pinned lookup on a new socket, never a pooled keep-alive
 * one, or a connect to the address with the original name as Host and TLS servername) and calls this again for every
 * new connection, so the name cannot rebind between the check and the socket.
 */
export async function resolveAndCheck(host: string, policy: { readonly allowHosts: readonly string[] },
  resolve: (name: string) => Promise<readonly string[]> = resolveAddresses): Promise<EgressCheck> {
  const name = canonicalHost(host);
  const byName = decideEgress(name, [], policy);
  if (isIP(name) !== 0) return { addresses: [name], decision: byName };
  if (!byName.allowed) return { addresses: [], decision: byName };
  let addresses: readonly string[] = [];
  try { addresses = await resolve(name); } catch { /* refused below */ }
  return addresses.length === 0 ? { addresses, unresolved: true, decision: { allowed: false, reason: `${name} did not resolve (EGRESS_UNRESOLVED)` } }
    : { addresses, decision: decideEgress(name, addresses, policy) };
}
