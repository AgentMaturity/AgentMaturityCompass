import { openAgentSession, type AgentPromptResult } from "../agent/agentSession.js";
import { stubProviderTransport, STUB_PROVIDER_ID } from "../agent/stubProvider.js";
import { nativeRouteFor, paramsFor } from "../cli-agent-options.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { AdapterRegistry } from "../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../llm/adapter/llmRuntime.js";
import { amcVersion } from "../version.js";
import { EMPTY_TOOL_SEAM } from "../agent/toolSeam.js";
import { RUN_CODE_TOOL } from "../tools/toolPipeline.js";
import type { LoopLlm, LoopRoute } from "../agent/stepRunner.js";
import type { ToolGuard } from "../tools/toolTypes.js";
import type { SessionService } from "../session/sessionService.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ExecutorCaseView, TrialRunner } from "./trialExecutor.js";

/** Label of the guard that confines a trial's tool calls to its case's allowed action classes. */
const CASE_SCOPE_GUARD = "experiment-case-scope";

export interface NativeTrialRunnerOptions {
  readonly workspace: string;
  readonly agentId: string;
  readonly makeLlm: (session: SessionService) => LoopLlm;
  readonly route: LoopRoute;
  readonly harnessVersion: string;
  /** Governed workspace tools through the native ToolPipeline, or none. An unconfined shell is never offered here. */
  readonly tools?: "none" | "workspace";
  readonly maxSteps?: number;
  /** The requester's lease (Studio), so trial tool calls are authorized as them rather than the process's OS user. */
  readonly leaseToken?: string;
  /** Send the case prompt exactly (eval suites, SH-OBS-04); the default appends the context and allowed action classes. */
  readonly verbatimPrompt?: boolean;
  /** One more deny-only guard composed after the case-scope guard (D55: it can refuse a call, never allow one). */
  readonly extraGuard?: { readonly label: string; readonly guard: ToolGuard };
  /** Told the session id as soon as the session opens, so a caller can find its signed rows. */
  readonly onSession?: (sessionId: string) => void;
}

/** The task the agent is given: the case prompt, then its declared context and allowed action classes. */
function taskText(view: ExecutorCaseView): string {
  return [view.prompt, ...(view.context === null ? [] : [`Context: ${canonicalize(view.context)}`]),
    `Allowed action classes: ${view.allowedActionClasses.join(", ")}`].join("\n\n");
}

function outcomeOf(result: AgentPromptResult): { ok: true } | { ok: false; reason: string } {
  if (!result.ok) return { ok: false, reason: result.reason };
  return result.turnEndReason === "complete" ? { ok: true } : { ok: false, reason: `turn ended ${result.turnEndReason ?? "without a recorded ending"}` };
}

/**
 * A trial runner over the governed native agent path (openAgentSession -> composeNativeAgent, tools through the
 * ToolPipeline). The configuration bytes are the session's persona, so a candidate changes exactly what the agent is
 * told; each case execution is one fresh session whose every row carries the execution stamp.
 */
export function nativeTrialRunner(options: NativeTrialRunnerOptions): TrialRunner {
  const tools = options.tools ?? "workspace";
  return async ({ view, config, stamp, signal }) => {
    const configDigest = stamp.caseExecution.configDigest;
    const allowed = new Set(view.allowedActionClasses);
    const session = openAgentSession({
      workspace: options.workspace,
      agentId: options.agentId,
      makeLlm: options.makeLlm,
      route: options.route,
      systemPrompt: config.toString("utf8"),
      harnessVersion: options.harnessVersion,
      compositionDigest: sha256Hex(canonicalize({ surface: "experiment-trial", configDigest, providerId: options.route.providerId,
        model: options.route.model, tools, maxSteps: options.maxSteps ?? null })),
      policyDigest: sha256Hex(canonicalize({ surface: "experiment-trial", tools })),
      tools,
      ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
      ...(options.leaseToken === undefined ? {} : { leaseToken: options.leaseToken }),
      rowStamp: stamp,
      // The case's allowed action classes bound the toolset: other tools are hidden, and a guessed call is denied.
      bindTools: ({ toolset }) => {
        if (toolset === null) return EMPTY_TOOL_SEAM;
        const outside = [...toolset.registry.visible(options.agentId).values()].filter((tool) => !allowed.has(tool.actionClass) && tool.name !== RUN_CODE_TOOL);
        toolset.registry.restrict({ deny: new Set(outside.map((tool) => tool.name)) });
        toolset.registry.guard(CASE_SCOPE_GUARD, (execution) => allowed.has(execution.actionClass) ? undefined
          : `experiment case ${view.caseId} allows only ${[...allowed].join(", ")}; ${execution.actionClass} is outside its scope`);
        if (options.extraGuard !== undefined) toolset.registry.guard(options.extraGuard.label, options.extraGuard.guard);
        return toolset.seam;
      }
    });
    options.onSession?.(session.sessionId);
    const cancel = (): void => { session.cancel({ kind: "hook", reason: "experiment trial aborted" }, "experiment-executor"); };
    signal.addEventListener("abort", cancel, { once: true });
    let outcome: { ok: true } | { ok: false; reason: string };
    try {
      outcome = signal.aborted ? { ok: false, reason: "trial aborted before its prompt" } : outcomeOf(await session.prompt(options.verbatimPrompt ? view.prompt : taskText(view)));
    } catch (error) {
      outcome = { ok: false, reason: `trial crashed: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      signal.removeEventListener("abort", cancel);
    }
    try {
      await session.close();
    } catch (error) {
      // An execution whose session cannot seal has incomplete evidence: never a completed trial.
      return { ok: false, reason: `trial session did not seal: ${error instanceof Error ? error.message : String(error)}${outcome.ok ? "" : `; ${outcome.reason}`}` };
    }
    return outcome;
  };
}

/** The trial provider an operator names on `amc experiment run --execute-trials` or the Studio run route. */
export interface TrialProviderSelection {
  readonly providerId: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly maxTokens?: number;
  readonly maxSteps?: number;
  readonly leaseToken?: string;
}

/** A native trial runner on one configured provider route, with the workspace's own credentials; and its executor identity. */
export function providerTrialRunner(workspace: string, agentId: string, selection: TrialProviderSelection,
  extra: Pick<NativeTrialRunnerOptions, "verbatimPrompt" | "extraGuard" | "onSession" | "tools"> = {}): { runTrial: TrialRunner; executorIdentity: string } {
  const route = nativeRouteFor(selection.providerId, { ...(selection.baseUrl === undefined ? {} : { baseUrl: selection.baseUrl }),
    ...(selection.credential === undefined ? {} : { credential: selection.credential }) }, selection.model);
  const registry = new AdapterRegistry();
  registry.register(route);
  const credentials = new LocalCredentialsService({ projectDir: workspace, watch: false });
  const transport = route.providerId === STUB_PROVIDER_ID ? stubProviderTransport({}) : undefined;
  const model = route.models?.[0] ?? "";
  return {
    executorIdentity: `native:${route.providerId}/${model}`,
    runTrial: nativeTrialRunner({ workspace, agentId, harnessVersion: amcVersion,
      makeLlm: (session) => new LlmRuntime({ session, credentials, registry, ...(transport === undefined ? {} : { transport }) }),
      route: { providerId: route.providerId, model, params: paramsFor(route.providerId, selection.maxTokens ?? 1024) },
      ...(selection.maxSteps === undefined ? {} : { maxSteps: selection.maxSteps }),
      ...(selection.leaseToken === undefined ? {} : { leaseToken: selection.leaseToken }), ...extra })
  };
}
