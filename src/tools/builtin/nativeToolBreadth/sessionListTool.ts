import { join } from "node:path";
import type { z } from "zod";
import { defineTool } from "../../toolRegistry.js";
import type { ToolDefinition } from "../../toolTypes.js";
import { assertSessionId, readSignedRecord, sessionRecordDir, writeSignedRecord } from "./signedSessionRecords.js";

/**
 * The shared shape of `todo` and `plan` (AMC-1549): a whole-list replace,
 * signed, bound to one session and one agent, chained by revision and the
 * previous record's digest.
 *
 * READ_ONLY on purpose. Neither tool changes the workspace or anything outside
 * AMC's own signed session records — the same reason a ledger row written for
 * a `grep` call does not make `grep` a write. The composed allowlist guard
 * still requires each name in the signed tools policy.
 */

export interface SessionListHeader {
  readonly schemaVersion: "2026-10-03";
  readonly kind: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly revision: number;
  readonly previousSha256: string | null;
  readonly callId: string;
  readonly updatedAt: number;
}

export interface SessionListSpec<P extends object> {
  readonly name: string;
  readonly kind: string;
  readonly fileName: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly argsSchema: z.ZodType<P>;
  readonly render: (payload: P) => string;
}

export function sessionListPath(workspace: string, sessionId: string, fileName: string): string {
  return join(sessionRecordDir(workspace, sessionId), fileName);
}

export function readSessionList<P extends object>(workspace: string, sessionId: string, fileName: string, kind: string): (SessionListHeader & P) | null {
  const stored = readSignedRecord<SessionListHeader & P>(workspace, sessionListPath(workspace, sessionId, fileName), "monitor");
  if (!stored) return null;
  if (stored.record.kind !== kind || stored.record.sessionId !== sessionId) {
    throw new Error(`native tool record is bound to ${stored.record.kind}/${stored.record.sessionId}, not ${kind}/${sessionId}`);
  }
  return stored.record;
}

export function sessionListTool<P extends object>(spec: SessionListSpec<P>, sessionId: string): ToolDefinition {
  assertSessionId(sessionId);
  return defineTool({
    name: spec.name,
    actionClass: "READ_ONLY",
    description: spec.description,
    parameters: spec.parameters,
    body: (execution) => {
      const payload = spec.argsSchema.parse(execution.arguments);
      const rendered = spec.render(payload);
      if (execution.effectiveMode === "SIMULATE") {
        return { output: `${rendered}\n[amc: SIMULATE ${spec.name}; not recorded]` };
      }
      const path = sessionListPath(execution.workspace, sessionId, spec.fileName);
      const previous = readSignedRecord<SessionListHeader>(execution.workspace, path, "monitor");
      if (previous && (previous.record.kind !== spec.kind || previous.record.sessionId !== sessionId
        || previous.record.agentId !== execution.agentId)) {
        throw new Error(`${spec.name} refused: the existing record is bound to ${previous.record.agentId}@${previous.record.sessionId}, not ${execution.agentId}@${sessionId}`);
      }
      const header: SessionListHeader = {
        schemaVersion: "2026-10-03",
        kind: spec.kind,
        sessionId,
        agentId: execution.agentId,
        revision: (previous?.record.revision ?? 0) + 1,
        previousSha256: previous?.digestSha256 ?? null,
        callId: execution.callId,
        updatedAt: Date.now()
      };
      const signed = writeSignedRecord(execution.workspace, path, { ...header, ...payload }, "monitor");
      return { output: `${rendered}\n[amc: ${spec.name} revision ${header.revision}, sha256 ${signed.digestSha256}]` };
    }
  });
}
