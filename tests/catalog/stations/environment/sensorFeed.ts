import type { z } from "zod";
import { invalidInput, outcome, sameBinding, sensorSchema, type OracleOutcome } from "./protocol.js";

type SensorInput = z.infer<typeof sensorSchema>;
/** One shared temporal verdict prevents an in-range value from making an unknown interval appear safe. */
function temporalProblem(data: SensorInput): string | null {
  const now = Date.parse(data.at); const start = now - data.profile.windowMs;
  if (data.readings.some(row => Date.parse(row.recordedAt) > now)) return "future_reading";
  for (const requirement of data.profile.requirements) {
    const times = [...new Set(data.readings.filter(row => row.sensorId === requirement.sensorId).map(row => Date.parse(row.recordedAt)))].sort((a, b) => a - b);
    if (times.length === 0) return "reading_gap";
    const latest = times[times.length - 1]!;
    if (now - latest > data.profile.maxAgeMs) return "stale_reading";
    if (!times.some(time => time >= start)) return "reading_gap";
    const anchor = times.filter(time => time <= start).at(-1);
    if (anchor === undefined) return "reading_gap";
    const interval = [anchor, ...times.filter(time => time > start)];
    if (now - latest > data.profile.maxGapMs || interval.some((time, i) => i > 0 && time - interval[i - 1]! > data.profile.maxGapMs)) return "reading_gap";
  }
  return null;
}

/** Local sensor gate only: this neither releases a physical lot nor establishes a food-safety plan. */
export function runSensorFeed(input: unknown): OracleOutcome {
  const parsed = sensorSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data;
  const gateLog: Array<{ lotId: string; checkedReadings: number }> = [];
  const observations = { readings: structuredClone(data.readings), sensorGateLog: gateLog, scope: "synthetic_fixture_parameter" };
  if (!data.feedAvailable) return outcome("not_evaluated", "sensor_feed_unavailable", observations);
  if (!sameBinding(data.context, data.profile.binding) || data.readings.some(row => !sameBinding(data.context, row.binding))) return outcome("deny", "binding_mismatch", observations);
  if (data.profile.lotId !== data.lotId || new Set(data.profile.requirements.map(row => row.sensorId)).size !== data.profile.requirements.length
    || data.readings.some(row => row.lotId !== data.lotId || !data.profile.requirements.some(requirement => requirement.sensorId === row.sensorId && requirement.unit === row.unit))) return outcome("not_evaluated", "sensor_unresolved", observations);
  const values = new Map<string, Map<number, number>>();
  for (const row of data.readings) {
    const time = Date.parse(row.recordedAt);
    if (!values.has(row.sensorId)) values.set(row.sensorId, new Map());
    const sensor = values.get(row.sensorId)!;
    if (sensor.has(time) && sensor.get(time) !== row.value) return outcome("not_evaluated", "contradictory_readings", observations);
    sensor.set(time, row.value);
  }
  const temporalReason = temporalProblem(data);
  if (temporalReason !== null) return outcome("not_evaluated", temporalReason, observations);
  const now = Date.parse(data.at); const start = now - data.profile.windowMs;
  const coverageReadings = data.profile.requirements.flatMap(requirement => {
    const samples = data.readings.filter(row => row.sensorId === requirement.sensorId && Date.parse(row.recordedAt) <= now);
    const anchor = samples.filter(row => Date.parse(row.recordedAt) <= start)
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
    return samples.filter(row => Date.parse(row.recordedAt) >= start || row === anchor);
  });
  if (coverageReadings.some(row => { const requirement = data.profile.requirements.find(r => r.sensorId === row.sensorId)!; return row.value < requirement.min || row.value > requirement.max; })) return outcome("deny", "reading_out_of_range", observations);
  gateLog.push({ lotId: data.lotId, checkedReadings: coverageReadings.length });
  return outcome("allow", "sensor_gate_allowed", observations, ["sensor_gate:" + data.lotId]);
}
