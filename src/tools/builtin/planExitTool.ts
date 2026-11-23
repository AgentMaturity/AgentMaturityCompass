/**
 * HP-08: `plan_exit`, defined only in a plan-mode turn. The model hands its finished plan to the person: the plan text
 * is recorded in a signed NATIVE_PLAN_READY row (text in the payload, its digest in meta), and the next step boundary of
 * that turn is vetoed by `plan-exit` (src/agent/planMode.ts), so the turn ends there.
 *
 * It asks nobody and changes no mode. Plan mode is a flag the person sets on the run (`--plan`, or `/plan` in chat); no
 * tool reads or writes it, so a model in plan mode cannot switch itself to write mode. The person reviews the plan and
 * leaves plan mode themselves. Like the `plan` tool, it is offered only when the signed tools policy lists it.
 */
import { z } from "zod";
import type { EvidenceEvent } from "../../types.js";
import { extractEnvelope } from "../../session/sessionTypes.js";
import { sha256Hex } from "../../utils/hash.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";

export const PLAN_READY_AUDIT = "NATIVE_PLAN_READY";
/** The vetoing party a `loop/veto` row names when a turn ends after plan_exit. */
export const PLAN_EXIT_VETO = "plan-exit";
const MAX_PLAN_CHARS = 20_000;

const argsSchema = z.object({ plan: z.string().min(1).max(MAX_PLAN_CHARS) }).strict();

export type PlanReadyRecorder = (row: { readonly eventType: "audit"; readonly payload: string; readonly meta: Record<string, unknown> }) => unknown;

export function planExitTool(record: PlanReadyRecorder): ToolDefinition {
  return defineTool({
    name: "plan_exit",
    actionClass: "READ_ONLY",
    description: "Plan mode only: hand the finished plan to the person for review. The plan is recorded and this turn ends. "
      + "It does not leave plan mode: only the person can, after reading the plan.",
    parameters: {
      type: "object",
      properties: { plan: { type: "string", minLength: 1, maxLength: MAX_PLAN_CHARS, description: "the plan, as the person should read it" } },
      required: ["plan"],
      additionalProperties: false
    },
    body: (execution) => {
      const { plan } = argsSchema.parse(execution.arguments);
      record({ eventType: "audit", payload: JSON.stringify({ plan }),
        meta: { auditType: PLAN_READY_AUDIT, v: 1, callId: execution.callId, planSha256: sha256Hex(plan), chars: plan.length } });
      return { ok: true, output: "Plan recorded for the person's review. This turn ends now. Plan mode stays on until the person turns it off." };
    }
  });
}

/** Whether `turn` of these rows recorded a plan ready for review. */
export function planReadyInTurn(rows: readonly EvidenceEvent[], turn: number): boolean {
  return rows.some((row) => row.event_type === "audit" && extractEnvelope(row.meta_json)?.turn === turn
    && (JSON.parse(row.meta_json) as { auditType?: unknown }).auditType === PLAN_READY_AUDIT);
}
