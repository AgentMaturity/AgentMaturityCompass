import { evaluateBudgetStatus } from "../../budgets/budgets.js";
import { evaluateRuntimeFirewall } from "../../runtime/firewall.js";
import {
  findToolDefinition,
  loadVerifiedToolsConfigSnapshot,
  validateToolRequest
} from "../../toolhub/toolhubValidators.js";
import type { ToolGuard } from "../toolTypes.js";

/**
 * AMC's existing policy engines, wired in as monotonic guards (P4.1, ADR-4).
 *
 * Each of these already had an answer about whether an action should proceed.
 * Until now that answer was advisory — reported by a command somebody had to
 * run. Here it decides, on the path the call actually takes.
 *
 * All three are synchronous and pass `record: false` where the underlying
 * engine can record, per ADR-0012: a guard DECIDES, and the pipeline records
 * the decision that determined the outcome once, outside the guard fold.
 * Recording inside a guard would write one signed decision per guard per call
 * for a call that may be denied by a different guard entirely.
 */

/**
 * The Runtime Firewall over the call's arguments.
 *
 * After ADR-0011 an unconfigured workspace blocks, so composing this guard in
 * a workspace with no signed policy denies every tool call. That is the
 * intended reading of deny-by-default and not a bug to route around: the fix
 * is to sign a policy.
 */
export function runtimeFirewallGuard(workspace: string): ToolGuard {
  return (execution) => {
    const decision = evaluateRuntimeFirewall({
      workspace,
      content: JSON.stringify(execution.arguments),
      direction: "request",
      source: "sdk",
      agentId: execution.agentId,
      record: false
    });
    return decision.action === "block"
      ? `runtime firewall blocked this call (${decision.mode})`
      : undefined;
  };
}

/**
 * Per-agent budgets.
 *
 * Two deliberate choices, both narrower or wider than `evaluateBudgetStatus`
 * would suggest on its own:
 *
 * - A SIMULATE call is never denied for budget. Simulation does not spend, and
 *   `budgetUsageSnapshot` only counts EXECUTE — denying it would make the
 *   guard disagree with the meter it reads.
 * - An unverifiable budgets config denies EVERY action class, not the three
 *   the engine names. The engine lists DEPLOY/WRITE_HIGH/SECURITY because
 *   those are what its consequence model freezes; but a config whose signature
 *   does not verify is tampering or a broken deployment, and "we cannot tell
 *   what the limits are" is not a reason to permit reads either.
 */
export function budgetGuard(workspace: string): ToolGuard {
  return (execution) => {
    if (execution.effectiveMode !== "EXECUTE") return undefined;
    const status = evaluateBudgetStatus(workspace, execution.agentId);
    if (status.ok) return undefined;
    if (!status.budgetConfigValid) {
      return `budgets config is not verifiable: ${status.reasons.join("; ")}`;
    }
    return status.exceededActionClasses.includes(execution.actionClass)
      ? `daily budget exceeded for ${execution.actionClass}`
      : undefined;
  };
}

/**
 * The signed `tools.yaml` allowlist — path globs, host allowlists, binary
 * allowlists, argv deny patterns.
 *
 * This guard exists so that porting toolhub's executors onto the pipeline is
 * not a downgrade. Those rules previously ran inside the toolhub server; a
 * pipeline tool that called the same executor without them would be strictly
 * weaker than the thing it replaced, while looking like a migration.
 *
 * A tool absent from the signed config is denied when the config says
 * `denyByDefault`, which is its own default. `validateToolRequest` already
 * returns `{ok, reason}` — deny-only — so it composes here without adaptation.
 */
export function toolhubAllowlistGuard(workspace: string): ToolGuard {
  return (execution) => {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (!snapshot.signatureValid || !snapshot.config) {
      // An unverifiable allowlist is not an empty allowlist.
      return `tools config is not verifiable: ${snapshot.reason ?? "unknown reason"}`;
    }
    const definition = findToolDefinition(snapshot.config, execution.name);
    if (!definition) {
      return snapshot.config.tools.denyByDefault
        ? `"${execution.name}" is not in the signed tool allowlist`
        : undefined;
    }
    const verdict = validateToolRequest({
      workspace,
      tool: definition,
      args: execution.arguments as Record<string, unknown>
    });
    return verdict.ok ? undefined : `tool allowlist: ${verdict.reason ?? "denied"}`;
  };
}
