/** Historical documentation data only. No native calibration, review or publication authority. */
import { z } from "zod";
import { canonicalize, isExactIsoTime } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import { wilson95, type RegulatedJudgeCalibration } from "./calibration.js";
import { bundleSchema, judgeBindingSchema, type JudgeBinding } from "./calibrationContract.js";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const rate = z.number().finite().min(0).max(1);
const instant = z.string().refine(isExactIsoTime);
const rowSchema = z.strictObject({
  calibrationId: bundleSchema.shape.id, scenarioId: judgeBindingSchema.shape.scenarioId,
  provider: judgeBindingSchema.shape.provider, judge: judgeBindingSchema.shape.judge,
  goldSet: z.strictObject({ sha256: digest, items: count }),
  confusion: z.strictObject({ tp: count, fp: count, tn: count, fn: count }),
  falsePositiveRate: rate, falseNegativeRate: rate,
  interval95: z.strictObject({ fpr: z.tuple([rate, rate]), fnr: z.tuple([rate, rate]) }),
  calibratedAt: instant, expiresAt: instant, sourceRecordSha256: digest, projectionSha256: digest
});
const indexSchema = z.strictObject({ version: z.literal(1), kind: z.literal("documentation_display"), rows: z.array(z.unknown()).max(119) });
export type CalibrationDisplayRow = z.infer<typeof rowSchema>;
const hash = (value: unknown): string => sha256Hex(Buffer.from(canonicalize(value), "utf8"));
function checkedDisplayRow(input: unknown): CalibrationDisplayRow {
  const parsed = rowSchema.safeParse(input);
  if (!parsed.success) throw new Error("Calibration display schema invalid");
  const row = parsed.data, { projectionSha256, ...body } = row;
  if (hash(body) !== projectionSha256) throw new Error("Calibration display digest mismatch");
  const { tp, fp, tn, fn } = row.confusion, items = tp + fp + tn + fn, negatives = fp + tn, positives = fn + tp;
  if (!Number.isSafeInteger(items) || items !== row.goldSet.items || negatives === 0 || positives === 0)
    throw new Error("Calibration display class counts invalid");
  if (row.falsePositiveRate !== fp / negatives || row.falseNegativeRate !== fn / positives ||
      canonicalize(row.interval95) !== canonicalize({ fpr: wilson95(fp, negatives), fnr: wilson95(fn, positives) }))
    throw new Error("Calibration display statistics inconsistent");
  if (!(Date.parse(row.calibratedAt) < Date.parse(row.expiresAt))) throw new Error("Calibration display dates invalid");
  return row;
}
/** Caller records remain data. Native export invokes this only after its fresh process-local snapshot check. */
export function projectCalibrationDisplay(record: RegulatedJudgeCalibration, provider: JudgeBinding["provider"],
  sourceRecordSha256: string): CalibrationDisplayRow {
  const body = { calibrationId: record.id, scenarioId: record.scenarioId, provider, judge: record.judge,
    goldSet: { sha256: record.goldSet.sha256, items: record.goldSet.items }, confusion: record.confusion,
    falsePositiveRate: record.falsePositiveRate, falseNegativeRate: record.falseNegativeRate, interval95: record.interval95,
    calibratedAt: record.calibratedAt, expiresAt: record.expiresAt, sourceRecordSha256 };
  return checkedDisplayRow({ ...body, projectionSha256: hash(body) });
}
/** Digests/arithmetic validate consistency, never authentic native origin or human approval. */
export function readCalibrationDisplayIndex(input: unknown,
  scenarios: readonly { readonly id: string; readonly packId: string }[]): ReadonlyMap<string, CalibrationDisplayRow> {
  const parsed = indexSchema.safeParse(input);
  if (!parsed.success) throw new Error("Calibration display index schema invalid");
  const identities = new Map<string, number>();
  for (const scenario of scenarios) identities.set(scenario.id, (identities.get(scenario.id) ?? 0) + 1);
  const rows = new Map<string, CalibrationDisplayRow>();
  for (const value of parsed.data.rows) {
    const row = checkedDisplayRow(value);
    if (identities.get(row.scenarioId) !== 1) throw new Error("Calibration display scenario unknown or ambiguous");
    if (rows.has(row.scenarioId)) throw new Error("Calibration display scenario duplicated");
    rows.set(row.scenarioId, row);
  }
  return rows;
}
