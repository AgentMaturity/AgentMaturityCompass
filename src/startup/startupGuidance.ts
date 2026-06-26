import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getQuestionsForTier } from "../diagnostic/quickScore.js";

export type StartupRole = "founder" | "cto" | "developer" | "operator";

export interface StartupGuidanceInput {
  workspace: string;
  role?: string;
  framework?: string;
  env?: NodeJS.ProcessEnv;
}

export interface StartupIssue {
  id: string;
  severity: "blocker" | "warning" | "info";
  title: string;
  whyItMatters: string;
  fixCommand: string;
}

export interface StartupGuidancePlan {
  schemaVersion: 1;
  generatedAt: string;
  role: StartupRole;
  roleGoal: string;
  detectedFramework: string;
  estimatedMinutes: number;
  startupPath: string[];
  issues: StartupIssue[];
  sampleAnswers: Record<string, number>;
  sampleAnswersPath: string;
  commands: {
    initialize: string;
    writeAnswers: string;
    scoreFromAnswers: string;
    whatIsBroken: string;
    captureEvidence: string;
    generateGuardrails: string;
  };
  externalBasis: Array<{
    title: string;
    url: string;
    retrievedAt: string;
    note: string;
  }>;
  caveats: string[];
}

const ROLE_GOALS: Record<StartupRole, string> = {
  founder: "Get a board-plain trust baseline and first guardrails before a pilot.",
  cto: "Get a measurable baseline without enterprise setup or account creation.",
  developer: "Create a local workspace, sample answers, and first fix commands.",
  operator: "Check evidence-capture readiness and avoid unsigned claims."
};

function normalizeRole(role: string | undefined): StartupRole {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "founder" || normalized === "cto" || normalized === "developer" || normalized === "operator") {
    return normalized;
  }
  return "cto";
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function detectFramework(workspace: string, explicit?: string): string {
  if (explicit && explicit !== "auto") {
    return explicit;
  }

  const packageJsonPath = join(workspace, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {})
      ]);
      if ([...deps].some((dep) => dep === "langchain" || dep.startsWith("@langchain/"))) return "LangChain";
      if (deps.has("ai")) return "Vercel AI SDK";
      if (deps.has("openai")) return "OpenAI SDK";
      if (deps.has("@anthropic-ai/sdk")) return "Anthropic SDK";
    } catch {
      return "unknown-js";
    }
  }

  const pythonManifest = [
    readIfExists(join(workspace, "requirements.txt")),
    readIfExists(join(workspace, "pyproject.toml"))
  ].join("\n").toLowerCase();
  if (pythonManifest.includes("crewai")) return "CrewAI";
  if (pythonManifest.includes("langchain")) return "LangChain";
  if (pythonManifest.includes("autogen")) return "AutoGen";
  if (pythonManifest.includes("openai")) return "OpenAI SDK";

  return "generic agent";
}

function hasAnyRun(workspace: string): boolean {
  const flatRunsDir = join(workspace, ".amc", "runs");
  if (existsSync(flatRunsDir) && readdirSync(flatRunsDir).some((file) => file.endsWith(".json"))) {
    return true;
  }
  const agentsDir = join(workspace, ".amc", "agents");
  if (!existsSync(agentsDir)) {
    return false;
  }
  for (const agent of readdirSync(agentsDir, { withFileTypes: true })) {
    if (!agent.isDirectory()) continue;
    const runsDir = join(agentsDir, agent.name, "runs");
    if (existsSync(runsDir) && readdirSync(runsDir).some((file) => file.endsWith(".json"))) {
      return true;
    }
  }
  return false;
}

export function startupSampleAnswers(): Record<string, number> {
  return Object.fromEntries(getQuestionsForTier("quick").map((question) => [question.id, 2]));
}

