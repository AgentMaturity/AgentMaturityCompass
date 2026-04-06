import { z } from "zod";
import { questionIds } from "../diagnostic/questionBank.js";
import { FOUR_CS } from "./fourCs.js";

export const fourCSchema = z.enum(FOUR_CS);

const indexSchema = z.enum([
  "EcosystemFocusRisk",
  "ClarityPathRisk",
  "EconomicSignificanceRisk",
  "RiskAssuranceRisk",
  "DigitalDualityRisk"
]);

const outcomeCategorySchema = z.enum(["Emotional", "Functional", "Economic", "Brand", "Lifetime"]);

const trustTierSchema = z.enum(["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"]);

const completionEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("audit_absent"),
    auditTypes: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    kind: z.literal("assurance_pack_min"),
    packId: z.string().min(1),
    minScore: z.number().min(0).max(100)
  }),
  z.object({
    kind: z.literal("config_signature_valid"),
    path: z.string().min(1)
  }),
  z.object({
    kind: z.literal("metric_min"),
    metric: z.string().min(1),
    min: z.number()
  }),
  z.object({
    kind: z.literal("trust_tier_at_least"),
    trustTier: trustTierSchema
  })
]);

const interventionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  fourC: fourCSchema,
  impact: z.object({
    indices: z.array(indexSchema).default([]),
    outcomes: z.array(outcomeCategorySchema).default([])
  }),
  prerequisites: z
    .object({
      minLevels: z.record(z.string(), z.number().int().min(0).max(5)).optional(),
      requireAssurance: z
        .record(z.string(),
          z.object({
            minScore: z.number().min(0).max(100),
            maxSucceeded: z.number().int().min(0)
          })
        )
        .optional(),
      requireTrustTierAtLeast: trustTierSchema.optional(),
      requireConfigSignaturesValid: z.array(z.string().min(1)).optional()
    })
    .default({}),
  completionEvidence: z
    .object({
      requiresLedgerQuery: z.array(completionEvidenceSchema).min(1)
    })
    .default({
      requiresLedgerQuery: []
    }),
  recommendedActions: z.array(z.string().min(1)).min(1)
});

export const transformMapSchema = z
  .object({
    transformMap: z.object({
      version: z.literal(1),
      questionTo4C: z.record(z.string(), 
        z.object({
          primary: fourCSchema,
          secondary: z.array(fourCSchema).default([])
        })
      ),
      questionInterventions: z.record(z.string(), z.array(interventionSchema).min(1))
    })
  })
  .superRefine((value, ctx) => {
    const mapped = new Set(Object.keys(value.transformMap.questionTo4C));
    const interventions = new Set(Object.keys(value.transformMap.questionInterventions));
    for (const qid of questionIds) {
      if (!mapped.has(qid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transformMap.questionTo4C missing questionId ${qid}`
        });
      }
      if (!interventions.has(qid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transformMap.questionInterventions missing questionId ${qid}`
        });
      }
    }
  });

export type TransformMap = z.infer<typeof transformMapSchema>;
export type TransformIntervention = z.infer<typeof interventionSchema>;
export type CompletionEvidenceCheck = z.infer<typeof completionEvidenceSchema>;
