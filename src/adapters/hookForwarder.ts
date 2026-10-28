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
 *
 * Every POST meets checkEgress (residency) on the `bridge` channel for the hook's workspace right before it is sent. It
 * is AMC's own control and evidence traffic (agentId "system"), so an active kill switch does not refuse it: the
 * Bridge's control route enforces the kill and answers deny, and the record of what the agent did must still land.
 * A residency refusal is not retried and answers the event's deny; it is never reported as AMC being unavailable.
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stdin } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CONTROL_HOOK_PATH, deterministicEventId, verifyProviderHookControlResult, type ProviderHookControlResult } from "../bridge/hookControl.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { OBSERVED_AEP_HOOK_PATH, OBSERVED_HOOK_CORRELATION_PATH, type ObservedAepActionEvent } from "../bridge/hookIngress.js";
import { isSafeProviderActionId } from "../bridge/hookActionIdentity.js";
import { redactBridgeText } from "../bridge/bridgeRedaction.js";
import {
  renderProviderControlResponse, serializeProviderControlResponse, type HookControlDecision, type HookProvider, type ProviderControlResponse,
} from "../bridge/hookProviders.js";
import { checkEgress, EgressBlocked, isEgressRefusal } from "../residency/checkEgress.js";
import { sha256Hex } from "../utils/hash.js";
import { boundedFetchSignal, forwardDeadlineMs, HookDeadlineError, withHookDeadline } from "./hookDeadline.js";
import {
  authorizeForwardInvocation, HookIntegrationError, inspectProviderHookEvent, mapProviderHookEvent, parseConfigHookProvider,
  type ConfigHookProvider, type HookMode,
} from "./hookIntegration.js";
import { assertControlBridgeLocal, normalizeBridgeBase, parseMode, validateAgentId } from "./hookProviders/installFiles.js";
import { claudeEnvelope, claudeHookSchemasFor, strictClaudeJson, type ClaudeHookPayload } from "./hookProviders/claudeCodePayloads.js";
import { claudeActionId, claudeSessionSha256 } from "./hookProviders/claudeCode.js";
import { claudeAllow, claudeDeny } from "./hookProviders/claudeAllow.js";

