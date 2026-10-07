import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { renderNativeRunUsage } from "../agent/nativeRunUsage.js";
import { renderNativeRunDiagnostics } from "../agent/nativeFailureGuidance.js";
import { parseNativeChatResult, type NativeChatChildSummary } from "./nativeChatResult.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants, NativeMcpConfigError } from "./nativeMcpConfig.js";
import { inspectNativeFirstUse, renderNativeFirstUseGuide, renderNativeGuideCommand } from "./nativeFirstUseGuide.js";
import { resolveNativeChatProfile, nativeChatProfileArgv, assertNativeChatProfileCurrent, type NativeChatProfileOptions } from "./nativeChatProfile.js";
import { createNativeInteractiveApprovals } from "./nativeInteractiveApprovals.js";
import { loadNativeExtensions, nativeExtensionRunArgv, type NativeExtensionManager } from "../extensions/nativeExtensionRuntime.js";
import { prepareSkillTurn, workspaceSkillRoots } from "../skills/skillTurn.js";
import { buildSkillCatalog } from "../skills/skillCatalog.js";
import { resolveNativeValidationSelection } from "./nativeValidationConfig.js";
import { deepseekParams } from "../llm/providers/deepseekContract.js";

export interface NativeChatOptions extends NativeChatProfileOptions {
  readonly validationConfig?: string;
  readonly validationConfigSha256?: string;
  readonly validate?: readonly string[];
  readonly extension?: readonly string[];
  readonly extensionPin?: readonly string[];
  readonly mcpConfig?: string;
  readonly mcpConfigSha256?: string;
  readonly approveTools?: string;
  readonly approveRisk?: string;
  readonly tools?: string;
  readonly unsafeUnconfinedShell?: boolean;
  readonly maxTokens?: string;
  readonly thinking?: string;
  readonly reasoningEffort?: string;
  readonly maxSteps?: string;
  readonly contextWindow?: string;
  readonly compactThreshold?: string;
  readonly autoSummary?: boolean;
  readonly session?: string;
  readonly forkFrom?: string;
}
export interface NativeChatIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly fail: () => void;
}

