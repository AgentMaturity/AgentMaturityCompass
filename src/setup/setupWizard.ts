import { readdirSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import { setAgentAdapterProfile } from "../adapters/adapterConfigStore.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { pathExists, readUtf8 } from "../utils/fs.js";

type DetectedFrameworkName = "LangChain" | "AutoGen" | "CrewAI";
type AdapterId = "langchain-node" | "langchain-python" | "autogen-cli" | "crewai-cli";
export type WizardPriority = "speed-to-value" | "compliance-readiness" | "runtime-reliability";

export interface FrameworkDetection {
  framework: DetectedFrameworkName;
  adapterId: AdapterId;
  evidence: string[];
}

export interface ConfiguredAdapterProfile {
  framework: DetectedFrameworkName;
  adapterId: AdapterId;
  agentId: string;
}

export interface L3EtaEstimate {
  hours: number;
  readinessScore: number;
  rationale: string[];
}

export interface FirstWeekAction {
  day: number;
  focus: string;
  action: string;
  command: string;
}

export interface SetupWizardResult {
  detectedFrameworks: FrameworkDetection[];
  configuredAdapters: ConfiguredAdapterProfile[];
  etaToL3: L3EtaEstimate;
  firstWeekPlan: FirstWeekAction[];
  priority: WizardPriority;
}

function readOptionalFile(path: string): string {
  if (!pathExists(path)) {
    return "";
  }
  try {
    return readUtf8(path);
  } catch {
    return "";
  }
}

function loadDependencyNames(workspace: string): string[] {
  const packageJsonPath = join(workspace, "package.json");
  const raw = readOptionalFile(packageJsonPath);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.peerDependencies ?? {})
    ].map((value) => value.toLowerCase());
  } catch {
    return [];
  }
}

function loadPythonManifestText(workspace: string): string {
  const candidates = [
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "Pipfile"
  ];
  return candidates
    .map((name) => readOptionalFile(join(workspace, name)))
    .join("\n")
    .toLowerCase();
}

function hasAnyRegex(haystack: string, regexes: RegExp[]): boolean {
  return regexes.some((regex) => regex.test(haystack));
}

function detectLangChainFramework(workspace: string): FrameworkDetection | null {
  const deps = loadDependencyNames(workspace);
  const pythonManifest = loadPythonManifestText(workspace);
  const evidence: string[] = [];

  const hasNode = deps.some((dep) => dep === "langchain" || dep.startsWith("@langchain/"));
  if (hasNode) {
    evidence.push("package.json dependency (`langchain`/`@langchain/*`)");
  }
  const hasPython = hasAnyRegex(pythonManifest, [/\blangchain\b/, /\blangchain-community\b/, /\blangchain-openai\b/]);
  if (hasPython) {
    evidence.push("Python dependency (`langchain*`)");
  }

  if (!hasNode && !hasPython) {
    return null;
  }

  return {
    framework: "LangChain",
    adapterId: hasNode ? "langchain-node" : "langchain-python",
    evidence
  };
}

function detectAutoGenFramework(workspace: string): FrameworkDetection | null {
  const deps = loadDependencyNames(workspace);
  const pythonManifest = loadPythonManifestText(workspace);
  const evidence: string[] = [];

  const hasNodeHint = deps.some((dep) => dep.includes("autogen"));
  if (hasNodeHint) {
    evidence.push("package.json dependency mentioning `autogen`");
  }
  const hasPythonHint = hasAnyRegex(pythonManifest, [
    /\bautogen\b/,
    /\bpyautogen\b/,
    /\bautogen-agentchat\b/,
    /\bmicrosoft-autogen\b/
  ]);
  if (hasPythonHint) {
    evidence.push("Python dependency (`autogen`/`pyautogen`)");
  }

  if (!hasNodeHint && !hasPythonHint) {
    return null;
  }

  return {
    framework: "AutoGen",
    adapterId: "autogen-cli",
    evidence
  };
}

function detectCrewAIFramework(workspace: string): FrameworkDetection | null {
  const deps = loadDependencyNames(workspace);
  const pythonManifest = loadPythonManifestText(workspace);
  const evidence: string[] = [];

  const hasNodeHint = deps.some((dep) => dep.includes("crewai"));
  if (hasNodeHint) {
    evidence.push("package.json dependency mentioning `crewai`");
  }
  const hasPythonHint = hasAnyRegex(pythonManifest, [/\bcrewai\b/, /\bcrewai-tools\b/]);
  if (hasPythonHint) {
    evidence.push("Python dependency (`crewai`/`crewai-tools`)");
  }

  if (!hasNodeHint && !hasPythonHint) {
    return null;
  }

  return {
    framework: "CrewAI",
    adapterId: "crewai-cli",
    evidence
  };
}

