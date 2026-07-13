import chalk from "chalk";
import type { Command } from "commander";
import { deliverApprovalLifecycle } from "./approvalDelivery.js";
import { decideApprovalForIntent } from "./approvalEngine.js";
import {
  getApprovalInboxItem,
} from "./approvalInbox.js";
import { parseApprovalActivityQuery, searchApprovalActivity } from "./approvalActivity.js";
import {
  parseApprovalMode,
  parseApprovalReviewerRoles
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
    .option("--query <requestId>", "case-insensitive approval request ID substring")
    .option("--action-class <class>", "approval action class")
    .option("--risk-tier <tier>", "low|medium|high|critical")
    .option("--effective-mode <mode>", "simulate|execute")
    .option("--created-after <timestamp>", "inclusive RFC3339 or epoch-ms lower bound")
    .option("--created-before <timestamp>", "inclusive RFC3339 or epoch-ms upper bound")
    .option("--order <order>", "newest|oldest", "newest")
    .option("--limit <count>", "maximum rows (1-200)", "50")
    .option("--json", "emit the shared machine-readable activity projection")
    .action((opts: {
      agent: string;
      status?: string;
      query?: string;
      actionClass?: string;
      riskTier?: string;
      effectiveMode?: string;
      createdAfter?: string;
      createdBefore?: string;
      order?: string;
      limit?: string;
      json?: boolean;
    }) => {
      const result = searchApprovalActivity({
        workspace: process.cwd(),
        agentId: opts.agent,
        filters: parseApprovalActivityQuery({
          query: opts.query,
          status: opts.status,
          actionClass: opts.actionClass,
          riskTier: opts.riskTier,
          effectiveMode: opts.effectiveMode,
          createdAfter: opts.createdAfter,
          createdBefore: opts.createdBefore,
          order: opts.order,
          limit: opts.limit
        })
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        if (!result.integrity.valid) {
          process.exitCode = 2;
        }
        return;
      }
      if (!result.integrity.valid) {
        console.error(`Approval activity unavailable: ${result.integrity.reasonCodes.join(", ")}`);
        process.exitCode = 2;
        return;
      }
      if (result.requests.length === 0) {
        console.log("No approvals found.");
        return;
      }
      for (const summary of result.requests) {
        console.log(
          `${summary.approvalRequestId} | ${summary.status} | ${summary.actionClass} | risk=${summary.riskTier} | quorum=${summary.quorum.received}/${summary.quorum.required}`
        );
      }
      if (result.truncated) {
        console.log(`Showing ${result.returned} of ${result.totalMatched} matching approvals.`);
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
