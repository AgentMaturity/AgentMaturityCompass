/** Pure math and caller-metadata rejection diagnostics, not positive calibration admission.
 * No file, credential or model IO. Verified admission lives in calibrationAuthority.ts.
 * This metadata-only API remains not_evaluated even when every diagnostic is consistent.
 */
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize, isExactIsoTime } from "../../utils/json.js";

const text = z.string().min(1).refine(value => value.trim().length > 0);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().refine(isExactIsoTime);
const rate = z.number().finite().min(0).max(1);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const identitySchema = z.strictObject({
  model: text, promptSha256: digest, rubricSha256: digest,
  temperature: z.number().finite().nonnegative()
});
const pairSchema = z.strictObject({ itemId: text, expectedPass: z.boolean(), predictedPass: z.boolean() });
const confusionSchema = z.strictObject({ tp: count, fp: count, tn: count, fn: count });
const interval = z.tuple([rate, rate]);
const calibrationSchema = z.strictObject({
  id: text, scenarioId: text, judge: identitySchema,
  goldSet: z.strictObject({ path: text, sha256: digest, items: count, labelledBy: z.array(text), labelledAt: instant }),
  confusion: confusionSchema, falsePositiveRate: rate, falseNegativeRate: rate,
  interval95: z.strictObject({ fpr: interval, fnr: interval }),
  tolerance: z.strictObject({ maxFpr: rate.nullable(), maxFnr: rate.nullable() }),
  minimumGoldSetSize: count.refine(n => n > 0).nullable(),
  calibratedAt: instant, expiresAt: instant
});
const executionSchema = z.strictObject({
  mode: z.enum(["llm", "simulated"]), origin: z.enum(["live_llm", "scripted", "unknown"]),
  identity: identitySchema, responseModel: text, judgedPass: z.boolean(), evaluatedAt: instant,
  calibrationId: text.nullable(), callEvidenceSha256: digest.nullable()
});
const requestSchema = z.strictObject({
  scenarioId: text, now: instant, execution: executionSchema.nullable(),
  calibration: calibrationSchema.nullable(), goldSetBytes: z.instanceof(Uint8Array).nullable(),
  diagnosticPairs: z.array(pairSchema)
});
type JudgeIdentity = z.infer<typeof identitySchema>;
export type RegulatedJudgeCalibration = z.infer<typeof calibrationSchema>;
interface ConfusionPair { itemId: string; expectedPass: boolean; predictedPass: boolean }
export interface ConfusionStatistics {
  confusion: { tp: number; fp: number; tn: number; fn: number };
  items: number; falsePositiveRate: number | null; falseNegativeRate: number | null;
  interval95: { fpr: [number, number] | null; fnr: [number, number] | null };
}
/** Conventional two-sided Wilson 95%, z=1.96. No sample is unknown, never zero risk. */
export function wilson95(successes: unknown, total: unknown): [number, number] | null {
  if (typeof successes !== "number" || typeof total !== "number" ||
      !Number.isSafeInteger(successes) || !Number.isSafeInteger(total) ||
      total <= 0 || successes < 0 || successes > total) return null;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
/** Positive means accepted/safe: FP is an unsafe reference that the judge accepts. */
export function calculateConfusion(pairs: unknown): ConfusionStatistics | null {
  const parsed = z.array(pairSchema).safeParse(pairs);
  if (!parsed.success || new Set(parsed.data.map(p => p.itemId)).size !== parsed.data.length) return null;
  const confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const p of parsed.data) confusion[p.expectedPass ? (p.predictedPass ? "tp" : "fn") : (p.predictedPass ? "fp" : "tn")]++;
  const negatives = confusion.fp + confusion.tn, positives = confusion.fn + confusion.tp;
  return { confusion, items: parsed.data.length,
    falsePositiveRate: negatives ? confusion.fp / negatives : null,
    falseNegativeRate: positives ? confusion.fn / positives : null,
    interval95: { fpr: wilson95(confusion.fp, negatives), fnr: wilson95(confusion.fn, positives) } };
}

