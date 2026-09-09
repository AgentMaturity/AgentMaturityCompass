import type { OpenApiOperation } from "./openapiTypes.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const integer = { type: "integer", minimum: 0 };
const bool = { type: "boolean" };
const strings = { type: "array", items: string };
const uuid = { type: "string", format: "uuid" };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const provider = { type: "string", enum: ["stub", "openai", "openai-responses", "anthropic"] };
const tools = { type: "string", enum: ["none", "workspace"] };
const agent = { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9_-]*$" };
const prompt = { type: "string", minLength: 1, maxLength: 16384,
  description: "Nonblank task text, at most 16 KiB UTF-8. Control characters other than tabs/newlines are rejected." };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: "object", additionalProperties: false, required, properties });
const envelope = (data: Record<string, unknown>) => object({ ok: { type: "boolean", const: true }, data });
const json = (description: string, schema: Record<string, unknown>) =>
  ({ description, content: { "application/json": { schema } } });
const body = (schema: string) => ({ required: true, content: { "application/json": { schema: ref(schema) } } });

const agentParameter = { name: "agentId", in: "query", required: false, schema: agent,
  description: "Selected agent; defaults to the workspace selection. A task remains pinned to its original owner and agent." };
const taskParameter = { name: "taskId", in: "path", required: true, schema: digest };
const mutationHeaders = [
  { name: "x-amc-native-intent", in: "header", required: true,
    schema: { type: "string", const: "task-workspace-v1" }, description: "Explicit native task/approval mutation intent." },
  { name: "x-amc-native-csrf", in: "header", required: false, schema: string,
    description: "Required with a human session cookie; obtain from options or /auth/me. Never use in a URL." },
  { name: "Origin", in: "header", required: false, schema: string,
    description: "Required for cookie mutations; must match a configured browser origin and the request Host. Admin-token clients may omit it." }
];

function operation(summary: string, responseSchema: string, write = false, requestSchema?: string,
  status = "200", parameters: Array<Record<string, unknown>> = []): OpenApiOperation {
  return {
    summary, tags: ["Studio", "Native Tasks"], security: [{ adminToken: [] }, { sessionCookie: [] }],
    parameters: [...parameters, ...(write ? mutationHeaders : [])],
    ...(requestSchema ? { requestBody: body(requestSchema) } : {}),
    responses: {
      [status]: json(status === "202" ? "Admission recorded; inspect the task for its actual outcome." : "Current owned task state; no-store.", ref(responseSchema)),
      "400": json("Invalid request, unknown fields or bounds exceeded.", ref("NativeTaskError")),
      "401": json("A verified human session or bootstrap admin token is required.", ref("NativeTaskError")),
      "403": json("Identity, role, origin, CSRF, demo or read-only policy refused the operation.", ref("NativeTaskError")),
      "404": json("Unknown task or task belongs to another owner/agent.", ref("NativeTaskError")),
      "409": json("Revision, request ID, signed scope or task state conflict. Refresh; do not automatically replay.", ref("NativeTaskError")),
      "413": json("Request body exceeds the server's JSON limit.", ref("NativeTaskError")),
      "429": json("Active task or retained task capacity reached.", ref("NativeTaskError")),
      "500": json("Task status is uncertain. Inspect recorded state before another submission.", ref("NativeTaskError")),
      "503": json("Native task service is unavailable.", ref("NativeTaskError"))
    }
  };
}

