import { randomUUID } from "node:crypto";
import { resolveAgentId } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { webhookPlatformSchema, type WebhookPlatform } from "./noCodeGovernanceSchema.js";

export interface NoCodeAgentAction {
  actionId: string;
  name: string;
  type: string;
  status: string;
  durationMs: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
}

export interface ParsedNoCodeExecutionEvent {
  platform: WebhookPlatform;
  workflowId: string;
  workflowName: string;
  executionId: string;
  status: string;
  startedTs: number;
  completedTs: number | null;
  agentId: string | null;
  actions: NoCodeAgentAction[];
}

export interface NoCodeWebhookIngestResult {
  platform: WebhookPlatform;
  workflowId: string;
  workflowName: string;
  executionId: string;
  status: string;
  agentId: string;
  sessionId: string;
  actionCount: number;
  executionEventId: string;
  actionEventIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      const asDate = Date.parse(value);
      if (Number.isFinite(asDate)) {
        return asDate;
      }
    }
  }
  return null;
}

function timestampFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const dateMs = Date.parse(value);
    if (Number.isFinite(dateMs)) {
      return dateMs;
    }
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function nestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return asRecord(source[key]);
}

function summarizeValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return trimmed.length <= 240 ? trimmed : `${trimmed.slice(0, 237)}...`;
  }
  try {
    const encoded = JSON.stringify(value);
    if (!encoded) {
      return null;
    }
    return encoded.length <= 240 ? encoded : `${encoded.slice(0, 237)}...`;
  } catch {
    return "<unserializable>";
  }
}

function normalizeAction(value: unknown, fallbackName: string, index: number): NoCodeAgentAction {
  const row = asRecord(value);
  if (!row) {
    return {
      actionId: `${fallbackName}-${index + 1}`,
      name: fallbackName,
      type: "unknown",
      status: "unknown",
      durationMs: null,
      inputSummary: summarizeValue(value),
      outputSummary: null
    };
  }

  const nestedData = nestedRecord(row, "data");
  const actionId = firstString(row, ["actionId", "id", "stepId", "moduleId", "nodeId"]) ?? `${fallbackName}-${index + 1}`;
  const actionName =
    firstString(row, ["name", "node", "module", "step", "event", "action"]) ??
    firstString(nestedData ?? {}, ["node", "module", "event"]) ??
    fallbackName;
  const actionType =
    firstString(row, ["type", "moduleType", "nodeType", "app", "service"]) ??
    firstString(nestedData ?? {}, ["type"]) ??
    "unknown";
  const status =
    firstString(row, ["status", "executionStatus", "state", "result"]) ??
    (row.error ? "failed" : "unknown");

  return {
    actionId,
    name: actionName,
    type: actionType,
    status,
    durationMs: firstNumber(row, ["durationMs", "executionTime", "latencyMs", "duration"]),
    inputSummary: summarizeValue(row.input ?? row.request ?? row.params ?? nestedData?.input),
    outputSummary: summarizeValue(row.output ?? row.response ?? row.resultData ?? nestedData?.output)
  };
}

function normalizeExecutionStatus(source: Record<string, unknown>): string {
  const direct = firstString(source, ["status", "state", "executionStatus", "result"]);
  if (direct) {
    return direct;
  }
  if (source.success === true) {
    return "success";
  }
  if (source.success === false) {
    return "failed";
  }
  return "unknown";
}

function normalizeActionList(platform: WebhookPlatform, payload: Record<string, unknown>): NoCodeAgentAction[] {
  if (platform === "n8n") {
    return extractN8nActions(payload);
  }
  if (platform === "make") {
    return extractMakeActions(payload);
  }
  if (platform === "zapier") {
    return extractZapierActions(payload);
  }
  return extractGenericActions(payload);
}

function extractN8nActions(payload: Record<string, unknown>): NoCodeAgentAction[] {
  const out: NoCodeAgentAction[] = [];
  const data = nestedRecord(payload, "data");
  const resultData = data ? nestedRecord(data, "resultData") : null;
  const runData = resultData ? asRecord(resultData.runData) : null;

  if (runData) {
    for (const [nodeName, runsUnknown] of Object.entries(runData)) {
      const runs = asArray(runsUnknown);
      runs.forEach((run, index) => {
        const row = asRecord(run);
        const payloadData = row ? nestedRecord(row, "data") : null;
        const action = normalizeAction(
          {
            ...(row ?? {}),
            node: nodeName,
            status: row ? firstString(row, ["executionStatus", "status"]) ?? (row.error ? "failed" : "success") : "unknown",
            input: payloadData?.main ?? payloadData?.input,
            output: payloadData?.output ?? payloadData?.resultData ?? payloadData?.main
          },
          nodeName,
          index
        );
        out.push(action);
      });
    }
  }

  if (out.length > 0) {
    return out;
  }

  const fallbackArrays: unknown[][] = [
    asArray(payload.nodes),
    asArray(payload.steps),
    asArray(payload.actions)
  ];
  for (const source of fallbackArrays) {
    source.forEach((entry, index) => {
      out.push(normalizeAction(entry, "n8n-node", index));
    });
    if (out.length > 0) {
      break;
    }
  }
  return out;
}

