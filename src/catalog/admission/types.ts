/**
 * The pack admission report (P1-33; docs/catalog/ADMISSION.md). The zod schema is the one definition: the types are
 * inferred from it, and a committed report that does not parse is a malformed admission record.
 */
import { z } from "zod";

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const support = z.enum(["experimental", "reviewed", "qualified", "retired"]);

const admissionFindingSchema = z.strictObject({
  code: z.string().regex(/^ADM[0-9]*_[A-Z0-9_]+$/),
  severity: z.enum(["error", "warning"]),
  controlId: z.string().nullable(),
  /** File path, optionally with a JSON pointer (`layers/x/controls/L1-X-01.yaml#/citations/0`). */
  path: z.string().nullable(),
  message: z.string()
});
export type AdmissionFinding = z.infer<typeof admissionFindingSchema>;

const criterionResultSchema = z.strictObject({
  criterion: z.number().int().min(1).max(10),
  title: z.string(),
  kind: z.enum(["mechanical", "record", "mixed"]),
  status: z.enum(["met", "not_met", "not_evaluated"]),
  /** Items examined. */
  checked: z.number().int().min(0),
  findings: z.array(admissionFindingSchema),
  evidence: z.array(z.strictObject({ kind: z.enum(["file", "review_record", "fixture_run", "lockfile"]), ref: z.string(), sha256: sha256Hex }))
});
export type CriterionResult = Omit<z.infer<typeof criterionResultSchema>, "criterion"> & { criterion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 };

const fixtureRunSchema = z.strictObject({
  mandatoryControls: z.number().int().min(0),
  /** Fixtures that ran (evidence fixtures through evaluateControl, guard fixtures through a registered harness). */
  fixtures: z.number().int().min(0),
  /** Negative fixtures that passed or were allowed. */
  falseMandatoryPasses: z.number().int().min(0),
  failures: z.array(z.strictObject({ controlId: z.string(), fixture: z.string(), expected: z.string(), actual: z.string() }))
});
export type FixtureRun = z.infer<typeof fixtureRunSchema>;

export const admissionReportSchema = z.strictObject({
  reportVersion: z.literal(1),
  checker: z.strictObject({ name: z.literal("amc-catalog-check"), version: z.string() }),
  /** Excluded from the digest. */
  checkedAt: z.iso.datetime(),
  catalog: z.strictObject({ id: z.string(), version: z.string(), digest }),
  pack: z.strictObject({ id: z.string(), version: z.string(), digest, declaredSupport: support }),
  /** Always ten, in order. */
  criteria: z.array(criterionResultSchema).length(10).refine((c) => c.every((r, i) => r.criterion === i + 1), "criteria 1 to 10 in order"),
  /** Null only when P1-11's evaluator is not available; it is on this branch, so the checker always fills it. */
  fixtureRun: fixtureRunSchema.nullable(),
  maxAdmissibleSupport: z.enum(["experimental", "reviewed"]),
  decision: z.enum(["admit", "refuse"]),
  reasons: z.array(z.string()),
  /** sha256 of the canonical report without `checkedAt` and `digest`. */
  digest
});
export type AdmissionReport = Omit<z.infer<typeof admissionReportSchema>, "criteria"> & { criteria: CriterionResult[] };
