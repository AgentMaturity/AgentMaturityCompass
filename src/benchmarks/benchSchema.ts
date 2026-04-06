import { z } from "zod";
import { questionBank } from "../diagnostic/questionBank.js";

const layerNames = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills"
] as const;

const questionEnum = z.enum(questionBank.map((q) => q.id) as [string, ...string[]]);

export const benchmarkSchema = z.object({
  v: z.literal(1),
  benchId: z.string().min(1),
  createdTs: z.number().int(),
  publisher: z.object({
    orgName: z.string().min(1),
    contact: z.string().min(1).nullable().optional()
  }),
  agent: z.object({
    agentId: z.string().min(1),
    archetypeId: z.string().min(1).nullable().optional(),
    riskTier: z.enum(["low", "med", "high", "critical"]),
    role: z.string().min(1).nullable().optional()
  }),
  run: z.object({
    runId: z.string().min(1),
    windowDays: z.number().int().positive(),
    overall: z.number().min(0).max(5),
    layers: z.partialRecord(z.enum(layerNames), z.number().min(0).max(5)),
    questions: z.partialRecord(questionEnum, z.number().min(0).max(5)),
    integrityIndex: z.number().min(0).max(1),
    trustLabel: z.enum(["LOW TRUST", "MEDIUM TRUST", "HIGH TRUST"]),
    assurance: z.record(z.string().min(1), z.number().min(0).max(100)),
    indices: z.object({
      EcosystemFocusRisk: z.number().min(0).max(100),
      ClarityPathRisk: z.number().min(0).max(100),
      EconomicSignificanceRisk: z.number().min(0).max(100),
      RiskAssuranceRisk: z.number().min(0).max(100),
      DigitalDualityRisk: z.number().min(0).max(100)
    })
  }),
  hashes: z.object({
    reportSha256: z.string().length(64).nullable().optional(),
    bomSha256: z.string().length(64).nullable().optional()
  }),
  notes: z.string().nullable().optional()
});

export type BenchmarkArtifact = z.infer<typeof benchmarkSchema>;

