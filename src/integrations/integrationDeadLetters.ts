import { join } from "node:path";
import { withIntegrationJournalProtocol, type IntegrationJournalIo } from "./integrationJournalProtocol.js";
import { normalizeWebhookDeliveryError, redactWebhookDestination } from "./webhookDelivery.js";

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

function sanitizeDeadLetterEntry(entry: IntegrationDeadLetterEntry): IntegrationDeadLetterEntry {
  return {
    ...entry,
    url: redactWebhookDestination(entry.url),
    reason: normalizeWebhookDeliveryError(entry.reason)
  };
}

export function appendIntegrationDeadLetter(workspace: string, entry: IntegrationDeadLetterEntry): string {
  return withIntegrationJournalProtocol(workspace, journal => appendIntegrationDeadLetterInJournal(journal, workspace, entry));
}
/** Normalize, dedupe and append under the same active file-lock scope. */
export function appendIntegrationDeadLetterInJournal(io: IntegrationJournalIo, workspace: string, entry: IntegrationDeadLetterEntry): string {
  if (io.workspace !== workspace) throw new Error("integration journal scope belongs to another workspace");
  const existing = loadDeadLetters(io, Number.MAX_SAFE_INTEGER);
  if (!existing.some(row => row.deadLetterId === entry.deadLetterId)) io.appendDeadLetter(`${JSON.stringify(sanitizeDeadLetterEntry(entry))}\n`);
  return join(workspace, ".amc", "integrations", "dead-letters.jsonl");
}

export function loadIntegrationDeadLetters(workspace: string, limit = 100): IntegrationDeadLetterEntry[] {
  return withIntegrationJournalProtocol(workspace, journal => loadDeadLetters(journal, limit));
}
function loadDeadLetters(io: IntegrationJournalIo, limit: number): IntegrationDeadLetterEntry[] {
  const text = io.deadLettersText();
  if (text === null) {
    return [];
  }
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
        out.push(sanitizeDeadLetterEntry(parsed as IntegrationDeadLetterEntry));
      }
    } catch {
      // Skip malformed lines.
    }
  }
  const sanitizedText = out.map((entry) => JSON.stringify(entry)).join("\n");
  const normalizedFile = sanitizedText.length > 0 ? `${sanitizedText}\n` : "";
  if (normalizedFile !== text) {
    io.normalizeDeadLetters(normalizedFile);
  }
  return out.slice(-Math.max(0, limit));
}
