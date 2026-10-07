import { z } from "zod";
import { executeFsRead, executeFsWrite } from "../../toolhub/toolhubExecutors/fs.js";
import { executeGit } from "../../toolhub/toolhubExecutors/git.js";
import { executeHttpFetch } from "../../toolhub/toolhubExecutors/http.js";
import { executeProcessSpawn } from "../../toolhub/toolhubExecutors/process.js";
import { resolveToolPath } from "../../toolhub/toolhubValidators.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition, ToolExecution } from "../toolTypes.js";

/**
 * Toolhub's executors, as pipeline tools (P4.1).
 *
 * Delegation, not reimplementation. Each body validates its arguments and
 * calls the SAME executor the toolhub server calls, so there is one
 * implementation of "write this file" and it cannot drift into two that
 * disagree about what they did.
 *
 * The names match the signed `tools.yaml` entries exactly, because
 * `toolhubAllowlistGuard` resolves a definition by name — a rename here would
 * silently detach a tool from the allowlist that governs it. The action
 * classes match that file too, for the same reason: they are what the budget
 * guard meters against.
 *
 * Argument validation lives in the body rather than in a guard. A guard
 * answers "is this permitted"; a malformed argument is not a policy question,
 * and reporting it as a denial would credit policy with catching a typo.
 */

const fsReadArgs = z.object({ path: z.string().min(1), maxBytes: z.number().int().positive().max(20_000_000).default(200_000) });
const fsWriteArgs = z.object({ path: z.string().min(1), content: z.string() });
const gitArgs = z.object({ args: z.array(z.string()).default([]), cwd: z.string().optional() });
const httpArgs = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional()
});
const spawnArgs = z.object({
  binary: z.string().min(1),
  argv: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional()
});

const simulated = (execution: ToolExecution): boolean => execution.effectiveMode === "SIMULATE";

/** stdout and stderr as one stream, with the exit code kept as its own field. */
function processOutcome(result: { code: number; stdout: string; stderr: string }): {
  output: string;
  exitCode: number;
  bytes: number;
} {
  const output = result.stderr.length > 0 ? `${result.stdout}${result.stderr}` : result.stdout;
  return { output, exitCode: result.code, bytes: Buffer.byteLength(output, "utf8") };
}

export function toolhubPipelineTools(): readonly ToolDefinition[] {
  return [
    defineTool({
      name: "fs.read",
      actionClass: "READ_ONLY",
      description: "Read a file from the workspace, capped at maxBytes.",
      body: (execution) => {
        const args = fsReadArgs.parse(execution.arguments);
        return executeFsRead({
          path: resolveToolPath(execution.workspace, args.path),
          maxBytes: args.maxBytes,
          simulate: simulated(execution)
        });
      }
    }),
    defineTool({
      name: "fs.write",
      actionClass: "WRITE_LOW",
      description: "Write a file into the workspace.",
      body: (execution) => {
        const args = fsWriteArgs.parse(execution.arguments);
        return executeFsWrite({
          path: resolveToolPath(execution.workspace, args.path),
          content: args.content,
          simulate: simulated(execution)
        });
      }
    }),
    ...(["status", "commit", "push"] as const).map((subcommand) =>
      defineTool({
        name: `git.${subcommand}`,
        // `push` is DEPLOY and the others are not: a push leaves the machine.
        actionClass: subcommand === "push" ? "DEPLOY" : subcommand === "status" ? "READ_ONLY" : "WRITE_LOW",
        description: `Run git ${subcommand}.`,
        body: (execution) => {
          const args = gitArgs.parse(execution.arguments);
          return processOutcome(executeGit({
            subcommand,
            args: args.args,
            cwd: args.cwd ?? execution.workspace,
            simulate: simulated(execution)
          }));
        }
      })
    ),
    defineTool({
      name: "http.fetch",
      actionClass: "NETWORK_EXTERNAL",
      description: "Fetch a URL on the signed host allowlist.",
      body: async (execution) => {
        const args = httpArgs.parse(execution.arguments);
        const response = await executeHttpFetch({ ...args, simulate: simulated(execution),
          ...(execution.idempotencyKey && execution.idempotencyHeader ? { idempotency: { header: execution.idempotencyHeader, key: execution.idempotencyKey } } : {}) });
        return {
          output: response.body,
          // An HTTP status is not an exit code, and mapping it to one would
          // make a 404 read as a process that exited 404.
          exitCode: null,
          bytes: Buffer.byteLength(response.body, "utf8")
        };
      }
    }),
    defineTool({
      name: "process.spawn",
      actionClass: "WRITE_HIGH",
      description: "Spawn an allowlisted binary.",
      body: (execution) => {
        const args = spawnArgs.parse(execution.arguments);
        return processOutcome(executeProcessSpawn({
          binary: args.binary,
          argv: args.argv,
          cwd: args.cwd ?? execution.workspace,
          ...(args.env ? { env: args.env } : {}),
          simulate: simulated(execution)
        }));
      }
    })
  ];
}