export function detectFrameworksForOnboarding(workspace: string): FrameworkDetection[] {
  const detections = [
    detectLangChainFramework(workspace),
    detectAutoGenFramework(workspace),
    detectCrewAIFramework(workspace)
  ].filter((row): row is FrameworkDetection => row !== null);

  return detections.sort((a, b) => a.framework.localeCompare(b.framework));
}

function listTestFiles(workspace: string): number {
  const candidates = [join(workspace, "tests"), join(workspace, "test"), join(workspace, "__tests__")];
  let total = 0;
  for (const dir of candidates) {
    if (!pathExists(dir)) {
      continue;
    }
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|mjs|cjs|py)$/i.test(entry.name)) {
          total += 1;
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return total;
}

function hasCiWorkflow(workspace: string): boolean {
  const workflowDir = join(workspace, ".github", "workflows");
  if (!pathExists(workflowDir)) {
    return false;
  }
  try {
    const entries = readdirSync(workflowDir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && /\.(ya?ml)$/i.test(entry.name));
  } catch {
    return false;
  }
}

export function estimateTimeToL3(params: {
  workspace: string;
  detectedFrameworks: FrameworkDetection[];
  configuredAdapterCount: number;
}): L3EtaEstimate {
  const reasons: string[] = [];
  let readinessScore = 18;

  if (params.detectedFrameworks.length > 0) {
    const frameworkBoost = Math.min(30, params.detectedFrameworks.length * 12);
    readinessScore += frameworkBoost;
    reasons.push(`Detected ${params.detectedFrameworks.length} framework(s), reducing adapter setup time.`);
  } else {
    reasons.push("No supported framework detected, onboarding will need manual adapter setup.");
  }

  if (params.configuredAdapterCount > 0) {
    readinessScore += 12;
    reasons.push("Adapter profile auto-configured from detected framework(s).");
  }

  const testFileCount = listTestFiles(params.workspace);
  if (testFileCount > 0) {
    readinessScore += Math.min(20, 6 + Math.floor(testFileCount / 4));
    reasons.push(`Found ${testFileCount} test files to reuse for evidence collection and controls.`);
  } else {
    reasons.push("No test files detected; expect extra time to create baseline verification checks.");
  }

  if (hasCiWorkflow(params.workspace)) {
    readinessScore += 10;
    reasons.push("CI workflow found, enabling faster continuous evidence capture.");
  } else {
    reasons.push("No CI workflow detected; manual run cadence may slow maturity progression.");
  }

  if (pathExists(join(params.workspace, ".amc"))) {
    readinessScore += 10;
    reasons.push("AMC workspace already initialized.");
  }

  if (pathExists(join(params.workspace, ".amc", "gateway.yaml"))) {
    readinessScore += 10;
    reasons.push("Gateway config present, so provider routing is ready.");
  } else {
    reasons.push("Gateway config missing; provider routing must be configured before supervised runs.");
  }

  const boundedScore = Math.max(0, Math.min(100, readinessScore));
  const estimatedHours = Math.max(2, Math.min(20, Number((18 - boundedScore * 0.14).toFixed(1))));

  return {
    hours: estimatedHours,
    readinessScore: boundedScore,
    rationale: reasons
  };
}

function frameworkActionLines(detections: FrameworkDetection[]): string[] {
  if (detections.length === 0) {
    return ["Run `amc adapters configure --adapter generic-cli --route /openai --model gpt-4o-mini --mode SUPERVISE`."];
  }
  return detections.map((detection) => {
    if (detection.framework === "LangChain") {
      return "Wrap one LangChain flow with AMC lease + telemetry and validate route isolation.";
    }
    if (detection.framework === "AutoGen") {
      return "Route AutoGen multi-agent calls through AMC gateway to capture policy evidence automatically.";
    }
    return "Route CrewAI crews through AMC supervise mode and record work-order approval events.";
  });
}

