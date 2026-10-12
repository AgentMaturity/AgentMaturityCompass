/**
 * Facts about one governed agent, read from AMC's own records for its AIBOM. Every file is read once; a signed file's
 * signature is checked over those same bytes, and facts are taken only from files whose signature verifies. Anything
 * AMC does not record is listed in `unknown`, never guessed. Prompts and datasets yield digests only.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { adapterAgentProfileSchema } from "../adapters/adapterConfigSchema.js";
import { adaptersConfigPath } from "../adapters/adapterConfigStore.js";
import { getAgentPaths } from "../fleet/paths.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { agentConfigSchema } from "../fleet/registry.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { promptLatestPackPath } from "../prompt/promptPolicyStore.js";
import { toolsConfigSchema } from "../toolhub/toolsSchema.js";
import { sha256Hex } from "../utils/hash.js";
import { amcVersion } from "../version.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

export interface SignedFileFact { path: string; sha256: string; signature: string }
export interface ToolFact { name: string; actionClass: string; mcp: { id: string; name: string; version?: string; transport?: string } | null }
export interface DigestFact { kind: "system-prompt" | "prompt-pack" | "dataset"; sha256: string }

export interface AgentFacts {
  agentId: string;
  workspaceId: string;
  agent: { role: string; domain: string; riskTier: string; providerTemplate: string; providerRoute: string; upstreamId: string } | null;
  models: Array<{ id: string; preferred: boolean; route: string }>;
  tools: ToolFact[];
  digests: DigestFact[];
  signedFiles: SignedFileFact[];
  runtime: { name: "agent-maturity-compass"; version: string };
  unknown: string[];
}

/** `.amc` folders that hold data, keys, logs or other agents' files rather than this agent's signed configuration. */
const SKIPPED_DIRS = new Set(["agents", "blobs", "bundles", "keys", "reports", "runs", "studio", "transparency", "imports", "quarantine"]);

/** Every `<file>.sig` beside its file under `.amc`, at most three levels deep, plus this agent's own signed files. */
function signedConfigPaths(workspace: string, agentRoot: string): string[] {
  const found = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth < 3 && !SKIPPED_DIRS.has(entry.name)) walk(path, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".sig") && existsSync(path.slice(0, -4))) found.add(path.slice(0, -4));
    }
  };
  walk(join(workspace, ".amc"), 1);
  if (agentRoot !== join(workspace, ".amc")) walk(agentRoot, 3);
  return [...found].sort();
}

/** Reads a regular file once; null when it is absent or not a regular file. */
function readOnce(path: string): Buffer | null {
  return existsSync(path) && lstatSync(path).isFile() ? readFileSync(path) : null;
}

/**
 * The signature status of `bytes`. AMC writes two signature files: `{ digestSha256, signature, envelope? }` (checked by
 * verifySignedFileWithAuditor) and `{ configSha256, signature }` (amc.config.yaml, gateway.yaml), both over the hex digest.
 */
function signatureOf(workspace: string, path: string, bytes: Buffer): string {
  const sigBytes = readOnce(`${path}.sig`);
  if (sigBytes === null) return "missing";
  let sig: { configSha256?: unknown; signature?: unknown } | null;
  try { sig = JSON.parse(sigBytes.toString("utf8")) as typeof sig; } catch { return "invalid: unreadable signature file"; }
  if (sig !== null && typeof sig.configSha256 === "string") {
    if (sig.configSha256 !== sha256Hex(bytes)) return "invalid: digest mismatch";
    return verifyHexDigestAny(sig.configSha256, String(sig.signature), getPublicKeyHistory(workspace, "auditor")) ? "verified" : "invalid: signature verify failed";
  }
  const check = verifySignedFileWithAuditor(workspace, path, bytes);
  return check.valid ? "verified" : `invalid: ${check.reason?.includes("\n") ? "unrecognised signature file" : check.reason ?? "unknown reason"}`;
}

/** Reads, verifies and records one signed file; returns the bytes only when its signature verifies over them. */
function signedFile(workspace: string, path: string, facts: SignedFileFact[]): Buffer | null {
  const bytes = readOnce(path);
  if (bytes === null) return null;
  const signature = signatureOf(workspace, path, bytes);
  facts.push({ path: relative(workspace, path).replaceAll("\\", "/"), sha256: sha256Hex(bytes), signature });
  return signature === "verified" ? bytes : null;
}

