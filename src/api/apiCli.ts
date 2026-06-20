import type { Command } from "commander";
import chalk from "chalk";
import { API_ROUTE_REGISTRY } from "./index.js";

function routePath(prefix: string): string {
  return prefix === "/api/v1/health" ? prefix : `${prefix}/*`;
}

function formatTimestamp(ts: number | null): string {
  return ts === null ? "never" : new Date(ts).toISOString();
}

export function registerApiCommands(program: Command): void {
  const apiCmd = program.command("api").description("REST API management");

  apiCmd
    .command("status")
    .description("Show API integration status")
    .action(async () => {
      const protectedRoutes = API_ROUTE_REGISTRY.filter((route) => route.auth === "protected").length;
      const publicRoutes = API_ROUTE_REGISTRY.filter((route) => route.auth === "public").length;

      console.log(chalk.bold("AMC REST API v1"));
      console.log(`  Route families: ${API_ROUTE_REGISTRY.length} (${protectedRoutes} protected, ${publicRoutes} public)`);
      console.log("  Base path: /api/v1/");
      console.log("  Integrated into Studio server at :3212");

      const net = await import("node:net");
      const alive = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ port: 3212, timeout: 1000 }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.on("error", () => resolve(false));
        sock.on("timeout", () => {
          sock.destroy();
          resolve(false);
        });
      });
      if (alive) {
        console.log(chalk.green("OK Studio is running on port 3212."));
      } else {
        console.log(chalk.yellow("WARN Studio is not running on port 3212. Start with: amc up"));
      }
    });

  apiCmd
    .command("routes")
    .description("List all available REST API route families")
    .action(() => {
      console.log(chalk.bold("\nAMC REST API v1 - Route Families\n"));
      for (const route of API_ROUTE_REGISTRY) {
        for (const prefix of route.prefixes) {
          const methods = route.methods.join(",");
          const methodText = methods.padEnd(18);
          const pathText = routePath(prefix).padEnd(34);
          const authText = route.auth.padEnd(9);
          console.log(
            `  ${chalk.bold.cyan(methodText)} ${chalk.white(pathText)} ${chalk.gray(authText)} ${chalk.gray(route.validationPolicy)} ${route.description}`
          );
        }
      }
      console.log("");
      console.log(chalk.gray("  Base URL: http://localhost:3212"));
      console.log(chalk.gray("  Auth:     Bearer token (see: amc user token)"));
      console.log(chalk.gray("  Docs:     amc api docs | docs/API_REFERENCE.md"));
      console.log("");
    });

  apiCmd
    .command("start")
    .description("Start the AMC API server (alias for 'amc up')")
    .option("--port <port>", "port number", "3212")
    .action(async (opts: { port?: string }) => {
      console.log(chalk.bold("\nStarting AMC API Server...\n"));
      console.log(chalk.gray("  The API is served by AMC Studio. Starting it now.\n"));
      const { runStudioForeground } = await import("../studio/studioSupervisor.js");
      await runStudioForeground({ workspace: process.cwd(), apiPort: Number(opts.port) || 3212 });
    });

  apiCmd
    .command("docs")
    .description("Show API reference documentation summary and link")
    .action(() => {
      console.log(chalk.bold("\nAMC API Reference\n"));
      console.log("  Full docs: docs/API_REFERENCE.md (in your AMC install directory)");
      console.log("  Online:    https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/API_REFERENCE.md");
      console.log("");
      console.log(chalk.bold("  Quick start:"));
      console.log(`  1. Start Studio:      ${chalk.hex("#4AEF79")("amc up")}`);
      console.log(`  2. Get a token:       ${chalk.hex("#4AEF79")("amc user token")}`);
      console.log(`  3. List agents:       ${chalk.hex("#4AEF79")("curl -H 'Authorization: Bearer <token>' http://localhost:3212/api/v1/agents")}`);
      console.log(`  4. List all routes:   ${chalk.hex("#4AEF79")("amc api routes")}`);
      console.log("");
      console.log(chalk.bold("  Authentication:"));
      console.log("  Protected endpoints require a Bearer token or admin token header.");
      console.log("  Public legacy bridge endpoints redirect to /bridge/openai/v1/*.");
      console.log("");
      console.log(chalk.bold("  Response format:"));
      console.log("  All responses are JSON. Errors use { error: string, code?: string }.");
      console.log("");
    });

  const keyCmd = apiCmd.command("key").description("Manage programmatic API keys");

  keyCmd
    .command("create")
    .description("Create a programmatic API key and show the secret once")
    .option("--scope <scope>", "read-only|write|admin", "read-only")
    .option("--label <label>", "human-readable label")
    .option("--expires-in <duration>", "30m, 12h, 90d, 4w, or never", "never")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { scope: string; label?: string; expiresIn?: string; json?: boolean }) => {
      const { createApiKeyForCli } = await import("../auth/apiKeyCli.js");
      const result = createApiKeyForCli({
        workspace: process.cwd(),
        scope: opts.scope,
        label: opts.label,
        expiresIn: opts.expiresIn
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.bold("\nAMC API key created\n"));
      console.log(`  Key ID:     ${result.keyId}`);
      console.log(`  Label:      ${result.record.label}`);
      console.log(`  Scope:      ${result.record.scope}`);
      console.log(`  Expires:    ${formatTimestamp(result.record.expiresTs)}`);
      console.log(`  Store:      ${result.storePath}`);
      console.log("");
      console.log(chalk.yellow("  API key (shown once):"));
      console.log(`  ${result.apiKey}`);
      console.log("");
    });

  keyCmd
    .command("list")
    .description("List programmatic API keys without printing secrets")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const { listApiKeysForCli } = await import("../auth/apiKeyCli.js");
      const result = listApiKeysForCli({ workspace: process.cwd() });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.bold("\nAMC API keys\n"));
      if (result.keys.length === 0) {
        console.log(chalk.gray("  No API keys found."));
        console.log(chalk.gray(`  Store: ${result.storePath}`));
        console.log("");
        return;
      }
      for (const key of result.keys) {
        console.log(
          `  ${chalk.bold(key.keyId)} ${key.scope.padEnd(9)} ${key.status.padEnd(7)} ${key.prefix.padEnd(16)} ${key.label}`
        );
        console.log(chalk.gray(`    created=${formatTimestamp(key.createdTs)} expires=${formatTimestamp(key.expiresTs)} lastUsed=${formatTimestamp(key.lastUsedTs)}`));
      }
      console.log("");
      console.log(chalk.gray(`  Store: ${result.storePath}`));
      console.log("");
    });

  keyCmd
    .command("revoke")
    .description("Revoke a programmatic API key")
    .argument("<keyId>", "API key ID")
    .option("--json", "Output as JSON", false)
    .action(async (keyId: string, opts: { json?: boolean }) => {
      const { revokeApiKeyForCli } = await import("../auth/apiKeyCli.js");
      const result = revokeApiKeyForCli({ workspace: process.cwd(), keyId });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.green(`API key revoked: ${result.record.keyId}`));
      console.log(chalk.gray(`  Store: ${result.storePath}`));
    });
}
