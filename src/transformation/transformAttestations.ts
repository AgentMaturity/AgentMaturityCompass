import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { z } from "zod";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { assertOwnerMode } from "../mode/mode.js";
import { captureTransformRelatedFiles } from "./transformInputs.js";
import { prepareTransformPairs, publishTransformPairs, finishTransformPublication, type TransformPublicationChecks } from "./transformPublication.js";
import type { TransformPlan } from "./transformTasks.js";

export const transformAttestationSchema = z.object({
  v: z.literal(1),
  attestationId: z.string().min(1),
  scope: z.object({
    type: z.enum(["AGENT", "NODE"]),
    agentId: z.string().optional(),
    nodeId: z.string().optional()
  }),
  taskId: z.string().min(1),
  createdTs: z.number().int(),
  createdByUser: z.string().min(1),
  role: z.enum(["OWNER", "AUDITOR"]),
  statement: z.string().min(1),
  evidenceLinks: z.array(z.string()).default([]),
  hashes: z.object({
    relatedFiles: z
      .array(
        z.object({
          path: z.string().min(1),
          sha256: z.string().length(64)
        })
      )
      .default([])
  })
});

export type TransformAttestation = z.infer<typeof transformAttestationSchema>;

function transformAttestationsDir(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): string {
  if (scope.type === "AGENT") {
    return join(workspace, ".amc", "agents", scope.agentId, "transform", "attestations");
  }
  return join(workspace, ".amc", "org", "transform", scope.nodeId, "attestations");
}

export function writeTransformAttestation(params: {
  workspace: string;
  scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string };
  taskId: string;
  statement: string;
  createdByUser: string;
  role: "OWNER" | "AUDITOR";
  files?: string[];
  evidenceLinks?: string[];
  plan?: TransformPlan | null;
}): {
  attestation: TransformAttestation;
  path: string;
  sigPath: string;
} {
  const relatedFiles = (params.files ?? [])
    .map((file) => resolve(params.workspace, file))
    .filter((file) => pathExists(file))
    .map((file) => ({
      path: file,
      sha256: sha256Hex(readFileSync(file))
    }));

  const attestation = transformAttestationSchema.parse({
    v: 1,
    attestationId: `att_${Date.now()}_${randomUUID().slice(0, 8)}`,
    scope: params.scope,
    taskId: params.taskId,
    createdTs: Date.now(),
    createdByUser: params.createdByUser,
    role: params.role,
    statement: params.statement,
    evidenceLinks: params.evidenceLinks ?? [],
    hashes: {
      relatedFiles
    }
  });

  const dir = transformAttestationsDir(params.workspace, params.scope);
  const path = join(dir, `${attestation.attestationId}.json`);
  publishTransformPairs(params.workspace, "transform attest", [{ path, bytes: Buffer.from(JSON.stringify(attestation, null, 2)) }]);
  const sigPath = `${path}.sig`;

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "TRANSFORM_TASK_ATTESTED",
    agentId: params.scope.type === "AGENT" ? params.scope.agentId : `node:${params.scope.nodeId}`,
    artifact: {
      kind: "policy",
      sha256: sha256Hex(readUtf8(path)),
      id: attestation.attestationId
    }
  });

  void dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: "TRANSFORM_TASK_ATTESTED",
    agentId: params.scope.type === "AGENT" ? params.scope.agentId : `node:${params.scope.nodeId}`,
    summary: `Transformation task attested (${params.taskId})`,
    details: {
      attestationId: attestation.attestationId,
      taskId: params.taskId,
      role: params.role,
      createdByUser: params.createdByUser,
      planId: params.plan?.planId ?? null
    }
  }).catch(() => undefined);

  return {
    attestation,
    path,
    sigPath
  };
}

export function verifyTransformAttestation(workspace: string, path: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
  attestation: TransformAttestation | null;
} {
  const verified = verifySignedFileWithAuditor(workspace, path);
  let attestation: TransformAttestation | null = null;
  if (verified.valid) {
    try {
      attestation = transformAttestationSchema.parse(JSON.parse(readUtf8(path)) as unknown);
    } catch {
      return {
        ...verified,
        valid: false,
        reason: "attestation schema invalid",
        attestation: null
      };
    }
  }
  return {
    ...verified,
    attestation
  };
}

export function listTransformAttestations(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): TransformAttestation[] {
  const dir = transformAttestationsDir(workspace, scope);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name: string) => name.endsWith(".json"))
    .map((name: string) => {
      try {
        return transformAttestationSchema.parse(JSON.parse(readUtf8(join(dir, name))) as unknown);
      } catch {
        return null;
      }
    })
    .filter((row: TransformAttestation | null): row is TransformAttestation => row !== null)
    .sort((a, b) => b.createdTs - a.createdTs);
}

export function findLatestAttestationForTask(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }, taskId: string): TransformAttestation | null {
  return listTransformAttestations(workspace, scope).find((row) => row.taskId === taskId) ?? null;
}

export function attestationPathById(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }, attestationId: string): string {
  return join(transformAttestationsDir(workspace, scope), `${attestationId}.json`);
}

export async function writeTransformAttestationAsync(input: Parameters<typeof writeTransformAttestation>[0], checks: TransformPublicationChecks = {}) {
  const params = structuredClone(input), workspace = params.workspace;
  assertOwnerMode(workspace, "transform attest"); checks.beforePublish?.();
  const files = (params.files ?? []).map(file => resolve(workspace, file)), assertRelated = captureTransformRelatedFiles(files);
  const relatedFiles = files.filter(file => pathExists(file)).map(path => ({ path, sha256: sha256Hex(readFileSync(path)) }));
  const now = Date.now();
  const attestation = transformAttestationSchema.parse({ v: 1, attestationId: `att_${now}_${randomUUID().slice(0, 8)}`,
    scope: params.scope, taskId: params.taskId, createdTs: now, createdByUser: params.createdByUser, role: params.role,
    statement: params.statement, evidenceLinks: params.evidenceLinks ?? [], hashes: { relatedFiles } });
  assertRelated();
  const path = join(transformAttestationsDir(workspace, params.scope), `${attestation.attestationId}.json`), bytes = Buffer.from(JSON.stringify(attestation, null, 2));
  const prepared = await prepareTransformPairs(workspace, "transform attest", [{ path, bytes }], {
    beforePublish: checks.beforePublish, assertInputsCurrent() { checks.assertInputsCurrent?.(); assertRelated(); }
  });
  prepared.publish();
  const agentId = params.scope.type === "AGENT" ? params.scope.agentId : `node:${params.scope.nodeId}`;
  const secondaryWarnings = await finishTransformPublication(prepared, [path, `${path}.sig`], {
    workspace, type: "TRANSFORM_TASK_ATTESTED", agentId, artifact: { kind: "policy", sha256: sha256Hex(bytes), id: attestation.attestationId }
  }, [{ workspace, eventName: "TRANSFORM_TASK_ATTESTED", agentId, summary: `Transformation task attested (${params.taskId})`,
    details: { attestationId: attestation.attestationId, taskId: params.taskId, role: params.role, createdByUser: params.createdByUser, planId: params.plan?.planId ?? null } }]);
  return { attestation, path, sigPath: `${path}.sig`, secondaryWarnings };
}
