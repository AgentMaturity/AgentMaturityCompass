import { join, dirname } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor, type SignedFileVerification } from "../org/orgSigner.js";
import type { FourC } from "./fourCs.js";
import { FOUR_CS } from "./fourCs.js";

export const transformTaskStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "ATTESTED"
]);

export type TransformTaskStatus = z.infer<typeof transformTaskStatusSchema>;

const evidenceCheckpointSchema = z.object({
  kind: z.string().min(1)
}).passthrough();

const transformTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  fourC: z.enum(FOUR_CS),
  questionIds: z.array(z.string().min(1)).min(1),
  fromLevel: z.number().min(0).max(5),
  toLevel: z.number().min(0).max(5),
  priority: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  phase: z.string().min(1),
  impact: z.object({
    indices: z.record(z.string(), z.number()),
    value: z.record(z.string(), z.number())
  }),
  owners: z.object({
    primaryRole: z.enum(["OWNER", "OPERATOR", "APPROVER", "AUDITOR", "AGENT"]),
    secondaryRoles: z.array(z.enum(["OWNER", "OPERATOR", "APPROVER", "AUDITOR", "AGENT"])).default([])
  }),
  evidenceCheckpoints: z.array(evidenceCheckpointSchema).min(1),
  recommendedActions: z.array(z.string().min(1)).min(1),
  status: transformTaskStatusSchema,
  statusReason: z.string().default(""),
  evidenceRefs: z.object({
    eventHashes: z.array(z.string()).default([]),
    receipts: z.array(z.string()).default([]),
    artifacts: z
      .array(
        z.object({
          kind: z.string().min(1),
          sha256: z.string().min(1)
        })
      )
      .default([])
  }),
  createdFrom: z.object({
    interventionId: z.string().min(1),
    mapVersion: z.number().int().min(1)
  })
});

const transformSummarySchema = z.object({
  percentDone: z.number().min(0).max(100),
  by4C: z.object({
    Concept: z.number().min(0).max(100),
    Culture: z.number().min(0).max(100),
    Capabilities: z.number().min(0).max(100),
    Configuration: z.number().min(0).max(100)
  }),
  topBlockers: z.array(z.string()).default([]),
  next3Tasks: z.array(z.string()).default([])
});

export const transformPlanSchema = z.object({
  v: z.literal(1),
  planId: z.string().min(1),
  scope: z.object({
    type: z.enum(["AGENT", "NODE"]),
    agentId: z.string().optional(),
    nodeId: z.string().optional()
  }),
  createdTs: z.number().int(),
  windowDays: z.number().int().positive(),
  baseline: z.object({
    runId: z.string().min(1),
    overall: z.number().min(0).max(5),
    layers: z.record(z.string(), z.number()),
    integrityIndex: z.number().min(0).max(1),
    trustLabel: z.string().min(1),
    indices: z.record(z.string(), z.number()),
    value: z.object({
      ValueScore: z.number(),
      EconomicSignificanceIndex: z.number()
    })
  }),
  target: z.object({
    mode: z.enum(["SIGNED_EQUALIZER", "EXCELLENCE_5", "CUSTOM"]),
    questionTargets: z.record(z.string(), z.number().int().min(0).max(5))
  }),
  phases: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        fourC: z.array(z.enum(FOUR_CS)).min(1),
        taskIds: z.array(z.string().min(1)).default([])
      })
    )
    .min(1),
  tasks: z.array(transformTaskSchema).min(1),
  summary: transformSummarySchema,
  renewalCadence: z.enum(["weekly", "biweekly"])
});

export type TransformTask = z.infer<typeof transformTaskSchema>;
export type TransformPlan = z.infer<typeof transformPlanSchema>;

export function transformRootDir(workspace: string): string {
  return join(workspace, ".amc", "transform");
}

export function transformMapPath(workspace: string): string {
  return join(workspace, ".amc", "transform-map.yaml");
}

export function transformMapSigPath(workspace: string): string {
  return `${transformMapPath(workspace)}.sig`;
}

