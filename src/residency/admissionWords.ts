/**
 * Storage admission in words. The words come from an EgressBlocked decision's fixed `reason` and `detail` codes only,
 * never from its message or cause (which can carry raw error text), and name no host path. `registryStatus` reads the
 * registry and the active plan without evaluating a route, so it writes no RESIDENCY_ROUTE_BLOCKED event: a page or a
 * status command may call it. A registry records operator declarations; it is not legal approval or evidence of where
 * data physically resides.
 */
import { ControlCheckpointRootInWorkspaceError, loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { assertStorageAdmission, EgressBlocked, isEgressRefusal } from "./checkEgress.js";
import { loadDestinationRegistrySnapshot, loadPinnedDeploymentProfile } from "./destinationRegistry.js";

const REGISTRY_STEP = "An owner writes the destination registry and signs it with: amc residency init --file <registry.yaml>. "
  + "Run amc residency status in the workspace folder to see what is missing (docs/OPS_HARDENING.md, Residency routing).";
const WHY: Readonly<Record<string, readonly [string, string?]>> = {
  registry_missing: ["this workspace has an active compiled plan and no signed destination registry"],
  rules_missing: ["the destination registry lists no rules, and a workspace with an active compiled plan needs at least one"],
  profile_unverifiable: ["the destination registry does not name the deployment profile the active plan was compiled from "
    + "(amc residency profile --out <file> writes that profile)"],
  storage_destination_missing: ["the destination registry declares no storage URL"],
  signature_missing: ["the destination registry has no signature"],
  signature_invalid: ["the destination registry's signature does not verify"],
  schema_invalid: ["the destination registry is not in the form AMC reads"],
  registry_unreadable: ["the destination registry cannot be read"],
  destination_unregistered: ["the destination registry declares no destination for the storage URL"],
  destination_match_ambiguous: ["more than one destination in the registry matches the storage URL"],
  region_unknown: ["the storage destination in the registry has no declared region"],
  region_not_allowed: ["the storage destination's declared region is not one a rule that applies allows"],
  active_policy_unverifiable: ["the active compiled plan does not verify", "Restore .amc/control-plan/ from backup, or compile and activate the plan again."],
  control_checkpoint_root_in_workspace: ["the control checkpoint root is inside this workspace",
    "Set AMC_CONTROL_CHECKPOINT_DIR to a directory outside the workspace."],
  workspace_scope_required: ["no workspace was named for the check", "Start the task from the workspace folder."]
};

/** One sentence and the next step for a refused storage admission, from its fixed codes (`refused`: a start was refused just now). */
export function residencyRefusalWords(reason: string, detail: string | undefined, refused = true): string {
  const known = detail === undefined ? undefined : WHY[detail];
  const why = known?.[0] ?? `the residency check refused it (${reason}${detail ? `, ${detail}` : ""})`;
  return `AMC holds every new session in this workspace: ${why}.${refused ? " Nothing was started." : ""} ${known?.[1] ?? REGISTRY_STEP}`;
}

/**
 * The storage admission SessionService.open runs, asked before anything is written. A residency refusal comes back in
 * words with its codes; an active kill keeps its own refusal at session open, as before; any other error propagates.
 */
export function storageAdmissionRefusal(workspace: string): { reason: string; detail: string; message: string } | null {
  try {
    assertStorageAdmission(workspace);
    return null;
  } catch (error) {
    if (error instanceof EgressBlocked) {
      const { reason, detail } = error.decision;
      return { reason, detail: detail ?? reason, message: residencyRefusalWords(reason, detail) };
    }
    if (isEgressRefusal(error)) return null;
    throw error;
  }
}

export interface RegistryStatus {
  /** true: a plan is active; false: none; null: the plan does not verify (every session is refused). */
  readonly planActive: boolean | null;
  readonly registry: "missing" | "invalid" | "verified";
  readonly invalidReason: string | null;
  readonly rules: number;
  readonly destinations: readonly string[];
  /** Whether the registry's profile file is the one the active plan pins; null without an active plan or profile. */
  readonly profileMatches: boolean | null;
  /** The detail code storage admission refuses with before any destination is evaluated; null when it gets that far. */
  readonly held: string | null;
}

/** The registry's state against the active plan, without evaluating a route (no guard event is written). */
export function registryStatus(workspace: string): RegistryStatus {
  let planActive: boolean | null, pinned: string | null = null, unverified = "active_policy_unverifiable";
  try {
    const active = loadActiveCompiledPolicy(workspace);
    planActive = active !== null;
    pinned = active?.profileSha256 ?? null;
  } catch (error) {
    planActive = null;
    if (error instanceof ControlCheckpointRootInWorkspaceError) unverified = "control_checkpoint_root_in_workspace";
  }
  const snapshot = loadDestinationRegistrySnapshot(workspace);
  const registry = snapshot.state === "verified" ? snapshot.registry : null;
  let profileMatches: boolean | null = null;
  if (registry !== null && pinned !== null) {
    try { loadPinnedDeploymentProfile(workspace, registry, pinned); profileMatches = true; } catch { profileMatches = false; }
  }
  // The order of checkEgress context() and assertStorageAdmission; with no plan, a registry without a profile has no storage URL.
  const held = planActive === null ? unverified : snapshot.state === "invalid" ? snapshot.reason
    : registry === null ? (planActive ? "registry_missing" : null)
      : !planActive ? (registry.profile === null ? "storage_destination_missing" : null)
        : registry.rules.length === 0 ? "rules_missing" : profileMatches !== true ? "profile_unverifiable" : null;
  return { planActive, registry: snapshot.state, invalidReason: snapshot.state === "invalid" ? snapshot.reason : null, rules: registry?.rules.length ?? 0,
    destinations: registry?.destinations.map((row) => `${row.destinationId} (${row.channels.join(", ")}; region ${row.region ? `${row.region.jurisdiction}/${row.region.code}` : "not declared"})`) ?? [],
    profileMatches, held };
}
