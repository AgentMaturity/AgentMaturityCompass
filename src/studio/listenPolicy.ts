import { isPublicBind } from "../config/loadConfig.js";
import { BlockList, isIP } from "node:net";
import { cidrSyntaxValid, ipAllowedByCidrs, ipv4CidrRange, LOOPBACK_CIDRS, withLoopbackCidrs } from "./clientAddress.js";

/**
 * Where Studio listens and whom it admits (LIVE-RUNTIME-03, D-R4), decided once from the raw environment, the CLI flags
 * and the signed LAN config, before anything listens or opens a ledger session.
 *
 * Per knob: an explicit flag, else a SET environment variable, else the signed LAN value (single-workspace mode only),
 * else the default. Reading the raw environment is the point: the runtime config fills schema defaults in, which hid
 * the signed LAN bind, port and allow list behind values the operator never set. Loopback is always admitted, so the
 * local console, `amc studio healthcheck` and loopback agents keep working under a LAN-only list; an explicitly empty
 * AMC_ALLOWED_CIDRS therefore means loopback only. Only AMC_ALLOW_PUBLIC_BIND acknowledges a public bind whose list
 * admits every address; AMC_LAN_MODE (the container default) does not. AMC_TRUSTED_PROXY_CIDRS names the reverse
 * proxies whose forwarding headers count (SR-1): never the allow list, and never loopback unless listed.
 */
export interface LanListenConfig {
  enabled: boolean;
  valid: boolean;
  bind: string;
  port: number;
  allowedCIDRs?: readonly string[];
}

