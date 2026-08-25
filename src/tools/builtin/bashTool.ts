import { z } from "zod";
import { runProcess } from "../../exec/runProcess.js";
import { stripProviderKeys } from "../../utils/providerKeys.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";

/**
 * The one-shot shell tool (P4.3).
 *
 * A thin body over `runProcess`, which is the entire point of having built the
 * P4.2 substrate: tree termination, output bounding, credential scrubbing and
 * the timeout all come from there. A bash tool that spawned its own child
 * would be the fourth way this repo starts a process and the first one with
 * none of those.
 *
 * ON ITS ACTION CLASS, HONESTLY. `WRITE_HIGH` is the closest single class, and
 * it understates what a shell can reach: `bash "git push"` is a DEPLOY that
 * `git.push` would have to declare, and `bash "curl …"` is network egress that
 * the NETWORK_EXTERNAL guard cannot see because this tool is not in that
 * class. A shell is not one action class; it is all of them.
 *
 * That is not a hole this tool can close by choosing a different label — no
 * single class is right — so the control is elsewhere and stays elsewhere: the
 * signed `tools.yaml` argv deny-patterns and binary allowlist, applied by
 * `toolhubAllowlistGuard`, and the OS sandbox that P4.4 adds. A deployment
 * that composes this tool without those has given an agent a shell.
 */

const bashArgs = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000)
});

/** Per stream. Output past this is counted and reported, never silently lost. */
const MAX_OUTPUT_BYTES = 64_000;

/** Between SIGTERM and SIGKILL when the deadline passes. */
const GRACE_MS = 2_000;

export interface BashToolDeps {
  /** Values removed from output before anyone sees them, e.g. a live lease. */
  readonly scrubValues?: readonly string[];
}

export function bashTool(deps: BashToolDeps = {}): ToolDefinition {
  return defineTool({
    name: "bash",
    actionClass: "WRITE_HIGH",
    description: "Run a shell command in the workspace and return its output.",
    body: async (execution) => {
      const args = bashArgs.parse(execution.arguments);
      if (execution.effectiveMode === "SIMULATE") {
        return { output: `SIMULATE bash: ${args.command}`, exitCode: null };
      }

      const running = runProcess({
        argv: ["/bin/sh", "-c", args.command],
        cwd: execution.workspace,
        // The provider keys AMC holds are stripped, exactly as the wrap path
        // does. A shell that can echo $ANTHROPIC_API_KEY into model context is
        // a credential disclosure with extra steps.
        env: definedEnv(stripProviderKeys(process.env)),
        stdin: "ignore",
        stdout: "capture",
        stderr: "capture",
        maxCaptureBytes: MAX_OUTPUT_BYTES,
        scrubValues: deps.scrubValues ?? [],
        graceMs: GRACE_MS,
        timeoutMs: args.timeoutMs
      });

      const outcome = await running.done;
      const sections: string[] = [];
      if (outcome.stdout.text.length > 0) sections.push(outcome.stdout.text);
      if (outcome.stderr.text.length > 0) sections.push(outcome.stderr.text);
      const dropped = outcome.stdout.droppedBytes + outcome.stderr.droppedBytes;
      if (dropped > 0) {
        sections.push(`[amc: ${dropped} bytes of output not shown; the cap is ${MAX_OUTPUT_BYTES} per stream]`);
      }
      if (outcome.terminatedBy === "timeout") {
        sections.push(`[amc: killed after ${args.timeoutMs}ms]`);
      }

      return {
        output: sections.join("\n"),
        // Orthogonal, as everywhere else: a killed process reports the timeout
        // AND whatever status the kernel gave it.
        exitCode: outcome.exitCode,
        timedOut: outcome.terminatedBy === "timeout"
      };
    }
  });
}

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
