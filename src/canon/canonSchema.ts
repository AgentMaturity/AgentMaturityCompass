import { z } from "zod";
import { questionIds } from "../diagnostic/questionBank.js";

export const canonDimensionSchema = z.object({
  id: z.enum(["D1", "D2", "D3", "D4", "D5"]),
  name: z.enum([
    "Strategic Agent Operations",
    "Agent Leadership",
    "Agent Culture",
    "Agent Resilience",
    "Agent Skills"
  ]),
  questionCount: z.number().int().min(1)
});

export const canonQuestionSchema = z.object({
  qId: z.string().min(1),
  dimensionId: canonDimensionSchema.shape.id,
  semantics: z.string().min(8)
});

export const canon4CSchema = z.object({
  id: z.enum(["Concept", "Culture", "Capabilities", "Configuration"]),
  definition: z.string().min(16)
});

export const canonRiskSchema = z.object({
  id: z.enum([
    "ecosystemFocusRisk",
    "clarityPathRisk",
    "economicSignificanceRisk",
    "riskAssuranceRisk",
    "digitalDualityRisk"
  ]),
  label: z.string().min(1)
});

export const canonValueDimensionSchema = z.object({
  id: z.enum(["emotionalValue", "functionalValue", "economicValue", "brandValue", "lifetimeValue"]),
  label: z.string().min(1)
});

export const canonVocabularySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  label: z.string().min(1),
  source: z.enum(["builtin", "plugin"])
});

export const canonDomainSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  label: z.string().min(1),
  source: z.enum(["builtin", "plugin"])
});

export const canonSchema = z
  .object({
    compassCanon: z.object({
      version: z.literal(1),
      dimensions: z.array(canonDimensionSchema).length(5),
      questions: z.array(canonQuestionSchema).length(89),
      fourCs: z.array(canon4CSchema).length(4),
      strategyFailureRisks: z.array(canonRiskSchema).length(5),
      valueDimensions: z.array(canonValueDimensionSchema).length(5),
      agentTypeVocabulary: z.array(canonVocabularySchema).min(1),
      domainPacks: z.array(canonDomainSchema).default([])
    })
  })
  .superRefine((value, ctx) => {
    const dims = value.compassCanon.dimensions;
    const dimCounts = new Map<string, number>();
    for (const q of value.compassCanon.questions) {
      dimCounts.set(q.dimensionId, (dimCounts.get(q.dimensionId) ?? 0) + 1);
    }

    for (const dim of dims) {
      const actual = dimCounts.get(dim.id) ?? 0;
      if (actual !== dim.questionCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dimension ${dim.id} count mismatch: expected ${dim.questionCount}, got ${actual}`
        });
      }
    }

    const ids = value.compassCanon.questions.map((q) => q.qId);
    const set = new Set(ids);
    if (set.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate canon question IDs"
      });
    }

    for (const qid of questionIds) {
      if (!set.has(qid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `canon missing diagnostic question ID ${qid}`
        });
      }
    }
  });

export type CompassCanon = z.infer<typeof canonSchema>;
