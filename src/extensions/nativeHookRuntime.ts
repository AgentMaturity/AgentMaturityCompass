import type { ToolExecution } from "../tools/toolTypes.js";
import type { NativeExtensionHookFailure } from "./nativeExtensionHooks.js";
import type { NativeExtensionHookEvent } from "./nativeExtensionHookSchema.js";
import { loadNativeCommandHooks } from "./nativeCommandHookConfig.js";
import { NativeCommandHooks } from "./nativeCommandHooks.js";

/**
 * What the toolset, the pipeline and the driver need from a hook runtime: observers that cannot veto, and a deny-only
 * guard prepared asynchronously after approvals and decided synchronously at the effect boundary (D55). Both the signed
 * executable-extension runtime and the operator's command hooks implement it, so composing them adds no branch anywhere.
 */
export interface NativeHookRuntime {
  readonly active: boolean;
  reports(): readonly NativeExtensionHookFailure[];
  observe(event: NativeExtensionHookEvent, signal?: AbortSignal): Promise<readonly NativeExtensionHookFailure[]>;
  readonly prepare: (execution: ToolExecution) => Promise<void>;
  readonly guard: (execution: ToolExecution) => string | undefined;
}

/** Fan out to every part: any denial denies, reports concatenate. One part is returned as itself. */
export function composeNativeHooks(parts: readonly (NativeHookRuntime | undefined)[]): NativeHookRuntime | undefined {
  const present = parts.filter((part): part is NativeHookRuntime => part !== undefined);
  if (present.length <= 1) return present[0];
  return {
    get active() { return present.some(part => part.active); },
    reports: () => present.flatMap(part => part.reports()),
    observe: async (event, signal) => {
      const reports: NativeExtensionHookFailure[] = [];
      for (const part of present) reports.push(...await part.observe(event, signal));
      return reports;
    },
    prepare: async execution => { for (const part of present) await part.prepare(execution); },
    guard: execution => { for (const part of present) { const reason = part.guard(execution); if (reason !== undefined) return reason; } return undefined; }
  };
}

/**
 * The hook runtime for one toolset: the caller's extension hooks plus the workspace's command hooks. Composed INSIDE
 * `agentToolset`, so a delegated child, an ACP/SDK session and the CLI root all carry the same guard; a PreToolUse deny
 * cannot be routed around through `delegate`. With no hooks.json present the caller's runtime is returned unchanged.
 */
export function workspaceNativeHooks(workspace: string, sessionId: () => string | null, extension?: NativeHookRuntime): NativeHookRuntime | undefined {
  const load = loadNativeCommandHooks(workspace);
  if (load.status === "absent") return extension;
  return composeNativeHooks([extension, new NativeCommandHooks(load, { workspace, sessionId })]);
}
