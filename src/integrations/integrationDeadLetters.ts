import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists } from "../utils/fs.js";

export interface IntegrationDeadLetterEntry {
  v: 1;
  deadLetterId: string;
  ts: number;
  channelId: string;
  eventName: string;
  agentId: string;
  url: string;
  orderedSequence: number;
  payloadSha256: string;
  attemptCount: number;
  lastHttpStatus: number | null;
  reason: string;
}

export function integrationDeadLetterPath(workspace: string): string {
  return join(workspace, ".amc", "integrations", "dead-letters.jsonl");
}

export function appendIntegrationDeadLetter(workspace: string, entry: IntegrationDeadLetterEntry): string {
  const path = integrationDeadLetterPath(workspace);
  ensureDir(join(workspace, ".amc", "integrations"));
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

export function loadIntegrationDeadLetters(workspace: string, limit = 100): IntegrationDeadLetterEntry[] {
  const path = integrationDeadLetterPath(workspace);
  if (!pathExists(path)) {
    return [];
  }
  const text = readFileSync(path, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const out: IntegrationDeadLetterEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Partial<IntegrationDeadLetterEntry>;
      if (
        parsed.v === 1 &&
        typeof parsed.deadLetterId === "string" &&
        typeof parsed.channelId === "string" &&
        typeof parsed.eventName === "string" &&
        typeof parsed.agentId === "string" &&
        typeof parsed.url === "string" &&
        typeof parsed.orderedSequence === "number" &&
        typeof parsed.payloadSha256 === "string" &&
        typeof parsed.attemptCount === "number" &&
        (typeof parsed.lastHttpStatus === "number" || parsed.lastHttpStatus === null) &&
        typeof parsed.reason === "string" &&
        typeof parsed.ts === "number"
      ) {
        out.push(parsed as IntegrationDeadLetterEntry);
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return out.slice(-Math.max(0, limit));
}
