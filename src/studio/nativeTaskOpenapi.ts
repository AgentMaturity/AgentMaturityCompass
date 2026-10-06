import type { OpenApiOperation } from "./openapiTypes.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const integer = { type: "integer", minimum: 0 };
const bool = { type: "boolean" };
const strings = { type: "array", items: string };
const uuid = { type: "string", format: "uuid" };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const provider = { type: "string", enum: ["stub", "openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama"] };
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
      "400": json("Invalid request, unknown or repeated query fields, or bounds exceeded.", ref("NativeTaskError")),
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
      tools, toolsDigest: digest, validation: ref("NativeTaskValidationSelection"), prompt, input: ref("NativeTaskStructuredInput"), maxSteps: { type: "integer", minimum: 1, maximum: 8 },
      maxTokens: { type: "integer", minimum: 1, maximum: 1024 }
    }, ["clientRequestId", "agentId", "provider", "tools"]), oneOf: [{ required: ["prompt"], not: { required: ["input"] } }, { required: ["input"], not: { required: ["prompt"] } }],
      description: "Supply exactly one of prompt or ordered input. Workspace tools require the reviewed toolsDigest; no-tools requests must omit it. Real providers require an explicit model and an operator credential. Retry the identical request ID and body, including original attachment bytes, order and format; a conflicting reuse is refused. No input is automatically replayed." },
    NativeTaskTurn: { ...object({ clientRequestId: uuid, expectedRevision: { type: "integer", minimum: 1, maximum: 32 }, prompt,
      input: ref("NativeTaskStructuredInput") }, ["clientRequestId", "expectedRevision"]),
      oneOf: [{ required: ["prompt"], not: { required: ["input"] } }, { required: ["input"], not: { required: ["prompt"] } }] },
    NativeTaskStructuredInput: { ...object({ format: { type: "string", enum: ["amc-image-input@2", "amc-audio-input@1"] },
      parts: { type: "array", minItems: 1, maxItems: 256, items: { oneOf: [
        object({ type: { type: "string", const: "text" }, text: { type: "string", maxLength: 16384 } }),
        object({ type: { type: "string", const: "image" }, mimeType: { type: "string", enum: ["image/png", "image/jpeg", "image/gif", "image/webp"] }, data: { type: "string", minLength: 1, maxLength: 260096, contentEncoding: "base64" } }),
        object({ type: { type: "string", const: "audio" }, mimeType: { type: "string", const: "audio/wav" }, data: { type: "string", minLength: 1, maxLength: 260096, contentEncoding: "base64" } })
      ] } } }),
      description: "Exact ordered text/original canonical-base64 parts; empty and adjacent text are preserved. At most eight images and eight audio parts, aggregate text 16 KiB UTF-8, serialized parts 260096 bytes and complete ACP frame 262144 bytes. Image format requires an image and forbids audio; audio format requires audio and literal gemini-audio. Gemini refuses GIF. No URLs, filenames, paths, annotations, transcoding or client commitments. Native header checks and runtime negotiation still apply; no remote model support is claimed." },
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
      nextCursor: integer, firstCursor: integer, droppedEvents: integer, canResume: bool,
      resumeBlockedReason: nullableString, history: ref("NativeTaskHistory"),
      recovery: { oneOf: [{ type: "null" }, ref("NativeTaskRecovery")] }
    }),
    NativeTaskRecovery: { ...object({ eligible: bool, state: { type: "string", enum: ["ready", "interrupted", "blocked"] }, message: string }),
      description: "Read-only native JSONL recovery eligibility, not a writer grant. Resume rechecks original history, identity, settings, accounting and actual abandoned ownership under the writer mutex. An interrupted turn is acknowledged without replaying its effects; submit a new explicit turn. Closed or archived sessions remain non-resumable." },
    NativeTaskHistory: { ...object({ status: { type: "string", enum: ["not-started", "authenticated", "unavailable"] },
      backend: { type: ["string", "null"], enum: ["sqlite", "jsonl", null] },
      headEventHash: { ...digest, type: ["string", "null"] }, eventCount: integer, message: string }),
      description: "Actual selected-backend session metadata status; never a private payload access grant or JSONL writer-resume capability. When unavailable, withhold previous transcript/validation/verifier displays. eventCount zero then means unknown, not verified empty history." },
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
      text: string, toolCallId: string, status: string, evidence: { type: "string", const: "committed" },
      attachment: object({ type: { type: "string", enum: ["image", "audio"] }, mimeType: string, byteLength: integer, sha256: digest })
    }, ["cursor", "kind", "text", "evidence"]),
    NativeTaskInputCapabilities: { ...object({ formats: { type: "array", items: { type: "string", enum: ["text", "amc-image-input@2", "amc-audio-input@1"] } },
      imageMimeTypes: strings, audioMimeTypes: strings, maxParts: integer, maxImages: integer, maxAudios: integer,
      maxTextBytes: integer, maxSerializedPartsBytes: integer, maxPromptFrameBytes: integer, modelSupport: { type: "string", const: "not-probed" } }),
      description: "Native input bindings and local admission bounds, not live model qualification. Dispatch separately requires the running client's exact input contract." },
    NativeTaskToolScope: object({ ready: bool, digest: { ...digest, type: ["string", "null"] }, approvalRequired: { type: "boolean", const: true },
      tools: { type: "array", items: object({ name: string, actionClass: string, paths: strings, deniedPaths: strings, hosts: strings, binaries: strings,
        nativeSandbox: { oneOf: [{ type: "null" }, object({ kind: { type: "string", const: "linux-bwrap" }, writableDirectories: strings })] }
      }) }, message: string }),
    NativeTaskOptions: object({ schemaVersion: { type: "string", const: "2026-09-08" }, agentId: agent, demo: bool,
      providers: { type: "array", items: object({ id: provider, local: bool, model: { type: "string", enum: ["fixed", "required"] }, credential: { oneOf: [
        { type: "null" }, object({ ref: string, configured: bool, source: { type: ["string", "null"], enum: ["env", "file", null] } })
      ] }, input: ref("NativeTaskInputCapabilities") }, ["id", "local", "model", "credential"]) }, scope: ref("NativeTaskToolScope"), validation: ref("NativeTaskValidationConfiguration"),
      limits: object(Object.fromEntries(["maxActive", "maxSteps", "maxTokens", "turnTimeoutMs", "idleTimeoutMs", "lifetimeMs", "maxEvents", "maxEventBytes", "maxPromptBytes"].map(key => [key, integer]))),
      boundary: string, nativeCsrfToken: nullableString, executionBlocked: bool, shell: ref("NativeTaskShell")
    }),
    NativeTaskShell: { ...object({ offered: bool, decision: { type: "string", enum: ["confined", "unconfined-opt-in", "refused"] },
      enforcement: { type: "string", enum: ["enforced", "none"] }, boundary: { type: ["string", "null"], enum: ["linux-bwrap", null] },
      reason: nullableString, optInSource: { type: ["string", "null"], enum: ["cli-flag", "sdk-option", null] } }),
      description: "Whether native tasks are offered bash. Show reason as a banner: the refusal, or the warning for an UNCONFINED macOS shell enabled by the operator's environment when Studio started." },
    NativeTaskResponse: envelope(ref("NativeTask")),
    NativeTaskOptionsResponse: envelope(ref("NativeTaskOptions")),
    NativeTaskListResponse: envelope(object({ tasks: { type: "array", items: ref("NativeTask") } })),
    NativeTaskPollResponse: envelope(object({ task: ref("NativeTask"), events: { type: "array", items: ref("NativeTaskEvent") }, truncated: bool }))
  };
}
