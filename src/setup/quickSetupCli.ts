import type { Command } from "commander";
import { runQuickSetup } from "./quickSetup.js";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export function registerQuickSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Quick setup wizard for provider + gateway")
    .option("--provider <name>", "openai|anthropic|gemini|groq|mistral|together|openrouter")
    .option("--auto", "non-interactive mode: auto-pick provider if not provided", false)
    .option("--demo", "Set up a demo workspace with sample data", false)
    .action(async (opts: { provider?: string; auto: boolean; demo: boolean }) => {
      if (opts.demo) {
        const amcDir = join(process.cwd(), ".amc");
        if (!existsSync(amcDir)) {
          mkdirSync(amcDir, { recursive: true });
        }
        // Write minimal demo config
        const demoConfig = {
          version: "1.0",
          agentId: "demo-agent",
          profile: "dev",
          demo: true,
          security: { trustBoundaryMode: "isolated" }
        };
        writeFileSync(join(amcDir, "amc.config.yaml"),
          `# AMC Demo Workspace\nversion: "1.0"\nagentId: demo-agent\nprofile: dev\ndemo: true\nsecurity:\n  trustBoundaryMode: isolated\n`
        );
        // Write sample evidence
        const evidenceDir = join(amcDir, "evidence");
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(join(evidenceDir, "demo-evidence.json"), JSON.stringify({
          agentId: "demo-agent",
          type: "demo",
          ts: new Date().toISOString(),
          data: { note: "Demo evidence created by amc setup --demo" }
        }, null, 2));
        console.log("\x1b[32m✓ Demo workspace created!\x1b[0m");
        console.log("  Agent ID: demo-agent");
        console.log("  .amc/amc.config.yaml — workspace config");
        console.log("  .amc/evidence/demo-evidence.json — sample evidence");
        console.log("\n  Next: amc quickscore --auto --agent demo-agent");
        return;
      }
      await runQuickSetup({
        cwd: process.cwd(),
        provider: opts.provider,
        auto: opts.auto
      });
    });
}
