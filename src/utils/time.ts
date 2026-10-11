export function parseWindowToMs(window: string): number {
  const match = /^(\d+)([dhm])$/.exec(window.trim());
  if (!match) {
    throw new Error(`Invalid window format: ${window}. Expected like 14d, 24h, 30m.`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`Invalid window numeric value: ${window}`);
  }

  if (unit === "d") {
    return value * 24 * 60 * 60 * 1000;
  }
  if (unit === "h") {
    return value * 60 * 60 * 1000;
  }
  return value * 60 * 1000;
}

export function dayKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * True when `value` is exactly the toISOString spelling of a real instant: one spelling per instant. False, never an
 * exception, for an impossible date such as 2026-02-30, so a schema refinement built on it reports an issue.
 */
export function isExactIsoTime(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
