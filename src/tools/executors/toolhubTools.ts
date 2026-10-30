import { z } from "zod";
import { detokenize } from "../../dataflow/detokenizeGate.js";
import { executeGit } from "../../toolhub/toolhubExecutors/git.js";
import { executeHttpFetch } from "../../toolhub/toolhubExecutors/http.js";
import { executeProcessSpawn } from "../../toolhub/toolhubExecutors/process.js";
import { defineTool } from "../toolRegistry.js";
import { fsTools } from "../builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../builtin/readBeforeEdit.js";
import { DefiniteFailureError, type ToolDefinition, type ToolExecution } from "../toolTypes.js";

/**
 * Toolhub's executors, as pipeline tools (P4.1).
 *
 * Filesystem definitions reuse the native fsTools bodies and one observation
 * ledger for this composition, so limits, paging and read-before-write policy
 * cannot drift between same-named pipeline tools. Other bodies delegate to the
 * same executor the toolhub server calls.
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

/** Keep normal output and status; propagate abnormal termination through the pipeline's failure contract. */
function processOutcome(result: ReturnType<typeof executeProcessSpawn>): {
  ok: boolean;
  output: string;
  exitCode: number;
  bytes: number;
} {
  if (result.signal !== null) throw new Error(`process_terminated:${result.signal}`);
  if (result.errorCode !== null) {
    if (result.errorCode === "ENOENT" || result.errorCode === "EACCES") throw new DefiniteFailureError(`process_spawn_failed:${result.errorCode}`);
    throw new Error(`process_terminated:${result.errorCode}`);
  }
  const output = result.stderr.length > 0 ? `${result.stdout}${result.stderr}` : result.stdout;
  return { ok: result.code === 0, output, exitCode: result.code, bytes: Buffer.byteLength(output, "utf8") };
}

export function toolhubPipelineTools(): readonly ToolDefinition[] {
  const ledger = new ReadBeforeEditLedger();
  return [
    ...fsTools({ ledger }).filter(tool => tool.name === "fs.read" || tool.name === "fs.write"),
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
        const simulate = simulated(execution);
        // P2-02: the last step before sending; headers and body only, the URL is never restored.
        const sent = simulate ? null : detokenize({ headers: args.headers, body: args.body },
          { execution, destination: { channel: "network-tool", url: args.url }, strictText: true });
        const response = await executeHttpFetch({ ...args, ...(sent?.value ?? {}), workspace: execution.workspace, simulate,
          ...(execution.idempotencyKey && execution.idempotencyHeader ? { idempotency: { header: execution.idempotencyHeader, key: execution.idempotencyKey } } : {}) });
        const output = sent === null ? response.body : sent.retokenize(response.body);
        return {
          ok: response.status >= 200 && response.status < 300,
          output,
          // An HTTP status is not an exit code, and mapping it to one would
          // make a 404 read as a process that exited 404.
          exitCode: null,
          bytes: Buffer.byteLength(output, "utf8")
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
