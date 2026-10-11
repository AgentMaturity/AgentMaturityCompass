/**
 * Adapt's permissions (P1-61 slice B; design §10.3 Understand, Explain and Review): the station operating profile
 * (buildOperatingProfile through emitOperatingProfile) for the primary station, written to A4's own proposal file
 * `amc-operating-profiles/<agent>/a4-<station>.operating-profile.json` (never the operator's own profile at the default
 * path; the bytes are a pure function of the station, the agent and the project's creation time, so re-running
 * Understand rewrites the same bytes), signed as `domain apply --sign-profile` signs it, and dry-run through
 * `activateOperatingProfile({ dryRun: true })`, which lists every change that would weaken the current verified configs
 * and writes nothing. A widening is refused (`scope_changed`, POLICY_WIDENING_REFUSED) unless a project owner's answer
 * accepts exactly that list (its digest), and A4 never activates a profile with `allowWidening`: activation stays the
 * owner's `amc domain apply --activate-profile` after review. Per-agent gatePolicy.json and lease caps are not proposed here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { activateOperatingProfile } from "../domains/operatingProfiles/operatingProfileActivation.js";
import { emitOperatingProfile, OPERATING_PROFILE_DIR } from "../domains/operatingProfiles/operatingProfileEmit.js";
import { signOperatingProfile } from "../domains/operatingProfiles/operatingProfileSignature.js";
import { isStation, type Station } from "../domains/stations.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { A4ReadinessItem, A4ReadinessState } from "./a4Readiness.js";
import type { A4Answer } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { adaptSpecOf, factAnswer, factList, factTerm, understandingOf } from "./spec/adapt.js";
import { textValue } from "./spec/aspire.js";

const MAX_WIDENINGS = 64;
const PROFILE_FILE = /^a4-[a-z]+\.operating-profile\.json$/;
const ACTIVATION_FILE = /\.activation\.json$/;

/** What Understand records about the profile's dry run; `error` is a code, never a path or a message. */
export interface AdaptPermissionsFacts {
  readonly station: string | null;
  readonly profilePath: string | null;
  readonly profileSha256: string | null;
  readonly riskTier: string | null;
  readonly widenings: readonly string[];
  /** sha256Hex(canonicalize(widenings)): what an owner's acceptance answer must name. */
  readonly wideningsSha256: string | null;
  readonly configs: ReadonlyArray<{ readonly config: string; readonly sha256: string | null }>;
  readonly error: string | null;
}

/** The profile's station: the primary station, else the first carried station; null when neither is a station. */
export function profileStation(answers: readonly A4Answer[]): Station | null {
  const primary = factTerm(factAnswer(answers, "primaryStation")?.value);
  const station = primary ?? factList(factAnswer(answers, "stations")?.value)?.[0] ?? null;
  return station !== null && isStation(station) ? station : null;
}

const agentDir = (workspace: string, agentId: string): string => join(workspace, OPERATING_PROFILE_DIR, agentId);
/** Errors of the profile functions carry messages only (paths, digests): a code is derived, the message never recorded. */
function profileCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return /agent mode/.test(text) ? "AGENT_MODE" : /vault|passphrase|locked/i.test(text) ? "VAULT_LOCKED" : /does not verify/.test(text) ? "CONFIG_UNTRUSTED"
    : /inconsistent/.test(text) ? "PROFILE_INCONSISTENT" : errorCodeOf(error, "PROFILE_DRY_RUN_FAILED");
}

/**
 * Understand's dry run (writes the proposal file and its signature, nothing under `.amc/`): the widenings the current
 * verified configs would take from the profile, and the configs it would write. A step that cannot run is a code.
 */
export function permissionsDryRun(input: { workspace: string; agentId: string; station: Station | null; generatedAt: string }): AdaptPermissionsFacts {
  const none = { profilePath: null, profileSha256: null, riskTier: null, widenings: [], wideningsSha256: null, configs: [] };
  if (input.station === null) return { station: null, ...none, error: "PROFILE_STATION_UNKNOWN" };
  const path = join(agentDir(input.workspace, input.agentId), `a4-${input.station}.operating-profile.json`);
  try {
    const emitted = emitOperatingProfile({ workspacePath: input.workspace, station: input.station, agentId: input.agentId, outputPath: path, generatedAt: input.generatedAt });
    if (!emitted.consistency.ok) return { station: input.station, ...none, error: "PROFILE_INCONSISTENT" };
    signOperatingProfile(input.workspace, path);
    const dry = activateOperatingProfile({ workspacePath: input.workspace, profilePath: path, agentId: input.agentId, dryRun: true, allowWidening: true });
    const widenings = dry.widenings.slice(0, MAX_WIDENINGS).map((entry) => entry.slice(0, 300));
    return { station: input.station, profilePath: relative(input.workspace, path).split(sep).join("/"), profileSha256: dry.profileSha256, riskTier: emitted.riskTier,
      widenings, wideningsSha256: sha256Hex(canonicalize(dry.widenings)), configs: dry.configs.map((entry) => ({ config: entry.config, sha256: entry.sha256 })), error: null };
  } catch (error) {
    return { station: input.station, ...none, error: profileCode(error) };
  }
}

