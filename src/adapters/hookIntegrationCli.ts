import chalk from "chalk";
import type { Command } from "commander";
import { stdin } from "node:process";
import { unlockVaultInteractive, vaultStatusNow } from "../vault/vaultCli.js";
import { unlockVault } from "../vault/vault.js";
import {
  failClosedProviderControlResponse,
  forwardProviderHookControl,
  forwardProviderHookEvent,
  getHookIntegrationStatus,
  inspectProviderHookEvent,
  installHookIntegration,
  removeHookIntegration,
  type HookFileChange,
  type HookMode,
  type HookProvider
} from "./hookIntegration.js";
import { serializeProviderControlResponse } from "../bridge/hookControl.js";
import { inspectHookActionLifecycle } from "../watch/hookActionLifecycle.js";
import { inspectHookHealth } from "../watch/hookHealthDiagnostics.js";

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

function isHookProvider(value: string): value is HookProvider {
  return value === "claude-code" || value === "gemini-cli";
}

export function registerHookIntegrationCommands(
  connect: Command,
  activeAgent: () => string | undefined
): void {
  const hooks = connect
    .command("hooks")
    .description("Install, inspect, or remove provider-native AMC observation and control hooks");

  hooks
    .command("install")
    .description("Install a reversible project hook for Claude Code or Gemini CLI")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--mode <mode>", "observe|control", "observe")
    .option("--agent <agentId>", "agent ID (defaults to active agent)")
    .option("--bridge-url <url>", "Bridge origin", "http://127.0.0.1:3212")
    .option("--ttl <ttl>", "dedicated observation lease TTL", "7d")
    .option("--rpm <rpm>", "maximum observed hook requests per minute", "120")
    .option("--dry-run", "show exact files without writing or minting a lease", false)
    .option("--json", "emit structured JSON", false)
    .action(async (opts: {
      provider: HookProvider;
      mode: HookMode;
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
        mode: opts.mode,
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
      console.log(`Mode: ${result.mode}`);
      console.log(`Hook lease: ${result.lease.scopes.join(", ")} on ${result.lease.route}`);
      if (result.lease.expiresTs) console.log(`Expires: ${new Date(result.lease.expiresTs).toISOString()}`);
      console.log("Files:");
      printFileChanges(result.files);
      console.log(result.mode === "control"
        ? "Boundary: control is loopback-only and raw provider input is never retained."
        : "Boundary: observation only; provider control decisions are unchanged.");
    });

  hooks
    .command("status")
    .description("Verify provider config ownership, mode, signed manifest, and hook lease")
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
        if (status.mode) console.log(`Mode: ${status.mode}`);
        console.log(`Config owned: ${status.configOwned ? "yes" : "no"}`);
        console.log(`Manifest valid: ${status.manifestValid ? "yes" : "no"}`);
        console.log(`Lease valid: ${status.leaseValid ? "yes" : "no"}`);
        if (status.expiresTs) console.log(`Expires: ${new Date(status.expiresTs).toISOString()}`);
        for (const issue of status.issues) console.log(chalk.yellow(`Issue: ${issue}`));
      }
      if (!["installed", "not-installed"].includes(status.state)) process.exitCode = 1;
    });

  hooks
    .command("health")
    .description("Verify signed hook setup and show the latest verified provider event")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--json", "emit structured JSON", false)
    .action((opts: { provider: string; json: boolean }) => {
      if (!isHookProvider(opts.provider)) {
        const message = "provider must be claude-code or gemini-cli";
        if (opts.json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        else console.error(chalk.red(message));
        process.exitCode = 2;
        return;
      }
      const workspace = process.cwd();
      const passphrase = process.env.AMC_VAULT_PASSPHRASE;
      if (!vaultStatusNow(workspace).unlocked && passphrase) {
        try {
          unlockVault(workspace, passphrase);
        } catch {
          // The diagnostic below reports unavailable evidence without exposing credential errors.
        }
      }
      const health = inspectHookHealth({ workspace, provider: opts.provider });
      if (opts.json) {
        console.log(JSON.stringify(health, null, 2));
      } else {
        const color = health.status === "observed"
          ? chalk.hex("#4AEF79")
          : health.status === "fail_closed"
            ? chalk.red
            : chalk.yellow;
        console.log(color(`AMC hook health: ${health.status}`));
        console.log(`Provider: ${health.provider}`);
        console.log(`Agent: ${health.agentId ?? "not bound"}`);
        console.log(`Installation: ${health.installation.state}`);
        console.log(`Observed events: ${health.evidence.eventCount}`);
        if (health.evidence.lastEvent) {
          console.log(`Last verified event: ${health.evidence.lastEvent.eventType}`);
          console.log(`Observed at: ${health.evidence.lastEvent.observedAt}`);
          console.log(`Action: ${health.evidence.lastEvent.actionId}`);
        }
        for (const reason of health.reasonCodes) console.log(chalk.yellow(`Issue: ${reason}`));
        console.log(chalk.gray(`Boundary: ${health.claimBoundary}`));
      }
      process.exitCode = health.status === "observed" ? 0 : health.status === "fail_closed" ? 2 : 1;
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
    .command("lifecycle")
    .description("Verify one requested, controlled, and terminal provider action lifecycle")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--action <actionId>", "provider action ID")
    .option("--json", "emit structured JSON", false)
    .action((opts: { agent: string; action: string; json: boolean }) => {
      const lifecycle = inspectHookActionLifecycle({
        workspace: process.cwd(),
        agentId: opts.agent,
        actionId: opts.action,
      });
      if (opts.json) {
        console.log(JSON.stringify(lifecycle, null, 2));
      } else {
        const color = lifecycle.valid ? chalk.hex("#4AEF79") : chalk.red;
        console.log(color(`AMC hook action: ${lifecycle.status}`));
        console.log(`Agent: ${lifecycle.agentId}`);
        console.log(`Action: ${lifecycle.actionId}`);
        console.log(`Provider: ${lifecycle.provider ?? "unverified"}`);
        console.log(`Evidence: ${lifecycle.evidenceEventIds.length} signed event(s)`);
        for (const reason of lifecycle.reasonCodes) console.log(chalk.yellow(`Issue: ${reason}`));
      }
      if (lifecycle.failClosed) process.exitCode = 1;
    });

  hooks
    .command("forward", { hidden: true })
    .description("Internal provider hook observation forwarder")
    .requiredOption("--provider <provider>", "claude-code|gemini-cli")
    .option("--mode <mode>", "observe|control", "observe")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--token-file <path>", "dedicated hook lease token")
    .option("--bridge-url <url>", "Bridge origin", "http://127.0.0.1:3212")
    .action(async (opts: { provider: HookProvider; mode: HookMode; agent: string; tokenFile: string; bridgeUrl: string }) => {
      const rawInput = await readStdinAll();
      if (!rawInput.trim()) throw new Error("provider hook input is required on stdin");
      let inspection: ReturnType<typeof inspectProviderHookEvent>;
      try {
        inspection = inspectProviderHookEvent({ provider: opts.provider, rawInput });
      } catch (error) {
        if (opts.mode !== "control") throw error;
        process.stderr.write("AMC hook control input invalid; action denied.\n");
        process.stdout.write(`${serializeProviderControlResponse(failClosedProviderControlResponse(opts.provider))}\n`);
        return;
      }
      if (opts.mode === "control" && inspection.phase === "requested") {
        try {
          const result = await forwardProviderHookControl({
            workspace: process.cwd(),
            provider: opts.provider,
            agentId: opts.agent,
            tokenFile: opts.tokenFile,
            bridgeBase: opts.bridgeUrl,
            rawInput
          });
          process.stdout.write(`${serializeProviderControlResponse(result.control.providerResponse)}\n`);
        } catch {
          process.stderr.write("AMC hook control unavailable; action denied.\n");
          process.stdout.write(`${serializeProviderControlResponse(failClosedProviderControlResponse(opts.provider))}\n`);
        }
        return;
      }
      await forwardProviderHookEvent({
        workspace: process.cwd(),
        provider: opts.provider,
        mode: opts.mode,
        agentId: opts.agent,
        tokenFile: opts.tokenFile,
        bridgeBase: opts.bridgeUrl,
        rawInput
      });
      // Both supported providers treat an empty JSON object as a neutral observation result.
      process.stdout.write("{}\n");
    });
}
