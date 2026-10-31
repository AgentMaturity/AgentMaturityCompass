/**
 * `amc lifecycle transition` and `amc lifecycle reassessments` (P2-23; the two command paths are a named freeze exception).
 * The actor is the authenticated user of an `amc approvals login` token (`--session-token-file`), never a flag. A move that
 * needs an approval runs twice: `--request-approval` raises it, approvers decide it bound to the printed digest, then the
 * same command with `--approval <id>` applies it. `amc lifecycle advance` keeps working; its records are self_reported.
 */
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import type { GovernanceState } from "./lifecycle/governanceLifecycle.js";
import type { AgentVersionManifest } from "./lifecycle/versionManifest.js";

// Modules load on use, so the lifecycle stack never slows other commands' start-up.
const STATES: readonly GovernanceState[] = ["proposed", "approved", "active", "suspended", "retired"];

interface TransitionOptions {
  agent?: string; to: string; sessionTokenFile: string; approval?: string; requestApproval?: boolean;
  manifest?: string; note?: string; acceptOutcomeUnknown?: string;
}

async function transition(workspace: string, agentId: string, opts: TransitionOptions): Promise<unknown> {
  if (!(STATES as readonly string[]).includes(opts.to)) throw new Error(`--to must be one of ${STATES.join(", ")}`);
  const to = opts.to as GovernanceState;
  const [{ sessionPrincipal }, { requestTransitionApproval }, { applyOwnerTransition }, { retireAgent }] = await Promise.all([
    import("./governor/boundRecords.js"), import("./lifecycle/governanceLifecycle.js"), import("./lifecycle/reassessment.js"), import("./lifecycle/retirement.js")]);
  const actor = { ...sessionPrincipal(workspace, opts.sessionTokenFile), via: "approvals-session" as const };
  const manifest = opts.manifest === undefined ? undefined : JSON.parse(readFileSync(opts.manifest, "utf8")) as AgentVersionManifest;
  if (opts.requestApproval) {
    const raised = await requestTransitionApproval({ workspace, agentId, to, actor, ...(manifest === undefined ? {} : { manifest }) });
    return { requested: raised, next: [`each approver (not you), signed in: amc approvals approve --agent ${agentId} --mode execute --reason <why> `
      + `--username <name> --roles <role> --session-token-file <file> --expect-request-digest ${raised.approval.requestBindingDigest} ${raised.approval.approvalRequestId}`,
    `then: amc lifecycle transition --agent ${agentId} --to ${to} --approval ${raised.approval.approvalRequestId} --session-token-file <file>`] };
  }
  if (to === "retired") {
    return retireAgent({ workspace, agentId, actor, ...(opts.note === undefined ? {} : { note: opts.note }),
      ...(opts.acceptOutcomeUnknown === undefined ? {} : { acceptOutcomeUnknown: opts.acceptOutcomeUnknown }) });
  }
  return applyOwnerTransition({ workspace, agentId, to, actor, ...(opts.approval === undefined ? {} : { approvalId: opts.approval }),
    ...(manifest === undefined ? {} : { manifest }), ...(opts.note === undefined ? {} : { note: opts.note }) });
}

const print = (out: unknown): void => console.log(JSON.stringify(out, null, 2));

export function registerLifecycleGovernanceCommands(lifecycle: Command, defaultAgent: () => string | undefined): void {
  lifecycle
    .command("transition")
    .description("Move a governed agent between proposed, approved, active, suspended and retired (signed, approval-bound; JSON)")
    .requiredOption("--to <state>", `target state: ${STATES.join("|")}`)
    .requiredOption("--session-token-file <file>", "token file from amc approvals login; the actor is that OWNER")
    .option("--agent <agentId>", "agent ID (overrides global --agent)")
    .option("--request-approval", "raise the bound approval this move needs")
    .option("--approval <approvalRequestId>", "the approved request bound to this agent, target, manifest and plan")
    .option("--manifest <file>", "version manifest JSON to bind (default: the manifest observed at the last session open)")
    .option("--note <text>", "note recorded on the transition")
    .option("--accept-outcome-unknown <note>", "retirement: OWNER acceptance of open outcome_unknown receipts")
    .action(async (opts: TransitionOptions) => {
      const workspace = process.cwd();
      const agentId = opts.agent ?? defaultAgent() ?? "default";
      try {
        print(await transition(workspace, agentId, opts));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  lifecycle
    .command("reassessments")
    .description("Show a governed agent's lifecycle state and its reassessment records (JSON)")
    .option("--agent <agentId>", "agent ID (overrides global --agent)")
    .action(async (opts: { agent?: string }) => {
      const workspace = process.cwd();
      const agentId = opts.agent ?? defaultAgent() ?? "default";
      try {
        const [{ lifecycleView }, { listReassessments }] = await Promise.all([import("./lifecycle/governanceLifecycle.js"), import("./lifecycle/reassessment.js")]);
        print({ state: lifecycleView(workspace, agentId), reassessments: listReassessments(workspace, agentId) });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
