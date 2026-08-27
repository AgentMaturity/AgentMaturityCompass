import { claudeCliAdapter } from "../../adapters/builtins/claudeCli.js";
import { detectAdapter } from "../../adapters/adapterDetection.js";
import { assembleAdapterEnv } from "../../adapters/envAssembler.js";
import { issueLeaseToken } from "../../leases/leaseSigner.js";
import { workspaceIdFromDirectory } from "../../workspaces/workspaceId.js";
import { createForeignRunner } from "../foreignSubagentRunner.js";
import type { LeaseScope } from "../../leases/leaseSchema.js";
import type { SubagentRunner } from "../subagentSpawn.js";

/**
 * Claude Code as a delegated child (plan P6.1b).
 *
 * AMC has described this CLI for a long time — `claudeCliAdapter` names how to
 * detect it, which env keys carry a base URL and an API key, and what its
 * provider family is. What it has never had is a way to RUN it as a subagent.
 * This is the wiring, and it is deliberately thin: everything that governs the
 * delegation is decided elsewhere. `spawnSubagent` mints the signed packet and
 * announces the child's session; `createForeignRunner` refuses an ungoverned,
 * hanging, crashed, silent or truncated child. This module supplies only the two
 * things the runner asks for — the argv that starts the agent on a goal, and the
 * environment that governs it.
 *
 * WHY THE GOAL GOES IN ARGV. It is the invocation AMC already documents and
 * ships for this adapter (`docs/adapters/claude-code.md`: `amc adapters run
 * ... -- claude "Analyze this codebase"`), and `commandTemplate.args` is empty,
 * so the prompt is positional. A build of the CLI that opens an interactive
 * session on that form would never answer — which is exactly what the runner's
 * deadline is for: it comes back as "timed out" rather than holding the parent's
 * turn open forever. `argsBefore` is there so an operator whose CLI needs a
 * print flag can supply one without patching this file.
 */

/**
 * The lease scopes a foreign CLI child is issued, and nothing more.
 *
 * `gateway:llm` because the whole point is that its model traffic goes through
 * AMC's gateway rather than straight to the provider. NOT any `toolhub:*` scope:
 * Claude Code runs its own tools in its own process and never calls AMC's
 * toolhub, so those scopes would be authority the child could not exercise and
 * nothing would ever refuse. Over-granting here is invisible precisely because
 * it is never exercised, which is what makes it worth stating rather than
 * copying the default scope list from `runAdapterCommand`.
 */
export const CLAUDE_CLI_DELEGATE_SCOPES: readonly LeaseScope[] = ["gateway:llm"];

const DEFAULT_LEASE_TTL_MS = 15 * 60_000;

export interface ClaudeCliForeignRunnerInit {
  readonly workspace: string;
  /** Origin of AMC's gateway, e.g. `http://127.0.0.1:3210`. */
  readonly gatewayBase: string;
  /** Route prefix the child's traffic is pinned to, e.g. `/anthropic`. */
  readonly providerRoute: string;
  readonly model: string;
  /** Origin of AMC's forward proxy, when one should be set. */
  readonly proxyBase?: string;
  /** Flags to place BEFORE the goal, for a CLI build that needs them. */
  readonly argsBefore?: readonly string[];
  readonly timeoutMs?: number;
  readonly leaseTtlMs?: number;
  readonly maxRequestsPerMinute?: number;
  readonly maxTokensPerMinute?: number;
}

export function claudeCliForeignRunner(init: ClaudeCliForeignRunnerInit): SubagentRunner {
  const detection = detectAdapter(claudeCliAdapter);

  return async function runClaudeChild(ctx) {
    // Checked per call rather than at composition, because a runner may be
    // built once for a long-lived agent and the binary can come and go.
    if (!detection.installed || !detection.command) {
      return {
        ok: false,
        text: "",
        reason:
          `${claudeCliAdapter.displayName} is not detected on PATH `
          + `(${claudeCliAdapter.detection.commandCandidates.join(", ")}); install it or delegate `
          + "to a different provider"
      };
    }

    const runner = createForeignRunner({
      workspace: init.workspace,
      ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
      spawn: (goal) => ({
        command: detection.command as string,
        args: [...(init.argsBefore ?? claudeCliAdapter.commandTemplate.args), goal]
      }),
      governedEnv: () => {
        // Minted per delegation, not per runner: a lease issued when the runner
        // was composed could already have expired by the time a model decides to
        // delegate, and a child holding an expired credential fails at the
        // gateway with an error about auth rather than about timing.
        const lease = issueLeaseToken({
          workspace: init.workspace,
          workspaceId: workspaceIdFromDirectory(init.workspace),
          // The GOVERNING id, never `runAs`. The gateway attributes spend and
          // rate limits to whatever this says, so a fresh name here would hand
          // the child an unspent budget — the same escape `spawnSubagent`
          // closes for the in-process path.
          agentId: ctx.toolsetAgentId,
          ttlMs: init.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS,
          scopes: [...CLAUDE_CLI_DELEGATE_SCOPES],
          // Pinned, and enforced by the gateway on every request: this child may
          // reach one route with one model, whatever its own config says.
          routeAllowlist: [init.providerRoute],
          modelAllowlist: [init.model],
          maxRequestsPerMinute: init.maxRequestsPerMinute ?? 60,
          maxTokensPerMinute: init.maxTokensPerMinute ?? 200_000,
          maxCostUsdPerDay: null
        });

        const env = assembleAdapterEnv({
          adapter: claudeCliAdapter,
          lease: lease.token,
          agentId: ctx.toolsetAgentId,
          gatewayBase: init.gatewayBase,
          proxyBase: init.proxyBase ?? "",
          providerRoute: init.providerRoute,
          model: init.model,
          includeProxyEnv: init.proxyBase !== undefined
        });

        const defined: Record<string, string> = {};
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === "string") defined[key] = value;
        }
        return { env: defined, lease: lease.token };
      }
    });

    return runner(ctx);
  };
}
