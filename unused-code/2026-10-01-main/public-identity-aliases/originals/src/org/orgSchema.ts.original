import { z } from "zod";

export const ORG_NODE_TYPES = ["ENTERPRISE", "TEAM", "FUNCTION", "PROCESS", "ECOSYSTEM"] as const;

export type OrgNodeType = (typeof ORG_NODE_TYPES)[number];

export const orgNodeTypeSchema = z.enum(ORG_NODE_TYPES);

export const orgNodeSchema = z.object({
  id: z.string().min(1),
  type: orgNodeTypeSchema,
  name: z.string().min(1),
  parentId: z.string().min(1).nullable()
});

export const orgMembershipSchema = z.object({
  agentId: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1),
  weight: z.number().positive().default(1)
});

export const orgNodeDefaultsSchema = z.object({
  riskTierDefault: z.enum(["low", "med", "high", "critical"]).optional(),
  gatePolicyRef: z.string().min(1).optional(),
  outcomeContractRef: z.string().min(1).optional(),
  actionPolicyRef: z.string().min(1).optional(),
  budgetsRef: z.string().min(1).optional()
});

export const orgPoliciesSchema = z.object({
  inheritance: z.object({
    enabled: z.boolean().default(true)
  }),
  defaultsByNode: z.record(z.string(), orgNodeDefaultsSchema).default({})
});

export const orgSchema = z.object({
  version: z.literal(1),
  enterpriseId: z.string().min(1),
  enterpriseName: z.string().min(1),
  nodes: z.array(orgNodeSchema).min(1),
  memberships: z.array(orgMembershipSchema).default([]),
  policies: orgPoliciesSchema.default({
    inheritance: { enabled: true },
    defaultsByNode: {}
  })
});

export type OrgNode = z.infer<typeof orgNodeSchema>;
export type OrgMembership = z.infer<typeof orgMembershipSchema>;
export type OrgConfig = z.infer<typeof orgSchema>;

export const orgSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

export const orgWindowScoreInputSchema = z.object({
  windowStartTs: z.number().int(),
  windowEndTs: z.number().int()
});

export interface WeightedScore {
  median: number;
  trimmedMean: number;
}

export interface WeightedDistribution {
  p10: number;
  p50: number;
  p90: number;
  iqr: number;
}

export interface NodeEvidenceCoverage {
  observedRatio: number;
  attestedRatio: number;
  selfReportedRatio: number;
  medianCorrelationRatio: number;
  cheatSuspicionCount: number;
}

export interface NodeLayerScore {
  layerName: string;
  median: number;
  trimmedMean: number;
}

export interface NodeQuestionScore {
  questionId: string;
  median: number;
  trimmedMean: number;
  targetMedian: number;
}

export interface NodeGapItem {
  questionId: string;
  currentMedian: number;
  targetMedian: number;
  gap: number;
}

export interface NodeRiskItem {
  id: string;
  score0to100: number;
}

export interface OrgNodeScorecard {
  nodeId: string;
  nodeType: OrgNodeType;
  name: string;
  parentId: string | null;
  trustLabel: "HIGH TRUST" | "LOW TRUST" | "UNTRUSTED";
  agentIds: string[];
  countAgentsIncluded: number;
  countHighTrustAgents: number;
  countLowTrustAgents: number;
  confidence: {
    observedCoverage: number;
    medianCorrelationRatio: number;
    integrityMedian: number;
  };
  evidenceCoverage: NodeEvidenceCoverage;
  headline: WeightedScore;
  headlineDistribution: WeightedDistribution;
  layerScores: NodeLayerScore[];
  questionScores: NodeQuestionScore[];
  integrityIndex: number;
  valueScore: number | null;
  economicSignificanceIndex: number | null;
  assurance: Record<string, WeightedDistribution>;
  riskIndices: NodeRiskItem[];
  topGapQuestions: NodeGapItem[];
  topSystemicRisks: NodeRiskItem[];
  whyCapped: string[];
  runRefs: string[];
  transparencyRefs: string[];
}

export interface EcosystemRollup {
  peerCount: number;
  localEnterpriseOverall: number;
  localEnterpriseIntegrity: number;
  localEnterpriseValue: number | null;
  percentiles: {
    overall: number;
    integrity: number;
    value: number | null;
  };
}

export interface OrgScorecard {
  v: 1;
  enterpriseId: string;
  enterpriseName: string;
  computedAt: number;
  window: {
    raw: string;
    windowStartTs: number;
    windowEndTs: number;
  };
  configTrusted: boolean;
  nodes: OrgNodeScorecard[];
  summary: {
    enterpriseNodeId: string | null;
    enterpriseRollup: OrgNodeScorecard | null;
    ecosystemRollup: EcosystemRollup | null;
  };
}

export const orgScorecardSignatureSchema = orgSignatureSchema;
