import { resolve } from "node:path";
import { ensureSigningKeys } from "../crypto/keys.js";
import { assertOwnerMode } from "../mode/mode.js";
import { captureSignedControlJournalAppend, ControlMutationAuthorityError, retryOnControlJournalConflict } from "../lifecycle/signedControlJournalAsync.js";
import { captureControlMirror } from "../lifecycle/controlJournalMirror.js";
import {
  GUARDRAIL_CONTROL_SCHEMA_VERSION, GuardrailControlError, assertKnownBoundGuardrail, guardrailControlHeadsDir,
  guardrailControlStatePath, isBoundGuardrailName, nextBaseState, readGuardrailControlStateUnlocked, readJournal,
  validateState, withGuardrailControlLock, type GuardrailControlSource, type GuardrailControlState,
  type GuardrailControlSnapshot
} from "./guardrailControlState.js";
import { GUARDRAIL_PROFILES } from "./guardrailProfiles.js";

type Requested = { workspace: string; name: string; enabled: boolean; source: GuardrailControlSource; actor: string };
type Profile = { workspace: string; profileName: string; source: GuardrailControlSource; actor: string };
const actorCurrent = (check?: () => boolean) => { if (check?.() === false) throw new ControlMutationAuthorityError(); };

async function mutate(workspace: string, command: string, build: (snapshot: GuardrailControlSnapshot) => GuardrailControlState,
  currentActor?: () => boolean): Promise<GuardrailControlState> {
  return retryOnControlJournalConflict(() => mutateOnce(workspace, command, build, currentActor));
}
async function mutateOnce(workspace: string, command: string, build: (snapshot: GuardrailControlSnapshot) => GuardrailControlState,
  currentActor?: () => boolean): Promise<GuardrailControlState> {
  const assertCurrent = () => { actorCurrent(currentActor); assertOwnerMode(workspace, command); };
  assertCurrent(); ensureSigningKeys(workspace);
  const captured = withGuardrailControlLock(workspace, () => {
    assertCurrent();
    const snapshot = readGuardrailControlStateUnlocked(workspace, true), state = validateState(build(snapshot));
    const previous = readJournal(workspace);
    if (state.revision !== previous.revision + 1) throw new GuardrailControlError("INTEGRITY", "Guardrail control revision changed during mutation.");
    return { state, plan: captureSignedControlJournalAppend({ workspace, controlKind: "guardrail-control",
      journalDir: guardrailControlHeadsDir(workspace), previous, payload: state, parsePayload: validateState }) };
  });
  let mirror: ReturnType<typeof captureControlMirror> | undefined, mirrorFailure: unknown;
  try { mirror = captureControlMirror(workspace, guardrailControlStatePath(workspace), "guardrail-control-state",
    Buffer.from(JSON.stringify(captured.state, null, 2) + "\n"), assertCurrent); } catch (error) { mirrorFailure = error; }
  const prepared = await captured.plan.prepare(assertCurrent);
  const committed = withGuardrailControlLock(workspace, () => {
    assertCurrent();
    return prepared.publish();
  });
  try {
    if (!mirror) throw mirrorFailure;
    assertCurrent();
    const compatibility = mirror.prepare(); // Retained synchronous mirror Sign, deliberately outside the lock.
    withGuardrailControlLock(workspace, () => {
      assertCurrent();
      compatibility.publish(() => {
        const latest = readJournal(workspace);
        if (latest.revision !== committed.revision || latest.entrySha256 !== committed.entrySha256
          || latest.checkpointSha256 !== committed.checkpointSha256) throw new Error("Guardrail mirror canonical head changed.");
      });
    });
  } catch (error) {
    process.emitWarning("Guardrail state committed, but compatibility mirror refresh failed: "
      + (error instanceof Error ? error.message : String(error)));
  }
  return JSON.parse(JSON.stringify(captured.state)) as GuardrailControlState;
}

async function requested(input: Requested, currentActor?: () => boolean) {
  const fixed = { ...input, workspace: resolve(input.workspace) };
  assertKnownBoundGuardrail(fixed.name);
  return mutate(fixed.workspace, fixed.enabled ? "guardrails enable" : "guardrails disable", snapshot => {
    const current = nextBaseState(snapshot), requested = new Set(current.requestedGuardrails);
    if (fixed.enabled) requested.add(fixed.name); else requested.delete(fixed.name);
    return { schemaVersion: GUARDRAIL_CONTROL_SCHEMA_VERSION, revision: current.revision + 1,
      requestedGuardrails: [...requested].sort((a, b) => a.localeCompare(b)), activeProfile: null,
      updatedAt: new Date().toISOString(), updatedBy: { source: fixed.source, actor: fixed.actor.trim() || "local-user" } };
  }, currentActor);
}
async function profile(input: Profile, currentActor?: () => boolean) {
  const fixed = { ...input, workspace: resolve(input.workspace) };
  const selected = GUARDRAIL_PROFILES.find(candidate => candidate.name === fixed.profileName);
  if (!selected) throw new GuardrailControlError("UNKNOWN_PROFILE", "Unknown guardrail profile: " + fixed.profileName);
  const name = selected.name, requested = selected.guardrails.filter(isBoundGuardrailName).sort((a, b) => a.localeCompare(b));
  const unsupported = selected.guardrails.filter(value => !isBoundGuardrailName(value)).sort((a, b) => a.localeCompare(b));
  const state = await mutate(fixed.workspace, "guardrails profile", snapshot => {
    const current = nextBaseState(snapshot);
    return { schemaVersion: GUARDRAIL_CONTROL_SCHEMA_VERSION, revision: current.revision + 1,
      requestedGuardrails: [...requested], activeProfile: name, updatedAt: new Date().toISOString(),
      updatedBy: { source: fixed.source, actor: fixed.actor.trim() || "local-user" } };
  }, currentActor);
  return { state, unsupported: [...unsupported] };
}

/** Maintained async producers. Existing synchronous APIs and root SDK surface stay unchanged. */
export const setGuardrailRequestedAsync = (input: Requested) => requested(input);
export const applyGuardrailControlProfileAsync = (input: Profile) => profile(input);
/** Fixed internal handler seam; trusted callbacks can only further refuse publication. No request-selected purpose. */
export const setGuardrailRequestedForHandler = (input: Requested, currentActor: () => boolean) => requested(input, currentActor);
export const applyGuardrailControlProfileForHandler = (input: Profile, currentActor: () => boolean) => profile(input, currentActor);
