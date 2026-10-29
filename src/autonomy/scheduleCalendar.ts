import { z } from "zod";

const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

function isUtcInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant >= 0
    && new Date(instant).toISOString() === (value.includes(".") ? value : value.replace("Z", ".000Z"));
}

function isCanonicalTimeZone(value: string): boolean {
  if (value !== "UTC" && !value.includes("/")) return false;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone === value;
  } catch { return false; }
}

const utcInstantSchema = z.string().refine(isUtcInstant, "calendar instant must be a valid non-negative UTC ISO timestamp with seconds and optional three-digit milliseconds");
const calendarCommon = {
  version: z.literal(1),
  timeZone: z.string().min(1).max(128).refine(isCanonicalTimeZone, "calendar timeZone must be an explicit canonical IANA timezone (or UTC); aliases are refused"),
  tzdbVersion: z.string().refine(value => typeof process.versions.tz === "string" && value === process.versions.tz,
    "calendar tzdbVersion must match the running Node timezone database; unsupported provenance is refused"),
  startAt: utcInstantSchema,
  gap: z.literal("skip"),
  fold: z.literal("earlier"),
  missed: z.literal("skip")
};
const wallTime = { hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) };

/** The signed expression pins both its interpretation and its timezone data. */
export const calendarScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ ...calendarCommon, kind: z.literal("at"), at: utcInstantSchema }).strict(),
  z.object({ ...calendarCommon, kind: z.literal("daily"), ...wallTime }).strict(),
  z.object({ ...calendarCommon, kind: z.literal("weekly"), weekday: z.number().int().min(0).max(6), ...wallTime }).strict()
]).superRefine((calendar, context) => {
  if (calendar.kind === "at" && Date.parse(calendar.at) < Date.parse(calendar.startAt)) {
    context.addIssue({ code: "custom", path: ["at"], message: "calendar at must not precede startAt" });
  }
});

export type CalendarSchedule = z.infer<typeof calendarScheduleSchema>;

interface LocalTime { year: number; month: number; day: number; hour: number; minute: number; second: number }

function localTime(format: Intl.DateTimeFormat, instant: number): LocalTime {
  const parts = format.formatToParts(instant);
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find(value => value.type === name)!.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

function midnight(time: Pick<LocalTime, "year" | "month" | "day">): number {
  const date = new Date(0);
  date.setUTCFullYear(time.year, time.month - 1, time.day);
  return date.getTime();
}

function localScalar(time: LocalTime): number {
  // Add clock fields numerically: the local wall clock can exceed Date's upper
  // limit while its corresponding UTC instant remains representable.
  return midnight(time) + time.hour * 3_600_000 + time.minute * 60_000 + time.second * 1_000;
}

function earlierInstant(format: Intl.DateTimeFormat, day: Date, hour: number, minute: number): number | null {
  const target = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute, second: 0 };
  const scalar = localScalar(target);
  const offsets = new Set<number>();
  // Probe both sides of the local day, including date-line and fractional-hour
  // transitions. Six-hour samples preserve both offsets around pinned tzdb
  // transitions; verify each inverse against Intl rather than shifting a gap.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = Math.max(-MAX_DATE_MS, Math.min(MAX_DATE_MS, scalar + hours * 3_600_000));
    offsets.add(localScalar(localTime(format, probe)) - probe);
  }
  let earliest: number | null = null;
  for (const offset of offsets) {
    const candidate = scalar - offset;
    if (!Number.isSafeInteger(candidate) || candidate < 0 || candidate > MAX_DATE_MS) continue;
    const actual = localTime(format, candidate);
    if (actual.year === target.year && actual.month === target.month && actual.day === target.day
      && actual.hour === hour && actual.minute === minute && actual.second === 0) {
      earliest = earliest === null ? candidate : Math.min(earliest, candidate);
    }
  }
  return earliest;
}

/**
 * Return one strictly future occurrence. Missed dates are skipped, and a fold
 * has one occurrence: its earlier instant, even when the later fold is future.
 * The -1 lower-bound sentinel includes an initial occurrence at Unix epoch 0;
 * callers must still reject negative operational claim clocks.
 * Invalid expressions, unsupported provenance and unrepresentable clocks throw.
 */
export function nextCalendarOccurrence(input: CalendarSchedule, afterUnixMs: number): number | null {
  const calendar = calendarScheduleSchema.parse(input);
  if (!Number.isSafeInteger(afterUnixMs) || afterUnixMs < -1 || afterUnixMs > MAX_DATE_MS) {
    throw new Error("Calendar clock must be a safe integer from -1 through the representable Date range; -1 is only an initial lower bound.");
  }
  if (calendar.kind === "at") {
    const instant = Date.parse(calendar.at);
    return instant > afterUnixMs ? instant : null;
  }
  if (afterUnixMs === MAX_DATE_MS) return null;
  const startAt = Date.parse(calendar.startAt);
  const format = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone: calendar.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  const firstDay = midnight(localTime(format, Math.max(afterUnixMs, startAt - 1)));
  // Bound work even if a future runtime's timezone data cannot resolve this
  // expression. A failure is explicit, never an implicit permission to run.
  for (let dayIndex = 0; dayIndex < 366; dayIndex += 1) {
    const dayMs = firstDay + dayIndex * DAY_MS;
    if (dayMs > MAX_DATE_MS) return null;
    const day = new Date(dayMs);
    if (calendar.kind === "weekly" && day.getUTCDay() !== calendar.weekday) continue;
    const candidate = earlierInstant(format, day, calendar.hour, calendar.minute);
    if (candidate !== null && candidate > afterUnixMs && candidate >= startAt) return candidate;
  }
  throw new Error("Calendar occurrence search exceeded its bounded timezone transition window.");
}
