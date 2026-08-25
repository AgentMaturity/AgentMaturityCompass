import { existsSync } from "node:fs";
import { runCodeTool } from "../codemode/runCodeTool.js";
import { runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { SandboxRunner } from "../sandbox/sandboxRunner.js";
import { bashTool } from "../tools/builtin/bashTool.js";
import { fsTools } from "../tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../tools/builtin/readBeforeEdit.js";
import { searchTools } from "../tools/builtin/searchTools.js";
import { budgetGuard, networkEgressGuard, runtimeFirewallGuard, toolhubAllowlistGuard } from "../tools/guards/policyGuards.js";
import { ToolPipeline } from "../tools/toolPipeline.js";
import { ToolRegistry } from "../tools/toolRegistry.js";
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
  readonly confined: boolean;
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
    confined: backend !== null,
    sandboxReason: backend === null ? sandbox.unavailableReasons().join("; ") : null,
    writeScope
  };
}

export interface AgentToolset {
  readonly seam: AgentToolSeam;
  readonly registry: ToolRegistry;
  readonly pipeline: ToolPipeline;
  readonly readiness: ToolsetReadiness;
}

export function agentToolset(options: AgentToolsetOptions): AgentToolset {
  const { workspace, agentId } = options;
  const readiness = checkToolsetReadiness(workspace);
  const registry = new ToolRegistry();

  const ledger = new ReadBeforeEditLedger();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  for (const tool of searchTools()) registry.define(tool);
  registry.define(bashTool(options.scrubValues ? { scrubValues: options.scrubValues } : {}));

  // Order is a reporting choice, not a semantic one: guards cannot allow, so
  // whichever denies first is simply the one named. Policy engines come before
  // the allowlist so a denial reads as "the firewall stopped this" rather than
  // "this tool is not listed", which is the more actionable of two true answers.
  registry.guard("runtime-firewall", runtimeFirewallGuard(workspace));
  registry.guard("budgets", budgetGuard(workspace));
  registry.guard("network-egress", networkEgressGuard(workspace));
  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace));

  const pipeline = new ToolPipeline({
    registry,
    workspace,
    ...(options.mode ? { mode: options.mode } : {})
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

  return { seam: pipelineToolSeam({ registry, pipeline, agentId }), registry, pipeline, readiness };
}
