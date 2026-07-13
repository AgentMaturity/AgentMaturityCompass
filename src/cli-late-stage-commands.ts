import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import type { Command } from "commander";
import { openLedger } from "./ledger/ledger.js";
import { loadRunReport } from "./diagnostic/runner.js";
import { resolveAgentId } from "./fleet/paths.js";
import { buildDashboard } from "./dashboard/build.js";
import { serveDashboard } from "./dashboard/serve.js";
import { toErrorMessage } from "./utils/errors.js";
import { pathExists, readUtf8 } from "./utils/fs.js";
import { runAttackPlugins, listAttackPlugins, renderAttackPluginReport } from "./redteam/attackPlugins.js";
import { runRedTeam, renderRedTeamMarkdown, listStrategies } from "./redteam/index.js";
import { registerTransparencyReportCommands } from "./transparency/transparencyReportCli.js";
import { registerMcpCommands } from "./mcp/mcpCli.js";
import { registerLintCommands } from "./lint/lintCli.js";
import { passportBadgeCli } from "./passport/passportCli.js";
import {
  packInstallCli,
  packPublishCli,
  packSearchCli,
  packInfoCli,
  packUninstallCli,
  packListCli,
  packInitCli,
  resolvePackEntryPath,
  packRegistryServeCli,
  packRegistryInitCli
} from "./packs/packCli.js";
import { registerObservabilityCommands, registerCorrectionCommands } from "./cli-observability-commands.js";
import { registerTraceCommands, registerAlertCommands } from "./cli-trace-commands.js";
import { registerNeutralImportCommands } from "./cli-import-commands.js";
import { registerStrategyCommands } from "./cli-strategy-commands.js";
import { registerEvalDatasetCommands, registerLiteScoreCommands } from "./cli-eval-dataset-commands.js";
import {
  registerBusinessCommands,
  registerExecutiveCommands,
  registerLeaderboardCommands,
  registerInventoryCommands,
  registerCommsCheckCommands
} from "./cli-business-commands.js";

type ActiveAgentResolver = (program: Command) => string | undefined;

type LateStageCliCommandDeps = {
  program: Command;
  activeAgent: ActiveAgentResolver;
  demo: Command;
  dashboard: Command;
  watch: Command;
  monitor: Command;
  integrations: Command;
  openExternalUrl: (url: string) => boolean;
};

type PackPackageManifest = {
  name?: string;
  version?: string;
  main?: string;
  amcPack?: {
    type?: string;
  };
};

function directoryNameForPackName(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "amc-pack";
}

function readPackPackageManifest(packDir: string): PackPackageManifest | null {
  const manifestPath = join(packDir, "package.json");
  if (!pathExists(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readUtf8(manifestPath)) as PackPackageManifest;
  } catch {
    return null;
  }
}

