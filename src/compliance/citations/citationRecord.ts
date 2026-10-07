/**
 * Citation record ("law as data"): the fields a citation needs before a reader
 * can check it. RegulatoryInstrument (src/domains/packs/regulatorySchema.ts)
 * carries the same fields as optional properties; scripts/check-citations.mjs
 * reports a record that lacks them (CIT004) and an unknown statusType (CIT005).
 */
import { z } from "zod";

export const CITATION_STATUS_TYPES = [
  "binding-now",
  "binding-future",
  "draft",
  "supervisory-guidance",
  "voluntary-standard",
  "contractual",
  "conformity-scheme",
] as const;
export type CitationStatusType = (typeof CITATION_STATUS_TYPES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");
const text = z.string().trim().min(1);

export const citationRecordSchema = z
  .object({
    instrument: text,
    clause: text,
    edition: text,
    jurisdiction: text,
    statusType: z.enum(CITATION_STATUS_TYPES),
    effectiveDate: isoDate.nullable(),
    complianceDueDate: isoDate.nullable(),
    dateNote: text.optional(),
    url: z.string().url(),
    retrievedAt: isoDate.optional(),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex").optional(),
  })
  .superRefine((record, ctx) => {
    if (!record.retrievedAt && !record.contentSha256) {
      ctx.addIssue({ code: "custom", path: ["retrievedAt"], message: "retrievedAt or contentSha256 is required" });
    }
    if ((record.effectiveDate === null || record.complianceDueDate === null) && !record.dateNote) {
      ctx.addIssue({ code: "custom", path: ["dateNote"], message: "dateNote is required when a date is null" });
    }
  });
export type CitationRecord = z.infer<typeof citationRecordSchema>;
