import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { domainProofDomainIdSchema } from "./domainProofArtifact.js";

export const sourceRuleClauseSchema = z.object({
  clauseId: z.string().min(1),
  sourceSpan: z.string().min(1),
  formalClauseId: z.string().min(1),
  owner: z.string().min(1),
  reviewer: z.string().min(1),
  ambiguityFlags: z.array(z.string().min(1)).default([]),
  staleAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dependencies: z.array(z.string().min(1)).default([]),
  exceptions: z.array(z.string().min(1)).default([]),
  clauseHash: z.string().length(64),
}).strict();

export const sourceRuleReviewSchema = z.object({
  status: z.enum(["pending", "reviewed", "rejected"]),
  reviewerRole: z.string().min(1),
  reviewedAt: z.string().min(1),
  notes: z.string().min(1).optional(),
  nonLegalDisclaimer: z.string().min(1),
}).strict();

export const sourceRuleManifestSchema = z.object({
  v: z.literal(1),
  manifestId: z.string().regex(/^srcmanifest_[A-Za-z0-9_-]{3,}$/),
  domainId: domainProofDomainIdSchema,
  jurisdiction: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceHash: z.string().length(64),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  retrievedAt: z.string().min(1),
  clauses: z.array(sourceRuleClauseSchema).min(1),
  review: sourceRuleReviewSchema,
  proofCoverage: z.object({
    sourceClauseCount: z.number().int().min(0),
    formalizedCount: z.number().int().min(0),
    reviewedCount: z.number().int().min(0),
  }).strict(),
}).strict();

export type SourceRuleClause = z.infer<typeof sourceRuleClauseSchema>;
export type SourceRuleManifest = z.infer<typeof sourceRuleManifestSchema>;

export function sourceRuleTextHash(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8"));
}

export function sourceRuleClauseHash(input: Omit<SourceRuleClause, "clauseHash">): string {
  return sha256Hex(Buffer.from(canonicalize(input), "utf8"));
}

export function buildSourceRuleManifest(input: Omit<SourceRuleManifest, "v" | "sourceHash" | "clauses" | "proofCoverage"> & {
  sourceText: string;
  clauses: Array<Omit<SourceRuleClause, "clauseHash">>;
}): SourceRuleManifest {
  const clauses = input.clauses.map((clause) => ({
    ...clause,
    clauseHash: sourceRuleClauseHash(clause),
  }));
  const reviewedCount = clauses.filter((clause) => clause.reviewer.trim().length > 0).length;
  const formalizedCount = clauses.filter((clause) => clause.formalClauseId.trim().length > 0).length;

  return sourceRuleManifestSchema.parse({
    v: 1,
    manifestId: input.manifestId,
    domainId: input.domainId,
    jurisdiction: input.jurisdiction,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    sourceHash: sourceRuleTextHash(input.sourceText),
    effectiveDate: input.effectiveDate,
    retrievedAt: input.retrievedAt,
    clauses,
    review: input.review,
    proofCoverage: {
      sourceClauseCount: clauses.length,
      formalizedCount,
      reviewedCount,
    },
  });
}

export function verifySourceRuleManifest(manifest: unknown, opts: { sourceText?: string } = {}): { ok: boolean; errors: string[] } {
  const parsed = sourceRuleManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const errors: string[] = [];
  if (opts.sourceText !== undefined) {
    const actual = sourceRuleTextHash(opts.sourceText);
    if (actual !== parsed.data.sourceHash) {
      errors.push(`sourceHash mismatch: expected ${parsed.data.sourceHash}, recomputed ${actual}`);
    }
  }

  if (parsed.data.proofCoverage.sourceClauseCount !== parsed.data.clauses.length) {
    errors.push("proofCoverage.sourceClauseCount does not match clauses length");
  }
  const formalizedCount = parsed.data.clauses.filter((clause) => clause.formalClauseId.trim().length > 0).length;
  if (parsed.data.proofCoverage.formalizedCount !== formalizedCount) {
    errors.push("proofCoverage.formalizedCount does not match formalized clauses");
  }
  const reviewedCount = parsed.data.clauses.filter((clause) => clause.reviewer.trim().length > 0).length;
  if (parsed.data.proofCoverage.reviewedCount !== reviewedCount) {
    errors.push("proofCoverage.reviewedCount does not match reviewed clauses");
  }
  for (const clause of parsed.data.clauses) {
    const { clauseHash: _clauseHash, ...withoutHash } = clause;
    const actual = sourceRuleClauseHash(withoutHash);
    if (actual !== clause.clauseHash) {
      errors.push(`clauseHash mismatch for ${clause.clauseId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
