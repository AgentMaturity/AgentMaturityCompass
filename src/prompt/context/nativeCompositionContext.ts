import type { NativeContextSession } from "../../agent/loopTypes.js";
import type { AgentToolSeam } from "../../agent/toolSeam.js";
import type { LoopRoute } from "../../agent/stepRunner.js";
import { readEventPayload } from "../../session/eventPayload.js";
import { sha256Hex } from "../../utils/hash.js";
import type { PromptAssembly } from "../assembly/promptTypes.js";
import { interpolatePromptText, isContextSnapshot } from "../assembly/interpolate.js";
import { compositionSource, createCompositionProvenance, type CompositionSource } from "./compositionProvenance.js";
import type { TouchedInstructionPath } from "./contextTypes.js";
import { MAX_INSTRUCTION_TOUCH_PATHS } from "./touchedInstructions.js";
import type { SessionEventRef } from "../../session/sessionApiTypes.js";
import type { EvidenceEvent } from "../../types.js";
import { canonicalize } from "../../utils/json.js";
import { normalizeInstructionTouchPath, type NativeFilesystemTouch } from "./nativeFilesystemTouch.js";
import { posix } from "node:path";

/** Recover the latest delivered snapshot, including sessions created before source attribution existed. */
export function lastRecordedContextSnapshot(session: NativeContextSession): string | undefined {
  for (const row of [...session.readEvents()].reverse()) {
    if (row.session_id !== session.sessionId || row.event_type !== "user/message") continue;
    const payload = readEventPayload(session.workspace, row);
    if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256) continue;
    const text = payload.bytes.toString("utf8");
    // Uses the same snapshot recognition as native replay; this grants no additional message authority.
    if (isContextSnapshot(text)) return text;
  }
  return undefined;
}

/** Source commitments describe composition-time inputs; request/tools remains the exact per-request tool commitment. */
export function recordNativeComposition(session: NativeContextSession, assembly: PromptAssembly | string, tools: AgentToolSeam, route: LoopRoute, extraSources: readonly CompositionSource[] = []): void {
  const sources: CompositionSource[] = typeof assembly === "string"
    ? [compositionSource("prompt", "inherited-system-prompt", assembly)]
    : assembly.sections.map(section => compositionSource("prompt", section.name, interpolatePromptText(section, assembly.variables, "section")));
  try {
    const schemas = tools.schemas();
    sources.push(...(schemas?.map(schema => compositionSource("tool", schema.name, schema)) ?? []),
      compositionSource("tool", "offered-tools", schemas));
  } catch {
    // Observing the pre-step catalog must not replace admission. The request seam still refuses unavailable tools.
    sources.push(compositionSource("tool", "offered-tools:not-evaluated", { status: "not-evaluated" }));
  }
  sources.push(compositionSource("route", "native-route", route));
  const rows = session.readEvents();
  const declared: Record<string, unknown> = {};
  for (const row of [...rows].reverse()) {
    if (row.event_type !== "session/open" && row.event_type !== "session/resume") continue;
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    for (const key of ["compositionDigest", "policyDigest"]) {
      if (!Object.hasOwn(declared, key) && typeof meta[key] === "string") declared[key] = meta[key];
    }
    if (Object.keys(declared).length === 2) break;
  }
  sources.push(compositionSource("policy", "declared-policy", declared.policyDigest ?? null),
    compositionSource("policy", "declared-composition", declared.compositionDigest ?? null));
  recordCompositionSources(session, "compose", [...sources, ...extraSources]);
}

export function recordCompositionSources(session: NativeContextSession, phase: "compose" | "context", sources: readonly CompositionSource[], boundary?: { readonly turn: number; readonly step: number }): void {
  const provenance = createCompositionProvenance(sources);
  session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    auditType: "NATIVE_COMPOSITION_PROVENANCE", kind: "native-composition-provenance", phase, ...provenance,
    ...(phase === "context" ? { sourceStage: "pre-redaction" } : {}),
    ...(boundary === undefined ? {} : { turn: boundary.turn, step: boundary.step })
  } });
}

/** Delivered bytes may be tokenized before commit. Bind their signed content row separately from raw source inputs. */
export function recordDeliveredContext(session: NativeContextSession, ref: SessionEventRef, boundary: { readonly turn: number; readonly step: number }): void {
  const provenance = createCompositionProvenance([{ kind: "context", id: "delivered-runtime-context", digest: ref.payloadSha256 }]);
  session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    auditType: "NATIVE_COMPOSITION_PROVENANCE", kind: "native-composition-provenance", phase: "context-delivery", ...provenance,
    contextEventId: ref.eventId, payloadSha256: ref.payloadSha256, digestEncoding: "payload-bytes-sha256",
    turn: boundary.turn, step: boundary.step
  } });
}

