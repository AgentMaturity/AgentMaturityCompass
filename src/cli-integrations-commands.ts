/**
 * The `amc integrations ...` command group: the delivery-hub commands (moved out of cli.ts whole, as the lease and
 * agent groups were, so the ratchet prices no growth there) plus `amc integrations source ...` (SH-INTEG-01/02):
 * source observations, the signed source policy, deterministic admission and proposals for human approval.
 */
import chalk from "chalk";
import type { Command } from "commander";
import {
  integrationsDispatchCli,
  integrationsExportJournalCli,
  integrationsInitCliAsync as integrationsInitCli,
  integrationsStatusCli,
  integrationsTestCli,
  integrationsVerifyCli
} from "./integrations/integrationsCli.js";
import { sourceAdmitCli, sourceCheckCli, sourceObserveCli, sourceStatusCli } from "./integrations/source/sourceIntakeCli.js";
import { initSourcePolicy, loadVerifiedSourcePolicy, signSourcePolicy } from "./integrations/source/sourcePolicyStore.js";

function registerSourceCommands(integrations: Command): void {
  const source = integrations.command("source").description("Source-driven work: observe GitHub events, admit explicit requests, propose work for human approval");

  source
    .command("init")
    .description("Write and sign a source policy template (.amc/integrations/sources.yaml, admission off)")
    .action(async () => {
      const out = await initSourcePolicy(process.cwd());
      console.log(chalk.green(`Source policy created: ${out.path}`));
      console.log(`Signature: ${out.sigPath}`);
    });

  source
    .command("sign")
    .description("Sign the edited source policy (owner mode; an invalid policy is refused)")
    .action(async () => {
      const out = await signSourcePolicy(process.cwd());
      console.log(chalk.green(`Source policy signed: ${out.sigPath} (sha256 ${out.digest})`));
    });

  source
    .command("verify")
    .description("Verify the source policy signature and parse")
    .action(() => {
      const out = loadVerifiedSourcePolicy(process.cwd());
      if (out.ok) {
        console.log(chalk.green(`Source policy valid: ${out.path} (sha256 ${out.digest}, ${out.policy.sources.sources.length} source(s))`));
        return;
      }
      console.log(chalk.red(`Source policy invalid: ${out.detail}`));
      process.exit(1);
    });

  source
    .command("observe")
    .description("Record one GitHub issue_comment or issues event payload (the JSON at $GITHUB_EVENT_PATH) as a SourceObservation")
    .requiredOption("--source <id>", "source id from sources.yaml")
    .requiredOption("--event <file>", "event payload JSON file")
    .action((opts: { source: string; event: string }) => {
      const out = sourceObserveCli({ workspace: process.cwd(), sourceId: opts.source, file: opts.event });
      console.log(JSON.stringify(out, null, 2));
      if (!out.ok) process.exit(1);
    });

  source
    .command("check")
    .description("Decide admission for one event payload against the signed policy; stores and files nothing (exit 1 when not admitted)")
    .requiredOption("--source <id>", "source id from sources.yaml")
    .requiredOption("--event <file>", "event payload JSON file")
    .action((opts: { source: string; event: string }) => {
      const out = sourceCheckCli({ workspace: process.cwd(), sourceId: opts.source, file: opts.event });
      console.log(JSON.stringify(out, null, 2));
      if (!out.admitted) process.exit(1);
    });

  source
    .command("admit")
    .description("Admit recorded observations: an explicit request by an allowed human becomes one approval request for the source's work order")
    .option("--observation <id>", "one observation id")
    .option("--all-pending", "every observation not yet decided")
    .action(async (opts: { observation?: string; allPending?: boolean }) => {
      const out = await sourceAdmitCli({ workspace: process.cwd(), observationId: opts.observation, allPending: opts.allPending });
      console.log(JSON.stringify(out, null, 2));
    });

  source
    .command("status")
    .description("Show the source policy, sources, pending observations and proposals with their approval state")
    .action(() => {
      console.log(JSON.stringify(sourceStatusCli({ workspace: process.cwd() }), null, 2));
    });
}

export function registerIntegrationsCommands(integrations: Command): void {
  integrations
    .command("init")
    .description("Create and sign integrations.yaml with vault-backed secret refs")
    .action(async () => {
      const out = await integrationsInitCli(process.cwd());
      console.log(chalk.green(`Integrations config created: ${out.path}`));
      console.log(`Signature: ${out.sigPath}`);
    });

  integrations
    .command("verify")
    .description("Verify integrations config signature")
    .action(() => {
      const out = integrationsVerifyCli(process.cwd());
      if (out.valid) {
        console.log(chalk.green(`Integrations signature valid: ${out.sigPath}`));
        return;
      }
      console.log(chalk.red(`Integrations signature invalid: ${out.reason ?? "unknown reason"}`));
      process.exit(1);
    });

  integrations
    .command("status")
    .description("Show integration channels and routing")
    .action(() => {
      console.log(JSON.stringify(integrationsStatusCli(process.cwd()), null, 2));
    });

  integrations
    .command("test")
    .description("Dispatch deterministic test event to an integration channel")
    .option("--channel <id>", "specific channel ID")
    .action(async (opts: { channel?: string }) => {
      const out = await integrationsTestCli({
        workspace: process.cwd(),
        channelId: opts.channel
      });
      console.log(JSON.stringify(out, null, 2));
    });

  integrations
    .command("dispatch")
    .description("Dispatch a deterministic integration event")
    .requiredOption("--event <name>", "event name")
    .requiredOption("--agent <id>", "agent ID")
    .option("--summary <text>", "summary")
    .action(async (opts: { event: string; agent: string; summary?: string }) => {
      const out = await integrationsDispatchCli({
        workspace: process.cwd(),
        eventName: opts.event,
        agentId: opts.agent,
        summary: opts.summary
      });
      console.log(JSON.stringify(out, null, 2));
    });

  integrations
    .command("export-journal")
    .description("Export integration delivery journal (receipts + dead letters)")
    .requiredOption("--out <file>", "output JSON file path")
    .action((opts: { out: string }) => {
      const out = integrationsExportJournalCli({
        workspace: process.cwd(),
        outFile: opts.out
      });
      console.log(chalk.green(`Integration delivery journal exported: ${out.outFile}`));
      console.log(`receipts=${out.receiptCount} deadLetters=${out.deadLetterCount}`);
    });

  registerSourceCommands(integrations);
}
