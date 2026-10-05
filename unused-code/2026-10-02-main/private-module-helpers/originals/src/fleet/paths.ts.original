import { join, resolve } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export interface AgentPaths {
  agentId: string;
  scoped: boolean;
  rootDir: string;
  contextGraph: string;
  targetsDir: string;
  runsDir: string;
  reportsDir: string;
  bundlesDir: string;
  guardrails: string;
  promptAddendum: string;
  evalHarness: string;
  gatePolicy: string;
  gatePolicySig: string;
  agentConfig: string;
  agentConfigSig: string;
}

export function fleetRoot(workspace: string): string {
  return join(workspace, ".amc");
}

export function fleetAgentsDir(workspace: string): string {
  return join(fleetRoot(workspace), "agents");
}

export function fleetConfigPath(workspace: string): string {
  return join(fleetRoot(workspace), "fleet.yaml");
}

export function fleetConfigSigPath(workspace: string): string {
  return `${fleetConfigPath(workspace)}.sig`;
}

export function currentAgentPath(workspace: string): string {
  return join(fleetRoot(workspace), "current-agent");
}

export function normalizeAgentId(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) {
    throw new Error("agentId cannot be empty");
  }
  return cleaned;
}

export function getCurrentAgent(workspace: string): string | null {
  const file = currentAgentPath(workspace);
  if (!pathExists(file)) {
    return null;
  }
  const raw = readUtf8(file).trim();
  return raw.length > 0 ? raw : null;
}

export function setCurrentAgent(workspace: string, agentId: string): void {
  ensureDir(fleetRoot(workspace));
  writeFileAtomic(currentAgentPath(workspace), `${normalizeAgentId(agentId)}\n`, 0o644);
}

export function resolveAgentId(workspace: string, explicitAgentId?: string): string {
  if (explicitAgentId && explicitAgentId.trim().length > 0) {
    return normalizeAgentId(explicitAgentId);
  }

  if (process.env.AMC_AGENT_ID && process.env.AMC_AGENT_ID.trim().length > 0) {
    return normalizeAgentId(process.env.AMC_AGENT_ID);
  }

  const current = getCurrentAgent(workspace);
  if (current) {
    return normalizeAgentId(current);
  }

  return "default";
}

export function agentRoot(workspace: string, agentId: string): string {
  return join(fleetAgentsDir(workspace), normalizeAgentId(agentId));
}

export function hasAgentFolder(workspace: string, agentId: string): boolean {
  return pathExists(agentRoot(workspace, agentId));
}

function rootAgentPaths(workspace: string): AgentPaths {
  const amcRoot = fleetRoot(workspace);
  return {
    agentId: "default",
    scoped: false,
    rootDir: amcRoot,
    contextGraph: join(amcRoot, "context-graph.json"),
    targetsDir: join(amcRoot, "targets"),
    runsDir: join(amcRoot, "runs"),
    reportsDir: join(amcRoot, "reports"),
    bundlesDir: join(amcRoot, "bundles"),
    guardrails: join(amcRoot, "guardrails.yaml"),
    promptAddendum: join(amcRoot, "prompt-addendum.md"),
    evalHarness: join(amcRoot, "eval-harness.yaml"),
    gatePolicy: join(amcRoot, "gatePolicy.json"),
    gatePolicySig: join(amcRoot, "gatePolicy.json.sig"),
    agentConfig: join(amcRoot, "agent.config.yaml"),
    agentConfigSig: join(amcRoot, "agent.config.yaml.sig")
  };
}

function scopedAgentPaths(workspace: string, agentId: string): AgentPaths {
  const root = agentRoot(workspace, agentId);
  return {
    agentId: normalizeAgentId(agentId),
    scoped: true,
    rootDir: root,
    contextGraph: join(root, "context-graph.json"),
    targetsDir: join(root, "targets"),
    runsDir: join(root, "runs"),
    reportsDir: join(root, "reports"),
    bundlesDir: join(root, "bundles"),
    guardrails: join(root, "guardrails.yaml"),
    promptAddendum: join(root, "prompt-addendum.md"),
    evalHarness: join(root, "eval-harness.yaml"),
    gatePolicy: join(root, "gatePolicy.json"),
    gatePolicySig: join(root, "gatePolicy.json.sig"),
    agentConfig: join(root, "agent.config.yaml"),
    agentConfigSig: join(root, "agent.config.yaml.sig")
  };
}

export function getAgentPaths(workspace: string, explicitAgentId?: string): AgentPaths {
  const agentId = resolveAgentId(workspace, explicitAgentId);
  if (agentId === "default") {
    const rootPaths = rootAgentPaths(workspace);
    if (!hasAgentFolder(workspace, "default")) {
      return rootPaths;
    }
    const scopedPaths = scopedAgentPaths(workspace, "default");
    const scopedHasCoreConfig = pathExists(scopedPaths.agentConfig) || pathExists(scopedPaths.contextGraph);
    const rootHasLegacyConfig = pathExists(rootPaths.agentConfig) || pathExists(rootPaths.contextGraph);
    // Backward-compatible fallback: a partial scoped default folder (for example
    // created by ad-hoc file writes) should not break legacy root-scoped workspaces.
    if (!scopedHasCoreConfig && rootHasLegacyConfig) {
      return rootPaths;
    }
    return scopedPaths;
  }
  return scopedAgentPaths(workspace, agentId);
}

export function ensureAgentDirs(paths: AgentPaths): void {
  ensureDir(paths.rootDir);
  ensureDir(paths.targetsDir);
  ensureDir(paths.runsDir);
  ensureDir(paths.reportsDir);
  ensureDir(paths.bundlesDir);
}

export function resolvePathForAgent(workspace: string, pathFromRoot: string, explicitAgentId?: string): string {
  const paths = getAgentPaths(workspace, explicitAgentId);
  return resolve(paths.rootDir, pathFromRoot);
}
