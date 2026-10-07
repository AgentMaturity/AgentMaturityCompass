import { z } from "zod";
import type { ToolDefinition } from "../toolTypes.js";
import type { NativeReceiptRecorder } from "./nativeToolBreadth/nativeReceipt.js";
import { readSessionList, sessionListTool, type SessionListHeader, type SessionListStore } from "./nativeToolBreadth/sessionListTool.js";
import type { SessionIdSource } from "./nativeToolBreadth/signedSessionRecords.js";

/**
 * `plan` — the agent's declared plan as a signed, session-bound record
 * (AMC-1549). Same store and guarantees as `todo`; a separate record kind and
 * file so one can never be read as the other.
 *
 * A plan here is a statement of intent, not an approval: nothing in AMC treats
 * a recorded plan as permission to run any step of it.
 */

const STATUSES = ["pending", "in_progress", "done", "blocked"] as const;

const planArgs = z.object({
  summary: z.string().max(2_000).optional(),
  steps: z.array(z.object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(500),
    status: z.enum(STATUSES)
  }).strict()).max(100)
}).strict();

export type PlanPayload = z.infer<typeof planArgs>;
export type PlanRecord = SessionListHeader & PlanPayload;

const STORE: SessionListStore = { name: "plan", kind: "amc.native.plan", fileName: "plan.json", auditType: "NATIVE_PLAN" };

export function planTool(options: { readonly sessionId: SessionIdSource; readonly record: NativeReceiptRecorder }): ToolDefinition {
  return sessionListTool<PlanPayload>({
    ...STORE,
    description: "Replace this session's plan (summary and ordered steps). Signed and bound to the session.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string", enum: [...STATUSES] }
            },
            required: ["id", "title", "status"],
            additionalProperties: false
          }
        }
      },
      required: ["steps"],
      additionalProperties: false
    },
    argsSchema: planArgs,
    render: (payload) => [
      ...(payload.summary ? [payload.summary] : []),
      ...payload.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.title}`)
    ].join("\n") || "[amc: plan is empty]"
  }, options.sessionId, options.record);
}

/** The verified current plan record, or null. Throws when the file is not trustworthy or not the one the session ledger names. */
export function readSessionPlan(workspace: string, sessionId: string): PlanRecord | null {
  return readSessionList<PlanPayload>(workspace, sessionId, STORE);
}
