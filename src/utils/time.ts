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