export function nativeTaskEndpoints(): Record<string, Record<string, OpenApiOperation>> {
  const prefix = "/api/v1/native-tasks";
  const paths: Record<string, Record<string, OpenApiOperation>> = {
    [`${prefix}/options`]: { get: operation("Inspect native task setup without executing a model or tool", "NativeTaskOptionsResponse", false, undefined, "200", [agentParameter]) },
    [prefix]: {
      get: operation("List native tasks owned by the caller and selected agent", "NativeTaskListResponse", false, undefined, "200", [agentParameter,
        { name: "includeArchived", in: "query", required: false, schema: { type: "boolean", default: false },
          description: "Set to true to inspect archived closed tasks as well. Only the literal true or false is accepted; archived history keeps its request identities and cannot resume." }]),
      post: operation("Admit a bounded native AMC task using an owner-scoped request ID", "NativeTaskResponse", true, "NativeTaskStart", "202")
    },
    [`${prefix}/{taskId}`]: { get: operation("Read committed native updates and actual task state", "NativeTaskPollResponse", false, undefined, "200", [
      taskParameter, agentParameter, { name: "cursor", in: "query", required: false, schema: { ...integer, maximum: 999999999999999 },
        description: "Exclusive event cursor. Retention may truncate earlier updates; this is not a complete evidence verification." }
    ]) },
    [`${prefix}/{taskId}/turn`]: { post: operation("Admit a follow-up with an explicit revision and unique request ID", "NativeTaskResponse", true, "NativeTaskTurn", "202", [taskParameter, agentParameter]) }
  };
  for (const [action, summary] of [
    ["cancel", "Request cancellation of this task revision; cancellation is not successful completion"],
    ["release", "Release the native writer while keeping an eligible session resumable"],
    ["resume", "Resume an owned signed session without replaying a pending prompt"],
    ["verify", "Close an active idle writer and verify native evidence; a sealed session cannot resume"],
    ["archive", "Archive an owned closed task after authenticating its sealed history; retain evidence and request identities"]
  ]) {
    paths[`${prefix}/{taskId}/${action}`] = { post: operation(summary!, "NativeTaskResponse", true, "NativeTaskControl",
      action === "cancel" ? "202" : "200", [taskParameter, agentParameter]) };
  }
  return paths;
}

