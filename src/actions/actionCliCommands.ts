import type { Command } from "commander";
import { requestManualResolution, resolveManually } from "./reconcile.js";

interface ResolveOptions {
  effect: string;
  operator: string;
  note: string;
  externalRef?: string;
  approval?: string;
  json?: boolean;
}

/**
 * `amc action resolve` (P1-04): an operator settles an `outcome_unknown` action, or one with incomplete evidence, that
 * blocks an agent. Without `--approval` it files the approval request (dual control); with it, it records the
 * resolution. The statement is self-reported: AMC did not observe the effect.
 */
export function registerActionCliCommands(program: Command): void {
  const action = program.command("action").description("Journaled consequential actions");
  action
    .command("resolve")
    .description("Settle a blocking outcome_unknown action by an operator's statement under dual control (self-reported, not observed)")
    .argument("<executionId>", "the execution named by blocked_by_unreconciled")
    .requiredOption("--effect <effect>", "applied|not_applied, as the operator found it in the system of record")
    .requiredOption("--operator <id>", "who states the resolution; someone else must approve it")
    .requiredOption("--note <text>", "what the operator checked")
    .option("--external-ref <ref>", "the system of record's reference for the effect")
    .option("--approval <approvalRequestId>", "the granted approval request; omit it to file one")
    .option("--json", "emit JSON")
    .action((executionId: string, opts: ResolveOptions) => {
      if (opts.effect !== "applied" && opts.effect !== "not_applied") throw new Error("--effect must be applied or not_applied");
      const input = { workspace: process.cwd(), effect: opts.effect, externalRef: opts.externalRef ?? null, operatorId: opts.operator, note: opts.note } as const;
      if (opts.approval === undefined) {
        const filed = requestManualResolution(executionId, input);
        if (opts.json) return console.log(JSON.stringify({ status: "approval_requested", executionId, ...filed }, null, 2));
        const restate = `--effect ${opts.effect} --operator ${JSON.stringify(opts.operator)} --note ${JSON.stringify(opts.note)}`
          + (opts.externalRef === undefined ? "" : ` --external-ref ${JSON.stringify(opts.externalRef)}`);
        console.log(`Resolution requested: ${filed.approvalRequestId} (${filed.actionClass}, ${filed.requiredApprovals} approval(s)). Nothing is settled yet.`);
        console.log(`Someone other than ${opts.operator} approves it: amc approvals approve ${filed.approvalRequestId} --agent ${filed.agentId} --mode execute --reason <why> --username <name> --roles <roles>`);
        console.log(`Then record it: amc action resolve ${executionId} ${restate} --approval ${filed.approvalRequestId}`);
        return;
      }
      const receipt = resolveManually(executionId, { ...input, approvalRequestId: opts.approval });
      if (opts.json) return console.log(JSON.stringify({ status: "resolved", claimKind: "self_reported", receipt }, null, 2));
      console.log(`Resolved ${executionId}: ${receipt.state}/${receipt.effect ?? "no effect"} at seq ${receipt.seq}.`);
      console.log(`Claim kind: self_reported (stated by ${opts.operator}, approved through ${opts.approval}); AMC did not observe the effect.`);
    });
}
