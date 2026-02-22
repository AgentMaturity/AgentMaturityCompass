import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { createSignedTargetProfile, defaultTargetMapping, saveTargetProfile } from "../targets/targetProfile.js";
import type { RiskTier, TrustTier } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getProviderTemplateById, providerTemplateChoices } from "../providers/providerTemplates.js";
import {
  agentRoot,
  currentAgentPath,
  fleetAgentsDir,
  fleetConfigPath,
  fleetConfigSigPath,
  getAgentPaths,
  getCurrentAgent,
  normalizeAgentId,
  resolveAgentId,
  setCurrentAgent
} from "./paths.js";

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bearer_env"), env: z.string().min(1) }),
  z.object({ type: z.literal("header_env"), header: z.string().min(1), env: z.string().min(1) }),
  z.object({ type: z.literal("query_env"), param: z.string().min(1), env: z.string().min(1) }),
  z.object({ type: z.literal("none") })
]);

export const fleetSchema = z.object({
  orgName: z.string().min(1),
  globalPolicies: z.object({
    privacy: z.string().min(1),
    retention: z.string().min(1),
    redaction: z.string().min(1)
  }),
  defaultRiskTier: z.enum(["low", "med", "high", "critical"]),
  allowedUpstreams: z.array(z.string()).default([]),
  mandatoryTrustTierForLevel5: z.enum(["OBSERVED", "ATTESTED", "SELF_REPORTED"]).default("OBSERVED")
});

export type FleetConfig = z.infer<typeof fleetSchema>;

export const fleetEnvironmentSchema = z.enum(["development", "staging", "production"]);
export type FleetEnvironment = z.infer<typeof fleetEnvironmentSchema>;

export const agentConfigSchema = z.object({
  id: z.string().min(1),
  agentName: z.string().min(1),
  role: z.string().min(1),
  domain: z.string().min(1),
  primaryTasks: z.array(z.string()).min(1),
  stakeholders: z.array(z.string()).min(1),
  riskTier: z.enum(["low", "med", "high", "critical"]),
  provider: z.object({
    templateId: z.string().min(1),
    routePrefix: z.string().startsWith("/"),
    upstreamId: z.string().min(1),
    baseUrl: z.string().min(1),
    openaiCompatible: z.boolean(),
    auth: authSchema
  }),
  environment: fleetEnvironmentSchema.default("development"),
  createdTs: z.number(),
  updatedTs: z.number()
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

const signatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number(),
  signer: z.literal("auditor")
});

function signDigest(workspace: string, digest: string): string {
  return signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
}

function writeSignedFile(workspace: string, filePath: string, content: string): string {
  writeFileAtomic(filePath, content, 0o644);
  const digest = sha256Hex(Buffer.from(content, "utf8"));
  const payload = {
    digestSha256: digest,
    signature: signDigest(workspace, digest),
    signedTs: Date.now(),
    signer: "auditor" as const
  };
  const sigPath = `${filePath}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

function verifySignedFile(workspace: string, filePath: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  sigPath: string;
} {
  const sigPath = `${filePath}.sig`;
  if (!pathExists(filePath)) {
    return { valid: false, signatureExists: false, reason: "file missing", sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "signature missing", sigPath };
  }
  try {
    const sig = signatureSchema.parse(JSON.parse(readFileSync(sigPath, "utf8")) as unknown);
    const digest = sha256Hex(readFileSync(filePath));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", sigPath };
    }
    const keys = getPublicKeyHistory(workspace, "auditor");
    const ok = verifyHexDigestAny(digest, sig.signature, keys);
    return { valid: ok, signatureExists: true, reason: ok ? null : "signature verify failed", sigPath };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      sigPath
    };
  }
}

export function defaultFleetConfig(orgName = "AMC Fleet"): FleetConfig {
  return {
    orgName,
    globalPolicies: {
      privacy: "minimum data necessary; redact secrets by default",
      retention: "retain verified evidence for at least 90 days",
      redaction: "redact auth headers, key-like tokens, and sensitive payload fields"
    },
    defaultRiskTier: "med",
    allowedUpstreams: [],
    mandatoryTrustTierForLevel5: "OBSERVED"
  };
}

export function initFleet(workspace: string, config?: Partial<FleetConfig>): {
  fleetPath: string;
  signaturePath: string;
  fleet: FleetConfig;
} {
  ensureDir(join(workspace, ".amc"));
  ensureDir(fleetAgentsDir(workspace));
  const base = defaultFleetConfig();
  const merged = fleetSchema.parse({
    ...base,
    ...(config ?? {}),
    globalPolicies: {
      ...base.globalPolicies,
      ...(config?.globalPolicies ?? {})
    }
  });
  const fleetPath = fleetConfigPath(workspace);
  const signaturePath = writeSignedFile(workspace, fleetPath, YAML.stringify(merged));
  return { fleetPath, signaturePath, fleet: merged };
}

export function loadFleetConfig(workspace: string): FleetConfig {
  const file = fleetConfigPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Fleet config not found: ${file}`);
  }
  const raw = YAML.parse(readFileSync(file, "utf8")) as unknown;
  return fleetSchema.parse(raw);
}

