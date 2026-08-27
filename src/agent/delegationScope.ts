import type { ActionClass } from "../types.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";

/**
 * The scope a delegation is authorised for, and the thing that makes it bind.
 *
 * `delegationScope` has been written into every signed handoff packet since
 * packets existed (../fleet/delegationPacket.ts) and rendered for humans
 * (../fleet/handoffPacket.ts), and read back by NOTHING: `verifyHandoffPacket`
 * checks the SIGNATURE, not conformance. So a packet asserting `READ_ONLY` was a
 * signed document about a constraint that did not exist — and `src/cli.ts`
 * already ships operator-facing scopes derived from a `--mode` flag. A signature
 * over an unenforced claim manufactures more confidence than no packet would.
 *
 * A scope is an ACTION-CLASS budget: it names the classes the child may invoke,
 * and every tool outside them is denied to it. Action classes are the right
 * currency because they are already the vocabulary of the signed tool allowlist
 * and of the governor's rules, so a delegation scope narrows along the same axis
 * the rest of the system reasons about rather than inventing a parallel one.
 *
 * WHAT THIS DOES NOT COVER. This binds a child that runs IN PROCESS, where AMC
 * owns the tool loop and can refuse a call. It says nothing about an
 * out-of-process child, whose tools AMC never sees. The lease system is the
 * mechanism there — its nine scopes genuinely refuse at the gateway, proxy,
 * bridge and toolhub — but two verified holes must close first, and they are
 * recorded here because a future reader will otherwise assume this module
 * already covers that case:
 *
 *   1. `src/ledger/monitor.ts` passes the PARENT's `AMC_LEASE` straight through
 *      to a spawned child, so a narrower lease minted for the child is simply
 *      unused and nothing reports it.
 *   2. `src/studio/studioState.ts` issues every agent bearer token
 *      `["toolhub:intent", "toolhub:execute", "governor:check", "receipt:verify"]`
 *      unconditionally, so a child holding one routes around whatever its lease
 *      omits.
 *
 * There is also a granularity loss to face when that work happens: `WRITE_LOW`
 * and `WRITE_HIGH` both map to the single `toolhub:execute` lease scope, so the
 * lease layer cannot tell them apart. In-process, here, it can.
 */

/** The action classes a delegation scope may name. One home for the vocabulary. */
export const DELEGATION_SCOPE_TOKENS: readonly ActionClass[] = [
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT"
] as const;

export type DelegationScopeResult =
  | { readonly ok: true; readonly classes: readonly ActionClass[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Read a declared scope, or refuse it.
 *
 * An EMPTY list is refused rather than read as unrestricted. It is the dangerous
 * default: it looks like "nothing declared" and would naturally be treated as
 * "no restriction", which is the opposite of what an operator writing a scope
 * means. A caller that wants an unrestricted child passes no scope at all, which
 * is a different and visible thing.
 */
export function parseDelegationScope(scope: readonly string[]): DelegationScopeResult {
  if (scope.length === 0) {
    return {
      ok: false,
      reason: "delegation scope is empty; omit it entirely for an unrestricted child rather than declaring nothing"
    };
  }
  const known = new Set<string>(DELEGATION_SCOPE_TOKENS);
  const unknown = scope.filter((token) => !known.has(token));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `unknown action class(es) in delegation scope: ${unknown.join(", ")}; expected ${DELEGATION_SCOPE_TOKENS.join(", ")}`
    };
  }
  return { ok: true, classes: scope as readonly ActionClass[] };
}

/**
 * The tools a child under this scope must not be offered.
 *
 * Computed by DENY rather than by allow: a tool registered after the restriction
 * — the `delegate` tool is granted exactly that way — must not slip in merely
 * because it was not on an allow list written earlier. `ToolRegistry.narrow`
 * intersects allow sets, so an allow list would silently hide any later tool;
 * a deny set names only what is actually out of budget and leaves the rest of
 * the registry's own rules to decide.
 */
export function deniedToolNamesForScope(
  registry: ToolRegistry,
  scope: readonly ActionClass[]
): string[] {
  const permitted = new Set<string>(scope);
  const denied: string[] = [];
  for (const [name, tool] of registry.visible()) {
    if (!permitted.has(tool.actionClass)) denied.push(name);
  }
  return denied;
}
