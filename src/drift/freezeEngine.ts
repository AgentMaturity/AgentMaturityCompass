import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { assertOwnerMode } from "../mode/mode.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { prepareFreezeSignature, prepareFreezeSignatureAsync, type PreparedFreezeSignature } from "./freezePreparation.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import type { ActionClass } from "../types.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { killSwitchFrozenClasses } from "../runtime/killSwitch.js";

const incidentSchema = z.object({
  v: z.literal(1),
  incidentId: z.string().min(1),
  agentId: z.string().min(1),
  createdTs: z.number().int(),
  ruleId: z.string().min(1),
  previousRunId: z.string().min(1),
  currentRunId: z.string().min(1),
  deltas: z.object({
    overallDrop: z.number(),
    integrityDrop: z.number(),
    correlationDrop: z.number(),
    maxLayerDrop: z.number()
  }),
  remediation: z.object({
    concept: z.array(z.string()),
    culture: z.array(z.string()),
    capabilities: z.array(z.string()),
    configuration: z.array(z.string())
  }),
  freeze: z.object({
    active: z.boolean(),
    actionClasses: z.array(
      z.enum([
        "READ_ONLY",
        "WRITE_LOW",
        "WRITE_HIGH",
        "DEPLOY",
        "SECURITY",
        "FINANCIAL",
        "NETWORK_EXTERNAL",
        "DATA_EXPORT",
        "IDENTITY"
      ])
    ),
    reason: z.string()
  }),
  signature: z.string().min(1)
});

export type FreezeIncident = z.infer<typeof incidentSchema>;

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function incidentsDir(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "incidents");
}

function incidentPath(workspace: string, agentId: string, incidentId: string): string {
  return join(incidentsDir(workspace, agentId), `${incidentId}.json`);
}

function incidentLiftPath(workspace: string, agentId: string, incidentId: string): string {
  return join(incidentsDir(workspace, agentId), `${incidentId}.lift.json`);
}

/** Historical local admission, never a carried signer or broad auditor-purpose union. */
function freezeKeys(workspace: string): string[] {
  assertKeysetComplete(workspace);
  const keys = getPurposeKeyHistory(workspace, "artifact-seal");
  if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
    const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
    keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
  }
  return keys;
}

