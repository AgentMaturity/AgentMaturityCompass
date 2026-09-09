import { assertNativeTaskValidationPin, inspectNativeTaskValidation, nativeTaskValidationSelectionSchema, nativeTaskValidationView } from "./nativeTaskValidation.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AMCNativeClient, type AMCNativeSession, type AMCNativeTurn } from "../sdk/nativeAgentClient.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { resolveCredentialsPaths } from "../credentials/credentialsPaths.js";
import { credentialRef } from "../credentials/credentialRef.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { checkToolsetReadiness } from "../agent/agentToolset.js";
import { selectSupportedNativeTools } from "../agent/nativeToolCapabilities.js";
import { loadApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { verifyAgentRun } from "../agent/runReport.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";
import { NativeTaskDescriptors, nativeTaskId, taskBodyHash, type NativeTaskDescriptor } from "./nativeTaskDescriptors.js";
import { readNativeTaskProjection, type NativeTaskProjection } from "./nativeTaskProjection.js";
import { NativeTaskServiceError, type NativeTaskActor, type NativeTaskConfiguration, type NativeTaskLimits,
  type NativeTaskService, type NativeTaskState, type NativeTaskView } from "./nativeTaskTypes.js";

const LIMITS: NativeTaskLimits = Object.freeze({ maxActive: 4, maxSteps: 8, maxTokens: 1024, turnTimeoutMs: 120_000,
  idleTimeoutMs: 15 * 60_000, lifetimeMs: 60 * 60_000, maxEvents: 512, maxEventBytes: 2 * 1024 * 1024, maxPromptBytes: 16_384 });
const REFS = { openai: "OPENAI_API_KEY", "openai-responses": "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" } as const;
const startSchema = z.object({ clientRequestId: z.string().uuid(), agentId: z.string().min(1).max(128),
  provider: z.enum(["stub", "openai", "openai-responses", "anthropic"]), model: z.string().min(1).max(200).optional(),
  tools: z.enum(["none", "workspace"]), prompt: z.string().min(1), maxSteps: z.number().int().min(1).max(8).optional(),
  toolsDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), validation: nativeTaskValidationSelectionSchema.optional(),
  maxTokens: z.number().int().min(1).max(1024).optional() }).strict();
