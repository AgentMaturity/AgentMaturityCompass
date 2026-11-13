import { readFileSync } from "node:fs";

/** Reads a `{ questionId: level }` JSON file (used by `amc domain apply --responses` and `amc domain pack run --responses`). */
export function loadResponses(path: string): Record<string, number> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--responses file must be a JSON object of { questionId: level }");
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const level = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(level)) out[key] = level;
  }
  return out;
}
