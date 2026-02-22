import { spawnSync } from "node:child_process";
import { join } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { detectAllRuntimes } from "./runtimes/index.js";
import { ensureSigningKeys } from "./crypto/keys.js";
import type { AMCConfig, RiskTier } from "./types.js";
import { questionIds } from "./diagnostic/questionBank.js";
import { createSignedTargetProfile, defaultTargetMapping, saveTargetProfile } from "./targets/targetProfile.js";
import {
  extractMissingAuthEnvVars,
  initGatewayConfig,
  loadGatewayConfig,
  presetGatewayConfigForProvider,
  routeBaseUrls,
  verifyGatewayConfigSignature,
  type GatewayConfig
} from "./gateway/config.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "./utils/fs.js";
import { sha256Hex } from "./utils/hash.js";
import { canonicalize } from "./utils/json.js";
import { openLedger } from "./ledger/ledger.js";
import { getAgentPaths } from "./fleet/paths.js";
import {
  ensureDefaultFleetAgent,
  loadAgentConfig,
  updateAgentProvider,
  verifyAgentConfigSignature,
  verifyFleetConfigSignature
} from "./fleet/registry.js";
import { actionPolicyPath, initActionPolicy } from "./governor/actionPolicyEngine.js";
import { initToolsConfig, toolsConfigPath } from "./toolhub/toolhubValidators.js";
import { budgetsPath, initBudgets } from "./budgets/budgets.js";
import { adaptersConfigPath, initAdaptersConfig } from "./adapters/adapterConfigStore.js";
import { bridgeConfigPath, initBridgeConfig } from "./bridge/bridgeConfigStore.js";
import { initModelTaxonomy, modelTaxonomyPath } from "./bridge/modelTaxonomy.js";
import { initOpsPolicy, opsPolicyPath } from "./ops/policy.js";
import { initTrustConfig, trustConfigPath } from "./trust/trustConfig.js";
import { initForecastPolicy } from "./forecast/forecastEngine.js";
import { forecastPolicyPath } from "./forecast/forecastStore.js";
import { canonPath, initCanon } from "./canon/canonLoader.js";
import { diagnosticBankPath, initDiagnosticBank } from "./diagnostic/bank/bankLoader.js";
import { cgxPolicyPath, initCgxPolicy } from "./cgx/cgxStore.js";
import { initMechanicWorkspace } from "./mechanic/mechanicApi.js";
import { mechanicTargetsPath } from "./mechanic/targetsStore.js";
import { benchPolicyPath, initBenchPolicy } from "./bench/benchPolicyStore.js";
import { initPromptPolicy, promptPolicyPath } from "./prompt/promptPolicyStore.js";
import { assurancePolicyPath, initAssurancePolicy } from "./assurance/assurancePolicyStore.js";
import { auditPolicyPath, initAuditPolicy } from "./audit/auditPolicyStore.js";
import { auditMapActivePath, auditMapBuiltinPath, initAuditMaps } from "./audit/auditMapStore.js";

export interface WorkspacePaths {
  agentId: string;
  root: string;
  amcDir: string;
  keysDir: string;
  blobsDir: string;
  targetsDir: string;
  runsDir: string;
  reportsDir: string;
  bundlesDir: string;
  contextGraph: string;
  config: string;
  guardrails: string;
  promptAddendum: string;
  evalHarness: string;
}

export function getWorkspacePaths(workspace = process.cwd(), agentId?: string): WorkspacePaths {
  const amcDir = join(workspace, ".amc");
  const agentPaths = getAgentPaths(workspace, agentId);
  return {
    agentId: agentPaths.agentId,
    root: workspace,
    amcDir,
    keysDir: join(amcDir, "keys"),
    blobsDir: join(amcDir, "blobs"),
    targetsDir: agentPaths.targetsDir,
    runsDir: agentPaths.runsDir,
    reportsDir: agentPaths.reportsDir,
    bundlesDir: agentPaths.bundlesDir,
    contextGraph: agentPaths.contextGraph,
    config: join(amcDir, "amc.config.yaml"),
    guardrails: agentPaths.guardrails,
    promptAddendum: agentPaths.promptAddendum,
    evalHarness: agentPaths.evalHarness
  };
}

