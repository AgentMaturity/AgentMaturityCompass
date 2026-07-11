import chalk from "chalk";
import type { Command } from "commander";
import { stdin } from "node:process";
import { unlockVaultInteractive, vaultStatusNow } from "../vault/vaultCli.js";
import {
  forwardProviderHookEvent,
  getHookIntegrationStatus,
  installHookIntegration,
  removeHookIntegration,
  type HookFileChange,
  type HookProvider
} from "./hookIntegration.js";

async function readStdinAll(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => { data += chunk; });
    stdin.on("end", () => resolve(data));
    if (stdin.isTTY) resolve("");
  });
}

function printFileChanges(files: HookFileChange[]): void {
  for (const file of files) {
    const sensitivity = file.sensitive ? " (secret, mode 0600)" : "";
    console.log(`  ${file.action.padEnd(12)} ${file.path}${sensitivity}`);
  }
}

export function registerHookIntegrationCommands(
  connect: Command,
  activeAgent: () => string | undefined
): void {
  const hooks = connect
    .command("hooks")
    .description("Install, inspect, or remove provider-native AMC observation hooks");

  hooks
    .command("install")
    .description("Install a reversible project hook for Claude Code or Gemini CLI")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--agent <agentId>", "agent ID (defaults to active agent)")
    .option("--bridge-url <url>", "Bridge origin", "http://127.0.0.1:3212")
    .option("--ttl <ttl>", "dedicated observation lease TTL", "7d")
    .option("--rpm <rpm>", "maximum observed hook requests per minute", "120")
    .option("--dry-run", "show exact files without writing or minting a lease", false)
    .option("--json", "emit structured JSON", false)
    .action(async (opts: {
      provider: HookProvider;
      agent?: string;
      bridgeUrl: string;
      ttl: string;
      rpm: string;
      dryRun: boolean;
      json: boolean;
    }) => {
      if (!opts.dryRun && !vaultStatusNow(process.cwd()).unlocked) {
        await unlockVaultInteractive(process.cwd());
      }
      const result = installHookIntegration({
        workspace: process.cwd(),
        provider: opts.provider,
        agentId: opts.agent ?? activeAgent() ?? "default",
        bridgeBase: opts.bridgeUrl,
        ttl: opts.ttl,
        rpm: Number(opts.rpm),
        dryRun: opts.dryRun
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.hex("#4AEF79")(opts.dryRun ? "AMC hook install plan" : result.changed ? "AMC hook installed" : "AMC hook already installed"));
      console.log(`Provider: ${result.provider}`);
      console.log(`Observation lease: ${result.lease.scope} on ${result.lease.route}`);
      if (result.lease.expiresTs) console.log(`Expires: ${new Date(result.lease.expiresTs).toISOString()}`);
      console.log("Files:");
      printFileChanges(result.files);
      console.log("Boundary: observation only; provider control decisions are unchanged.");
    });

  hooks
    .command("status")
    .description("Verify provider config ownership, signed manifest, and observation lease")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--json", "emit structured JSON", false)
    .action((opts: { provider: HookProvider; json: boolean }) => {
      const status = getHookIntegrationStatus({ workspace: process.cwd(), provider: opts.provider });
      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        const color = status.state === "installed" ? chalk.green : status.state === "not-installed" ? chalk.gray : chalk.yellow;
        console.log(color(`AMC hook: ${status.state}`));
        console.log(`Provider: ${status.provider}`);
        console.log(`Config owned: ${status.configOwned ? "yes" : "no"}`);
        console.log(`Manifest valid: ${status.manifestValid ? "yes" : "no"}`);
        console.log(`Lease valid: ${status.leaseValid ? "yes" : "no"}`);
        if (status.expiresTs) console.log(`Expires: ${new Date(status.expiresTs).toISOString()}`);
        for (const issue of status.issues) console.log(chalk.yellow(`Issue: ${issue}`));
      }
      if (!["installed", "not-installed"].includes(status.state)) process.exitCode = 1;
    });

  hooks
    .command("remove")
    .description("Remove only the signed AMC-owned hook and revoke its lease")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--dry-run", "show exact files without changing provider config", false)
    .option("--json", "emit structured JSON", false)
    .action(async (opts: { provider: HookProvider; dryRun: boolean; json: boolean }) => {
      if (!opts.dryRun && !vaultStatusNow(process.cwd()).unlocked) {
        await unlockVaultInteractive(process.cwd());
      }
      const result = removeHookIntegration({
        workspace: process.cwd(),
        provider: opts.provider,
        dryRun: opts.dryRun
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.hex("#4AEF79")(opts.dryRun ? "AMC hook removal plan" : result.changed ? "AMC hook removed" : "AMC hook not installed"));
      console.log(`Provider: ${result.provider}`);
      console.log("Files:");
      printFileChanges(result.files);
    });

  hooks
    .command("forward", { hidden: true })
    .description("Internal provider hook observation forwarder")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--token-file <path>", "dedicated hook lease token")
    .option("--bridge-url <url>", "Bridge origin", "http://127.0.0.1:3212")
    .action(async (opts: { provider: HookProvider; agent: string; tokenFile: string; bridgeUrl: string }) => {
      const rawInput = await readStdinAll();
      if (!rawInput.trim()) throw new Error("provider hook input is required on stdin");
      await forwardProviderHookEvent({
        workspace: process.cwd(),
        provider: opts.provider,
        agentId: opts.agent,
        tokenFile: opts.tokenFile,
        bridgeBase: opts.bridgeUrl,
        rawInput
      });
      // Both supported providers treat an empty JSON object as a neutral observation result.
      process.stdout.write("{}\n");
    });
}
