import { activeControlPlan } from "../catalog/compiler/activate.js";

/**
 * Whether the workspace runs a regulated profile (P1-10/P1-12: an active compiled plan) and the maximum lease lifetime
 * that plan sets through identity-binding's `toolPipeline.maxLeaseTtlMinutes` (P2-25). Fails closed: a plan journal that
 * cannot be read or verified reads as regulated with an unknown cap (`verified: false`); lease verification then refuses
 * every lease. The cap is null when no plan sets one.
 */
export interface RegulatedLeaseProfile { readonly regulated: boolean; readonly maxLeaseTtlMs: number | null; readonly verified: boolean }

export function regulatedLeaseProfile(workspace: string): RegulatedLeaseProfile {
  let plan: ReturnType<typeof activeControlPlan>;
  try {
    plan = activeControlPlan(workspace);
  } catch {
    return { regulated: true, maxLeaseTtlMs: null, verified: false };
  }
  if (plan === null) return { regulated: false, maxLeaseTtlMs: null, verified: true };
  const minutes = plan.runtimePolicy.toolPipeline.guards.find((guard) => guard.id === "identity-binding")?.params.maxLeaseTtlMinutes;
  return { regulated: true, maxLeaseTtlMs: typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0 ? minutes * 60_000 : null, verified: true };
}

/** A refusal when a lease lifetime exceeds the regulated plan's cap, else null. */
export function leaseLifetimeRefusal(profile: RegulatedLeaseProfile, lifetimeMs: number): string | null {
  return profile.maxLeaseTtlMs !== null && lifetimeMs > profile.maxLeaseTtlMs
    ? `lease lifetime ${Math.ceil(lifetimeMs / 60_000)} minutes exceeds the regulated plan's maximum of ${profile.maxLeaseTtlMs / 60_000} minutes`
    : null;
}
