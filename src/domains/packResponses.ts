import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";

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

/**
 * The console questionnaire's last scored answers, kept per signed-in person and pack under the workspace, so a person can
 * leave and come back (A4-10). Self-reported levels only; the file is named by a hash, never by the person's id.
 */
const savedPath = (workspace: string, userId: string, packId: string): string =>
  join(workspace, ".amc", "studio", "industry-pack-answers", `${sha256Hex(`${userId}\n${packId}`)}.json`);

export function saveConsoleResponses(workspace: string, userId: string, packId: string, responses: Record<string, number>): void {
  writeFileAtomic(savedPath(workspace, userId, packId), JSON.stringify({ packId, responses, savedTs: Date.now() }), 0o600);
}

/** The saved answers, or null when there are none or the file does not read as answers to this pack. */
export function loadConsoleResponses(workspace: string, userId: string, packId: string): Record<string, number> | null {
  const path = savedPath(workspace, userId, packId);
  if (!pathExists(path)) return null;
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as { packId?: unknown; responses?: unknown };
    if (saved.packId !== packId || !saved.responses || typeof saved.responses !== "object" || Array.isArray(saved.responses)) return null;
    return Object.fromEntries(Object.entries(saved.responses).filter(([, level]) => Number.isInteger(level) && (level as number) >= 1 && (level as number) <= 5)) as Record<string, number>;
  } catch {
    return null;
  }
}
