import { defaultAgentArtifactBodies, defaultAgentContextGraph as defaultContextGraph, scaffoldAgentForAddAsync } from "./agentScaffoldPublication.js";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { z } from "zod";
import { captureRawConfigPair, captureRawConfigPairForAsync, verifyRawConfigSignature, type ConfigSignaturePairOptions } from "../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { assertOwnerMode } from "../mode/mode.js";
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

export { scaffoldAgentAsync } from "./agentScaffoldPublication.js";

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

function writeSignedFile(workspace: string, filePath: string, content: string): string {
  return captureRawConfigPair(workspace, filePath, Buffer.from(content, "utf8")).publishSync().sigPath;
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
    const pair = captureOrgPairs([filePath]), body = orgPairBytes(pair, filePath), sidecar = orgPairBytes(pair, sigPath);
    if (body === null || sidecar === null) throw new Error("config pair changed while reading");
    const value: unknown = JSON.parse(sidecar.toString("utf8"));
    if (value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "envelope")) throw new Error("raw config signature does not carry an envelope");
    const sig = signatureSchema.parse(value), digest = sha256Hex(body);
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", sigPath };
    }
    const ok = verifyRawConfigSignature(workspace, digest, sig.signature);
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
  assertOwnerMode(workspace, "fleet init");
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
  const prepared = captureRawConfigPair(workspace, fleetPath, Buffer.from(YAML.stringify(merged)),
    { beforePublish() { assertOwnerMode(workspace, "fleet init"); } });
  const signed = prepared.prepareSync(); signed.assertCurrent();
  ensureDir(fleetAgentsDir(workspace));
  const signaturePath = signed.publish().sigPath;
  return { fleetPath, signaturePath, fleet: merged };
}

export async function initFleetAsync(workspace: string, config?: Partial<FleetConfig>): Promise<{ fleetPath: string; signaturePath: string; fleet: FleetConfig }> {
  assertOwnerMode(workspace, "fleet init");
  const base = defaultFleetConfig(), copied = structuredClone(config ?? {});
  const fleet = fleetSchema.parse({ ...base, ...copied, globalPolicies: { ...base.globalPolicies, ...copied.globalPolicies } });
  const prepared = await prepareFleetConfigPair(workspace, Buffer.from(YAML.stringify(fleet)),
    { beforePublish() { assertOwnerMode(workspace, "fleet init"); } });
  prepared.assertCurrent(); ensureDir(fleetAgentsDir(workspace));
  const result = prepared.publish();
  return { fleetPath: result.path, signaturePath: result.sigPath, fleet };
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
  if (!pathExists(path)) throw new Error(`Fleet config not found: ${path}`);
  const previous = captureOrgPairs([path]), raw = orgPairBytes(previous, path);
  if (raw === null) throw new Error(`Fleet config not found: ${path}`);
  return captureRawConfigPair(workspace, path, Buffer.from(raw.toString("utf8")), { previous }).publishSync();
}
/** Retains the fleet writer's original body replacement and four-field raw sidecar. */
export function prepareFleetConfigPair(workspace: string, replacement?: Uint8Array, options: ConfigSignaturePairOptions = {}) {
  const file = fleetConfigPath(workspace), previous = options.previous ?? captureOrgPairs([file]);
  const bytes = replacement === undefined ? orgPairBytes(previous, file) : Buffer.from(replacement);
  if (bytes === null) throw new Error(`Fleet config not found: ${file}`);
  return captureRawConfigPairForAsync(workspace, file, Buffer.from(bytes.toString("utf8")), { ...options, previous }).prepare();
}
export async function signFleetConfigAsync(workspace: string): Promise<{ path: string; sigPath: string }> {
  return (await prepareFleetConfigPair(workspace)).publish();
}

function defaultAgentArtifacts(paths: ReturnType<typeof getAgentPaths>): void {
  for (const row of defaultAgentArtifactBodies(paths)) if (!pathExists(row.path)) writeFileAtomic(row.path, row.bytes, 0o644);
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

export async function saveAgentConfigAsync(workspace: string, config: AgentConfig): Promise<{ configPath: string; sigPath: string }> {
  const copied = structuredClone(config), paths = getAgentPaths(workspace, copied.id);
  const prepared = await captureRawConfigPairForAsync(workspace, paths.agentConfig, Buffer.from(YAML.stringify(copied)), {
    beforePublish() { if (getAgentPaths(workspace, copied.id).agentConfig !== paths.agentConfig) throw new Error("agent config selection changed while signing"); }
  }).prepare();
  const result = prepared.publish(); return { configPath: result.path, sigPath: result.sigPath };
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

export function signAgentConfig(workspace: string, agentId?: string): { configPath: string; sigPath: string } {
  const paths = getAgentPaths(workspace, agentId), previous = captureOrgPairs([paths.agentConfig]), raw = orgPairBytes(previous, paths.agentConfig);
  if (raw === null) throw new Error(`Agent config not found: ${paths.agentConfig}`);
  const sigPath = captureRawConfigPair(workspace, paths.agentConfig, Buffer.from(raw.toString("utf8")), { previous,
    beforePublish() { if (getAgentPaths(workspace, agentId).agentConfig !== paths.agentConfig) throw new Error("agent config selection changed while signing"); }
  }).publishSync().sigPath;
  return { configPath: paths.agentConfig, sigPath };
}
export function prepareAgentConfigPair(workspace: string, agentId?: string, options: ConfigSignaturePairOptions = {}) {
  const paths = getAgentPaths(workspace, agentId), previous = options.previous ?? captureOrgPairs([paths.agentConfig]), raw = orgPairBytes(previous, paths.agentConfig);
  if (raw === null) throw new Error(`Agent config not found: ${paths.agentConfig}`);
  const caller = options.beforePublish;
  return captureRawConfigPairForAsync(workspace, paths.agentConfig, Buffer.from(raw.toString("utf8")), { previous, beforePublish() {
    caller?.();
    if (getAgentPaths(workspace, agentId).agentConfig !== paths.agentConfig) throw new Error("agent config selection changed while signing");
  } }).prepare();
}
export async function signAgentConfigAsync(workspace: string, agentId?: string): Promise<{ configPath: string; sigPath: string }> {
  const result = (await prepareAgentConfigPair(workspace, agentId)).publish();
  return { configPath: result.path, sigPath: result.sigPath };
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
    try {
      const paths = getAgentPaths(workspace, id);
      const hasConfig = pathExists(paths.agentConfig);
      const signed = hasConfig ? verifyAgentConfigSignature(workspace, id).valid : false;
      return {
        id,
        hasConfig,
        configSigned: signed
      };
    } catch {
      // Skip agents with corrupt configs
      return {
        id,
        hasConfig: false,
        configSigned: false
      };
    }
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
  assertOwnerMode(workspace, "agent add");
  const fleetFile = fleetConfigPath(workspace), fleetBefore = captureOrgFiles([fleetFile]);
  const selectionBefore = captureOrgFiles([currentAgentPath(workspace)]);
  const fleetBytes = orgPairBytes(fleetBefore, fleetFile);
  const fleet = fleetBytes === null ? defaultFleetConfig() : fleetSchema.parse(YAML.parse(fleetBytes.toString("utf8")));
  const assertStableInputs = () => { assertOwnerMode(workspace, "agent add"); assertOrgPairsCurrent(fleetBefore); };
  const assertOriginalInputs = () => { assertStableInputs(); assertOrgPairsCurrent(selectionBefore); };
  assertOriginalInputs();
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

  assertOriginalInputs();
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

  const scaffolding = await scaffoldAgentForAddAsync(workspace, config, assertStableInputs, selectionBefore);
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
