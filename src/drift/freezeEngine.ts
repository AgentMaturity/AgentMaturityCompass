import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import type { ActionClass } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

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

function signIncidentPayload(workspace: string, payload: Omit<FreezeIncident, "signature">): string {
  const digest = sha256Hex(canonicalize(payload));
  return signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
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
  return verifyHexDigestAny(digest, incident.signature, getPublicKeyHistory(workspace, "auditor"));
}

export function createFreezeIncident(params: {
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
}): FreezeIncident {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  ensureDir(incidentsDir(params.workspace, agentId));
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
  const incident: FreezeIncident = {
    ...payload,
    signature: signIncidentPayload(params.workspace, payload)
  };
  writeFileAtomic(incidentPath(params.workspace, agentId, incident.incidentId), JSON.stringify(incident, null, 2), 0o644);
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
    return verifyHexDigestAny(digest, lift.signature, getPublicKeyHistory(workspace, "auditor"));
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
  const actionClasses = [...new Set([
    ...active.flatMap((incident) => incident.freeze.actionClasses),
    ...(integrityProblems.length > 0 ? INTEGRITY_FREEZE_CLASSES : [])
  ])] as ActionClass[];
  return {
    active: active.length > 0 || integrityProblems.length > 0,
    incidentIds: [...active.map((incident) => incident.incidentId), ...(integrityProblems.length > 0 ? ["integrity"] : [])],
    actionClasses,
    integrityProblems
  };
}

export function liftFreeze(params: {
  workspace: string;
  agentId?: string;
  incidentId: string;
  reason: string;
}): { liftPath: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const incidents = listIncidents(params.workspace, agentId);
  const incident = incidents.find((item) => item.incidentId === params.incidentId);
  if (!incident) {
    throw new Error(`Incident not found: ${params.incidentId}`);
  }
  if (!verifyIncidentSignature(params.workspace, incident)) {
    throw new Error(`Incident signature invalid: ${params.incidentId}`);
  }
  const payload = {
    v: 1,
    incidentId: incident.incidentId,
    agentId,
    liftedTs: Date.now(),
    reason: params.reason
  };
  const digest = sha256Hex(canonicalize(payload));
  const signature = signHexDigest(digest, getPrivateKeyPem(params.workspace, "auditor"));
  const out = {
    ...payload,
    signature
  };
  const liftPath = incidentLiftPath(params.workspace, agentId, params.incidentId);
  writeFileAtomic(liftPath, JSON.stringify(out, null, 2), 0o644);
  return { liftPath };
}
