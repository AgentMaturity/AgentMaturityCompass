/**
 * Adapt's permissions (P1-61 slice B; design §10.3 Understand, Explain and Review): the station operating profile
 * (buildOperatingProfile) for the primary station, built in memory and compared with the current verified configs by
 * planActivationWidenings, the read-only view of the comparison activateOperatingProfile runs (no write closure leaves
 * that module). Nothing is written and nothing is signed: the auditor
 * signature activateOperatingProfile treats as proof of review stays the owner's `amc domain apply --sign-profile` on a
 * profile they emitted and reviewed. The bytes compared are a pure function of the station, the agent and the project's
 * creation time. A widening is refused (`scope_changed`, POLICY_WIDENING_REFUSED) unless a project owner's answer accepts
 * exactly that list (its digest), and A4 never activates a profile: activation stays the owner's
 * `amc domain apply --activate-profile` after review. Not built yet (follow-up KEY:A4_PROFILE_EFFECT): the effect
 * a4.adapt.activate_profile, the per-agent gatePolicy.json and lease-cap proposal, and the prompt-pack build.
 */
import { closeSync, constants, lstatSync, openSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { planActivationWidenings } from "../domains/operatingProfiles/operatingProfileActivation.js";
import { buildOperatingProfile } from "../domains/operatingProfiles/operatingProfileBuilder.js";
import { OPERATING_PROFILE_DIR } from "../domains/operatingProfiles/operatingProfileEmit.js";
import { isStation, type Station } from "../domains/stations.js";
import { boundedRead } from "../standard/externalEvidenceFiles.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { A4ReadinessItem, A4ReadinessState } from "./a4Readiness.js";
import type { A4Answer } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { adaptSpecOf, factAnswer, factList, factTerm, understandingOf } from "./spec/adapt.js";
import { textValue } from "./spec/aspire.js";

const MAX_WIDENINGS = 64;
const MAX_PROFILE_BYTES = 4 * 1024 * 1024;
const PROFILE_FILE = /^a4-[a-z]+\.operating-profile\.json$/;
const ACTIVATION_FILE = /\.activation\.json$/;
/** The follow-up that applies a profile through an A4 effect gate (design §6.1 a4.adapt.activate_profile). */
export const PROFILE_EFFECT_KEY = "A4_PROFILE_EFFECT";

/** What Understand records about the profile comparison; `error` is a code, never a path or a message. */
export interface AdaptPermissionsFacts {
  readonly station: string | null;
  /** sha256 of the profile bytes compared (as `domain apply --profile-out` would write them with the same generatedAt). */
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
  return /does not verify/.test(text) ? "CONFIG_UNTRUSTED" : /inconsistent/.test(text) ? "PROFILE_INCONSISTENT" : errorCodeOf(error, "PROFILE_DRY_RUN_FAILED");
}

/**
 * Understand's comparison (read-only: no file, no signature): the widenings the current verified configs would take
 * from the station's profile, and the configs activation would write. A step that cannot run is a code.
 */
export function permissionsDryRun(input: { workspace: string; agentId: string; station: Station | null; generatedAt: string }): AdaptPermissionsFacts {
  const none = { profileSha256: null, riskTier: null, widenings: [], wideningsSha256: null, configs: [] };
  if (input.station === null) return { station: null, ...none, error: "PROFILE_STATION_UNKNOWN" };
  try {
    const profile = buildOperatingProfile({ station: input.station, agentId: input.agentId, generatedAt: input.generatedAt });
    if (!profile.consistency.ok) return { station: input.station, ...none, error: "PROFILE_INCONSISTENT" };
    const { configs, widenings: found } = planActivationWidenings(input.workspace, profile, input.agentId);
    const widenings = found.slice(0, MAX_WIDENINGS).map((entry) => entry.slice(0, 300));
    return { station: input.station, profileSha256: sha256Hex(`${JSON.stringify(profile, null, 2)}\n`), riskTier: profile.riskTier, widenings,
      wideningsSha256: sha256Hex(canonicalize(found)), configs, error: null };
  } catch (error) {
    return { station: input.station, ...none, error: profileCode(error) };
  }
}

/** A regular file (never a link, a FIFO or a device), read once through one descriptor, bounded. */
function regularFileBytes(path: string): Buffer {
  if (!lstatSync(path).isFile()) throw Object.assign(new Error("not a regular file"), { code: "NOT_REGULAR_FILE" });
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    return boundedRead(fd, MAX_PROFILE_BYTES);
  } finally {
    closeSync(fd);
  }
}

