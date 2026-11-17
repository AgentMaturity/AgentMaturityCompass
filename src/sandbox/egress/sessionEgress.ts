import { egressEntry, startShellEgressProxy, type ShellEgressProxy } from "./shellEgressProxy.js";
import type { SandboxPolicy } from "../sandboxTypes.js";

/**
 * Per-session narrowing of a confined command's egress allow-list.
 *
 * A caller (a later rule, for example after a session read untrusted input) may
 * shrink the list for one session: `narrowSessionEgress(sessionId, hosts)`.
 * Each call adds a list a destination must ALSO match, so the effective list is
 * the intersection of the signed list and every narrowing: a narrowing never
 * adds a host, and a second call can only shrink further. It applies only to
 * calls that carry that session id, and lasts for this process.
 * ponytail: in memory for the process lifetime; persist it if a session must survive a restart.
 */
const narrowed = new Map<string, readonly (readonly string[])[]>();

export function narrowSessionEgress(sessionId: string, hosts: readonly string[]): void {
  if (sessionId === "") throw new Error("A session egress narrowing needs a session id.");
  // An entry that cannot be read matches nothing, which only narrows further.
  const list = Object.freeze(hosts.filter(host => egressEntry(host) !== null));
  narrowed.set(sessionId, Object.freeze([...(narrowed.get(sessionId) ?? []), list]));
}

/** The narrowings in force for a session; empty when none (or no session). */
export function sessionEgressNarrowing(sessionId: string | undefined): readonly (readonly string[])[] {
  return sessionId === undefined ? [] : narrowed.get(sessionId) ?? [];
}

/** The proxy variables a confined command gets; the backend sets them in its environment. */
export function proxyEnvironment(url: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) env[name] = env[name.toLowerCase()] = url;
  // Node's fetch ignores the proxy variables unless told to read them; it would connect directly and be denied.
  env["NODE_USE_ENV_PROXY"] = "1";
  return env;
}

/**
 * Start the per-call proxy for a policy with a signed allow-list, or null without one (no network at all).
 * Fails closed: a missing recorder or scope, or a proxy that cannot start, throws a plain reason and the backend
 * runs nothing; it never falls back to an open network.
 */
export async function startPolicyEgress(policy: SandboxPolicy, listenPath?: string): Promise<ShellEgressProxy | null> {
  if (!policy.allowHosts) return null;
  if (!policy.onEgress) throw new EgressUnavailable("an allow-list needs a recorder for each network decision, and none was given");
  if (!policy.egressScope) throw new EgressUnavailable("an allow-list needs the call's workspace and agent for its network checks, and none was given");
  try {
    return await startShellEgressProxy({ allowHosts: policy.allowHosts, narrowings: policy.egressNarrowing ?? [], record: policy.onEgress,
      ...policy.egressScope, ...(policy.egressHowToAllow ? { howToAllow: policy.egressHowToAllow } : {}),
      ...(listenPath === undefined ? {} : { listenPath }) });
  } catch {
    throw new EgressUnavailable("AMC's network filter (the egress proxy) could not start");
  }
}

/** Why a confined call with an allow-list was not run: no network was opened. */
export class EgressUnavailable extends Error {
  constructor(why: string) {
    super(`The command was not run, so it had no network at all: ${why}.`);
  }
}

/** The proxy's refusals appended to the command's error output, so the person sees which host and how to allow it. */
export function withRefusals(stderr: string, proxy: ShellEgressProxy | null): string {
  const lines = proxy?.refusals() ?? [];
  return lines.length === 0 ? stderr : `${stderr}${stderr === "" || stderr.endsWith("\n") ? "" : "\n"}${lines.join("\n")}\n`;
}
