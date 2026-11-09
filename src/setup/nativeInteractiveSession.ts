import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { admitWorkspaceTrust } from "../cli-agent-options.js";
import { TRUST_WORKSPACE_ENV } from "../security/workspaceTrust.js";
import { renderNativeRunUsage } from "../agent/nativeRunUsage.js";
import { renderNativeRunDiagnostics } from "../agent/nativeFailureGuidance.js";
import { parseNativeChatResult, type NativeChatChildSummary } from "./nativeChatResult.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { approvalModeGatedClasses, parseApprovalMode } from "../approvals/approvalModes.js";
import { reviewNativeMcpConfigurations, NativeMcpConfigError } from "./nativeMcpConfig.js";
import { mergeScopedMcpSelection } from "../mcp/mcpScopes.js";
import { inspectNativeFirstUse, NATIVE_FIRST_USE_PROVIDER_LIST, renderNativeFirstUseGuide, renderNativeGuideCommand } from "./nativeFirstUseGuide.js";
import { resolveNativeChatProfile, nativeChatProfileArgv, assertNativeChatProfileCurrent, type NativeChatProfileOptions } from "./nativeChatProfile.js";
import { createNativeInteractiveApprovals } from "./nativeInteractiveApprovals.js";
import { createNativeInteractiveAskUser } from "./nativeInteractiveAskUser.js";
import { renderSessionLists } from "../tools/builtin/todoTool.js";
import { loadNativeExtensions, nativeExtensionRunArgv, type NativeExtensionManager } from "../extensions/nativeExtensionRuntime.js";
import { prepareSkillTurn, workspaceSkillRoots } from "../skills/skillTurn.js";
import { buildSkillCatalog } from "../skills/skillCatalog.js";
import { resolveNativeValidationSelection } from "./nativeValidationConfig.js";
import { nativeRouteFor, paramsFor } from "../cli-agent-options.js";
import { NATIVE_INTERACTIVE_COMMANDS, nativeInteractiveCompleter } from "./nativeInteractiveCommands.js";
import { listNativeInteractiveSessions, renderNativeInteractiveSession, assertNativeInteractiveSelection, type NativeInteractiveSessionSummary } from "./nativeInteractiveNavigation.js";
import { createNativeInteractiveBookmark, listNativeInteractiveBookmarks, navigateNativeInteractiveBookmark } from "./nativeInteractiveBookmarks.js";
import { runNativeInteractiveCommand } from "./nativeInteractiveCommandAudit.js";
import { createNativeInteractiveMcpView } from "./nativeInteractiveMcp.js";
import { renderNativeInteractiveToolResults } from "./nativeInteractiveResults.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { listNativeQueuedSubmissions, withdrawNativeQueuedSubmission } from "./nativeInteractiveWithdraw.js";