/** Interactive input only; every turn runs through the existing CLI boundary. */
export async function runNativeInteractiveSession(options: NativeChatOptions, io: NativeChatIo): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    io.error("Interactive chat requires a terminal. Use amc agent-loop guide --json for setup or agent-loop run for a scripted turn.");
    io.fail();
    return;
  }
  if (options.session !== undefined && options.forkFrom !== undefined) {
    io.error("Choose --session or --fork-from, not both."); io.fail(); return;
  }
  let profile: ReturnType<typeof resolveNativeChatProfile>;
  let validation: ReturnType<typeof resolveNativeValidationSelection>;
  try {
    profile = resolveNativeChatProfile(options);
    options = { ...options, ...profile.effectiveOptions };
    validation = resolveNativeValidationSelection(options);
  } catch (error) {
    io.error(error instanceof Error ? error.message : "Native chat composition could not be resolved."); io.fail(); return;
  }
  const entry = process.argv[1];
  if (entry === undefined) { io.error("The AMC CLI entrypoint is unavailable."); io.fail(); return; }
  const cwd = resolve(options.workspace);
  let selectedAgentId: string | null = null;
  const skillNames = () => {
    const catalog = buildSkillCatalog(workspaceSkillRoots(cwd, options.credentialsHome));
    return new Set([...catalog.skills, ...catalog.problems].map(skill => skill.name));
  };
  let extensions: NativeExtensionManager;
  try {
    extensions = loadNativeExtensions({ workspace: cwd, manifestPaths: options.extension, expectedDigests: options.extensionPin,
      reservedCommands: [...skillNames()] });
  } catch (error) {
    io.error(error instanceof Error ? error.message : "Native extensions could not be loaded."); io.fail(); return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let closed = false;
  let child: ChildProcess | null = null;
  let cancelActiveCommand: (() => void) | null = null;
  let pendingAnswer: ((answer: string | null) => void) | null = null;
  const question = (prompt: string, signal?: AbortSignal): Promise<string | null> => {
    if (closed || signal?.aborted || pendingAnswer !== null) return Promise.resolve(null);
    return new Promise(resolveAnswer => {
      const controller = new AbortController();
      let settled = false;
      const finish = (answer: string | null) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", aborted);
        if (pendingAnswer === finish) pendingAnswer = null;
        controller.abort();
        resolveAnswer(answer);
      };
      const aborted = () => finish(null);
      pendingAnswer = finish;
      signal?.addEventListener("abort", aborted, { once: true });
      try { terminal.question(prompt, { signal: controller.signal }, finish); }
      catch { finish(null); }
    });
  };
  const cancel = () => {
    if (cancelActiveCommand !== null) cancelActiveCommand();
    else terminal.close();
  };
  terminal.on("SIGINT", cancel);
  terminal.on("close", () => {
    closed = true;
    pendingAnswer?.(null); pendingAnswer = null;
    cancelActiveCommand?.();
  });
  process.on("SIGINT", cancel);

  // The child sees exactly the same installed/source CLI, environment and cwd.
  // No shell, alternate runner, approval bypass, or background session writer.
  const execute = (args: readonly string[], display: { interactiveApprovals?: boolean; stream?: boolean } = {}): Promise<{ code: number | null; stdout: string; truncated: boolean; cancelRequested: boolean }> => new Promise(resolveResult => {
    let stdout = "";
    let truncated = false;
    let cancelRequested = false;
    let previewOpen = false;
    const interactiveApprovals = display.interactiveApprovals === true;
    let running: ChildProcess;
    try {
      running = spawn(process.execPath, [...process.execArgv, resolve(entry), ...(selectedAgentId === null ? [] : ["--agent", selectedAgentId]), ...args], {
        cwd, env: process.env, shell: false,
        stdio: interactiveApprovals ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"]
      });
    } catch { io.error("Could not start the AMC command."); resolveResult({ code: 1, stdout, truncated, cancelRequested }); return; }
    child = running;
    const approvals = interactiveApprovals ? createNativeInteractiveApprovals({
      child: running, workspace: cwd, entry, agentId: selectedAgentId ?? "default", question, log: io.log, error: io.error
    }) : null;
    const requestCancel = () => {
      if (cancelRequested) return;
      cancelRequested = true;
      io.error("Cancelling the active command; waiting for its recorded outcome… Approval input is stopped; any already-recorded decision is not revoked.");
      // Abort the reviewer question synchronously, rather than waiting for close.
      // Do not force-kill the writer or automatically resubmit this task.
      pendingAnswer?.(null);
      if (approvals !== null) approvals.cancel();
      else running.kill("SIGINT");
    };
    cancelActiveCommand = requestCancel;
    running.stdout!.setEncoding("utf8");
    running.stderr!.setEncoding("utf8");
    running.stdout!.on("data", (text: string) => {
      if (truncated) return;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(text) > 8 * 1024 * 1024) {
        truncated = true; requestCancel(); return;
      }
      stdout += text;
    });
    running.stderr!.on("data", (text: string) => {
      if (display.stream) { process.stderr.write(text); previewOpen = !text.endsWith("\n"); }
      else io.error(text.trimEnd());
    });
    running.once("error", () => { io.error("Could not start the AMC command."); });
    running.once("close", code => {
      void (async () => {
        let finalCode = code;
        try { await approvals?.close(); }
        catch { io.error("Native approval cleanup did not complete cleanly; inspect the recorded request before continuing."); finalCode = 1; }
        finally {
          if (previewOpen) process.stderr.write("\n");
          if (child === running) child = null;
          if (cancelActiveCommand === requestCancel) cancelActiveCommand = null;
          resolveResult({ code: finalCode, stdout, truncated, cancelRequested });
        }
      })();
    });
  });

  let sessionId = options.session ?? null;
  let forkFrom = options.forkFrom ?? null;
  let previousSummary: NativeChatChildSummary | null = null;
  let unresolvedOutcome = false;
  try {
    let provider = options.provider;
    if (provider === undefined) {
      io.log("Choose openai (Chat Completions), openai-responses, anthropic, deepseek, gemini, gemini-audio, or ollama (local model server) for a real model task; choose stub for a local recording demonstration.");
      const choice = await question("Provider (no default): ");
      if (choice === null) return;
      provider = choice.trim();
    }
    let model = options.model;
    if (provider !== "stub" && !model?.trim()) {
      const choice = await question("Model ID you can access (no default): ");
      if (choice === null) return;
      model = choice.trim();
    }
    const guide = await inspectNativeFirstUse({ ...options, provider, model });
    if (guide.status !== "ready" || guide.nextAction === null) {
      io.log(renderNativeFirstUseGuide(guide));
      io.fail();
      return;
    }
    selectedAgentId = guide.agentId;
    const tools = options.tools ?? (provider === "stub" ? "echo" : "none");
    if (!["none", "echo", "workspace"].includes(tools)) {
      io.error("Choose --tools none, echo, or workspace."); io.fail(); return;
    }
    const maxTokens = options.maxTokens ?? "512";
    const maxSteps = options.maxSteps ?? (provider === "stub" ? "2" : "8");
    if (![maxTokens, maxSteps].every(value => /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)))) {
      io.error("--max-tokens and --max-steps must be positive integers."); io.fail(); return;
    }
    try {
      if (provider === "deepseek") {
        deepseekParams({ max_tokens: Number(maxTokens),
          ...(options.thinking === undefined ? {} : { thinking: { type: options.thinking } }),
          ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }) });
        if (tools === "none" && options.thinking !== "disabled") {
          throw new Error("Tools-free DeepSeek chat requires --thinking disabled from its first turn. Signed reasoning is never discarded; select tools explicitly for thinking replay.");
        }
      } else if (options.thinking !== undefined || options.reasoningEffort !== undefined) {
        throw new Error("--thinking and --reasoning-effort require --provider deepseek; unused options are not ignored.");
      }
    } catch (error) { io.error(error instanceof Error ? error.message : "Invalid thinking options."); io.fail(); return; }
    const approvalClass = options.approveTools?.trim().toUpperCase();
    const approvalRisk = (options.approveRisk ?? "high").trim().toLowerCase();
    if ((approvalClass !== undefined && !isActionClass(approvalClass)) ||
        !["low", "medium", "high", "critical"].includes(approvalRisk) ||
        (options.approveRisk !== undefined && approvalClass === undefined)) {
      io.error("Choose a valid --approve-tools action class and --approve-risk low, medium, high, or critical."); io.fail(); return;
    }
    if (options.mcpConfigSha256 !== undefined && options.mcpConfig === undefined) {
      io.error("--mcp-config-sha256 requires --mcp-config."); io.fail(); return;
    }
    let mcpArgs: string[] = [];
    if (options.mcpConfig !== undefined) {
      if (options.tools !== "workspace" || approvalClass === undefined || !isActionClass(approvalClass)) {
        io.error("MCP chat requires explicit --tools workspace and --approve-tools. Catalog discovery and grant review are separate explicit steps."); io.fail(); return;
      }
      try {
        const loaded = loadNativeMcpConfiguration(options.mcpConfig, options.mcpConfigSha256);
        requireReviewedNativeMcpGrants(loaded, cwd, approvalClass);
        mcpArgs = ["--mcp-config", loaded.path, "--mcp-config-sha256", loaded.sha256];
      } catch (error) {
        io.error(error instanceof NativeMcpConfigError ? error.message : "MCP chat preflight refused before server startup."); io.fail(); return;
      }
    }
    const credentialFile = guide.nextAction.argv[guide.nextAction.argv.indexOf("--credentials-file") + 1]!;
    // The file pin preserves credential lookup, not the independently selected
    // shared skill root. Keep both on every child and on the printed resume.
    const routeBaseArgs = ["--agent", guide.agentId, "--provider", provider!, ...(guide.baseUrl === null ? [] : ["--base-url", guide.baseUrl]), "--model", guide.model!,
      ...(options.credentialsHome === undefined ? [] : ["--credentials-home", options.credentialsHome]), "--credentials-file", credentialFile,
      ...(guide.credential === null ? [] : ["--credential", guide.credential.ref]),
      "--tools", tools, "--max-steps", maxSteps, "--max-tokens", maxTokens, ...(options.unsafeUnconfinedShell === true ? ["--unsafe-unconfined-shell"] : []),
      ...(options.thinking === undefined ? [] : ["--thinking", options.thinking]),
      ...(options.reasoningEffort === undefined ? [] : ["--reasoning-effort", options.reasoningEffort]),
      // Each turn's child run validates these; they are forwarded verbatim, never defaulted here.
      ...(options.contextWindow === undefined ? [] : ["--context-window", options.contextWindow]),
      ...(options.compactThreshold === undefined ? [] : ["--compact-threshold", options.compactThreshold]),
      ...(options.autoSummary === false ? ["--no-auto-summary"] : []),
      ...(approvalClass === undefined ? [] : ["--approve-tools", approvalClass, "--approve-risk", approvalRisk]), ...mcpArgs,
      ...(validation === undefined ? [] : ["--validation-config", resolve(options.validationConfig!), "--validation-config-sha256", validation.configSha256,
        ...validation.checks.flatMap(check => ["--validate", check.id])])];
    const routeArgs = [...routeBaseArgs, ...nativeChatProfileArgv(profile)];
    const showScope = () => {
      io.log(`Native chat · agent ${guide.agentId} · provider ${provider} · model ${guide.model}`);
      if (guide.baseUrl !== null) io.log(`Provider origin: ${guide.baseUrl}`);
      if (guide.credential !== null) io.log(`Credential reference: ${guide.credential.ref}; local source ${guide.credential.source ?? "unavailable"}. This setup snapshot is not remote authentication proof.`);
      if (profile.presetId !== null) io.log(`Signed native preset: ${profile.presetId}; changes require a new reviewed chat.`);
      if (options.delegate) io.log("Native in-process delegation enabled under the signed tool grant, configured scope and depth bound.");
      io.log(provider === "stub" ? "Local demonstration: canned replies, no real model answer." : "Real provider: requests may incur charges; local setup does not prove authentication or model access.");
      io.log(tools === "workspace"
        ? "Workspace tools enabled explicitly. The existing signed allowlist and governor still control access; no approval or policy bypass is added."
        : tools === "echo" ? "Echo demonstration tool only; no workspace editing tool is offered."
          : "No tools offered; model replies cannot edit workspace files through this session.");
      if (approvalClass !== undefined) io.log(`Tool approval gate: ${approvalClass}, risk ${approvalRisk}. This terminal asks you to review actual queued requests using an existing authenticated reviewer session; quorum still applies.`);
      if (mcpArgs.length > 0) io.log("MCP tools use the reviewed catalog and pinned config. Each turn starts and disposes its own configured server; changed catalogs or config refuse the run.");
      if (extensions.list().length > 0) io.log(`Signed native extensions: ${extensions.list().map(item => item.id).join(", ")}. /extensions lists their commands and reviewed digests.`);
      if (validation) io.log(`Public task checks: ${validation.checks.map(check => check.title).join(", ")}. Existing shell permissions and approvals still apply.`);
      io.log(`Every turn writes AMC session evidence. Limit: ${maxSteps} model steps per turn, ${maxTokens} output tokens per request.`);
      io.log(`Session: ${sessionId ?? "created on first task"}${forkFrom === null ? "" : `; next task forks ${forkFrom}`}`);
    };
    showScope();
    if (forkFrom !== null) io.log("The fork starts a new conversation with verified parent lineage; it does not copy the parent conversation.");
    io.log("Type a task. /inspect shows the session, /verify checks evidence, /compact summarizes a reviewed range, /fork queues a child (/fork cancel clears the queue), /extensions manages signed text and commands, /exit leaves. Ctrl-C cancels an active command or exits at the prompt.");
    if (options.session !== undefined) io.log("The first reply also displays prior recorded assistant text from the resumed session.");
    while (!closed) {
      const entered = await question("you> ");
      if (entered === null) break;
      const text = entered.trim();
      if (text.length === 0) continue;
      if (text === "/exit") break;
      if (text === "/help") { showScope(); io.log("/inspect · /verify · /compact · /fork · /fork cancel · /extensions · /load · /unload · /exit. Built-in commands prompt for their inputs. Loaded extension commands accept text arguments."); continue; }
      if (text === "/extensions") {
        try { io.log(JSON.stringify({ loaded: extensions.inspect(), commands: extensions.listCommands() }, null, 2)); }
        catch (error) { io.error(error instanceof Error ? error.message : "An extension no longer verifies."); }
        continue;
      }
      if (text === "/load") {
        const path = await question("Already signed extension manifest path (blank cancels): ");
        if (!path?.trim()) continue;
        try {
          const loaded = extensions.load(resolve(cwd, path.trim()));
          io.log(`Loaded ${loaded.id}; pinned manifest ${loaded.manifestDigest}. Its context and commands apply to the next turn.`);
        } catch (error) { io.error(error instanceof Error ? error.message : "Extension load refused."); }
        continue;
      }
      if (text === "/unload") {
        const id = await question("Loaded extension ID to unload (blank cancels): ");
        if (!id?.trim()) continue;
        io.log(extensions.unload(id.trim()) ? "Extension unloaded for future turns. Existing conversation and evidence remain." : "No loaded extension has that ID.");
        continue;
      }
      if (text === "/compact") {
        if (sessionId === null || forkFrom !== null) { io.error("Run a task in the current session before compacting it."); continue; }
        const listed = await execute(["session", "compact", sessionId, "--list", "--json"]);
        let head: string;
        try {
          const plan = JSON.parse(listed.stdout) as { ok?: boolean; headEventHash?: string; entries?: unknown[] };
          if (listed.code !== 0 || listed.truncated || plan.ok !== true || typeof plan.headEventHash !== "string" || !Array.isArray(plan.entries)) throw new Error("Invalid compaction listing");
          head = plan.headEventHash;
          io.log(JSON.stringify(plan.entries, null, 2));
        } catch { io.error("Could not read a valid compaction plan. The session was not changed."); continue; }
        const origins = await question("Ordered origin event IDs to summarize (comma separated; blank cancels): ");
        if (!origins?.trim()) continue;
        const summary = await question("UTF-8 summary file path (blank cancels): ");
        if (!summary?.trim()) continue;
        const reason = await question("Reason for this compaction (blank cancels): ");
        if (!reason?.trim()) continue;
        const compacted = await execute(["session", "compact", sessionId, "--origins", origins.trim(),
          "--summary-file", resolve(cwd, summary.trim()), "--reason", reason.trim(), "--expect-head", head, "--json"]);
        if (compacted.stdout.trim()) io.log(compacted.stdout.trimEnd());
        if (compacted.code !== 0 || compacted.truncated) io.error("Compaction refused or did not return a complete receipt. Inspect the session before continuing.");
        else io.log("Compaction recorded; original evidence is retained. /verify checks reconstruction separately.");
        continue;
      }
      if (text === "/fork cancel") {
        if (forkFrom === null) io.log("No fork is queued.");
        else {
          forkFrom = null;
          io.log(sessionId === null ? "Queued fork cleared. The next task starts a new independent session; no existing history was changed."
            : `Queued fork cleared. The next task resumes ${sessionId}; no existing history was changed.`);
        }
        continue;
      }
      if (text === "/fork") {
        if (sessionId === null) io.error("Run a task or resume a session before forking.");
        else { forkFrom = sessionId; io.log(`Fork queued from ${sessionId}. Your next task creates a new conversation with verified parent lineage; prior conversation is not copied. No child has been created yet.`); }
        continue;
      }
      if (text === "/inspect" || text === "/verify") {
        const target = sessionId ?? forkFrom;
        if (target === null) { io.error("There is no recorded session yet."); continue; }
        const report = await execute(text === "/inspect" ? ["session", "show", "--", target] : ["agent-loop", "verify", "--", target]);
        if (report.stdout.trim()) io.log(report.stdout.trimEnd());
        // /verify runs agent-loop verify with the operator's trust (AMC home trust list, AMC_EXPECTED_MONITOR_FINGERPRINT);
        // a refusal there includes an unpinned monitor key, so say "not verified", not that the command broke (P0-51).
        if (report.code !== 0 || report.truncated) {
          io.error(text === "/verify" && !report.truncated
            ? "Not verified: the report above is failed or untrusted. No verified result is claimed."
            : "The inspection command failed or its output exceeded the display limit.");
          io.fail();
        }
        continue;
      }
      let prompt = entered;
      try {
        assertNativeChatProfileCurrent(profile);
        const extensionTurn = extensions.prepareTurn();
        const skills = skillNames();
        if (extensionTurn.commands.some(command => skills.has(command.name))) {
          io.error("An extension command now conflicts with an installed skill. Unload the conflicting extension before continuing."); continue;
        }
        if (text.startsWith("/")) {
          const expanded = extensions.expandCommand(text);
          if (expanded === null) {
            const skill = prepareSkillTurn({ workspace: cwd, prompt: text, amcHome: options.credentialsHome });
            if (!skill.ok) { io.error(skill.reason); continue; }
            // Preserve the slash command: the child resolves and records its own
            // skill context alongside workspace instructions and extensions.
          } else {
            prompt = expanded.prompt;
            io.log(`Using signed command ${expanded.extensionId}/${expanded.command}; manifest ${expanded.manifestDigest}.`);
          }
        }
      } catch (error) { io.error(error instanceof Error ? error.message : "The selected native composition changed."); io.fail(); continue; }
      io.log(`Running ${provider}/${guide.model}; Ctrl-C requests cancellation.`);
      io.log("Live output is provisional until the recorded reply below; a preview is not proof of completion.");
      const priorSession = sessionId;
      const pendingFork = forkFrom;
      const outcome = await execute(["agent-loop", "run", ...routeArgs, ...nativeExtensionRunArgv(extensions),
        ...(approvalClass === undefined ? [] : ["--interactive-approvals"]), "--keep-open", "--json", "--stream",
        ...(forkFrom !== null ? ["--fork-from", forkFrom] : sessionId === null ? [] : ["--session", sessionId]), "--", prompt],
        { interactiveApprovals: approvalClass !== undefined, stream: true });
      const result = parseNativeChatResult({ stdout: outcome.stdout, truncated: outcome.truncated,
        requestedSessionId: priorSession, forkFrom: pendingFork, previousSummary });
      if (!result.ok) {
        unresolvedOutcome = true;
        io.error(`${result.code}: ${result.message} Chat has stopped without guessing a session ID or retrying the task. Inspect AMC's session evidence before continuing.`);
        io.fail(); break;
      }
      const summary = result.summary;
      const previous = pendingFork === null && previousSummary?.sessionId === summary.sessionId ? previousSummary : null;
      const freshEndings = summary.endings.slice(previous?.endings.length ?? 0);
      sessionId = summary.sessionId;
      forkFrom = null;
      io.log("Recorded reply:");
      for (const block of summary.assistantText.slice(previous?.assistantText.length ?? 0)) io.log(block);
      previousSummary = summary;
      const ending = freshEndings.at(-1);
      io.log(`Session ${sessionId} · driver ${summary.driverStatus}${ending?.reason ? ` · recorded turn ending ${ending.reason}` : ""}. This summary is not an evidence-verification result.`);
      io.log(renderNativeRunUsage(summary.usage, { requestWindow: "latest" }));
      io.log(renderNativeRunDiagnostics(summary.diagnostics));
      io.log(`Public task validation: ${summary.validation?.status ?? "unavailable"}. Passing selected checks does not guarantee correctness.`);
      if (outcome.code !== 0 || outcome.truncated || summary.driverStatus === "failed") {
        io.error("The turn failed or was interrupted. No successful task completion is claimed; /inspect and /verify show what was recorded.");
        io.fail();
      } else if (outcome.cancelRequested || ending?.reason !== "complete") {
        io.log(`Task completion is not established: ${ending?.reason ?? "no recorded turn ending"}${outcome.cancelRequested ? "; cancellation was requested" : ""}. Driver idle only means it can accept another explicit task; no retry was sent.`);
      }
    }
    if (forkFrom !== null) {
      if (unresolvedOutcome) io.error("The attempted fork has no admitted child result. Do not repeat it blindly; inspect the parent's recorded lineage before choosing a continuation.");
      else {
        io.log("The fork remains queued, not created. To continue that selection in this workspace:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "chat", ...routeBaseArgs, ...nativeChatProfileArgv(profile, "chat"), ...nativeExtensionRunArgv(extensions), "--fork-from", forkFrom] }));
      }
    }
    if (sessionId !== null) {
      io.log(`Known session reference: ${sessionId}. A resume attempt will verify the evidence before acquiring its writer.`);
      io.log("Resume in this workspace:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "chat", ...routeBaseArgs, ...nativeChatProfileArgv(profile, "chat"), ...nativeExtensionRunArgv(extensions), "--session", sessionId] }));
      io.log("Verify recorded evidence:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "verify", sessionId] }));
    }
  } finally {
    extensions.unloadAll();
    process.removeListener("SIGINT", cancel);
    terminal.close();
  }
}