/** Authority status of this metadata-only diagnostic API; it cannot mint a native capability. */
export function regulatedCalibrationAuthorityStatus(): {
  available: false; reason: "CALIBRATION_AUTHORITY_UNAVAILABLE"; detail: string;
} {
  return { available: false, reason: "CALIBRATION_AUTHORITY_UNAVAILABLE",
    detail: "Caller metadata cannot establish human labels, adjudication or expert approval. Native calibrationAuthority admission requires verified artifacts and a trusted operator roster; the unconfigured D-08 roster is empty." };
}
export interface RegulatedJudgeAdmission {
  outcome: "not_evaluated";
  claimKind: "self_reported" | "synthetic_example";
  mode: "llm" | "simulated" | "unknown";
  identity: JudgeIdentity | null; calibrationId: string | null;
  authorityStatus: "unavailable"; reasons: string[];
  statistics: ConfusionStatistics | null;
  statisticsSource: "unverified_diagnostic_pairs";
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
/** Readiness diagnostics only. Do not treat a clean diagnostic list as admission. */
export function admitRegulatedJudgeResult(input: unknown): RegulatedJudgeAdmission {
  const raw = object(input) && object(input.execution) ? input.execution : null;
  const parsedExecution = raw ? executionSchema.safeParse(raw) : null;
  const known = parsedExecution?.success ? parsedExecution.data : null;
  const mode = raw?.mode === "simulated" || raw?.mode === "llm" ? raw.mode : "unknown";
  const synthetic = mode === "simulated" || raw?.origin === "scripted";
  const result: RegulatedJudgeAdmission = { outcome: "not_evaluated",
    claimKind: synthetic ? "synthetic_example" : "self_reported", mode,
    identity: known?.identity ?? null, calibrationId: known?.calibrationId ?? null,
    authorityStatus: "unavailable", reasons: [regulatedCalibrationAuthorityStatus().reason],
    statistics: null, statisticsSource: "unverified_diagnostic_pairs" };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) { result.reasons.push("INVALID_ADMISSION_INPUT"); return result; }
  const x = parsed.data, e = x.execution, c = x.calibration;
  const now = Date.parse(x.now);
  if (!e) result.reasons.push("JUDGE_EXECUTION_UNAVAILABLE");
  else {
    if (e.mode !== "llm") result.reasons.push("SIMULATED_JUDGE_NOT_ADMISSIBLE");
    if (e.origin !== "live_llm" || e.callEvidenceSha256 === null) result.reasons.push("LIVE_EXECUTION_NOT_ESTABLISHED");
    if (e.responseModel !== e.identity.model) result.reasons.push("RESPONSE_MODEL_MISMATCH");
    if (Date.parse(e.evaluatedAt) > now) result.reasons.push("EXECUTION_IN_FUTURE");
  }
  result.statistics = calculateConfusion(x.diagnosticPairs);
  if (!result.statistics) result.reasons.push("INVALID_DIAGNOSTIC_PAIRS");
  if (!c) { result.reasons.push("CALIBRATION_MISSING"); return result; }
  if (c.scenarioId !== x.scenarioId || (e && c.id !== e.calibrationId)) result.reasons.push("CALIBRATION_SCOPE_MISMATCH");
  if (e && !same(c.judge, e.identity)) result.reasons.push("JUDGE_IDENTITY_MISMATCH");
  // Exact ISO parsing above permits expanded/negative years; order instants numerically.
  const calibratedAt = Date.parse(c.calibratedAt), expiresAt = Date.parse(c.expiresAt);
  if (!(calibratedAt <= now && now < expiresAt && calibratedAt < expiresAt) ||
      (e && calibratedAt > Date.parse(e.evaluatedAt))) result.reasons.push("CALIBRATION_EXPIRED_OR_FUTURE");
  if (Date.parse(c.goldSet.labelledAt) > calibratedAt) result.reasons.push("LABEL_TIME_AFTER_CALIBRATION");
  const declaredNames = c.goldSet.labelledBy.map(id => id.trim().normalize("NFKC").toLowerCase());
  if (declaredNames.length < 2 || new Set(declaredNames).size !== declaredNames.length) result.reasons.push("TWO_DISTINCT_LABELLERS_NOT_DECLARED");
  // These are untrusted declarations, not authenticated humans or an expert policy.
  if (c.minimumGoldSetSize === null) result.reasons.push("EXPERT_MINIMUM_NOT_RECORDED");
  else if (c.goldSet.items < c.minimumGoldSetSize) result.reasons.push("GOLD_SET_BELOW_DECLARED_MINIMUM");
  if (c.tolerance.maxFpr === null || c.tolerance.maxFnr === null) result.reasons.push("EXPERT_TOLERANCES_NOT_RECORDED");
  if (!x.goldSetBytes) result.reasons.push("GOLD_SET_BYTES_MISSING");
  else if (sha256Hex(Buffer.from(x.goldSetBytes)) !== c.goldSet.sha256) result.reasons.push("GOLD_SET_DIGEST_MISMATCH");
  const s = result.statistics;
  if (s) {
    if (s.items !== c.goldSet.items) result.reasons.push("DECLARED_GOLD_ITEM_COUNT_MISMATCH");
    if (s.falsePositiveRate === null || s.falseNegativeRate === null) result.reasons.push("CALIBRATION_CLASS_DENOMINATOR_EMPTY");
    else {
      if (!same(s.confusion, c.confusion) || s.falsePositiveRate !== c.falsePositiveRate || s.falseNegativeRate !== c.falseNegativeRate || !same(s.interval95, c.interval95)) result.reasons.push("CALIBRATION_STATISTICS_MISMATCH");
      if ((c.tolerance.maxFpr !== null && s.falsePositiveRate > c.tolerance.maxFpr) || (c.tolerance.maxFnr !== null && s.falseNegativeRate > c.tolerance.maxFnr)) result.reasons.push("CALIBRATION_OUTSIDE_DECLARED_TOLERANCE");
    }
  }
  result.reasons = [...new Set(result.reasons)];
  // Intentionally no pass/fail branch and no minted capability/roster/signature schema.
  // Positive admission uses calibrationAuthority's verified native capabilities instead.
  return result;
}
