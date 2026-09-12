import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Command } from "commander";
import { assertScheduleOwner, manageSchedule, scheduleStatus } from "./autonomy/scheduleStore.js";
import { assertNativeScheduleAdmission, startNativeScheduleService } from "./autonomy/scheduleService.js";
import { approvalGateFor, integerOption, paramsFor, routeFor, type AgentLoopCliIo, type RunOptions } from "./cli-agent-options.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderTransport } from "./agent/stubProvider.js";
import { nativeApprovalInstructions } from "./setup/nativeApprovalInstructions.js";
import { loadVerifiedToolsConfigSnapshot } from "./toolhub/toolhubValidators.js";

const defaultIo: AgentLoopCliIo = {
  log: line => console.log(line), error: line => console.error(line), fail: () => { process.exitCode = 1; }
};
interface ScheduleCliDependencies {
  workspace?: () => string;
  now?: () => number;
  loadRuntime?: () => Promise<Pick<typeof import("./kernel/agentLoopRunner.js"), "runComposedTurn">>;
}
interface ExecuteOptions extends RunOptions {
  agent: string;
  provider: string;
  expectDigest: string;
  expectToolsDigest: string;
  pollMs?: string;
}

function definition(path: string) {
  if (!statSync(path).isFile() || statSync(path).size > 131_072) throw new Error("A schedule definition must be a JSON file no larger than 131072 bytes.");
  const bytes = readFileSync(path);
  if (bytes.length > 131_072) throw new Error("Schedule definition grew past its byte limit.");
  return { inputSha256: createHash("sha256").update(bytes).digest("hex"), schedule: JSON.parse(bytes.toString("utf8")) as unknown };
}

