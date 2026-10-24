/** Maintained init/settings drivers. The original run authority survives prerequisite and log waits. */
import { relative } from "node:path";
import YAML from "yaml";
import { orgPairBytes } from "../org/preparedOrgPairs.js";
import { sha256Hex } from "../utils/hash.js";
import type * as Legacy from "./mechanicApi.js";
import { captureMechanicPair, requireMechanicPair } from "./mechanicPairs.js";
import { captureMechanicRun, mechanicProgress, mechanicFailed, appendMechanicEntry } from "./mechanicPublication.js";
import { mechanicTargetsPath, prepareInitialMechanicTargets, prepareMechanicTargets } from "./targetsStore.js";
import { mechanicProfilesPath, captureMechanicProfiles, prepareInitialMechanicProfiles, prepareMechanicProfile } from "./profiles.js";
import { mechanicTuningPath, prepareInitialMechanicTuning, prepareMechanicTuning } from "./tuningStore.js";
import { mechanicTargetsSchema, type MechanicScope, type MechanicTargets } from "./targetSchema.js";
import { mechanicProfilesSchema } from "./profileSchema.js";
import { mechanicTuningSchema } from "./tuningSchema.js";
function scope(input: { scopeType?: string | null; scopeId?: string | null }): MechanicScope {
  const raw = String(input.scopeType ?? "WORKSPACE").toUpperCase(), type = raw === "AGENT" || raw === "NODE" ? raw : "WORKSPACE";
  return { type, id: (input.scopeId ?? (type === "WORKSPACE" ? "workspace" : "default")).trim() || (type === "WORKSPACE" ? "workspace" : "default") };
}
function completed(workspace: string, saved: { path: string; sigPath: string }, state: ReturnType<typeof mechanicProgress>) {
  state.completed.push(relative(workspace, saved.path), relative(workspace, saved.sigPath));
}
export async function initMechanicWorkspaceAsync(input: Parameters<typeof Legacy.initMechanicWorkspace>[0]) { return initMechanicWorkspaceForAuthority(input, () => {}); }
/** Internal supervisor/Studio boundary only. Existing valid files remain untouched when onlyIfMissing is selected by the supervisor. */
export async function initMechanicWorkspaceForAuthority(input: Parameters<typeof Legacy.initMechanicWorkspace>[0], beforePublish: () => void, onlyIfMissing = false) {
  const params = { ...input }, selectedScope = scope({ scopeType: params.scopeType ?? "WORKSPACE", scopeId: params.scopeId ?? "workspace" });
  const run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress(), current: Array<() => void> = [];
  const options = { beforePublish, assertInputsCurrent() { for (const check of current) check(); run.fixed(); } };
  const targetBefore = captureMechanicPair(params.workspace, mechanicTargetsPath(params.workspace), "mechanic targets missing");
  const profileBefore = captureMechanicPair(params.workspace, mechanicProfilesPath(params.workspace), "mechanic profiles missing");
  const tuningBefore = captureMechanicPair(params.workspace, mechanicTuningPath(params.workspace), "mechanic tuning missing");
  const existing = (selected: typeof targetBefore) => {
    if (!onlyIfMissing) return null;
    if (selected.bytes === null) { if (orgPairBytes(selected.before, selected.verification.sigPath) !== null) throw new Error("existing mechanic sidecar has no body; initialization refuses replacement"); return null; }
    selected.assertCurrent(); return requireMechanicPair(selected);
  };
  try {
    state.phase = "targets-pair"; const targetBytes = existing(targetBefore);
    let targets: ReturnType<typeof Legacy.initMechanicWorkspace>["targets"];
    if (targetBytes !== null) { targets = { path: targetBefore.verification.path, sigPath: targetBefore.verification.sigPath, targets: mechanicTargetsSchema.parse(YAML.parse(targetBytes.toString("utf8")) as unknown) }; current.push(targetBefore.assertCurrent); }
    else { const prepared = await prepareInitialMechanicTargets({ workspace: params.workspace, scope: selectedScope, mode: "DESIRED" }, options, targetBefore.before);
      targets = prepared.publish(); completed(params.workspace, targets, state); current.push(prepared.assertCurrent); }
    state.phase = "profiles-pair"; const profileBytes = existing(profileBefore); run.assertCurrent();
    let profiles: ReturnType<typeof Legacy.initMechanicWorkspace>["profiles"];
    if (profileBytes !== null) { profiles = { path: profileBefore.verification.path, sigPath: profileBefore.verification.sigPath, profiles: mechanicProfilesSchema.parse(YAML.parse(profileBytes.toString("utf8")) as unknown) }; current.push(profileBefore.assertCurrent); }
    else { const prepared = await prepareInitialMechanicProfiles(params.workspace, options, profileBefore.before);
      profiles = prepared.publish(); completed(params.workspace, profiles, state); current.push(prepared.assertCurrent); }
    state.phase = "tuning-pair"; const tuningBytes = existing(tuningBefore); run.assertCurrent();
    let tuning: ReturnType<typeof Legacy.initMechanicWorkspace>["tuning"];
    if (tuningBytes !== null) { tuning = { path: tuningBefore.verification.path, sigPath: tuningBefore.verification.sigPath, tuning: mechanicTuningSchema.parse(YAML.parse(tuningBytes.toString("utf8")) as unknown) }; current.push(tuningBefore.assertCurrent); }
    else { const prepared = await prepareInitialMechanicTuning({ workspace: params.workspace, scope: selectedScope }, options, tuningBefore.before);
      tuning = prepared.publish(); completed(params.workspace, tuning, state); current.push(prepared.assertCurrent); }
    beforePublish(); options.assertInputsCurrent(); return { targets, profiles, tuning };
  } catch (error) { mechanicFailed(state, error); }
}
export async function mechanicTargetsApplyForApiAsync(input: Parameters<typeof Legacy.mechanicTargetsApplyForApi>[0]) { return mechanicTargetsApplyForAuthority(input, () => {}); }
export async function mechanicTargetsApplyForAuthority(input: Parameters<typeof Legacy.mechanicTargetsApplyForApi>[0], beforePublish: () => void) {
  const params = { ...input, targets: mechanicTargetsSchema.parse(input.targets) }, run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  try {
    state.phase = "targets-pair"; const prepared = await prepareMechanicTargets(params, { beforePublish, assertInputsCurrent: run.fixed }), saved = prepared.publish(); completed(params.workspace, saved, state);
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_TARGETS_APPLIED", agentId: params.targets.mechanicTargets.scope.id,
      artifact: { kind: "policy", id: `${params.targets.mechanicTargets.scope.type}:${params.targets.mechanicTargets.scope.id}`, sha256: sha256Hex(prepared.bytes) } }, run, prepared.assertCurrent, state);
    return { ...saved, actor: params.actor, transparencyHash };
  } catch (error) { mechanicFailed(state, error); }
}
export async function mechanicTuningApplyForApiAsync(input: Parameters<typeof Legacy.mechanicTuningApplyForApi>[0]) { return mechanicTuningApplyForAuthority(input, () => {}); }
export async function mechanicTuningApplyForAuthority(input: Parameters<typeof Legacy.mechanicTuningApplyForApi>[0], beforePublish: () => void) {
  const params = { ...input, tuning: mechanicTuningSchema.parse(input.tuning) }, run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  try {
    state.phase = "tuning-pair"; const prepared = await prepareMechanicTuning(params, { beforePublish, assertInputsCurrent: run.fixed }), saved = prepared.publish(); completed(params.workspace, saved, state);
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_TARGETS_APPLIED", agentId: params.tuning.mechanicTuning.scope.id,
      artifact: { kind: "policy", id: "tuning", sha256: sha256Hex(prepared.bytes) } }, run, prepared.assertCurrent, state);
    return { ...saved, actor: params.actor, transparencyHash };
  } catch (error) { mechanicFailed(state, error); }
}
export async function mechanicProfileApplyForApiAsync(input: Parameters<typeof Legacy.mechanicProfileApplyForApi>[0]) { return mechanicProfileApplyForAuthority(input, () => {}); }
export async function mechanicProfileApplyForAuthority(input: Parameters<typeof Legacy.mechanicProfileApplyForApi>[0], beforePublish: () => void) {
  const params = { ...input }, run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  try {
    // The original getters initialized missing defaults. Retain their actual selected/prepared state across both prerequisites.
    state.phase = "profile-prerequisites";
    const missingProfiles = captureMechanicPair(params.workspace, mechanicProfilesPath(params.workspace), "mechanic profiles missing");
    const missingTargets = captureMechanicPair(params.workspace, mechanicTargetsPath(params.workspace), "mechanic targets missing"), current: Array<() => void> = [];
    let constructorTargets: MechanicTargets | undefined;
    if (missingProfiles.bytes !== null) { requireMechanicPair(missingProfiles); current.push(missingProfiles.assertCurrent); }
    else if (missingProfiles.hasSidecar) throw new Error("existing mechanic sidecar has no body; initialization refuses replacement");
    const options = { beforePublish, assertInputsCurrent() { for (const check of current) check(); run.fixed(); } };
    if (missingProfiles.bytes === null) { const prepared = await prepareInitialMechanicProfiles(params.workspace, options, missingProfiles.before);
      const saved = prepared.publish(); completed(params.workspace, saved, state); current.push(prepared.assertCurrent); }
    beforePublish(); options.assertInputsCurrent(); const profileInput = captureMechanicProfiles(params.workspace);
    if (!profileInput.profiles.mechanicProfiles.profiles.some(row => row.id === params.profileId)) throw new Error(`unknown mechanic profile: ${params.profileId}`);
    current.push(profileInput.assertCurrent);
    if (missingTargets.bytes !== null) { requireMechanicPair(missingTargets); current.push(missingTargets.assertCurrent); }
    else {
      if (missingTargets.hasSidecar) throw new Error("existing mechanic sidecar has no body; initialization refuses replacement");
      const prepared = await prepareInitialMechanicTargets({ workspace: params.workspace, scope: { type: "WORKSPACE", id: "workspace" }, mode: "DESIRED" }, options, missingTargets.before);
      const saved = prepared.publish(); constructorTargets = saved.targets; completed(params.workspace, saved, state); current.push(prepared.assertCurrent);
    }
    beforePublish(); options.assertInputsCurrent(); state.phase = "profile-targets-pair";
    const prepared = await prepareMechanicProfile(params, options, constructorTargets), saved = prepared.publish(); completed(params.workspace, saved, state);
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_PROFILE_APPLIED", agentId: params.scopeId,
      artifact: { kind: "policy", id: params.profileId, sha256: sha256Hex(prepared.bytes) } }, run, prepared.assertCurrent, state);
    return { ...saved, actor: params.actor, transparencyHash };
  } catch (error) { mechanicFailed(state, error); }
}
