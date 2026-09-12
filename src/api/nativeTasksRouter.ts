import { assertNativeTaskData, nativeTaskStartSchema as startSchema, nativeTaskTurnSchema as turnSchema } from "../studio/nativeTaskInput.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { resolveAgentId } from "../fleet/paths.js";
import { NativeTaskServiceError, type NativeTaskActor, type NativeTaskService } from "../studio/nativeTaskTypes.js";
import { assertNativeExecutionIdentity, NativeAdmissionError, type NativeAdmissionActor } from "../studio/nativeAdmission.js";
import { apiError, apiSuccess, isRequestBodyError } from "./apiHelpers.js";

/** Supplied only by Studio's authenticated, origin-checked delegation boundary. */
export interface NativeTaskApiContext {
  readonly service: NativeTaskService;
  readonly principalId: string;
  readonly demo: boolean;
  readonly nativeCsrfToken: string | null;
  readonly admissionActor: NativeAdmissionActor;
  readonly executionAllowed: () => boolean;
}

const agentIdSchema = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/, "Choose a valid agent ID.");
const controlSchema = z.object({ expectedRevision: z.number().int().min(1).max(32) }).strict();
const listQuerySchema = z.object({ agentId: agentIdSchema.optional(), includeArchived: z.enum(["true", "false"]).optional() }).strict();

/** Native admission hashes the exact supported body: never sanitize away unknown fields first. */
async function bodyJsonSchema<T extends z.ZodTypeAny>(req: IncomingMessage, schema: T): Promise<z.output<T>> {
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0, refused = false;
    const fail = (error: NativeTaskServiceError) => { refused = true; chunks.length = 0; reject(error); };
    req.on("data", (chunk: Buffer | string) => {
      if (refused) return; // Drain without retaining an oversized request.
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      length += bytes.length;
      if (length > 1024 * 1024) { fail(new NativeTaskServiceError("INPUT_TOO_LARGE", 413, "Native JSON request exceeds 1 MiB.")); return; }
      chunks.push(bytes);
    });
    req.once("end", () => { if (!refused) resolve(Buffer.concat(chunks)); });
    req.once("error", () => fail(new NativeTaskServiceError("INPUT_INVALID", 400, "Native request body could not be read.")));
    req.once("aborted", () => fail(new NativeTaskServiceError("INPUT_INVALID", 400, "Native request body was interrupted.")));
  });
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new NativeTaskServiceError("INPUT_INVALID", 400, "Native JSON requires lossless UTF-8.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new NativeTaskServiceError("INPUT_INVALID", 400, "Native request body must be JSON."); }
  assertNativeTaskData(value);
  return schema.parse(value);
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://native.invalid").searchParams;
}

/** Never let proxies and the server select different identities from one URL. */
function assertQuery(params: URLSearchParams, allowed: readonly string[]): void {
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
    throw new NativeTaskServiceError("QUERY_INVALID", 400,
      "Supply each supported native task query parameter once. Put admission choices in the request body, not the URL.");
  }
}

function actorFor(workspace: string, context: NativeTaskApiContext, rawAgent?: string | null): NativeTaskActor {
  const explicit = rawAgent === undefined || rawAgent === null ? undefined : agentIdSchema.parse(rawAgent);
  return { principalId: context.principalId, demo: context.demo, agentId: resolveAgentId(workspace, explicit) };
}

function sendFailure(res: ServerResponse, error: unknown): void {
  if (isRequestBodyError(error)) { apiError(res, error.statusCode, error.message); return; }
  if (error instanceof z.ZodError) { apiError(res, 400, "Invalid native task request."); return; }
  // Native service errors are explicitly public, unlike provider/process/credential exceptions.
  if (error instanceof NativeTaskServiceError || error instanceof NativeAdmissionError) {
    res.statusCode = error.statusCode;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: error.message, code: error.code }));
    return;
  }
  apiError(res, 500, "Native task could not be completed. Refresh its status before submitting again.");
}