export function verifyFleetConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = fleetConfigPath(workspace);
  const result = verifySignedFile(workspace, path);
  return {
    ...result,
    path,
    sigPath: result.sigPath
  };
}

export function signFleetConfig(workspace: string): { path: string; sigPath: string } {
  const path = fleetConfigPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`Fleet config not found: ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const sigPath = writeSignedFile(workspace, path, raw);
  return { path, sigPath };
}

function defaultAgentArtifacts(paths: ReturnType<typeof getAgentPaths>): void {
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
        "Use this structure for material outputs:",
        "1) Known facts [ev:<id>]",
        "2) Unknowns",
        "3) Assumptions",
        "4) Verification plan",
        "5) Escalation checkpoints"
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
}

function defaultContextGraph(params: {
  agentName: string;
  role: string;
  domain: string;
  primaryTasks: string[];
  stakeholders: string[];
  riskTier: RiskTier;
}): Record<string, unknown> {
  return {
    mission: `${params.agentName} (${params.role}) delivers reliable outcomes in ${params.domain}.`,
    successMetrics: [
      "verified task completion",
      "low contradiction rate",
      "stakeholder trust growth"
    ],
    constraints: [
      "No fabricated evidence",
      "Respect role boundaries and approvals",
      "Minimize sensitive data exposure"
    ],
    forbiddenActions: [
      "exfiltrate secrets",
      "bypass policy checks",
      "perform irreversible high-risk actions without consent"
    ],
    riskTier: params.riskTier,
    escalationRules: [
      "Escalate when confidence is low for high-risk actions",
      "Escalate on policy conflicts",
      "Escalate when required evidence is missing"
    ],
    entities: [
      { id: "goal-1", type: "Goal", label: "Reliable verified outcomes" },
      { id: "stakeholder-1", type: "Stakeholder", label: params.stakeholders.join(", ") },
      { id: "risk-1", type: "RiskTier", label: params.riskTier },
      { id: "tool-1", type: "Tool", label: "gateway, supervised runtime" },
      { id: "policy-1", type: "Policy", label: "Evidence-gated scoring" },
      { id: "constraint-1", type: "Constraint", label: "No unsupported claims" }
    ]
  };
}

export function buildAgentConfig(params: {
  agentId: string;
  agentName: string;
  role: string;
  domain: string;
  primaryTasks: string[];
  stakeholders: string[];
  riskTier: RiskTier;
  environment?: FleetEnvironment;
  templateId: string;
  baseUrl: string;
  routePrefix: string;
  auth:
    | { type: "bearer_env"; env: string }
    | { type: "header_env"; header: string; env: string }
    | { type: "query_env"; param: string; env: string }
    | { type: "none" };
}): AgentConfig {
  const template = getProviderTemplateById(params.templateId);
  const now = Date.now();
  return agentConfigSchema.parse({
    id: normalizeAgentId(params.agentId),
    agentName: params.agentName,
    role: params.role,
    domain: params.domain,
    primaryTasks: params.primaryTasks,
    stakeholders: params.stakeholders,
    riskTier: params.riskTier,
    provider: {
      templateId: template.id,
      routePrefix: params.routePrefix || template.routePrefix,
      upstreamId: template.id,
      baseUrl: params.baseUrl,
      openaiCompatible: template.openaiCompatible,
      auth: params.auth
    },
    environment: params.environment ?? "development",
    createdTs: now,
    updatedTs: now
  });
}

export function saveAgentConfig(workspace: string, config: AgentConfig): {
  configPath: string;
  sigPath: string;
} {
  const paths = getAgentPaths(workspace, config.id);
  ensureDir(paths.rootDir);
  const payload = YAML.stringify(config);
  const sigPath = writeSignedFile(workspace, paths.agentConfig, payload);
  return {
    configPath: paths.agentConfig,
    sigPath
  };
}

export function updateAgentProvider(
  workspace: string,
  agentId: string,
  provider: AgentConfig["provider"]
): {
  configPath: string;
  sigPath: string;
  config: AgentConfig;
} {
  const existing = loadAgentConfig(workspace, agentId);
  const next = agentConfigSchema.parse({
    ...existing,
    provider,
    updatedTs: Date.now()
  });
  const saved = saveAgentConfig(workspace, next);
  return {
    ...saved,
    config: next
  };
}

export function loadAgentConfig(workspace: string, agentId?: string): AgentConfig {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.agentConfig)) {
    throw new Error(`Agent config not found: ${paths.agentConfig}`);
  }
  const parsed = YAML.parse(readFileSync(paths.agentConfig, "utf8")) as unknown;
  return agentConfigSchema.parse(parsed);
}

export function verifyAgentConfigSignature(workspace: string, agentId?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  configPath: string;
  sigPath: string;
} {
  const paths = getAgentPaths(workspace, agentId);
  const result = verifySignedFile(workspace, paths.agentConfig);
  return {
    ...result,
    configPath: paths.agentConfig,
    sigPath: result.sigPath
  };
}

export function signAgentConfig(workspace: string, agentId?: string): {
  configPath: string;
  sigPath: string;
} {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.agentConfig)) {
    throw new Error(`Agent config not found: ${paths.agentConfig}`);
  }
  const raw = readFileSync(paths.agentConfig, "utf8");
  const sigPath = writeSignedFile(workspace, paths.agentConfig, raw);
  return {
    configPath: paths.agentConfig,
    sigPath
  };
}

export function scaffoldAgent(workspace: string, config: AgentConfig): {
  agentId: string;
  rootDir: string;
  targetPath: string;
  configPath: string;
  configSigPath: string;
} {
  const paths = getAgentPaths(workspace, config.id);
  ensureDir(paths.rootDir);
  ensureDir(paths.targetsDir);
  ensureDir(paths.runsDir);
  ensureDir(paths.reportsDir);
  ensureDir(paths.bundlesDir);

  if (!pathExists(paths.contextGraph)) {
    const graph = defaultContextGraph({
      agentName: config.agentName,
      role: config.role,
      domain: config.domain,
      primaryTasks: config.primaryTasks,
      stakeholders: config.stakeholders,
      riskTier: config.riskTier
    });
    writeFileAtomic(paths.contextGraph, JSON.stringify(graph, null, 2), 0o644);
  }

  defaultAgentArtifacts(paths);

  const contextHash = sha256Hex(canonicalize(JSON.parse(readFileSync(paths.contextGraph, "utf8")) as unknown));
  const target = createSignedTargetProfile({
    workspace,
    name: "default",
    contextGraphHash: contextHash,
    mapping: defaultTargetMapping(3)
  });
  const targetPath = saveTargetProfile(workspace, target, config.id);

  const saved = saveAgentConfig(workspace, config);
  return {
    agentId: config.id,
    rootDir: paths.rootDir,
    targetPath,
    configPath: saved.configPath,
    configSigPath: saved.sigPath
  };
}

export function listAgents(workspace: string): Array<{
  id: string;
  hasConfig: boolean;
  configSigned: boolean;
}> {
  const root = fleetAgentsDir(workspace);
  if (!pathExists(root)) {
    return [];
  }

  const ids = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return ids.map((id) => {
    const paths = getAgentPaths(workspace, id);
    const hasConfig = pathExists(paths.agentConfig);
    const signed = hasConfig ? verifyAgentConfigSignature(workspace, id).valid : false;
    return {
      id,
      hasConfig,
      configSigned: signed
    };
  });
}

export function removeAgent(workspace: string, agentId: string): void {
  const id = normalizeAgentId(agentId);
  const root = agentRoot(workspace, id);
  if (!pathExists(root)) {
    throw new Error(`Agent not found: ${id}`);
  }
  rmSync(root, { recursive: true, force: true });
  const current = pathExists(currentAgentPath(workspace)) ? readFileSync(currentAgentPath(workspace), "utf8").trim() : "";
  if (current === id) {
    writeFileAtomic(currentAgentPath(workspace), "default\n", 0o644);
  }
}

export function useAgent(workspace: string, agentId: string): void {
  const id = normalizeAgentId(agentId);
  const root = agentRoot(workspace, id);
  if (!pathExists(root)) {
    throw new Error(`Agent not found: ${id}`);
  }
  setCurrentAgent(workspace, id);
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function addAgentInteractive(workspace: string): Promise<{
  agentId: string;
  configPath: string;
  configSigPath: string;
  targetPath: string;
}> {
  const fleet = pathExists(fleetConfigPath(workspace)) ? loadFleetConfig(workspace) : defaultFleetConfig();
  const answer = await inquirer.prompt<{
    agentId: string;
    agentName: string;
    role: string;
    domain: string;
    primaryTasks: string;
    stakeholders: string;
    riskTier: RiskTier;
    templateId: string;
    baseUrl: string;
    routePrefix: string;
    authType: "bearer_env" | "header_env" | "query_env" | "none";
    authEnv: string;
    authHeader?: string;
    authParam?: string;
  }>([
    { type: "input", name: "agentId", message: "agentId (slug):", default: randomUUID().slice(0, 8) },
    { type: "input", name: "agentName", message: "Agent display name:", default: "New Agent" },
    { type: "input", name: "role", message: "Role:", default: "assistant" },
    { type: "input", name: "domain", message: "Domain:", default: "general" },
    { type: "input", name: "primaryTasks", message: "Primary tasks (comma-separated):", default: "analysis,delivery" },
    { type: "input", name: "stakeholders", message: "Stakeholders (comma-separated):", default: "owner,users" },
    { type: "list", name: "riskTier", message: "Risk tier:", choices: ["low", "med", "high", "critical"], default: fleet.defaultRiskTier },
    { type: "list", name: "templateId", message: "Provider template:", choices: providerTemplateChoices(), default: "openai" },
    {
      type: "input",
      name: "baseUrl",
      message: "Provider base URL:",
      default: (answers: { templateId?: string }) =>
        getProviderTemplateById(answers.templateId ?? "openai").defaultBaseUrl || "https://example.com"
    },
    {
      type: "input",
      name: "routePrefix",
      message: "Gateway route prefix:",
      default: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").routePrefix
    },
    {
      type: "list",
      name: "authType",
      message: "Auth injection strategy:",
      choices: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").authStrategies,
      default: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").defaultAuthStrategy
    },
    {
      type: "input",
      name: "authEnv",
      message: "Auth env variable:",
      default: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").defaultAuthEnv,
      when: (answers: { authType?: string }) => answers.authType !== "none"
    },
    {
      type: "input",
      name: "authHeader",
      message: "Header name for header_env:",
      default: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").defaultHeader ?? "x-api-key",
      when: (answers: { authType?: string }) => answers.authType === "header_env"
    },
    {
      type: "input",
      name: "authParam",
      message: "Query param name for query_env:",
      default: (answers: { templateId?: string }) => getProviderTemplateById(answers.templateId ?? "openai").defaultQueryParam ?? "key",
      when: (answers: { authType?: string }) => answers.authType === "query_env"
    }
  ]);

  const auth =
    answer.authType === "bearer_env"
      ? ({ type: "bearer_env", env: answer.authEnv || "API_KEY" } as const)
      : answer.authType === "header_env"
        ? ({ type: "header_env", header: answer.authHeader || "x-api-key", env: answer.authEnv || "API_KEY" } as const)
        : answer.authType === "query_env"
          ? ({ type: "query_env", param: answer.authParam || "key", env: answer.authEnv || "API_KEY" } as const)
          : ({ type: "none" } as const);

  const config = buildAgentConfig({
    agentId: answer.agentId,
    agentName: answer.agentName,
    role: answer.role,
    domain: answer.domain,
    primaryTasks: parseCsvList(answer.primaryTasks),
    stakeholders: parseCsvList(answer.stakeholders),
    riskTier: answer.riskTier,
    templateId: answer.templateId,
    baseUrl: answer.baseUrl,
    routePrefix: answer.routePrefix,
    auth
  });

  const scaffolding = scaffoldAgent(workspace, config);
  setCurrentAgent(workspace, config.id);
  return {
    agentId: scaffolding.agentId,
    configPath: scaffolding.configPath,
    configSigPath: scaffolding.configSigPath,
    targetPath: scaffolding.targetPath
  };
}

export function ensureDefaultFleetAgent(workspace: string): void {
  if (!pathExists(fleetConfigPath(workspace))) {
    initFleet(workspace);
  }
  if (!pathExists(agentRoot(workspace, "default"))) {
    const config = buildAgentConfig({
      agentId: "default",
      agentName: "Default Agent",
      role: "assistant",
      domain: "general",
      primaryTasks: ["support"],
      stakeholders: ["owner", "users"],
      riskTier: "med",
      templateId: "openai",
      baseUrl: "https://api.openai.com",
      routePrefix: "/openai",
      auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
    });
    scaffoldAgent(workspace, config);
  }
  if (!getCurrentAgent(workspace)) {
    setCurrentAgent(workspace, "default");
  }
}

export function mandatoryTrustTierForLevel5(workspace: string): TrustTier {
  try {
    return loadFleetConfig(workspace).mandatoryTrustTierForLevel5;
  } catch {
    return "OBSERVED";
  }
}
