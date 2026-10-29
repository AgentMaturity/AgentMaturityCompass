import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarScheduleSchema, nextCalendarOccurrence } from "../src/autonomy/scheduleCalendar.js";

const utc = (value: string) => Date.parse(value);
const base = {
  version: 1,
  timeZone: "America/New_York",
  tzdbVersion: process.versions.tz,
  startAt: "2026-01-01T00:00:00Z",
  gap: "skip",
  fold: "earlier",
  missed: "skip"
};
const daily = (over: Record<string, unknown> = {}) => calendarScheduleSchema.parse({
  ...base, kind: "daily", hour: 9, minute: 30, ...over
});

afterEach(() => { vi.useRealTimers(); });

describe("versioned calendar admission", () => {
  it("accepts only explicit policy and current timezone provenance", () => {
    expect(daily()).toMatchObject(base);
    expect(calendarScheduleSchema.parse({ ...base, kind: "weekly", weekday: 0, hour: 9, minute: 30 })).toMatchObject({ kind: "weekly", weekday: 0 });
    expect(calendarScheduleSchema.parse({ ...base, kind: "at", at: "2026-03-08T07:30:00.000Z" })).toMatchObject({ kind: "at" });
  });

  it.each([
    ["version", undefined], ["version", 2], ["version", "1"],
    ["timeZone", undefined], ["timeZone", "US/Eastern"], ["timeZone", "Etc/UTC"],
    ["timeZone", "america/new_york"], ["timeZone", "+05:30"], ["timeZone", "Not/A_Zone"],
    ["tzdbVersion", undefined], ["tzdbVersion", "1900a"],
    ["startAt", undefined], ["startAt", "2026-02-30T00:00:00Z"],
    ["startAt", "2026-01-01"], ["startAt", "2026-01-01T00:00:00+00:00"],
    ["startAt", "2026-01-01T00:00:00.0000Z"], ["startAt", "2026-01-01T24:00:00Z"],
    ["startAt", "1969-12-31T23:59:59Z"], ["startAt", "+010000-01-01T00:00:00.000Z"],
    ["gap", undefined], ["gap", "shift"], ["fold", undefined], ["fold", "later"],
    ["missed", undefined], ["missed", "catch-up"], ["hour", 24], ["hour", -1],
    ["hour", 1.5], ["hour", "9"], ["minute", 60], ["minute", -1], ["minute", 0.5],
    ["extra", true], ["weekday", 1], ["at", "2026-03-08T07:30:00Z"], ["cron", "* * * * *"]
  ])("rejects malformed or ambiguous %s=%s", (field, value) => {
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "daily", hour: 9, minute: 30, [field as string]: value }).success).toBe(false);
  });

  it.each([-1, 7, 0.5, "0", undefined])("rejects invalid weekly weekday %s", weekday => {
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "weekly", weekday, hour: 9, minute: 30 }).success).toBe(false);
  });

  it("rejects unsupported forms and an at instant before its anchor", () => {
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "cron", expression: "* * * * *" }).success).toBe(false);
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "at", at: "2025-12-31T23:59:59Z" }).success).toBe(false);
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "at", at: "2026-02-30T00:00:00Z" }).success).toBe(false);
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "at", at: "2026-03-01T00:00:00+00:00" }).success).toBe(false);
    expect(calendarScheduleSchema.safeParse({ ...base, kind: "at", at: "2026-03-01T00:00:00Z", hour: 0 }).success).toBe(false);
  });

  it("revalidates provenance at calculation rather than trusting a TypeScript cast", () => {
    expect(() => nextCalendarOccurrence({ ...daily(), tzdbVersion: "1900a" }, utc("2026-01-02T00:00:00Z"))).toThrow(/tzdb|timezone database/i);
  });
});