/** Register only. No timer, config write, signature, runtime import or job on import/registration. */
export function registerNativeScheduleCommands(program: Command, io: AgentLoopCliIo = defaultIo, dependencies: ScheduleCliDependencies = {}): void {
  const workspace = dependencies.workspace ?? (() => process.cwd());
  const now = dependencies.now ?? Date.now;
  const loadRuntime = dependencies.loadRuntime ?? (() => import("./kernel/agentLoopRunner.js"));
  const report = (value: unknown) => io.log(JSON.stringify(value, null, 2));
  const failed = (error: unknown) => {
    io.error(error instanceof Error ? error.message : "Native schedule operation failed; no successful closure is claimed.");
    io.fail();
  };
  const group = program.command("native-schedule")
    .description("Manage signed native goals and explicitly own one due pass or a foreground polling lifecycle");
  group.command("list").description("Read signed configuration, its digest and operational due/in-flight status without running jobs")
    .action(() => {
      try {
        const status = scheduleStatus(workspace(), now());
        const tools = loadVerifiedToolsConfigSnapshot(workspace());
        report({ ...status, toolsPolicy: { digestSha256: tools.digestSha256,
          signatureValid: tools.signatureValid, schemaValid: tools.config !== null, reason: tools.reason } });
      } catch (error) { failed(error); }
    });
  group.command("inspect-file <file>").description("Preview an operator JSON definition and hash its exact bytes; does not sign or activate it")
    .action((file: string) => { try { report(definition(file)); } catch (error) { failed(error); } });
  group.command("put <file>").description("Add or replace one reviewed definition using the existing workspace signer; does not start a runner")
    .requiredOption("--expect-input-sha256 <digest>", "exact JSON bytes reviewed through inspect-file")
    .requiredOption("--expect-digest <digest>", "current signed config digest from list, or absent for a new configuration")
    .action((file: string, opts: { expectInputSha256: string; expectDigest: string }) => {
      try {
        assertScheduleOwner(workspace());
        const input = definition(file);
        if (input.inputSha256 !== opts.expectInputSha256) throw new Error("Schedule definition changed; inspect-file again before signing.");
        manageSchedule(workspace(), opts.expectDigest, { kind: "put", schedule: input.schedule });
        report(scheduleStatus(workspace(), now()));
      } catch (error) { failed(error); }
    });
  for (const kind of ["enable", "disable", "remove", "reset-failures"] as const) {
    group.command(`${kind} <id>`)
      .description(kind === "disable" ? "Prevent future claims; does not pretend to cancel an already running owner" : `Explicitly ${kind} a schedule without discarding its cadence or claim history`)
      .requiredOption("--expect-digest <digest>", "current signed schedule configuration digest from list")
      .action((id: string, opts: { expectDigest: string }) => {
        try { manageSchedule(workspace(), opts.expectDigest, { kind, id }); report(scheduleStatus(workspace(), now())); }
        catch (error) { failed(error); }
      });
  }
  for (const commandName of ["run-due", "watch"] as const) {
    const command = group.command(commandName)
      .description(commandName === "watch" ? "Own foreground serial due passes until Ctrl-C/SIGTERM; never daemonizes or installs OS tasks" : "Execute the currently due signed goals once through the native composed runtime")
      .requiredOption("--agent <id>", "root identity whose signed policy, budgets and evidence govern every scheduled child")
      .requiredOption("--provider <id>", "explicit native provider, or stub for a local recording demonstration")
      .option("--model <model>", "required for a real provider")
      .option("--base-url <origin>", "explicit provider origin")
      .option("--credential <ref>", "credential reference only, never a key value")
      .option("--credentials-home <dir>", "existing credential home")
      .option("--credentials-file <path>", "existing credential file")
      .requiredOption("--expect-digest <digest>", "exact reviewed signed schedule config digest")
      .requiredOption("--expect-tools-digest <digest>", "exact reviewed signed tools policy digest")
      .requiredOption("--approve-tools <actionClass>", "signed approval class; all enabled schedule scopes must match it")
      .option("--approve-risk <tier>", "signed approval risk tier, default high")
      .option("--max-tokens <n>", "positive per-request output ceiling", "1024")
      .option("--thinking <mode>", "DeepSeek only: enabled (default) or disabled")
      .option("--reasoning-effort <effort>", "DeepSeek only: exact low, high (default), or max with enabled thinking")
      .option("--max-steps <n>", "positive native model steps per round", "8");
    if (commandName === "watch") command.option("--poll-ms <ms>", "delay after a pass settles, never an overlapping interval", "30000");
    command.action(async (opts: ExecuteOptions) => {
      const controller = new AbortController();
      const cancel = () => {
        if (!controller.signal.aborted) io.error("Cancelling the owned schedule lifecycle; waiting for the active native work and its claim to close.");
        controller.abort();
      };
      let service: ReturnType<typeof startNativeScheduleService> | undefined;
      try {
        const root = workspace();
        assertScheduleOwner(root);
        if (opts.agent.trim().length === 0) throw new Error("--agent must identify the governing root agent.");
        const gate = approvalGateFor(io, opts);
        if (gate == null) return;
        const route = routeFor(io, opts.provider, opts, opts.model);
        if (route === null) return;
        const maxTokens = integerOption(io, "--max-tokens", opts.maxTokens, 1024);
        const maxSteps = integerOption(io, "--max-steps", opts.maxSteps, 8);
        const pollMs = integerOption(io, "--poll-ms", opts.pollMs, 30000);
        if (maxTokens === null || maxSteps === null || pollMs === null) return;
        if (maxTokens < 1 || maxSteps < 1) throw new Error("Scheduled rounds require positive --max-tokens and --max-steps.");
        const requestParams = paramsFor(opts.provider, maxTokens, opts);
        const admission = { workspace: root, expectedSchedulesDigest: opts.expectDigest,
          expectedToolsDigest: opts.expectToolsDigest, approvalClass: gate.actionClass };
        assertNativeScheduleAdmission(admission);
        process.on("SIGINT", cancel);
        process.on("SIGTERM", cancel);
        const runPass = async (signal: AbortSignal) => {
          if (signal.aborted) return { sessionId: null, scheduleResults: [], cancelled: true };
          assertNativeScheduleAdmission(admission);
          const instant = now();
          const status = scheduleStatus(root, instant);
          if (!status.schedules.some(schedule => schedule.due)) return { sessionId: null, scheduleResults: [], cancelled: false };
          const runtime = await loadRuntime();
          if (signal.aborted) return { sessionId: null, scheduleResults: [], cancelled: true };
          const outcome = await runtime.runComposedTurn({ workspace: root, agentId: opts.agent, prompt: "",
            route: { providerId: opts.provider, model: route.models?.[0] ?? STUB_PROVIDER_MODEL, params: requestParams },
            routes: [route], ...(opts.provider === STUB_PROVIDER_ID ? { transport: stubProviderTransport({}) } : {}),
            config: { maxStepsPerTurn: maxSteps },
            approvalGate: { actionClass: gate.actionClass, riskTier: gate.riskTier,
              onRaised: event => io.error(nativeApprovalInstructions({ workspace: root, agentId: opts.agent,
                approvalId: event.approvalId, approvalRequestId: event.approvalRequestId }).text) },
            credentials: { watch: false,
              ...(opts.credentialsHome === undefined ? {} : { homeDir: opts.credentialsHome }),
              ...(opts.credentialsFile === undefined ? {} : { path: opts.credentialsFile }) },
            schedulePass: { now: instant, expectedSchedulesDigest: opts.expectDigest,
              expectedToolsDigest: opts.expectToolsDigest, signal }
          });
          if (outcome.scheduleResults === undefined) throw new Error("The native runtime returned no schedule result; schedule execution is unconfirmed.");
          return { sessionId: outcome.sessionId, scheduleResults: outcome.scheduleResults, cancelled: signal.aborted };
        };
        const onResult = (result: Awaited<ReturnType<typeof runPass>>) => {
          report({ ...result, boundary: "Mechanical due-run outcomes. Read the named session's signed evidence separately; no goal-quality or independent verification claim." });
          if (result.scheduleResults.some(item => !item.ok)) io.fail();
        };
        if (commandName === "run-due") onResult(await runPass(controller.signal));
        else {
          service = startNativeScheduleService({ pollMs, runPass, onResult, signal: controller.signal });
          await service.closed;
        }
      } catch (error) { failed(error); }
      finally {
        controller.abort();
        try { await service?.stop(); } catch { /* already reported from service.closed */ }
        process.removeListener("SIGINT", cancel);
        process.removeListener("SIGTERM", cancel);
      }
    });
  }
}
