import type { DelegationRecorder } from "../agent/subagentSpawn.js";
import { realpathSync } from "node:fs";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";
import type { SessionService } from "../session/sessionService.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { readEventPayload } from "../session/eventPayload.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import type { WorkflowNode } from "./workflowPlan.js";

type WorkflowSession = DelegationRecorder & Pick<SessionService, "workspace" | "sessionId" | "readEvents" | "assertDispatchFence">;
type Status = "waiting" | "running" | "succeeded" | "failed" | "TOOL_OUTCOME_UNKNOWN";
export interface WorkflowNodeProgress {
  readonly status: Status;
  readonly inputDigest: string;
  readonly operationKey: string;
  readonly childSessionId: string;
  readonly output?: string;
  readonly reason?: string;
}

/** A projection of authenticated session events. No checkpoint files or independent writer. */
export function workflowProgress(init: {
  workspace: string; session: DelegationRecorder; runId: string; plan: WorkflowNode;
  parent: DelegationIdentity; controls: Record<string, unknown>;
}) {
  if (!("sessionId" in init.session) || typeof init.session.sessionId !== "string"
    || !("workspace" in init.session) || typeof init.session.workspace !== "string"
    || !("readEvents" in init.session) || typeof init.session.readEvents !== "function"
    || !("assertDispatchFence" in init.session) || typeof init.session.assertDispatchFence !== "function") {
    throw new Error("workflow requires the owning signed session writer");
  }
  const session = init.session as WorkflowSession;
  session.assertDispatchFence();
  const history = loadSessionEventHistory({ workspace: init.workspace, sessionId: session.sessionId, agentId: init.parent.governedAs });
  if (realpathSync(session.workspace) !== history.workspace) throw new Error("workflow history workspace differs from the owning session writer");
  if (session.readEvents().at(-1)?.event_hash !== history.headEventHash) throw new Error("workflow history does not match the owning writer head");
  session.assertDispatchFence();
  const planDigest = sha256Hex(canonicalize(init.plan));
  const opening = JSON.parse(history.events[0]!.meta_json) as Record<string, unknown>;
  const schemas = history.events.filter(row => row.event_type === "request/tools");
  const generationDigest = sha256Hex(canonicalize({
    compositionDigest: opening.compositionDigest, policyDigest: opening.policyDigest,
    harnessVersion: opening.harnessVersion, toolSchema: schemas.at(-1)?.payload_sha256 ?? null,
    controls: init.controls
  }));
  const contextDigest = sha256Hex(canonicalize({ workspace: history.workspace, sessionId: session.sessionId, runId: init.runId,
    parent: init.parent, planDigest, generationDigest }));
  const nodes = new Map<string, WorkflowNodeProgress>();
  const paths = new Map<string, readonly string[]>();
  const agentNames = new Map<string, string>();
  const visit = (node: WorkflowNode, ancestors: readonly string[]) => {
    const path = [...ancestors, node.id];
    if (node.kind === "agent") { paths.set(node.id, path); agentNames.set(node.id, node.runAs); }
    else for (const child of node.kind === "parallel" ? node.children : node.stages) visit(child, path);
  };
  visit(init.plan, []);
  const operationKey = (nodeId: string) => sha256Hex(canonicalize({ contextDigest, path: paths.get(nodeId), attempt: 1 }));
  let created = false;
  const attempts = new Map<string, { runId: string; status: unknown }>();
  const started = new Map<string, Record<string, unknown>>();
  const completed = new Map<string, Record<string, unknown>>();
  for (const row of history.events) {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    if (meta.kind === "workflow/progress" && typeof meta.runId === "string" && typeof meta.nodeId === "string") {
      attempts.set(canonicalize([meta.runId, meta.nodeId]), { runId: meta.runId, status: meta.status });
    }
    if (row.event_type === "agent_delegation_started" && typeof meta.packetId === "string"
      && [...nodes.values()].some(node => node.status === "running" && node.childSessionId === meta.childSessionId)) started.set(meta.packetId, meta);
    if (row.event_type === "agent_delegation_completed" && typeof meta.packetId === "string" && started.has(meta.packetId)) completed.set(meta.packetId, meta);
    if (meta.kind !== "workflow/progress" || meta.runId !== init.runId) continue;
    if (row.event_type !== "audit" || meta.version !== 1 || meta.contextDigest !== contextDigest
      || meta.planDigest !== planDigest || meta.generationDigest !== generationDigest) {
      throw new Error("workflow checkpoint plan, parent, policy or tool generation differs");
    }
    const payload = readEventPayload(init.workspace, row);
    if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256) {
      throw new Error("workflow checkpoint payload is unavailable or does not verify");
    }
    if (meta.status === "created") {
      if (created || payload.bytes.toString("utf8") !== canonicalize(init.plan)) throw new Error("invalid workflow creation checkpoint");
      created = true;
      continue;
    }
    const nodeId = meta.nodeId;
    if (!created || typeof nodeId !== "string" || !paths.has(nodeId) || meta.operationKey !== operationKey(nodeId)
      || meta.attempt !== 1 || typeof meta.inputDigest !== "string" || !/^[a-f0-9]{64}$/.test(meta.inputDigest)
      || typeof meta.nodeSessionId !== "string" || !meta.nodeSessionId) throw new Error("invalid workflow node checkpoint");
    const previous = nodes.get(nodeId);
    const status = meta.status;
    if ((status === "waiting" && previous !== undefined)
      || (status === "running" && previous?.status !== "waiting")
      || ((status === "succeeded" || status === "failed" || status === "TOOL_OUTCOME_UNKNOWN") && previous?.status !== "running")
      || !["waiting", "running", "succeeded", "failed", "TOOL_OUTCOME_UNKNOWN"].includes(String(status))
      || (previous !== undefined && (previous.inputDigest !== meta.inputDigest || previous.childSessionId !== meta.nodeSessionId))) {
      throw new Error("invalid workflow checkpoint transition");
    }
    let output: string | undefined;
    if (status === "succeeded") {
      if (meta.outputEncoding !== "canonical-json-string") throw new Error("unsupported workflow output encoding");
      const decoded = parseCanonicalJson(payload.bytes);
      if (typeof decoded !== "string") throw new Error("workflow result payload must encode a string");
      output = decoded;
    }
    if ((status === "waiting" || status === "running") && sha256Hex(payload.bytes) !== meta.inputDigest) throw new Error("workflow dependency payload digest differs");
    const start = typeof meta.packetId === "string" ? started.get(meta.packetId) : undefined;
    const settlement = typeof meta.packetId === "string" ? completed.get(meta.packetId) : undefined;
    if (status === "succeeded" && (meta.outputDigest !== sha256Hex(payload.bytes) || typeof meta.packetId !== "string"
      || start?.childSessionId !== meta.nodeSessionId || start.childRunAs !== agentNames.get(nodeId)
      || start.governedAs !== init.parent.governedAs || start.depth !== init.parent.depth + 1
      || settlement?.childSessionId !== meta.nodeSessionId || settlement.childRunAs !== agentNames.get(nodeId)
      || settlement.settledAs !== "reported")) throw new Error("workflow result has no matching committed delegation settlement");
    nodes.set(nodeId, { status: status as Status, inputDigest: meta.inputDigest, operationKey: meta.operationKey as string,
      childSessionId: meta.nodeSessionId, ...(status === "succeeded" ? { output } : {}),
      ...(typeof meta.reason === "string" ? { reason: meta.reason } : {}) });
  }
  const append = (meta: Record<string, unknown>, payload: string) => {
    session.assertDispatchFence();
    const ref = session.recordProjectedEvidence({ eventType: "audit", payload, meta: { kind: "workflow/progress", version: 1,
      runId: init.runId, contextDigest, planDigest, generationDigest, ...meta } });
    const committed = session.readEvents().at(-1);
    if (!ref || typeof ref !== "object" || !("eventHash" in ref) || !("eventId" in ref)
      || committed === undefined || committed.event_hash !== ref.eventHash || committed.id !== ref.eventId
      || committed.payload_sha256 !== sha256Hex(payload)) throw new Error("workflow checkpoint was not committed by the owning session writer");
  };
  if (!created) append({ status: "created" }, canonicalize(init.plan));
  return {
    sessionKey: canonicalize([history.workspace, session.sessionId]),
    unresolvedRuns: [...new Set([...attempts.values()].filter(attempt => attempt.status === "running"
      || attempt.status === "TOOL_OUTCOME_UNKNOWN").map(attempt => attempt.runId))],
    nodes,
    record(nodeId: string, progress: WorkflowNodeProgress, payload = "", packetId?: string) {
      // A queued session id reserves a name. Only spawnSubagent's childSessionId records claim actual child ownership.
      append({ nodeId, status: progress.status, inputDigest: progress.inputDigest,
        operationKey: operationKey(nodeId), path: paths.get(nodeId), attempt: 1,
        nodeSessionId: progress.childSessionId, replaySafe: false,
        ...(progress.reason === undefined ? {} : { reason: progress.reason }),
        ...(packetId === undefined ? {} : { packetId }),
        ...(progress.status === "succeeded" ? { outputDigest: sha256Hex(payload), outputEncoding: "canonical-json-string" } : {}) }, payload);
      nodes.set(nodeId, progress);
    },
    operationKey,
    assertDispatchFence: () => session.assertDispatchFence()
  };
}