/** sha256 over the named files of the agent's operating-profile directory (name and bytes), null when there are none. */
function dirDigest(workspace: string, agentId: string, pattern: RegExp, slot: string): string | null {
  let names: string[];
  try {
    names = readdirSync(agentDir(workspace, agentId)).filter((name) => pattern.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new A4StoreError(409, "RESOURCE_UNREADABLE", `${slot} (the agent's operating profiles) could not be read (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
  }
  if (names.length === 0) return null;
  try {
    return sha256Hex(canonicalize(names.map((name) => [name, sha256Hex(readFileSync(join(agentDir(workspace, agentId), name)))])));
  } catch (error) {
    throw new A4StoreError(409, "RESOURCE_UNREADABLE", `${slot} (the agent's operating profiles) could not be read (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
  }
}
/** `operatingProfile.sha256`: A4's proposal files for the agent. */
export const operatingProfileSha256 = (workspace: string, agentId: string): string | null =>
  dirDigest(workspace, agentId, PROFILE_FILE, "operatingProfile.sha256");
/** `operatingProfile.activationSha256`: every activation record of the agent (any activation, in A4 or from the CLI, moves it). */
export const operatingProfileActivationSha256 = (workspace: string, agentId: string): string | null =>
  dirDigest(workspace, agentId, ACTIVATION_FILE, "operatingProfile.activationSha256");

/** Understand's recorded facts, when they are an object of this shape; null otherwise. */
export function permissionsOf(spec: Record<string, unknown>): AdaptPermissionsFacts | null {
  const facts = understandingOf(spec)?.facts.permissions as Partial<AdaptPermissionsFacts> | undefined;
  return facts !== undefined && facts !== null && Array.isArray(facts.widenings) ? facts as AdaptPermissionsFacts : null;
}

/**
 * The owner acceptance of exactly `digest`: the `acceptWidenings` answer equals it and the revision that recorded it was
 * written by a member holding the project owner role. Anything else accepts nothing (fail closed).
 */
function acceptedBy(state: A4ReadinessState, answers: readonly A4Answer[], digest: string): string | null {
  const answer = answers.find((entry) => entry.questionId === "acceptWidenings");
  if (answer === undefined || textValue(answer.value) !== digest) return null;
  const author = state.revisions.find((row) => row.revision_no === answer.answeredAtRevision)?.created_by_key;
  return author !== undefined && state.members.some((member) => member.principalKey === author && member.roles.includes("owner")) ? author : null;
}

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (status: A4ReadinessItem["status"], fields: Fields): A4ReadinessItem => ({
  id: "profile_no_widening", status, kind: null, reasonCodes: [], section: "implementation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: false, bound: false, ...fields
} as A4ReadinessItem);

/** `profile_no_widening` (design §10.3 Readiness): informational; a widening is refused and shown as scope_changed until an owner accepts exactly it. */
export function permissionItems(state: A4ReadinessState): A4ReadinessItem[] {
  const { spec, answers } = adaptSpecOf(state);
  const facts = permissionsOf(spec);
  if (facts === null) return [item("WAITING", { kind: "evidence_missing", reasonCodes: ["PRODUCED_AT_UNDERSTAND"] })];
  if (facts.error !== null || facts.wideningsSha256 === null) {
    return [item("NOT_EVALUATED", { kind: facts.error === "PROFILE_STATION_UNKNOWN" ? "not_evaluated" : "source_unavailable", reasonCodes: [facts.error ?? "PROFILE_NOT_EVALUATED"],
      nextAction: { label: facts.error === "PROFILE_STATION_UNKNOWN" ? "Answer the primary station (or carry a station from Aspire) to compare the station's operating profile with your signed configs"
        : "The operating profile's dry run could not run; Understand again once the cause is fixed (owner mode, an unlocked vault, configs that verify)" } })];
  }
  const station = `STATION:${facts.station ?? "unknown"}`;
  if (facts.widenings.length === 0) return [item("READY", { reasonCodes: ["NO_WIDENING", station] })];
  const accepted = acceptedBy(state, answers, facts.wideningsSha256);
  const named = facts.widenings.slice(0, 8).map((entry) => `WIDENING:${entry.split(":")[0] ?? "config"}`);
  if (accepted !== null) {
    return [item("READY", { kind: "scope_changed", reasonCodes: ["POLICY_WIDENING_ACCEPTED", `ACCEPTED_BY:${accepted}`, `WIDENINGS:${facts.widenings.length}`, station, ...named],
      nextAction: { label: "An owner accepted these widenings in the revision. A4 never activates a widening profile: activation stays the owner's command after review",
        command: `amc domain apply --agent ${state.project.agent_id} --activate-profile ${facts.profilePath ?? "<profile>"} --allow-widening` } })];
  }
  return [item("BLOCKED", { kind: "scope_changed", reasonCodes: ["POLICY_WIDENING_REFUSED", `WIDENINGS:${facts.widenings.length}`,
    `WIDENINGS_SHA:${facts.wideningsSha256.slice(0, 16)}`, station, ...named],
    nextAction: { label: `activateOperatingProfile({ allowWidening: false }) refuses these ${facts.widenings.length} widening(s). To accept them, a project owner answers acceptWidenings with ${facts.wideningsSha256}` } })];
}

/** Rebuilt only to compare: the generatedAt Understand uses, the project's creation time (deterministic bytes). */
export const profileGeneratedAt = (state: A4ReadinessState): string => new Date(state.project.created_ts).toISOString();
