import { existsSync } from "node:fs";
import { runCodeTool } from "../codemode/runCodeTool.js";
import { runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { SandboxRunner } from "../sandbox/sandboxRunner.js";
import { nativeShellSandboxPolicy } from "../sandbox/nativeSandboxPolicy.js";
import type { SandboxOutcome } from "../sandbox/sandboxTypes.js";
import { processConfinementReason, processIsConfined } from "../sandbox/processConfinement.js";
import { bashTool } from "../tools/builtin/bashTool.js";
import { fsTools } from "../tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../tools/builtin/readBeforeEdit.js";
import { searchTools } from "../tools/builtin/searchTools.js";
import {
  budgetGuard,
  networkEgressGuard,
  promptInjectionGuard,
  runtimeFirewallGuard,
  toolhubAllowlistGuard
} from "../tools/guards/policyGuards.js";
import { ToolPipeline } from "../tools/toolPipeline.js";
import { ToolRegistry } from "../tools/toolRegistry.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import { openLedger } from "../ledger/ledger.js";
import { toolEvidenceFor } from "../tools/toolEvidence.js";
import { delegateTool, type SubagentCapability } from "./delegateTool.js";
import { workflowTool } from "../workflow/workflowTool.js";
import { pipelineToolSeam } from "./pipelineToolSeam.js";
import type { AgentToolSeam } from "./toolSeam.js";

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
  /** `code` collapses every direct call onto `run_code`. */
  readonly mode?: "native" | "code";
  /** Values scrubbed from tool output, e.g. a live lease. */
  readonly scrubValues?: readonly string[];
  /**
   * Enables the `delegate` tool (P6.1a).
   *
   * Absent means an agent that cannot delegate, which is the default: delegation
   * is a capability a caller grants, not one every toolset has. It carries the
   * caller's `DelegationIdentity` because depth cannot be read from `agentId` —
   * every run in a chain shares `governedAs` by design.
   */
  readonly subagents?: SubagentCapability;
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

/**
 * The tools this composition registers, by name.
 *
 * Listed rather than derived from the registry, because readiness is checked
 * BEFORE the registry is built — a caller needs to know whether to proceed,
 * not to be told after assembling something that cannot run.
 */
const BUILTIN_TOOL_NAMES = ["fs.read", "fs.write", "fs.edit", "glob", "grep", "bash"] as const;

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
   */
  readonly confined: boolean;
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
export function checkToolsetReadiness(workspace: string): ToolsetReadiness {
  const blockers: string[] = [];

  // The path helper, not a string literal: a check that drifts from the thing
  // it checks reports "ready" for a workspace that is not.
  if (!existsSync(runtimeFirewallPolicyPath(workspace))) {
    blockers.push("no signed runtime firewall policy — run: amc firewall enable");
  }

  // `amc init` already writes and signs tools.yaml, so a MISSING allowlist is
  // not the usual first-run problem. The usual one is an allowlist signed by
  // an older init that predates these tools: the config verifies, the guard
  // consults it, and every built-in is denied for not being listed.
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config) {
    blockers.push(`tool allowlist is not verifiable (${snapshot.reason ?? "unknown reason"}) — run: amc tools init`);
  } else {
    const config = snapshot.config;
    const missing = BUILTIN_TOOL_NAMES.filter((name) => findToolDefinition(config, name) === null);
    if (missing.length > 0) {
      blockers.push(
        `the signed tool allowlist does not name ${missing.join(", ")} — ` +
        "re-run: amc tools init (this overwrites .amc/tools.yaml)"
      );
    }
  }

  const writeScope = snapshot.config
    ? [...new Set(
        ["fs.write", "fs.edit"]
          .map((name) => findToolDefinition(snapshot.config as NonNullable<typeof snapshot.config>, name))
          .flatMap((definition) => definition?.allow?.paths ?? [])
      )]
    : [];

  const sandbox = new SandboxRunner();
  const backend = sandbox.select();
  return {
    ready: blockers.length === 0,
    blockers,
    confined: processIsConfined(),
    sandboxBackendAvailable: backend !== null,
    sandboxReason: backend === null
      ? sandbox.unavailableReasons().join("; ")
      : processConfinementReason(),
    writeScope
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
  let ledgerHandle: ReturnType<typeof openLedger> | null = null;
  const readiness = checkToolsetReadiness(workspace);
  const registry = new ToolRegistry();

  const ledger = new ReadBeforeEditLedger();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  for (const tool of searchTools()) registry.define(tool);
  registry.define(bashTool({
    ...(options.scrubValues ? { scrubValues: options.scrubValues } : {}),
    ...(process.platform === "linux" ? {
      runConfined: async (execution: ToolExecution, command: string, timeoutMs: number) => {
        let outcome: SandboxOutcome;
        try {
          const policy = nativeShellSandboxPolicy(workspace, timeoutMs, execution.signal, options.scrubValues);
          outcome = await new SandboxRunner().run(["/bin/sh", "-c", command], workspace, policy);
        } catch {
          outcome = { confined: false, backend: "none", failure: { kind: "runner-failure", reason: "The Linux shell policy or launcher did not finish; execution and confinement are unconfirmed." },
            exitCode: null, timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: false };
        }
        const receipt = {
          schemaVersion: "2026-09-08", auditType: "NATIVE_SHELL_CONFINEMENT", platform: process.platform,
          backend: outcome.backend, confined: outcome.confined, failure: outcome.failure,
          writableRoots: outcome.confined ? outcome.writableRoots : [], enforcement: outcome.enforcement ?? null,
          exitCode: outcome.exitCode, timedOut: outcome.timedOut, cancelled: outcome.cancelled ?? false,
          treeExitProven: outcome.treeExitProven ?? false, droppedBytes: outcome.droppedBytes ?? 0,
          callId: execution.callId, rootCallId: execution.rootCallId, token: execution.token
        };
        const row = { eventType: "audit" as const, payload: JSON.stringify(receipt), meta: receipt };
        // Use the actual native session writer. An owned session refuses raw
        // ledger appends; a receipt write failure also prevents tool success.
        if (options.recorder) options.recorder.recordProjectedEvidence(row);
        else {
          ledgerHandle ??= openLedger(workspace);
          ledgerHandle.appendEvidence({ sessionId: options.sessionId, runtime: "amc", ...row, payloadExt: "json" });
        }
        return outcome;
      }
    } : {})
  }));
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
  registry.guard("prompt-injection", promptInjectionGuard());
  registry.guard("runtime-firewall", runtimeFirewallGuard(workspace));
  registry.guard("budgets", budgetGuard(workspace));
  registry.guard("network-egress", networkEgressGuard(workspace));
  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace));

  const pipeline = new ToolPipeline({
    registry,
    workspace,
    ...(options.mode ? { mode: options.mode } : {}),
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

  return {
    seam: pipelineToolSeam({ registry, pipeline, agentId }),
    registry,
    pipeline,
    readiness,
    close: (): void => {
      ledgerHandle?.close();
      ledgerHandle = null;
    }
  };
}
