import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import YAML from "yaml";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultToolsConfig, toolsConfigSchema, type ToolDefinition, type ToolsConfig } from "./toolsSchema.js";
import { vaultPaths } from "../vault/vault.js";

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::GLOBSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::GLOBSTAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function toolsConfigPath(workspace: string): string {
  return join(workspace, ".amc", "tools.yaml");
}

export function toolsConfigSigPath(workspace: string): string {
  return `${toolsConfigPath(workspace)}.sig`;
}

export function loadToolsConfig(workspace: string, explicitPath?: string): ToolsConfig {
  const file = explicitPath ? resolve(workspace, explicitPath) : toolsConfigPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Tools config not found: ${file}`);
  }
  return toolsConfigSchema.parse(YAML.parse(readUtf8(file)) as unknown);
}

export function signToolsConfig(workspace: string, explicitPath?: string): string {
  const file = explicitPath ? resolve(workspace, explicitPath) : toolsConfigPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Tools config not found: ${file}`);
  }
  const digest = sha256Hex(readFileSync(file));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const payload: SignedDigest = {
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = `${file}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function verifyToolsConfigSignature(workspace: string, explicitPath?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = explicitPath ? resolve(workspace, explicitPath) : toolsConfigPath(workspace);
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "tools config missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "tools config signature missing", path, sigPath };
  }
  try {
    const sig = JSON.parse(readUtf8(sigPath)) as SignedDigest;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      path,
      sigPath
    };
  }
}

export function initToolsConfig(workspace: string, config?: ToolsConfig): {
  configPath: string;
  sigPath: string;
} {
  ensureDir(join(workspace, ".amc"));
  const parsed = toolsConfigSchema.parse(config ?? defaultToolsConfig());
  const configPath = toolsConfigPath(workspace);
  writeFileAtomic(configPath, YAML.stringify(parsed), 0o644);
  const sigPath = signToolsConfig(workspace);
  return {
    configPath,
    sigPath
  };
}

export function listAllowedTools(workspace: string): ToolDefinition[] {
  return loadToolsConfig(workspace).tools.allowedTools;
}

export function findToolDefinition(config: ToolsConfig, toolName: string): ToolDefinition | null {
  return config.tools.allowedTools.find((tool) => tool.name === toolName) ?? null;
}

function isDeniedProtectedPath(workspace: string, candidate: string): boolean {
  const resolved = resolve(candidate);
  const amcRoot = resolve(join(workspace, ".amc"));
  const vaultFile = resolve(vaultPaths(workspace).vaultFile);
  return resolved.startsWith(amcRoot) || resolved === vaultFile;
}

function normalizePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/");
}

export function pathAllowedByPatterns(workspace: string, candidatePath: string, allow: string[] = [], deny: string[] = []): {
  ok: boolean;
  reason?: string;
  resolvedPath: string;
} {
  const resolvedPath = resolve(candidatePath);
  if (isDeniedProtectedPath(workspace, resolvedPath)) {
    return { ok: false, reason: "access to .amc/vault paths is always denied", resolvedPath };
  }

  const rel = normalize(relative(workspace, resolvedPath)).replace(/\\/g, "/");
  const relWithDot = rel.startsWith(".") ? rel : `./${rel}`;

  if (allow.length > 0) {
    const allowed = allow.some((pattern) => globToRegex(normalizePattern(pattern)).test(relWithDot));
    if (!allowed) {
      return { ok: false, reason: `path '${relWithDot}' not in allowlist`, resolvedPath };
    }
  }

  if (deny.length > 0) {
    const denied = deny.some((pattern) => globToRegex(normalizePattern(pattern)).test(relWithDot));
    if (denied) {
      return { ok: false, reason: `path '${relWithDot}' blocked by denylist`, resolvedPath };
    }
  }

  return { ok: true, resolvedPath };
}

export function hostAllowedForTool(tool: ToolDefinition, hostname: string): boolean {
  const host = hostname.toLowerCase();
  const list = tool.allow?.hostAllowlist ?? [];
  if ((tool.denyByDefault ?? false) || list.length > 0) {
    return list.some((entry) => {
      const normalized = entry.toLowerCase();
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  }
  return true;
}

export function binaryAllowedForTool(tool: ToolDefinition, binary: string): boolean {
  const allow = tool.allow?.binariesAllowlist ?? [];
  if (allow.length === 0) {
    return true;
  }
  return allow.includes(binary);
}

export function argvAllowed(tool: ToolDefinition, argv: string[]): { ok: boolean; reason?: string } {
  const joined = argv.join(" ");
  const denyRegex = tool.deny?.argvRegexDenylist ?? [];
  for (const pattern of denyRegex) {
    try {
      const re = new RegExp(pattern, "i");
      if (re.test(joined)) {
        return { ok: false, reason: `argv blocked by deny pattern: ${pattern}` };
      }
    } catch {
      continue;
    }
  }
  return { ok: true };
}

export function validateToolRequest(input: {
  workspace: string;
  tool: ToolDefinition;
  args: Record<string, unknown>;
}): { ok: boolean; reason?: string } {
  const cwd = resolve(input.workspace, String(input.args.cwd ?? input.workspace));

  if (input.tool.name === "fs.read" || input.tool.name === "fs.write") {
    const pathValue = String(input.args.path ?? "");
    if (!pathValue) {
      return { ok: false, reason: "path is required" };
    }
    const pathResult = pathAllowedByPatterns(
      input.workspace,
      resolve(input.workspace, pathValue),
      input.tool.allow?.paths ?? [],
      input.tool.deny?.paths ?? []
    );
    if (!pathResult.ok) {
      return { ok: false, reason: pathResult.reason };
    }
  }

  if (input.tool.name === "http.fetch") {
    const urlText = String(input.args.url ?? "");
    if (!urlText) {
      return { ok: false, reason: "url is required" };
    }
    let host = "";
    try {
      host = new URL(urlText).hostname;
    } catch {
      return { ok: false, reason: "invalid url" };
    }
    if (!hostAllowedForTool(input.tool, host)) {
      return { ok: false, reason: `host not allowed by tool policy: ${host}` };
    }
  }

  if (input.tool.name === "process.spawn") {
    const binary = String(input.args.binary ?? "");
    const argv = Array.isArray(input.args.argv) ? input.args.argv.map(String) : [];
    if (!binary) {
      return { ok: false, reason: "binary is required" };
    }
    if (!binaryAllowedForTool(input.tool, binary)) {
      return { ok: false, reason: `binary not allowed: ${binary}` };
    }
    const argvCheck = argvAllowed(input.tool, [binary, ...argv]);
    if (!argvCheck.ok) {
      return { ok: false, reason: argvCheck.reason };
    }
  }

  if (input.tool.name.startsWith("git.")) {
    const pathResult = pathAllowedByPatterns(input.workspace, cwd, ["./workspace/**", "./**"], ["**/.amc/**"]);
    if (!pathResult.ok) {
      return { ok: false, reason: pathResult.reason };
    }
  }

  return { ok: true };
}

export function resolveToolPath(workspace: string, value: string): string {
  if (isAbsolute(value)) {
    return normalize(value);
  }
  return normalize(resolve(workspace, value));
}