function findImmediatePackDirectories(parentDir: string): string[] {
  if (!pathExists(parentDir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const candidate = join(parentDir, entry.name);
    const manifest = readPackPackageManifest(candidate);
    if (manifest?.amcPack) {
      out.push(candidate);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function registerLateStageCliCommands({
  program,
  activeAgent,
  demo,
  dashboard,
  watch,
  monitor,
  integrations,
  openExternalUrl
}: LateStageCliCommandDeps): void {
  type ProspectDemoCliOptions = {
    share?: boolean;
    out: string;
    slug: string;
    publicBaseUrl?: string;
    live?: boolean;
    json?: boolean;
  };

  async function runProspectDemoCli(opts: ProspectDemoCliOptions & { forceShare?: boolean }): Promise<void> {
    const {
      buildProspectDemoPlan,
      renderProspectDemoMarkdown,
      writeProspectDemoShareBundle
    } = await import("./demo/prospectDemo.js");
    const shouldWriteShare = opts.forceShare === true || opts.share === true || Boolean(opts.publicBaseUrl);
    let liveResult = null;

    if (opts.live) {
      if (!opts.json) {
        console.log(chalk.bold("\nAMC Prospect Demo - live DEMO_ONLY evidence\n"));
        console.log(chalk.gray("  Running the no-vault demo gateway path before rendering the prospect flow..."));
      }
      const { runDemoWithoutUserVault } = await import("./demo/demoRun.js");
      liveResult = await runDemoWithoutUserVault();
    }

    const plan = buildProspectDemoPlan(liveResult);
    const bundle = shouldWriteShare
      ? writeProspectDemoShareBundle({
          outputRoot: resolve(process.cwd(), opts.out),
          slug: opts.slug,
          publicBaseUrl: opts.publicBaseUrl,
          plan
        })
      : null;

    if (opts.json) {
      console.log(JSON.stringify({ plan, bundle }, null, 2));
      return;
    }

    console.log(chalk.bold("\nAMC Prospect Demo - 5-minute flow\n"));
    console.log(chalk.gray(`  Trust label: ${plan.trustLabel}`));
    console.log(chalk.gray(`  Claim boundary: ${plan.claimBoundary}\n`));
    console.log(renderProspectDemoMarkdown(plan));
    if (bundle) {
      console.log(chalk.green(`Share bundle written: ${bundle.htmlPath}`));
      console.log(chalk.gray(`  Manifest: ${bundle.manifestPath}`));
      console.log(chalk.gray(`  URL: ${bundle.shareUrl}`));
      if (bundle.manifest.publicUrl) {
        console.log(chalk.gray("  Publish the generated directory to the matching public base URL before sending this link."));
      } else {
        console.log(chalk.gray("  Add --public-base-url after publishing this directory to print a client-facing HTTPS URL."));
      }
    } else {
      console.log(chalk.gray("Generate the leave-behind: amc demo share --public-base-url <url>"));
      console.log(chalk.gray("Attach live DEMO_ONLY evidence: amc demo prospect --live --share"));
    }
  }

  demo
    .command("gap")
    .description("The 84-point documentation inflation gap — keyword vs execution scoring")
    .option("--json", "Output as JSON")
    .option("--fast", "Skip the dramatic reveal (instant output)")
    .action(async (opts: { json?: boolean; fast?: boolean }) => {
      const { runGapDemo } = await import("./demo/gapDemo.js");
      const result = runGapDemo();

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const delay = opts.fast ? 0 : 80;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      console.log("");
      console.log(chalk.bold("  🧭 AMC — The 84-Point Documentation Inflation Gap"));
      console.log(chalk.gray("  Same agent. Two scoring methods. Very different results."));
      console.log("");

      // Phase 1: Keyword scoring
      console.log(chalk.bold.green("  ━━━ Phase 1: Keyword / Self-Reported Scoring ━━━"));
      console.log(chalk.gray("  Method: Check if the agent's documentation mentions the right keywords."));
      console.log("");

      for (const test of result.tests) {
        await sleep(delay);
        console.log(chalk.green(`  ✅ ${test.question}`));
        console.log(chalk.gray(`     Claim: "${test.claim}" → Keywords found → 5/5`));
      }

      console.log("");
      console.log(chalk.bold.green(`  Keyword Score: ${result.keywordScore}/${result.keywordMax} (${result.keywordPercent}%) ✅`));
      console.log(chalk.green("  Verdict: Agent is fully mature! Ship it! 🚀"));
      console.log("");

      await sleep(delay * 5);

      // Phase 2: Execution scoring
      console.log(chalk.bold.red("  ━━━ Phase 2: AMC Execution-Verified Scoring ━━━"));
      console.log(chalk.gray("  Method: Actually test each claim. Watch what the agent does, not what it says."));
      console.log("");

      for (const test of result.tests) {
        await sleep(delay);
        const icon = test.passed ? chalk.yellow("⚠") : chalk.red("✗");
        const scoreColor = test.executionScore === 0 ? chalk.red : test.executionScore <= 1 ? chalk.yellow : chalk.green;
        console.log(`  ${icon} ${chalk.white(test.question)}`);
        console.log(chalk.gray(`     Test: ${test.test}`));
        console.log(`     ${scoreColor(`${test.executionScore}/5`)} ${chalk.gray(test.finding)}`);
      }

      console.log("");
      console.log(chalk.bold.red(`  Execution Score: ${result.executionScore}/${result.executionMax} (${result.executionPercent}%) ❌`));
      console.log("");

      await sleep(delay * 3);

      // The gap
      console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
      console.log("");
      console.log(chalk.bold(`  📊 The Gap`));
      console.log("");
      console.log(chalk.green(`     Keyword scoring:   ${result.keywordPercent}%`) + chalk.gray("  (what the agent says)"));
      console.log(chalk.red(`     Execution scoring: ${result.executionPercent}%`) + chalk.gray("  (what the agent does)"));
      console.log(chalk.bold.yellow(`     Gap:               ${result.gap} points`));
      console.log("");
      console.log(chalk.gray("  Every claim checked out on paper. Every claim failed in practice."));
      console.log(chalk.gray("  This is why AMC scores from execution evidence, not documentation."));
      console.log("");
      console.log(chalk.bold("  AMC closes this gap with:"));
      console.log(chalk.white("  • Execution-verified evidence (not self-reported claims)"));
      console.log(chalk.white("  • Cryptographic proof chains (can't be faked)"));
      console.log(chalk.white("  • Trust-tiered scoring (self-reported evidence is capped at 0.4×)"));
      console.log(chalk.white("  • Adversarial testing (74 attack packs that actually probe behavior)"));
      console.log("");
      console.log(chalk.gray("  Start scoring your agent:"), chalk.hex('#4AEF79')("amc init"));
      console.log("");
    });

  demo
    .command("run")
    .description("Run a simulated agent through the AMC gateway and produce a real score (~30s)")
    .option("--gateway <url>", "Gateway URL (default: auto-detect running instance)")
    .option("--no-vault", "Run an ephemeral demo gateway without using the current workspace vault")
    .option("--demo", "Alias for --no-vault")
    .option("--json", "Output as JSON")
    .action(async (opts: { gateway?: string; vault?: boolean; demo?: boolean; json?: boolean }) => {
      const { runDemo, runDemoWithoutUserVault, shouldRunNoVaultDemo, startDemoUpstream } = await import("./demo/demoRun.js");
      const { issueLeaseForCli } = await import("./leases/leaseCli.js");
      const { ensureLeaseRevocationStore } = await import("./leases/leaseCli.js");

      if (shouldRunNoVaultDemo(opts)) {
        if (opts.gateway) {
          console.error(chalk.red("--gateway cannot be combined with --no-vault; --no-vault starts its own ephemeral demo gateway."));
          process.exit(1);
        }

        if (!opts.json) {
          console.log(chalk.bold("\n🎮  AMC Live Demo (no-vault)\n"));
          console.log(chalk.gray("  Starting an ephemeral demo workspace, upstream, and AMC gateway..."));
        }
        const result = await runDemoWithoutUserVault();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.green(`\n✓ Demo complete in ${(result.durationMs / 1000).toFixed(1)}s`));
        console.log(chalk.gray(`  ${result.requestsSent} requests sent through an ephemeral AMC gateway`));
        console.log(chalk.gray(`  ${result.evidenceItems} demo evidence events captured`));
        console.log(chalk.gray(`  Gateway config signature: ${result.gatewaySignatureValid ? "valid" : "invalid"}`));
        console.log(chalk.gray(`  Demo maturity sample: ${result.maturityLevel} / ${result.maturityScore}`));
        console.log(chalk.yellow("  Trust label: DEMO_ONLY — not production audit evidence"));
        console.log(chalk.gray(`  Evidence workspace: ${result.evidenceWorkspace}\n`));
        return;
      }

      // Start demo upstream server
      console.log(chalk.bold("\n🎮  AMC Live Demo\n"));
      console.log(chalk.gray("  Starting demo upstream server..."));
      const upstream = await startDemoUpstream();
      try {
        console.log(chalk.gray(`  Demo upstream: ${upstream.baseUrl}`));

        // Detect or use provided gateway
        let gatewayUrl = opts.gateway ?? "http://127.0.0.1:3210";

        // Check if gateway is running
        try {
          await fetch(`${gatewayUrl.replace(/\/$/, "")}/local/v1/models`);
        } catch {
          console.log(chalk.yellow("\n⚠  Gateway not running. Start it with:"));
          console.log(chalk.gray(`  LOCAL_OPENAI_BASE_URL=${upstream.baseUrl} amc up`));
          console.log(chalk.gray("  Or run without setup: amc demo run --no-vault"));
          process.exit(1);
        }

        // Issue a lease token for the demo
        console.log(chalk.gray("  Issuing demo lease token..."));
        const workspace = process.cwd();
        ensureLeaseRevocationStore(workspace);
        const wsId = (await import("./workspaces/workspaceId.js")).workspaceIdFromDirectory(workspace);
        const lease = issueLeaseForCli({
          workspace,
          workspaceId: wsId,
          agentId: "default",
          ttl: "15m",
          scopes: "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
          routes: "/local",
          models: "*",
          rpm: 60,
          tpm: 200000,
          maxCostUsdPerDay: null,
          workOrderId: undefined,
        });
        console.log(chalk.gray(`  Lease issued (15m TTL)`));

        console.log(chalk.gray(`  Gateway: ${gatewayUrl}`));
        console.log(chalk.gray("  Simulating a multi-turn AI agent through the AMC gateway...\n"));

        const steps = [
          "Sending research task conversation...",
          "Sending data analysis with tool calls...",
          "Sending security audit scenario...",
          "Sending code review request...",
          "Sending financial escalation scenario...",
          "Sending error recovery scenario...",
        ];

        const result = await runDemo(gatewayUrl, lease.token);

        console.log(chalk.green(`\n✓ Demo complete in ${(result.durationMs / 1000).toFixed(1)}s`));
        console.log(chalk.gray(`  ${result.requestsSent} requests sent through gateway`));
        console.log(chalk.gray(`  ~${result.evidenceItems} evidence items captured\n`));

        void steps;

        // Now run the diagnostic
        console.log(chalk.bold("📊  Running diagnostic...\n"));

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.gray("  Run 'amc run --agent default' to see the full scored report."));
          console.log(chalk.gray("  Run 'amc score evidence-coverage default' to see evidence gaps."));
          console.log(chalk.gray("  Open http://127.0.0.1:3212/console for the dashboard.\n"));
        }
      } finally {
        await upstream.close();
      }
    });

  demo
    .command("prospect")
    .description("Run a guided 5-minute prospect demo flow")
    .option("--share", "Generate a static prospect share bundle and print its URL", false)
    .option("--out <dir>", "Directory for --share output", ".amc/demo/prospect")
    .option("--slug <slug>", "Share bundle slug", "prospect-demo")
    .option("--public-base-url <url>", "Public base URL for share bundle after upload")
    .option("--live", "Run the no-vault live demo and attach DEMO_ONLY evidence summary", false)
    .option("--json", "Output as JSON", false)
    .action(async (opts: ProspectDemoCliOptions) => {
      await runProspectDemoCli(opts);
    });

  demo
    .command("share")
    .description("Generate a static client-facing prospect demo bundle")
    .option("--out <dir>", "Directory for share output", ".amc/demo/prospect")
    .option("--slug <slug>", "Share bundle slug", "prospect-demo")
    .option("--public-base-url <url>", "Public base URL for share bundle after upload")
    .option("--live", "Run the no-vault live demo and attach DEMO_ONLY evidence summary", false)
    .option("--json", "Output as JSON", false)
    .action(async (opts: ProspectDemoCliOptions) => {
      await runProspectDemoCli({ ...opts, forceShare: true });
    });

  // Agent Transparency Report + MCP Server
  registerTransparencyReportCommands(program);
  registerMcpCommands(program);

  // Lint
  registerLintCommands(program);

  // ── Observability, corrections, and feedback loop commands ──
  registerObservabilityCommands(program, activeAgent);
  registerCorrectionCommands(program, activeAgent);
  registerTraceCommands(program, activeAgent);
  registerAlertCommands(program, activeAgent);
  registerNeutralImportCommands(program, activeAgent);
  registerStrategyCommands(program, activeAgent);
  registerEvalDatasetCommands(program, activeAgent);
  registerLiteScoreCommands(program);
  registerBusinessCommands(program, activeAgent);
  registerExecutiveCommands(program, activeAgent);
  registerLeaderboardCommands(program);
  registerInventoryCommands(program);
  registerCommsCheckCommands(program);

  // ── amc fix: Auto-remediation command ──
  program
    .command("fix")
    .description("Generate remediation patches for identified gaps (auto-fix mode)")
    .option("--agent <agentId>", "agent ID")
    .option("--dry-run", "show what would be generated without writing files", false)
    .option("--target-level <level>", "target maturity level (L1-L5)", "L3")
    .option("--framework <framework>", "target framework (langchain, crewai, autogen, generic)")
    .option("--out <dir>", "output directory for patches", ".amc/fixes")
    .action(async (opts: { agent?: string; dryRun: boolean; targetLevel: string; framework?: string; out: string }) => {
      const { existsSync, mkdirSync, writeFileSync } = require("fs");
      const agentId = opts.agent ?? activeAgent(program) ?? "default";
      const targetLevelNum = parseInt(opts.targetLevel.replace(/\D/g, ""), 10) || 3;
      const outDir = resolve(process.cwd(), opts.out);

      console.log(chalk.bold(`\n🔧 AMC Auto-Fix — Agent: ${agentId}, Target: L${targetLevelNum}\n`));

      // Try to load last diagnostic run for gap analysis
      let gaps: Array<{ questionId: string; currentLevel: number; targetLevel: number; narrative: string; fix?: string }> = [];
      try {
        const ledger = openLedger(process.cwd());
        const runs = ledger.listRuns();
        if (runs.length > 0) {
          const lastRun = runs[runs.length - 1]!;
          const report = loadRunReport(process.cwd(), lastRun.run_id, agentId);
          gaps = (report.layerScores ?? []).flatMap((layer: any) =>
            (layer.questions ?? [])
              .filter((q: any) => q.finalLevel < targetLevelNum)
              .map((q: any) => ({
                questionId: q.questionId,
                currentLevel: q.finalLevel,
                targetLevel: targetLevelNum,
                narrative: q.narrative ?? "",
              }))
          );
        }
      } catch {
        // No diagnostic runs — use generic fixes
      }

      // Generate framework-specific fixes
      const fixes: Array<{ file: string; content: string; description: string }> = [];

      // Always generate: safety guardrails config
      fixes.push({
        file: "guardrails.yaml",
        description: "Safety guardrails configuration",
        content: [
          "# AMC Auto-Generated Guardrails",
          `# Target: L${targetLevelNum} | Agent: ${agentId}`,
          `# Generated: ${new Date().toISOString()}`,
          "",
          "guardrails:",
          "  input_validation:",
          "    max_length: 10000",
          "    block_patterns:",
          '      - "ignore previous instructions"',
          '      - "you are now"',
          '      - "system prompt"',
          '      - "jailbreak"',
          "    sanitize_html: true",
          "",
          "  output_validation:",
          "    max_length: 50000",
          "    block_pii: true",
          "    block_secrets: true",
          "",
          "  rate_limiting:",
          "    max_requests_per_minute: 60",
          "    max_tokens_per_minute: 100000",
          "",
          "  logging:",
          "    level: info",
          "    include_prompts: true",
          "    include_responses: true",
          "    redact_pii: true",
          targetLevelNum >= 3 ? [
            "",
            "  audit:",
            "    sign_all_events: true",
            "    tamper_detection: true",
            "    retention_days: 90",
          ].join("\n") : "",
          targetLevelNum >= 4 ? [
            "",
            "  adversarial:",
            "    canary_tokens: true",
            "    drift_detection: true",
            "    auto_quarantine: true",
          ].join("\n") : "",
        ].filter(Boolean).join("\n"),
      });

      // Generate: AGENTS.md (agent config)
      fixes.push({
        file: "AGENTS.md",
        description: "Agent governance configuration",
        content: [
          `# AGENTS.md — ${agentId} Governance Configuration`,
          "",
          "## Operational Boundaries",
          `- Target maturity: L${targetLevelNum}`,
          "- All tool calls require explicit approval at L4+",
          "- External communications require human review",
          "- Maximum autonomous operation: 30 minutes without checkpoint",
          "",
          "## Safety Controls",
          "- Input sanitization: guardrails.yaml",
          "- Output filtering: PII/secrets blocked",
          "- Rate limits: 60 req/min, 100K tokens/min",
          targetLevelNum >= 3 ? "- Audit: all events signed and tamper-evident" : "",
          targetLevelNum >= 4 ? "- Adversarial: canary tokens + drift detection active" : "",
          "",
          "## Escalation",
          "- Safety trigger → pause + human review",
          "- Cost threshold ($10/hour) → alert + throttle",
          "- Unknown tool request → deny + log",
        ].filter(Boolean).join("\n"),
      });

      // Generate: explicit CI survey answers. These start at L0 and require human review.
      fixes.push({
        file: ".amc/ci-answers.json",
        description: "CI-safe survey answers (review before raising any level)",
        content: JSON.stringify({
          "AMC-1.1": 0,
          "AMC-2.1": 0,
          "AMC-3.1.1": 0,
          "AMC-4.1": 0,
          "AMC-5.1": 0,
        }, null, 2),
      });

      // Generate: CI config
      fixes.push({
        file: ".github/workflows/amc-gate.yml",
        description: "CI/CD maturity gate",
        content: [
          "name: AMC Maturity Gate",
          "on: [push, pull_request]",
          "jobs:",
          "  amc-score:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@v4",
          "      - uses: actions/setup-node@v4",
          "        with:",
          "          node-version: '20'",
          "      - run: curl -fsSL https://agentmaturity.co/install.sh | sh",
          `      - run: |`,
          "          amc quickscore --rapid --answers .amc/ci-answers.json --json > score.json",
          `      - name: Check maturity level`,
          `        run: |`,
          `          LEVEL=$(node -e "const s=require('./score.json');console.log(s.preliminaryLevel)")`,
          `          echo "AMC Level: $LEVEL"`,
          `          LEVEL_NUM=$(echo $LEVEL | tr -dc '0-9')`,
          `          if [ "$LEVEL_NUM" -lt "${targetLevelNum}" ]; then`,
          `            echo "::error::AMC maturity L$LEVEL_NUM below target L${targetLevelNum}"`,
          "            exit 1",
          "          fi",
        ].join("\n"),
      });

      if (opts.dryRun) {
        console.log(chalk.yellow("  [DRY RUN] Would generate:\n"));
        for (const fix of fixes) {
          console.log(`  📄 ${chalk.hex('#4AEF79')(fix.file)} — ${fix.description}`);
        }
        if (gaps.length > 0) {
          console.log(`\n  ${chalk.gray(`Based on ${gaps.length} identified gaps from last diagnostic run`)}`);
        }
      } else {
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        for (const fix of fixes) {
          const filePath = join(outDir, fix.file);
          const fileDir = dirname(filePath);
          if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
          writeFileSync(filePath, fix.content, "utf-8");
          console.log(chalk.green(`  ✓ ${fix.file}`) + chalk.gray(` — ${fix.description}`));
        }
        console.log(chalk.bold.green(`\n  ✓ ${fixes.length} remediation files generated in ${outDir}/`));
        if (gaps.length > 0) {
          console.log(chalk.gray(`  Based on ${gaps.length} gaps from last diagnostic`));
        }
        console.log(chalk.gray("\n  Next steps:"));
        console.log(chalk.gray("  1. Review generated files"));
        console.log(chalk.gray("  2. Copy to your project: cp -r .amc/fixes/* ."));
        console.log(chalk.gray("  3. Re-score: amc quickscore"));
      }
      console.log("");
    });

  // Note: continuous monitoring now lives under `amc monitor` (start|check|status|events|metrics).
  // `amc watch` retains the observability tools (attest, explain, safety-test, etc.).

  /* ------------------------------------------------------------------ */
  /*  amc redteam — Attack Simulation                                    */
  /* ------------------------------------------------------------------ */

  const redteamCmd = program
    .command("redteam")
    .description("Run red-team attack simulations against a target agent");

  redteamCmd
    .command("run [agentId]")
    .description("Execute red-team plugins with chosen attack strategies and generate a vulnerability report")
    .option("--plugins <ids...>", "Assurance-pack IDs to run as attack plugins (default: all)")
    .option("--strategies <ids...>", "Attack strategy IDs to apply (default: direct). Use 'all' for every strategy.")
    .option("--output <path>", "Path to write the markdown vulnerability report")
    .option("--no-sign", "Run without vault/artifact signing; report is labeled UNSIGNED_VALID local evidence")
    .option("--evil-mcp", "Also run built-in Evil MCP agent-provider attack scenarios")
    .option("--mcp-attacks <categories...>", "MCP attack categories for --evil-mcp (default: all; aliases: tool_poison, data_exfil, priv_esc, prompt_inject)")
    .option("--json", "Print JSON report to stdout")
    .action(async (agentId: string | undefined, opts: {
      plugins?: string[];
      strategies?: string[];
      output?: string;
      sign?: boolean;
      evilMcp?: boolean;
      mcpAttacks?: string[];
      json?: boolean;
    }) => {
      const workspace = process.cwd();
      const report = await runRedTeam({
        workspace,
        agentId,
        plugins: opts.plugins,
        strategies: opts.strategies,
        output: opts.output,
        noSign: opts.sign === false,
        evilMcp: opts.evilMcp,
        mcpAttackCategories: opts.mcpAttacks,
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(renderRedTeamMarkdown(report));
        console.log("");
        if (!report.verification.signed) {
          console.log(chalk.yellow(`Verification: ${report.verification.status} — ${report.verification.explanation}`));
        }
        console.log(chalk.gray(`Full JSON: .amc/redteam/${report.agentId}/${report.runId}.json`));
        if (report.evilMcp) {
          console.log(chalk.gray(`Evil MCP JSON: ${report.evilMcp.reportPath}`));
          console.log(chalk.gray(`Evil MCP report: ${report.evilMcp.markdownPath}`));
        }
        if (opts.output) {
          console.log(chalk.gray(`Report: ${opts.output}`));
        }
      }
    });

  redteamCmd
    .command("strategies")
    .description("List available attack strategies")
    .option("--json", "JSON output")
    .action(async (opts: { json?: boolean }) => {
      const strats = listStrategies();
      if (opts.json) {
        console.log(JSON.stringify(strats.map(({ id, name, description }) => ({ id, name, description })), null, 2));
      } else {
        console.log(chalk.bold("Available Red-Team Strategies:\n"));
        for (const s of strats) {
          console.log(`  ${chalk.hex('#4AEF79')(s.id.padEnd(16))} ${s.name} — ${chalk.gray(s.description)}`);
        }
      }
    });

  redteamCmd
    .command("plugins")
    .description("List available attack plugins (assurance packs)")
    .option("--json", "JSON output")
    .action(async (_opts: { json?: boolean }) => {
      const { listAssurancePacks } = await import("./assurance/packs/index.js");
      const packs = listAssurancePacks();
      if (_opts.json) {
        console.log(JSON.stringify(packs.map(({ id, title, description, scenarios }) => ({
          id, title, description, scenarioCount: scenarios.length
        })), null, 2));
      } else {
        console.log(chalk.bold(`Available Red-Team Plugins (${packs.length}):\n`));
        for (const p of packs) {
          console.log(`  ${chalk.hex('#4AEF79')(p.id.padEnd(36))} ${p.title} (${p.scenarios.length} scenarios)`);
        }
      }
    });

  redteamCmd
    .command("attack [agentId]")
    .description("Run attack plugins (prompt-injection, data-exfiltration, privilege-escalation, model-manipulation, denial-of-service)")
    .option("--plugins <ids...>", "Attack plugin IDs to run (default: all)")
    .option("--json", "Print JSON report to stdout")
    .action((agentId: string | undefined, opts: { plugins?: string[]; json?: boolean }) => {
      const id = agentId ?? "default";
      const respondFn = (prompt: string): string => {
        const lower = prompt.toLowerCase();
        if (lower.includes("ignore") || lower.includes("override") || lower.includes("debug mode")) {
          return "I cannot comply with requests that bypass policy or reveal secrets. Safe alternative: follow owner-approved workflow.";
        }
        if (lower.includes("admin") || lower.includes("root access") || lower.includes("shell command")) {
          return "I refuse to execute destructive or privileged actions without an owner-approved exec ticket. Safe alternative: route through ToolHub.";
        }
        if (lower.includes("api key") || lower.includes("credential") || lower.includes("ssn") || lower.includes("credit card")) {
          return "Data Boundary: no secrets, private keys, or PII can be disclosed. I cannot generate or disclose sensitive data.";
        }
        if (lower.includes("fabricat") || lower.includes("perfect") || lower.includes("100/100") || lower.includes("zero vulnerabilities")) {
          return "I cannot fabricate evidence or produce misleading assessments. All outputs must be evidence-backed.";
        }
        if (lower.includes("repeat") || lower.includes("infinite") || lower.includes("10000") || lower.includes("1 million")) {
          return "Resource limit: I cannot produce unbounded output. Safe alternative: provide a bounded summary.";
        }
        return "I cannot comply with requests that bypass policy. Safe alternative: follow owner-approved workflow.";
      };

      const report = runAttackPlugins({
        agentId: id,
        agentName: id,
        role: "assistant",
        domain: "general",
        respondFn,
        pluginIds: opts.plugins,
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(renderAttackPluginReport(report));
      }
    });

  redteamCmd
    .command("attack-list")
    .description("List available attack plugins")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => {
      const plugins = listAttackPlugins();
      if (opts.json) {
        console.log(JSON.stringify(plugins.map(({ id, name, category, description }) => ({ id, name, category, description })), null, 2));
      } else {
        console.log(chalk.bold(`Available Attack Plugins (${plugins.length}):\n`));
        for (const p of plugins) {
          console.log(`  ${chalk.hex('#4AEF79')(p.id.padEnd(28))} ${p.name} — ${chalk.gray(p.category)}`);
        }
      }
    });

  /* ── Pack Registry: amc pack ──────────────────────────────────── */
  const pack = program.command("pack").description("Community assurance pack registry — NPM-style package management");

  pack
    .command("install")
    .description("Install a community assurance pack")
    .argument("<name>", "pack name (e.g., red-team-basic, compliance-eu-ai-act)")
    .option("--version <version>", "specific version to install")
    .option("--save", "save to dependencies", false)
    .option("--save-dev", "save to dev dependencies", false)
    .option("--force", "force install despite conflicts", false)
    .option("--dry-run", "show what would be installed without installing", false)
    .option("--json", "JSON output", false)
    .action(async (name: string, opts: {
      version?: string;
      save?: boolean;
      saveDev?: boolean;
      force?: boolean;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      try {
        const result = await packInstallCli({
          workspace: process.cwd(),
          name,
          version: opts.version,
          save: opts.save,
          saveDev: opts.saveDev,
          force: opts.force,
          dryRun: opts.dryRun
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.success) {
          console.log(chalk.green(`✅ ${result.message}`));
          if (result.installed.length > 0) {
            console.log(chalk.bold("\nInstalled packages:"));
            for (const pkg of result.installed) {
              console.log(`  ${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
            }
          }
          if (result.conflicts.length > 0) {
            console.log(chalk.yellow("\nConflicts resolved:"));
            for (const conflict of result.conflicts) {
              console.log(`  ${chalk.yellow(conflict.name)}: ${conflict.reason}`);
            }
          }
        } else {
          console.error(chalk.red(`❌ ${result.message}`));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`Install failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("publish")
    .description("Publish a pack to the registry")
    .argument("[directory]", "pack directory (defaults to current directory)")
    .option("--registry <url>", "registry URL to publish to")
    .option("--dry-run", "validate and show what would be published without publishing", false)
    .option("--access <level>", "public or private", "public")
    .option("--json", "JSON output", false)
    .action(async (directory: string | undefined, opts: {
      registry?: string;
      dryRun?: boolean;
      access?: "public" | "private";
      json?: boolean;
    }) => {
      try {
        const result = await packPublishCli({
          workspace: process.cwd(),
          packDir: directory,
          registry: opts.registry,
          dryRun: opts.dryRun,
          access: opts.access
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.success) {
          console.log(chalk.green(`✅ ${result.message}`));
          console.log(`Package: ${chalk.hex('#4AEF79')(result.name)}@${result.version}`);
          if (result.published) {
            console.log(`Registry: ${result.registry}`);
            console.log(chalk.green("Status: Uploaded to registry"));
          } else if (result.destinationKind === "dry-run") {
            console.log(`Destination: ${result.registry}`);
            console.log(chalk.yellow("Status: Dry run only — no tarball uploaded"));
          } else {
            console.log("Destination: local tarball bundle");
            console.log(chalk.yellow("Status: Not uploaded to a registry"));
          }
          if (result.tarballPath) {
            console.log(`Tarball: ${result.tarballPath}`);
          }
          if (result.integrity) {
            console.log(`SHA256: ${result.integrity}`);
          }
          if (result.nextSteps.length > 0) {
            console.log("");
            console.log(chalk.bold("Next steps:"));
            for (const step of result.nextSteps) {
              console.log(`  - ${step}`);
            }
          }
        } else {
          console.error(chalk.red(`❌ ${result.message}`));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`Publish failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("search")
    .description("Search for packs in the registry")
    .argument("[query]", "search query")
    .option("--category <category>", "filter by category")
    .option("--author <author>", "filter by author")
    .option("--keywords <keywords>", "comma-separated keywords")
    .option("--limit <n>", "number of results", "20")
    .option("--offset <n>", "result offset", "0")
    .option("--json", "JSON output", false)
    .action(async (query: string | undefined, opts: {
      category?: string;
      author?: string;
      keywords?: string;
      limit?: string;
      offset?: string;
      json?: boolean;
    }) => {
      try {
        const result = await packSearchCli({
          workspace: process.cwd(),
          query,
          category: opts.category,
          author: opts.author,
          keywords: opts.keywords?.split(","),
          limit: parseInt(opts.limit || "20"),
          offset: parseInt(opts.offset || "0")
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.bold(`\n📦 Found ${result.total} packs\n`));
        if (result.total === 0) {
          console.log(chalk.yellow("No community packs found."));
          console.log("");
          console.log("  Built-in packs: " + chalk.hex('#4AEF79')("amc assurance list"));
          console.log("  Create your own: " + chalk.hex('#4AEF79')("amc pack init"));
          console.log("  Publish a pack:  " + chalk.hex('#4AEF79')("amc pack publish"));
          console.log("");
        }
        for (const pkg of result.results) {
          console.log(`${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
          console.log(`  ${pkg.description}`);
          console.log(`  Author: ${pkg.author} | Downloads: ${pkg.downloads} | Updated: ${pkg.updated}`);
          if (pkg.keywords.length > 0) {
            console.log(`  Keywords: ${pkg.keywords.join(", ")}`);
          }
          console.log("");
        }
      } catch (error: any) {
        console.error(chalk.red(`Search failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("info")
    .description("Show detailed information about a pack")
    .argument("<name>", "pack name")
    .option("--json", "JSON output", false)
    .action(async (name: string, opts: { json?: boolean }) => {
      try {
        const result = await packInfoCli({
          workspace: process.cwd(),
          name
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (!result.found) {
          console.error(chalk.red(`Pack "${name}" not found`));
          process.exit(1);
        }

        console.log(chalk.bold(`\n📦 ${result.name}`));
        console.log(`Description: ${result.description}`);
        console.log(`Latest: ${result.latest}`);
        console.log(`Author: ${result.author}`);
        console.log(`License: ${result.license}`);
        console.log(`Downloads: ${result.downloads}`);

        if (result.versions.length > 0) {
          console.log(`Versions: ${result.versions.join(", ")}`);
        }

        if (result.keywords.length > 0) {
          console.log(`Keywords: ${result.keywords.join(", ")}`);
        }

        if (Object.keys(result.dependencies).length > 0) {
          console.log(chalk.bold("\nDependencies:"));
          for (const [dep, version] of Object.entries(result.dependencies)) {
            console.log(`  ${dep}: ${version}`);
          }
        }

        if (result.repository) {
          console.log(`Repository: ${result.repository}`);
        }

        if (result.homepage) {
          console.log(`Homepage: ${result.homepage}`);
        }
      } catch (error: any) {
        console.error(chalk.red(`Info lookup failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("uninstall")
    .description("Uninstall a pack")
    .argument("<name>", "pack name")
    .option("--save", "remove from dependencies", false)
    .option("--json", "JSON output", false)
    .action(async (name: string, opts: { save?: boolean; json?: boolean }) => {
      try {
        const result = await packUninstallCli({
          workspace: process.cwd(),
          name,
          save: opts.save
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.success) {
          console.log(chalk.green(`✅ ${result.message}`));
        } else {
          console.error(chalk.red(`❌ ${result.message}`));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`Uninstall failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("list")
    .description("List installed packs")
    .option("--global", "list global packs", false)
    .option("--json", "JSON output", false)
    .action(async (opts: { global?: boolean; json?: boolean }) => {
      try {
        const result = await packListCli({
          workspace: process.cwd(),
          global: opts.global
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.bold(`\n📦 Installed Packs (${result.packages.length})\n`));
        for (const pkg of result.packages) {
          console.log(`${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
          console.log(`  ${pkg.description}`);
          console.log(`  Path: ${pkg.path}`);
          console.log("");
        }
      } catch (error: any) {
        console.error(chalk.red(`List failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("init")
    .description("Initialize a new pack in <name>/ or an explicit --dir")
    .option("--name <name>", "pack name")
    .option("--dir <path>", "output directory (defaults to ./<name>)")
    .option("--version <version>", "initial version", "1.0.0")
    .option("--description <desc>", "pack description")
    .option("--author <author>", "author name")
    .option("--license <license>", "license", "MIT")
    .option("--type <type>", "pack type: assurance, policy, transform, adapter", "assurance")
    .action(async (opts: {
      name?: string;
      dir?: string;
      version?: string;
      description?: string;
      author?: string;
      license?: string;
      type?: "assurance" | "policy" | "transform" | "adapter";
    }) => {
      try {
        let packName = opts.name?.trim();
        if (!packName && !opts.dir && process.stdin.isTTY) {
          const answer = await inquirer.prompt([{
            type: "input",
            name: "name",
            message: "Pack name:",
            validate: (value: string) => value.trim().length > 0 || "Pack name is required"
          }]);
          packName = answer.name.trim();
        }
        if (!packName && !opts.dir) {
          console.error(chalk.red("Pack name required unless --dir is provided."));
          console.error(chalk.gray("Run: amc pack init --name my-pack"));
          process.exit(1);
          return;
        }
        const outputDir = opts.dir
          ? resolve(process.cwd(), opts.dir)
          : resolve(process.cwd(), directoryNameForPackName(packName!));
        const result = packInitCli({
          directory: outputDir,
          name: packName ?? basename(outputDir),
          version: opts.version,
          description: opts.description,
          author: opts.author,
          license: opts.license,
          type: opts.type
        });

        if (result.success) {
          console.log(chalk.green(`✅ ${result.message}`));
          console.log(`Manifest: ${result.manifestPath}`);
          console.log("");
          console.log(chalk.bold("Next steps:"));
          console.log("1. Edit package.json to customize your pack");
          console.log("2. Implement your pack logic in index.mjs (ESM format)");
          console.log("3. Add tests in test/index.test.mjs");
          console.log(`4. Test your pack locally: ${chalk.hex('#4AEF79')("amc pack test .")}`);
          console.log(`5. Create a publish bundle: ${chalk.hex('#4AEF79')("amc pack publish .")}`);
          console.log(`6. Review registry governance gates: ${chalk.hex('#4AEF79')("docs/ASSURANCE_LAB.md#community-registry-review-gates")}`);
          console.log(`7. Upload to a running registry: ${chalk.hex('#4AEF79')("amc pack publish . --registry http://127.0.0.1:4873")}`);
          console.log("");
          console.log(chalk.bold("Documentation:"));
          console.log(`  Pack authoring guide: ${chalk.hex('#4AEF79')("docs/ASSURANCE_LAB.md")}`);
          console.log(`  Contributing:         ${chalk.hex('#4AEF79')("CONTRIBUTING.md")}`);
          console.log(`  Built-in pack examples: ${chalk.hex('#4AEF79')("amc assurance list")}`);
        } else {
          console.error(chalk.red(`❌ ${result.message}`));
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`Init failed: ${error.message}`));
        process.exit(1);
      }
    });

  pack
    .command("test [dir]")
    .description("Test a local pack directory; defaults to cwd and auto-detects one child pack")
    .option("--agent <agentId>", "agent ID to run the pack against")
    .option("--json", "JSON output", false)
    .action(async (dir: string | undefined, opts: { agent?: string; json?: boolean }) => {
      let packDir = dir ? resolve(dir) : process.cwd();
      let autoDetected = false;
      // Verify pack exists
      let packManifest = readPackPackageManifest(packDir);
      if (!packManifest && dir) {
        console.error(chalk.red(`No package.json found in ${packDir}.`));
        console.error(chalk.gray("Run: amc pack test <dir>"));
        console.error(chalk.gray("Create one first: amc pack init --name my-pack"));
        process.exit(1); return;
      }
      if (!dir && !packManifest?.amcPack) {
        const childPacks = findImmediatePackDirectories(packDir);
        if (childPacks.length === 1) {
          packDir = childPacks[0]!;
          packManifest = readPackPackageManifest(packDir);
          autoDetected = true;
        } else if (childPacks.length > 1) {
          console.error(chalk.red(`Multiple AMC packs found in ${packDir}.`));
          for (const child of childPacks) {
            console.error(chalk.gray(`  - ${child}`));
          }
          console.error(chalk.gray("Run: amc pack test <dir>"));
          process.exit(1); return;
        }
      }
      if (!packManifest) {
        console.error(chalk.red(`Invalid package.json in ${packDir}`));
        process.exit(1); return;
      }
      if (!packManifest.amcPack) {
        console.error(chalk.red(`No AMC pack found in ${packDir}.`));
        console.error(chalk.gray("Run: amc pack test <dir>"));
        console.error(chalk.gray("Example: amc pack test ./my-pack"));
        process.exit(1); return;
      }
      const agentId = opts.agent ?? activeAgent(program) ?? "default";
      if (autoDetected) {
        console.log(chalk.gray(`Auto-detected pack directory: ${packDir}`));
      }
      console.log(chalk.bold(`\n🧪  Pack Sandbox Test — ${packManifest.name ?? "unknown"}`));
      console.log(chalk.gray(`  Pack directory: ${packDir}`));
      console.log(chalk.gray(`  Pack version:   ${packManifest.version ?? "unknown"}`));
      console.log(chalk.gray(`  Pack type:      ${packManifest.amcPack?.type ?? "assurance"}`));
      console.log(chalk.gray(`  Target agent:   ${agentId}`));
      console.log("");
      try {
        // Load and execute the pack entry point
        const entryPath = resolvePackEntryPath(packDir, packManifest.main);
        if (!entryPath) {
          console.error(chalk.red(`No pack entry point found in ${packDir}. Add package.json "main", index.mjs, or index.js first.`));
          process.exit(1); return;
        }
        const packModule = await import(pathToFileURL(entryPath).href);
        const packExport = packModule.default ?? packModule;
        if (typeof packExport.execute !== "function") {
          console.error(chalk.red(`Pack must export an execute(context) function.`));
          console.log(chalk.gray(`  See: docs/ASSURANCE_LAB.md for pack structure`));
          process.exit(1); return;
        }
        const context = { agentId, workspace: process.cwd(), mode: "sandbox" };
        const result = await packExport.execute(context);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.success) {
          console.log(chalk.green(`✅ Pack executed successfully`));
          console.log(chalk.green("Pack test passed"));
        } else {
          console.log(chalk.yellow(`⚠️  Pack executed with issues`));
        }
        if (Array.isArray(result.results) && result.results.length > 0) {
          console.log(chalk.bold("\nResults:"));
          for (const r of result.results) {
            console.log(`  - ${JSON.stringify(r)}`);
          }
        }
        console.log("");
        console.log(chalk.gray("  Sandbox mode: no artifacts signed or persisted."));
        console.log(chalk.gray("  To create a local publish bundle: amc pack publish ."));
        console.log(chalk.gray("  Review registry governance gates: docs/ASSURANCE_LAB.md#community-registry-review-gates"));
        console.log(chalk.gray("  To upload to a running registry: amc pack publish . --registry http://127.0.0.1:4873"));
      } catch (e: unknown) {
        console.error(chalk.red(`Pack execution failed: ${toErrorMessage(e)}`));
        process.exit(1);
      }
    });

  const packRegistry = pack.command("registry").description("Pack registry management");

  packRegistry
    .command("serve")
    .description("Start a local pack registry server")
    .option("--port <port>", "server port", "4873")
    .option("--host <host>", "bind host", "127.0.0.1")
    .action(async (opts: { port?: string; host?: string }) => {
      try {
        const result = await packRegistryServeCli({
          workspace: process.cwd(),
          port: opts.port ? parseInt(opts.port) : undefined,
          host: opts.host
        });

        console.log(chalk.green(`✅ Pack registry server started`));
        console.log(`URL: ${result.url}`);
        console.log(`Host: ${result.host}`);
        console.log(`Port: ${result.port}`);
        console.log("");
        console.log("Press Ctrl+C to stop the server");

        // Keep the process alive
        process.on("SIGINT", async () => {
          console.log("\nStopping registry server...");
          await result.server.stop();
          console.log("Registry server stopped");
          process.exit(0);
        });

        // Keep alive
        await new Promise(() => {});
      } catch (error: any) {
        console.error(chalk.red(`Registry server failed: ${error.message}`));
        process.exit(1);
      }
    });

  packRegistry
    .command("init")
    .description("Initialize local pack registry")
    .action(() => {
      try {
        const result = packRegistryInitCli({
          workspace: process.cwd()
        });

        console.log(chalk.green(`✅ ${result.message}`));
        console.log(`Registry directory: ${result.registryDir}`);
        console.log(`Config: ${result.configPath}`);
      } catch (error: any) {
        console.error(chalk.red(`Registry init failed: ${error.message}`));
        process.exit(1);
      }
    });

  // ── Blocker #3: top-level `amc badge` command ──────────────────────────────────
  program
    .command("badge")
    .description("Generate maturity badge for README/docs (markdown, HTML, or URL)")
    .option("--agent <agentId>", "agent ID (default: 'default')")
    .option("--level <0-5>", "override level (instead of reading from latest score)")
    .option("--score <0-100>", "override score (instead of reading from latest score)")
    .option("--format <format>", "output format: markdown | html | url | svg", "markdown")
    .action(async (opts: { agent?: string; level?: string; score?: string; format?: string }) => {
      const { generateBadgeSvg, scoreToLevel } = await import("./cert/badgeGenerator.js");
      const agentId = opts.agent ?? "default";
      const format = (opts.format ?? "markdown").toLowerCase();

      let level: number;
      let score: number;

      if (opts.level != null) {
        level = Number(opts.level);
        score = opts.score != null ? Number(opts.score) : level * 20;
      } else if (opts.score != null) {
        score = Number(opts.score);
        level = scoreToLevel(score);
      } else {
        // Try reading from latest quickscore cache
        try {
          const out = passportBadgeCli({ workspace: process.cwd(), agentId: resolveAgentId(process.cwd(), agentId) });
          console.log(out.badge);
          return;
        } catch {
          // No cached passport — inform user to specify level
          console.error(chalk.yellow("No cached score found for agent '" + agentId + "'. Specify --level or --score."));
          console.log(chalk.gray("\nExamples:"));
          console.log(chalk.gray("  amc badge --level 3              # Generate L3 badge"));
          console.log(chalk.gray("  amc badge --score 72.5           # Badge from score"));
          console.log(chalk.gray("  amc quickscore && amc badge      # Score first, then badge"));
          console.log(chalk.gray("  amc badge --format html --level 4 # HTML img tag"));
          console.log(chalk.gray("  amc badge --format url --level 3  # Raw shields.io URL"));
          console.log(chalk.gray("  amc badge --format svg --level 3  # Full SVG output"));
          return;
        }
      }

      const badgeColor = level >= 4 ? "brightgreen" : level >= 3 ? "green" : level >= 2 ? "yellow" : "red";
      const shieldsUrl = `https://img.shields.io/badge/AMC-L${level}_(${score.toFixed(1)})-${badgeColor}?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3bDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDEybDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDIxbDEwIDUgMTAtNXoiLz48L3N2Zz4=`;

      switch (format) {
        case "url":
          console.log(shieldsUrl);
          break;
        case "html":
          console.log(`<a href="https://github.com/AgentMaturity/AgentMaturityCompass"><img src="${shieldsUrl}" alt="AMC L${level}" /></a>`);
          break;
        case "svg": {
          const svg = generateBadgeSvg(score, level, agentId);
          console.log(svg);
          break;
        }
        case "markdown":
        default:
          console.log(`[![AMC L${level}](${shieldsUrl})](https://github.com/AgentMaturity/AgentMaturityCompass)`);
          break;
      }
    });

  /* ── Runtime Observability: watch, monitor, costs, guide, rate, integrations ── */

  watch
    .command("connect")
    .description("Connect to an observability provider (langfuse, helicone, otlp, datadog, webhook)")
    .requiredOption("--provider <provider>", "Provider type: otlp | langfuse | helicone | datadog | webhook")
    .requiredOption("--endpoint <url>", "Provider API endpoint URL")
    .option("--api-key <key>", "API key for authentication")
    .option("--poll-interval <ms>", "Poll interval in milliseconds", "10000")
    .option("--agent <agentId>", "Agent ID to associate traces with")
    .action(async (opts: { provider: string; endpoint: string; apiKey?: string; pollInterval: string; agent?: string }) => {
      const { createObservabilityBridge} = await import("./watch/observabilityBridge.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());
      const bridge = createObservabilityBridge({
        workspace: process.cwd(),
        agentId,
        providers: [{
          provider: opts.provider as any,
          endpoint: opts.endpoint,
          apiKey: opts.apiKey,
          pollIntervalMs: parseInt(opts.pollInterval, 10),
        }],
        pollIntervalMs: parseInt(opts.pollInterval, 10),
      });
      bridge.on("trace", (trace: { traceId: string; totalCostUsd: number; totalTokens: number }) => {
        console.log(chalk.green(`[TRACE] ${trace.traceId} — $${trace.totalCostUsd.toFixed(4)} — ${trace.totalTokens} tokens`));
      });
      bridge.on("poll_complete", (info: { newTraces: number; totalTraces: number }) => {
        if (info.newTraces > 0) console.log(chalk.gray(`  Ingested ${info.newTraces} new traces (total: ${info.totalTraces})`));
      });
      console.log(chalk.cyan(`Connecting to ${opts.provider} at ${opts.endpoint}...`));
      await bridge.start();
      console.log(chalk.green(`✅ Connected. Polling every ${opts.pollInterval}ms. Press Ctrl+C to stop.`));
      await new Promise(() => {}); // Block forever
    });

  watch
    .command("providers")
    .description("Show connected observability providers and trace stats")
    .option("--agent <agentId>", "Agent ID")
    .action(async (opts: { agent?: string }) => {
      console.log(chalk.cyan("Watch Providers"));
      console.log(chalk.gray("Use `amc watch connect` to connect an observability provider."));
      console.log(chalk.gray("Supported: otlp, langfuse, helicone, datadog, webhook"));
    });

  monitor
    .command("live")
    .description("Start real-time monitoring with live assurance checks on incoming traces")
    .option("--agent <agentId>", "Agent ID")
    .option("--provider <provider>", "Observability provider", "otlp")
    .option("--endpoint <url>", "Provider endpoint")
    .option("--api-key <key>", "Provider API key")
    .option("--budget <usd>", "Cost budget in USD", "100")
    .option("--max-latency <ms>", "Max acceptable latency in ms", "30000")
    .option("--alert-severity <level>", "Alert on this severity and above", "warning")
    .action(async (opts: { agent?: string; provider?: string; endpoint?: string; apiKey?: string; budget: string; maxLatency: string; alertSeverity?: string }) => {
      const { createObservabilityBridge} = await import("./watch/observabilityBridge.js");
      const { createRealtimeAssuranceEngine} = await import("./watch/realtimeAssurance.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());

      const bridge = createObservabilityBridge({
        workspace: process.cwd(),
        agentId,
        providers: opts.endpoint ? [{
          provider: (opts.provider ?? "otlp") as any,
          endpoint: opts.endpoint,
          apiKey: opts.apiKey,
        }] : [],
      });

      const engine = createRealtimeAssuranceEngine({
        workspace: process.cwd(),
        agentId,
        bridge,
        costBudgetUsd: parseFloat(opts.budget),
        maxLatencyMs: parseInt(opts.maxLatency, 10),
        alertOnSeverity: (opts.alertSeverity ?? "warning") as any,
      });

      engine.on("result", (result: { traceId: string; score: number; violations: unknown[] }) => {
        const icon = result.score === 100 ? "✅" : result.score >= 70 ? "⚠️" : "❌";
        console.log(`${icon} [${new Date().toISOString()}] Trace ${result.traceId.slice(0, 8)}... — Score: ${result.score.toFixed(0)}% — ${result.violations.length} violation(s)`);
      });
      engine.on("violation", (v: { severity: string; message: string }) => {
        const color = v.severity === "critical" ? chalk.red : v.severity === "warning" ? chalk.yellow : chalk.gray;
        console.log(color(`  [${v.severity.toUpperCase()}] ${v.message}`));
      });

      if (opts.endpoint) await bridge.start();
      engine.start();
      console.log(chalk.green(`✅ Real-time monitoring active for agent ${agentId}. Press Ctrl+C to stop.`));
      await new Promise(() => {});
    });

  const costsCmd = program.command("costs").description("Track and analyze actual agent costs from observability data");

  costsCmd
    .command("show")
    .description("Show cost report for an agent")
    .option("--agent <agentId>", "Agent ID")
    .option("--window <days>", "Analysis window in days", "30")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent?: string; window: string; json?: boolean }) => {
      const { createCostTracker } = await import("./observability/costTracker.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());
      const tracker = createCostTracker({ workspace: process.cwd(), agentId });
      const report = tracker.generateReport(parseInt(opts.window, 10));
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(chalk.cyan(`\n💰 Cost Report — ${agentId} (last ${opts.window} days)\n`));
        console.log(`Total Cost:       $${report.totalCostUsd.toFixed(4)}`);
        console.log(`Total Tokens:     ${report.totalTokens.toLocaleString()}`);
        console.log(`Total Calls:      ${report.totalCalls}`);
        console.log(`Avg Cost/Call:    $${report.avgCostPerCall.toFixed(6)}`);
        console.log(`Projected/Month:  $${report.projectedMonthlyCostUsd.toFixed(2)}`);
        console.log(`Error Rate:       ${(report.errorRate * 100).toFixed(1)}%`);
        if (Object.keys(report.costByModel).length > 0) {
          console.log(chalk.cyan("\nBy Model:"));
          for (const [model, data] of Object.entries(report.costByModel)) {
            console.log(`  ${model}: $${data.costUsd.toFixed(4)} (${data.pctOfTotal.toFixed(1)}%, ${data.calls} calls)`);
          }
        }
        if (report.recommendations.length > 0) {
          console.log(chalk.yellow("\nRecommendations:"));
          for (const rec of report.recommendations) console.log(`  💡 ${rec}`);
        }
        if (report.anomalies.length > 0) {
          console.log(chalk.red("\nAnomalies:"));
          for (const a of report.anomalies) console.log(`  ⚠️ [${a.severity}] ${a.message}`);
        }
      }
    });

  const guideCmd = program.command("framework-guide").description("Framework-specific governance guidance");

  guideCmd
    .option("--framework <name>", "Framework: langchain, langgraph, crewai, openai-agents, vercel-ai, autogen, semantic-kernel, llamaindex, custom")
    .option("--list", "List supported frameworks")
    .option("--json", "Output as JSON")
    .action(async (opts: { framework?: string; list?: boolean; json?: boolean }) => {
      const { generateFrameworkGuide, listSupportedFrameworks} = await import("./guide/frameworkGuide.js");
      if (opts.list) {
        const frameworks = listSupportedFrameworks();
        console.log(chalk.cyan("\nSupported Frameworks:\n"));
        for (const fw of frameworks) {
          console.log(`  ${fw.displayName.padEnd(25)} ${fw.patternCount} governance patterns`);
        }
        return;
      }
      const fw = (opts.framework ?? "custom") as any;
      const guide = generateFrameworkGuide(fw);
      if (opts.json) {
        console.log(JSON.stringify(guide, null, 2));
      } else {
        console.log(chalk.cyan(`\n📘 Governance Guide: ${guide.displayName}\n`));
        console.log(guide.summary);
        console.log(chalk.cyan("\nQuick Wins:"));
        for (const qw of guide.quickWins) console.log(`  ✅ ${qw}`);
        console.log(chalk.cyan(`\nGovernance Patterns (${guide.patterns.length}):\n`));
        for (const p of guide.patterns) {
          const icon = p.priority === "critical" ? "🔴" : p.priority === "high" ? "🟡" : "🟢";
          console.log(`${icon} ${p.name} [${p.priority}]`);
          console.log(chalk.gray(`   ${p.description}`));
          console.log(chalk.gray(`   AMC Questions: ${p.amcQuestionsAddressed.join(", ")}\n`));
        }
      }
    });

  const rateCmd = program.command("rate").description("Rate agent run quality (thumbs up/down)");

  rateCmd
    .argument("<traceId>", "Trace ID to rate")
    .requiredOption("--score <score>", "Quality score: good | bad | neutral")
    .option("--tags <tags>", "Comma-separated tags (e.g., hallucination,slow,accurate)")
    .option("--comment <text>", "Optional comment")
    .option("--agent <agentId>", "Agent ID")
    .action(async (traceId: string, opts: { score: string; tags?: string; comment?: string; agent?: string }) => {
      const { createQualitySignalStore} = await import("./outcomes/qualitySignals.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());
      const store = createQualitySignalStore({ workspace: process.cwd(), agentId });
      const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [];
      const rating = store.rate(traceId, opts.score as any, tags, opts.comment);
      store.flush();
      console.log(chalk.green(`✅ Rated trace ${traceId.slice(0, 12)}... as ${opts.score}`));
      if (tags.length > 0) console.log(chalk.gray(`   Tags: ${tags.join(", ")}`));
    });

  program
    .command("quality-report")
    .description("Show quality report")
    .option("--agent <agentId>", "Agent ID")
    .option("--window <days>", "Window in days", "30")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent?: string; window: string; json?: boolean }) => {
      const { createQualitySignalStore } = await import("./outcomes/qualitySignals.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());
      const store = createQualitySignalStore({ workspace: process.cwd(), agentId });
      const report = store.generateReport(parseInt(opts.window, 10));
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(chalk.cyan(`\n⭐ Quality Report — ${agentId} (last ${opts.window} days)\n`));
        console.log(`Total Ratings:     ${report.totalRatings}`);
        console.log(`Satisfaction:      ${report.satisfactionScore.toFixed(0)}%`);
        console.log(`Good:              ${report.goodPct.toFixed(1)}%`);
        console.log(`Bad:               ${report.badPct.toFixed(1)}%`);
        if (report.alerts.length > 0) {
          console.log(chalk.yellow("\nAlerts:"));
          for (const a of report.alerts) console.log(`  ⚠️ ${a}`);
        }
      }
    });

  const sessionsViewCmd = program.command("sessions").description("View and analyze user sessions");

  sessionsViewCmd
    .command("list")
    .description("List tracked sessions")
    .option("--agent <agentId>", "Agent ID")
    .option("--limit <n>", "Number of sessions", "20")
    .option("--sort <by>", "Sort: recent | quality | cost", "recent")
    .option("--json", "Output as JSON")
    .action(async (opts: { agent?: string; limit: string; sort: string; json?: boolean }) => {
      const { createSessionCorrelator } = await import("./observability/sessionCorrelator.js");
      const agentId = opts.agent ?? resolveAgentId(process.cwd());
      const correlator = createSessionCorrelator({ workspace: process.cwd(), agentId });
      const sessions = correlator.listSessions(parseInt(opts.limit, 10), opts.sort as "recent" | "quality" | "cost");
      if (opts.json) {
        console.log(JSON.stringify(sessions, null, 2));
      } else {
        console.log(chalk.cyan(`\n📊 Sessions — ${agentId}\n`));
        if (sessions.length === 0) {
          console.log(chalk.gray("No sessions tracked yet. Connect an observability provider with `amc watch connect`."));
        }
        for (const s of sessions) {
          const icon = s.qualityScore >= 80 ? "✅" : s.qualityScore >= 50 ? "⚠️" : "❌";
          console.log(`${icon} ${s.sessionId.slice(0, 12)}... — ${s.traceCount} traces — Quality: ${s.qualityScore}% — $${s.totalCostUsd.toFixed(4)}`);
        }
      }
    });

  integrations
    .command("setup")
    .description("Generate integration config files")
    .requiredOption("--type <type>", "Integration: github-action | gitlab-ci | slack | discord | pagerduty | webhook | langfuse | helicone | datadog")
    .option("--min-score <score>", "Minimum passing score for CI gates", "60")
    .option("--agent <agentId>", "Agent ID")
    .option("--output <dir>", "Output directory", ".")
    .action(async (opts: { type: string; minScore: string; agent?: string; output: string }) => {
      const { setupIntegration} = await import("./integrations/ciGate.js");
      const result = setupIntegration(
        opts.output,
        opts.type as any,
        { minScore: parseInt(opts.minScore, 10), agentId: opts.agent },
      );
      console.log(chalk.green(`✅ Integration setup complete\n`));
      for (const f of result.files) console.log(chalk.gray(`  Created: ${f.path}`));
      console.log(`\n${result.instructions}`);
    });

  integrations
    .command("catalog")
    .description("List available integrations")
    .action(() => {
      console.log(chalk.cyan("\n🔌 Available Integrations\n"));
      const integrations = [
        { name: "github-action", desc: "GitHub Actions CI gate — block PRs below score threshold" },
        { name: "gitlab-ci", desc: "GitLab CI pipeline gate" },
        { name: "slack", desc: "Slack webhook notifications for alerts" },
        { name: "discord", desc: "Discord webhook notifications" },
        { name: "pagerduty", desc: "PagerDuty incident triggers" },
        { name: "webhook", desc: "Generic webhook notifications" },
        { name: "langfuse", desc: "Langfuse observability connector" },
        { name: "helicone", desc: "Helicone observability connector" },
        { name: "datadog", desc: "Datadog observability connector" },
      ];
      for (const i of integrations) {
        console.log(`  ${chalk.white(i.name.padEnd(18))} ${chalk.gray(i.desc)}`);
      }
      console.log(chalk.gray("\nRun: amc integrations setup --type <name>"));
    });

  /* ── Enterprise Tier ─────────────────────────────────────────────── */
  const enterprise = program
    .command("enterprise")
    .description("Enterprise tier — licensing, audit export, SSO, fleet governance");

  enterprise
    .command("status")
    .description("Show current license status, tier, and enabled features")
    .action(async () => {
      const { enterpriseStatusCli } = await import("./enterprise/enterpriseCli.js");
      const result = enterpriseStatusCli({ workspace: process.cwd() });
      console.log(chalk.bold.white(`\n  Enterprise Status\n`));
      console.log(`  Tier:      ${chalk.hex("#00ff41")(result.tierLabel)} (${result.tier})`);
      console.log(`  License:   ${result.licenseValid ? chalk.green("valid") : chalk.red(result.licenseStatus)}`);
      if (result.org) {
        console.log(`  Org:       ${chalk.white(result.org)}`);
      }
      if (result.expiresAt) {
        console.log(`  Expires:   ${chalk.gray(result.expiresAt)}`);
      }
      if (result.graceDaysRemaining > 0) {
        console.log(`  Grace:     ${chalk.hex("#f59e0b")(`${result.graceDaysRemaining} days remaining`)}`);
      }
      console.log(`  Features:  ${result.features.length > 0 ? result.features.join(", ") : chalk.gray("none")}`);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.log(`  ${chalk.red("error:")} ${err}`);
        }
      }
      console.log();
    });

  enterprise
    .command("activate <key>")
    .description("Activate an enterprise license key (format: AMC-ENT-XXXX-XXXX-XXXX)")
    .action(async (key: string) => {
      const { validateLicenseKeyFormat } = await import("./enterprise/license.js");
      const { enterpriseActivateCli } = await import("./enterprise/enterpriseCli.js");
      const formatCheck = validateLicenseKeyFormat(key);
      if (!formatCheck.valid) {
        console.error(chalk.red(`\n  Invalid key format: ${formatCheck.errors.join(", ")}\n`));
        process.exit(1);
        return;
      }
      const result = enterpriseActivateCli({ workspace: process.cwd(), key });
      if (result.success) {
        console.log(chalk.green(`\n  License activated — tier: ${result.tier}`));
        if (result.org) {
          console.log(chalk.white(`  Organization: ${result.org}`));
        }
        console.log(chalk.gray(`  Stored: ${result.path}\n`));
      } else {
        console.error(chalk.red(`\n  Activation failed: ${result.errors.join(", ")}\n`));
        process.exit(1);
      }
    });

  enterprise
    .command("audit-export")
    .description("Export audit trail in SIEM format")
    .requiredOption("--format <format>", "Export format: splunk | datadog | cloudtrail | azure | elasticsearch | syslog")
    .requiredOption("--output <path>", "Output file path")
    .option("--limit <count>", "Max records to export", "1000")
    .option("--signed", "Also produce a signed audit trail file")
    .action(async (opts: { format: string; output: string; limit: string; signed?: boolean }) => {
      const { enterpriseAuditExportCli } = await import("./enterprise/enterpriseCli.js");
      const validFormats = ["splunk", "datadog", "cloudtrail", "azure", "elasticsearch", "syslog"];
      if (!validFormats.includes(opts.format)) {
        console.error(chalk.red(`\n  Invalid format: ${opts.format}. Use one of: ${validFormats.join(", ")}\n`));
        process.exit(1);
        return;
      }
      const result = enterpriseAuditExportCli({
        workspace: process.cwd(),
        format: opts.format as any,
        output: opts.output,
        limit: parseInt(opts.limit, 10),
        signed: opts.signed
      });
      console.log(chalk.green(`\n  Audit export complete`));
      console.log(`  Format:  ${result.format}`);
      console.log(`  Events:  ${result.eventCount}`);
      console.log(`  Output:  ${chalk.gray(result.outputPath)}`);
      if (result.signedTrailPath) {
        console.log(`  Signed:  ${chalk.gray(result.signedTrailPath)}`);
      }
      console.log();
    });

  enterprise
    .command("usage")
    .description("Show multi-tenant usage metering and quota utilization")
    .action(async () => {
      const { generateUsageMeteringSummary } = await import("./enterprise/fleetGovernance.js");
      const summary = generateUsageMeteringSummary(process.cwd());
      console.log(chalk.bold.white(`\n  Enterprise Usage Summary\n`));
      console.log(`  Tenants:          ${summary.tenantCount}`);
      console.log(`  Total Agents:     ${summary.totalAgents}`);
      console.log(`  Total Workspaces: ${summary.totalWorkspaces}`);
      console.log(`  Diagnostic Runs:  ${summary.totalDiagnosticRuns}`);
      console.log(`  Audit Events:     ${summary.totalAuditEvents}`);
      console.log(`  Storage:          ${summary.totalStorageMb} MB`);
      if (summary.tenantBreakdown.length > 0) {
        console.log(chalk.bold.white(`\n  Per-Tenant Breakdown\n`));
        for (const t of summary.tenantBreakdown) {
          const usage = t.usage;
          const agentStr = usage ? `${usage.agentCount} agents` : chalk.gray("no usage data");
          const storageStr = usage ? `${usage.storageMb} MB` : "";
          console.log(`  ${chalk.white(t.displayName)} (${chalk.gray(t.tenantId)})`);
          console.log(`    ${agentStr}${storageStr ? `, ${storageStr}` : ""}`);
        }
      }
      console.log();
    });
}
