import type { ToolDefinition as SignedToolDefinition } from "../toolhub/toolsSchema.js";
import { selectedToolDefinitionFor } from "../tools/toolPipeline.js";
import { bashTool } from "../tools/builtin/bashTool.js";
import type { ToolDefinition, ToolExecution } from "../tools/toolTypes.js";
import { bwrapBackend } from "./bwrapBackend.js";
import { SandboxRunner } from "./sandboxRunner.js";
import type { SandboxOutcome } from "./sandboxTypes.js";

declare const permitBrand: unique symbol;
/** Opaque in-process evidence of the exact confined definition, never a caller flag. */
export interface NativeSandboxValidationPermit { readonly [permitBrand]: true }
interface Admission {
  readonly workspace: string;
  readonly tool: SignedToolDefinition;
  readonly args: Readonly<Record<string, unknown>>;
  readonly policySha256: string;
  readonly toolJson: string;
  readonly executionJson: string;
  readonly signal: AbortSignal | undefined;
}
const permits = new WeakMap<NativeSandboxValidationPermit, Admission>();
const bindings = new WeakMap<ToolDefinition, {
  readonly workspace: string;
  readonly admissions: WeakMap<ToolExecution, NativeSandboxValidationPermit>;
}>();
function executionJson(execution: ToolExecution): string {
  return JSON.stringify([execution.token, execution.callId, execution.rootCallId, execution.name,
    execution.agentId, execution.workspace, execution.actionClass, execution.requestedMode,
    execution.effectiveMode, execution.parentToken, execution.arguments]);
}

/** Called by the signed allowlist guard with the actual visible registry definition. */
export function admitNativeSandboxPolicy(
  definition: ToolDefinition | undefined, execution: ToolExecution,
  tool: SignedToolDefinition, policySha256: string
): NativeSandboxValidationPermit | undefined {
  const binding = definition && bindings.get(definition);
  if (!binding || selectedToolDefinitionFor(execution) !== definition || process.platform !== "linux" || execution.workspace !== binding.workspace ||
      execution.name !== "bash" || execution.actionClass !== "WRITE_HIGH" ||
      tool.name !== "bash" || tool.actionClass !== "WRITE_HIGH" || tool.context?.kind === "mcp" ||
      !/^[a-f0-9]{64}$/.test(policySha256)) return undefined;
  const permit = Object.freeze({}) as NativeSandboxValidationPermit;
  permits.set(permit, { workspace: binding.workspace, tool, args: execution.arguments, policySha256,
    toolJson: JSON.stringify(tool), executionJson: executionJson(execution), signal: execution.signal });
  binding.admissions.set(execution, permit);
  return permit;
}

/** A serialized/forged permit, copied arguments, or changed signed entry never matches. */
export function nativeSandboxPermitMatches(permit: NativeSandboxValidationPermit | undefined,
  workspace: string, tool: SignedToolDefinition, args: Readonly<Record<string, unknown>>): boolean {
  const admission = permit && permits.get(permit);
  return !!admission && process.platform === "linux" && admission.workspace === workspace &&
    admission.tool === tool && admission.args === args && admission.toolJson === JSON.stringify(tool);
}

/**
 * Own the actual launcher and freeze the definition. No injected body, backend,
 * platform assertion, or unconfined fallback can acquire this private binding.
 */
export function createNativeSandboxBash(options: {
  readonly workspace: string;
  readonly scrubValues?: readonly string[];
  readonly record: (execution: ToolExecution, outcome: SandboxOutcome) => void;
}): ToolDefinition {
  const { workspace, record } = options;
  const scrubValues = Object.freeze([...(options.scrubValues ?? [])]);
  const admissions = new WeakMap<ToolExecution, NativeSandboxValidationPermit>();
  const tool: ToolDefinition = Object.freeze(bashTool({ scrubValues, runConfined: async (execution, command, timeoutMs) => {
    const permit = admissions.get(execution);
    admissions.delete(execution);
    const admission = permit && permits.get(permit);
    let outcome: SandboxOutcome;
    try {
      if (!admission || selectedToolDefinitionFor(execution) !== tool || executionJson(execution) !== admission.executionJson || execution.signal !== admission.signal ||
          !nativeSandboxPermitMatches(permit, workspace, admission.tool, execution.arguments)) {
        throw new Error("Native shell requires its unchanged confined tool binding and signed policy admission.");
      }
      // Lazy imports avoid making policy validation depend on its own loader.
      // Repeat ordinary constraints here as well: obtaining a binding is not
      // permission to bypass path, argv, binary, or host checks.
      const { validateToolRequest } = await import("../toolhub/toolhubValidators.js");
      const verdict = validateToolRequest({ workspace, tool: admission.tool, args: execution.arguments,
        nativeSandboxPermit: permit });
      if (!verdict.ok) throw new Error(`Native shell policy refused: ${verdict.reason ?? "unknown reason"}`);
      const { nativeShellSandboxPolicy } = await import("./nativeSandboxPolicy.js");
      if (executionJson(execution) !== admission.executionJson || execution.signal !== admission.signal) throw new Error("Native shell execution changed after admission.");
      if (execution.signal?.aborted) throw new Error("Native shell was cancelled before dispatch.");
      const policy = nativeShellSandboxPolicy(workspace, timeoutMs, execution.signal, scrubValues, admission.policySha256);
      outcome = await new SandboxRunner({ backends: [bwrapBackend()] }).run(["/bin/sh", "-c", command], workspace, policy);
    } catch (error) {
      outcome = { confined: false, backend: "none", failure: { kind: "runner-failure",
        reason: error instanceof Error ? error.message : "The Linux shell policy or launcher did not finish; execution and confinement are unconfirmed." },
        exitCode: null, timedOut: false, cancelled: execution.signal?.aborted ?? false, stdout: "", stderr: "", writableRoots: [], treeExitProven: false };
    } finally {
      if (permit) permits.delete(permit);
    }
    record(execution, outcome);
    return outcome;
  }}));
  bindings.set(tool, { workspace, admissions });
  return tool;
}