/** Synchronous preflight right before each hook POST; its typed refusal is thrown outside every retry loop. */
function admitHookEgress(workspace: string, url: string): void {
  checkEgress({ workspace, channel: "bridge", url, agentId: "system", dataClasses: null, purpose: "provider-hook" });
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function resolveProviderTerminalAction(input: {
  workspace: string;
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
    admitHookEgress(input.workspace, url);
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
        workspace,
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
    admitHookEgress(workspace, url);
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
  /** The provider payload to observe when `rawInput` is AMC's envelope around it (Claude Code). */
  observedInput?: string;
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
    rawInput: input.observedInput ?? input.rawInput,
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
    admitHookEgress(workspace, url);
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

function failClosedProviderControlResponse(
  provider: HookProvider,
  reason = "AMC control is unavailable; the action is denied fail closed.",
): ProviderControlResponse {
  return renderProviderControlResponse(provider, "deny" satisfies HookControlDecision, reason);
}

/** The most hook payload bytes the forwarder reads: no larger body could reach the Bridge's control route anyway. */
const MAX_STDIN_BYTES = 262_144;

/** The hook payload's bytes exactly as received (Claude Code control decides on these bytes), refused past the cap before more is buffered. */
export async function readStdinAll(input: NodeJS.ReadableStream & { isTTY?: boolean } = stdin, maxBytes = MAX_STDIN_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    input.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        input.removeAllListeners("data");
        (input as { destroy?: () => void }).destroy?.();
        reject(new Error(`the hook payload is too large (over ${maxBytes} bytes)`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    input.on("end", () => resolve(Buffer.concat(chunks)));
    input.on("error", reject);
    if (input.isTTY) resolve(Buffer.alloc(0));
  });
}

export interface HookForwardOptions {
  provider: HookProvider;
  mode: HookMode;
  agent: string;
  tokenFile: string;
  bridgeUrl: string;
  /** Claude Code: the hook event this handler was installed for; a payload naming another event is refused. */
  event?: string;
}

export interface HookForwardOutcome {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2;
}

/**
 * The receipt digest of the PreToolUse decision a post-tool hook follows, read from this workspace's ledger, or null.
 * The control route accepts the observation as this call's only when it names that decision and comes with the lease
 * that obtained it.
 */
function decisionReceiptSha256(workspace: string, agentId: string, sessionId: string, toolUseId: string): string | null {
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(workspace);
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1")
      .get(deterministicEventId(agentId, "claude-code", claudeActionId(sessionId, toolUseId))) as { meta_json: string } | undefined;
    const digest = row ? (JSON.parse(row.meta_json) as { receipt_sha256?: unknown }).receipt_sha256 : null;
    return typeof digest === "string" ? digest : null;
  } catch {
    return null;
  } finally {
    ledger?.close();
  }
}

/** What AMC's forwarder sends to the control route for a Claude Code hook other than PreToolUse: never raw prompt text. */
function claudeSessionBody(payload: ClaudeHookPayload, workspace: string, agentId: string): Record<string, unknown> {
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
      return { ...base, tool_use_id: payload.tool_use_id, tool_name: payload.tool_name, tool_input: payload.tool_input,
        decisionReceiptSha256: decisionReceiptSha256(workspace, agentId, payload.session_id, payload.tool_use_id) };
    default:
      return base;
  }
}

/** POST one Claude Code session hook to the control route under the lease; resolves to its JSON object or throws. */
async function postClaudeSessionEvent(workspace: string, authorization: { bridgeBase: string; token: string }, body: Record<string, unknown>,
  signal: AbortSignal): Promise<Record<string, unknown>> {
  const text = JSON.stringify(body);
  admitHookEgress(workspace, `${authorization.bridgeBase}${CONTROL_HOOK_PATH}`);
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

/** Whether the Bridge's admission is the signed, sealed row admitting exactly this prompt of this session; otherwise the prompt is blocked. */
function verifiedAdmission(workspace: string, agentId: string, eventId: unknown, sessionId: string, body: Record<string, unknown>): boolean {
  if (typeof eventId !== "string") return false;
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(workspace);
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
    if (!row || !verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true }).ok) return false;
    const meta = JSON.parse(row.meta_json) as { admitted?: unknown; agentId?: unknown; sessionSha256?: unknown; reported?: { promptSha256?: unknown } };
    return meta.admitted === true && meta.agentId === agentId && meta.sessionSha256 === claudeSessionSha256(sessionId)
      && meta.reported?.promptSha256 === (body.prompt as { sha256?: unknown } | undefined)?.sha256;
  } catch {
    return false;
  } finally {
    ledger?.close();
  }
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
  const body = claudeSessionBody(payload, workspace, opts.agent);
  if (payload.hook_event_name === "PostToolUse" || payload.hook_event_name === "PostToolUseFailure") {
    // The control route records whether the observed ingress got this outcome; a miss latches the session there.
    let ingressRecorded = true;
    await forwardProviderHookEvent({ ...forward, rawInput, mode: "control", signal }).catch((error: unknown) => {
      if (isEgressRefusal(error)) throw error;
      ingressRecorded = false;
    });
    body.ingressRecorded = ingressRecorded;
  }
  const answer = await postClaudeSessionEvent(workspace, authorization, body, signal);
  if (payload.hook_event_name === "UserPromptSubmit") {
    if (answer.admitted === true && verifiedAdmission(workspace, opts.agent, answer.eventId, payload.session_id, body)) return { stdout: "{}\n", stderr: "", exitCode: 0 };
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
function claudeFailure(handler: string | null, payloadEvents: ReadonlySet<string>, forwarding: boolean, error: unknown): HookForwardOutcome {
  const why = error instanceof HookDeadlineError ? "timed out" : redactBridgeText(error instanceof Error ? error.message : String(error));
  // Claude Code runs a hook for the event its payload names: a PreToolUse or UserPromptSubmit payload is denied or
  // blocked whichever event the handler was installed for, so exit 0 never lets such a call through here.
  const event = handler === "PreToolUse" || payloadEvents.has("PreToolUse") ? "PreToolUse"
    : handler === "UserPromptSubmit" || payloadEvents.has("UserPromptSubmit") ? "UserPromptSubmit" : handler;
  if (event !== null && NEVER_BLOCKED.has(event) && event !== "Stop") {
    return { stdout: `${JSON.stringify({ systemMessage: `AMC does not handle the ${event} hook (${why}).` })}\n`, stderr: "", exitCode: 0 };
  }
  if (event === "SessionStart") {
    return { stdout: `${JSON.stringify({ systemMessage: `AMC did not register this Claude Code session, so AMC denies its tool calls (${why}).` })}\n`, stderr: "", exitCode: 0 };
  }
  if (event === "Stop") return { stdout: `${JSON.stringify({ systemMessage: "AMC could not record the end of this turn." })}\n`, stderr: "", exitCode: 0 };
  if (event === "UserPromptSubmit") {
    return PROMPT_BLOCKED(error instanceof EgressBlocked ? `AMC residency refused hook delivery; prompt blocked (${why}).` : "AMC admission unavailable; prompt blocked.");
  }
  if (event === "PostToolUse" || event === "PostToolUseFailure") {
    return { stdout: "{}\n", stderr: "AMC could not record the tool outcome; the action already ran.\n", exitCode: 2 };
  }
  if (error instanceof HookDeadlineError) return claudeDeny("AMC hook control timed out; action denied.");
  if (error instanceof EgressBlocked) return claudeDeny(`AMC residency refused hook delivery; action denied (${why}).`);
  return claudeDeny(forwarding ? "AMC hook control unavailable; action denied." : "AMC hook control input invalid; action denied.");
}

/** Every hook event name a payload could be read as naming (repeated, escaped or malformed forms included). */
function payloadEventNames(bytes: Buffer): Set<string> {
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const names = new Set([...text.matchAll(/"hook_event_name"\s*:\s*"((?:[^"\\]|\\.){0,128})"/g)].map((match) => {
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1]!;
    }
  }));
  try {
    const name = (JSON.parse(text) as { hook_event_name?: unknown }).hook_event_name;
    if (typeof name === "string") names.add(name);
  } catch {
    // Unparseable: the names matched above stand.
  }
  return names;
}