export async function handleNativeTasksRoute(
  pathname: string, method: string, req: IncomingMessage, res: ServerResponse,
  context: { workspace: string; nativeTasks?: NativeTaskApiContext }
): Promise<boolean> {
  const prefix = "/api/v1/native-tasks";
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false;
  res.setHeader("cache-control", "no-store");
  const native = context.nativeTasks;
  if (!native) { apiError(res, 503, "Native tasks require an authenticated Studio workspace."); return true; }
  try {
    const params = query(req);
    if (pathname === `${prefix}/options` && method === "GET") {
      assertQuery(params, ["agentId"]);
      const configuration = await native.service.configuration(actorFor(context.workspace, native, params.get("agentId")));
      apiSuccess(res, { ...configuration, nativeCsrfToken: native.nativeCsrfToken, executionBlocked: !native.executionAllowed() });
      return true;
    }
    if (pathname === prefix && method === "GET") {
      assertQuery(params, ["agentId", "includeArchived"]);
      const selection = listQuerySchema.parse(Object.fromEntries(params));
      apiSuccess(res, { tasks: await native.service.list(actorFor(context.workspace, native, selection.agentId), selection.includeArchived === "true") });
      return true;
    }
    if (pathname === prefix && method === "POST") {
      assertQuery(params, []);
      const input = await bodyJsonSchema(req, startSchema);
      if (!native.executionAllowed()) throw new NativeTaskServiceError("READ_ONLY", 403, "Workspace signatures require read-only operation. No native task was started.");
      const actor = actorFor(context.workspace, native, input.agentId);
      assertNativeExecutionIdentity({ actor: native.admissionActor, provider: input.provider, tools: input.tools });
      apiSuccess(res, await native.service.start(actor, input), 202);
      return true;
    }
    const match = pathname.slice(prefix.length).match(/^\/([a-zA-Z0-9_-]{8,128})(?:\/(turn|cancel|release|resume|verify|archive))?$/);
    if (!match) { apiError(res, 404, "Native task route not found."); return true; }
    const taskId = match[1]!;
    const action = match[2];
    assertQuery(params, action === undefined && method === "GET" ? ["agentId", "cursor"] : ["agentId"]);
    const actor = actorFor(context.workspace, native, params.get("agentId"));
    if (action === undefined && method === "GET") {
      const raw = params.get("cursor") ?? "0";
      if (!/^(0|[1-9][0-9]{0,14})$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        apiError(res, 400, "Choose a nonnegative event cursor."); return true;
      }
      apiSuccess(res, await native.service.poll(actor, taskId, Number(raw)));
      return true;
    }
    if (method !== "POST" || action === undefined) {
      apiError(res, 405, "Method not allowed for this native task operation."); return true;
    }
    if (action === "turn") {
      if (!native.executionAllowed()) throw new NativeTaskServiceError("READ_ONLY", 403, "Workspace signatures require read-only operation. This turn was not started.");
      const current = await native.service.poll(actor, taskId);
      assertNativeExecutionIdentity({ actor: native.admissionActor, provider: current.task.provider, tools: current.task.tools });
      apiSuccess(res, await native.service.turn(actor, taskId, await bodyJsonSchema(req, turnSchema)), 202);
      return true;
    }
    const { expectedRevision } = await bodyJsonSchema(req, controlSchema);
    if (action === "resume") {
      if (!native.executionAllowed()) throw new NativeTaskServiceError("READ_ONLY", 403, "Workspace signatures require read-only operation. The task was not resumed.");
      const current = await native.service.poll(actor, taskId);
      assertNativeExecutionIdentity({ actor: native.admissionActor, provider: current.task.provider, tools: current.task.tools });
    }
    const result = action === "cancel" ? await native.service.cancel(actor, taskId, expectedRevision)
      : action === "release" ? await native.service.release(actor, taskId, expectedRevision)
      : action === "resume" ? await native.service.resume(actor, taskId, expectedRevision)
      : action === "archive" ? await native.service.archive(actor, taskId, expectedRevision)
      : await native.service.verify(actor, taskId, expectedRevision);
    apiSuccess(res, result, action === "cancel" ? 202 : 200);
    return true;
  } catch (error) { sendFailure(res, error); return true; }
}
