import { join, resolve } from "node:path";
import { z } from "zod";
import { artifactSigPath, signArtifactFile, verifyArtifactFileSignature } from "../lifecycle/artifactSignature.js";
import { ControlFileLockError, withControlFileLock } from "../lifecycle/controlFileLock.js";
import {
  SignedControlJournalError,
  appendSignedControlJournal,
  controlCheckpointDir,
  readSignedControlJournal,
  type SignedControlJournalSnapshot
} from "../lifecycle/signedControlJournal.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { AVAILABLE_GUARDRAILS, GUARDRAIL_PROFILES } from "./guardrailProfiles.js";

export const GUARDRAIL_CONTROL_SCHEMA_VERSION = "2026-07-10" as const;

export const GUARDRAIL_RUNTIME_BINDINGS = {
  "prompt-injection-detection": "promptInjection",
  "data-exfiltration-guard": "secretExposure",
  "context-window-guard": "payloadAnomaly"
} as const;

export type BoundGuardrailName = keyof typeof GUARDRAIL_RUNTIME_BINDINGS;
export type GuardrailRuntimeRuleKey = typeof GUARDRAIL_RUNTIME_BINDINGS[BoundGuardrailName];
export type GuardrailControlSource = "cli" | "api" | "studio";

const guardrailControlStateSchema = z.object({
  schemaVersion: z.literal(GUARDRAIL_CONTROL_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  requestedGuardrails: z.array(z.string().min(1)).max(AVAILABLE_GUARDRAILS.length),
  activeProfile: z.string().min(1).nullable(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.object({
    source: z.enum(["cli", "api", "studio"]),
    actor: z.string().min(1).max(200)
  }).strict()
}).strict();

export type GuardrailControlState = z.infer<typeof guardrailControlStateSchema>;

export interface GuardrailControlSnapshot {
  integrity: "uninitialized" | "trusted" | "invalid";
  initialized: boolean;
  state: GuardrailControlState | null;
  path: string;
  signaturePath: string;
  headRevision: number | null;
  headPath: string | null;
  checkpointPath: string | null;
  reason: string;
}

export type GuardrailControlErrorCode =
  | "INTEGRITY"
  | "LOCK_TIMEOUT"
  | "UNKNOWN_GUARDRAIL"
  | "UNBOUND_GUARDRAIL"
  | "UNKNOWN_PROFILE";

export class GuardrailControlError extends Error {
  readonly code: GuardrailControlErrorCode;

  constructor(code: GuardrailControlErrorCode, message: string) {
    super(message);
    this.name = "GuardrailControlError";
    this.code = code;
  }
}

export function isGuardrailControlError(value: unknown): value is GuardrailControlError {
  return value instanceof GuardrailControlError;
}

export function guardrailControlRoot(workspace: string): string {
  return join(resolve(workspace), ".amc", "guardrails");
}

export function guardrailControlStatePath(workspace: string): string {
  return join(guardrailControlRoot(workspace), "control-state.json");
}

export function guardrailControlHeadsDir(workspace: string): string {
  return join(guardrailControlRoot(workspace), "heads");
}

function withGuardrailControlLock<T>(workspace: string, operation: () => T): T {
  try {
    return withControlFileLock({
      root: guardrailControlRoot(workspace),
      name: "control-state",
      operation
    });
  } catch (error) {
    if (error instanceof ControlFileLockError) {
      throw new GuardrailControlError("LOCK_TIMEOUT", "Guardrail control state is busy; retry the operation.");
    }
    throw error;
  }
}

export function isBoundGuardrailName(name: string): name is BoundGuardrailName {
  return Object.prototype.hasOwnProperty.call(GUARDRAIL_RUNTIME_BINDINGS, name);
}

function validateState(raw: unknown): GuardrailControlState {
  let parsed: GuardrailControlState;
  try {
    parsed = guardrailControlStateSchema.parse(raw);
  } catch (error) {
    throw new GuardrailControlError(
      "INTEGRITY",
      `Guardrail control state integrity check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const known = new Set(AVAILABLE_GUARDRAILS.map((guardrail) => guardrail.name));
  const unique = new Set(parsed.requestedGuardrails);
  if (unique.size !== parsed.requestedGuardrails.length) {
    throw new GuardrailControlError("INTEGRITY", "Guardrail control state integrity check failed: duplicate guardrail IDs.");
  }
  const unknown = parsed.requestedGuardrails.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new GuardrailControlError(
      "INTEGRITY",
      `Guardrail control state integrity check failed: unknown guardrail IDs: ${unknown.join(", ")}.`
    );
  }
  const unbound = parsed.requestedGuardrails.filter((name) => !isBoundGuardrailName(name));
  if (unbound.length > 0) {
    throw new GuardrailControlError(
      "INTEGRITY",
      `Guardrail control state integrity check failed: catalog-only guardrail IDs: ${unbound.join(", ")}.`
    );
  }
  if (parsed.activeProfile && !GUARDRAIL_PROFILES.some((profile) => profile.name === parsed.activeProfile)) {
    throw new GuardrailControlError(
      "INTEGRITY",
      `Guardrail control state integrity check failed: unknown profile ${parsed.activeProfile}.`
    );
  }
  return {
    ...parsed,
    requestedGuardrails: [...parsed.requestedGuardrails].sort((left, right) => left.localeCompare(right))
  };
}

function readJournal(workspace: string, recoverPendingPublication = false): SignedControlJournalSnapshot<GuardrailControlState> {
  try {
    return readSignedControlJournal({
      workspace,
      controlKind: "guardrail-control",
      journalDir: guardrailControlHeadsDir(workspace),
      parsePayload: validateState,
      recoverPendingPublication
    });
  } catch (error) {
    if (error instanceof GuardrailControlError) throw error;
    if (error instanceof SignedControlJournalError) {
      throw new GuardrailControlError("INTEGRITY", `Guardrail control state integrity check failed: ${error.message}`);
    }
    throw error;
  }
}

function mirrorStatus(workspace: string, state: GuardrailControlState): string {
  const path = guardrailControlStatePath(workspace);
  const verification = verifyArtifactFileSignature({
    workspace,
    path,
    artifactKind: "guardrail-control-state",
    requireDomainSeparated: true
  });
  if (!verification.valid) return `Compatibility mirror unavailable: ${verification.reason ?? "invalid"}.`;
  try {
    const mirror = validateState(JSON.parse(readUtf8(path)) as unknown);
    if (canonicalize(mirror) !== canonicalize(state)) return "Compatibility mirror is stale; canonical signed journal remains authoritative.";
    return "Compatibility mirror is valid.";
  } catch (error) {
    return `Compatibility mirror unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function readGuardrailControlStateUnlocked(workspace: string, recoverPendingPublication = false): GuardrailControlSnapshot {
  const path = guardrailControlStatePath(workspace);
  const signaturePath = artifactSigPath(path);
  const journal = readJournal(workspace, recoverPendingPublication);
  if (journal.integrity === "uninitialized") {
    if (pathExists(path) || pathExists(signaturePath)) {
      throw new GuardrailControlError(
        "INTEGRITY",
        "Guardrail control state integrity check failed: uncheckpointed control artifacts exist."
      );
    }
    return {
      integrity: "uninitialized",
      initialized: false,
      state: null,
      path,
      signaturePath,
      headRevision: null,
      headPath: null,
      checkpointPath: null,
      reason: "No signed guardrail control state has been initialized."
    };
  }
  const state = journal.payload!;
  if (state.revision !== journal.revision) {
    throw new GuardrailControlError("INTEGRITY", "Guardrail control state revision does not match its host-local checkpoint.");
  }
  return {
    integrity: "trusted",
    initialized: true,
    state,
    path,
    signaturePath,
    headRevision: journal.revision,
    headPath: journal.entryPath,
    checkpointPath: journal.checkpointPath,
    reason: `${journal.reason} ${mirrorStatus(workspace, state)}`
  };
}

export function readGuardrailControlState(workspace: string): GuardrailControlSnapshot {
  return withGuardrailControlLock(workspace, () => readGuardrailControlStateUnlocked(workspace));
}

export function recoverGuardrailControlState(workspace: string): GuardrailControlSnapshot {
  return withGuardrailControlLock(workspace, () => readGuardrailControlStateUnlocked(workspace, true));
}

function invalidInspection(workspace: string, error: unknown): GuardrailControlSnapshot {
  const path = guardrailControlStatePath(workspace);
  return {
    integrity: "invalid",
    initialized: pathExists(path)
      || pathExists(artifactSigPath(path))
      || pathExists(guardrailControlHeadsDir(workspace))
      || pathExists(controlCheckpointDir(workspace, "guardrail-control")),
    state: null,
    path,
    signaturePath: artifactSigPath(path),
    headRevision: null,
    headPath: null,
    checkpointPath: null,
    reason: error instanceof Error ? error.message : String(error)
  };
}

export function inspectGuardrailControlState(workspace: string): GuardrailControlSnapshot {
  try {
    return readGuardrailControlState(workspace);
  } catch (error) {
    return invalidInspection(workspace, error);
  }
}

export function inspectGuardrailControlStateReadOnly(workspace: string): GuardrailControlSnapshot {
  try {
    return readGuardrailControlStateUnlocked(workspace);
  } catch (error) {
    return invalidInspection(workspace, error);
  }
}

function assertKnownBoundGuardrail(name: string): asserts name is BoundGuardrailName {
  if (!AVAILABLE_GUARDRAILS.some((guardrail) => guardrail.name === name)) {
    throw new GuardrailControlError("UNKNOWN_GUARDRAIL", `Unknown guardrail: ${name}`);
  }
  if (!isBoundGuardrailName(name)) {
    throw new GuardrailControlError(
      "UNBOUND_GUARDRAIL",
      `Guardrail ${name} is catalog-only and not runtime-bound; AMC will not claim it is active.`
    );
  }
}

function writeMirror(workspace: string, state: GuardrailControlState): void {
  const path = guardrailControlStatePath(workspace);
  try {
    writeFileAtomic(path, `${JSON.stringify(state, null, 2)}\n`, 0o600);
    signArtifactFile({ workspace, path, artifactKind: "guardrail-control-state" });
  } catch (error) {
    process.emitWarning(`Guardrail state committed, but compatibility mirror refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function commitState(workspace: string, state: GuardrailControlState): GuardrailControlState {
  const validated = validateState(state);
  const previous = readJournal(workspace, true);
  if (validated.revision !== previous.revision + 1) {
    throw new GuardrailControlError("INTEGRITY", "Guardrail control revision changed during mutation.");
  }
  appendSignedControlJournal({
    workspace,
    controlKind: "guardrail-control",
    journalDir: guardrailControlHeadsDir(workspace),
    previous,
    payload: validated
  });
  writeMirror(workspace, validated);
  return validated;
}

function nextBaseState(snapshot: GuardrailControlSnapshot): GuardrailControlState {
  return snapshot.state ?? {
    schemaVersion: GUARDRAIL_CONTROL_SCHEMA_VERSION,
    revision: 0,
    requestedGuardrails: [],
    activeProfile: null,
    updatedAt: new Date(0).toISOString(),
    updatedBy: { source: "cli", actor: "bootstrap" }
  };
}

export function setGuardrailRequested(input: {
  workspace: string;
  name: string;
  enabled: boolean;
  source: GuardrailControlSource;
  actor: string;
}): GuardrailControlState {
  assertKnownBoundGuardrail(input.name);
  return withGuardrailControlLock(input.workspace, () => {
    const snapshot = readGuardrailControlStateUnlocked(input.workspace, true);
    const current = nextBaseState(snapshot);
    const requested = new Set(current.requestedGuardrails);
    if (input.enabled) requested.add(input.name);
    else requested.delete(input.name);
    return commitState(input.workspace, {
      schemaVersion: GUARDRAIL_CONTROL_SCHEMA_VERSION,
      revision: current.revision + 1,
      requestedGuardrails: [...requested].sort((left, right) => left.localeCompare(right)),
      activeProfile: null,
      updatedAt: new Date().toISOString(),
      updatedBy: { source: input.source, actor: input.actor.trim() || "local-user" }
    });
  });
}

export function applyGuardrailControlProfile(input: {
  workspace: string;
  profileName: string;
  source: GuardrailControlSource;
  actor: string;
}): { state: GuardrailControlState; unsupported: string[] } {
  const profile = GUARDRAIL_PROFILES.find((candidate) => candidate.name === input.profileName);
  if (!profile) {
    throw new GuardrailControlError("UNKNOWN_PROFILE", `Unknown guardrail profile: ${input.profileName}`);
  }
  const requested = profile.guardrails.filter(isBoundGuardrailName).sort((left, right) => left.localeCompare(right));
  const unsupported = profile.guardrails.filter((name) => !isBoundGuardrailName(name)).sort((left, right) => left.localeCompare(right));
  const state = withGuardrailControlLock(input.workspace, () => {
    const snapshot = readGuardrailControlStateUnlocked(input.workspace, true);
    const current = nextBaseState(snapshot);
    return commitState(input.workspace, {
      schemaVersion: GUARDRAIL_CONTROL_SCHEMA_VERSION,
      revision: current.revision + 1,
      requestedGuardrails: requested,
      activeProfile: profile.name,
      updatedAt: new Date().toISOString(),
      updatedBy: { source: input.source, actor: input.actor.trim() || "local-user" }
    });
  });
  return { state, unsupported };
}