/** Claude Code's payload bytes read the one way they can be read, then the installation's bound release's payload schema. */
function claudePayload(bytes: Buffer, opts: HookForwardOptions, workspace: string): { payload: ClaudeHookPayload; text: string } {
  const strict = strictClaudeJson(bytes);
  const release = authorizeForwardInvocation({ workspace, provider: "claude-code", mode: "control", agentId: opts.agent,
    bridgeBase: normalizeBridgeBase(opts.bridgeUrl), tokenFile: opts.tokenFile }).claudeCodeVersion;
  const schemas = claudeHookSchemasFor(release);
  if (!schemas) throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", "the installation binds no qualified Claude Code release");
  const payload = schemas.payload.parse(strict.value);
  if (payload.hook_event_name !== opts.event) throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", `a ${payload.hook_event_name} payload reached AMC's ${opts.event} hook`);
  return { payload, text: strict.text };
}

/**
 * Claude Code control mode: a default-deny dispatcher over the hook this handler was installed for (`--event`). The
 * PreToolUse case answers allow only through claudeAllow (claudeAllow.ts); every other outcome of every case, any
 * exception, a timeout, and a missing or unknown event answer with that event's deny or non-blocking answer.
 */
async function answerClaudeHook(opts: HookForwardOptions, readInput: () => Promise<string | Buffer>, workspace: string,
  deadlineMs: number): Promise<HookForwardOutcome> {
  const handler = opts.event ?? null;
  let forwarding = false;
  let payloadEvents: ReadonlySet<string> = new Set();
  try {
    return await withHookDeadline(deadlineMs, async (signal) => {
      const received = await readInput();
      const bytes = typeof received === "string" ? Buffer.from(received, "utf8") : received;
      payloadEvents = payloadEventNames(bytes);
      switch (handler) {
        case "PreToolUse": {
          const { payload, text } = claudePayload(bytes, opts, workspace);
          if (payload.hook_event_name !== "PreToolUse") break;
          // AMC decides on these exact bytes: the control route hashes them, and the nonce makes the request single-use.
          const envelope = claudeEnvelope(bytes, randomUUID());
          forwarding = true;
          const { control } = await forwardProviderHookControl({ workspace, provider: "claude-code", agentId: opts.agent, tokenFile: opts.tokenFile,
            bridgeBase: opts.bridgeUrl, rawInput: envelope, observedInput: text, signal });
          const allowed = claudeAllow({ workspace, agentId: opts.agent, payloadBytes: bytes, sessionId: payload.session_id, toolUseId: payload.tool_use_id,
            envelope, result: control });
          if (allowed) return allowed.answer;
          return control.decision === "deny" ? claudeDeny(`AMC policy denied the action: ${redactBridgeText(control.reason)}`, control.providerResponse)
            : claudeDeny("AMC did not verify an allow for this exact call; action denied.");
        }
        case "UserPromptSubmit":
        case "SessionStart":
        case "Stop":
        case "PostToolUse":
        case "PostToolUseFailure": {
          const { payload, text } = claudePayload(bytes, opts, workspace);
          forwarding = true;
          return await forwardClaudeSessionHook(payload, opts, workspace, text, signal);
        }
        default:
          break;
      }
      throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", `AMC's Claude Code hook handler names no event AMC handles (${handler ?? "none"}); reinstall the hook`);
    });
  } catch (error) {
    return claudeFailure(handler, payloadEvents, forwarding, error);
  }
}

