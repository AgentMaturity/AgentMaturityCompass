import { realpathSync } from "node:fs";
import type { SessionService } from "../session/sessionService.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { readEventPayload } from "../session/eventPayload.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";

/**
 * Stage journal of a bounded improvement loop (GAP-WP08), kept the way durable workflow progress is (WP18): a projection
 * of the owning session's signed, hash-chained audit rows, with no checkpoint file or second writer. A stage key is the
 * digest of the loop context and the stage's own inputs, so a changed input names a different stage and every
 * descendant keyed on its output with it. Only a completed stage whose recorded payload verifies is reused; a stage
 * that started and never completed is unknown and is never replayed.
 */
type ImprovementStage = "setup" | "edit" | "probe" | "select";
/** Stages without effects outside AMC records, journalled by their completion only. */
const COMPLETION_ONLY = new Set<unknown>(["setup", "select"]);
type JournalSession = Pick<SessionService, "workspace" | "sessionId" | "readEvents" | "assertDispatchFence" | "recordProjectedEvidence">;
const KIND = "improvement/stage";

export interface ImprovementJournal {
  /** The verified output of a completed stage, or undefined. */
  completed(stageKey: string): unknown;
  /** A stage that started and has no completion: its effects are unknown and it must not run again. */
  unknown(stageKey: string): unknown;
  start(stage: ImprovementStage, stageKey: string, input: unknown): void;
  complete(stage: ImprovementStage, stageKey: string, output: unknown): void;
  stageKey(stage: ImprovementStage, input: unknown): string;
}

export function improvementJournal(init: { workspace: string; session: JournalSession; loopId: string; identity: unknown }): ImprovementJournal {
  const { session } = init;
  session.assertDispatchFence();
  const history = loadSessionEventHistory({ workspace: init.workspace, sessionId: session.sessionId });
  if (realpathSync(session.workspace) !== history.workspace) throw new Error("improvement journal workspace differs from the owning session writer");
  if (session.readEvents().at(-1)?.event_hash !== history.headEventHash) throw new Error("improvement journal does not match the owning writer head");
  const contextDigest = sha256Hex(canonicalize({ workspace: history.workspace, sessionId: session.sessionId, loopId: init.loopId, identity: init.identity }));
  const started = new Map<string, unknown>();
  const completed = new Map<string, unknown>();
  for (const row of history.events) {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    if (meta.kind !== KIND || meta.loopId !== init.loopId) continue;
    if (row.event_type !== "audit" || meta.version !== 1 || meta.contextDigest !== contextDigest) {
      throw new Error("improvement loop inputs differ from its recorded stages; start a new loop id");
    }
    const payload = readEventPayload(init.workspace, row);
    if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256 || typeof meta.stageKey !== "string") {
      throw new Error("improvement stage payload is unavailable or does not verify");
    }
    const key = meta.stageKey;
    const value = parseCanonicalJson(payload.bytes);
    if (meta.status === "started" && !started.has(key) && !completed.has(key) && !COMPLETION_ONLY.has(meta.stage)) started.set(key, value);
    else if (meta.status === "completed" && !completed.has(key) && (started.has(key) || COMPLETION_ONLY.has(meta.stage))) completed.set(key, value);
    else throw new Error("invalid improvement stage transition");
  }
  const append = (stage: ImprovementStage, stageKey: string, status: "started" | "completed", value: unknown) => {
    session.assertDispatchFence();
    const payload = canonicalize(value);
    const ref = session.recordProjectedEvidence({ eventType: "audit", payload,
      meta: { kind: KIND, version: 1, loopId: init.loopId, contextDigest, stage, stageKey, status, payloadDigest: sha256Hex(payload) } });
    const committed = session.readEvents().at(-1);
    if (committed === undefined || committed.event_hash !== ref.eventHash || committed.payload_sha256 !== sha256Hex(payload)) {
      throw new Error("improvement stage was not committed by the owning session writer");
    }
  };
  return {
    completed: (key) => completed.get(key),
    unknown: (key) => completed.has(key) ? undefined : started.get(key),
    start(stage, key, input) {
      if (started.has(key) || completed.has(key)) throw new Error(`improvement stage ${key} already started`);
      append(stage, key, "started", input);
      started.set(key, input);
    },
    complete(stage, key, output) {
      if (completed.has(key) || (!COMPLETION_ONLY.has(stage) && !started.has(key))) throw new Error(`improvement stage ${key} cannot complete`);
      append(stage, key, "completed", output);
      completed.set(key, output);
    },
    stageKey: (stage, input) => sha256Hex(canonicalize({ contextDigest, stage, input }))
  };
}