const parseYaml = <T>(bytes: Buffer, parse: (value: unknown) => T): T | null => {
  try { return parse(YAML.parse(bytes.toString("utf8")) as unknown); } catch { return null; }
};

function datasetDigests(agentRoot: string): DigestFact[] {
  const dir = join(agentRoot, "datasets");
  const out: DigestFact[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(join(current, entry.name));
      else if (entry.isFile()) out.push({ kind: "dataset", sha256: sha256Hex(readFileSync(join(current, entry.name))) });
    }
  };
  if (existsSync(dir) && lstatSync(dir).isDirectory()) walk(dir);
  return out;
}

export function collectAgentFacts(workspace: string, agentId: string): AgentFacts {
  const paths = getAgentPaths(workspace, agentId);
  const unknown: string[] = [];
  const signedFiles: SignedFileFact[] = [];
  const verified = new Map(signedConfigPaths(workspace, paths.rootDir).map(path => [path, signedFile(workspace, path, signedFiles)]));
  const why = (path: string, subject: string) => {
    const fact = signedFiles.find(file => file.path === relative(workspace, path).replaceAll("\\", "/"));
    unknown.push(fact ? `${subject}: ${fact.path} did not verify (${fact.signature.replace(/^invalid: /, "")})` : `${subject}: ${relative(workspace, path)} is missing`);
  };

  const agentBytes = verified.get(paths.agentConfig) ?? null;
  const config = agentBytes && parseYaml(agentBytes, value => agentConfigSchema.parse(value));
  if (!config) why(paths.agentConfig, "agent and provider");
  const agent = config ? { role: config.role, domain: config.domain, riskTier: config.riskTier, providerTemplate: config.provider.templateId,
    providerRoute: config.provider.routePrefix, upstreamId: config.provider.upstreamId } : null;

  // Only what the operator declared for this agent: the schema's defaults (a default model) are not a declaration.
  const adapterBytes = verified.get(adaptersConfigPath(workspace)) ?? null;
  const raw = adapterBytes && parseYaml(adapterBytes, value => (value as { adapters?: { perAgent?: Record<string, unknown> } })?.adapters?.perAgent?.[agentId]);
  const profile = raw && adapterAgentProfileSchema.safeParse(raw).success ? raw as { preferredModel?: string; preferredProviderRoute: string; modelAllowlist: string[] } : null;
  if (!adapterBytes) why(adaptersConfigPath(workspace), "models");
  else if (!profile) unknown.push("models: no model is declared for this agent in the signed adapters configuration");
  const modelIds = [...new Set([...(profile?.modelAllowlist ?? []), ...(profile?.preferredModel ? [profile.preferredModel] : [])])].sort();
  const models = modelIds.map(id => ({ id, preferred: id === profile?.preferredModel, route: profile!.preferredProviderRoute }));

  const toolsPath = join(workspace, ".amc", "tools.yaml");
  const toolsBytes = verified.get(toolsPath) ?? null;
  const toolsConfig = toolsBytes && parseYaml(toolsBytes, value => toolsConfigSchema.parse(value));
  if (!toolsConfig) why(toolsPath, "tools");
  const tools = (toolsConfig?.tools.allowedTools ?? []).map((tool): ToolFact => ({ name: tool.name, actionClass: tool.actionClass,
    mcp: tool.context?.kind === "mcp" ? tool.context.server : null }));

  const digests: DigestFact[] = [];
  for (const [kind, path] of [["system-prompt", paths.promptAddendum], ["prompt-pack", promptLatestPackPath(workspace, agentId)]] as const) {
    const bytes = readOnce(path);
    if (bytes) digests.push({ kind, sha256: sha256Hex(bytes) });
  }
  const datasets = datasetDigests(paths.rootDir);
  digests.push(...datasets);
  unknown.push(datasets.length === 0 ? "datasets: none declared" : "dataset provenance: none declared");
  unknown.push("agent-maturity-compass: package digest");

  return { agentId, workspaceId: workspaceIdFromDirectory(workspace), agent, models, tools, digests, signedFiles,
    runtime: { name: "agent-maturity-compass", version: amcVersion }, unknown };
}