/** Match a bounded pipeline observation to its exact signed payload before using it as a context source. */
function observedFilesystemTouch(session: NativeContextSession, row: EvidenceEvent, meta: Record<string, unknown>): NativeFilesystemTouch | null {
  const value = meta.nativeFilesystemTouch;
  if (row.session_id !== session.sessionId || meta.auditType !== "TOOL_CALL_ALLOWED" || meta.effectiveMode !== "EXECUTE"
    || value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const touch = value as Record<string, unknown>;
  if (touch.version !== 1 || typeof touch.path !== "string" || touch.path.length === 0 || Buffer.byteLength(touch.path, "utf8") > 4096
    || touch.directory !== true || typeof touch.toolToken !== "string" || touch.toolToken.length === 0
    || touch.toolToken !== meta.toolToken || touch.parentToken !== meta.parentToken
    || !(touch.parentToken === null || typeof touch.parentToken === "string")
    || !["fs.read", "fs.write", "fs.edit", "glob", "grep"].includes(String(meta.toolName))) return null;
  const payload = readEventPayload(session.workspace, row);
  if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256) return null;
  let body: Record<string, unknown>;
  try { body = JSON.parse(payload.bytes.toString("utf8")) as Record<string, unknown>; } catch { return null; }
  if (body === null || typeof body !== "object" || body.auditType !== "TOOL_CALL_ALLOWED" || body.tool !== meta.toolName || body.denied !== null || body.outcome !== "ok"
    || canonicalize(body.nativeFilesystemTouch) !== canonicalize(value)) return null;
  return touch as unknown as NativeFilesystemTouch;
}

function retainTouch(paths: Map<string, TouchedInstructionPath>, touch: TouchedInstructionPath): void {
  // Keep one overflow entry so the loader explicitly reports incomplete discovery.
  if (paths.has(touch.path) || paths.size <= MAX_INSTRUCTION_TOUCH_PATHS) paths.set(touch.path, touch);
}

/** Incremental, session-isolated path discovery from completed native filesystem calls, including earlier turns. */
export function createSessionTouchedPaths(): (session: NativeContextSession) => readonly TouchedInstructionPath[] {
  const sessions = new Map<string, { cursor: number; paths: Map<string, TouchedInstructionPath>; pending: Map<string, TouchedInstructionPath>; observed: Set<string> }>();
  return session => {
    let state = sessions.get(session.sessionId);
    if (state === undefined) {
      state = { cursor: 0, paths: new Map(), pending: new Map(), observed: new Set() };
      sessions.set(session.sessionId, state);
    }
    const rows = session.readEvents();
    const next = rows.slice(state.cursor);
    const counts = new Map<string, number>();
    const callKey = (meta: Record<string, unknown>): string => `${String(meta.turn)}:${String(meta.step)}:${String(meta.toolCallId)}`;
    // An ID is ambiguous even when the other call was not a filesystem tool. Never pair a result by that ID.
    for (const row of next) {
      if (row.event_type !== "tool/call") continue;
      const key = callKey(JSON.parse(row.meta_json) as Record<string, unknown>);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const row of next) {
      if (row.event_type !== "tool/call" && row.event_type !== "tool/result" && row.event_type !== "audit") continue;
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      if (row.event_type === "audit") {
        const touch = observedFilesystemTouch(session, row, meta);
        if (touch !== null && !state.observed.has(touch.toolToken)) {
          retainTouch(state.paths, { path: touch.path, directory: touch.directory, eventId: row.id });
          if (state.observed.size <= MAX_INSTRUCTION_TOUCH_PATHS) state.observed.add(touch.toolToken);
        }
        continue;
      }
      const key = callKey(meta);
      if ((counts.get(key) ?? 1) !== 1) { state.pending.delete(key); continue; }
      if (row.event_type === "tool/result") {
        const touch = state.pending.get(key);
        state.pending.delete(key);
        if (touch !== undefined && meta.denied !== true && meta.outcome !== "DENIED" && meta.outcome !== "CANCELLED") {
          const normalized = touch.path.length <= 4096 ? normalizeInstructionTouchPath(session.workspace, touch.path) : undefined;
          retainTouch(state.paths, normalized === undefined ? touch : { ...touch,
            path: touch.directory === true ? normalized : posix.dirname(normalized), directory: true });
        }
        continue;
      }
      const name = meta.toolName;
      if (!["fs.read", "fs.write", "fs.edit", "glob", "grep"].includes(String(name))) continue;
      const payload = readEventPayload(session.workspace, row);
      if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256) continue;
      let args: Record<string, unknown>;
      try { args = JSON.parse(payload.bytes.toString("utf8")) as Record<string, unknown>; } catch { continue; }
      if (args === null || typeof args !== "object" || Array.isArray(args)) continue;
      const directory = name === "glob" || name === "grep";
      const path = args.path ?? (directory ? "." : undefined);
      if (typeof path === "string") {
        state.pending.set(key, { path, eventId: row.id, ...(directory ? { directory: true } : {}) });
      }
    }
    state.cursor = rows.length;
    return [...state.paths.values()];
  };
}