/**
 * sha256 over the named files of the agent's operating-profile directory (name and bytes), null when there are none. The
 * directory sits outside `.amc/` and is writable by the agent, so the directory and its parent must be real directories
 * (lstat) and each named entry a regular file, opened without following a link and size-capped; anything else is
 * 409 RESOURCE_UNREADABLE, never a hang or a read outside.
 */
function dirDigest(workspace: string, agentId: string, pattern: RegExp, slot: string): string | null {
  const unreadable = (error: unknown): A4StoreError => new A4StoreError(409, "RESOURCE_UNREADABLE",
    `${slot} (the agent's operating profiles) could not be read (${(error as NodeJS.ErrnoException).code ?? "unknown error"})`);
  const dir = agentDir(workspace, agentId);
  let names: string[];
  try {
    for (const path of [join(workspace, OPERATING_PROFILE_DIR), dir]) {
      if (!lstatSync(path).isDirectory()) throw Object.assign(new Error("not a directory"), { code: "NOT_A_DIRECTORY" });
    }
    names = readdirSync(dir).filter((name) => pattern.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw unreadable(error);
  }
  if (names.length === 0) return null;
  try {
    return sha256Hex(canonicalize(names.map((name) => [name, sha256Hex(regularFileBytes(join(dir, name)))])));
  } catch (error) {
    throw unreadable(error);
  }
}
/** `operatingProfile.sha256`: the agent's `a4-<station>` profile files (the ones an owner emits for A4's station and signs). */
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
        : "The operating profile could not be compared with your signed configs; Understand again once the cause is fixed (configs that verify)" } })];
  }
  const station = `STATION:${facts.station ?? "unknown"}`;
  if (facts.widenings.length === 0) return [item("READY", { reasonCodes: ["NO_WIDENING", station, `KEY:${PROFILE_EFFECT_KEY}`] })];
  const accepted = acceptedBy(state, answers, facts.wideningsSha256);
  const named = facts.widenings.slice(0, 8).map((entry) => `WIDENING:${entry.split(":")[0] ?? "config"}`);
  if (accepted !== null) {
    return [item("READY", { kind: "scope_changed", reasonCodes: ["POLICY_WIDENING_ACCEPTED", `ACCEPTED_BY:${accepted}`, `WIDENINGS:${facts.widenings.length}`, station, ...named,
      `KEY:${PROFILE_EFFECT_KEY}`],
      nextAction: { label: "An owner accepted these widenings in the revision. A4 writes, signs and activates no profile: an owner emits the station's profile, "
        + "reviews it, signs it (amc domain apply --sign-profile) and activates it",
        command: `amc domain apply --agent ${state.project.agent_id} --activate-profile <the profile you reviewed and signed> --allow-widening` } })];
  }
  return [item("BLOCKED", { kind: "scope_changed", reasonCodes: ["POLICY_WIDENING_REFUSED", `WIDENINGS:${facts.widenings.length}`,
    `WIDENINGS_SHA:${facts.wideningsSha256.slice(0, 16)}`, station, ...named],
    nextAction: { label: `activateOperatingProfile({ allowWidening: false }) refuses these ${facts.widenings.length} widening(s). To accept them, a project owner answers acceptWidenings with ${facts.wideningsSha256}` } })];
}

/** Rebuilt only to compare: the generatedAt Understand uses, the project's creation time (deterministic bytes). */
export const profileGeneratedAt = (state: A4ReadinessState): string => new Date(state.project.created_ts).toISOString();
