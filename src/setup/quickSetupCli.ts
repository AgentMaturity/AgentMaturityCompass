import type { Command } from "commander";
import chalk from "chalk";
import { runQuickSetup } from "./quickSetup.js";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createOnboardingState, saveOnboardingState, setOnboardingStep } from "./onboardingState.js";

/**
 * CLI-14: what `amc setup --demo` made, said plainly. The note file is not evidence and nothing scores it, so the score
 * stays L0 until AMC records a run; colour goes through chalk, which prints none without a terminal.
 */
export const DEMO_SETUP_SUMMARY: readonly string[] = [
  "✓ Demo workspace created!",
  "  Agent ID: demo-agent",
  "  .amc/amc.config.yaml — workspace config",
  "  .amc/evidence/demo-evidence.json — a placeholder note; it is not evidence and nothing scores it",
  "",
  "  The score for demo-agent stays L0 until AMC records a run it can score.",
  "  Next: amc --agent demo-agent shows that empty score; run amc in your terminal to pick what to watch."
];

export function registerQuickSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Setup wizard for the full-score path and Studio gateway")
    .option("--provider <name>", "openai|anthropic|gemini|groq|mistral|together|openrouter")
    .option("--auto", "non-interactive mode: auto-pick provider if not provided", false)
    .option("--non-interactive", "alias for --auto", false)
    .option("--demo", "Set up a demo workspace with sample data", false)
    .action(async (opts: { provider?: string; auto: boolean; nonInteractive?: boolean; demo: boolean }) => {
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
        let onboarding = createOnboardingState({
          workspace: process.cwd(),
          agentId: "demo-agent",
          mode: "cli",
          status: "in_progress",
          provider: "demo"
        });
        onboarding = setOnboardingStep(onboarding, "detect", "complete", "Demo agent selected.");
        onboarding = setOnboardingStep(onboarding, "workspace", "complete", "Demo workspace config created.");
        onboarding = setOnboardingStep(onboarding, "provider", "skipped", "Demo mode does not require provider setup.");
        onboarding = setOnboardingStep(onboarding, "score", "pending", "Run `amc --agent demo-agent` to generate the full score.");
        onboarding = setOnboardingStep(onboarding, "studio", "pending", "Run `amc up` to open Studio.");
        saveOnboardingState(process.cwd(), onboarding);
        const [head, ...rest] = DEMO_SETUP_SUMMARY;
        console.log(chalk.green(head));
        for (const line of rest) console.log(line);
        return;
      }
      await runQuickSetup({
        cwd: process.cwd(),
        provider: opts.provider,
        auto: opts.auto || Boolean(opts.nonInteractive)
      });
    });
}
