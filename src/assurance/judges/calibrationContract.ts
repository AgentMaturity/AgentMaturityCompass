/** No persisted input can mint a calibration capability by declaration. */
import { z } from "zod";
import { isCanonicalSignatureBase64, isExactIsoTime } from "../../utils/json.js";
const text = z.string().min(1).max(4096).refine(x => x.trim().length > 0);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.string().refine(isExactIsoTime);
const rate = z.number().finite().min(0).max(1);
export const judgeBindingSchema = z.strictObject({
  scenarioId: text, scenarioSha256: digestSchema, domain: text,
  provider: z.enum(["openai", "anthropic"]), goldSha256: digestSchema,
  judge: z.strictObject({ model: text, promptSha256: digestSchema, rubricSha256: digestSchema,
    temperature: z.number().finite().nonnegative() })
});
export type JudgeBinding = z.infer<typeof judgeBindingSchema>;
export const promptDefinitionSchema = z.strictObject({
  version: z.literal(1), contract: z.literal("amc.regulated-boolean/v1"), system: text,
  // A fixed renderer: no expected label, arbitrary renderer callback or mutable template object.
  userTemplate: text.refine(x => x.split("{{case}}").length === 2)
});
export const rubricDefinitionSchema = z.strictObject({ version: z.literal(1), criteria: text });
const ref = z.strictObject({ path: text, sha256: digestSchema,
  bytes: z.number().int().min(1).max(1024 * 1024).refine(Number.isSafeInteger) });
export const bundleSchema = z.strictObject({
  version: z.literal(1), id: text, binding: judgeBindingSchema,
  gold: ref, scenario: ref, prompt: ref, rubric: ref,
  labels: z.tuple([ref, ref]), adjudication: ref.nullable(), policy: ref
});
export type ArtifactReference = z.infer<typeof ref>;
type CalibrationBundle = z.infer<typeof bundleSchema>;
export const goldSchema = z.strictObject({ version: z.literal(1), synthetic: z.literal(true),
  items: z.array(z.strictObject({ id: text, input: z.json() })).min(2).max(1000) });
const signer = z.strictObject({ subject: text, name: text, credential: text, conflictsDeclared: text });
const common = { version: z.literal(1), binding: judgeBindingSchema, signer, signedAt: time,
  signature: z.strictObject({ keyId: digestSchema, value: z.string().refine(isCanonicalSignatureBase64) }) };
export const labelsSchema = z.strictObject({ ...common, kind: z.literal("human-labels"),
  labels: z.array(z.strictObject({ itemId: text, pass: z.boolean() })).min(2).max(1000) });
export const adjudicationSchema = z.strictObject({ ...common, kind: z.literal("adjudication"),
  labelFileSha256: z.tuple([digestSchema, digestSchema]),
  choices: z.array(z.strictObject({ itemId: text, pass: z.boolean(), rationale: text })).min(1).max(1000) });
export const policySchema = z.strictObject({ ...common, kind: z.literal("expert-policy"),
  minimumGoldSetSize: z.number().int().positive().max(1000), maxFpr: rate, maxFnr: rate,
  validFrom: time, expiresAt: time, calibrationExpiresAt: time });
export type CalibrationStatement = z.infer<typeof labelsSchema> | z.infer<typeof adjudicationSchema> | z.infer<typeof policySchema>;

/** Only fixed protocol refusal codes cross public judgment/authority boundaries. */
const PUBLIC_REFUSALS = new Set([
  "CALIBRATION_ADJUDICATION_BORROWED", "CALIBRATION_ADJUDICATION_MISSING",
  "CALIBRATION_ADJUDICATION_PRECEDES_LABELS", "CALIBRATION_ADJUDICATION_SET_MISMATCH",
  "CALIBRATION_ARTIFACT_CHANGED", "CALIBRATION_AUTHORITY_TOKEN_UNVERIFIED",
  "CALIBRATION_AUTHORS_UNKNOWN", "CALIBRATION_AUTHOR_SELF_REVIEW",
  "CALIBRATION_BELOW_EXPERT_MINIMUM", "CALIBRATION_BUNDLE_CHANGED",
  "CALIBRATION_BUNDLE_ROOT_INVALID", "CALIBRATION_CAPTURE_BINDING_MISMATCH",
  "CALIBRATION_CLASS_DENOMINATOR_EMPTY", "CALIBRATION_DUPLICATE_FILE_REFERENCE",
  "CALIBRATION_DUPLICATE_GOLD_ITEM", "CALIBRATION_EXPECTED_BINDING_MISMATCH",
  "CALIBRATION_EXPERT_DOMAIN_MISSING", "CALIBRATION_EXPIRED_AT_COMPLETION",
  "CALIBRATION_EXPIRED_OR_FUTURE", "CALIBRATION_FIRST_LABEL_SET_INCOMPLETE",
  "CALIBRATION_LABEL_OR_POLICY_AFTER_RUN", "CALIBRATION_OPERATOR_CONTEXT_CHANGED",
  "CALIBRATION_OPERATOR_INPUT_TOO_LARGE", "CALIBRATION_OUTSIDE_EXPERT_TOLERANCE",
  "CALIBRATION_POLICY_EXPIRED_OR_INVALID", "CALIBRATION_REFUSED",
  "CALIBRATION_REVIEWERS_NOT_DISTINCT", "CALIBRATION_ROSTER_EMPTY",
  "CALIBRATION_SECOND_LABEL_SET_INCOMPLETE", "CALIBRATION_SIGNATURE_NOT_ADMITTED",
  "CALIBRATION_SIGNED_BINDING_MISMATCH", "CALIBRATION_SIGNER_NOT_INDEPENDENT",
  "CALIBRATION_SIGNER_NOT_ON_ROSTER", "CALIBRATION_SIGNER_SUBJECT_MISMATCH",
  "CALIBRATION_SOURCE_BINDING_MISMATCH", "CALIBRATION_STATEMENT_IN_FUTURE",
  "CALIBRATION_TOKEN_UNVERIFIED", "CALIBRATION_UNNECESSARY_ADJUDICATION",
  "JUDGE_CREDENTIALS_UNAVAILABLE", "JUDGE_DEFINITION_CHANGED",
  "JUDGE_EXECUTION_NOT_BOUND", "JUDGE_OUTPUT_CONTRACT_INVALID",
  "JUDGE_PROTECTED_PAYLOAD_UNSUPPORTED", "JUDGE_PROTECTED_PREFLIGHT_UNAVAILABLE",
  "JUDGE_PROTECTED_WORKSPACE_UNSUPPORTED", "JUDGE_PURPOSE_INVALID",
  "JUDGE_RESPONSE_MODEL_MISMATCH", "JUDGE_WIRE_CAPTURE_MISSING",
  "JUDGE_WORKSPACE_REQUIRED",
]);
export function judgeRefusalCode(error: unknown, fallback: "CALIBRATION_REFUSED" | "JUDGE_CAPTURE_UNAVAILABLE"): string {
  return error instanceof Error && PUBLIC_REFUSALS.has(error.message) ? error.message : fallback;
}
