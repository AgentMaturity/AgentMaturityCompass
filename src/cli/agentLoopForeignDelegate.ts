import chalk from "chalk";
import type { ApprovalMode } from "../approvals/approvalModes.js";
import { IN_PROCESS_PROVIDER, resolveForeignRunner } from "../agent/providers/delegationProviders.js";
import type { SubagentRunner } from "../agent/subagentSpawn.js";
import type { AgentLoopCliIo } from "../cli-agent-options.js";

/**
 * The out-of-process delegate `agent-loop run --delegate --delegate-provider <id>` (or a signed preset's `delegate.provider`)
 * asks for. Null when the run must not start: the reason was printed and `io.fail()` called.
 *
 * SH-SANDBOX-04: an approval mode never reaches a foreign child. `delegate` is READ_ONLY, so `plan` would execute it
 * and `default`/`accept-edits` would not ask about it, and the child (Claude Code under AMC's hook control only) carries
 * no SIMULATE narrowing and no gate. A mode with a foreign provider is therefore refused instead of being weaker than
 * the expert gate it replaces.
 */
export function foreignDelegateRunner(io: AgentLoopCliIo, options: { readonly delegateProvider?: string; readonly approvalMode: ApprovalMode | undefined },
  scope: { readonly workspace: string; readonly agentId: string; readonly timeoutMs: number }): { readonly runner: SubagentRunner | null; readonly describedAs: string } | null {
  const providerId = options.delegateProvider ?? IN_PROCESS_PROVIDER;
  if (providerId === IN_PROCESS_PROVIDER) return { runner: null, describedAs: "" };
  if (options.approvalMode !== undefined) {
    io.error(chalk.red(`--approval-mode ${options.approvalMode} cannot govern an out-of-process delegate (${providerId}): the child runs outside this run's gate and SIMULATE narrowing. `
      + "Drop --delegate-provider (children then run in-process under the mode), or use --approve-tools for the expert gate."));
    io.fail();
    return null;
  }
  const resolved = resolveForeignRunner({ providerId, workspace: scope.workspace, agentId: scope.agentId, ...(scope.timeoutMs > 0 ? { timeoutMs: scope.timeoutMs } : {}) });
  if (!resolved.ok) { io.error(chalk.red(resolved.reason)); io.fail(); return null; }
  return { runner: resolved.runner, describedAs: resolved.describedAs };
}