/**
 * Runs one provider hook delivery under forwardDeadlineMs(). Claude Code control mode turns every failure into the
 * answer its event needs (claudeFailure), because Claude Code runs the action after any other failure; Gemini CLI and
 * observe mode keep their earlier outputs and exit codes.
 */
export async function runHookForward(
  opts: HookForwardOptions,
  readInput: () => Promise<string | Buffer>,
  workspace = process.cwd(),
  deadlineMs = forwardDeadlineMs(),
): Promise<HookForwardOutcome> {
  if (opts.provider === "claude-code" && opts.mode === "control") return answerClaudeHook(opts, readInput, workspace, deadlineMs);
  const deny = (message: string): HookForwardOutcome => ({
    stdout: `${serializeProviderControlResponse(failClosedProviderControlResponse(opts.provider))}\n`,
    stderr: `${message}\n`,
    exitCode: 0,
  });
  // Assigned inside the deadline callback, so the cast stops narrowing to the initial value.
  let stage = "input" as "empty" | "input" | "control" | "observe";
  try {
    return await withHookDeadline(deadlineMs, async (signal) => {
      const received = await readInput();
      const bytes = typeof received === "string" ? Buffer.from(received, "utf8") : received;
      const rawInput = bytes.toString("utf8");
      if (!rawInput.trim()) {
        stage = "empty";
        throw new HookIntegrationError("HOOK_INPUT_INVALID", "provider hook input is required on stdin");
      }
      const inspection = inspectProviderHookEvent({ provider: opts.provider, rawInput });
      const forward = { workspace, provider: opts.provider, agentId: opts.agent, tokenFile: opts.tokenFile, bridgeBase: opts.bridgeUrl, rawInput, signal };
      if (opts.mode === "control" && inspection.phase === "requested") {
        stage = "control";
        const { control } = await forwardProviderHookControl(forward);
        return { stdout: `${serializeProviderControlResponse(control.providerResponse)}\n`, stderr: "", exitCode: 0 };
      }
      stage = "observe";
      await forwardProviderHookEvent({ ...forward, mode: opts.mode });
      // Both supported providers treat an empty JSON object as a neutral observation result.
      return { stdout: "{}\n", stderr: "", exitCode: 0 };
    });
  } catch (error) {
    if (opts.mode === "control" && stage !== "empty" && stage !== "observe") {
      if (error instanceof HookDeadlineError) return deny("AMC hook control timed out; action denied.");
      if (error instanceof EgressBlocked) return deny(`AMC residency refused hook delivery; action denied (${error.message}).`);
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
      agent: { type: "string" }, "token-file": { type: "string" }, "bridge-url": { type: "string" }, event: { type: "string" } } });
    if (!values.provider || !values.agent || !values["token-file"]) throw new Error("missing flag");
    opts = { provider: values.provider as HookProvider, mode: (values.mode ?? "observe") as HookMode, agent: values.agent,
      tokenFile: values["token-file"], bridgeUrl: values["bridge-url"] ?? "http://127.0.0.1:3212", ...(values.event ? { event: values.event } : {}) };
  } catch {
    process.stderr.write("AMC hook forwarder arguments are invalid; reinstall the hook.\n");
    process.exitCode = 2;
    return;
  }
  const outcome = await runHookForward(opts, () => readStdinAll());
  stdin.destroy();
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  process.stdout.write(outcome.stdout);
  process.exitCode = outcome.exitCode;
}

const invokedPath = process.argv[1];
if (invokedPath && (() => { try { return realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })()) {
  void main();
}