function extractMakeActions(payload: Record<string, unknown>): NoCodeAgentAction[] {
  const out: NoCodeAgentAction[] = [];
  const execution = nestedRecord(payload, "execution");
  const candidates = [
    asArray(payload.operations),
    asArray(payload.modules),
    asArray(payload.steps),
    asArray(execution?.operations)
  ];

  for (const source of candidates) {
    source.forEach((entry, index) => {
      out.push(normalizeAction(entry, "make-module", index));
    });
    if (out.length > 0) {
      break;
    }
  }

  return out;
}

function extractZapierActions(payload: Record<string, unknown>): NoCodeAgentAction[] {
  const out: NoCodeAgentAction[] = [];
  const zap = nestedRecord(payload, "zap");
  const run = nestedRecord(payload, "run");
  const candidates = [
    asArray(payload.steps),
    asArray(payload.tasks),
    asArray(payload.actions),
    asArray(zap?.steps),
    asArray(run?.steps)
  ];

  for (const source of candidates) {
    source.forEach((entry, index) => {
      out.push(normalizeAction(entry, "zap-step", index));
    });
    if (out.length > 0) {
      break;
    }
  }

  return out;
}

function extractGenericActions(payload: Record<string, unknown>): NoCodeAgentAction[] {
  const out: NoCodeAgentAction[] = [];
  const candidates = [
    asArray(payload.actions),
    asArray(payload.steps),
    asArray(payload.operations),
    asArray(payload.modules),
    asArray(payload.nodes)
  ];

  for (const source of candidates) {
    source.forEach((entry, index) => {
      out.push(normalizeAction(entry, "workflow-action", index));
    });
    if (out.length > 0) {
      break;
    }
  }
  return out;
}

function extractWorkflowInfo(platform: WebhookPlatform, payload: Record<string, unknown>): {
  workflowId: string;
  workflowName: string;
  executionId: string;
  status: string;
  startedTs: number;
  completedTs: number | null;
  agentId: string | null;
} {
  const workflow = nestedRecord(payload, "workflow");
  const scenario = nestedRecord(payload, "scenario");
  const zap = nestedRecord(payload, "zap");
  const execution = nestedRecord(payload, "execution");
  const run = nestedRecord(payload, "run");
  const metadata = nestedRecord(payload, "metadata");

  const workflowId =
    firstString(payload, ["workflowId", "scenarioId", "zapId", "zap_id", "workflow_id"]) ??
    firstString(workflow ?? {}, ["id"]) ??
    firstString(scenario ?? {}, ["id"]) ??
    firstString(zap ?? {}, ["id", "zap_id"]) ??
    `${platform}-workflow`;

  const workflowName =
    firstString(payload, ["workflowName", "scenarioName", "zapName", "zapTitle", "zap_title", "name"]) ??
    firstString(workflow ?? {}, ["name"]) ??
    firstString(scenario ?? {}, ["name"]) ??
    firstString(zap ?? {}, ["name", "title"]) ??
    `${platform} workflow`;

  const executionId =
    firstString(payload, ["executionId", "runId", "run_id", "execution_id", "id"]) ??
    firstString(execution ?? {}, ["id", "executionId"]) ??
    firstString(run ?? {}, ["id", "runId", "run_id"]) ??
    `${platform}-execution-${Date.now()}`;

  const topStatus =
    normalizeExecutionStatus(payload) !== "unknown"
      ? normalizeExecutionStatus(payload)
      : normalizeExecutionStatus(execution ?? {});

  const startedTs =
    timestampFromUnknown(payload.startedAt) ??
    timestampFromUnknown(payload.startTime) ??
    timestampFromUnknown(execution?.startedAt) ??
    timestampFromUnknown(run?.startedAt) ??
    Date.now();

  const completedTs =
    timestampFromUnknown(payload.completedAt) ??
    timestampFromUnknown(payload.stoppedAt) ??
    timestampFromUnknown(execution?.endedAt) ??
    timestampFromUnknown(execution?.stoppedAt) ??
    timestampFromUnknown(run?.endedAt);

  const agentId =
    firstString(payload, ["agentId", "amcAgentId", "agent_id"]) ??
    firstString(metadata ?? {}, ["agentId", "amcAgentId", "agent_id"]) ??
    firstString(workflow ?? {}, ["agentId"]) ??
    null;

  return {
    workflowId,
    workflowName,
    executionId,
    status: topStatus,
    startedTs,
    completedTs,
    agentId
  };
}

