import { openAgentSession, type AgentPromptResult } from "../agent/agentSession.js";
import { stubProviderTransport, STUB_PROVIDER_ID } from "../agent/stubProvider.js";
import { nativeRouteFor, paramsFor } from "../cli-agent-options.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { AdapterRegistry } from "../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../llm/adapter/llmRuntime.js";
import { amcVersion } from "../version.js";
import type { LoopLlm, LoopRoute } from "../agent/stepRunner.js";
import type { SessionService } from "../session/sessionService.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ExecutorCaseView, TrialRunner } from "./trialExecutor.js";

export interface NativeTrialRunnerOptions {
  readonly workspace: string;
  readonly agentId: string;
  readonly makeLlm: (session: SessionService) => LoopLlm;
  readonly route: LoopRoute;
  readonly harnessVersion: string;
  /** Governed workspace tools through the native ToolPipeline, or none. An unconfined shell is never offered here. */
  readonly tools?: "none" | "workspace";
  readonly maxSteps?: number;
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
      rowStamp: stamp
    });
    const cancel = (): void => { session.cancel({ kind: "hook", reason: "experiment trial aborted" }, "experiment-executor"); };
    signal.addEventListener("abort", cancel, { once: true });
    let outcome: { ok: true } | { ok: false; reason: string };
    try {
      outcome = signal.aborted ? { ok: false, reason: "trial aborted before its prompt" } : outcomeOf(await session.prompt(taskText(view)));
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
}

/** A native trial runner on one configured provider route, with the workspace's own credentials; and its executor identity. */
export function providerTrialRunner(workspace: string, agentId: string, selection: TrialProviderSelection): { runTrial: TrialRunner; executorIdentity: string } {
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
      ...(selection.maxSteps === undefined ? {} : { maxSteps: selection.maxSteps }) })
  };
}
