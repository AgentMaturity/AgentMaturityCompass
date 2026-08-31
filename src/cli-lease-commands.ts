/**
 * The `amc lease ...` command group.
 *
 * Moved out of cli.ts whole when `resign-revocations` was added: the ratchet
 * prices growth in cli.ts, and the lease group is a self-contained unit in the
 * same shape as cli-agent-commands.ts.
 */
import chalk from "chalk";
import type { Command } from "commander";
import { ensureLeaseRevocationStore, issueLeaseForCli, revokeLeaseForCli, verifyLeaseForCli } from "./leases/leaseCli.js";
import { workspaceIdFromDirectory } from "./workspaces/workspaceId.js";

export function registerLeaseCliCommands(program: Command): void {
  const leases = program.command("lease").description("Issue/verify/revoke short-lived agent leases");

  leases
    .command("issue")
    .requiredOption("--agent <agentId>", "agent ID")
    .option("--ttl <ttl>", "lease TTL (e.g. 15m, 60m)", "60m")
    .option("--scopes <scopes>", "comma-separated scopes", "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify")
    .option("--routes <routes>", "comma-separated route prefixes", "/openai,/anthropic,/gemini,/grok,/openrouter,/local")
    .option("--models <models>", "comma-separated model patterns", "*")
    .option("--rpm <rpm>", "max requests per minute", "60")
    .option("--tpm <tpm>", "max tokens per minute", "200000")
    .option("--max-cost-usd-per-day <usd>", "optional max cost USD per day")
    .option("--workorder <workOrderId>", "optional work order binding")
    .action((opts: {
      agent: string;
      ttl: string;
      scopes: string;
      routes: string;
      models: string;
      rpm: string;
      tpm: string;
      maxCostUsdPerDay?: string;
      workorder?: string;
    }) => {
      const ensured = ensureLeaseRevocationStore(process.cwd());
      if (!ensured.signatureValid) {
        throw new Error("Lease revocation signature invalid. Review .amc/studio/leases/revocations.json, then run `amc lease resign-revocations` as owner.");
      }
      const issued = issueLeaseForCli({
        workspace: process.cwd(),
        workspaceId: workspaceIdFromDirectory(process.cwd()),
        agentId: opts.agent,
        ttl: opts.ttl,
        scopes: opts.scopes,
        routes: opts.routes,
        models: opts.models,
        rpm: Number(opts.rpm),
        tpm: Number(opts.tpm),
        maxCostUsdPerDay: opts.maxCostUsdPerDay ? Number(opts.maxCostUsdPerDay) : null,
        workOrderId: opts.workorder
      });
      console.log(issued.token);
    });

  leases
    .command("verify")
    .argument("<token>", "lease token")
    .action((token: string) => {
      const verify = verifyLeaseForCli({
        workspace: process.cwd(),
        token
      });
      if (!verify.ok) {
        console.log(chalk.red(`invalid lease: ${verify.error ?? "unknown"}`));
        process.exit(1);
      }
      console.log(chalk.green("Lease valid"));
      console.log(JSON.stringify(verify.payload, null, 2));
    });

  leases
    .command("resign-revocations")
    .description("Re-sign the lease revocation store, vouching for its CURRENT content as owner")
    .action(async () => {
      const { resignLeaseRevocationsForCli } = await import("./leases/leaseCli.js");
      const result = resignLeaseRevocationsForCli(process.cwd());
      if (result.wasValid) {
        console.log(chalk.green("Revocation store signature already valid; re-signed."));
        return;
      }
      // The consequence is stated, not hidden: this certifies whatever the file
      // now says, so an operator who did not review it first is signing blind.
      console.log(chalk.yellow(`Previous signature did NOT verify (${result.previousReason ?? "unknown"}).`));
      console.log(chalk.yellow(`Re-signed ${result.revocationCount} revocation(s) as owner. You are vouching for the current content.`));
    });

  leases
    .command("revoke")
    .requiredOption("--lease-id <id>", "lease ID to revoke")
    .requiredOption("--reason <reason>", "revocation reason")
    .action((opts: { leaseId: string; reason: string }) => {
      const revoked = revokeLeaseForCli({
        workspace: process.cwd(),
        leaseId: opts.leaseId,
        reason: opts.reason
      });
      console.log(chalk.green(`Revoked lease: ${revoked.leaseId}`));
    });
}
