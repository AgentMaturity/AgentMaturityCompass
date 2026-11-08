import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

/**
 * Who sent a request, as Studio, the host router and the gateway decide it (LIVE-RUNTIME-18/-20).
 *
 * A forwarded header counts only when the socket peer is a trusted hop: `trustedProxyHops > 0` and the peer is inside
 * the allow list. With `hops` trusted proxies that each append the peer they saw, the client is
 * `chain[chain.length - hops]`, clamped to the first entry (D-R11).
 */
export const LOOPBACK_CIDRS: readonly string[] = ["127.0.0.1/32", "::1/128"];

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return ((values[0] ?? 0) << 24) + ((values[1] ?? 0) << 16) + ((values[2] ?? 0) << 8) + (values[3] ?? 0);
}

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || !bitsRaw) {
    return null;
  }
  const base = ipToInt(ip.trim());
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : Number((0xffffffff << (32 - bits)) >>> 0);
  return { base: Number(base >>> 0), mask };
}

/** IPv4 CIDRs and `::1` match; any other IPv6 entry matches nothing (fail closed). An empty list admits nobody. */
export function ipAllowedByCidrs(ip: string, cidrs: readonly string[]): boolean {
  if (ip === "::1") {
    return cidrs.includes("::1/128") || cidrs.includes("::1");
  }
  const value = ipToInt(ip);
  if (value === null) {
    return false;
  }
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      continue;
    }
    const network = parsed.base & parsed.mask;
    if ((Number(value >>> 0) & parsed.mask) === network) {
      return true;
    }
  }
  return false;
}

/** An `address/bits` entry with a valid IPv4 or IPv6 address and prefix length, or the bare `::1` the matcher accepts. */
export function cidrSyntaxValid(cidr: string): boolean {
  if (cidr.trim() === "::1") return true;
  const [ip, bits, extra] = cidr.trim().split("/");
  const family = isIP(ip ?? "");
  const prefix = Number(bits);
  return extra === undefined && family !== 0 && bits !== undefined && /^\d+$/.test(bits) && prefix <= (family === 4 ? 32 : 128);
}

/** The list plus loopback, deduplicated in order: the local console, healthcheck and loopback agents stay admitted. */
export function withLoopbackCidrs(cidrs: readonly string[] | undefined): string[] {
  return [...new Set([...(cidrs ?? []).map((cidr) => cidr.trim()).filter((cidr) => cidr.length > 0), ...LOOPBACK_CIDRS])];
}

export function socketIp(remoteAddress: string | undefined): string {
  const remote = remoteAddress ?? "127.0.0.1";
  return remote.startsWith("::ffff:") ? remote.slice("::ffff:".length) : remote;
}

export function forwardedClientIp(req: IncomingMessage, trustedProxyHops: number): string | null {
  if (trustedProxyHops <= 0) {
    return null;
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.trim().length === 0) {
    return null;
  }
  const chain = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (chain.length === 0) {
    return null;
  }
  return chain[Math.max(0, chain.length - trustedProxyHops)] ?? chain[0] ?? null;
}

/** The request's client address and whether its peer is a trusted hop, from one hop count and one allow list. */
export function resolveClientAddress(req: IncomingMessage, trust: { trustedProxyHops: number; allowedCidrs: readonly string[] }): {
  clientIp: string;
  trustForwarded: boolean;
} {
  const peer = socketIp(req.socket.remoteAddress);
  const trustForwarded = trust.trustedProxyHops > 0 && ipAllowedByCidrs(peer, trust.allowedCidrs);
  return { clientIp: (trustForwarded ? forwardedClientIp(req, trust.trustedProxyHops) : null) ?? peer, trustForwarded };
}

/**
 * HTTPS as far as cookies and HSTS may assume it: a TLS socket, or a trusted hop whose first `x-forwarded-proto` is
 * `https`. A header from any other peer is the client's own claim and counts for nothing.
 */
export function requestUsesHttps(req: IncomingMessage, trustForwarded: boolean): boolean {
  if ((req.socket as { encrypted?: boolean }).encrypted === true) {
    return true;
  }
  if (!trustForwarded) {
    return false;
  }
  const forwarded = req.headers["x-forwarded-proto"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",", 1)[0]?.trim().toLowerCase() === "https";
}
