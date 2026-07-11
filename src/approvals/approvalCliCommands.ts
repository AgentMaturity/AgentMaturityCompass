import chalk from "chalk";
import type { Command } from "commander";
import { deliverApprovalLifecycle } from "./approvalDelivery.js";
import { decideApprovalForIntent } from "./approvalEngine.js";
import {
  getApprovalInboxItem,
  listApprovalInbox,
  projectApprovalInboxSummary
} from "./approvalInbox.js";
import {
  parseApprovalMode,
  parseApprovalReviewerRoles,
  parseApprovalStatus
} from "./approvalCli.js";

interface ApprovalReviewerOptions {
  agent: string;
  reason: string;
  username: string;
  roles: string;
  userId?: string;
}

export function registerApprovalCliCommands(program: Command): void {
  const approvals = program.command("approvals").description("Signed approval inbox operations");

  approvals
    .command("list")
    .requiredOption("--agent <agentId>", "agent ID")
    .option("--status <status>", "pending|quorum-met|approved|denied|consumed|expired|cancelled")
    .action((opts: { agent: string; status?: string }) => {
      const rows = listApprovalInbox({
        workspace: process.cwd(),
        agentId: opts.agent,
        status: parseApprovalStatus(opts.status?.toUpperCase())
      });
      if (rows.length === 0) {
        console.log("No approvals found.");
        return;
      }
      for (const row of rows) {
        const summary = projectApprovalInboxSummary(row);
        console.log(
          `${summary.approvalRequestId} | ${summary.status} | ${summary.actionClass} | risk=${summary.riskTier} | quorum=${summary.quorum.received}/${summary.quorum.required}`
        );
      }
    });

  approvals
    .command("show")
    .requiredOption("--agent <agentId>", "agent ID")
    .argument("<approvalId>")
    .action((approvalId: string, opts: { agent: string }) => {
      const approval = getApprovalInboxItem({
        workspace: process.cwd(),
        agentId: opts.agent,
        approvalRequestId: approvalId
      });
      console.log(JSON.stringify(approval, null, 2));
    });

  approvals
    .command("approve")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--mode <simulate|execute>", "approved mode")
    .requiredOption("--reason <text>", "decision reason")
    .requiredOption("--username <username>", "reviewer username")
    .requiredOption("--roles <roles>", "reviewer roles (comma-separated)")
    .option("--user-id <userId>", "stable reviewer user ID; defaults to username")
    .argument("<approvalId>")
    .action(async (approvalId: string, opts: ApprovalReviewerOptions & { mode: string }) => {
      const reviewerRoles = parseApprovalReviewerRoles(opts.roles);
      const out = decideApprovalForIntent({
        workspace: process.cwd(),
        agentId: opts.agent,
        approvalId,
        decision: "APPROVED",
        mode: parseApprovalMode(opts.mode),
        reason: opts.reason,
        username: opts.username,
        userId: opts.userId ?? opts.username,
        userRoles: reviewerRoles
      });
      const delivery = await deliverApprovalLifecycle({
        workspace: process.cwd(),
        agentId: opts.agent,
        approvalRequestId: approvalId,
        trigger: "DECISION_RECORDED"
      });
      console.log(chalk.green(`Approval decided: ${out.approval.approvalId}`));
      console.log(`Lifecycle delivery: ${delivery.status}${delivery.eventName ? ` (${delivery.eventName})` : ""}`);
    });

  approvals
    .command("deny")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--reason <text>", "decision reason")
    .requiredOption("--username <username>", "reviewer username")
    .requiredOption("--roles <roles>", "reviewer roles (comma-separated)")
    .option("--user-id <userId>", "stable reviewer user ID; defaults to username")
    .argument("<approvalId>")
    .action(async (approvalId: string, opts: ApprovalReviewerOptions) => {
      const reviewerRoles = parseApprovalReviewerRoles(opts.roles);
      const out = decideApprovalForIntent({
        workspace: process.cwd(),
        agentId: opts.agent,
        approvalId,
        decision: "DENIED",
        mode: "SIMULATE",
        reason: opts.reason,
        username: opts.username,
        userId: opts.userId ?? opts.username,
        userRoles: reviewerRoles
      });
      const delivery = await deliverApprovalLifecycle({
        workspace: process.cwd(),
        agentId: opts.agent,
        approvalRequestId: approvalId,
        trigger: "DECISION_RECORDED"
      });
      console.log(chalk.green(`Approval denied: ${out.approval.approvalId}`));
      console.log(`Lifecycle delivery: ${delivery.status}${delivery.eventName ? ` (${delivery.eventName})` : ""}`);
    });
}
