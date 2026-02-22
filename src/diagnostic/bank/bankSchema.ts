import { z } from "zod";

export const diagnosticBankAgentTypes = [
  "code-agent",
  "support-agent",
  "ops-agent",
  "research-agent",
  "sales-agent",
  "other"
] as const;

export const diagnosticBankDimensionSchema = z.object({
  id: z.number().int().min(1).max(5),
  name: z.string().min(1),
  questionCount: z.number().int().min(1)
});

export const diagnosticBankRubricSchema = z.object({
  level: z.number().int().min(0).max(5),
  label: z.string().min(1),
  observableDefinition: z.string().min(1)
});

export const diagnosticBankEvidenceMapSchema = z.object({
  requiredEvidenceKinds: z.array(z.enum(["OBSERVED", "ATTESTED"])).min(1),
  queries: z.array(z.string().min(1)).min(1),
  minCoverage: z.object({
    minEvents: z.number().int().min(0),
    minObservedShare: z.number().min(0).max(1),
    minAttestedShare: z.number().min(0).max(1),
    minRuns: z.number().int().min(0)
  })
});

export const diagnosticBankQuestionSchema = z.object({
  qId: z.string().min(1),
  dimensionId: z.number().int().min(1).max(5),
  title: z.string().min(1),
  intent: z.string().min(1),
  rubrics: z.array(diagnosticBankRubricSchema).length(6),
  evidenceMap: diagnosticBankEvidenceMapSchema,
  upgradeHints: z.object({
    relatedInterventions: z.array(z.string().min(1)).default([]),
    expectedEvidence: z.array(z.string().min(1)).default([])
  }),
  contextualVariants: z.object({
    "code-agent": z.string().min(1),
    "support-agent": z.string().min(1),
    "ops-agent": z.string().min(1),
    "research-agent": z.string().min(1),
    "sales-agent": z.string().min(1),
    other: z.string().min(1)
  })
});

export const diagnosticBankSchema = z
  .object({
    diagnosticBank: z.object({
      version: z.literal(1),
      dimensions: z.array(diagnosticBankDimensionSchema).length(5),
      questions: z.array(diagnosticBankQuestionSchema).length(89)
    })
  })
  .superRefine((value, ctx) => {
    const questions = value.diagnosticBank.questions;
    const dimensions = value.diagnosticBank.dimensions;

    const byId = new Set<number>();
    for (const dim of dimensions) {
      if (byId.has(dim.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate dimension id: ${dim.id}`
        });
      }
      byId.add(dim.id);
    }

    const qSeen = new Set<string>();
    for (const question of questions) {
      if (qSeen.has(question.qId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate question id: ${question.qId}`
        });
      }
      qSeen.add(question.qId);
      const levels = question.rubrics.map((row) => row.level);
      const expected = [0, 1, 2, 3, 4, 5];
      if (levels.length !== expected.length || levels.some((row, index) => row !== expected[index])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `rubric levels for ${question.qId} must be [0..5]`
        });
      }
    }

    const expectedCounts: Record<number, number> = {
      1: 13,
      2: 18,
      3: 20,
      4: 16,
      5: 22
    };

    const actualCounts: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    };
    for (const question of questions) {
      actualCounts[question.dimensionId] = (actualCounts[question.dimensionId] ?? 0) + 1;
    }

    for (const key of [1, 2, 3, 4, 5]) {
      if ((actualCounts[key] ?? 0) !== expectedCounts[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dimension ${key} must contain ${expectedCounts[key]} questions (found ${actualCounts[key] ?? 0})`
        });
      }
      const declared = dimensions.find((row) => row.id === key)?.questionCount;
      if (declared !== expectedCounts[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dimension metadata for ${key} must declare questionCount=${expectedCounts[key]}`
        });
      }
    }
  });

export type DiagnosticBank = z.infer<typeof diagnosticBankSchema>;
