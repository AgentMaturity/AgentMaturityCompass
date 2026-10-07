import { z } from "zod";
import { claimKindSchema } from "../../claims/eligibility/schemas.js";
import type { EvidenceEventType } from "../../types.js";
import { isoTimeSchema, sha256HexSchema } from "./common.js";

export const EVIDENCE_EVENT_TYPES = [
  "stdin", "stdout", "stderr", "artifact", "metric", "test", "audit", "review", "llm_request", "llm_response",
  "output_validated", "gateway", "tool_action", "tool_result", "outcome", "agent_process_started", "agent_stdout",
  "agent_stderr", "agent_process_exited", "agent_handoff_sent", "agent_handoff_received", "agent_delegation_started",
  "agent_delegation_completed", "session/open", "session/close", "work/accepted", "turn/start", "turn/end", "turn/seal",
  "step/start", "step/end", "request/header", "request/tools", "request/response", "request/failure", "system/prompt",
  "user/message", "user/attachment", "assistant/block", "tool/call", "tool/result", "tool/spill-commitment",
  "approval/request", "approval/answer", "sandbox/mode", "session/recovery-claim", "session/resume", "session/release",
  "session/recovered", "loop/inbox", "loop/cancel", "loop/veto", "loop/retry", "loop/compact"
] as const satisfies readonly EvidenceEventType[];
// A new EvidenceEventType is a compile error here until it is published.
true satisfies ([EvidenceEventType] extends [(typeof EVIDENCE_EVENT_TYPES)[number]] ? true : false);

/**
 * One ledger row as `amc evidence export` writes it. `meta` is the row's free-form metadata: the one extension point,
 * written by the producer and never evidence of anything by itself. `chainIndex` is -1 and `chainExpectedPrevHash`
 * empty when the export ran without `--include-chain`.
 */
export const evidenceEventV1Schema = z.strictObject({
  eventId: z.string().min(1),
  ts: z.number().int().nonnegative(),
  isoTs: isoTimeSchema,
  sessionId: z.string(),
  runtime: z.string(),
  eventType: z.enum(EVIDENCE_EVENT_TYPES),
  actorId: z.string(),
  claimKind: claimKindSchema,
  payloadSha256: sha256HexSchema,
  prevEventHash: z.union([sha256HexSchema, z.literal("GENESIS")]),
  eventHash: sha256HexSchema,
  writerSignature: z.string(),
  chainIndex: z.number().int().min(-1),
  chainValid: z.boolean(),
  chainExpectedPrevHash: z.string(),
  incidentIds: z.array(z.string()),
  correctionIds: z.array(z.string()),
  correctionStatuses: z.array(z.string()),
  corrected: z.boolean(),
  correctedTs: z.number().int().nullable(),
  rationale: z.string().nullable(),
  rationaleChain: z.array(z.string()),
  meta: z.record(z.string(), z.unknown())
});
export type EvidenceEventV1 = z.infer<typeof evidenceEventV1Schema>;