export interface ListenPolicy {
  apiHost: string;
  apiPort: number;
  apiPortConfigured: boolean;
  /** What set the API port (a flag, a variable, the signed LAN config), or null for the default. */
  apiPortSource: string | null;
  metricsHost: string;
  metricsPort: number;
  metricsPortConfigured: boolean;
  metricsPortSource: string | null;
  allowedCidrs: string[];
  /** The proxies whose X-Forwarded-* headers count (AMC_TRUSTED_PROXY_CIDRS); empty trusts none. */
  trustedProxyCidrs: string[];
  publicBind: boolean;
  publicBindAcknowledged: boolean;
  lanEnabled: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * True when the list admits every address (also used by `amc config explain`), decided on parsed values rather than
 * spellings (skeptic D6): any IPv6 entry with prefix 0, or IPv4 entries whose ranges together cover 0.0.0.0/0, such as
 * `10.0.0.0/0`, `0.0.0.0/00` or `0.0.0.0/1,128.0.0.0/1`.
 */
export function weakCidrs(cidrs: readonly string[]): boolean {
  if (cidrs.some((cidr) => { const [ip, bits] = cidr.trim().split("/"); return isIP(ip ?? "") === 6 && bits !== undefined && Number(bits) === 0; })) return true;
  let next = 0; // the lowest IPv4 address no entry covers yet
  for (const [first, last] of cidrs.map(ipv4CidrRange).filter((range): range is [number, number] => range !== null).sort((a, b) => a[0] - b[0])) {
    if (first > next) return false;
    next = Math.max(next, last + 1);
  }
  return next > 0xffffffff;
}

function setValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function envPort(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const raw = setValue(env, key);
  if (raw === undefined) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${key} must be a port in 1-65535, got ${raw}`);
  return port;
}

function firstPort(defaultPort: number, candidates: Array<[number | undefined, string]>): { port: number; source: string | null } {
  const chosen = candidates.find(([port]) => port !== undefined);
  return chosen ? { port: chosen[0]!, source: chosen[1] } : { port: defaultPort, source: null };
}

export function resolveListenPolicy(input: {
  env: NodeJS.ProcessEnv;
  hostMode: boolean;
  flags?: { bind?: string; port?: number; metricsPort?: number; allowedCidrs?: readonly string[] };
  lan?: LanListenConfig;
}): ListenPolicy {
  const { env, flags = {} } = input;
  const lan = !input.hostMode && input.lan?.enabled === true && input.lan.valid ? input.lan : null;
  const [bindKey, portKey] = input.hostMode ? ["AMC_HOST_BIND", "AMC_HOST_PORT"] : ["AMC_BIND", "AMC_STUDIO_PORT"];
  const apiHost = flags.bind ?? setValue(env, bindKey) ?? lan?.bind ?? "127.0.0.1";
  const api = firstPort(3212, [[flags.port, "--port"], [envPort(env, portKey), portKey], [lan?.port, "the signed LAN config"]]);
  const metrics = firstPort(9464, [[flags.metricsPort, "--metrics-port"], [envPort(env, "AMC_METRICS_PORT"), "AMC_METRICS_PORT"]]);
  const cidrSource = flags.allowedCidrs ? "the allowedCidrs option" : env.AMC_ALLOWED_CIDRS !== undefined ? "AMC_ALLOWED_CIDRS" : lan ? "the signed LAN config" : null;
  const listed = flags.allowedCidrs ? [...flags.allowedCidrs] : env.AMC_ALLOWED_CIDRS !== undefined
    ? env.AMC_ALLOWED_CIDRS.split(",").map((cidr) => cidr.trim()).filter((cidr) => cidr.length > 0)
    : [...(lan?.allowedCIDRs ?? LOOPBACK_CIDRS)];
  const invalid = listed.filter((cidr) => !cidrSyntaxValid(cidr));
  if (invalid.length > 0) throw new Error(`Invalid CIDR in ${cidrSource ?? "the allow list"}: ${invalid.join(", ")}`);
  const proxies = (env.AMC_TRUSTED_PROXY_CIDRS ?? "").split(",").map((cidr) => cidr.trim()).filter((cidr) => cidr.length > 0);
  const invalidProxies = proxies.filter((cidr) => !cidrSyntaxValid(cidr));
  if (invalidProxies.length > 0) throw new Error(`Invalid CIDR in AMC_TRUSTED_PROXY_CIDRS: ${invalidProxies.join(", ")}`);
  return {
    apiHost,
    apiPort: api.port,
    apiPortConfigured: api.source !== null,
    apiPortSource: api.source,
    metricsHost: setValue(env, "AMC_METRICS_BIND") ?? "127.0.0.1",
    metricsPort: metrics.port,
    metricsPortConfigured: metrics.source !== null,
    metricsPortSource: metrics.source,
    allowedCidrs: withLoopbackCidrs(listed),
    trustedProxyCidrs: proxies,
    publicBind: isPublicBind(apiHost),
    publicBindAcknowledged: TRUE_VALUES.has((env.AMC_ALLOW_PUBLIC_BIND ?? "").trim().toLowerCase()),
    lanEnabled: lan !== null
  };
}

export const PUBLIC_BIND_REFUSAL = "Refusing a public bind with an allow list that admits every address. "
  + "Set AMC_ALLOWED_CIDRS to your networks, or set AMC_ALLOW_PUBLIC_BIND=1 to accept this.";

/** Throws PUBLIC_BIND_REFUSAL for a public bind whose allow list admits every address, unless AMC_ALLOW_PUBLIC_BIND is set. */
export function assertPublicBindAcknowledged(policy: Pick<ListenPolicy, "publicBind" | "allowedCidrs" | "publicBindAcknowledged">): void {
  if (policy.publicBind && weakCidrs(policy.allowedCidrs) && !policy.publicBindAcknowledged) throw new Error(PUBLIC_BIND_REFUSAL);
}

export const PROXY_TRUST_REFUSAL = "AMC_TRUSTED_PROXY_HOPS is set, but AMC_TRUSTED_PROXY_CIDRS names no proxy. "
  + "Set it to your reverse proxy's addresses: forwarded headers are believed only from them.";

const WIDE_PROXY_RANGE = 2 ** 20; // a /12: the size of 172.16.0.0/12, the narrowest private range
const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map((cidr) => ipv4CidrRange(cidr) as [number, number]);
/** RFC 5737 and RFC 3849 documentation ranges: an entry there is a placeholder that matches no real proxy (SR-10). */
const DOCUMENTATION_RANGES = new BlockList();
for (const [network, prefix, type] of [["192.0.2.0", 24, "ipv4"], ["198.51.100.0", 24, "ipv4"], ["203.0.113.0", 24, "ipv4"], ["2001:db8::", 32, "ipv6"]] as const) {
  DOCUMENTATION_RANGES.addSubnet(network, prefix, type);
}

const overlap = (a: [number, number], b: [number, number]): [number, number] | null =>
  Math.max(a[0], b[0]) <= Math.min(a[1], b[1]) ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : null;

function documentationEntry(cidr: string): boolean {
  const ip = cidr.trim().split("/")[0] ?? "";
  const family = isIP(ip);
  return family !== 0 && DOCUMENTATION_RANGES.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Warnings for proxies named too broadly or not at all where they sit (SR-10). Any host inside a trusted range can name
 * its own client address: an IPv4 range of /12 or wider, or a range (not a single address) that overlaps the client
 * allow list, would let admitted clients count as proxies. And when the allow list admits private ranges, where a proxy
 * usually sits, but no named proxy can be in them (nor on loopback, a same-host proxy), a proxy there is not trusted:
 * everyone it forwards is seen as its own admitted address. IPv6 entries other than ::1 match nothing (clientAddress.ts).
 */
function proxyTrustWarnings(policy: Pick<ListenPolicy, "trustedProxyCidrs" | "allowedCidrs">): string[] {
  const allowed = policy.allowedCidrs.map((cidr) => [cidr, ipv4CidrRange(cidr)] as const);
  const trusted = policy.trustedProxyCidrs.map((cidr) => [cidr, ipv4CidrRange(cidr)] as const);
  const advice = "can name its own client address in X-Forwarded-For. Name only your reverse proxies' own addresses.";
  const warnings = trusted.flatMap(([cidr, range]) => {
    if (range === null) return [];
    if (range[1] - range[0] + 1 >= WIDE_PROXY_RANGE) return [`AMC_TRUSTED_PROXY_CIDRS entry ${cidr} spans a /12 or wider range: any host in it ${advice}`];
    const overlapping = range[0] === range[1] ? [] : allowed.filter(([, other]) => other !== null && overlap(range, other) !== null);
    return overlapping.length > 0
      ? [`AMC_TRUSTED_PROXY_CIDRS entry ${cidr} overlaps the client allow list (${overlapping.map(([name]) => name).join(", ")}): a client in both ${advice}`]
      : [];
  });
  const privateAllowed = allowed.flatMap(([name, range]) => range === null ? [] : PRIVATE_RANGES.flatMap((ours) => {
    const shared = overlap(range, ours);
    return shared === null ? [] : [[name, shared] as const];
  }));
  const sameHost = policy.trustedProxyCidrs.some((cidr) => ipAllowedByCidrs("127.0.0.1", [cidr]) || ipAllowedByCidrs("::1", [cidr]));
  const reachable = trusted.some(([, range]) => range !== null && privateAllowed.some(([, shared]) => overlap(range, shared) !== null));
  if (privateAllowed.length > 0 && !sameHost && !reachable) {
    warnings.push(`AMC_TRUSTED_PROXY_CIDRS matches no address in the private ranges AMC_ALLOWED_CIDRS admits (${[...new Set(privateAllowed.map(([name]) => name))].join(", ")}): `
      + "a proxy there is not trusted, so everyone it forwards is seen as its own address, which the allow list admits. Name your reverse proxy's address.");
  }
  return warnings;
}

/**
 * Throws PROXY_TRUST_REFUSAL when proxy hops are declared but no proxy is named (SR-1). Forwarding headers would then
 * count from nobody: every client behind the proxy would share its address, and the allow list would judge the proxy
 * instead of the client, admitting everyone it forwards. Refusing the start is the fail-closed answer, and so is
 * refusing a documentation range (RFC 5737/3849), a copied placeholder that names no real proxy (SR-10). With hops
 * declared, a proxy list named too broadly, or missing the private ranges the allow list admits, is warned about: a
 * warning, because some clusters can only name their ingress controller by its pod range.
 */
export function assertProxyTrustNamed(trustedProxyHops: number | undefined, policy: Pick<ListenPolicy, "trustedProxyCidrs" | "allowedCidrs">,
  warn: (line: string) => void = (line) => console.warn(line)): void {
  if ((trustedProxyHops ?? 0) <= 0) return;
  if (policy.trustedProxyCidrs.length === 0) throw new Error(PROXY_TRUST_REFUSAL);
  const placeholder = policy.trustedProxyCidrs.find(documentationEntry);
  if (placeholder !== undefined) {
    throw new Error(`AMC_TRUSTED_PROXY_CIDRS entry ${placeholder} is a documentation range (RFC 5737/3849): it matches no real proxy. `
      + "Set it to your reverse proxy's addresses.");
  }
  for (const warning of proxyTrustWarnings(policy)) warn(`studio: ${warning}`);
}

/** The standalone `amc gateway start` allow list: the environment only (no LAN config), refused like Studio's. */
export function standaloneGatewayAllowList(env: NodeJS.ProcessEnv, listenHost: string): string[] {
  const policy = resolveListenPolicy({ env, hostMode: false, flags: { bind: listenHost } });
  assertPublicBindAcknowledged(policy);
  return policy.allowedCidrs;
}
