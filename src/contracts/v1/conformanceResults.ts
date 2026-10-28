import { z } from "zod";
import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

/**
 * P1-32: what one run of the conformance suite (packages/amc-conformance) found for one implementation and one class.
 * A results file is the implementer's own statement of a run, so it is evidence of conformity, never a certificate.
 * The refinements (summary counts match the cases; `conformant` only when normative cases exist and all passed) are in
 * spec/ACCEPTANCE_RULES.md.
 */
const conformanceCaseSchema = z.strictObject({
  id: nonEmpty,
  normative: z.boolean(),
  outcome: z.enum(["pass", "fail", "error", "skipped"]),
  durationMs: z.number().int().nonnegative(),
  /** null on a pass; otherwise what differed, the error, or why the case was skipped. */
  diff: z.record(z.string(), z.unknown()).nullable()
});

export const conformanceResultsV1Schema = z.strictObject({
  suiteVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  specVersion: z.string().regex(/^\d+\.\d+$/),
  class: z.enum(["verifier", "producer", "adapter", "compiler", "a4-record"]),
  /** sha256 over the manifest and every input file the run judged (packages/amc-conformance/README.md). */
  fixtureSetDigest: sha256HexSchema,
  implementation: z.strictObject({
    name: nonEmpty,
    version: nonEmpty,
    vendor: z.string().nullable(),
    repository: z.string().nullable(),
    language: z.string().nullable()
  }),
  environment: z.strictObject({ os: nonEmpty, runtime: nonEmpty }),
  runAt: isoTimeSchema,
  cases: z.array(conformanceCaseSchema),
  summary: z.strictObject({ normativePassed: z.number().int().nonnegative(), normativeTotal: z.number().int().nonnegative() }),
  conformant: z.boolean(),
  signature: signatureEnvelopeSchema.optional()
}).superRefine((results, context) => {
  const normative = results.cases.filter(item => item.normative);
  const passed = normative.filter(item => item.outcome === "pass").length;
  if (results.summary.normativeTotal !== normative.length || results.summary.normativePassed !== passed) {
    context.addIssue({ code: "custom", path: ["summary"], message: "summary does not count the normative cases" });
  }
  if (results.conformant !== (normative.length > 0 && passed === normative.length)) {
    context.addIssue({ code: "custom", path: ["conformant"], message: "conformant is true only when every normative case passed" });
  }
  if (new Set(results.cases.map(item => item.id)).size !== results.cases.length) {
    context.addIssue({ code: "custom", path: ["cases"], message: "a case id is repeated" });
  }
});