export function nativeTaskSchemas(): Record<string, unknown> {
  return {
    NativeTaskError: { type: "object", required: ["error"], properties: {
      ok: { type: "boolean", const: false }, error: string, code: string
    } },
    NativeTaskStart: { ...object({ clientRequestId: uuid, agentId: agent, provider, model: { ...string, minLength: 1, maxLength: 200 },
      tools, toolsDigest: digest, validation: ref("NativeTaskValidationSelection"), prompt, maxSteps: { type: "integer", minimum: 1, maximum: 8 },
      maxTokens: { type: "integer", minimum: 1, maximum: 1024 }
    }, ["clientRequestId", "agentId", "provider", "tools", "prompt"]),
      description: "Workspace tools require toolsDigest from the inspected signed scope; no-tools requests must omit it. Real providers require an explicit model and a server-owned credential. Exact request replay returns the recorded admission; a conflicting reuse is refused." },
    NativeTaskTurn: object({ clientRequestId: uuid, expectedRevision: integer, prompt }),
    NativeTaskControl: object({ expectedRevision: { type: "integer", minimum: 1, maximum: 32 } }),
    NativeTask: object({ taskId: digest, sessionId: nullableString, agentId: agent, revision: integer,
      clientRequestId: uuid, lastClientRequestId: uuid, provider, model: nullableString, tools,
      toolsDigest: { ...digest, type: ["string", "null"] },
      validationSelection: { oneOf: [{ type: "null" }, ref("NativeTaskValidationSelection")] }, validation: ref("NativeTaskValidationResult"),
      validationOutputs: { type: "array", maxItems: 8, items: ref("NativeTaskValidationOutput") },
      maxSteps: integer, maxTokens: integer,
      state: { type: "string", enum: ["starting", "idle", "running", "cancel-requested", "releasing", "released", "failed", "verifying", "closed"] },
      createdAt: integer, updatedAt: integer, archived: bool, turnEndReason: nullableString, error: nullableString,
      verification: { type: "string", enum: ["not-verified", "workspace-key-consistency", "externally-anchored", "failed"],
        description: "Evidence integrity result, separate from task success. Other open ledger writers can prevent a complete verification." },
      approvals: { type: "array", items: ref("NativeTaskApproval") }, approvalError: nullableString,
      nextCursor: integer, firstCursor: integer, droppedEvents: integer, canResume: bool
    }),
    NativeTaskApproval: object({ approvalRequestId: string, requestDigestSha256: digest, toolName: string,
      actionClass: string, riskTier: string, status: string, required: integer, received: integer, expiresTs: integer }),
    NativeTaskValidationSelection: { ...object({ configSha256: digest, checkIds: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true,
      items: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" } } }),
      description: "Creation-only selection from the operator's public check catalogue. The digest and ordered IDs stay pinned across follow-up and resume; no commands, paths or grants are accepted." },
    NativeTaskValidationResult: object({ status: { type: "string", enum: ["not-requested", "pending", "passed", "failed", "unavailable"] },
      turn: { type: ["integer", "null"], minimum: 0 }, configSha256: { ...digest, type: ["string", "null"] },
      checks: { type: "array", maxItems: 8, items: object({ id: string, title: string,
        status: { type: "string", enum: ["pending", "passed", "failed", "unavailable"] }, callId: nullableString,
        exitCode: { type: ["integer", "null"] }, timedOut: bool, reason: nullableString, outputEventId: nullableString }) } }),
    NativeTaskValidationConfiguration: object({ ready: bool, configSha256: { ...digest, type: ["string", "null"] },
      checks: { type: "array", maxItems: 8, items: object({ id: string, title: string }) }, message: string }),
    NativeTaskValidationOutput: { ...object({ checkId: string, outputEventId: string, payloadSha256: digest,
      status: { type: "string", enum: ["available", "unavailable", "pruned"] }, text: nullableString,
      truncated: bool, redacted: bool, bytes: { type: ["integer", "null"], minimum: 0 } }),
      description: "Text from the exact authenticated check-result payload after its complete bytes match payloadSha256. The display is redacted and capped at 16 KiB; payloadSha256 describes the original bytes, not transformed display text. Reads over 2 MiB are withheld." },
    NativeTaskEvent: object({ cursor: integer, kind: { type: "string", enum: ["user", "assistant", "tool", "tool-update", "plan"] },
      text: string, toolCallId: string, status: string, evidence: { type: "string", const: "committed" }
    }, ["cursor", "kind", "text", "evidence"]),
    NativeTaskToolScope: object({ ready: bool, digest: { ...digest, type: ["string", "null"] }, approvalRequired: { type: "boolean", const: true },
      tools: { type: "array", items: object({ name: string, actionClass: string, paths: strings, deniedPaths: strings, hosts: strings, binaries: strings,
        nativeSandbox: { oneOf: [{ type: "null" }, object({ kind: { type: "string", const: "linux-bwrap" }, writableDirectories: strings })] }
      }) }, message: string }),
    NativeTaskOptions: object({ schemaVersion: { type: "string", const: "2026-09-08" }, agentId: agent, demo: bool,
      providers: { type: "array", items: object({ id: provider, local: bool, credential: { oneOf: [
        { type: "null" }, object({ ref: string, configured: bool, source: { type: ["string", "null"], enum: ["env", "file", null] } })
      ] } }) }, scope: ref("NativeTaskToolScope"), validation: ref("NativeTaskValidationConfiguration"),
      limits: object(Object.fromEntries(["maxActive", "maxSteps", "maxTokens", "turnTimeoutMs", "idleTimeoutMs", "lifetimeMs", "maxEvents", "maxEventBytes", "maxPromptBytes"].map(key => [key, integer]))),
      boundary: string, nativeCsrfToken: nullableString, executionBlocked: bool
    }),
    NativeTaskResponse: envelope(ref("NativeTask")),
    NativeTaskOptionsResponse: envelope(ref("NativeTaskOptions")),
    NativeTaskListResponse: envelope(object({ tasks: { type: "array", items: ref("NativeTask") } })),
    NativeTaskPollResponse: envelope(object({ task: ref("NativeTask"), events: { type: "array", items: ref("NativeTaskEvent") }, truncated: bool }))
  };
}
