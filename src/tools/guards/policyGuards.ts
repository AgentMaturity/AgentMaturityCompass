import { resolve } from "node:path";
import { admitNativeSandboxPolicy } from "../../sandbox/nativeSandboxBinding.js";
import { reserveNativeToolBudget } from "../../budgets/nativeBudgetAdmission.js";
import { evaluateRuntimeFirewall } from "../../runtime/firewall.js";
import {
  findToolDefinition,
  hostAllowedForTool,
  loadVerifiedToolsConfigSnapshot,
  validateToolRequest
} from "../../toolhub/toolhubValidators.js";
import { BLOCK_CONFIDENCE, matchInjection } from "../../shield/injection/injectionMatcher.js";
import { RUN_CODE_TOOL } from "../toolPipeline.js";
import type { ToolDefinition, ToolExecution, ToolGuard } from "../toolTypes.js";
import { checkEgress, EgressBlocked } from "../../residency/checkEgress.js";

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
 * The arguments a host check reads. Defaults to the call's own; a composition
 * supplies a destination a tool does not take as an argument (P1-43:
 * `web_search` reaches its provider's declared origin, never a model-chosen url).
 */
export type GovernedArguments = (execution: ToolExecution) => Readonly<Record<string, unknown>>;
const ownArguments: GovernedArguments = (execution) => execution.arguments;

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
export function budgetGuard(workspace: string, sessionId?: string): ToolGuard {
  return (execution) => {
    return reserveNativeToolBudget({ ...execution, workspace }, sessionId ?? `tool-guard-${execution.agentId}`);
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
export function toolhubAllowlistGuard(workspace: string,
  visibleDefinition?: (execution: ToolExecution) => ToolDefinition | undefined,
  expectedToolsDigest?: string, argumentsFor: GovernedArguments = ownArguments): ToolGuard {
  return (execution) => {
    // The Code Mode transport is presentation infrastructure, not a
    // capability, and the allowlist has nothing useful to say about it. What
    // matters is what a program DISPATCHES, and every one of those calls
    // re-enters this same guard on its own name. Gating the transport would
    // mean an operator had to allowlist `run_code` itself, and denying it
    // would leave code mode unable to call anything at all — the same reason
    // `restrict()` refuses to name it.
    if (execution.name === RUN_CODE_TOOL && expectedToolsDigest === undefined) return undefined;
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (!snapshot.signatureValid || !snapshot.config) {
      // An unverifiable allowlist is not an empty allowlist.
      return `tools config is not verifiable: ${snapshot.reason ?? "unknown reason"}`;
    }
    // This synchronous guard runs after approval and immediately before the
    // selected body. Compare the exact snapshot also used for allowlist and
    // sandbox admission; a later signed policy cannot widen this task's pin.
    if (expectedToolsDigest !== undefined && snapshot.digestSha256 !== expectedToolsDigest) return "signed tool policy differs from the native task's reviewed digest";
    if (execution.name === RUN_CODE_TOOL) return undefined;
    const definition = findToolDefinition(snapshot.config, execution.name);
    if (!definition) {
      return snapshot.config.tools.denyByDefault
        ? `"${execution.name}" is not in the signed tool allowlist`
        : undefined;
    }
    const verdict = validateToolRequest({
      workspace,
      tool: definition,
      args: argumentsFor(execution) as Record<string, unknown>,
      nativeSandboxPermit: snapshot.digestSha256
        ? admitNativeSandboxPolicy(visibleDefinition?.(execution), execution, definition, snapshot.digestSha256)
        : undefined
    });
    // No second implementation here. `validateToolRequest` used to key its
    // checks on tool NAMES, so this guard carried a patch applying argv deny
    // patterns that the source would never reach. The source is
    // declaration-driven now, so the patch is gone: one place decides, and a
    // policy declared in the signed config is enforced wherever it appears.
    return verdict.ok ? undefined : `tool allowlist: ${verdict.reason ?? "denied"}`;
  };
}

/**
 * Every outbound network call, governed by what the tool IS rather than by
 * what it is called.
 *
 * The trap this closes: the signed allowlist reaches a tool call through
 * `validateToolRequest`, which is hard-keyed on the string `"http.fetch"`
 * (`toolhubValidators.ts`). A second network tool under any other name --
 * `web_fetch`, `download`, `fetch_url` -- gets no host check from that path at
 * all. The allowlist looks like a policy about network access and is actually
 * a policy about one identifier.
 *
 * Here the trigger is `actionClass === "NETWORK_EXTERNAL"`, which every
 * network tool must declare to be metered by the budget guard anyway. A new
 * network tool is therefore governed by existing, or it is not a network tool.
 *
 * A NETWORK_EXTERNAL tool that names no host is denied rather than allowed:
 * a call whose destination cannot be determined cannot be checked against an
 * allowlist, and "we could not tell where this was going" is not a reason to
 * let it go.
 */
export function networkEgressGuard(workspace: string, argumentsFor: GovernedArguments = ownArguments): ToolGuard {
  workspace = resolve(workspace);
  return (execution) => {
    if (execution.actionClass !== "NETWORK_EXTERNAL") return undefined;

    const raw = argumentsFor(execution)["url"];
    if (typeof raw !== "string" || raw.length === 0) {
      return `${execution.name} is a network tool but named no url to check against the allowlist`;
    }
    let host: string;
    try {
      host = new URL(raw).hostname;
    } catch {
      return `${execution.name} was given a url that cannot be parsed: no host to check`;
    }

    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (!snapshot.signatureValid || !snapshot.config) {
      return `tools config is not verifiable: ${snapshot.reason ?? "unknown reason"}`;
    }
    const definition = findToolDefinition(snapshot.config, execution.name);
    if (!definition) {
      // Unlisted network tool. The allowlist has nothing to say about it,
      // which is a denial rather than a blank cheque.
      return `"${execution.name}" is not in the signed tool allowlist, so its egress is ungoverned`;
    }
    if (!hostAllowedForTool(definition, host)) return `egress denied: ${host} is not on the allowlist for ${execution.name}`;
    try {
      // Guards may run before authorization binds. Missing trusted classes remain unknown, never model-declared.
      checkEgress({ workspace, channel: "network-tool", url: raw, agentId: execution.agentId,
        dataClasses: execution.authorization?.record.resource.dataClasses ?? null,
        purpose: execution.authorization?.record.resource.purpose ?? null });
      return undefined;
    } catch (error) {
      return error instanceof EgressBlocked ? `residency egress denied: ${error.decision.reason}` : "residency egress check unavailable";
    }
  };
}

/**
 * Prompt injection, refused at the TOOL boundary (P5.1).
 *
 * The runtime firewall already inspects LLM traffic. This is the other half
 * that P5.1 asks for: a payload can reach a tool without ever passing through
 * the firewall — pasted into an argument by the model, read out of a file by
 * one tool and handed to another, returned by a fetch and reused. The
 * boundary that matters for a tool call is the tool call.
 *
 * BLOCK_CONFIDENCE, not every match. The shared table carries low-confidence
 * obfuscation hints, and a percent-encoded byte appears in every URL — refusing
 * on those would deny ordinary work while adding nothing.
 */
export function promptInjectionGuard(): ToolGuard {
  return (execution) => {
    const verdict = matchInjection(JSON.stringify(execution.arguments), {
      minConfidence: BLOCK_CONFIDENCE
    });
    if (!verdict.detected) return undefined;
    const first = verdict.matches[0];
    // The rule id reaches the model, so a denial is actionable rather than
    // mysterious — and a person reading evidence can find the pattern.
    return `prompt injection refused at the tool boundary (${first?.id ?? "unknown"}, ${verdict.severity ?? "unknown"})`;
  };
}
