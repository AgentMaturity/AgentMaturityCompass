/**
 * The `amc lease ...` command group.
 *
 * Moved out of cli.ts whole when `resign-revocations` was added: the ratchet
 * prices growth in cli.ts, and the lease group is a self-contained unit in the
 * same shape as cli-agent-commands.ts.
 */
import chalk from "chalk";
import type { Command } from "commander";
import { ensureLeaseRevocationStore, issueLeaseForCli, revokeLeaseForCliAsync, verifyLeaseForCli } from "./leases/leaseCli.js";
import { workspaceIdFromDirectory } from "./workspaces/workspaceId.js";
import { assertOwnerMode } from "./mode/mode.js";

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
        throw new Error("Lease revocation signature invalid. Review .amc/studio/leases/revocations.signed.json (or a 1.x revocations.json not yet migrated), then run `amc lease resign-revocations --expect-digest <sha256 of the reviewed file>` as owner.");
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
    .description("Re-sign the lease revocation store as owner, only if its sha256 is the reviewed digest")
    .requiredOption("--expect-digest <sha256>", "sha256 of the revocations.signed.json (or 1.x revocations.json) bytes you reviewed; anything else is refused")
    .action(async (opts: { expectDigest: string }) => {
      const { resignLeaseRevocationsForCliAsync } = await import("./leases/leaseCli.js");
      const workspace = process.cwd(), reviewed = opts.expectDigest;
      const assertInputs = () => {
        if (process.cwd() !== workspace || opts.expectDigest !== reviewed) throw new Error("original lease repair CLI inputs changed");
      };
      const result = await resignLeaseRevocationsForCliAsync(workspace, reviewed, { beforeSign: assertInputs });
      const assertCurrent = () => { result.assertCurrent(); assertInputs(); result.assertCurrent(); };
      assertCurrent();
      if (result.wasValid) {
        console.log(chalk.green("Revocation store signature already valid; re-signed."));
        return;
      }
      // The consequence is stated, not hidden: this certifies the reviewed bytes,
      // so an operator who did not review them is signing blind.
      console.log(chalk.yellow(`Previous signature did NOT verify (${result.previousReason ?? "unknown"}).`));
      assertCurrent();
      console.log(chalk.yellow(`Re-signed ${result.revocationCount} revocation(s) as owner. You are vouching for the reviewed content.`));
    });

  leases
    .command("revoke")
    .requiredOption("--lease-id <id>", "lease ID to revoke")
    .requiredOption("--reason <reason>", "revocation reason")
    .option("--token <lease>", "the lease token, so the revocation records its expiry and is pruned once it lapses")
    .action(async (opts: { leaseId: string; reason: string; token?: string }) => {
      const workspace = process.cwd(), leaseId = opts.leaseId, reason = opts.reason, token = opts.token;
      const assertInputs = () => {
        if (process.cwd() !== workspace || opts.leaseId !== leaseId || opts.reason !== reason || opts.token !== token)
          throw new Error("original lease revoke CLI inputs changed");
        assertOwnerMode(workspace, "lease revoke");
      };
      const revoked = await revokeLeaseForCliAsync({ workspace, leaseId, reason, token, beforeSign: assertInputs });
      revoked.assertCurrent(); assertInputs(); revoked.assertCurrent();
      console.log(chalk.green(`Revoked lease: ${revoked.leaseId}`));
    });
}