describe("deterministic next calendar occurrence", () => {
  it("uses explicit timezone and crosses UTC midnight correctly", () => {
    const after = utc("2026-01-02T00:00:00Z");
    expect(nextCalendarOccurrence(daily(), after)).toBe(utc("2026-01-02T14:30:00Z"));
    expect(nextCalendarOccurrence(daily({ timeZone: "Asia/Tokyo" }), after)).toBe(utc("2026-01-02T00:30:00Z"));
    expect(nextCalendarOccurrence(daily({ timeZone: "UTC", hour: 0, minute: 0 }), after)).toBe(utc("2026-01-03T00:00:00Z"));
  });

  it("skips a nonexistent local time instead of shifting it across the DST gap", () => {
    expect(nextCalendarOccurrence(daily({ hour: 2, minute: 30 }), utc("2026-03-08T00:00:00Z")))
      .toBe(utc("2026-03-09T06:30:00Z"));
  });

  it("selects the earlier fold once and skips the repeated local wall time", () => {
    const calendar = daily({ hour: 1, minute: 30 });
    expect(nextCalendarOccurrence(calendar, utc("2026-11-01T04:00:00Z"))).toBe(utc("2026-11-01T05:30:00Z"));
    expect(nextCalendarOccurrence(calendar, utc("2026-11-01T05:30:00Z"))).toBe(utc("2026-11-02T06:30:00Z"));
    expect(nextCalendarOccurrence(calendar, utc("2026-11-01T06:00:00Z"))).toBe(utc("2026-11-02T06:30:00Z"));
  });

  it("handles non-hour DST gaps and folds", () => {
    expect(nextCalendarOccurrence(daily({ timeZone: "Australia/Lord_Howe", hour: 2, minute: 15 }), utc("2026-10-03T12:00:00Z")))
      .toBe(utc("2026-10-04T15:15:00Z"));
    const calendar = daily({ timeZone: "Australia/Lord_Howe", hour: 1, minute: 45 });
    expect(nextCalendarOccurrence(calendar, utc("2026-04-04T12:00:00Z"))).toBe(utc("2026-04-04T14:45:00Z"));
    expect(nextCalendarOccurrence(calendar, utc("2026-04-04T14:45:00Z"))).toBe(utc("2026-04-05T15:15:00Z"));
  });

  it("skips an entire missing local date at a timezone date-line transition", () => {
    const calendar = daily({ timeZone: "Pacific/Apia", startAt: "2011-01-01T00:00:00Z", hour: 9, minute: 0 });
    expect(nextCalendarOccurrence(calendar, utc("2011-12-29T19:00:00Z"))).toBe(utc("2011-12-30T19:00:00Z"));
  });

  it("preserves historical offsets containing seconds", () => {
    const calendar = daily({ timeZone: "Africa/Monrovia", startAt: "1971-01-01T00:00:00Z", hour: 9, minute: 0 });
    expect(nextCalendarOccurrence(calendar, utc("1971-01-02T00:00:00Z"))).toBe(utc("1971-01-02T09:44:30Z"));
  });

  it("uses local weekday and skips a weekly occurrence in the DST gap", () => {
    const calendar = calendarScheduleSchema.parse({ ...base, kind: "weekly", weekday: 0, hour: 2, minute: 30 });
    expect(nextCalendarOccurrence(calendar, utc("2026-03-07T12:00:00Z"))).toBe(utc("2026-03-15T06:30:00Z"));
    const tokyo = calendarScheduleSchema.parse({ ...base, timeZone: "Asia/Tokyo", kind: "weekly", weekday: 0, hour: 0, minute: 0 });
    expect(nextCalendarOccurrence(tokyo, utc("2026-01-02T00:00:00Z"))).toBe(utc("2026-01-03T15:00:00Z"));
  });

  it("honors the anchor, including an anchor exactly on an occurrence", () => {
    expect(nextCalendarOccurrence(daily({ startAt: "2026-02-03T14:30:00Z" }), utc("2026-01-01T00:00:00Z")))
      .toBe(utc("2026-02-03T14:30:00Z"));
    expect(nextCalendarOccurrence(daily({ startAt: "2026-02-03T14:30:00.001Z" }), utc("2026-01-01T00:00:00Z")))
      .toBe(utc("2026-02-04T14:30:00Z"));
    expect(nextCalendarOccurrence(daily({ startAt: "2030-02-03T14:30:00Z" }), utc("2026-01-01T00:00:00Z")))
      .toBe(utc("2030-02-03T14:30:00Z"));
  });

  it("skips missed occurrences after a forward clock jump without reading the host clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2050-01-01T00:00:00Z"));
    const calendar = daily();
    expect(nextCalendarOccurrence(calendar, utc("2026-01-02T14:30:00Z"))).toBe(utc("2026-01-03T14:30:00Z"));
    expect(nextCalendarOccurrence(calendar, utc("2026-06-08T20:00:00Z"))).toBe(utc("2026-06-09T13:30:00Z"));
    expect(nextCalendarOccurrence(calendar, utc("2026-01-02T14:29:59.999Z"))).toBe(utc("2026-01-02T14:30:00Z"));
  });

  it("keeps at schedules absolute and returns null once their instant is exhausted", () => {
    const calendar = calendarScheduleSchema.parse({ ...base, kind: "at", at: "2026-03-08T07:30:00Z" });
    const instant = utc("2026-03-08T07:30:00Z");
    expect(nextCalendarOccurrence(calendar, instant - 1)).toBe(instant);
    expect(nextCalendarOccurrence({ ...calendar, timeZone: "Asia/Tokyo" }, instant - 1)).toBe(instant);
    expect(nextCalendarOccurrence(calendar, instant)).toBeNull();
    expect(nextCalendarOccurrence(calendar, instant + 86_400_000)).toBeNull();
  });

  it("includes epoch-zero initial occurrences using only the -1 lower-bound sentinel", () => {
    const startAt = "1970-01-01T00:00:00Z";
    const calendar = calendarScheduleSchema.parse({ ...base, timeZone: "UTC", kind: "at", startAt, at: startAt });
    expect(nextCalendarOccurrence(calendar, -1)).toBe(0);
    expect(nextCalendarOccurrence(calendar, 0)).toBeNull();
    const midnight = daily({ timeZone: "UTC", startAt, hour: 0, minute: 0 });
    expect(nextCalendarOccurrence(midnight, -1)).toBe(0);
    expect(nextCalendarOccurrence(midnight, 0)).toBe(86_400_000);
  });

  it.each([-2, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001])("rejects an invalid or unrepresentable calculation clock %s", after => {
    expect(() => nextCalendarOccurrence(daily(), after)).toThrow(/clock/i);
  });

  it("terminates at the representable date boundary", () => {
    expect(nextCalendarOccurrence(daily({ timeZone: "UTC", hour: 0, minute: 0 }), 8_640_000_000_000_000)).toBeNull();
    expect(nextCalendarOccurrence(daily({ timeZone: "Pacific/Kiritimati", hour: 23, minute: 59 }), 8_640_000_000_000_000 - 1)).toBeNull();
  });
});
