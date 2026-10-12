/**
 * AMC's provider hook forwarder (P0-42, P1-23). Claude Code runs it as `node <AMC>/dist/adapters/hookForwarder.js
 * --provider … --mode … --agent … --bridge-url … --token-file …`, an entry without the CLI bootstrap; the hidden
 * `amc connect hooks forward` runs the same code. It reads one hook payload on stdin, forwards it to the local Bridge
 * under the installation's dedicated lease and prints the provider's answer.
 *
 * Claude Code control mode: PreToolUse gets AMC's decision, bound to the exact request plus a fresh nonce and verified
 * against the sealed ledger row; every failure denies with exit 2. SessionStart registers the session, UserPromptSubmit
 * asks for admission (only the prompt's length and SHA-256 leave this process; a failure blocks the prompt), Stop and
 * PostToolUse record what happened. SessionStart and Stop never exit 2: Claude Code reads exit 2 on Stop as "keep going".
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stdin } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CONTROL_HOOK_PATH, verifyProviderHookControlResult, type ProviderHookControlResult } from "../bridge/hookControl.js";
import { OBSERVED_AEP_HOOK_PATH, OBSERVED_HOOK_CORRELATION_PATH, type ObservedAepActionEvent } from "../bridge/hookIngress.js";
import { isSafeProviderActionId } from "../bridge/hookActionIdentity.js";
import { redactBridgeText } from "../bridge/bridgeRedaction.js";
import {
  renderProviderControlResponse, serializeProviderControlResponse, type HookControlDecision, type HookProvider, type ProviderControlResponse,
} from "../bridge/hookProviders.js";
import { sha256Hex } from "../utils/hash.js";
import { boundedFetchSignal, forwardDeadlineMs, HookDeadlineError, withHookDeadline } from "./hookDeadline.js";
import {
  authorizeForwardInvocation, HookIntegrationError, inspectProviderHookEvent, mapProviderHookEvent, parseConfigHookProvider, parseUnambiguousJson,
  type ConfigHookProvider, type HookMode,
} from "./hookIntegration.js";
import { assertControlBridgeLocal, normalizeBridgeBase, parseMode, validateAgentId } from "./hookProviders/installFiles.js";
import { claudeHookSchemasFor, type ClaudeHookPayload } from "./hookProviders/claudeCodePayloads.js";

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function resolveProviderTerminalAction(input: {
  authorization: { bridgeBase: string; token: string };
  provider: ConfigHookProvider;
  correlationSha256: string;
  retryDelayMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  const body = JSON.stringify({
    provider: input.provider,
    correlationSha256: input.correlationSha256,
  });
  const url = `${input.authorization.bridgeBase}${OBSERVED_HOOK_CORRELATION_PATH}`;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: boundedFetchSignal(input.timeoutMs, input.signal),
        headers: {
          authorization: `Bearer ${input.authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
        },
        body,
      });
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(input.retryDelayMs);
        continue;
      }
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        const reason = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
        throw new HookIntegrationError(
          "HOOK_CORRELATION_REQUIRED",
          `terminal hook correlation failed closed: ${reason}`,
        );
      }
      if (payload?.resolved !== true || !isSafeProviderActionId(payload.actionId)) {
        throw new HookIntegrationError("HOOK_CORRELATION_REQUIRED", "terminal hook correlation response is incomplete");
      }
      return payload.actionId;
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(input.retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_CORRELATION_REQUIRED",
    `terminal hook correlation failed before a verified response${lastError ? `: ${lastError}` : ""}`,
  );
}

export async function forwardProviderHookEvent(input: {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  bridgeBase?: string;
  tokenFile: string;
  rawInput: string;
  mode?: HookMode;
  observedAt?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{
  status: number;
  receiptId: string;
  idempotentReplay: boolean;
  actionId: string;
  sourceEventType: ObservedAepActionEvent["type"];
}> {
  const workspace = resolve(input.workspace);
  const provider = parseConfigHookProvider(input.provider);
  const mode = parseMode(input.mode);
  const bridgeBase = normalizeBridgeBase(input.bridgeBase);
  const agentId = validateAgentId(input.agentId);
  const authorization = authorizeForwardInvocation({
    workspace,
    provider,
    mode,
    agentId,
    bridgeBase,
    tokenFile: input.tokenFile
  });
  const retryDelayMs = input.retryDelayMs ?? 100;
  const timeoutMs = input.timeoutMs ?? 5_000;
  const inspection = inspectProviderHookEvent({ provider, rawInput: input.rawInput });
  const resolvedActionId = provider === "gemini-cli" && inspection.phase !== "requested"
    ? await resolveProviderTerminalAction({
        authorization,
        provider,
        correlationSha256: inspection.correlationSha256,
        retryDelayMs,
        timeoutMs,
        signal: input.signal,
      })
    : undefined;
  const event = mapProviderHookEvent({
    provider,
    agentId,
    rawInput: input.rawInput,
    observedAt: input.observedAt,
    resolvedActionId,
  });
  const body = JSON.stringify(event);
  const url = `${authorization.bridgeBase}${OBSERVED_AEP_HOOK_PATH}`;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: boundedFetchSignal(timeoutMs, input.signal),
        headers: {
          authorization: `Bearer ${authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body))
        },
        body
      });
      lastStatus = response.status;
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(retryDelayMs);
        continue;
      }
      if (!response.ok) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", `hook ingress rejected the event with HTTP ${response.status}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      if (payload.observed !== true || typeof payload.receiptId !== "string") {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "hook ingress response is missing an observed receipt");
      }
      return {
        status: response.status,
        receiptId: payload.receiptId,
        idempotentReplay: payload.idempotentReplay === true,
        actionId: typeof payload.actionId === "string" ? payload.actionId : event.action.id,
        sourceEventType: event.type,
      };
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_DELIVERY_FAILED",
    lastStatus === null
      ? `hook delivery failed before a response${lastError ? `: ${lastError}` : ""}`
      : `hook delivery failed with HTTP ${lastStatus}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function forwardProviderHookControl(input: {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  bridgeBase?: string;
  tokenFile: string;
  rawInput: string;
  observedAt?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{
  observation: { status: number; receiptId: string; idempotentReplay: boolean };
  control: ProviderHookControlResult;
}> {
  const workspace = resolve(input.workspace);
  const provider = parseConfigHookProvider(input.provider);
  const bridgeBase = normalizeBridgeBase(input.bridgeBase);
  assertControlBridgeLocal("control", bridgeBase);
  const agentId = validateAgentId(input.agentId);
  const authorization = authorizeForwardInvocation({
    workspace,
    provider,
    mode: "control",
    agentId,
    bridgeBase,
    tokenFile: input.tokenFile,
  });
  const observation = await forwardProviderHookEvent({
    ...input,
    workspace,
    provider,
    agentId,
    bridgeBase,
    mode: "control",
  });
  const retryDelayMs = input.retryDelayMs ?? 100;
  const timeoutMs = input.timeoutMs ?? 5_000;
  const url = `${authorization.bridgeBase}${CONTROL_HOOK_PATH}`;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: boundedFetchSignal(timeoutMs, input.signal),
        headers: {
          authorization: `Bearer ${authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(input.rawInput)),
          "x-amc-hook-provider": provider,
        },
        body: input.rawInput,
      });
      lastStatus = response.status;
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(retryDelayMs);
        continue;
      }
      if (!response.ok) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", `hook control rejected the request with HTTP ${response.status}`);
      }
      const payload = await response.json() as unknown;
      if (!isRecord(payload)) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "hook control response is incomplete");
      }
      const verification = verifyProviderHookControlResult({
        workspace,
        authenticatedAgentId: agentId,
        provider,
        rawInput: input.rawInput,
        result: payload,
      });
      if (!verification.ok) {
        throw new HookIntegrationError(
          "HOOK_DELIVERY_FAILED",
          `hook control response verification failed: ${verification.error ?? "unknown verification error"}`,
        );
      }
      return {
        observation,
        control: payload as unknown as ProviderHookControlResult,
      };
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_DELIVERY_FAILED",
    lastStatus === null
      ? `hook control failed before a response${lastError ? `: ${lastError}` : ""}`
      : `hook control failed with HTTP ${lastStatus}`,
  );
}

export function failClosedProviderControlResponse(
  provider: HookProvider,
  reason = "AMC control is unavailable; the action is denied fail closed.",
): ProviderControlResponse {
  return renderProviderControlResponse(provider, "deny" satisfies HookControlDecision, reason);
}

export async function readStdinAll(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => { data += chunk; });
    stdin.on("end", () => resolve(data));
    if (stdin.isTTY) resolve("");
  });
}

export interface HookForwardOptions {
  provider: HookProvider;
  mode: HookMode;
  agent: string;
  tokenFile: string;
  bridgeUrl: string;
}

export interface HookForwardOutcome {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2;
}

/** The Claude Code hook a payload names, read loosely, so even an invalid payload is answered as its event needs. */
function claudeEventName(rawInput: string): string | null {
  try {
    const name = (JSON.parse(rawInput) as { hook_event_name?: unknown }).hook_event_name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** What AMC's forwarder sends to the control route for a Claude Code hook other than PreToolUse: never raw prompt text. */
function claudeSessionBody(payload: ClaudeHookPayload): Record<string, unknown> {
  const base = { hook_event_name: payload.hook_event_name, session_id: payload.session_id };
  switch (payload.hook_event_name) {
    case "SessionStart":
      return { ...base, amc: { claudePid: Number(process.env.CLAUDE_PID), configDir: process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude") } };
    case "UserPromptSubmit":
      return { ...base, prompt_id: payload.prompt_id, prompt: { sha256: sha256Hex(Buffer.from(payload.prompt, "utf8")), length: Buffer.byteLength(payload.prompt, "utf8") } };
    case "Stop":
      return { ...base, prompt_id: payload.prompt_id, stop_hook_active: payload.stop_hook_active };
    case "PostToolUse":
    case "PostToolUseFailure":
      return { ...base, tool_use_id: payload.tool_use_id, tool_name: payload.tool_name, tool_input: payload.tool_input };
    default:
      return base;
  }
}

/** POST one Claude Code session hook to the control route under the lease; resolves to its JSON object or throws. */
async function postClaudeSessionEvent(authorization: { bridgeBase: string; token: string }, body: Record<string, unknown>,
  signal: AbortSignal): Promise<Record<string, unknown>> {
  const text = JSON.stringify(body);
  const response = await fetch(`${authorization.bridgeBase}${CONTROL_HOOK_PATH}`, {
    method: "POST", redirect: "error", signal: boundedFetchSignal(5_000, signal),
    headers: { authorization: `Bearer ${authorization.token}`, "content-type": "application/json", "x-amc-hook-provider": "claude-code" }, body: text,
  });
  const answer = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isRecord(answer)) {
    throw new HookIntegrationError("HOOK_DELIVERY_FAILED", `AMC answered HTTP ${response.status}${isRecord(answer) && typeof answer.error === "string" ? `: ${answer.error}` : ""}`);
  }
  return answer;
}

const PROMPT_BLOCKED = (reason: string): HookForwardOutcome => ({
  stdout: `${JSON.stringify({ decision: "block", reason, hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true } })}\n`,
  stderr: `${reason}\n`,
  exitCode: 2,
});

/** A Claude Code SessionStart, UserPromptSubmit, Stop or post-tool hook in control mode. */
async function forwardClaudeSessionHook(payload: ClaudeHookPayload, opts: HookForwardOptions, workspace: string, rawInput: string,
  signal: AbortSignal): Promise<HookForwardOutcome> {
  const forward = { workspace, provider: "claude-code" as const, agentId: opts.agent, tokenFile: opts.tokenFile, bridgeBase: opts.bridgeUrl };
  const authorization = authorizeForwardInvocation({ ...forward, mode: "control", bridgeBase: normalizeBridgeBase(opts.bridgeUrl) });
  const body = claudeSessionBody(payload);
  if (payload.hook_event_name === "PostToolUse" || payload.hook_event_name === "PostToolUseFailure") {
    // The control route records whether the observed ingress got this outcome; a miss latches the session there.
    let ingressRecorded = true;
    await forwardProviderHookEvent({ ...forward, rawInput, mode: "control", signal }).catch(() => { ingressRecorded = false; });
    body.ingressRecorded = ingressRecorded;
  }
  const answer = await postClaudeSessionEvent(authorization, body, signal);
  if (payload.hook_event_name === "UserPromptSubmit") {
    if (answer.admitted === true) return { stdout: "{}\n", stderr: "", exitCode: 0 };
    if (answer.admitted === false && typeof answer.reason === "string") return PROMPT_BLOCKED(`AMC admission denied: ${redactBridgeText(answer.reason)}`);
    throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "AMC's admission answer is malformed");
  }
  const done = payload.hook_event_name === "SessionStart" ? answer.registered === true : answer.recorded === true;
  if (!done) throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "AMC's answer is malformed");
  return { stdout: "{}\n", stderr: "", exitCode: 0 };
}

/** Events on which exit 2 keeps Claude Code (or a subagent or teammate) working, or that nothing can block: never exit 2. */
const NEVER_BLOCKED = new Set(["Stop", "SubagentStop", "TeammateIdle", "TaskCompleted", "SessionEnd", "Notification", "SubagentStart"]);

/**
 * How a failed Claude Code control-mode hook answers, by event: deny a tool, block a prompt, never block a start or a
 * stop. A hook event AMC does not install is answered the same way (never with an allow): a blockable one blocks.
 */
function claudeFailure(event: string | null, forwarding: boolean, deny: (message: string) => HookForwardOutcome, error: unknown): HookForwardOutcome {
  const why = error instanceof HookDeadlineError ? "timed out" : redactBridgeText(error instanceof Error ? error.message : String(error));
  if (event !== null && NEVER_BLOCKED.has(event) && event !== "Stop") {
    return { stdout: `${JSON.stringify({ systemMessage: `AMC does not handle the ${event} hook (${why}).` })}\n`, stderr: "", exitCode: 0 };
  }
  if (event === "SessionStart") {
    return { stdout: `${JSON.stringify({ systemMessage: `AMC did not register this Claude Code session, so AMC denies its tool calls (${why}).` })}\n`, stderr: "", exitCode: 0 };
  }
  if (event === "Stop") return { stdout: `${JSON.stringify({ systemMessage: "AMC could not record the end of this turn." })}\n`, stderr: "", exitCode: 0 };
  if (event === "UserPromptSubmit") return PROMPT_BLOCKED("AMC admission unavailable; prompt blocked.");
  if (event === "PostToolUse" || event === "PostToolUseFailure") {
    return { stdout: "{}\n", stderr: "AMC could not record the tool outcome; the action already ran.\n", exitCode: 2 };
  }
  if (error instanceof HookDeadlineError) return deny("AMC hook control timed out; action denied.");
  return deny(forwarding ? "AMC hook control unavailable; action denied." : "AMC hook control input invalid; action denied.");
}

/**
 * Runs one provider hook delivery under forwardDeadlineMs(). Claude Code control mode turns every failure into the
 * answer its event needs (claudeFailure), because Claude Code runs the action after any other failure; Gemini CLI and
 * observe mode keep their earlier outputs and exit codes.
 */
export async function runHookForward(
  opts: HookForwardOptions,
  readInput: () => Promise<string>,
  workspace = process.cwd(),
  deadlineMs = forwardDeadlineMs(),
): Promise<HookForwardOutcome> {
  const claudeControl = opts.provider === "claude-code" && opts.mode === "control";
  const denyExit = claudeControl ? 2 : 0;
  const deny = (message: string): HookForwardOutcome => ({
    stdout: `${serializeProviderControlResponse(failClosedProviderControlResponse(opts.provider))}\n`,
    stderr: `${message}\n`,
    exitCode: denyExit,
  });
  // Assigned inside the deadline callback, so the cast stops narrowing to the initial value.
  let stage = "input" as "empty" | "input" | "control" | "observe";
  let event = null as string | null;
  try {
    return await withHookDeadline(deadlineMs, async (signal) => {
      let rawInput = await readInput();
      if (!rawInput.trim()) {
        stage = "empty";
        throw new HookIntegrationError("HOOK_INPUT_INVALID", "provider hook input is required on stdin");
      }
      if (claudeControl) {
        event = claudeEventName(rawInput);
        // A repeated key, then the bound release's own payload schema: an unknown field, type or event is refused, as its event's failure.
        const unambiguous = parseUnambiguousJson(rawInput, "input");
        const release = authorizeForwardInvocation({ workspace, provider: "claude-code", mode: "control", agentId: opts.agent,
          bridgeBase: normalizeBridgeBase(opts.bridgeUrl), tokenFile: opts.tokenFile }).claudeCodeVersion;
        const schemas = claudeHookSchemasFor(release);
        if (!schemas) throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", "the installation binds no qualified Claude Code release");
        const payload = schemas.payload.parse(unambiguous);
        if (payload.hook_event_name !== "PreToolUse") return await forwardClaudeSessionHook(payload, opts, workspace, rawInput, signal);
        rawInput = JSON.stringify({ ...payload, amc: { nonce: randomUUID() } });
      }
      const inspection = inspectProviderHookEvent({ provider: opts.provider, rawInput });
      const forward = { workspace, provider: opts.provider, agentId: opts.agent, tokenFile: opts.tokenFile, bridgeBase: opts.bridgeUrl, rawInput, signal };
      if (opts.mode === "control" && inspection.phase === "requested") {
        stage = "control";
        const { control } = await forwardProviderHookControl(forward);
        const denied = control.decision === "deny";
        return {
          stdout: `${serializeProviderControlResponse(control.providerResponse)}\n`,
          stderr: denied && denyExit === 2 ? `AMC policy denied the action: ${redactBridgeText(control.reason)}\n` : "",
          exitCode: denied ? denyExit : 0,
        };
      }
      stage = "observe";
      await forwardProviderHookEvent({ ...forward, mode: opts.mode });
      // Both supported providers treat an empty JSON object as a neutral observation result.
      return { stdout: "{}\n", stderr: "", exitCode: 0 };
    });
  } catch (error) {
    if (claudeControl) return claudeFailure(stage === "empty" ? null : event, stage === "control", deny, error);
    if (opts.mode === "control" && stage !== "empty" && stage !== "observe") {
      if (error instanceof HookDeadlineError) return deny("AMC hook control timed out; action denied.");
      return deny(stage === "control" ? "AMC hook control unavailable; action denied." : "AMC hook control input invalid; action denied.");
    }
    return { stdout: "", stderr: `${error instanceof Error ? error.message : String(error)}\n`, exitCode: 1 };
  }
}

/** The forwarder entry: the exact flags the installer writes, nothing else; bad flags block as a failed hook. */
async function main(): Promise<void> {
  let opts: HookForwardOptions;
  try {
    const { values } = parseArgs({ strict: true, allowPositionals: false, options: { provider: { type: "string" }, mode: { type: "string" },
      agent: { type: "string" }, "token-file": { type: "string" }, "bridge-url": { type: "string" } } });
    if (!values.provider || !values.agent || !values["token-file"]) throw new Error("missing flag");
    opts = { provider: values.provider as HookProvider, mode: (values.mode ?? "observe") as HookMode, agent: values.agent,
      tokenFile: values["token-file"], bridgeUrl: values["bridge-url"] ?? "http://127.0.0.1:3212" };
  } catch {
    process.stderr.write("AMC hook forwarder arguments are invalid; reinstall the hook.\n");
    process.exitCode = 2;
    return;
  }
  const outcome = await runHookForward(opts, readStdinAll);
  stdin.destroy();
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  process.stdout.write(outcome.stdout);
  process.exitCode = outcome.exitCode;
}

const invokedPath = process.argv[1];
if (invokedPath && (() => { try { return realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })()) {
  void main();
}