export interface NativeChatOptions extends NativeChatProfileOptions {
  readonly validationConfig?: string;
  readonly validationConfigSha256?: string;
  readonly validationRepair?: string;
  readonly validate?: readonly string[];
  readonly extension?: readonly string[];
  readonly extensionPin?: readonly string[];
  /** One reviewed config per server; each grant keeps its signed action class. */
  readonly mcpConfig?: readonly string[];
  readonly mcpConfigSha256?: readonly string[];
  /** Scoped server ids (SH-EXT-02), resolved to paths and pins before the review. */
  readonly mcp?: readonly string[];
  readonly approveTools?: string;
  readonly approveRisk?: string;
  /** SH-SANDBOX-04: forwarded verbatim to every turn's child run, which validates and composes it. */
  readonly approvalMode?: string;
  readonly tools?: string;
  readonly unsafeUnconfinedShell?: boolean;
  readonly trustWorkspace?: boolean;
  readonly webSearchSearxng?: string;
  readonly maxTokens?: string;
  readonly thinking?: string;
  readonly reasoningEffort?: string;
  readonly thinkingBudget?: string;
  readonly cacheRetention?: string;
  readonly maxRetries?: string;
  readonly retryMaxDelay?: string;
  readonly retryMaxProviderDelay?: string;
  readonly maxSteps?: string;
  readonly contextWindow?: string;
  readonly compactThreshold?: string;
  readonly autoSummary?: boolean;
  readonly autoCompact?: boolean;
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
  const trust = admitWorkspaceTrust(io, options, options.workspace);
  if (trust === undefined) return;
  let profile: ReturnType<typeof resolveNativeChatProfile>;
  let validation: ReturnType<typeof resolveNativeValidationSelection>;
  // Captured before the preset's values merge in: an explicit --approve-tools/--approve-risk beside a mode is refused, a preset's is replaced.
  const explicitApproval = { tools: options.approveTools, risk: options.approveRisk };
  try {
    profile = resolveNativeChatProfile(options, trust.presetsDigest);
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
      reservedCommands: [...NATIVE_INTERACTIVE_COMMANDS.map(command => command.name), ...skillNames()] });
  } catch (error) {
    io.error(error instanceof Error ? error.message : "Native extensions could not be loaded."); io.fail(); return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 50,
    completer: (line: string) => {
      try { return nativeInteractiveCompleter(line, [...skillNames(), ...extensions.prepareTurn().commands.map(command => command.name)]); }
      catch { return nativeInteractiveCompleter(line); }
    } });
  let mcpView = createNativeInteractiveMcpView();
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
  // `display.stdin` is written to the child's stdin and closed (the turn prompt: `run -` reads it, so the entered text
  // is never an argv word and a bare "-" is a prompt, not a flag); without it the child's stdin is closed from the start.
  const execute = (args: readonly string[], display: { interactiveApprovals?: boolean; askUser?: boolean; stream?: boolean; stdin?: string } = {}): Promise<{ code: number | null; stdout: string; truncated: boolean; cancelRequested: boolean }> => new Promise(resolveResult => {
    let stdout = "";
    let truncated = false;
    let cancelRequested = false;
    let previewOpen = false;
    const interactiveApprovals = display.interactiveApprovals === true;
    const ipc = interactiveApprovals || display.askUser === true;
    let running: ChildProcess;
    try {
      // Consent is recorded at chat admission. Later turns must never approve a changed workspace themselves.
      const env = { ...process.env };
      if (args[0] === "agent-loop" && args[1] === "run") delete env[TRUST_WORKSPACE_ENV];
      running = spawn(process.execPath, [...process.execArgv, resolve(entry), ...(selectedAgentId === null ? [] : ["--agent", selectedAgentId]), ...args], {
        cwd, env, shell: false,
        stdio: [display.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe", ...(ipc ? ["ipc" as const] : [])]
      });
    } catch { io.error("Could not start the AMC command."); resolveResult({ code: 1, stdout, truncated, cancelRequested }); return; }
    child = running;
    if (display.stdin !== undefined) {
      // A child that exits before reading (a refused flag) closes the pipe; that EPIPE is not this turn's outcome.
      running.stdin!.on("error", () => {});
      running.stdin!.end(display.stdin);
    }
    if (display.stream) mcpView = createNativeInteractiveMcpView();
    const currentMcpView = mcpView;
    const onMcpReceipt = (value: unknown) => currentMcpView.accept(value);
    if (display.stream) running.on("message", onMcpReceipt);
    const approvals = interactiveApprovals ? createNativeInteractiveApprovals({
      child: running, workspace: cwd, entry, agentId: selectedAgentId ?? "default", question, log: io.log, error: io.error
    }) : null;
    const askUser = display.askUser === true ? createNativeInteractiveAskUser({ child: running, workspace: cwd, question, log: io.log, error: io.error }) : null;
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
        running.removeListener("message", onMcpReceipt);
        if (display.stream) currentMcpView.settled();
        askUser?.close();
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
  let selectedHistory: NativeInteractiveSessionSummary | null = null;
  try {
    let provider = options.provider;
    if (provider === undefined) {
      io.log(`Choose ${NATIVE_FIRST_USE_PROVIDER_LIST.replace(/, or stub$/, "")} for a real model task; choose stub for a local recording demonstration.`);
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
      // Each turn's run child applies the same rules; checked here so a refusal comes before the first turn, not during it.
      paramsFor(provider, Number(maxTokens), { ...options, tools });
      nativeRouteFor(provider, { ...options, ...(guide.baseUrl === null ? {} : { baseUrl: guide.baseUrl }),
        ...(guide.credential === null ? {} : { credential: guide.credential.ref }) }, guide.model ?? undefined);
      if (provider === "deepseek" && tools === "none" && options.thinking !== "disabled") {
        throw new Error("Tools-free DeepSeek chat requires --thinking disabled from its first turn. Signed reasoning is never discarded; select tools explicitly for thinking replay.");
      }
      if (provider === "anthropic" && options.thinking === "enabled") {
        throw new Error("Anthropic thinking cannot continue a chat: anthropic-messages@4 cannot replay a signed thinking block, so the second turn would be refused before spend (D-01). Use agent-loop run --tools none for one thinking turn.");
      }
    } catch (error) { io.error(error instanceof Error ? error.message : "Invalid reasoning or route options."); io.fail(); return; }
    const approvalMode = options.approvalMode === undefined ? undefined : parseApprovalMode(options.approvalMode);
    if (approvalMode !== undefined && !approvalMode.ok) { io.error(approvalMode.reason); io.fail(); return; }
    if (approvalMode !== undefined && (explicitApproval.tools !== undefined || explicitApproval.risk !== undefined)) {
      io.error("--approval-mode composes its own gate; it cannot be combined with --approve-tools or --approve-risk."); io.fail(); return;
    }
    // As `agent-loop run`: an explicit mode replaces a preset's approveTools gate (docs/APPROVALS.md precedence).
    const approvalClass = approvalMode === undefined ? options.approveTools?.trim().toUpperCase() : undefined;
    const approvalRisk = (approvalMode === undefined ? options.approveRisk ?? "high" : "high").trim().toLowerCase();
    if (approvalMode !== undefined && options.approveTools !== undefined) io.log(`Approval mode ${approvalMode.ok ? approvalMode.mode : ""} replaces the preset's approveTools ${options.approveTools}.`);
    // A mode other than plan composes a gate in the child run, so this terminal reviews its requests too.
    const modeGated = approvalMode !== undefined && approvalMode.ok && approvalModeGatedClasses(approvalMode.mode) !== null;
    if ((approvalClass !== undefined && !isActionClass(approvalClass)) ||
        !["low", "medium", "high", "critical"].includes(approvalRisk) ||
        (options.approveRisk !== undefined && approvalClass === undefined)) {
      io.error("Choose a valid --approve-tools action class and --approve-risk low, medium, high, or critical."); io.fail(); return;
    }
    try { options = mergeScopedMcpSelection(options, cwd); }
    catch (error) { io.error(error instanceof Error ? error.message : "MCP scope resolution refused."); io.fail(); return; }
    if (options.mcpConfigSha256 !== undefined && options.mcpConfig === undefined) {
      io.error("--mcp-config-sha256 requires --mcp-config."); io.fail(); return;
    }
    let mcpArgs: string[] = [];
    if (options.mcpConfig !== undefined) {
      if (options.tools !== "workspace" || approvalClass === undefined || !isActionClass(approvalClass)) {
        io.error("MCP chat requires explicit --tools workspace and --approve-tools. Catalog discovery and grant review are separate explicit steps."); io.fail(); return;
      }
      try {
        // The run child repeats this review against the forwarded pins before any server starts.
        mcpArgs = reviewNativeMcpConfigurations(options.mcpConfig, options.mcpConfigSha256, cwd, approvalClass)
          .flatMap(({ config }) => ["--mcp-config", config.path, "--mcp-config-sha256", config.sha256]);
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
      ...(options.webSearchSearxng === undefined ? [] : ["--web-search-searxng", options.webSearchSearxng]),
      ...([["--thinking", options.thinking], ["--reasoning-effort", options.reasoningEffort], ["--thinking-budget", options.thinkingBudget],
        ["--cache-retention", options.cacheRetention], ["--max-retries", options.maxRetries], ["--retry-max-delay", options.retryMaxDelay],
        ["--retry-max-provider-delay", options.retryMaxProviderDelay]] as const).flatMap(([flag, value]) => value === undefined ? [] : [flag, value]),
      // Each turn's child run validates these; they are forwarded verbatim, never defaulted here.
      ...(options.contextWindow === undefined ? [] : ["--context-window", options.contextWindow]),
      ...(options.compactThreshold === undefined ? [] : ["--compact-threshold", options.compactThreshold]),
      ...(options.autoSummary === false ? ["--no-auto-summary"] : []), ...(options.autoCompact === false ? ["--no-auto-compact"] : []),
      ...(approvalClass === undefined ? [] : ["--approve-tools", approvalClass, "--approve-risk", approvalRisk]),
      ...(approvalMode === undefined || !approvalMode.ok ? [] : ["--approval-mode", approvalMode.mode]), ...mcpArgs,
      ...(validation === undefined ? [] : ["--validation-config", resolve(options.validationConfig!), "--validation-config-sha256", validation.configSha256,
        ...validation.checks.flatMap(check => ["--validate", check.id]),
        ...(validation.repair === undefined ? [] : ["--validation-repair", JSON.stringify(validation.repair)])])];
    const routeArgs = [...routeBaseArgs, ...nativeChatProfileArgv(profile)];
    const chatProfileArgs = [...(options.trustWorkspace === true ? ["--trust-workspace"] : []), ...nativeChatProfileArgv(profile, "chat")];
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
      if (approvalMode !== undefined && approvalMode.ok) io.log(`Approval mode: ${approvalMode.mode}${modeGated ? ". This terminal asks you to review actual queued requests using an existing authenticated reviewer session; quorum still applies." : " (nothing executes: every call outside READ_ONLY is simulated)."}`);
      if (approvalClass !== undefined) io.log(`Tool approval gate: ${approvalClass}, risk ${approvalRisk}. This terminal asks you to review actual queued requests using an existing authenticated reviewer session; quorum still applies.`);
      if (mcpArgs.length > 0) io.log("MCP tools use each reviewed catalog and pinned config. Each turn starts and disposes its own configured servers; a changed catalog or config refuses the run. /mcp shows each mount.");
      if (extensions.list().length > 0) io.log(`Signed native extensions: ${extensions.list().map(item => item.id).join(", ")}. /extensions lists their commands and reviewed digests.`);
      if (validation) io.log(`Public task checks: ${validation.checks.map(check => check.title).join(", ")}. Existing shell permissions and approvals still apply.`);
      io.log(`Every turn writes AMC session evidence. Limit: ${maxSteps} model steps per turn, ${maxTokens} output tokens per request.`);
      io.log(`Session: ${sessionId ?? "created on first task"}${forkFrom === null ? "" : `; next task forks ${forkFrom}`}`);
    };
    showScope();
    if (forkFrom !== null) io.log("The fork copies the verified parent conversation into a new signed session; unsupported history refuses before creating a child.");
    io.log(process.env.TERM === "dumb"
      ? "Type a task. /help lists commands. Ctrl-C requests cancellation during a command or exits at the prompt."
      : "Type a task. /help lists commands; Tab completes them. Up/Down recalls input in this terminal only. Ctrl-C requests cancellation during a command or exits at the prompt.");
    if (options.session !== undefined) io.log("The first reply also displays prior recorded assistant text from the resumed session.");
    const handleBuiltin = async (text: string): Promise<boolean> => {
      if (text === "/exit") return true;
      if (text === "/help") {
        showScope();
        for (const command of NATIVE_INTERACTIVE_COMMANDS) io.log(`/${command.name} — ${command.description}`);
        const available = extensions.prepareTurn().commands;
        if (available.length) io.log("Signed extension commands: " + available.map(command => `/${command.name}`).join(", "));
        const skills = [...skillNames()];
        if (skills.length) io.log("Installed skill names (resolved on use): " + skills.map(name => `/${escapeTerminalControls(name)}`).join(", "));
        return false;
      }
      if (text === "/mcp") { for (const line of mcpView.render()) io.log(line); return false; }
      if (text === "/sessions" || text === "/resume") {
        try {
          const rows = listNativeInteractiveSessions(cwd, guide.agentId);
          io.log("Recent sessions (metadata checked; payloads not read; no writer acquired):");
          rows.forEach((row, at) => io.log(`${at + 1}. ${renderNativeInteractiveSession(row)}`));
          if (!rows.length) { io.log("No recorded conversations are available."); return false; }
          if (text === "/sessions") return false;
          const choice = await question("Session number to inspect (blank cancels): ");
          if (!choice?.trim()) { io.log("Session selection cancelled; no writer acquired."); return false; }
          const selected = /^[1-9][0-9]*$/.test(choice.trim()) ? rows[Number(choice.trim()) - 1] : undefined;
          if (!selected) { io.error("Choose a listed session number; no writer acquired."); return false; }
          io.log(renderNativeInteractiveSession(selected));
          const report = await execute(["session", "show", "--", selected.sessionId]);
          if (report.stdout.trim()) io.log(escapeTerminalControls(report.stdout.trimEnd()));
          if (report.code !== 0 || report.truncated || report.cancelRequested) { io.error("Session inspection did not settle completely; no selection was changed."); return false; }
          assertNativeInteractiveSelection(cwd, guide.agentId, selected);
          const confirm = await question("Type resume to select this session (blank cancels): ");
          if (confirm !== "resume") { io.log("Session selection cancelled; no writer acquired."); return false; }
          selectedHistory = assertNativeInteractiveSelection(cwd, guide.agentId, selected);
          sessionId = selected.sessionId; forkFrom = null; previousSummary = null;
          io.log(`Session selected: ${sessionId}. The next explicit task verifies history before acquiring its writer.`);
        } catch (error) { io.error(escapeTerminalControls(error instanceof Error ? error.message : "Session navigation unavailable; no writer acquired.")); }
        return false;
      }
      if (text === "/bookmark") {
        if (sessionId === null || forkFrom !== null) throw new Error("Run a task or select its recorded session before bookmarking a turn.");
        const name = await question("Bookmark name (blank cancels): ");
        if (!name?.trim()) return false;
        const turn = await question("Sealed turn number (blank selects latest sealed turn): ");
        if (turn === null) return false;
        if (turn.trim() && !/^[1-9][0-9]*$/.test(turn.trim())) throw new Error("Choose a positive sealed turn number.");
        const bookmark = await createNativeInteractiveBookmark(cwd, { name, sessionId, ...(turn.trim() ? { turn: Number(turn.trim()) } : {}) });
        io.log(escapeTerminalControls(`Bookmark saved: ${bookmark.name} · session ${bookmark.sessionId} · turn ${bookmark.turn} · seal ${bookmark.sealEventHash}`));
        return false;
      }
      if (text === "/bookmarks") {
        const bookmarks = listNativeInteractiveBookmarks(cwd);
        io.log("Signed bookmarks (target evidence checked on navigation; no writer acquired):");
        bookmarks.forEach((bookmark, at) => io.log(escapeTerminalControls(`${at + 1}. ${bookmark.name} · session ${bookmark.sessionId} · turn ${bookmark.turn}`)));
        if (!bookmarks.length) return false;
        const choice = await question("Bookmark number to inspect (blank cancels): ");
        if (!choice?.trim()) return false;
        const selected = /^[1-9][0-9]*$/.test(choice.trim()) ? bookmarks[Number(choice.trim()) - 1] : undefined;
        if (!selected) throw new Error("Choose a listed bookmark number.");
        const target = navigateNativeInteractiveBookmark(cwd, selected.name, selected);
        io.log(escapeTerminalControls(`Verified bookmark: ${target.bookmark.name} · session ${target.bookmark.sessionId} · turn ${target.bookmark.turn} · seal ${target.bookmark.sealEventHash}`));
        for (const event of target.events) io.log(escapeTerminalControls(`  ${event.event_type} · ${event.id} · ${event.event_hash}`));
        io.log("Bookmark inspection complete; no writer acquired. Use /resume to select a session for a new task.");
        return false;
      }
      if (text === "/extensions") {
        try { io.log(JSON.stringify({ loaded: extensions.inspect(), commands: extensions.listCommands() }, null, 2)); }
        catch (error) { io.error(error instanceof Error ? error.message : "An extension no longer verifies."); }
        return false;
      }
      if (text === "/load") {
        const path = await question("Already signed extension manifest path (blank cancels): ");
        if (!path?.trim()) return false;
        try {
          const loaded = extensions.load(resolve(cwd, path.trim()));
          io.log(`Loaded ${loaded.id}; pinned manifest ${loaded.manifestDigest}. Its context and commands apply to the next turn.`);
        } catch (error) { io.error(error instanceof Error ? error.message : "Extension load refused."); }
        return false;
      }
      if (text === "/unload") {
        const id = await question("Loaded extension ID to unload (blank cancels): ");
        if (!id?.trim()) return false;
        io.log(extensions.unload(id.trim()) ? "Extension unloaded for future turns. Existing conversation and evidence remain." : "No loaded extension has that ID.");
        return false;
      }
      if (text === "/compact") {
        if (sessionId === null || forkFrom !== null) { io.error("Run a task in the current session before compacting it."); return false; }
        const listed = await execute(["session", "compact", sessionId, "--list", "--json"]);
        let head: string;
        try {
          const plan = JSON.parse(listed.stdout) as { ok?: boolean; headEventHash?: string; entries?: unknown[] };
          if (listed.code !== 0 || listed.truncated || plan.ok !== true || typeof plan.headEventHash !== "string" || !Array.isArray(plan.entries)) throw new Error("Invalid compaction listing");
          head = plan.headEventHash;
          io.log(JSON.stringify(plan.entries, null, 2));
        } catch { io.error("Could not read a valid compaction plan. The session was not changed."); return false; }
        const origins = await question("Ordered origin event IDs to summarize (comma separated; blank cancels): ");
        if (!origins?.trim()) return false;
        const summary = await question("UTF-8 summary file path (blank cancels): ");
        if (!summary?.trim()) return false;
        const reason = await question("Reason for this compaction (blank cancels): ");
        if (!reason?.trim()) return false;
        const compacted = await execute(["session", "compact", sessionId, "--origins", origins.trim(),
          "--summary-file", resolve(cwd, summary.trim()), "--reason", reason.trim(), "--expect-head", head, "--json"]);
        if (compacted.stdout.trim()) io.log(compacted.stdout.trimEnd());
        if (compacted.code !== 0 || compacted.truncated) io.error("Compaction refused or did not return a complete receipt. Inspect the session before continuing.");
        else io.log("Compaction recorded; original evidence is retained. /verify checks reconstruction separately.");
        return false;
      }
      if (text === "/withdraw") {
        if (sessionId === null || forkFrom !== null) throw new Error("Run a task or select its recorded session before withdrawing a queued submission.");
        const queued = listNativeQueuedSubmissions(cwd, sessionId);
        io.log(queued.pending.length ? "Queued submissions not yet dispatched to a turn:" : "No queued submission is pending in this session.");
        for (const item of queued.pending) io.log(escapeTerminalControls(`  ${item.messageId} · ${item.target} · from ${item.origin}`));
        const id = await question("Message ID to withdraw (blank cancels): ");
        if (!id?.trim()) return false;
        const outcome = withdrawNativeQueuedSubmission(cwd, sessionId, id.trim(), queued.headEventId);
        const shown = escapeTerminalControls(outcome.messageId);
        io.log(outcome.status === "withdrawn" ? `Withdrawn: ${shown} was removed from the queue by a signed cancel row; other queued work is unchanged.`
          : outcome.status === "in-flight" ? `Not withdrawn: ${shown} was already dispatched to a turn that has no recorded ending; it is in flight or its outcome is TOOL_OUTCOME_UNKNOWN. /inspect shows what was recorded.`
            : outcome.status === "dispatched" ? `Not withdrawn: ${shown} was already dispatched to a recorded turn. /inspect shows its outcome.`
              : outcome.status === "already-withdrawn" ? `Not changed: ${shown} was already withdrawn.` : `Not withdrawn: no queued submission ${shown} exists in this session.`);
        return false;
      }
      if (text === "/fork cancel") {
        if (forkFrom === null) io.log("No fork is queued.");
        else {
          forkFrom = null;
          io.log(sessionId === null ? "Queued fork cleared. The next task starts a new independent session; no existing history was changed."
            : `Queued fork cleared. The next task resumes ${sessionId}; no existing history was changed.`);
        }
        return false;
      }
      if (text === "/fork") {
        if (sessionId === null) io.error("Run a task or resume a session before forking.");
        else { forkFrom = sessionId; io.log(`Fork queued from ${sessionId}. Your next task copies the verified conversation into a new signed session; unsupported history refuses. No child has been created yet.`); }
        return false;
      }
      if (text === "/inspect" || text === "/verify") {
        const target = sessionId ?? forkFrom;
        if (target === null) { io.error("There is no recorded session yet."); return false; }
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
        return false;
      }
      return false;
    };
    while (!closed) {
      const entered = await question("you> ");
      if (entered === null) break;
      const text = entered.trim();
      if (text.length === 0) continue;
      if (text.startsWith("/") && (entered[0] !== "/" || !/^\/[a-z][a-z0-9_-]{0,63}(?::[a-z0-9][a-z0-9_-]{0,63})?(?:[ \t]+[\s\S]*)?$/.test(text))) {
        io.error("Slash commands must start at the first character and use lowercase names (ns:name for a namespaced command). /help lists commands."); continue;
      }
      const name = /^\/([^ \t]+)/.exec(text)?.[1];
      if (NATIVE_INTERACTIVE_COMMANDS.some(command => command.name === name)) {
        if (text !== `/${name}` && text !== "/fork cancel") { io.error(`/${name} prompts for its inputs; use /help.`); continue; }
        try {
          if (await runNativeInteractiveCommand({ workspace: cwd, command: name!, sessionId }, () => handleBuiltin(text))) break;
        } catch (error) { io.error(escapeTerminalControls(error instanceof Error ? error.message : "Native command refused.")); io.fail(); }
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
      if (selectedHistory !== null) {
        try { assertNativeInteractiveSelection(cwd, guide.agentId, selectedHistory); }
        catch (error) { io.error(escapeTerminalControls(error instanceof Error ? error.message : "Session selection changed; use /resume again.")); continue; }
      }
      io.log(`Running ${provider}/${guide.model}; Ctrl-C requests cancellation.`);
      io.log("Live output is provisional until the recorded reply below; a preview is not proof of completion.");
      const priorSession = sessionId;
      const pendingFork = forkFrom;
      const outcome = await execute(["agent-loop", "run", ...routeArgs, ...nativeExtensionRunArgv(extensions),
        ...(approvalClass === undefined && !modeGated ? [] : ["--interactive-approvals"]), ...(tools === "workspace" ? ["--interactive-ask-user"] : []),
        "--keep-open", "--json", "--stream",
        ...(forkFrom !== null ? ["--fork-from", forkFrom] : sessionId === null ? [] : ["--session", sessionId]), "--", "-"],
        { interactiveApprovals: approvalClass !== undefined || modeGated, askUser: tools === "workspace", stream: true, stdin: prompt });
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
      selectedHistory = null;
      forkFrom = null;
      for (const line of renderNativeInteractiveToolResults(cwd, sessionId)) io.log(line);
      io.log("Recorded reply:");
      for (const block of summary.assistantText.slice(previous?.assistantText.length ?? 0)) io.log(escapeTerminalControls(block));
      previousSummary = summary;
      const ending = freshEndings.at(-1);
      io.log(`Session ${sessionId} · driver ${summary.driverStatus}${ending?.reason ? ` · recorded turn ending ${ending.reason}` : ""}. This summary is not an evidence-verification result.`);
      io.log(renderNativeRunUsage(summary.usage, { requestWindow: "latest" }));
      io.log(renderNativeRunDiagnostics(summary.diagnostics));
      io.log(`Public task validation: ${summary.validation?.status ?? "unavailable"}. Passing selected checks does not guarantee correctness.`);
      if (tools === "workspace") for (const line of renderSessionLists(cwd, sessionId)) io.log(line);
      // Exit codes 3-6 (cancelled, bounded, blocked, side effects unsettled; src/cli/agentLoopOutputOptions.ts) are
      // recorded outcomes, not failed turns. 3-5 show in the recorded ending below; 6 is a `complete` ending whose
      // session side effects did not settle, so it is named here from the code itself.
      const sideEffectsUnsettled = outcome.code === 6;
      if ((outcome.code !== 0 && !(outcome.code !== null && outcome.code >= 3 && outcome.code <= 6)) || outcome.truncated || summary.driverStatus === "failed") {
        io.error("The turn failed or was interrupted. No successful task completion is claimed; /inspect and /verify show what was recorded.");
        io.fail();
      } else if (outcome.cancelRequested || ending?.reason !== "complete" || sideEffectsUnsettled) {
        const why = sideEffectsUnsettled && ending?.reason === "complete" ? "the session's side effects did not all settle (a refused, unknown or still-open receipt; exit code 6)" : ending?.reason ?? "no recorded turn ending";
        io.log(`Task completion is not established: ${why}${outcome.cancelRequested ? "; cancellation was requested" : ""}. Driver idle only means it can accept another explicit task; no retry was sent.`);
      }
    }
    if (forkFrom !== null) {
      if (unresolvedOutcome) io.error("The attempted fork has no admitted child result. Do not repeat it blindly; inspect the parent's recorded lineage before choosing a continuation.");
      else {
        io.log("The fork remains queued, not created. To continue that selection in this workspace:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "chat", ...routeBaseArgs, ...chatProfileArgs, ...nativeExtensionRunArgv(extensions), "--fork-from", forkFrom] }));
      }
    }
    if (sessionId !== null) {
      io.log(`Known session reference: ${sessionId}. A resume attempt will verify the evidence before acquiring its writer.`);
      io.log("Resume in this workspace:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "chat", ...routeBaseArgs, ...chatProfileArgs, ...nativeExtensionRunArgv(extensions), "--session", sessionId] }));
      io.log("Verify recorded evidence:\n  " + renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "verify", sessionId] }));
    }
  } finally {
    extensions.unloadAll();
    process.removeListener("SIGINT", cancel);
    terminal.close();
  }
}
