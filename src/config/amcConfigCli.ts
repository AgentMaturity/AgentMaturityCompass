/**
 * CLI commands for amcconfig.yaml management.
 *
 * Commands:
 *   amc config init         — Generate a starter amcconfig.yaml
 *   amc config validate     — Validate an existing amcconfig.yaml
 *   amc config show         — Pretty-print resolved config
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import chalk from "chalk";
import YAML from "yaml";
import {
  discoverConfigFile,
  loadDeclarativeConfig,
  summarizeConfig,
} from "./amcConfigLoader.js";
import type { AMCDeclarativeConfig } from "./amcConfigSchema.js";

// ---------------------------------------------------------------------------
// amc config init
// ---------------------------------------------------------------------------

const STARTER_CONFIG = `# amcconfig.yaml — AMC Declarative Evaluation Config
# Docs: https://docs.agentmaturitycompass.dev/config
# One file. Define agents. Set thresholds. Run assurance. Ship with confidence.

version: "1.0"
description: "My agent evaluation suite"

# ─── Agents to evaluate ──────────────────────────────────────────────────────
agents:
  - id: my-agent
    name: "My Agent"
    runtime: any
    role: "general-purpose assistant"
    domain: "internal tooling"
    riskTier: med
    primaryTasks:
      - "answer questions"
      - "execute workflows"
    stakeholders:
      - "engineering team"
    # provider: openai            # references providers[].id below
    # command: "node agent.js"    # custom command to launch agent
    # args: ["--mode", "eval"]
    # env:
    #   AGENT_MODE: "evaluation"

# ─── LLM Providers (for gateway routing) ─────────────────────────────────────
# providers:
#   - id: openai
#     baseUrl: https://api.openai.com
#     apiKeyEnv: OPENAI_API_KEY
#     model: gpt-4o
#   - id: anthropic
#     baseUrl: https://api.anthropic.com
#     apiKeyEnv: ANTHROPIC_API_KEY
#     model: claude-sonnet-4-20250514

# ─── Maturity Thresholds (quality gates) ──────────────────────────────────────
thresholds:
  minIntegrityIndex: 0.5      # 0-1, minimum to pass
  minOverallLevel: 2          # 0-5, minimum maturity level
  requireObservedForLevel5: true
  denyIfLowTrust: false
  # Per-layer overrides:
  # layers:
  #   "Resilience": 3
  #   "Skills": 2

# ─── Assurance Packs (red-team & safety) ──────────────────────────────────────
assurance:
  runAll: false               # set true to run all 80+ packs
  mode: supervise             # supervise | sandbox
  window: 30d
  packs:
    - injection               # prompt injection attacks
    - exfiltration            # data exfiltration attempts
    - hallucination           # hallucination detection
    - governance-bypass       # governance bypass attempts
    - tool-misuse             # tool misuse scenarios
    # Pack with overrides:
    # - id: eu-ai-act-article
    #   minSeverity: medium
    #   skip:
    #     - scenario-id-to-skip

  # Industry-specific packs (uncomment as needed):
  # industries:
  #   - healthcare            # PHI/HIPAA scenarios
  #   - financial             # SOX/model risk
  #   - education             # FERPA
  #   - legal                 # legal compliance
  #   - pharma                # pharma compliance

# ─── Diagnostic Scoring ──────────────────────────────────────────────────────
diagnostic:
  window: 30d
  claimMode: auto             # auto | owner | harness
  # questions:                # specific question IDs (default: all)
  #   - "1.1"
  #   - "2.3"
  # skipQuestions:
  #   - "5.2"
  # layers:                   # specific layers (default: all)
  #   - "Resilience"
  #   - "Skills"

# ─── Output ──────────────────────────────────────────────────────────────────
output:
  formats:
    - terminal
    # - json
    # - html
    # - markdown
    # - badge
  # outputDir: ./amc-reports
  badge: false
  # badgePath: ./badge.svg
  share: false

# ─── CI/CD Integration ──────────────────────────────────────────────────────
ci:
  failOnThresholdViolation: true
  failOnAssuranceFailure: false
  githubComment: false
  uploadArtifact: false
  artifactName: amc-results

# ─── Compliance Framework Mappings ───────────────────────────────────────────
# frameworks:
#   euAiAct: true
#   nistAiRmf: true
#   owaspLlmTop10: true
#   iso42001: true
#   owaspGenAi: true

# ─── Security ────────────────────────────────────────────────────────────────
# security:
#   trustBoundaryMode: shared  # shared | isolated

# ─── Global Environment Variables ────────────────────────────────────────────
# env:
#   AMC_LOG_LEVEL: debug
#   MY_CUSTOM_VAR: value
`;

export interface ConfigInitOptions {
  workspace: string;
  force: boolean;
  output?: string;
}

export function configInit(options: ConfigInitOptions): void {
  const outputPath = options.output
    ? resolve(options.workspace, options.output)
    : resolve(options.workspace, "amcconfig.yaml");

  if (existsSync(outputPath) && !options.force) {
    console.error(
      chalk.red(`✗ ${outputPath} already exists. Use --force to overwrite.`)
    );
    process.exit(1);
  }

  writeFileSync(outputPath, STARTER_CONFIG, "utf8");
  console.log(chalk.green(`✓ Created ${outputPath}`));
  console.log(chalk.gray("  Edit the file, then run: amc config run"));
}

// ---------------------------------------------------------------------------
// amc config validate
// ---------------------------------------------------------------------------

export interface ConfigValidateOptions {
  workspace: string;
  config?: string;
}

export function configValidate(options: ConfigValidateOptions): void {
  try {
    const result = loadDeclarativeConfig(options.config, options.workspace);

    console.log(chalk.green("✓ Config is valid"));
    console.log();
    console.log(summarizeConfig(result));

    if (result.warnings.length > 0) {
      console.log();
      console.log(chalk.yellow("Warnings:"));
      for (const w of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${w}`));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ ${msg}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// amc config show
// ---------------------------------------------------------------------------

export interface ConfigShowOptions {
  workspace: string;
  config?: string;
  format: "yaml" | "json";
}

export function configShow(options: ConfigShowOptions): void {
  try {
    const result = loadDeclarativeConfig(options.config, options.workspace);
    const output =
      options.format === "json"
        ? JSON.stringify(result.config, null, 2)
        : YAML.stringify(result.config);

    console.log(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ ${msg}`));
    process.exit(1);
  }
}