export function agentTransformDir(workspace: string, agentId: string): string {
  return join(workspace, ".amc", "agents", agentId, "transform");
}

export function nodeTransformDir(workspace: string, nodeId: string): string {
  return join(workspace, ".amc", "org", "transform", nodeId);
}

export function transformPlansDir(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): string {
  const root = scope.type === "AGENT" ? agentTransformDir(workspace, scope.agentId) : nodeTransformDir(workspace, scope.nodeId);
  return join(root, "plans");
}

export function transformSnapshotsDir(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): string {
  const root = scope.type === "AGENT" ? agentTransformDir(workspace, scope.agentId) : nodeTransformDir(workspace, scope.nodeId);
  return join(root, "snapshots");
}

export function transformLatestPlanPath(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): string {
  const root = scope.type === "AGENT" ? agentTransformDir(workspace, scope.agentId) : nodeTransformDir(workspace, scope.nodeId);
  return join(root, "latest.json");
}

export function writeSignedTransformPlan(workspace: string, plan: TransformPlan): {
  planPath: string;
  sigPath: string;
  latestPath: string;
  latestSigPath: string;
} {
  const scope = plan.scope.type === "AGENT"
    ? ({ type: "AGENT", agentId: plan.scope.agentId! } as const)
    : ({ type: "NODE", nodeId: plan.scope.nodeId! } as const);
  const plansDir = transformPlansDir(workspace, scope);
  ensureDir(plansDir);
  const planPath = join(plansDir, `${plan.planId}.json`);
  const payload = JSON.stringify(transformPlanSchema.parse(plan), null, 2);
  writeFileAtomic(planPath, payload, 0o644);
  const sigPath = signFileWithAuditor(workspace, planPath);

  const latestPath = transformLatestPlanPath(workspace, scope);
  ensureDir(dirname(latestPath));
  writeFileAtomic(latestPath, payload, 0o644);
  const latestSigPath = signFileWithAuditor(workspace, latestPath);

  return {
    planPath,
    sigPath,
    latestPath,
    latestSigPath
  };
}

export function writeSignedTransformSnapshot(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }, snapshot: TransformPlan): {
  path: string;
  sigPath: string;
} {
  const dir = transformSnapshotsDir(workspace, scope);
  ensureDir(dir);
  const path = join(dir, `${Date.now()}.json`);
  writeFileAtomic(path, JSON.stringify(transformPlanSchema.parse(snapshot), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadLatestTransformPlan(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): TransformPlan | null {
  const path = transformLatestPlanPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return transformPlanSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestTransformPlan(workspace: string, scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string }): SignedFileVerification {
  return verifySignedFileWithAuditor(workspace, transformLatestPlanPath(workspace, scope));
}

export function summarizeBy4C(tasks: TransformTask[]): {
  Concept: number;
  Culture: number;
  Capabilities: number;
  Configuration: number;
} {
  const totals: Record<FourC, { done: number; total: number }> = {
    Concept: { done: 0, total: 0 },
    Culture: { done: 0, total: 0 },
    Capabilities: { done: 0, total: 0 },
    Configuration: { done: 0, total: 0 }
  };
  for (const task of tasks) {
    totals[task.fourC].total += 1;
    if (task.status === "DONE" || task.status === "ATTESTED") {
      totals[task.fourC].done += 1;
    }
  }
  return {
    Concept: totals.Concept.total === 0 ? 0 : Number(((totals.Concept.done / totals.Concept.total) * 100).toFixed(2)),
    Culture: totals.Culture.total === 0 ? 0 : Number(((totals.Culture.done / totals.Culture.total) * 100).toFixed(2)),
    Capabilities: totals.Capabilities.total === 0 ? 0 : Number(((totals.Capabilities.done / totals.Capabilities.total) * 100).toFixed(2)),
    Configuration:
      totals.Configuration.total === 0 ? 0 : Number(((totals.Configuration.done / totals.Configuration.total) * 100).toFixed(2))
  };
}
