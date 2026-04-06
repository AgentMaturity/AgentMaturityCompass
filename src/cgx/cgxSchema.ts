import { z } from "zod";

export const cgxScopeSchema = z.object({
  type: z.enum(["workspace", "agent"]),
  id: z.string().min(1)
});

export const cgxPolicySchema = z.object({
  cgxPolicy: z.object({
    version: z.literal(1),
    buildCadenceHours: z.number().int().min(1),
    rebuildOnEvents: z.array(
      z.enum([
        "POLICY_APPLIED",
        "PLUGIN_INSTALLED",
        "APPROVAL_DECIDED",
        "DIAGNOSTIC_COMPLETED",
        "FORECAST_CREATED",
        "BENCH_CREATED"
      ])
    ),
    maxGraphNodes: z.number().int().min(1000),
    pruning: z.object({
      maxEdges: z.number().int().min(1000),
      maxEvidenceRefsPerNode: z.number().int().min(1)
    }),
    privacy: z.object({
      hashAgentIds: z.boolean(),
      hashWorkspaceId: z.boolean(),
      noSecrets: z.boolean()
    }),
    evidenceGates: z.object({
      minIntegrityIndex: z.number().min(0).max(1),
      minCorrelationRatio: z.number().min(0).max(1)
    })
  })
});

export const cgxEvidenceRefsSchema = z.object({
  runIds: z.array(z.string().min(1)).default([]),
  eventHashes: z.array(z.string().min(1)).default([])
});

export const cgxNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "Workspace",
    "Agent",
    "AgentType",
    "ModelProvider",
    "ModelFamily",
    "Tool",
    "PolicyPack",
    "Budget",
    "ApprovalPolicy",
    "TransformPlan",
    "TransformTask",
    "OutcomeContract",
    "OutcomeEvent",
    "Forecast",
    "Advisory",
    "Bench",
    "EvidenceEventKind",
    "TrustMode",
    "NotaryAttestation",
    "Plugin",
    "Registry"
  ]),
  hash: z.string().length(64),
  label: z.string().min(1),
  evidenceRefs: cgxEvidenceRefsSchema.optional()
});

export const cgxEdgeFreshnessSchema = z.enum(["FRESH", "STALE", "EXPIRED"]);

export const cgxEdgeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "OWNS",
    "USES",
    "GOVERNED_BY",
    "CONSTRAINED_BY",
    "EVIDENCED_BY",
    "TARGETS",
    "IMPROVES",
    "RISKS",
    "PRODUCES",
    "DEPENDS_ON",
    "REQUIRES",
    "CONTRADICTS",
    "PATCHES",
    "SUPERSEDES",
    "BLOCKS",
    "ENABLES"
  ]),
  from: z.string().min(1),
  to: z.string().min(1),
  hash: z.string().length(64),
  evidenceRefs: cgxEvidenceRefsSchema.optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  lastVerifiedTs: z.number().int().default(0),
  edgeEvidenceRefs: z.array(z.string().min(1)).default([]),
  freshness: cgxEdgeFreshnessSchema.default("FRESH")
});

export const cgxGraphSchema = z.object({
  v: z.literal(1),
  scope: cgxScopeSchema,
  generatedTs: z.number().int(),
  policySha256: z.string().length(64),
  nodes: z.array(cgxNodeSchema),
  edges: z.array(cgxEdgeSchema),
  stats: z.object({
    nodeCount: z.number().int().min(0),
    edgeCount: z.number().int().min(0)
  })
});

export const cgxContextPackSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  scope: cgxScopeSchema,
  agentIdHash: z.string().min(1),
  mission: z.object({
    summary: z.string().min(1),
    goals: z.array(z.string().min(1)).default([])
  }),
  allowed: z.object({
    providers: z.array(z.string().min(1)).default([]),
    modelAllowlist: z.array(z.string().min(1)).default([]),
    tools: z.array(z.string().min(1)).default([])
  }),
  equalizerTargets: z.object({
    profileId: z.string().nullable(),
    questionTargets: z.record(z.string(), z.number().int().min(0).max(5))
  }),
  freeze: z.object({
    active: z.boolean(),
    reasons: z.array(z.string().min(1)).default([])
  }),
  topTransformTasks: z.array(
    z.object({
      taskId: z.string().min(1),
      title: z.string().min(1),
      why: z.string().min(1),
      evidenceRefs: cgxEvidenceRefsSchema
    })
  ),
  requiredOutputContractSchemaIds: z.array(z.string().min(1)).default([]),
  truthConstraints: z.array(z.string().min(1)).min(1),
  evidenceRefs: cgxEvidenceRefsSchema
});

export type CgxPolicy = z.infer<typeof cgxPolicySchema>;
export type CgxGraph = z.infer<typeof cgxGraphSchema>;
export type CgxContextPack = z.infer<typeof cgxContextPackSchema>;
export type CgxScope = z.infer<typeof cgxScopeSchema>;
export type CgxNode = z.infer<typeof cgxNodeSchema>;
export type CgxEdge = z.infer<typeof cgxEdgeSchema>;
export type CgxEdgeFreshness = z.infer<typeof cgxEdgeFreshnessSchema>;
