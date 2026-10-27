/**
 * Opt-in review timing (P2-22): the reviewer-time data P2-03 and P2-05 use for the Gate G2 metric. Off unless
 * `operator.reviewTiming.enabled` is true in a signed amc.config.yaml and the reviewer accepts the on-screen notice. Each
 * event is one ledger audit row (auditType REVIEW_TIMING, self-reported: the browser measures active time and pauses its
 * timer after 60 seconds on a hidden page). A reviewer appears only as sha256(providerId:subject:workspaceSalt); the salt
 * lives in the workspace, 0600, so the pseudonym cannot be recomputed from a username alone. AMC records time, never
 * correctness: the study protocol scores that.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { loadOperatorConfig } from "./operatorSources.js";

const AUDIT_TYPE = "REVIEW_TIMING";
const PROVIDER_ID = "amc-studio";
const REVIEW_TIMING_EVENTS = ["review_session_started", "review_item_opened", "review_item_decided", "review_session_completed"] as const;
type ReviewTimingEventName = (typeof REVIEW_TIMING_EVENTS)[number];
/** Ids are opaque: no address, path or free text, so nothing personal rides in them. */
const opaqueId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

export const reviewTimingInputSchema = z.discriminatedUnion("event", [
  z.strictObject({ event: z.literal("review_session_started"), noticeAccepted: z.literal(true), packetId: opaqueId }),
  z.strictObject({ event: z.literal("review_item_opened"), sessionId: opaqueId, itemId: opaqueId }),
  z.strictObject({ event: z.literal("review_item_decided"), sessionId: opaqueId, itemId: opaqueId,
    decision: z.enum(["confirmed", "disputed", "needs_more"]), activeSeconds: z.number().int().min(0).max(86_400) }),
  z.strictObject({ event: z.literal("review_session_completed"), sessionId: opaqueId, activeSeconds: z.number().int().min(0).max(86_400) })
]);
export type ReviewTimingInput = z.infer<typeof reviewTimingInputSchema>;

interface TimingRecord {
  event: ReviewTimingEventName; sessionId: string; reviewerPseudonym: string; packetId: string;
  itemId: string | null; decision: string | null; activeSeconds: number | null; ts: number;
}

export class ReviewTimingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ReviewTimingError";
  }
}

export const reviewTimingEnabled = (workspace: string): boolean => loadOperatorConfig(workspace).reviewTiming.enabled;

/** The workspace salt, created once (32 random bytes, 0600). */
function workspaceSalt(workspace: string): string {
  const path = join(workspace, ".amc", "operator", "review-timing.salt");
  if (pathExists(path)) {
    const salt = readUtf8(path).trim();
    if (/^[0-9a-f]{64}$/.test(salt)) return salt;
    throw new ReviewTimingError(409, "REVIEW_TIMING_SALT_INVALID", "the review-timing salt is not 64 hex characters");
  }
  ensureDir(join(workspace, ".amc", "operator"));
  const salt = randomBytes(32).toString("hex");
  writeFileAtomic(path, `${salt}\n`, 0o600);
  return salt;
}

const reviewerPseudonym = (workspace: string, subject: string): string => sha256Hex(`${PROVIDER_ID}:${subject}:${workspaceSalt(workspace)}`);

function readRecords(workspace: string, fromTs = 0, toTs = Number.MAX_SAFE_INTEGER): TimingRecord[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return (ledger.db.prepare(`SELECT payload_inline FROM evidence_events WHERE event_type = 'audit' AND ts BETWEEN ? AND ?
      AND json_extract(meta_json, '$.auditType') = '${AUDIT_TYPE}' ORDER BY ts, rowid`).all(fromTs, toTs) as Array<{ payload_inline: string | null }>)
      .flatMap((row) => {
        try { return [JSON.parse(row.payload_inline ?? "") as TimingRecord]; } catch { return []; }
      });
  } finally {
    ledger.close();
  }
}

function append(workspace: string, record: TimingRecord): string {
  const ledger = openLedger(workspace);
  const sessionId = `review-timing-${record.sessionId}-${record.ts}-${randomBytes(4).toString("hex")}`;
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-review-timing", binarySha256: sha256Hex("amc-review-timing") });
    const payload = JSON.stringify(record);
    const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload, payloadExt: "json", inline: true,
      meta: { auditType: AUDIT_TYPE, severity: "LOW", trustTier: "SELF_REPORTED", source: "operator-review-timing", event: record.event } });
    ledger.sealSession(sessionId);
    return id;
  } finally {
    ledger.close();
  }
}

/**
 * Records one event for `subject` (the authenticated caller, never a body field). Refused (409) while timing is off, so
 * nothing is written; an item or completion event must name a session this reviewer started.
 */
export function recordReviewTiming(p: { workspace: string; subject: string; input: ReviewTimingInput; nowTs?: number }): { sessionId: string; eventId: string } {
  if (!reviewTimingEnabled(p.workspace)) throw new ReviewTimingError(409, "REVIEW_TIMING_DISABLED", "review timing is off (operator.reviewTiming.enabled in a signed amc.config.yaml)");
  const ts = p.nowTs ?? Date.now();
  const reviewer = reviewerPseudonym(p.workspace, p.subject);
  const { input } = p;
  if (input.event === "review_session_started") {
    const sessionId = `rts_${randomBytes(12).toString("hex")}`;
    const eventId = append(p.workspace, { event: input.event, sessionId, reviewerPseudonym: reviewer, packetId: input.packetId, itemId: null, decision: null, activeSeconds: null, ts });
    return { sessionId, eventId };
  }
  const started = readRecords(p.workspace).find((row) => row.event === "review_session_started" && row.sessionId === input.sessionId);
  if (started === undefined || started.reviewerPseudonym !== reviewer) throw new ReviewTimingError(404, "REVIEW_SESSION_NOT_FOUND", "no review session of yours has this id");
  const eventId = append(p.workspace, { event: input.event, sessionId: input.sessionId, reviewerPseudonym: reviewer, packetId: started.packetId,
    itemId: "itemId" in input ? input.itemId : null, decision: "decision" in input ? input.decision : null,
    activeSeconds: "activeSeconds" in input ? input.activeSeconds : null, ts });
  return { sessionId: input.sessionId, eventId };
}

const CSV_COLUMNS = ["sessionId", "reviewerPseudonym", "packetId", "itemId", "decision", "startedAt", "completedAt", "activeSeconds"] as const;
const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
};
const iso = (ts: number | undefined): string | null => (ts === undefined ? null : new Date(ts).toISOString());

/** GET /api/v1/operator/review-timing/export: one row per decided item whose session started in [fromTs, toTs]. */
export function exportReviewTimingCsv(workspace: string, fromTs: number, toTs: number): string {
  const records = readRecords(workspace);
  const started = new Map(records.filter((row) => row.event === "review_session_started" && row.ts >= fromTs && row.ts <= toTs).map((row) => [row.sessionId, row]));
  const completed = new Map(records.filter((row) => row.event === "review_session_completed").map((row) => [row.sessionId, row.ts]));
  const rows = records.filter((row) => row.event === "review_item_decided" && started.has(row.sessionId)).map((row) => [
    row.sessionId, row.reviewerPseudonym, row.packetId, row.itemId, row.decision, iso(started.get(row.sessionId)?.ts), iso(completed.get(row.sessionId)), row.activeSeconds
  ]);
  return [CSV_COLUMNS.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
}