export function defaultAMCConfig(): AMCConfig {
  return {
    runtimes: {
      claude: { command: "claude", argsTemplate: [] },
      gemini: { command: "gemini", argsTemplate: [] },
      openclaw: { command: "openclaw", argsTemplate: [] },
      mock: { command: "node", argsTemplate: ["-e", '{"claimedLevels":{}}'] },
      any: { command: "", argsTemplate: [] }
    },
    security: {
      trustBoundaryMode: "shared"
    },
    supervise: {
      extraEnv: {},
      includeProxyEnv: true,
      customBaseUrlEnvKeys: []
    }
  };
}

export function loadAMCConfig(workspace = process.cwd()): AMCConfig {
  const paths = getWorkspacePaths(workspace);
  if (!pathExists(paths.config)) {
    return defaultAMCConfig();
  }
  const raw = YAML.parse(readUtf8(paths.config)) as Partial<AMCConfig> | null;
  const base = defaultAMCConfig();
  return {
    runtimes: {
      claude: { ...base.runtimes.claude, ...(raw?.runtimes?.claude ?? {}) },
      gemini: { ...base.runtimes.gemini, ...(raw?.runtimes?.gemini ?? {}) },
      openclaw: { ...base.runtimes.openclaw, ...(raw?.runtimes?.openclaw ?? {}) },
      mock: { ...base.runtimes.mock, ...(raw?.runtimes?.mock ?? {}) },
      any: { ...base.runtimes.any, ...(raw?.runtimes?.any ?? {}) }
    },
    security: {
      trustBoundaryMode: raw?.security?.trustBoundaryMode === "isolated" ? "isolated" : base.security.trustBoundaryMode
    },
    supervise: {
      extraEnv: raw?.supervise?.extraEnv ?? {},
      includeProxyEnv: raw?.supervise?.includeProxyEnv ?? base.supervise.includeProxyEnv,
      customBaseUrlEnvKeys: raw?.supervise?.customBaseUrlEnvKeys ?? base.supervise.customBaseUrlEnvKeys
    }
  };
}

export function saveAMCConfig(workspace: string, config: AMCConfig): void {
  const paths = getWorkspacePaths(workspace);
  ensureDir(paths.amcDir);
  writeFileAtomic(paths.config, YAML.stringify(config), 0o644);
}

export interface InitWorkspaceOptions {
  workspacePath?: string;
  agentId?: string;
  agentName?: string;
  role?: string;
  domain?: string;
  primaryTasks?: string[];
  stakeholders?: string[];
  riskTier?: RiskTier;
  channels?: string[];
  tools?: string[];
  trustBoundaryMode?: "isolated" | "shared";
}

function defaultContextGraph(opts: InitWorkspaceOptions): Record<string, unknown> {
  const riskTier = opts.riskTier ?? "med";
  const agentName = opts.agentName ?? "Agent";
  const primaryTasks = opts.primaryTasks ?? ["general assistance"];
  const stakeholders = opts.stakeholders ?? ["owner", "operators", "end-users"];
  const tools = opts.tools ?? ["local-filesystem", "cli"];

  return {
    mission: `${agentName} delivers reliable outcomes for ${primaryTasks.join(", ")} while preserving safety and alignment.`,
    successMetrics: [
      "task completion with verification",
      "low contradiction rate",
      "increasing stakeholder trust"
    ],
    constraints: [
      "Never fabricate evidence or citations",
      "Respect role boundaries and escalation rules",
      "Protect sensitive data and secrets"
    ],
    forbiddenActions: [
      "exfiltrate secrets",
      "bypass policy checks",
      "perform irreversible high-risk actions without approval"
    ],
    riskTier,
    escalationRules: [
      "Escalate when confidence is low for high-risk actions",
      "Escalate when policy conflict exists",
      "Escalate when required evidence is missing"
    ],
    entities: [
      { id: "goal-1", type: "Goal", label: "Reliable verified outcomes" },
      { id: "nongoal-1", type: "NonGoal", label: "Optimize for speed at any cost" },
      { id: "stakeholder-1", type: "Stakeholder", label: stakeholders.join(", ") },
      { id: "constraint-1", type: "Constraint", label: "Evidence-gated outputs" },
      { id: "policy-1", type: "Policy", label: "Least privilege and consent" },
      { id: "risk-1", type: "RiskTier", label: riskTier },
      { id: "tool-1", type: "Tool", label: tools.join(", ") },
      { id: "boundary-1", type: "DataBoundary", label: "No unauthorized data export" },
      { id: "metric-1", type: "Metric", label: "IntegrityIndex >= 0.6" },
      { id: "escalation-1", type: "EscalationRule", label: "Escalate on low confidence" },
      { id: "approval-1", type: "ApprovalRule", label: "Approval for high-risk irreversible actions" }
    ]
  };
}