export function parseNoCodeExecutionEvent(params: {
  platform: WebhookPlatform;
  payload: unknown;
}): ParsedNoCodeExecutionEvent {
  const platform = webhookPlatformSchema.parse(params.platform);
  const payload = asRecord(params.payload);
  if (!payload) {
    throw new Error("no-code webhook payload must be a JSON object");
  }

  const info = extractWorkflowInfo(platform, payload);
  const actions = normalizeActionList(platform, payload);

  return {
    platform,
    workflowId: info.workflowId,
    workflowName: info.workflowName,
    executionId: info.executionId,
    status: info.status,
    startedTs: info.startedTs,
    completedTs: info.completedTs,
    agentId: info.agentId,
    actions
  };
}

export function ingestNoCodeWebhookEvent(params: {
  workspace: string;
  platform: WebhookPlatform;
  payload: unknown;
  fallbackAgentId?: string;
  sourceWebhookUrl?: string;
}): NoCodeWebhookIngestResult {
  const parsed = parseNoCodeExecutionEvent({
    platform: params.platform,
    payload: params.payload
  });
  const agentId = resolveAgentId(params.workspace, parsed.agentId ?? params.fallbackAgentId);

  const ledger = openLedger(params.workspace);
  const now = Date.now();
  const sessionId = `no-code-${parsed.platform}-${now}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const runtimeName = `amc-${parsed.platform}-webhook-adapter`;

  let started = false;
  let sealed = false;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: runtimeName,
      binarySha256: sha256Hex(Buffer.from(runtimeName, "utf8"))
    });
    started = true;

    const executionPayload = canonicalize({
      platform: parsed.platform,
      workflowId: parsed.workflowId,
      workflowName: parsed.workflowName,
      executionId: parsed.executionId,
      status: parsed.status,
      startedTs: parsed.startedTs,
      completedTs: parsed.completedTs,
      sourceWebhookUrl: params.sourceWebhookUrl ?? null,
      actionCount: parsed.actions.length,
      observedTs: now
    });
    const executionSha = sha256Hex(Buffer.from(executionPayload, "utf8"));
    const executionWritten = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: executionPayload,
      payloadExt: "json",
      inline: true,
      meta: {
        trustTier: "OBSERVED",
        auditType: "NO_CODE_EXECUTION_INGESTED",
        agentId,
        platform: parsed.platform,
        workflowId: parsed.workflowId,
        workflowName: parsed.workflowName,
        executionId: parsed.executionId,
        executionStatus: parsed.status,
        actionCount: parsed.actions.length,
        sourceWebhookUrl: params.sourceWebhookUrl ?? null
      },
      receipt: {
        kind: "guard_check",
        agentId,
        providerId: parsed.platform,
        model: null,
        bodySha256: executionSha
      }
    });

    const actionEventIds: string[] = [];
    parsed.actions.forEach((action, index) => {
      const actionPayload = canonicalize({
        platform: parsed.platform,
        workflowId: parsed.workflowId,
        executionId: parsed.executionId,
        action
      });
      const actionSha = sha256Hex(Buffer.from(actionPayload, "utf8"));
      const written = ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "tool_action",
        payload: actionPayload,
        payloadExt: "json",
        inline: true,
        meta: {
          trustTier: "OBSERVED",
          auditType: "NO_CODE_ACTION_CAPTURED",
          agentId,
          platform: parsed.platform,
          workflowId: parsed.workflowId,
          executionId: parsed.executionId,
          actionId: action.actionId,
          actionName: action.name,
          actionType: action.type,
          actionStatus: action.status,
          actionIndex: index
        },
        receipt: {
          kind: "guard_check",
          agentId,
          providerId: parsed.platform,
          model: null,
          bodySha256: actionSha
        }
      });
      actionEventIds.push(written.id);
    });

    ledger.sealSession(sessionId);
    sealed = true;

    return {
      platform: parsed.platform,
      workflowId: parsed.workflowId,
      workflowName: parsed.workflowName,
      executionId: parsed.executionId,
      status: parsed.status,
      agentId,
      sessionId,
      actionCount: parsed.actions.length,
      executionEventId: executionWritten.id,
      actionEventIds
    };
  } finally {
    if (started && !sealed) {
      try {
        ledger.sealSession(sessionId);
      } catch {
        // no-op
      }
    }
    ledger.close();
  }
}