function recordBytes(path: string): Buffer | null {
  try { return readFileSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function matches(path: string, expected: Buffer | null): boolean {
  const current = recordBytes(path); return expected === null ? current === null : current !== null && expected.equals(current);
}
function publishRecord(workspace: string, agentId: string, target: string, expected: Buffer | null,
  body: unknown, signed: PreparedFreezeSignature, beforePublish: () => void, source?: { path: string; bytes: Buffer }): void {
  const bytes = JSON.stringify(body, null, 2), root = dirname(target);
  withControlFileLock({ root, name: "freeze-publication", operation: () => {
    beforePublish();
    if (incidentsDir(workspace, agentId) !== root) throw new Error("selected freeze publication directory changed while signing was prepared");
    signed.assertCurrent();
    if ((source !== undefined && !matches(source.path, source.bytes)) || !matches(target, expected))
      throw new Error("freeze source or destination changed while signing was prepared");
    writeFileAtomic(target, bytes, 0o644);
  } });
}

/** Preparation-only old source/target negative. No signer, await or positive authority enters this short lock. */
function freezePreparationGuard(prepared: { workspace: string; agentId: string; target: string; expected: Buffer | null;
  source?: { path: string; bytes: Buffer } }, beforePublish: () => void): () => void {
  return () => withControlFileLock({ root: dirname(prepared.target), name: "freeze-publication", operation: () => {
    beforePublish();
    if (incidentsDir(prepared.workspace, prepared.agentId) !== dirname(prepared.target))
      throw new Error("selected freeze publication directory changed while signing was prepared");
    if ((prepared.source !== undefined && !matches(prepared.source.path, prepared.source.bytes)) || !matches(prepared.target, prepared.expected))
      throw new Error("freeze source or destination changed while signing was prepared");
  } });
}
export function verifyIncidentSignature(workspace: string, incident: FreezeIncident): boolean {
  const payload: Omit<FreezeIncident, "signature"> = {
    v: incident.v,
    incidentId: incident.incidentId,
    agentId: incident.agentId,
    createdTs: incident.createdTs,
    ruleId: incident.ruleId,
    previousRunId: incident.previousRunId,
    currentRunId: incident.currentRunId,
    deltas: incident.deltas,
    remediation: incident.remediation,
    freeze: incident.freeze
  };
  const digest = sha256Hex(canonicalize(payload));
  try { return verifyHexDigestAny(digest, incident.signature, freezeKeys(workspace)); } catch { return false; }
}

interface CreateFreezeIncidentParams {
  workspace: string;
  agentId?: string;
  ruleId: string;
  previousRunId: string;
  currentRunId: string;
  deltas: {
    overallDrop: number;
    integrityDrop: number;
    correlationDrop: number;
    maxLayerDrop: number;
  };
  actionClasses: ActionClass[];
  reason: string;
  remediation?: FreezeIncident["remediation"];
}

function prepareIncident(input: CreateFreezeIncidentParams) {
  const params = { ...input, deltas: { ...input.deltas }, actionClasses: [...input.actionClasses],
    ...(input.remediation === undefined ? {} : { remediation: { concept: [...input.remediation.concept], culture: [...input.remediation.culture],
      capabilities: [...input.remediation.capabilities], configuration: [...input.remediation.configuration] } }) };
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const payload: Omit<FreezeIncident, "signature"> = {
    v: 1,
    incidentId: `incident_${randomUUID().replace(/-/g, "")}`,
    agentId,
    createdTs: Date.now(),
    ruleId: params.ruleId,
    previousRunId: params.previousRunId,
    currentRunId: params.currentRunId,
    deltas: params.deltas,
    remediation: params.remediation ?? {
      concept: ["Clarify mission constraints and target posture for affected questions."],
      culture: ["Reinforce truth protocol and governance refusal behavior."],
      capabilities: ["Add regression eval coverage for failed assurance checks."],
      configuration: ["Tighten gateway/toolhub policies and re-run sandboxed evidence capture."]
    },
    freeze: {
      active: true,
      actionClasses: params.actionClasses,
      reason: params.reason
    }
  };
  const target = incidentPath(params.workspace, agentId, payload.incidentId), expected = recordBytes(target);
  if (expected !== null) throw new Error("freeze incident destination already exists");
  return { workspace: params.workspace, agentId, payload, target, expected, digest: sha256Hex(canonicalize(payload)) };
}

export function createFreezeIncident(params: CreateFreezeIncidentParams): FreezeIncident {
  return createFreezeIncidentForSnapshot(params, () => {});
}
/** Internal retained synchronous decision path; the guard only adds a used-input refusal. */
export function createFreezeIncidentForSnapshot(params: CreateFreezeIncidentParams, beforePublish: () => void): FreezeIncident {
  const prepared = prepareIncident(params); beforePublish();
  const signed = prepareFreezeSignature(prepared.workspace, prepared.digest), incident = { ...prepared.payload, signature: signed.signature };
  publishRecord(prepared.workspace, prepared.agentId, prepared.target, prepared.expected, incident, signed, beforePublish);
  return incident;
}

export async function createFreezeIncidentAsync(params: CreateFreezeIncidentParams): Promise<FreezeIncident> {
  return createFreezeIncidentForAuthority(params, () => {});
}

/** Internal maintained handoff. The callback only adds refusal; it supplies no signer or positive authority. */
export async function createFreezeIncidentForAuthority(params: CreateFreezeIncidentParams, beforePublish: () => void): Promise<FreezeIncident> {
  const prepared = prepareIncident(params); beforePublish();
  const signed = await prepareFreezeSignatureAsync(prepared.workspace, prepared.digest, freezePreparationGuard(prepared, beforePublish));
  const incident = { ...prepared.payload, signature: signed.signature };
  publishRecord(prepared.workspace, prepared.agentId, prepared.target, prepared.expected, incident, signed, beforePublish);
  return incident;
}

export function listIncidents(workspace: string, agentId?: string): FreezeIncident[] {
  const resolved = resolveAgentId(workspace, agentId);
  const dir = incidentsDir(workspace, resolved);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".lift.json"))
    .map((name) => {
      try {
        return incidentSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown);
      } catch {
        return null;
      }
    })
    .filter((row): row is FreezeIncident => row !== null)
    .sort((a, b) => b.createdTs - a.createdTs);
}

/** A freeze is lifted only by a lift record signed by the auditor key for this incident and agent; a bare file lifts nothing. */
function isLifted(workspace: string, agentId: string, incidentId: string): boolean {
  const path = incidentLiftPath(workspace, agentId, incidentId);
  if (!pathExists(path)) return false;
  try {
    const lift = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (lift.v !== 1 || lift.incidentId !== incidentId || lift.agentId !== agentId
      || typeof lift.liftedTs !== "number" || typeof lift.reason !== "string" || typeof lift.signature !== "string") return false;
    const digest = sha256Hex(canonicalize({ v: 1, incidentId, agentId, liftedTs: lift.liftedTs, reason: lift.reason }));
    return verifyHexDigestAny(digest, lift.signature, freezeKeys(workspace));
  } catch {
    return false;
  }
}

/**
 * Every class above READ_ONLY. An incident file that cannot be read or whose signature fails holds these until an operator
 * restores or removes it: tampering with a freeze must never lift it (fail closed).
 */
