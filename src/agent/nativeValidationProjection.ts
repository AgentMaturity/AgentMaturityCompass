import { z } from "zod";
import { validateAcpCommittedTail } from "../acp/acpCommittedUpdates.js";
import type { EvidenceEvent } from "../types.js";
import { validationAggregate, validationCheckPending, type NativeValidationResult, type NativeValidationCheckResult } from "./nativeValidation.js";
import { nativeValidationCheckIdentitySchema as identity, nativeValidationCheckResultSchema as result } from "./nativeValidationResult.js";

const header = z.object({ kind: z.literal("native-validation"), version: z.literal(1),
  phase: z.enum(["requested", "check-start", "check-result", "finished"]), turn: z.number().int().min(1), configSha256: z.string().regex(/^[a-f0-9]{64}$/) });

function metaOf(row: EvidenceEvent): Record<string, unknown> | null {
  try { const meta: unknown = JSON.parse(row.meta_json); return meta !== null && typeof meta === "object" && !Array.isArray(meta) ? meta as Record<string, unknown> : null; }
  catch { return null; }
}

/** Latest turn only. Authentication failure is never promoted into a check pass. */
export function projectNativeValidation(workspace: string, rows: readonly EvidenceEvent[]): NativeValidationResult {
  let turn: number | null = null;
  for (const row of rows) if (row.event_type === "turn/start") {
    const value = metaOf(row)?.turn;
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) turn = value;
  }
  const empty: NativeValidationResult = { status: "not-requested", turn, configSha256: null, checks: [] };
  const relevant = rows.filter(row => row.event_type === "audit" && metaOf(row)?.kind === "native-validation" && metaOf(row)?.turn === turn);
  if (!relevant.length) return empty;
  let configSha256: string | null = null;
  let checks: NativeValidationCheckResult[] = [];
  const unavailable = (): NativeValidationResult => ({ status: "unavailable", turn, configSha256,
    checks: checks.map(check => ({ ...check, status: "unavailable", reason: "validation-evidence-incomplete" })) });
  try {
    const sessionId = rows[0]?.session_id;
    if (!sessionId) return unavailable();
    validateAcpCommittedTail(workspace, sessionId, rows, 0, null);
    let requested = false, finished = false;
    for (const row of relevant) {
      const meta = metaOf(row)!;
      const parsed = header.parse(meta);
      if (finished || (configSha256 !== null && configSha256 !== parsed.configSha256)) return unavailable();
      configSha256 = parsed.configSha256;
      if (parsed.phase === "requested") {
        if (requested) return unavailable();
        const selected = z.array(identity).min(1).max(8).parse(meta.checks);
        if (new Set(selected.map(check => check.id)).size !== selected.length) return unavailable();
        checks = selected.map(validationCheckPending); requested = true;
        continue;
      }
      if (!requested) return unavailable();
      if (parsed.phase === "finished") {
        const reported = z.array(result).min(1).max(8).parse(meta.checks);
        if (reported.length !== checks.length) return unavailable();
        for (let index = 0; index < checks.length; index++) {
          const actual = checks[index]!, claimed = reported[index]!;
          if (actual.id !== claimed.id || actual.title !== claimed.title) return unavailable();
          if (actual.status === "pending") {
            // A closer may explain why selected work never produced a result; it cannot invent one.
            if (claimed.status !== "unavailable" || claimed.exitCode !== null || claimed.outputEventId !== null || claimed.reason === null
              || claimed.callId !== actual.callId || claimed.timedOut) return unavailable();
          } else if (JSON.stringify(actual) !== JSON.stringify(claimed)) return unavailable();
        }
        checks = reported;
        if (meta.status !== validationAggregate(checks)) return unavailable();
        finished = true;
        continue;
      }
      const index = checks.findIndex(check => check.id === meta.checkId);
      if (index < 0) return unavailable();
      const check = checks[index]!;
      if (check.status !== "pending" || typeof meta.callId !== "string" || !meta.callId) return unavailable();
      if (parsed.phase === "check-start") {
        if (check.callId !== null || meta.toolName !== "bash" || typeof meta.argumentsSha256 !== "string" || !/^[a-f0-9]{64}$/.test(meta.argumentsSha256)) return unavailable();
        checks[index] = { ...check, callId: meta.callId };
      } else {
        if (check.callId !== meta.callId) return unavailable();
        const next = result.parse({ id: check.id, title: check.title, status: meta.status, callId: meta.callId,
          exitCode: meta.exitCode, timedOut: meta.timedOut, reason: meta.reason, outputEventId: row.id });
        if (next.status === "pending" || (next.status === "passed" && (next.exitCode !== 0 || next.timedOut || next.reason !== null || meta.toolOutcome !== "OK"))
          || (next.status === "failed" && (next.exitCode === null || next.exitCode === 0 || next.timedOut || next.reason !== "nonzero-exit" || !["OK", "ERROR"].includes(String(meta.toolOutcome))))) return unavailable();
        checks[index] = next;
      }
    }
    if (!finished && rows.some(row => row.event_type === "turn/end" && metaOf(row)?.turn === turn)) return unavailable();
    return { status: finished ? validationAggregate(checks) : "pending", turn, configSha256, checks };
  } catch { return unavailable(); }
}
