/**
 * ATIF trajectories (Harbor RFC 0001, "Active", April 2026, changelog v1.8:
 * raw.githubusercontent.com/harbor-framework/harbor/main/rfcs/0001-trajectory-format.md, read 2026-11-17).
 *
 * Root: `schema_version` ("ATIF-v1.x"), `session_id`, `agent` {name, version, model_name}, `steps`. Step: `step_id`,
 * `timestamp`, `source` (system | user | agent), `message`, `model_name`, `tool_calls` [{tool_call_id, function_name,
 * arguments}], `observation` {results: [{source_call_id, content}]}, `metrics` {prompt_tokens, completion_tokens,
 * cached_tokens}. The RFC defines no error field, so tool outcomes stay unknown. Embedded `subagent_trajectories` and
 * `continued_trajectory_ref` are counted, never followed.
 */
import { digestOf, isRecord, newSessionFormat, nonNegativeInt, plainName, SESSION_LIMITS, storedText, type SessionImportContext,
  type SessionImportFormat, type SessionStep } from "./sessionImportCommon.js";

const SCHEMA_VERSION = /^ATIF-v\d{1,3}\.\d{1,3}$/;

export function looksLikeAtif(document: unknown): document is Record<string, unknown> {
  return isRecord(document) && typeof document.schema_version === "string" && document.schema_version.startsWith("ATIF-v") && Array.isArray(document.steps);
}

export function parseAtifTrajectory(document: Record<string, unknown>, ctx: SessionImportContext): { format: SessionImportFormat; steps: SessionStep[] } {
  const rawSteps = document.steps as unknown[];
  const version = typeof document.schema_version === "string" && SCHEMA_VERSION.test(document.schema_version) ? document.schema_version : null;
  const format = newSessionFormat("atif-trajectory", version, false, ctx, {
    lines: rawSteps.length, malformed: 0, overLong: 0, overCap: Math.max(0, rawSteps.length - SESSION_LIMITS.maxRecords) });
  const agentModel = isRecord(document.agent) ? plainName(document.agent.model_name) : null;
  const sessionLabel = `session-${digestOf(document.session_id ?? ctx.sourceSha256).slice(0, 12)}`;
  const steps: SessionStep[] = [];
  for (const step of rawSteps.slice(0, SESSION_LIMITS.maxRecords)) {
    if (!isRecord(step) || typeof step.source !== "string") { format.records.malformed += 1; continue; }
    if (step.source !== "agent") { format.records.skipped += 1; continue; }
    format.records.mapped += 1;
    const metrics = isRecord(step.metrics) ? step.metrics : null;
    const stepId = nonNegativeInt(step.step_id);
    steps.push({ step: steps.length + 1, kind: "model-reply", time: step.timestamp, sessionLabel, model: plainName(step.model_name) ?? agentModel,
      output: storedText(step.message, ctx), outcome: "completed",
      tokens: metrics ? { input: nonNegativeInt(metrics.prompt_tokens), output: nonNegativeInt(metrics.completion_tokens), cached: nonNegativeInt(metrics.cached_tokens) } : null,
      sourceStep: stepId });
    const results = isRecord(step.observation) && Array.isArray(step.observation.results) ? step.observation.results.filter(isRecord) : [];
    for (const call of Array.isArray(step.tool_calls) ? step.tool_calls.filter(isRecord) : []) {
      const tool = plainName(call.function_name);
      const result = results.find((item) => item.source_call_id === call.tool_call_id);
      steps.push({ step: steps.length + 1, kind: "tool-call", time: step.timestamp, sessionLabel, tool, input: storedText(call.arguments, ctx),
        output: result ? storedText(result.content, ctx) : null, outcome: "unknown", callDigest: digestOf({ tool, input: call.arguments ?? null }), sourceStep: stepId });
    }
  }
  return { format, steps };
}

export function atifUnfollowed(document: Record<string, unknown>): number {
  return (Array.isArray(document.subagent_trajectories) ? document.subagent_trajectories.length : 0) + (document.continued_trajectory_ref ? 1 : 0);
}
