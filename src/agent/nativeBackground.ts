/** Owned jobs and terminals shared by the native toolset and kernel facades (WP16). */
import { randomUUID } from "node:crypto";
import { Context } from "../kernel/amcRuntime.js";
import { jobServices } from "../kernel/services/jobServices.js";
import { terminalServices } from "../kernel/services/terminalServices.js";
import { JobRegistry } from "../jobs/jobRegistry.js";
import { jobTools } from "../jobs/jobTools.js";
import { NativeTerminalTools } from "../terminal/nativeTerminalTools.js";
import type { NativeTerminalHostOptions } from "../terminal/nativeTerminal.js";
import type { SandboxOutcome } from "../sandbox/sandboxTypes.js";
import type { ToolPipeline } from "../tools/toolPipeline.js";
import { DefiniteFailureError, type ToolDefinition, type ToolExecution } from "../tools/toolTypes.js";

export function composeNativeBackground(options: {
  readonly workspace: string;
  readonly sessionId: () => string;
  readonly pipeline: () => ToolPipeline;
  readonly confinedShell: () => boolean;
  readonly nativeTerminal?: NativeTerminalHostOptions;
}) {
  const registry = new JobRegistry({ cleanupGraceMs: 3_000 });
  const terminals = new NativeTerminalTools({ workspace: options.workspace, sessionId: options.sessionId,
    ...(options.nativeTerminal === undefined ? {} : { native: options.nativeTerminal }) });
  const ctx = new Context();
  const fibers = [ctx.plugin(jobServices, { registry }), ctx.plugin(terminalServices, { runtime: terminals })];
  const ready = Promise.all(fibers.map(fiber => fiber.await()));
  // A caller may close before a model ever asks for tools. Consume failed setup until a body can report it.
  void ready.catch(() => undefined);
  const running = new Map<string, { output: (text: string) => void; facts?: SandboxOutcome }>();
  let closed = false;
  let shutdown: Promise<boolean> | undefined;
  const jobs = jobTools({ registry, sessionId: options.sessionId,
    ownerStep: (execution: ToolExecution) => execution.ownerStep,
    run: async (execution: ToolExecution, signal: AbortSignal, output: (text: string) => void) => {
      // The start tool's journal receipt and exclusive write lock must settle before bash re-enters this pipeline.
      await new Promise<void>(resolve => setImmediate(resolve));
      if (signal.aborted || closed) return { ok: false, summary: "Job cancelled before shell dispatch.", cleanupConfirmed: true, effect: "not_applied" as const };
      const callId = `job-${randomUUID()}`;
      const entry: { output: (text: string) => void; facts?: SandboxOutcome } = { output };
      running.set(callId, entry);
      try {
        const args = execution.arguments;
        const outcome = await options.pipeline().execute({ name: "bash", agentId: execution.agentId,
          arguments: { command: args.command, ...(args.workdir === undefined ? {} : { workdir: args.workdir }),
            ...(args.description === undefined ? {} : { description: args.description }),
            ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }) },
          requestedMode: execution.requestedMode, callId, rootCallId: execution.rootCallId,
          parentToken: execution.token, signal,
          ...(execution.ownerStep === undefined ? {} : { ownerStep: execution.ownerStep }) });
        const facts = entry.facts;
        const neverStarted = outcome.denied !== null || outcome.action?.state === "cancelled";
        const cleanupConfirmed = neverStarted || facts?.treeExitProven === true;
        const known = cleanupConfirmed && outcome.effect !== "unknown" && outcome.action?.evidenceComplete !== false
          && outcome.action?.state !== "outcome_unknown" && outcome.action?.state !== "started";
        return { ok: outcome.ok && known, summary: outcome.output, cleanupConfirmed,
          exitCode: outcome.exitCode, timedOut: outcome.timedOut,
          effect: !known ? "unknown" as const : neverStarted ? "not_applied" as const : "applied" as const };
      } finally { running.delete(callId); }
    }
  });
  const tools: readonly ToolDefinition[] = [...jobs, ...terminals.tools()].map(tool => ({ ...tool,
    body: async execution => {
      await ready;
      if (closed) throw new DefiniteFailureError("The native background owner is closed.");
      if (tool.name === "job_start" && !options.confinedShell()) {
        return { ok: false, effect: "not_applied", output: "Background jobs require the admitted confined bash binding; no unconfined fallback is available." };
      }
      return tool.body(execution);
    }
  }));
  return {
    tools,
    captureShell(execution: ToolExecution, facts: SandboxOutcome): void { const entry = running.get(execution.callId); if (entry) entry.facts = facts; },
    outputShell(execution: ToolExecution, text: string): void { running.get(execution.callId)?.output(text); },
    hasOwnedWork(): boolean { return running.size > 0 || terminals.hasOwnedWork() || registry.hasOwnedWork(); },
    shutdown(): Promise<boolean> {
      if (shutdown) return shutdown;
      closed = true;
      // Closing admission is synchronous; all owners (including forks) are stopped before any await.
      const stops = registry.disposeAll();
      shutdown = (async () => {
        const [jobs, terminal] = await Promise.all([stops, terminals.dispose()]);
        const disposed = await Promise.allSettled(fibers.map(fiber => fiber.dispose()));
        return terminal && jobs.every(job => job.cleanup === "confirmed") && disposed.every(result => result.status === "fulfilled");
      })();
      return shutdown;
    }
  };
}
