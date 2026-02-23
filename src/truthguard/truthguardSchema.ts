import { z } from "zod";

export const truthguardOutputSchema = z.object({
  v: z.literal(1),
  answer: z.string().min(1),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        evidenceRefs: z.array(z.string().min(1)).optional()
      })
    )
    .default([]),
  unknowns: z
    .array(
      z.object({
        text: z.string().min(1)
      })
    )
    .default([]),
  nextActions: z
    .array(
      z.object({
        actionId: z.string().min(1),
        requiresApproval: z.boolean()
      })
    )
    .default([])
});

export const truthguardViolationSchema = z.object({
  kind: z.enum(["MISSING_EVIDENCE_REF", "DISALLOWED_TOOL", "DISALLOWED_MODEL", "SECRET_PATTERN"]),
  path: z.string().min(1),
  message: z.string().min(1),
  snippetRedacted: z.string().min(1)
});

export const truthguardResultSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  reasons: z.array(z.string().min(1)).default([]),
  missingEvidenceRefs: z.array(z.string().min(1)).default([]),
  violations: z.array(truthguardViolationSchema).default([])
});

export type TruthguardOutput = z.infer<typeof truthguardOutputSchema>;
export type TruthguardResult = z.infer<typeof truthguardResultSchema>;

// ── FACTS-style factuality classification for Truthguard claims ──────

export const factualityClassSchema = z.enum([
  "parametric",       // claim from model's internal knowledge
  "search_retrieval", // claim from RAG / search results
  "grounded",         // claim derived from user-provided context
  "unknown",          // unclassified
]);

export const truthguardFactualityAnnotationSchema = z.object({
  claimIndex: z.number().int().min(0),
  factualityClass: factualityClassSchema,
  verified: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type FactualityClass = z.infer<typeof factualityClassSchema>;
export type TruthguardFactualityAnnotation = z.infer<typeof truthguardFactualityAnnotationSchema>;