export function initWorkspace(opts: InitWorkspaceOptions = {}): { workspacePath: string; contextGraphHash: string } {
  const workspace = opts.workspacePath ?? process.cwd();
  const paths = getWorkspacePaths(workspace, opts.agentId);

  ensureDir(paths.amcDir);
  ensureDir(paths.keysDir);
  ensureDir(paths.blobsDir);
  ensureDir(paths.targetsDir);
  ensureDir(paths.runsDir);
  ensureDir(paths.reportsDir);
  ensureDir(paths.bundlesDir);

  ensureSigningKeys(workspace);

  if (!pathExists(trustConfigPath(workspace))) {
    initTrustConfig(workspace);
  }

  const contextGraphObj = defaultContextGraph(opts);
  if (!pathExists(paths.contextGraph)) {
    writeFileAtomic(paths.contextGraph, JSON.stringify(contextGraphObj, null, 2), 0o644);
  }

  const contextGraphRaw = readUtf8(paths.contextGraph);
  const contextGraphHash = sha256Hex(canonicalize(JSON.parse(contextGraphRaw) as unknown));

  const config = loadAMCConfig(workspace);
  if (opts.trustBoundaryMode) {
    config.security.trustBoundaryMode = opts.trustBoundaryMode;
  }
  saveAMCConfig(workspace, config);

  if (!pathExists(paths.guardrails)) {
    writeFileAtomic(
      paths.guardrails,
      YAML.stringify({
        honesty: { requireKnownUnknownAssumptions: true, requireEvidenceRefs: true },
        compliance: { requireConsentForSensitive: true, requireAuditEvents: true },
        verification: { requireTestsForHighRisk: true },
        thresholds: { minIntegrityIndex: 0.6 }
      }),
      0o644
    );
  }

  if (!pathExists(paths.promptAddendum)) {
    writeFileAtomic(
      paths.promptAddendum,
      [
        "# AMC Prompt Addendum",
        "",
        "Always structure high-impact outputs as:",
        "1) Known facts (with evidence refs)",
        "2) Unknowns",
        "3) Assumptions",
        "4) Verification plan",
        "5) Escalation/consent checkpoints"
      ].join("\n"),
      0o644
    );
  }

  if (!pathExists(paths.evalHarness)) {
    writeFileAtomic(
      paths.evalHarness,
      YAML.stringify({
        suites: [
          { name: "truthfulness", checks: ["evidence-link", "uncertainty-label"] },
          { name: "compliance", checks: ["consent-required", "policy-refusal"] },
          { name: "verification", checks: ["test-evidence", "reproducibility"] }
        ]
      }),
      0o644
    );
  }

  const targetFile = join(paths.targetsDir, "default.target.json");
  if (!pathExists(targetFile)) {
    const mapping = defaultTargetMapping(3);
    const target = createSignedTargetProfile({
      workspace,
      name: "default",
      contextGraphHash,
      mapping
    });
    saveTargetProfile(workspace, target, paths.agentId);
  }

  const ledger = openLedger(workspace);
  ledger.close();

  if (!pathExists(actionPolicyPath(workspace))) {
    initActionPolicy(workspace);
  }

  if (!pathExists(toolsConfigPath(workspace))) {
    initToolsConfig(workspace);
  }

  if (!pathExists(budgetsPath(workspace))) {
    initBudgets(workspace, paths.agentId);
  }

  if (!pathExists(adaptersConfigPath(workspace))) {
    initAdaptersConfig(workspace);
  }

  if (!pathExists(bridgeConfigPath(workspace))) {
    initBridgeConfig(workspace);
  }
  if (!pathExists(modelTaxonomyPath(workspace))) {
    initModelTaxonomy(workspace);
  }

  if (!pathExists(opsPolicyPath(workspace))) {
    initOpsPolicy(workspace);
  }

  if (!pathExists(forecastPolicyPath(workspace))) {
    initForecastPolicy(workspace);
  }

  if (!pathExists(canonPath(workspace))) {
    initCanon(workspace);
  }

  if (!pathExists(diagnosticBankPath(workspace))) {
    initDiagnosticBank(workspace);
  }

  if (!pathExists(cgxPolicyPath(workspace))) {
    initCgxPolicy(workspace);
  }

  if (!pathExists(mechanicTargetsPath(workspace))) {
    initMechanicWorkspace({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
  }

  if (!pathExists(benchPolicyPath(workspace))) {
    initBenchPolicy(workspace);
  }

  if (!pathExists(promptPolicyPath(workspace))) {
    initPromptPolicy(workspace);
  }

  if (!pathExists(assurancePolicyPath(workspace))) {
    initAssurancePolicy(workspace);
  }

  if (!pathExists(auditPolicyPath(workspace))) {
    initAuditPolicy(workspace);
  }
  if (!pathExists(auditMapBuiltinPath(workspace)) || !pathExists(auditMapActivePath(workspace))) {
    initAuditMaps(workspace);
  }

  if (!opts.agentId) {
    ensureDefaultFleetAgent(workspace);
  }

  return {
    workspacePath: workspace,
    contextGraphHash
  };
}

export function runDoctor(workspace = process.cwd()): {
  ok: boolean;
  lines: string[];
  availableRuntimes: string[];
  gatewayConfigured: boolean;
} {
  const config = loadAMCConfig(workspace);
  const detections = detectAllRuntimes(config);
  const lines: string[] = [];
  const available: string[] = [];

  for (const detection of detections) {
    if (detection.available) {
      available.push(detection.name);
      lines.push(`OK ${detection.name}: ${detection.resolvedPath}`);
      const versionAttempt = spawnSync(detection.command, ["--version"], { encoding: "utf8" });
      if (versionAttempt.status === 0) {
        const version = `${versionAttempt.stdout ?? ""}${versionAttempt.stderr ?? ""}`.trim() || "version output empty";
        lines.push(`  wrap-check: PASS (--version) -> ${version}`);
      } else {
        lines.push("  wrap-check: WARN (could not run --version; runtime may still work with explicit args)");
      }
    } else {
      lines.push(`MISSING ${detection.name}: ${detection.installHint}`);
    }
  }

  const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (docker.status === 0) {
    lines.push(`OK docker: ${(`${docker.stdout ?? ""}${docker.stderr ?? ""}`).trim()}`);
  } else {
    lines.push("MISSING docker: install Docker to use `amc sandbox run` (https://docs.docker.com/get-docker/)");
  }

  const fleetSig = verifyFleetConfigSignature(workspace);
  if (fleetSig.valid) {
    lines.push(`OK fleet config signature: ${fleetSig.sigPath}`);
  } else if (fleetSig.signatureExists) {
    lines.push(`WARNING fleet config signature invalid: ${fleetSig.reason}`);
  } else {
    lines.push("WARNING fleet config missing/unsigned. Run `amc fleet init`.");
  }

  const activeAgent = getWorkspacePaths(workspace).agentId;
  const agentSig = verifyAgentConfigSignature(workspace, activeAgent);
  if (agentSig.valid) {
    lines.push(`OK agent config signature (${activeAgent}): ${agentSig.sigPath}`);
  } else if (agentSig.signatureExists) {
    lines.push(`WARNING agent config signature invalid (${activeAgent}): ${agentSig.reason}`);
  } else {
    lines.push(`WARNING agent config missing for ${activeAgent}. Run \`amc agent add\`.`);
  }

  let gatewayConfigured = false;
  const gatewayConfigPath = join(workspace, ".amc", "gateway.yaml");
  if (pathExists(gatewayConfigPath)) {
    gatewayConfigured = true;
    const signature = verifyGatewayConfigSignature(workspace);
    if (signature.valid) {
      lines.push(`OK gateway config signature: ${signature.sigPath}`);
    } else if (signature.signatureExists) {
      lines.push(`WARNING gateway config signature invalid: ${signature.reason}`);
    } else {
      lines.push("WARNING gateway config signature missing (runs will be lower trust until signed)");
    }

    try {
      const gatewayConfig = loadGatewayConfig(workspace);
      const missingEnvVars = extractMissingAuthEnvVars(gatewayConfig);
      if (missingEnvVars.length > 0) {
        lines.push(`WARNING missing gateway auth env vars: ${missingEnvVars.join(", ")}`);
      } else {
        lines.push("OK gateway auth env vars present for configured upstreams");
      }

      const listenBase = `http://${gatewayConfig.listen.host}:${gatewayConfig.listen.port}`;
      for (const route of routeBaseUrls(gatewayConfig)) {
        lines.push(
          `gateway route ${route.prefix} -> ${route.upstream} (${route.baseUrl}) openaiCompatible=${route.openaiCompatible ? "yes" : "no"} agent=${route.agentId ?? "unbound"}`
        );
        lines.push(`  recommended: amc supervise --route ${listenBase}${route.prefix} -- <cmd...>`);
      }
      if (gatewayConfig.proxy.enabled) {
        lines.push(`gateway proxy enabled: http://${gatewayConfig.listen.host}:${gatewayConfig.proxy.port}`);
      } else {
        lines.push("gateway proxy disabled");
      }
      lines.push("recommended: amc gateway start --config .amc/gateway.yaml");
    } catch (error) {
      lines.push(`WARNING could not parse gateway config: ${String(error)}`);
    }
  } else {
    lines.push("MISSING gateway config: run `amc gateway init` to configure universal provider proxy routes.");
  }

  if (available.length === 0 && !gatewayConfigured) {
    lines.push("No runtime detected and gateway not configured. Configure at least one evidence capture path.");
  }

  const trustBoundary = config.security.trustBoundaryMode;
  if (trustBoundary !== "isolated") {
    lines.push(
      "WARNING trust boundary is set to shared. Runs will be marked INVALID unless you isolate monitor/auditor keys and set security.trustBoundaryMode=isolated."
    );
  }

  return {
    ok: available.length > 0 || gatewayConfigured || docker.status === 0,
    lines,
    availableRuntimes: available,
    gatewayConfigured
  };
}

export async function quickstartWizard(workspace = process.cwd()): Promise<{
  workspace: string;
  runtimeSuggestion: string;
  nextWrapCommand: string;
  nextGatewayCommand: string;
  nextSuperviseCommand: string;
  firstRunReport: string;
}> {
  const answers = await inquirer.prompt<{
    agentName: string;
    role: string;
    domain: string;
    primaryTasks: string;
    stakeholders: string;
    riskTier: RiskTier;
    channels: string;
    tools: string;
    provider: string;
    otherBaseUrl?: string;
    otherAuthType?: "bearer_env" | "header_env" | "query_env" | "none";
    otherEnvName?: string;
    otherHeader?: string;
    otherQueryParam?: string;
  }>([
    { type: "input", name: "agentName", message: "Agent name:", default: "My Agent" },
    { type: "input", name: "role", message: "Role:", default: "assistant" },
    { type: "input", name: "domain", message: "Domain:", default: "general" },
    {
      type: "input",
      name: "primaryTasks",
      message: "Primary tasks (comma-separated):",
      default: "support,analysis"
    },
    {
      type: "input",
      name: "stakeholders",
      message: "Stakeholders (comma-separated):",
      default: "owner,users"
    },
    { type: "list", name: "riskTier", message: "Risk tier:", choices: ["low", "med", "high", "critical"], default: "med" },
    { type: "input", name: "channels", message: "Channels (comma-separated):", default: "cli,chat" },
    { type: "input", name: "tools", message: "Tools (comma-separated):", default: "filesystem,terminal" },
    {
      type: "list",
      name: "provider",
      message: "Which model/provider do you use?",
      choices: [
        "OpenAI",
        "Azure OpenAI",
        "xAI Grok",
        "Anthropic",
        "Gemini",
        "OpenRouter",
        "Groq",
        "Mistral",
        "Cohere",
        "Together AI",
        "Fireworks",
        "Perplexity",
        "DeepSeek",
        "Qwen",
        "Local OpenAI-compatible (vLLM/LM Studio/etc)",
        "Other"
      ],
      default: "OpenAI"
    },
    {
      type: "input",
      name: "otherBaseUrl",
      message: "Other provider baseUrl:",
      when: (input) => input.provider === "Other",
      default: "https://example.com"
    },
    {
      type: "list",
      name: "otherAuthType",
      message: "Auth injection type:",
      when: (input) => input.provider === "Other",
      choices: ["bearer_env", "header_env", "query_env", "none"],
      default: "bearer_env"
    },
    {
      type: "input",
      name: "otherEnvName",
      message: "Auth env variable name:",
      when: (input) => input.provider === "Other" && input.otherAuthType !== "none",
      default: "OTHER_API_KEY"
    },
    {
      type: "input",
      name: "otherHeader",
      message: "Header name for header_env auth:",
      when: (input) => input.provider === "Other" && input.otherAuthType === "header_env",
      default: "x-api-key"
    },
    {
      type: "input",
      name: "otherQueryParam",
      message: "Query param for query_env auth:",
      when: (input) => input.provider === "Other" && input.otherAuthType === "query_env",
      default: "key"
    }
  ]);

  const list = (value: string): string[] =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  initWorkspace({
    workspacePath: workspace,
    agentName: answers.agentName,
    role: answers.role,
    domain: answers.domain,
    primaryTasks: list(answers.primaryTasks),
    stakeholders: list(answers.stakeholders),
    riskTier: answers.riskTier,
    channels: list(answers.channels),
    tools: list(answers.tools)
  });

  // sanity: ensure mapping still spans all questions
  if (questionIds.length !== 67) {
    throw new Error(`Question bank invalid during quickstart: expected 67 got ${questionIds.length}`);
  }

  let gatewayConfig: GatewayConfig;
  if (answers.provider === "Other") {
    const authType = answers.otherAuthType ?? "none";
    const auth =
      authType === "bearer_env"
        ? { type: "bearer_env" as const, env: answers.otherEnvName ?? "OTHER_API_KEY" }
        : authType === "header_env"
          ? {
              type: "header_env" as const,
              header: answers.otherHeader ?? "x-api-key",
              env: answers.otherEnvName ?? "OTHER_API_KEY"
            }
          : authType === "query_env"
            ? {
                type: "query_env" as const,
                param: answers.otherQueryParam ?? "key",
                env: answers.otherEnvName ?? "OTHER_API_KEY"
              }
            : ({ type: "none" as const });

    gatewayConfig = {
      ...presetGatewayConfigForProvider("OpenAI"),
      upstreams: {
        other: {
          baseUrl: answers.otherBaseUrl ?? "https://example.com",
          auth,
          providerId: "custom"
        }
      },
      routes: [{ prefix: "/other", upstream: "other", stripPrefix: true, openaiCompatible: false }]
    };
  } else {
    try {
      gatewayConfig = presetGatewayConfigForProvider(answers.provider);
    } catch {
      const key = answers.provider
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
      gatewayConfig = {
        ...presetGatewayConfigForProvider("OpenAI"),
        upstreams: {
          [key.toLowerCase()]: {
            baseUrl: `\${${key}_BASE_URL}`,
            auth: { type: "bearer_env", env: `${key}_API_KEY` },
            providerId: key.toLowerCase()
          }
        },
        routes: [{ prefix: `/${key.toLowerCase()}`, upstream: key.toLowerCase(), stripPrefix: true, openaiCompatible: true }]
      };
    }
  }

  initGatewayConfig(workspace, gatewayConfig);

  const agentId = getWorkspacePaths(workspace).agentId;
  try {
    const agentCfg = loadAgentConfig(workspace, agentId);
    const primaryRoute = gatewayConfig.routes[0];
    if (primaryRoute) {
      const upstream = gatewayConfig.upstreams[primaryRoute.upstream];
      if (upstream) {
        const templateMap: Record<string, string> = {
          "OpenAI": "openai",
          "Azure OpenAI": "azure_openai",
          "xAI Grok": "xai_grok",
          Anthropic: "anthropic",
          Gemini: "gemini",
          OpenRouter: "openrouter",
          Groq: "groq",
          Mistral: "mistral",
          Cohere: "cohere",
          "Together AI": "together",
          Fireworks: "fireworks",
          Perplexity: "perplexity",
          DeepSeek: "deepseek",
          Qwen: "qwen",
          "Local OpenAI-compatible (vLLM/LM Studio/etc)": "local_openai",
          Other: "custom"
        };

        updateAgentProvider(workspace, agentId, {
          templateId: templateMap[answers.provider] ?? "custom",
          routePrefix: primaryRoute.prefix,
          upstreamId: primaryRoute.upstream,
          baseUrl: upstream.baseUrl,
          openaiCompatible: primaryRoute.openaiCompatible,
          auth: upstream.auth
        });
      }
    }
  } catch {
    // Quickstart should continue even if fleet agent config isn't present yet.
  }

  const doctor = runDoctor(workspace);
  const runtime = doctor.availableRuntimes[0] ?? "claude";
  const nextWrapCommand = `amc wrap ${runtime} -- <args...>`;
  const providerRoute = gatewayConfig.routes[0]?.prefix ?? "/openai";
  const nextGatewayCommand = "amc gateway start --config .amc/gateway.yaml";
  const nextSuperviseCommand = `amc supervise --route http://127.0.0.1:${gatewayConfig.listen.port}${providerRoute} -- <cmd...>`;

  const reportOutput = join(workspace, ".amc", "reports", "latest.md");
  const { runDiagnostic } = await import("./diagnostic/runner.js");
  await runDiagnostic({ workspace, window: "14d", targetName: "default" }, reportOutput);

  return {
    workspace,
    runtimeSuggestion: runtime,
    nextWrapCommand,
    nextGatewayCommand,
    nextSuperviseCommand,
    firstRunReport: reportOutput
  };
}
