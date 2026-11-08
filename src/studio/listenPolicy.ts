import { isPublicBind } from "../config/loadConfig.js";
import { cidrSyntaxValid, LOOPBACK_CIDRS, withLoopbackCidrs } from "./clientAddress.js";

/**
 * Where Studio listens and whom it admits (LIVE-RUNTIME-03, D-R4), decided once from the raw environment, the CLI flags
 * and the signed LAN config, before anything listens or opens a ledger session.
 *
 * Per knob: an explicit flag, else a SET environment variable, else the signed LAN value (single-workspace mode only),
 * else the default. Reading the raw environment is the point: the runtime config fills schema defaults in, which hid
 * the signed LAN bind, port and allow list behind values the operator never set. Loopback is always admitted, so the
 * local console, `amc studio healthcheck` and loopback agents keep working under a LAN-only list; an explicitly empty
 * AMC_ALLOWED_CIDRS therefore means loopback only. Only AMC_ALLOW_PUBLIC_BIND acknowledges a public bind whose list
 * admits every address; AMC_LAN_MODE (the container default) does not.
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
  publicBind: boolean;
  publicBindAcknowledged: boolean;
  lanEnabled: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

/** True when the list admits every address. */
export function weakCidrs(cidrs: readonly string[]): boolean {
  const normalized = new Set(cidrs.map((item) => item.trim()));
  return normalized.has("0.0.0.0/0") || normalized.has("::/0");
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

/** The standalone `amc gateway start` allow list: the environment only (no LAN config), refused like Studio's. */
export function standaloneGatewayAllowList(env: NodeJS.ProcessEnv, listenHost: string): string[] {
  const policy = resolveListenPolicy({ env, hostMode: false, flags: { bind: listenHost } });
  assertPublicBindAcknowledged(policy);
  return policy.allowedCidrs;
}
