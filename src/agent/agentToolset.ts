import { existsSync } from "node:fs";
import { runCodeTool } from "../codemode/runCodeTool.js";
import { runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { loadVerifiedToolsConfigSnapshot, type VerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { SandboxRunner } from "../sandbox/sandboxRunner.js";
import { createNativeSandboxBash } from "../sandbox/nativeSandboxBinding.js";
import { childShellReadiness, nativeShellReadiness, type ExplicitShellOptIn, type NativeShellReadiness } from "../sandbox/nativeShellGate.js";
import { measureProcessConfinement, processConfinementReason, processIsConfined, type ConfinementMeasurement } from "../sandbox/processConfinement.js";
import { bashTool } from "../tools/builtin/bashTool.js";
import { fsTools } from "../tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../tools/builtin/readBeforeEdit.js";
import { searchTools } from "../tools/builtin/searchTools.js";
import { webFetchTool } from "../tools/builtin/webFetchTool.js";
import { webSearchTool, type WebSearchProvider } from "../tools/builtin/webSearchTool.js";
import { askUserTool, type AskUserAnswerer } from "../tools/builtin/askUserTool.js";
import { todoTool } from "../tools/builtin/todoTool.js";
import { planTool } from "../tools/builtin/planTool.js";
import type { NativeReceiptRecorder } from "../tools/builtin/nativeToolBreadth/nativeReceipt.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import {
  budgetGuard,
  networkEgressGuard,
  promptInjectionGuard,
  runtimeFirewallGuard,
  toolhubAllowlistGuard
} from "../tools/guards/policyGuards.js";
import { compiledApprovalClasses, compiledPolicyFacts, compiledPolicyGuard, compiledPolicyShows, planRequiresAgentLease } from "../tools/guards/compiledPolicyGuard.js";
import { ToolPipeline } from "../tools/toolPipeline.js";
import type { ActionClass } from "../types.js";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { writeEffectivePolicyReceipt } from "../policy/effectivePolicyReceipt.js";
import { ToolRegistry } from "../tools/toolRegistry.js";
import { openLedger } from "../ledger/ledger.js";
import { openActionJournal, type ActionJournal } from "../actions/actionJournal.js";
import { checkLease } from "../actions/authorize.js";
import { toolEvidenceFor } from "../tools/toolEvidence.js";
import { delegateTool, type SubagentCapability } from "./delegateTool.js";
import { workflowTool } from "../workflow/workflowTool.js";
import { pipelineToolSeam } from "./pipelineToolSeam.js";
import type { AgentToolSeam } from "./toolSeam.js";
import { NATIVE_BUILTIN_CAPABILITIES, NATIVE_DELEGATION_CAPABILITIES, selectSupportedNativeTools, type NativeToolCapability } from "./nativeToolCapabilities.js";

/**
 * Everything Phase 4 built, composed for one agent (P4 wiring).
 *
 * One function, because the pieces are only safe TOGETHER. The built-in tools
 * without the guards are an ungoverned filesystem; the guards without the
 * signed configs deny everything; Code Mode without the sandbox is a program
 * that can bypass the tool binding entirely. Assembling them at each call site
 * is how one of them eventually gets left out.
 */

export interface AgentToolsetOptions {
  readonly workspace: string;
  readonly agentId: string;
  /** Immutable reviewed tool scope, enforced on the execution guard's exact signed snapshot. */
  readonly expectedToolsDigest?: string;
  /** Reviewed implementations mounted by this caller after composition; never inferred from arbitrary policy names. */
  readonly additionalCapabilities?: readonly NativeToolCapability[];
  /** `code` collapses every direct call onto `run_code`. */
  readonly mode?: "native" | "code";
  /** Values scrubbed from tool output, e.g. a live lease. */
  readonly scrubValues?: readonly string[];
  /**
   * A signed lease the composer minted for this runtime (P1-67: a Studio native task). Under a compiled plan whose
   * `identity-binding` requires a lease (L0-IDN-01) every call binds it; otherwise it is unused. Scrubbed from output.
   */
  readonly leaseToken?: string;
  /** Explicit operator acceptance of an unconfined macOS shell (P0-06); ignored on Linux and refused elsewhere. */
  readonly unconfinedShell?: ExplicitShellOptIn;
  /** Set only for a delegated child: the parent's decision (null when unknown), which the child can never widen. */
  readonly parentShell?: NativeShellReadiness | null;
  /**
   * Enables the `delegate` tool (P6.1a).
   *
   * Absent means an agent that cannot delegate, which is the default: delegation
   * is a capability a caller grants, not one every toolset has. It carries the
   * caller's `DelegationIdentity` because depth cannot be read from `agentId` —
   * every run in a chain shares `governedAs` by design.
   */
  readonly subagents?: SubagentCapability;
  /**
   * Set only for a delegated child: its run id, its place in the chain and its scope, recorded in every authorization
   * record (P1-02) and rechecked there. A call outside `allowedActionClasses` is denied `scope_widened`.
   */
  readonly delegation?: {
    readonly runAs: string;
    readonly depth: number;
    /** The signed delegation packet that authorized this child. */
    readonly parentExecutionId: string | null;
    readonly allowedActionClasses?: readonly ActionClass[];
  };
  /** Human answerer for `ask_user` (P1-43). Absent: every ask_user call refuses. */
  readonly askUser?: AskUserAnswerer;
  /** Search provider for `web_search` (P1-43). Absent: every web_search call is denied; there is no default. */
  readonly webSearchProvider?: WebSearchProvider;
  /** Session the evidence rows belong to. Defaults to a per-agent bucket. */
  /**
   * The session tool evidence belongs to. REQUIRED, and deliberately so.
   *
   * This used to default to `toolset-${agentId}`, a session nothing ever
   * created -- so any run that actually called a tool wrote rows referencing a
   * session with no row of its own, and `verifyLedgerIntegrity` reported
   * "references missing session". The default looked reasonable at every call
   * site and was wrong at all of them, which is why there is no longer one: a
   * caller that cannot name the session its tools are running for does not know
   * what it is recording.
   */
  readonly sessionId: string;
  /**
   * The live session writer, when the caller has one.
   *
   * Supplied, tool evidence joins the session SPINE and the session stays
   * anchorable. It is required for an owned native session: the raw ledger
   * correctly refuses unfenced writes to that session. Without a native
   * session, legacy callers can still record through the raw ledger; those
   * rows do not establish an anchorable native session.
   *
   * Optional rather than required because a toolset is legitimately built
   * without a session in tests and in the code-mode confinement probes, and a
   * required parameter there would be a session invented to satisfy a signature.
   */
  readonly recorder?: {
    recordProjectedEvidence(row: {
      readonly eventType: "audit" | "metric" | "stdout";
      readonly payload: string;
      readonly meta: Record<string, unknown>;
    }): unknown;
  };
}

/** What a workspace still needs before a governed agent can do anything. */
export interface ToolsetReadiness {
  readonly ready: boolean;
  /** One line per blocker, each naming the command that fixes it. */
  readonly blockers: readonly string[];
  /**
   * Whether THIS PROCESS is OS-confined. Gates Code Mode.
   *
   * Not the same question as {@link sandboxBackendAvailable}, and conflating
   * them is what let model-written code run unconfined on every Mac while the
   * system reported itself sandboxed.
   *
   * Derived from {@link confinement} by `processIsConfined`: true for the
   * measured verdict "confined" and for nothing else. An "unknown" measurement
   * is false here, so every consumer of this flag fails closed without having
   * to know the tri-state exists.
   */
  readonly confined: boolean;
  /** The measurement {@link confined} was derived from: verdict, the probe write, and why. */
  readonly confinement: ConfinementMeasurement;
  /** Whether this MACHINE has a sandbox backend at all. Reported to the operator. */
  readonly sandboxBackendAvailable: boolean;
  readonly sandboxReason: string | null;
  /**
   * Where the signed allowlist currently lets the agent write.
   *
   * Surfaced rather than widened. The shipped default is deliberately narrow,
   * and an operator who wants an agent editing a whole repository should widen
   * it on its own merits — but they cannot decide that without being told what
   * it is.
   */
  readonly writeScope: readonly string[];
  /** Whether `bash` is offered, and under what enforcement (P0-06). */
  readonly shell: NativeShellReadiness;
}

/**
 * Check the two signed configs and the sandbox BEFORE running anything.
 *
 * Without this an operator's first `amc agent` in a fresh repo produces a wall
 * of denials — the firewall guard denies without a signed policy (ADR-0011),
 * the allowlist guard denies anything absent from a signed `tools.yaml` — and
 * the failure reads as broken tools rather than as unconfigured policy. Correct
 * for a regulated deployment; hostile as a first run. The fix is to say so
 * once, up front, naming the commands.
 */
export function checkToolsetReadiness(workspace: string, options: {
  readonly snapshot?: VerifiedToolsConfigSnapshot;
  readonly additionalCapabilities?: readonly NativeToolCapability[];
  readonly unconfinedShell?: ExplicitShellOptIn;
  readonly parentShell?: NativeShellReadiness | null;
} = {}): ToolsetReadiness {
  const blockers: string[] = [];

  // The path helper, not a string literal: a check that drifts from the thing
  // it checks reports "ready" for a workspace that is not.
  if (!existsSync(runtimeFirewallPolicyPath(workspace))) {
    blockers.push("no signed runtime firewall policy — run: amc firewall enable");
  }

  const snapshot = options.snapshot ?? loadVerifiedToolsConfigSnapshot(workspace);
  const selected = selectSupportedNativeTools(snapshot, options.additionalCapabilities);
  if (!snapshot.signatureValid || !snapshot.config) {
    blockers.push(`tool allowlist is not verifiable (${snapshot.reason ?? "unknown reason"}) — inspect: amc tools verify`);
  } else if (selected.length === 0) {
    blockers.push("the signed tool allowlist grants no supported native capability with its exact name, action class and context — review .amc/tools.yaml, then run: amc tools sign");
  }

  const writeScope = [...new Set(selected.filter(tool => tool.name === "fs.write" || tool.name === "fs.edit")
    .flatMap(tool => tool.allow?.paths ?? []))];

  const sandbox = new SandboxRunner();
  const backend = sandbox.select();
  // Measured once, here, and both `confined` and its reason derive from the
  // same measurement so they cannot disagree. Code Mode reads the derived flag.
  const confinement = measureProcessConfinement();
  const confinementReason = processConfinementReason(confinement);
  return {
    ready: blockers.length === 0,
    blockers,
    confined: processIsConfined(confinement),
    confinement,
    sandboxBackendAvailable: backend !== null,
    // The process measurement leads; the machine's missing backends are the
    // second, different fact an operator can act on.
    sandboxReason: backend === null
      ? `${confinementReason}; no sandbox backend on this machine: ${sandbox.unavailableReasons().join("; ")}`
      : confinementReason,
    writeScope,
    shell: options.parentShell === undefined ? nativeShellReadiness(workspace, options.unconfinedShell)
      : childShellReadiness(workspace, options.parentShell)
  };
}

export interface AgentToolset {
  readonly seam: AgentToolSeam;
  readonly registry: ToolRegistry;
  readonly pipeline: ToolPipeline;
  readonly readiness: ToolsetReadiness;
  /**
   * Release the evidence handle this toolset holds.
   *
   * Explicit rather than implicit: the recorder keeps one ledger open for the
   * run, and a caller that forgot to close would leak a SQLite handle per
   * agent. Safe to call more than once.
   */
  close(): void;
}

export function agentToolset(options: AgentToolsetOptions): AgentToolset {
  if (options.expectedToolsDigest !== undefined && !/^[a-f0-9]{64}$/.test(options.expectedToolsDigest)) throw new Error("Invalid native tool policy digest pin.");
  // `agentId` KEYS BUDGETS AND GUARD SCOPES. `budgetForAgent` falls back to the
  // `default` limits for an unknown id while usage is counted per id, and
  // `ToolRegistry` resolves guard scopes with `scopes.get(execution.agentId)` —
  // and scopes are where guards NARROW. So an unfamiliar id here means a full
  // unspent budget and none of the parent's restrictions.
  //
  // For a delegated child this must be `DelegationIdentity.governedAs` — the
  // ROOT's id — never the child's own `runAs`. See src/agent/subagentSpawn.ts
  // and src/agent/delegationIdentity.ts. Passing `runAs` reads more natural and
  // is the escape; tests/subagentSpawn.test.ts turns red if it happens.
  const { workspace, agentId } = options;
  // P1-12: an active compiled plan makes this a regulated profile. One that does not verify refuses the session.
  let compiled: ReturnType<typeof loadActiveCompiledPolicy>;
  try {
    compiled = loadActiveCompiledPolicy(workspace);
  } catch (error) {
    throw new Error(`Refusing to start: the active compiled policy cannot be verified (${error instanceof Error ? error.message : String(error)}). Restore .amc/control-plan/ from backup, or recompile and reactivate with amc catalog compile --activate (docs/catalog/COMPILER.md)`);
  }
  // P1-67: bound only when the pinned plan's identity-binding requires a lease (L0-IDN-01); otherwise records bind as before.
  const leaseToken = planRequiresAgentLease(compiled) ? options.leaseToken : undefined;
  const scrubValues = [...(options.scrubValues ?? []), ...(options.leaseToken ? [options.leaseToken] : [])];
  let ledgerHandle: ReturnType<typeof openLedger> | null = null;
  // Opened on the first journaled call (P1-03), which also recovers what crashed runs left. One that cannot open
  // denies that call `journal_unavailable` and is tried again on the next.
  let journal: ActionJournal | null = null;
  const readiness = checkToolsetReadiness(workspace, { additionalCapabilities: [
    ...(options.additionalCapabilities ?? []), ...(options.subagents ? NATIVE_DELEGATION_CAPABILITIES : [])
  ], ...(options.unconfinedShell === undefined ? {} : { unconfinedShell: options.unconfinedShell }),
  ...(options.parentShell === undefined ? {} : { parentShell: options.parentShell }) });
  const registry = new ToolRegistry();
  const nativeIdentities = new Map([...NATIVE_BUILTIN_CAPABILITIES, ...NATIVE_DELEGATION_CAPABILITIES]
    .map(capability => [capability.name, capability]));

  const ledger = new ReadBeforeEditLedger();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  for (const tool of searchTools()) registry.define(tool);
  // Use the actual native session writer. An owned session refuses raw
  // ledger appends; a receipt write failure also prevents tool success.
  // Returns the row's evidence event id when the writer reports one.
  const recordAudit = (receipt: Record<string, unknown>): string | null => {
    const row = { eventType: "audit" as const, payload: JSON.stringify(receipt), meta: receipt };
    if (!options.recorder) {
      ledgerHandle ??= openLedger(workspace);
      return ledgerHandle.appendEvidence({ sessionId: options.sessionId, runtime: "amc", ...row, payloadExt: "json" });
    }
    const ref = options.recorder.recordProjectedEvidence(row) as { readonly eventId?: unknown } | null | undefined;
    return typeof ref?.eventId === "string" ? ref.eventId : null;
  };
  // P1-12: one effective-policy receipt per session and guard set, written before the session's first governed
  // call (the CLI binds its writer after composing). A receipt that cannot be written denies the call.
  let receipt: { readonly key: string; readonly ref: string } | null = null;
  const ensureReceipt = (guardLabels: readonly string[]): string => {
    const sessionId = options.sessionId;
    const key = `${sessionId}\0${guardLabels.join(",")}`;
    if (receipt?.key !== key) {
      // Named only when the pipeline's own verifier accepts the lease now; every call still verifies it again.
      const lease = leaseToken === undefined ? null : checkLease({ workspace, agentId }, leaseToken);
      const leaseId = lease !== null && !("ok" in lease) ? lease.payload.leaseId : null;
      receipt = { key, ref: writeEffectivePolicyReceipt({ workspace, sessionId, agentId, policy: compiled, guardLabels, leaseId, record: recordAudit }).evidenceRef };
    }
    return receipt.ref;
  };
  // Refused means no `bash` at all: a guessed call is an unknown tool, never an unconfined one.
  const shell = readiness.shell;
  let unconfinedEnabledRecorded = false;
  // Once per composition, lazily: the CLI binds its session writer after composing.
  const recordUnconfinedEnabled = (): void => {
    if (shell.decision !== "unconfined-opt-in" || unconfinedEnabledRecorded) return;
    recordAudit({ schemaVersion: "2026-09-08", auditType: "NATIVE_SHELL_UNCONFINED_ENABLED", platform: process.platform,
      optInSource: shell.optInSource, sessionId: options.sessionId });
    unconfinedEnabledRecorded = true;
  };
  if (shell.decision === "confined") registry.define(createNativeSandboxBash({
    workspace,
    scrubValues,
    // The per-call refusal stays: availability at composition is a prerequisite, not proof.
    record: (execution, outcome) => recordAudit({
      schemaVersion: "2026-09-08", auditType: "NATIVE_SHELL_CONFINEMENT", platform: process.platform,
      backend: outcome.backend, confined: outcome.confined, failure: outcome.failure,
      enforcementLevel: outcome.confined ? "enforced" : "none", boundary: shell.boundary,
      writableRoots: outcome.confined ? outcome.writableRoots : [], enforcement: outcome.enforcement ?? null,
      exitCode: outcome.exitCode, timedOut: outcome.timedOut, cancelled: outcome.cancelled ?? false,
      treeExitProven: outcome.treeExitProven ?? false, droppedBytes: outcome.droppedBytes ?? 0,
      callId: execution.callId, rootCallId: execution.rootCallId, token: execution.token
    }),
    // Written before the proxy acts on the decision; a failed write denies the connection.
    recordEgress: (execution, row) => recordAudit({
      schemaVersion: "2026-09-08", auditType: "NATIVE_SHELL_EGRESS", platform: process.platform, boundary: shell.boundary, ...row,
      callId: execution.callId, rootCallId: execution.rootCallId, token: execution.token
    })
  }));
  if (shell.decision === "unconfined-opt-in") {
    process.stderr.write(`${shell.reason}\n`);
    const unconfined = bashTool({ scrubValues });
    registry.define({ ...unconfined, body: execution => {
      // Recorded before the command runs, so no unconfined execution goes unreceipted.
      if (execution.effectiveMode !== "SIMULATE") {
        recordUnconfinedEnabled();
        recordAudit({ schemaVersion: "2026-09-08", auditType: "NATIVE_SHELL_CONFINEMENT", platform: process.platform,
          backend: "none", confined: false, enforcementLevel: "none", optInSource: shell.optInSource,
          callId: execution.callId, rootCallId: execution.rootCallId, token: execution.token });
      }
      return unconfined.body(execution);
    } });
  }
  // P1-43 (AMC-1549): registered, and denied until a signed tools policy lists
  // them. Their receipts take the shell receipts' path (recordAudit); a failed
  // write fails the call. Who, where and which call come from the execution and
  // the session read per call, never from the tool.
  const recordNative: NativeReceiptRecorder = (execution, receipt) => recordAudit({
    schemaVersion: "2026-10-07", ...receipt, tool: execution.name, sessionId: options.sessionId, agentId: execution.agentId,
    callId: execution.callId, rootCallId: execution.rootCallId, token: execution.token
  });
  // The session getter is rebound by fork/resume after construction, so these
  // read it per call rather than capturing it now.
  const currentSessionId = (): string => options.sessionId;
  registry.define(webFetchTool({ record: recordNative }));
  registry.define(webSearchTool({ record: recordNative, ...(options.webSearchProvider ? { provider: options.webSearchProvider } : {}) }));
  registry.define(askUserTool({ sessionId: currentSessionId, record: recordNative, ...(options.askUser ? { answerer: options.askUser } : {}) }));
  registry.define(todoTool({ sessionId: currentSessionId, record: recordNative }));
  registry.define(planTool({ sessionId: currentSessionId, record: recordNative }));
  if (options.subagents !== undefined) {
    // Both tools, from one capability. `delegate` is one child; `workflow` is a
    // declared plan of them. Each is still gated a second time by the operator's
    // signed allowlist, and separately -- permitting one does not permit the
    // other, because their fan-out differs by up to MAX_PLAN_NODES.
    registry.define(delegateTool(options.subagents));
    registry.define(workflowTool(options.subagents));
  }

  // Order is a reporting choice, not a semantic one: guards cannot allow, so
  // whichever denies first is simply the one named. Policy engines come before
  // the allowlist so a denial reads as "the firewall stopped this" rather than
  // "this tool is not listed", which is the more actionable of two true answers.
  // The compiled policy goes first so its receipt exists before any guard decides.
  const policyGuard = compiledPolicyGuard(workspace, compiled);
  registry.guard("compiled-policy", execution => {
    try {
      ensureReceipt(registry.guardLabelsFor(execution));
    } catch (error) {
      return `effective-policy receipt could not be recorded: ${error instanceof Error ? error.message : String(error)}`;
    }
    return policyGuard(execution);
  });
  registry.guard("prompt-injection", promptInjectionGuard());
  registry.guard("runtime-firewall", runtimeFirewallGuard(workspace));
  // CLI binds the native writer after constructing the toolset; forks can
  // replace it. Resolve the current session only when the guard executes.
  registry.guard("budgets", execution => budgetGuard(workspace, options.sessionId)(execution));
  // web_search's destination is its composed provider's declared origin, never
  // a url the model passes; both host checks read that. Unconfigured, it names
  // no url and network-egress denies it.
  const governedArguments = (execution: ToolExecution): Readonly<Record<string, unknown>> =>
    execution.name === "web_search" ? { ...execution.arguments, url: options.webSearchProvider?.origin } : execution.arguments;
  registry.guard("network-egress", networkEgressGuard(workspace, governedArguments));
  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace, execution => registry.visible(execution.agentId).get(execution.name), options.expectedToolsDigest, governedArguments));
  registry.guard("native-tool-identity", execution => {
    const identity = nativeIdentities.get(execution.name);
    if (!identity) return undefined; // Late reviewed extensions retain their own mount and policy guards.
    const selected = selectSupportedNativeTools(loadVerifiedToolsConfigSnapshot(workspace), NATIVE_DELEGATION_CAPABILITIES);
    return execution.actionClass === identity.actionClass && selected.some(tool => tool.name === execution.name)
      ? undefined : "native tool is absent or its signed action class/context does not match the implementation";
  });

  const facts = compiled ? compiledPolicyFacts(compiled) : null;
  const pipeline = new ToolPipeline({
    registry,
    workspace,
    ...(options.mode ? { mode: options.mode } : {}),
    journal: () => (journal ??= openActionJournal(workspace)),
    // Under a compiled policy every call is bound to a record, and its approval classes need a signed approval.
    ...(compiled ? { authorizeClasses: new Set<string>(ACTION_CLASSES), boundApprovalRequiredFor: compiledApprovalClasses(compiled) } : {}),
    // Read per call: the CLI binds its session writer after composing.
    authorizationContext: () => {
      let evidenceRefs: string[] = [];
      try {
        evidenceRefs = [ensureReceipt(registry.guardLabelsFor({ agentId } as ToolExecution))];
      } catch {
        // Not swallowed: the compiled-policy guard retries the write and denies the call with the reason.
      }
      return { sessionId: options.sessionId, evidenceRefs, ...(facts ? { compiledPolicy: facts } : {}), ...(leaseToken === undefined ? {} : { leaseToken }),
        ...(options.delegation === undefined ? {} : { runAs: options.delegation.runAs, delegation: options.delegation }) };
    },
    // Enforcement that leaves no trace is advisory again at the only moment
    // that matters. Every governed call — allowed, denied or failed — lands in
    // the signed spine.
    // No try/catch here: `ToolPipeline` owns the guarantee that a failing
    // recorder cannot break a call, which is where it can actually be tested.
    record: (execution, outcome) => {
      // One handle for the run, not one per call. Measured: opening and
      // closing the ledger costs 1.6ms, which on a path this hot is a third of
      // the whole governed call. `close()` on the toolset releases it.
      ledgerHandle ??= openLedger(workspace);
      // The guards COMPOSED for this call, not just the one that denied.
      // A permitted call is a receipt that the control evaluated it, which is
      // what the question bank asks for; a denial alone cannot say which
      // controls were in force.
      const evidence = toolEvidenceFor(
        { ...execution, appliedGuards: registry.guardLabelsFor(execution) },
        outcome
      );
      const recorder = options.recorder;
      if (recorder) {
        // Through the session's own writer, so the rows carry an envelope and
        // sit in the spine they describe. See `recordProjectedEvidence`.
        for (const row of evidence) {
          recorder.recordProjectedEvidence({
            eventType: row.eventType,
            payload: row.payload,
            meta: row.meta
          });
        }
      } else {
        ledgerHandle.appendEvidenceBatch(
          evidence.map((row) => ({
            sessionId: options.sessionId,
            runtime: "amc" as const,
            eventType: row.eventType,
            payload: row.payload,
            payloadExt: "json" as const,
            meta: row.meta
          }))
        );
      }
    }
  });

  if (options.mode === "code") {
    registry.defineCodeTransport(runCodeTool({
      pipeline: () => pipeline,
      // Code Mode refuses to run without OS confinement, because a program can
      // bypass the tools binding and the sandbox is the only thing that stops
      // it. Passing the measured answer rather than a hopeful constant.
      confined: () => readiness.confined
    }));
  }

  const seam = pipelineToolSeam({ registry, pipeline, agentId });
  return {
    seam: { ...seam, schemas: () => {
      recordUnconfinedEnabled();
      const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
      // The body guard runs after model/approval waits. It cannot stop a newer
      // signed policy from exposing unreviewed schemas to that earlier request.
      // Refuse before model preparation rather than silently switching to no tools.
      if (options.expectedToolsDigest !== undefined && (!snapshot.signatureValid || !snapshot.config
        || snapshot.digestSha256 !== options.expectedToolsDigest)) {
        throw new Error("The signed workspace tool policy changed or cannot be verified. Review the current scope and start a new pinned native session before another model request.");
      }
      const selected = new Set(selectSupportedNativeTools(snapshot, NATIVE_DELEGATION_CAPABILITIES).map(tool => tool.name));
      // Keep bodies registered for recorded refusals of guessed built-in calls.
      // Visibility still honors registry restrictions, late mounts and run_code.
      // P1-12: the plan pinned at start also hides what its visibleTools omit; the compiled-policy guard still denies them.
      const schemas = seam.schemas()?.filter(schema => (!compiled || compiledPolicyShows(compiled, schema.name)) && (!nativeIdentities.has(schema.name)
        || (selected.has(schema.name) && registry.visible(agentId).get(schema.name)?.actionClass === nativeIdentities.get(schema.name)?.actionClass)));
      return schemas?.length ? schemas : null;
    } },
    registry,
    pipeline,
    readiness,
    close: (): void => {
      ledgerHandle?.close();
      ledgerHandle = null;
      journal?.close();
      journal = null;
    }
  };
}