const INTEGRITY_FREEZE_CLASSES: readonly ActionClass[] = [
  "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"
];

function unreadableIncidentFiles(workspace: string, agentId: string): string[] {
  const dir = incidentsDir(workspace, agentId);
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".lift.json"))
    .filter((name) => {
      try {
        incidentSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown);
        return false;
      } catch {
        return true;
      }
    });
}

export function activeFreezeStatus(workspace: string, agentId?: string): {
  active: boolean;
  incidentIds: string[];
  actionClasses: ActionClass[];
  /** Incident files that could not be read or verified; each holds every class above READ_ONLY. */
  integrityProblems: string[];
} {
  const resolved = resolveAgentId(workspace, agentId);
  const incidents = listIncidents(workspace, resolved);
  const verified = incidents.filter((incident) => verifyIncidentSignature(workspace, incident));
  const active = verified.filter((incident) => incident.freeze.active && !isLifted(workspace, resolved, incident.incidentId));
  const integrityProblems = [
    ...unreadableIncidentFiles(workspace, resolved).map((name) => `unreadable incident file ${name}`),
    ...incidents.filter((incident) => !verified.includes(incident)).map((incident) => `incident ${incident.incidentId} signature invalid`)
  ];
  // P2-26: an active kill switch freezes its classes here too, so toolhub's incident-freeze path refuses them.
  const killed = killSwitchFrozenClasses(workspace, resolved, ["READ_ONLY", ...INTEGRITY_FREEZE_CLASSES]);
  const actionClasses = [...new Set([
    ...active.flatMap((incident) => incident.freeze.actionClasses),
    ...(integrityProblems.length > 0 ? INTEGRITY_FREEZE_CLASSES : []),
    ...killed.classes
  ])] as ActionClass[];
  return {
    active: active.length > 0 || integrityProblems.length > 0 || killed.classes.length > 0,
    incidentIds: [...active.map((incident) => incident.incidentId), ...(integrityProblems.length > 0 ? ["integrity"] : []), ...killed.ids],
    actionClasses,
    integrityProblems
  };
}

interface LiftFreezeParams { workspace: string; agentId?: string; incidentId: string; reason: string }

function prepareLift(input: LiftFreezeParams) {
  const params = { ...input }, agentId = resolveAgentId(params.workspace, params.agentId);
  const sourcePath = incidentPath(params.workspace, agentId, params.incidentId), sourceBytes = recordBytes(sourcePath);
  if (sourceBytes === null) throw new Error(`Incident not found: ${params.incidentId}`);
  const incident = incidentSchema.parse(JSON.parse(sourceBytes.toString("utf8")));
  if (incident.incidentId !== params.incidentId || incident.agentId !== agentId || !verifyIncidentSignature(params.workspace, incident))
    throw new Error(`Incident signature invalid: ${params.incidentId}`);
  const payload = { v: 1, incidentId: incident.incidentId, agentId, liftedTs: Date.now(), reason: params.reason };
  const target = incidentLiftPath(params.workspace, agentId, params.incidentId);
  return { workspace: params.workspace, agentId, payload, target, expected: recordBytes(target),
    source: { path: sourcePath, bytes: sourceBytes }, digest: sha256Hex(canonicalize(payload)) };
}

export function liftFreeze(params: LiftFreezeParams): { liftPath: string } {
  const prepared = prepareLift(params), signed = prepareFreezeSignature(prepared.workspace, prepared.digest);
  publishRecord(prepared.workspace, prepared.agentId, prepared.target, prepared.expected, { ...prepared.payload, signature: signed.signature }, signed, () => {}, prepared.source);
  return { liftPath: prepared.target };
}

export async function liftFreezeAsync(params: LiftFreezeParams): Promise<{ liftPath: string }> {
  return liftFreezeForAuthority(params, () => {});
}

/** Internal trusted caller handoff; mode and original purpose remain mandatory after the caller guard. */
export async function liftFreezeForAuthority(input: LiftFreezeParams, beforePublish: () => void): Promise<{ liftPath: string }> {
  const params = { ...input }; assertOwnerMode(params.workspace, "freeze lift");
  const prepared = prepareLift(params); beforePublish(); assertOwnerMode(prepared.workspace, "freeze lift");
  const signed = await prepareFreezeSignatureAsync(prepared.workspace, prepared.digest,
    freezePreparationGuard(prepared, () => { beforePublish(); assertOwnerMode(prepared.workspace, "freeze lift"); }));
  publishRecord(prepared.workspace, prepared.agentId, prepared.target, prepared.expected, { ...prepared.payload, signature: signed.signature }, signed,
    () => { beforePublish(); assertOwnerMode(prepared.workspace, "freeze lift"); }, prepared.source);
  return { liftPath: prepared.target };
}
