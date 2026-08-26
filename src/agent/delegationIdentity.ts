/**
 * Who a run is, for governance purposes (P6.1a).
 *
 * WHY THIS TYPE EXISTS AT ALL. AMC keys two different things by `agentId`, and
 * both were measured before writing a line of subagent code:
 *
 * 1. **Budgets.** `budgetForAgent` falls back to the `default` limits for an
 *    unknown id, while `budgetUsageSnapshot` counts usage filtered by
 *    `meta.agentId === agentId`. So a run under a fresh id gets full limits and
 *    zero spend — a complete, unspent budget.
 * 2. **Guard scopes.** `ToolRegistry` resolves a scope layer with
 *    `this.scopes.get(execution.agentId)`, and scopes are where guards NARROW
 *    what the global layer allows. A run under an unknown id gets the global
 *    guards and none of the narrowing.
 *
 * Neither is a bug today: a person running `amc agent --agent x` is meant to get
 * agent `x`'s budget and scope. They become bugs the moment a run can spawn a
 * child that picks its own id, because then "spawn a child" is a way to reset a
 * budget and shed a restriction — a privilege escalation dressed as delegation.
 *
 * So the identity a child is GOVERNED as is inherited, never chosen. That is the
 * whole point of this type: `governedAs` has no setter and no constructor
 * argument on the child path. A child names itself for evidence, and is metered
 * and restricted as its root.
 */

/** How deep a delegation chain may go before it is refused. */
export const DEFAULT_MAX_DELEGATION_DEPTH = 3;

export interface DelegationIdentity {
  /**
   * The id budgets and guard scopes are keyed to — always the ROOT's.
   *
   * Inherited down the whole chain. A child cannot widen its own allowance or
   * escape its parent's narrowing by naming itself something else.
   */
  readonly governedAs: string;
  /** This run's own id. Evidence and reporting only; never a governance key. */
  readonly runAs: string;
  /** 0 at the root. */
  readonly depth: number;
  /** The parent's `runAs`, or null at the root. */
  readonly parent: string | null;
}

/** The identity a top-level run starts with. */
export function rootIdentity(agentId: string): DelegationIdentity {
  const id = agentId.trim();
  if (id.length === 0) {
    throw new Error("rootIdentity requires a non-empty agentId");
  }
  return { governedAs: id, runAs: id, depth: 0, parent: null };
}

export interface DelegationRefusal {
  readonly ok: false;
  readonly reason: string;
}

export type DelegationResult =
  | { readonly ok: true; readonly identity: DelegationIdentity }
  | DelegationRefusal;

/**
 * Derive a child identity, or refuse.
 *
 * Returns a result rather than throwing because refusal is an ordinary,
 * recordable outcome — a parent that asked for one child too many gets a reason
 * it can put in an evidence row, not an exception it might swallow.
 *
 * `childRunAs` names the child for evidence. It cannot affect `governedAs`.
 */
export function delegateTo(
  parent: DelegationIdentity,
  childRunAs: string,
  maxDepth: number = DEFAULT_MAX_DELEGATION_DEPTH
): DelegationResult {
  const runAs = childRunAs.trim();
  if (runAs.length === 0) {
    return { ok: false, reason: "a child needs a non-empty runAs for its evidence rows" };
  }
  if (maxDepth < 1) {
    return { ok: false, reason: `delegation is disabled: maxDepth=${maxDepth}` };
  }
  const depth = parent.depth + 1;
  if (depth > maxDepth) {
    return {
      ok: false,
      reason: `delegation depth ${depth} exceeds maxDepth ${maxDepth} (chain: ${chainOf(parent).join(" > ")})`
    };
  }
  return {
    ok: true,
    identity: {
      // NOT childRunAs. This is the line the whole module exists to hold.
      governedAs: parent.governedAs,
      runAs,
      depth,
      parent: parent.runAs
    }
  };
}

/**
 * The chain from this run up to its root, root first.
 *
 * Only the tail is reconstructible from one identity — a child knows its parent
 * but not its grandparent — so this returns what is knowable and is used for
 * the refusal message rather than as an audit record. The signed handoff packets
 * are the audit record.
 */
export function chainOf(identity: DelegationIdentity): string[] {
  return identity.parent === null
    ? [identity.runAs]
    : [identity.parent, identity.runAs];
}

/** True when this run is a delegate rather than a root. */
export function isDelegate(identity: DelegationIdentity): boolean {
  return identity.depth > 0;
}