export function buildStartupGuidancePlan(input: StartupGuidanceInput): StartupGuidancePlan {
  const role = normalizeRole(input.role);
  const env = input.env ?? process.env;
  const sampleAnswersPath = "amc-startup-answers.json";
  const hasWorkspace = existsSync(join(input.workspace, ".amc", "amc.config.yaml"));
  const hasSampleAnswers = existsSync(join(input.workspace, sampleAnswersPath));
  const hasRuns = hasAnyRun(input.workspace);
  const hasVaultPassphrase = Boolean(env.AMC_VAULT_PASSPHRASE);
  const detectedFramework = detectFramework(input.workspace, input.framework);
  const issues: StartupIssue[] = [];

  if (!hasWorkspace) {
    issues.push({
      id: "workspace_missing",
      severity: "blocker",
      title: "AMC workspace is not initialized",
      whyItMatters: "Quick scoring, evidence, and guardrail commands need the `.amc` workspace state.",
      fixCommand: "amc init --minimal"
    });
  }
  if (!hasSampleAnswers) {
    issues.push({
      id: "sample_answers_missing",
      severity: "warning",
      title: "No startup answer file yet",
      whyItMatters: "Headless or non-TTY runs need provided L0-L5 answers to avoid placeholder scores.",
      fixCommand: `amc quickstart --startup-plan --answers-out ${sampleAnswersPath}`
    });
  }
  if (!hasRuns) {
    issues.push({
      id: "measured_score_missing",
      severity: "warning",
      title: "No measured score artifact found",
      whyItMatters: "Without a scored run, dashboards, badges, and board summaries only have setup state.",
      fixCommand: `amc quickscore --answers ${sampleAnswersPath} --json`
    });
  }
  if (!hasVaultPassphrase) {
    issues.push({
      id: "vault_env_missing",
      severity: "info",
      title: "Vault passphrase is not set in the environment",
      whyItMatters: "Unsigned startup checks work, but signed evidence capture needs an explicit secret outside source control.",
      fixCommand: "export AMC_VAULT_PASSPHRASE='replace-with-a-secret'"
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    role,
    roleGoal: ROLE_GOALS[role],
    detectedFramework,
    estimatedMinutes: 10,
    startupPath: [
      "Initialize the minimal workspace.",
      "Write or edit sample answers.",
      "Run a provided-answer quickscore to avoid placeholder L0 output.",
      "Capture one real agent run with the first-run evidence command.",
      "Run the first guardrail guide.",
      "Use `--what-broken` whenever you only want startup blockers."
    ],
    issues,
    sampleAnswers: startupSampleAnswers(),
    sampleAnswersPath,
    commands: {
      initialize: "amc init --minimal",
      writeAnswers: `amc quickstart --startup-plan --answers-out ${sampleAnswersPath}`,
      scoreFromAnswers: `amc quickscore --answers ${sampleAnswersPath} --json`,
      whatIsBroken: "amc quickstart --what-broken",
      captureEvidence: "amc evidence collect --first-run --runtime any -- <agent command>",
      generateGuardrails: "amc guide --go"
    },
    externalBasis: [
      {
        title: "The Twelve-Factor App: Config",
        url: "https://12factor.net/config",
        retrievedAt: "2026-06-16",
        note: "Supports keeping deploy-varying credentials such as vault passphrases in environment variables instead of source-controlled files."
      }
    ],
    caveats: [
      "Sample answers are starter scaffolding, not evidence of actual maturity.",
      "Use `quickscore --answers` for a measured provided-answer baseline in CI or non-TTY shells.",
      "Use `quickscore --auto` only after `evidence collect --first-run` or another evidence capture path has recorded a run."
    ]
  };
}

export function writeStartupSampleAnswers(path: string, answers: Record<string, number>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(answers, null, 2)}\n`, "utf8");
}

function renderIssue(issue: StartupIssue): string {
  return `- [${issue.severity}] ${issue.title}\n  Why: ${issue.whyItMatters}\n  Fix: ${issue.fixCommand}`;
}

export function renderStartupGuidancePlan(plan: StartupGuidancePlan, opts: { onlyBroken?: boolean } = {}): string {
  const issues = plan.issues.length > 0
    ? plan.issues.map(renderIssue).join("\n")
    : "- No startup blockers detected. Run the score and guardrail commands below.";

  if (opts.onlyBroken) {
    return [
      "# AMC Startup Check",
      "",
      `Role: ${plan.role}`,
      `Detected framework: ${plan.detectedFramework}`,
      "",
      "## What Is Blocking You",
      "",
      issues,
      "",
      "## Fastest Next Commands",
      "",
      `1. ${plan.commands.initialize}`,
      `2. ${plan.commands.writeAnswers}`,
      `3. ${plan.commands.scoreFromAnswers}`,
      `4. ${plan.commands.generateGuardrails}`
    ].join("\n");
  }

  return [
    "# AMC Startup Plan",
    "",
    `Role: ${plan.role}`,
    `Goal: ${plan.roleGoal}`,
    `Detected framework: ${plan.detectedFramework}`,
    `Estimated time: ${plan.estimatedMinutes} minutes`,
    "",
    "## Startup Path",
    "",
    ...plan.startupPath.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## What Is Blocking You",
    "",
    issues,
    "",
    "## Commands",
    "",
    `- Initialize: ${plan.commands.initialize}`,
    `- Write sample answers: ${plan.commands.writeAnswers}`,
    `- Score from answers: ${plan.commands.scoreFromAnswers}`,
    `- Just tell me what is broken: ${plan.commands.whatIsBroken}`,
    `- Capture evidence: ${plan.commands.captureEvidence}`,
    `- Generate guardrails: ${plan.commands.generateGuardrails}`,
    "",
    "## Sample Answers",
    "",
    `Write path: ${plan.sampleAnswersPath}`,
    "The file contains L0-L5 starter values for the quick questions. Edit it before treating the score as a real baseline.",
    "",
    "## External Basis",
    "",
    ...plan.externalBasis.map((source) => `- ${source.title}: ${source.url} (${source.retrievedAt}) - ${source.note}`),
    "",
    "## Caveats",
    "",
    ...plan.caveats.map((caveat) => `- ${caveat}`)
  ].join("\n");
}