export function generateFirstWeekPlan(params: {
  detectedFrameworks: FrameworkDetection[];
  priority: WizardPriority;
  etaToL3Hours: number;
}): FirstWeekAction[] {
  const frameworkActions = frameworkActionLines(params.detectedFrameworks);
  const priorityDay4 =
    params.priority === "compliance-readiness"
      ? {
          focus: "Compliance mapping",
          action: "Link current controls to a baseline framework and close at least one high-severity gap.",
          command: "amc compliance report --framework NIST_AI_RMF --json"
        }
      : params.priority === "runtime-reliability"
        ? {
            focus: "Reliability hardening",
            action: "Run assurance and resilience checks, then fix the top failed control path.",
            command: "amc assurance run --agent default --json"
          }
        : {
            focus: "Speed to value",
            action: "Instrument one high-volume workflow end-to-end and capture first measurable improvement.",
            command: "amc score tier --tier quick"
          };

  return [
    {
      day: 1,
      focus: "Baseline",
      action: "Run the rapid assessment and lock your initial maturity baseline.",
      command: "amc quickscore"
    },
    {
      day: 2,
      focus: "Adapter fit",
      action: frameworkActions[0] ?? "Bind your first production path through AMC.",
      command: "amc adapters list"
    },
    {
      day: 3,
      focus: "Evidence flow",
      action: "Run a supervised workload and verify events, policies, and receipts are captured.",
      command: "amc score tier --tier quick"
    },
    {
      day: 4,
      focus: priorityDay4.focus,
      action: priorityDay4.action,
      command: priorityDay4.command
    },
    {
      day: 5,
      focus: "Gap closure",
      action: "Address your top three maturity blockers and rerun quickscore to verify lift.",
      command: "amc quickscore"
    },
    {
      day: 6,
      focus: "Scale readiness",
      action: "Validate team repeatability with doctor checks and adapter environment exports.",
      command: "amc doctor --json"
    },
    {
      day: 7,
      focus: "L3 checkpoint",
      action: `Run full tier assessment and confirm progress against the ${params.etaToL3Hours.toFixed(1)}h L3 estimate.`,
      command: "amc score tier --tier standard"
    }
  ];
}

function choosePrioritySynchronously(interactive: boolean): WizardPriority {
  if (!interactive || !process.stdin.isTTY) {
    return "speed-to-value";
  }
  return "speed-to-value";
}

async function choosePriority(interactive: boolean): Promise<WizardPriority> {
  const syncChoice = choosePrioritySynchronously(interactive);
  if (!interactive || !process.stdin.isTTY) {
    return syncChoice;
  }
  const answer = await inquirer.prompt<{ priority: WizardPriority }>([
    {
      type: "list",
      name: "priority",
      message: "What should AMC optimize first for your team?",
      choices: [
        { name: "Fastest time-to-value", value: "speed-to-value" },
        { name: "Compliance readiness", value: "compliance-readiness" },
        { name: "Runtime reliability", value: "runtime-reliability" }
      ],
      default: syncChoice
    }
  ]);
  return answer.priority;
}

function preferredGatewayRoute(workspace: string): string {
  try {
    const config = loadGatewayConfig(workspace);
    return config.routes[0]?.prefix ?? "/openai";
  } catch {
    return "/openai";
  }
}

export function autoConfigureDetectedFrameworkAdapters(params: {
  workspace: string;
  detections: FrameworkDetection[];
  agentId?: string;
}): ConfiguredAdapterProfile[] {
  if (params.detections.length === 0) {
    return [];
  }

  const route = preferredGatewayRoute(params.workspace);
  const baseAgentId = resolveAgentId(params.workspace, params.agentId);
  const configured: ConfiguredAdapterProfile[] = [];

  for (const [index, detection] of params.detections.entries()) {
    const agentId = index === 0 ? baseAgentId : `${baseAgentId}-${detection.framework.toLowerCase()}`;
    setAgentAdapterProfile(params.workspace, agentId, {
      preferredAdapter: detection.adapterId,
      preferredProviderRoute: route,
      preferredModel: "gpt-4o-mini",
      runMode: "SUPERVISE",
      leaseScopes: ["gateway:llm", "toolhub:intent", "toolhub:execute", "proxy:connect", "governor:check", "receipt:verify"],
      routeAllowlist: [route],
      modelAllowlist: ["*"]
    });
    configured.push({
      framework: detection.framework,
      adapterId: detection.adapterId,
      agentId
    });
  }
  return configured;
}

export async function runSetupWizard(params: {
  workspace: string;
  interactive: boolean;
  agentId?: string;
}): Promise<SetupWizardResult> {
  const detections = detectFrameworksForOnboarding(params.workspace);
  const configuredAdapters = autoConfigureDetectedFrameworkAdapters({
    workspace: params.workspace,
    detections,
    agentId: params.agentId
  });
  const eta = estimateTimeToL3({
    workspace: params.workspace,
    detectedFrameworks: detections,
    configuredAdapterCount: configuredAdapters.length
  });
  const priority = await choosePriority(params.interactive);
  const firstWeekPlan = generateFirstWeekPlan({
    detectedFrameworks: detections,
    priority,
    etaToL3Hours: eta.hours
  });

  return {
    detectedFrameworks: detections,
    configuredAdapters,
    etaToL3: eta,
    firstWeekPlan,
    priority
  };
}