interface Entry {
  descriptor: NativeTaskDescriptor; state: NativeTaskState; error: string | null;
  client?: AMCNativeClient; session?: AMCNativeSession; turn?: AMCNativeTurn; work?: Promise<void>;
  preparation?: Promise<void>; runtimeStartedAt: number;
  startupCancelled: boolean; startupAbort: AbortController;
  validationPriorTurn?: number | null;
  projection?: NativeTaskProjection; projectionError?: string; projectionAt: number; touchedAt: number;
  verificationStoreHead?: string;
  verification: NativeTaskView["verification"]; finishing?: Promise<void>;
}
export interface NativeTaskServiceOptions {
  readonly workspace: string;
  /** Operator configuration only. Never populated from HTTP input. */
  readonly validationConfig?: string;
  readonly credentialsHome?: string; readonly credentialsFile?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

/** One native ACP client per task. This is a fixed AMC protocol binding, not a command bridge. */
export function createNativeTaskService(options: NativeTaskServiceOptions): NativeTaskService {
  const workspace = resolve(options.workspace), descriptors = new NativeTaskDescriptors(workspace);
  const environment = { ...(options.environment ?? process.env) };
  const validationConfig = options.validationConfig ?? environment.AMC_NATIVE_VALIDATION_CONFIG;
  const paths = resolveCredentialsPaths({ env: environment, ...(options.credentialsHome ? { homeDir: options.credentialsHome } : {}),
    ...(options.credentialsFile ? { path: options.credentialsFile } : {}) });
  const command = [process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))] as const;
  const entries = new Map<string, Entry>();
  let shuttingDown = false, shutdown: Promise<void> | undefined;

  function assertActor(actor: NativeTaskActor): void {
    if (!actor.principalId || actor.principalId.length > 256 || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(actor.agentId))
      throw new NativeTaskServiceError("ACTOR_INVALID", 403, "A valid authenticated owner and selected agent are required.");
  }
  function assertPrompt(prompt: string): void {
    if (!prompt.trim() || Buffer.byteLength(prompt) > LIMITS.maxPromptBytes || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(prompt))
      throw new NativeTaskServiceError("PROMPT_INVALID", 400, "Enter a task of at most 16 KiB without control characters.");
  }
  function assertOwner(actor: NativeTaskActor, d: NativeTaskDescriptor): void {
    assertActor(actor);
    if (d.principalId !== actor.principalId || d.agentId !== actor.agentId || (actor.demo && (!d.demo || d.provider !== "stub" || d.tools !== "none")))
      throw new NativeTaskServiceError("TASK_NOT_FOUND", 404, "Native task was not found for this owner and selected agent.");
  }
  function remember(d: NativeTaskDescriptor): Entry {
    let entry = entries.get(d.taskId);
    if (!entry) {
      entry = { descriptor: d, state: d.closed ? "closed" : d.sessionId ? "released" : "failed",
        error: d.pendingTurn ? "The prior submission may have started. No request was replayed; inspect evidence and explicitly resume before a new turn." : null,
        projectionAt: 0, touchedAt: Date.now(), runtimeStartedAt: Date.now(), startupCancelled: false, startupAbort: new AbortController(), verification: "not-verified" };
      entries.set(d.taskId, entry);
    } else if (taskBodyHash(entry.descriptor) !== taskBodyHash(d)) {
      if (entry.client || entry.session || entry.preparation || entry.turn || entry.work || entry.finishing
        || entry.state === "starting" || entry.state === "verifying")
        throw new NativeTaskServiceError("TASK_CHANGED", 409, "Native task admission changed while this process still owns an operation.");
      // An observer may have cached revision N before another owner admitted
      // N+1. Refresh authenticated control state without resuming or replaying
      // any prompt, so the original lost-ack retry can reach deduplication.
      entry.descriptor = d; entry.state = d.closed ? "closed" : d.sessionId ? "released" : "failed";
      entry.error = d.pendingTurn ? "The prior submission may have started. No request was replayed; inspect evidence and explicitly resume before a new turn." : null;
      entry.verification = "not-verified"; entry.projection = undefined; entry.projectionAt = 0;
    }
    return entry;
  }
  function owned(actor: NativeTaskActor, taskId: string): Entry {
    const d = descriptors.read(taskId);
    if (!d) throw new NativeTaskServiceError("TASK_NOT_FOUND", 404, "Native task was not found.");
    assertOwner(actor, d);
    const entry = remember(d);
    if (entry.descriptor.revision !== d.revision || entry.descriptor.sessionId !== d.sessionId)
      throw new NativeTaskServiceError("TASK_CHANGED", 409, "Native task admission changed in another process. Refresh before continuing.");
    return entry;
  }
  function control(actor: NativeTaskActor, taskId: string, expectedRevision: number): Entry {
    owned(actor, taskId); // Refuse unknown/foreign identities before creating any lock directory.
    return descriptors.lock(() => {
      const entry = owned(actor, taskId);
      assertRevision(entry, expectedRevision);
      return entry;
    });
  }
  function assertRevision(entry: Entry, expectedRevision: number): void {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== entry.descriptor.revision) throw new NativeTaskServiceError("STALE_REVISION", 409,
      "The task revision changed. Refresh before controlling a newer turn.");
  }
  function capacity(): void {
    if (shuttingDown) throw new NativeTaskServiceError("SHUTTING_DOWN", 409, "Studio is stopping; no new native work was admitted.");
    if ([...entries.values()].filter(e => e.client || e.preparation || e.state === "starting").length >= LIMITS.maxActive)
      throw new NativeTaskServiceError("CAPACITY", 429, "Four native tasks are active. Release an idle task before starting another.");
  }
  function assertUniqueSubmission(actor: NativeTaskActor, taskId: string, requestId: string): void {
    for (const d of descriptors.scan()) {
      if (d.principalId === actor.principalId && d.taskId !== taskId && d.submissions.some(s => s.clientRequestId === requestId))
        throw new NativeTaskServiceError("REQUEST_CONFLICT", 409, "That request ID already belongs to another native task.");
    }
  }
  function assertToolPin(d: NativeTaskDescriptor): void {
    assertNativeTaskValidationPin(validationConfig, d.validation);
    if (d.tools === "workspace") {
      const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
      if (!snapshot.signatureValid || snapshot.digestSha256 !== d.toolsDigest) throw new NativeTaskServiceError("SCOPE_CHANGED", 409,
        "The signed workspace tool scope changed. Review the current scope and create a new task; this task cannot silently adopt new grants.");
    }
  }
  function persist(entry: Entry, patch: Partial<Pick<NativeTaskDescriptor, "sessionId" | "pendingTurn" | "closed">>): void {
    descriptors.lock(() => {
      const current = descriptors.read(entry.descriptor.taskId);
      if (!current || current.revision !== entry.descriptor.revision || current.sessionId !== entry.descriptor.sessionId) throw new NativeTaskServiceError("TASK_CHANGED", 409, "Native task descriptor changed during execution.");
      entry.descriptor = { ...current, ...patch, updatedAt: Date.now() }; descriptors.write(entry.descriptor);
    });
  }
  function refresh(entry: Entry): void {
    if (!entry.descriptor.sessionId || Date.now() - entry.projectionAt < 250) return;
    try {
      entry.projection = readNativeTaskProjection(workspace, entry.descriptor.sessionId, entry.descriptor.agentId);
      entry.projectionError = undefined;
      if (entry.verificationStoreHead !== entry.projection.storeHeadEventHash) entry.verification = "not-verified";
      entry.projectionAt = Date.now();
    } catch {
      entry.projection = undefined;
      entry.verification = "not-verified"; entry.verificationStoreHead = undefined;
      entry.projectionError = "Committed native evidence could not be authenticated or exceeded the display bound. No transcript or approval is shown. Restore the original evidence and refresh; no alternate history was substituted.";
    }
  }
  function view(entry: Entry, retainProjection = false): NativeTaskView {
    refresh(entry);
    const d = entry.descriptor, p = entry.projection;
    const history: NativeTaskView["history"] = p?.history ?? { status: d.sessionId ? "unavailable" : "not-started",
      backend: null, headEventHash: null, eventCount: 0,
      message: d.sessionId ? entry.projectionError ?? "Persisted history is unavailable. Refresh after restoring the original evidence."
        : "No native session has been recorded yet. Admission is not task completion." };
    const resumeBlockedReason = !entry.client && d.sessionId && !d.closed && !p?.closed
      ? !p ? "Authenticate the original persisted history before requesting resume."
        : p.history.backend === "jsonl" ? "JSONL history can be inspected after restart, but writer resume is not supported. Start a new task to continue; no prior prompt will be replayed." : null : null;
    const validation = nativeTaskValidationView(d.validation, p?.validation,
        !!d.validation && d.pendingTurn && (entry.state === "starting" || (["running", "cancel-requested"].includes(entry.state) && (p?.validation.turn ?? null) === entry.validationPriorTurn)),
        d.pendingTurn && (!entry.client || (p?.validation.turn ?? null) === entry.validationPriorTurn));
    const result: NativeTaskView = { taskId: d.taskId, sessionId: d.sessionId, agentId: d.agentId, provider: d.provider, model: d.model, tools: d.tools, toolsDigest: d.toolsDigest,
      maxSteps: d.maxSteps, maxTokens: d.maxTokens, revision: d.revision, clientRequestId: d.submissions[0]!.clientRequestId,
      lastClientRequestId: d.submissions[d.submissions.length - 1]!.clientRequestId, state: !entry.client && p?.closed ? "closed" : entry.state,
      createdAt: d.createdAt, updatedAt: d.updatedAt, archived: d.archivedAt !== undefined, turnEndReason: p?.ending ?? null, error: entry.projectionError ?? entry.error,
      validationSelection: d.validation ?? null,
      validation, validationOutputs: (p?.validationOutputs ?? []).filter(output => validation.checks.some(check => check.outputEventId === output.outputEventId && check.id === output.checkId)),
      verification: entry.verification, approvals: p?.approvals ?? [], approvalError: p?.approvalError ?? null,
      nextCursor: p?.nextCursor ?? 0, firstCursor: p?.firstCursor ?? 1, droppedEvents: p?.droppedEvents ?? 0,
      history, resumeBlockedReason,
      canResume: !!d.sessionId && !!p && p.history.backend === "sqlite" && !d.closed && !p.closed && !entry.client && entry.state !== "starting" && entry.state !== "verifying" };
    // Released task history is reconstructed on demand, not retained for every descriptor in memory.
    if (!entry.client && !retainProjection) { entry.projection = undefined; entry.projectionAt = 0; }
    return result;
  }
  function childEnvironment(provider: NativeTaskDescriptor["provider"]): NodeJS.ProcessEnv {
    // SDK merges env by default: explicitly erase every ambient key before the fixed allowlist.
    const env: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).map(key => [key, undefined]));
    const permitted = ["HOME", "USERPROFILE", "SystemRoot", "WINDIR", "PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL",
      "AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_CONTROL_CHECKPOINT_DIR"];
    if (provider !== "stub") permitted.push(REFS[provider]);
    for (const name of permitted) if (environment[name] !== undefined) env[name] = environment[name];
    // The operator's external rollback checkpoints must remain the same across
    // parent/child inspection. A different HOME is not authority to start a new
    // checkpoint history. This value cannot come from browser task arguments.
    env.AMC_HOME = paths.homeDir; env.AMC_CREDENTIALS_FILE = paths.file; env.AMC_VAULT_REMEMBER = "0";
    return env;
  }
  async function configuration(actor: NativeTaskActor): Promise<NativeTaskConfiguration> {
    assertActor(actor);
    const tools = loadVerifiedToolsConfigSnapshot(workspace);
    const supportedTools = selectSupportedNativeTools(tools);
    let toolBlockers: readonly string[] = [];
    let ready = false;
    try {
      const readiness = checkToolsetReadiness(workspace, { snapshot: tools });
      toolBlockers = readiness.blockers;
      const policy = loadApprovalPolicy(workspace).approvalPolicy.actionClasses.WRITE_HIGH;
      ready = tools.signatureValid && readiness.ready && verifyApprovalPolicySignature(workspace).valid
        && inspectRuntimeFirewallPolicy(workspace).integrity === "trusted"
        && verifyBudgetsConfigSignature(workspace).valid && !!policy && policy.requiredApprovals > 0;
    } catch { /* Explicitly unavailable, never initialize policies in a read. */ }
    const providers: NativeTaskConfiguration["providers"][number][] = [{ id: "stub", local: true, credential: null }];
      if (!actor.demo) for (const id of ["openai", "openai-responses", "anthropic"] as const) {
        // Describe with exactly that child's intentional reference, never resolve or expose its value.
        const providerStore = new LocalCredentialsService({ homeDir: paths.homeDir, path: paths.file, env: childEnvironment(id), projectDir: null, includeDotenv: false, watch: false });
        try { const description = providerStore.describe(credentialRef(REFS[id]));
          providers.push({ id, local: false, credential: { ref: REFS[id], configured: description.configured,
            source: description.source === "env" || description.source === "file" ? description.source : null } });
        } finally { await providerStore.close(); }
      }
      return { schemaVersion: "2026-09-08", agentId: actor.agentId, demo: actor.demo, providers, limits: LIMITS,
        scope: { ready: ready && !actor.demo, digest: tools.digestSha256, approvalRequired: true,
          tools: supportedTools.map(t => ({ name: t.name, actionClass: t.actionClass,
            paths: t.allow?.paths ?? [], deniedPaths: t.deny?.paths ?? [], hosts: t.allow?.hostAllowlist ?? [], binaries: t.allow?.binariesAllowlist ?? [],
            nativeSandbox: t.nativeSandbox ?? null })),
          message: actor.demo ? "Demo authentication permits local stub recording with no workspace tools."
            : ready ? (supportedTools.every(tool => tool.actionClass === "READ_ONLY")
              ? "Read-only tools are available; editing and shell are not granted. Every workspace tool call still requires the signed WRITE_HIGH approval quorum."
              : "Existing signed tool grants apply. Every workspace tool call also requires the signed WRITE_HIGH approval quorum.")
              : toolBlockers.length ? `Workspace tools are unavailable: ${toolBlockers.join("; ")}`
                : "Workspace tools require signed tools, firewall, budgets and a WRITE_HIGH approval policy with a nonzero reviewer quorum." },
        validation: inspectNativeTaskValidation(validationConfig, actor.demo),
        boundary: "Provider access is not pre-tested. Stub records a canned local demonstration, not a model answer. Limits apply per native turn; existing signed budgets govern aggregate spending. No custom origins, commands, MCP mounts or grants can be supplied by the browser." };
  }
  async function prepare(actor: NativeTaskActor, entry: Entry, resume: boolean): Promise<void> {
    const d = entry.descriptor;
    assertToolPin(d);
    const config = await configuration(actor);
    if (d.tools === "workspace" && !config.scope.ready) throw new NativeTaskServiceError("TOOLS_NOT_READY", 409, config.scope.message);
    if (d.provider !== "stub" && !config.providers.find(p => p.id === d.provider)?.credential?.configured)
      throw new NativeTaskServiceError("CREDENTIAL_MISSING", 409, "The selected provider's operator credential reference is not configured.");
    if (shuttingDown || entry.startupCancelled) throw new NativeTaskServiceError("START_CANCELLED", 409, "Native startup was cancelled before dispatch.");
    entry.client = await AMCNativeClient.start({ workspace, command, env: childEnvironment(d.provider), provider: d.provider,
      ...(d.model === null ? {} : { model: d.model }), agentId: d.agentId, tools: d.tools,
      ...(d.provider === "stub" ? {} : { credential: REFS[d.provider] }),
      ...(d.tools === "workspace" ? { approveTools: "WRITE_HIGH", approveRisk: "high" as const } : {}),
      ...(d.toolsDigest === null ? {} : { expectedToolsDigest: d.toolsDigest }),
      ...(entry.descriptor.validation ? { validationConfig, validationConfigSha256: entry.descriptor.validation.configSha256, validate: entry.descriptor.validation.checkIds } : {}),
      credentialsMode: "operator-only", credentialsHome: paths.homeDir, credentialsFile: paths.file,
      maxSteps: d.maxSteps, maxTokens: d.maxTokens, timeoutMs: LIMITS.turnTimeoutMs, startupSignal: entry.startupAbort.signal });
    if (shuttingDown || entry.startupCancelled) throw new NativeTaskServiceError("START_CANCELLED", 409, "Native startup was cancelled before dispatch.");
    const abortSetup = () => { void entry.client?.close(); };
    entry.startupAbort.signal.addEventListener("abort", abortSetup, { once: true });
    try { entry.session = resume ? await entry.client.resumeSession(d.sessionId!) : await entry.client.newSession(); }
    finally { entry.startupAbort.signal.removeEventListener("abort", abortSetup); }
    if (!resume) persist(entry, { sessionId: entry.session.sessionId });
    if (shuttingDown || entry.startupCancelled) throw new NativeTaskServiceError("START_CANCELLED", 409, "Native startup was cancelled before dispatch.");
    entry.state = "idle"; entry.error = null; entry.touchedAt = Date.now(); entry.runtimeStartedAt = Date.now(); entry.projectionAt = 0;
  }
  async function stop(entry: Entry): Promise<void> {
    if (entry.finishing) return entry.finishing;
    entry.startupCancelled = true; entry.startupAbort.abort();
    entry.finishing = (async () => {
      entry.state = "releasing";
      try {
        if (entry.preparation) { try { await entry.preparation; } catch { /* Own all partially prepared child resources below. */ } }
        try { entry.turn?.cancel(); } catch { /* Failed protocol still closes below. */ }
        if (entry.work) {
          let timer: NodeJS.Timeout | undefined;
          const settled = await Promise.race([entry.work.then(() => true), new Promise<false>(resolveTimeout => { timer = setTimeout(() => resolveTimeout(false), 5_000); })]);
          if (timer) clearTimeout(timer);
          if (!settled) { await entry.client?.close(); await entry.work; throw new Error("Native cancellation required forced client shutdown"); }
        }
        if (entry.session && entry.client) await entry.session.release();
        entry.state = entry.descriptor.closed ? "closed" : "released";
      } catch { entry.state = "failed"; entry.error = "The native writer did not release cleanly. Inspect signed evidence before attempting recovery."; }
      finally { try { await entry.client?.close(); } catch { entry.state = "failed"; entry.error = "Native process cleanup did not complete cleanly."; }
        finally { entry.client = undefined; entry.session = undefined; entry.turn = undefined; entry.finishing = undefined; entry.projectionAt = 0; } }
    })();
    return entry.finishing;
  }
  function dispatch(entry: Entry, prompt: string): void {
    if (!entry.session) throw new NativeTaskServiceError("NOT_ACTIVE", 409, "Explicitly resume the released native session before submitting a new turn.");
    entry.projectionAt = 0; refresh(entry);
    if (!entry.projection) throw new NativeTaskServiceError("EVIDENCE_UNAVAILABLE", 409, "The native session did not authenticate before dispatch. No provider request was submitted.");
    const precedingEndingId = entry.projection.endingId;
    entry.validationPriorTurn = entry.projection.validation.turn;
    entry.state = "running"; entry.error = null; entry.verification = "not-verified"; entry.touchedAt = Date.now();
    try { entry.turn = entry.session.prompt(prompt); }
    catch { entry.state = "failed"; entry.error = "Prompt submission was not confirmed. It was not automatically retried."; void stop(entry); return; }
    const turn = entry.turn;
    entry.work = (async () => {
      try {
        await turn.result;
        entry.projectionAt = 0; refresh(entry);
        const reason = entry.projection?.ending;
        if (!reason || entry.projection?.endingId === precedingEndingId) throw new Error("No new authenticated turn ending");
        entry.state = reason === "error" || reason === "interrupted" ? "failed" : "idle";
        entry.error = reason === "error" || reason === "interrupted" ? `The signed native turn ended with ${reason}; no successful task is claimed.` : null;
        persist(entry, { pendingTurn: false });
      } catch { entry.state = "failed"; entry.error = "The native turn did not complete cleanly. Inspect committed evidence; no automatic retry was sent."; }
      finally { entry.turn = undefined; entry.touchedAt = Date.now(); entry.work = undefined; entry.projectionAt = 0; }
    })();
  }
  const sweep = setInterval(() => {
    for (const entry of entries.values()) if (entry.client && !entry.finishing
      && (Date.now() - entry.runtimeStartedAt >= LIMITS.lifetimeMs || (!entry.turn && Date.now() - entry.touchedAt >= LIMITS.idleTimeoutMs))) void stop(entry);
  }, 10_000);
  sweep.unref();

  return {
    configuration,
    list(actor, includeArchived = false) { assertActor(actor); return descriptors.list(includeArchived).filter(d => d.principalId === actor.principalId && d.agentId === actor.agentId
      && (!actor.demo || (d.demo && d.provider === "stub" && d.tools === "none"))).map(d => view(remember(d))).sort((a, b) => b.createdAt - a.createdAt); },
    async start(actor, input) {
      assertActor(actor);
      const parsed = startSchema.safeParse(input);
      if (!parsed.success) throw new NativeTaskServiceError("INPUT_INVALID", 400, "Invalid native task input.");
      input = parsed.data; // Own the parsed check-ID array before any asynchronous startup.
      assertPrompt(input.prompt);
      if (input.agentId !== actor.agentId || (actor.demo && (input.provider !== "stub" || input.tools !== "none"))) throw new NativeTaskServiceError("SCOPE_REFUSED", 403, "The selected identity or demo execution scope was not authorized.");
      if (input.provider !== "stub" && (!input.model?.trim() || /[\x00-\x1f\x7f]/.test(input.model))) throw new NativeTaskServiceError("MODEL_REQUIRED", 400, "Choose an accessible model ID for the selected provider.");
      if (input.provider === "stub" && input.model !== undefined) throw new NativeTaskServiceError("STUB_MODEL_UNUSED", 400, "The local stub does not accept a model override.");
      if ((input.tools === "workspace") !== (input.toolsDigest !== undefined)) throw new NativeTaskServiceError("SCOPE_PIN_REQUIRED", 400, "Workspace tools require the exact reviewed scope digest; no-tools tasks must omit it.");
      const taskId = nativeTaskId(actor.principalId, input.clientRequestId), bodyHash = taskBodyHash(input);
      let admitted = false;
      const d = descriptors.lock(() => {
        assertUniqueSubmission(actor, taskId, input.clientRequestId);
        const existing = descriptors.read(taskId);
        if (existing) { assertOwner(actor, existing); if (existing.submissions[0]!.bodyHash !== bodyHash) throw new NativeTaskServiceError("REQUEST_CONFLICT", 409, "That request ID already names a different task."); return existing; }
        assertNativeTaskValidationPin(validationConfig, input.validation);
        if (input.validation) {
          const tools = loadVerifiedToolsConfigSnapshot(workspace);
          if (actor.demo || input.tools !== "workspace" || !tools.signatureValid || tools.digestSha256 !== input.toolsDigest
            || !selectSupportedNativeTools(tools).some(tool => tool.name === "bash"))
            throw new NativeTaskServiceError("VALIDATION_SCOPE_REQUIRED", 403, "Public checks require signed workspace bash and an authenticated operator; selecting a check creates no grant.");
        }
        capacity();
        if (descriptors.list().length >= 256) throw new NativeTaskServiceError("TASK_HISTORY_LIMIT", 409, "This workspace has 256 current tasks. Close and explicitly archive a reviewed task before creating more tasks.");
        const now = Date.now();
        const descriptor: NativeTaskDescriptor = { kind: "amc/studio-native-task/v1", taskId, principalId: actor.principalId, agentId: actor.agentId,
          demo: actor.demo, sessionId: null, provider: input.provider, model: input.model ?? null, tools: input.tools, toolsDigest: input.toolsDigest ?? null,
          ...(parsed.data.validation ? { validation: parsed.data.validation } : {}),
          maxSteps: input.maxSteps ?? LIMITS.maxSteps, maxTokens: input.maxTokens ?? LIMITS.maxTokens,
          createdAt: now, updatedAt: now, revision: 1, pendingTurn: true, closed: false,
          submissions: [{ clientRequestId: input.clientRequestId, bodyHash, revision: 1 }] };
        descriptors.write(descriptor); admitted = true; return descriptor;
      });
      const entry = remember(d);
      if (!admitted) return view(entry);
      entry.state = "starting";
      try { entry.preparation = prepare(actor, entry, false); await entry.preparation;
        if (shuttingDown || entry.finishing || entry.startupCancelled) throw new Error("Studio is stopping"); dispatch(entry, input.prompt); }
      catch (error) { entry.error = error instanceof NativeTaskServiceError ? error.message : "Native startup did not finish. No model request was automatically retried; inspect setup and task status."; await stop(entry); entry.state = "failed"; }
      finally { entry.preparation = undefined; }
      return view(entry);
    },
    poll(actor, taskId, cursor = 0) {
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new NativeTaskServiceError("CURSOR_INVALID", 400, "Choose a nonnegative event cursor.");
      const entry = owned(actor, taskId), task = view(entry, true);
      if (task.history.status !== "unavailable" && cursor > task.nextCursor) throw new NativeTaskServiceError("CURSOR_AHEAD", 409, "The event cursor is ahead of authenticated history. Refresh from cursor zero.");
      const events = entry.projection?.events.filter(e => e.cursor > cursor) ?? [];
      if (!entry.client) { entry.projection = undefined; entry.projectionAt = 0; }
      return { task, events, truncated: task.history.status === "unavailable" || task.droppedEvents > 0 || cursor + 1 < task.firstCursor };
    },
    async turn(actor, taskId, input) {
      const entry = owned(actor, taskId); assertPrompt(input.prompt);
      if (!z.string().uuid().safeParse(input.clientRequestId).success) throw new NativeTaskServiceError("REQUEST_INVALID", 400, "A unique request ID is required.");
      const bodyHash = taskBodyHash(input);
      let admitted = false;
      descriptors.lock(() => {
        const d = descriptors.read(taskId)!;
        assertUniqueSubmission(actor, taskId, input.clientRequestId);
        const prior = d.submissions.find(s => s.clientRequestId === input.clientRequestId);
        if (prior) { if (prior.bodyHash !== bodyHash) throw new NativeTaskServiceError("REQUEST_CONFLICT", 409, "That request ID already names different turn content."); return; }
        if (shuttingDown || d.closed || !entry.session || entry.turn || entry.finishing || entry.state !== "idle") throw new NativeTaskServiceError(
          d.archivedAt !== undefined ? "TASK_ARCHIVED" : "TURN_BUSY", 409,
          d.archivedAt !== undefined ? "Archived tasks retain their evidence and cannot accept new turns. Create a new task." : "Wait for the active turn, or explicitly resume the released task.");
        if (input.expectedRevision !== d.revision || d.revision !== entry.descriptor.revision) throw new NativeTaskServiceError("STALE_REVISION", 409, "The task revision changed. Refresh before submitting.");
        if (d.revision >= 32) throw new NativeTaskServiceError("TURN_LIMIT", 409, "This task reached its 32-submission limit. Release it and create a new task.");
        assertToolPin(d);
        entry.descriptor = { ...d, revision: d.revision + 1, pendingTurn: true, updatedAt: Date.now(),
          submissions: [...d.submissions, { clientRequestId: input.clientRequestId, bodyHash, revision: d.revision + 1 }] };
        descriptors.write(entry.descriptor); admitted = true;
      });
      if (admitted) dispatch(entry, input.prompt);
      return view(entry);
    },
    cancel(actor, taskId, expectedRevision) { const entry = control(actor, taskId, expectedRevision);
      if (entry.preparation || entry.state === "starting") { entry.startupCancelled = true; void stop(entry); }
      else if (entry.turn) { entry.state = "cancel-requested"; entry.turn.cancel(); }
      return view(entry); },
    async release(actor, taskId, expectedRevision) { const entry = control(actor, taskId, expectedRevision);
      if (entry.state === "verifying") throw new NativeTaskServiceError("OPERATION_BUSY", 409, "Wait for native verification to finish.");
      await stop(entry); return view(entry); },
    async resume(actor, taskId, expectedRevision) {
      const entry = control(actor, taskId, expectedRevision);
      if (entry.state === "idle" && entry.client) return view(entry);
      if (entry.client || entry.preparation || entry.finishing || entry.state === "starting" || entry.state === "verifying") throw new NativeTaskServiceError("ALREADY_ACTIVE", 409, "This task already has an active native operation.");
      if (!entry.descriptor.sessionId || entry.descriptor.closed) throw new NativeTaskServiceError(
        entry.descriptor.archivedAt !== undefined ? "TASK_ARCHIVED" : "NOT_RESUMABLE", 409,
        entry.descriptor.archivedAt !== undefined ? "Archived tasks retain their evidence and cannot be resumed. Create a new task." : "This task has no resumable recorded native session.");
      entry.projectionAt = 0; refresh(entry);
      if (!entry.projection) throw new NativeTaskServiceError("EVIDENCE_UNAVAILABLE", 409,
        "Resume requires authenticated original session history. Restore it and refresh; no replacement session was created.");
      if (entry.projection.history.backend === "jsonl") throw new NativeTaskServiceError("RESUME_UNSUPPORTED", 409,
        "JSONL writer resume is not supported. Inspect the recorded history or start a new task; no native client or replacement session was started.");
      capacity(); entry.state = "starting"; entry.startupCancelled = false; entry.startupAbort = new AbortController();
      try { entry.preparation = prepare(actor, entry, true); await entry.preparation;
        if (shuttingDown || entry.finishing || entry.startupCancelled) throw new Error("Studio is stopping"); persist(entry, { pendingTurn: false }); }
      catch { await stop(entry); entry.state = "failed"; entry.error = "Verified native resume was refused. No replacement session or provider request was created."; }
      finally { entry.preparation = undefined; }
      return view(entry);
    },
    archive(actor, taskId, expectedRevision) {
      owned(actor, taskId);
      return descriptors.lock(() => {
        const entry = owned(actor, taskId);
        assertRevision(entry, expectedRevision);
        const d = entry.descriptor;
        if (entry.client || entry.session || entry.preparation || entry.turn || entry.work || entry.finishing
          || ["starting", "running", "cancel-requested", "releasing", "verifying"].includes(entry.state))
          throw new NativeTaskServiceError("ARCHIVE_BUSY", 409, "Wait for all native operations to finish and close the session before archiving.");
        if (d.pendingTurn) throw new NativeTaskServiceError("ARCHIVE_UNCERTAIN", 409, "A prior submission is unresolved. Inspect and reconcile its signed evidence before archiving.");
        if (!d.sessionId) throw new NativeTaskServiceError("NO_SESSION", 409, "No recorded native session exists to authenticate for archival.");
        let projection: NativeTaskProjection;
        try { projection = readNativeTaskProjection(workspace, d.sessionId, d.agentId); }
        catch { throw new NativeTaskServiceError("EVIDENCE_UNAVAILABLE", 409, "Native evidence did not authenticate; this task was not archived."); }
        if (!projection.closed) throw new NativeTaskServiceError("ARCHIVE_NOT_CLOSED", 409, "The authenticated native session is still open. Close it before archiving.");
        if (d.archivedAt === undefined) {
          const now = Date.now();
          const archived = { ...d, closed: true, archivedAt: now, updatedAt: now };
          descriptors.write(archived); entry.descriptor = archived;
        }
        entry.state = "closed"; entry.projection = projection; entry.projectionAt = Date.now();
        return view(entry);
      });
    },
    async verify(actor, taskId, expectedRevision) {
      const entry = control(actor, taskId, expectedRevision);
      if (entry.state === "verifying") return view(entry);
      if (entry.turn || entry.finishing || entry.state === "starting") throw new NativeTaskServiceError("VERIFY_BUSY", 409, "Wait for the active operation before verifying.");
      if (!entry.descriptor.sessionId) throw new NativeTaskServiceError("NO_SESSION", 409, "No native session was recorded to verify.");
      entry.state = "verifying";
      try {
        if (entry.client) { await entry.client.close(); entry.client = undefined; entry.session = undefined;
          entry.projectionAt = 0; refresh(entry); if (entry.projection?.closed) persist(entry, { closed: true }); }
        entry.projectionAt = 0; refresh(entry);
        const verificationHead = entry.projection?.storeHeadEventHash;
        const report = await verifyAgentRun(workspace, entry.descriptor.sessionId);
        entry.projectionAt = 0; refresh(entry);
        const sameHead = verificationHead !== undefined && verificationHead === entry.projection?.storeHeadEventHash;
        entry.verification = !report.ok ? "failed" : !sameHead ? "not-verified"
          : report.trustRoot.anchored ? "externally-anchored" : "workspace-key-consistency";
        entry.verificationStoreHead = sameHead ? verificationHead : undefined;
        entry.error = report.ok ? null : "Cold native verification refused this evidence. Other live workspace sessions can also prevent complete-ledger verification; inspect the ledger before making claims.";
        if (report.ok && !sameHead) entry.error = "Recorded history changed during verification. Refresh and explicitly verify the current snapshot; the earlier verdict is not current.";
      } catch { entry.verification = "failed"; entry.error = "Cold native verification did not complete. No verified result is claimed."; }
      finally { entry.state = entry.descriptor.closed ? "closed" : "released"; entry.projectionAt = 0; }
      return view(entry);
    },
    close() {
      if (shutdown) return shutdown;
      shuttingDown = true; clearInterval(sweep);
      const active = [...entries.values()].filter(e => e.client || e.preparation || e.state === "starting");
      shutdown = Promise.allSettled(active.map(stop)).then(results => {
        if (results.some(result => result.status === "rejected") || active.some(entry => entry.state === "failed"))
          throw new Error("Native task shutdown could not cleanly release every owned writer; inspect its signed session before recovery.");
      });
      return shutdown;
    }
  };
}
