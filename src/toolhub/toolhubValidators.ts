import { nativeSandboxPermitMatches, type NativeSandboxValidationPermit } from "../sandbox/nativeSandboxBinding.js";
import { readFileSync } from "node:fs";
import { protectedPathReason } from "./protectedPaths.js";
import {
  BINARY_ARGUMENTS,
  COMMAND_ARGUMENTS,
  PATH_ARGUMENTS,
  URL_ARGUMENTS,
  argumentStrings
} from "./toolArgumentRoles.js";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import YAML from "yaml";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultToolsConfig, toolsConfigSchema, type ToolDefinition, type ToolsConfig } from "./toolsSchema.js";

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

interface VerifiedToolsConfigBytes {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  digestSha256: string | null;
  bytes: Buffer | null;
}

export interface VerifiedToolsConfigSnapshot {
  signatureValid: boolean;
  signatureExists: boolean;
  reason: string | null;
  digestSha256: string | null;
  config: ToolsConfig | null;
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
  const bytes = readFileSync(file);
  // Validate and sign the same snapshot; never endorse malformed edited grants.
  toolsConfigSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const digest = sha256Hex(bytes);
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

function verifyToolsConfigBytes(workspace: string, explicitPath?: string): VerifiedToolsConfigBytes {
  const path = explicitPath ? resolve(workspace, explicitPath) : toolsConfigPath(workspace);
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "tools config missing",
      digestSha256: null,
      bytes: null
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "tools config signature missing",
      digestSha256: null,
      bytes: null
    };
  }
  try {
    const bytes = readFileSync(path);
    const sig = JSON.parse(readUtf8(sigPath)) as SignedDigest;
    const digest = sha256Hex(bytes);
    if (digest !== sig.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "digest mismatch",
        digestSha256: digest,
        bytes: null
      };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      digestSha256: digest,
      bytes: valid ? bytes : null
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      digestSha256: null,
      bytes: null
    };
  }
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
  const verification = verifyToolsConfigBytes(workspace, explicitPath);
  return {
    valid: verification.valid,
    signatureExists: verification.signatureExists,
    reason: verification.reason,
    path,
    sigPath
  };
}

export function loadVerifiedToolsConfigSnapshot(workspace: string, explicitPath?: string): VerifiedToolsConfigSnapshot {
  const verification = verifyToolsConfigBytes(workspace, explicitPath);
  if (!verification.valid || !verification.bytes) {
    return {
      signatureValid: false,
      signatureExists: verification.signatureExists,
      reason: verification.reason,
      digestSha256: verification.digestSha256,
      config: null
    };
  }
  try {
    return {
      signatureValid: true,
      signatureExists: true,
      reason: null,
      digestSha256: verification.digestSha256,
      config: toolsConfigSchema.parse(YAML.parse(verification.bytes.toString("utf8")) as unknown)
    };
  } catch {
    return {
      signatureValid: true,
      signatureExists: true,
      reason: "tools config schema invalid",
      digestSha256: verification.digestSha256,
      config: null
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

function normalizePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/");
}

export function pathAllowedByPatterns(workspace: string, candidatePath: string, allow: string[] = [], deny: string[] = []): {
  ok: boolean;
  reason?: string;
  resolvedPath: string;
} {
  const resolvedPath = resolve(candidatePath);
  // The floor, before any allow or deny list is consulted. Named and exported
  // now (see protectedPaths.ts) so it can be printed and audited, and still
  // unconditional: a config that omits it does not lower it.
  const protectedReason = protectedPathReason(workspace, resolvedPath);
  if (protectedReason !== null) {
    return { ok: false, reason: protectedReason, resolvedPath };
  }

  const relativePath = relative(workspace, resolvedPath);
  const rel = relativePath ? normalize(relativePath).replace(/\\/g, "/") : "";
  const relWithDot = rel ? (rel.startsWith(".") ? rel : `./${rel}`) : "./";

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

function argvAllowed(tool: ToolDefinition, argv: string[]): { ok: boolean; reason?: string } {
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

/**
 * The one pattern a working directory must match, for every tool.
 *
 * `./` + globstar is doing more than it looks like, and all of it was measured
 * rather than assumed:
 *
 *   cwd          allow          deny            result
 *   ../etc       "./"+globstar  none            denied  (outside the workspace)
 *   .git/hooks   "./"+globstar  none            denied  (leading dot never matches)
 *   src          "./"+globstar  none            allowed
 *   ../etc       bare globstar  a .git pattern  ALLOWED (an escape!)
 *   .git/hooks   bare globstar  a .git pattern  ALLOWED (the deny never fires)
 *
 * So there is deliberately NO deny list here. An earlier version carried
 * patterns for `.amc` and `.git`, and neither ever fired: `.amc` is refused
 * unconditionally inside `pathAllowedByPatterns`, and a `.git` pattern of the
 * globstar-slash form needs a segment before `.git` that a workspace-relative
 * path does not have. A deny list that cannot fire is the same
 * dead-config-reading-as-policy this rewrite exists to remove — worse here,
 * because widening the allow pattern to a bare globstar to "make the deny
 * work" would have opened an escape.
 */
const CWD_ALLOW_PATTERNS = ["./**"];

/**
 * Validate one call against the policy the tool DECLARED.
 *
 * Every check here runs because the tool's signed entry declares the
 * corresponding policy, never because of what the tool is called. That is the
 * whole point of the rewrite: name-keying made this function a policy about
 * four identifiers, and a capability under a fifth name went unchecked.
 *
 * FAIL CLOSED ON A DECLARED-BUT-UNCHECKABLE POLICY. If an entry declares a
 * path policy and the call names no path, the call is DENIED rather than
 * allowed. A declared policy that cannot be evaluated has not been satisfied,
 * and "we could not tell" is not a reason to proceed — it is the same rule the
 * egress guard applies to a network call with no parseable host.
 */
export function validateToolRequest(input: {
  workspace: string;
  tool: ToolDefinition;
  args: Record<string, unknown>;
  nativeSandboxPermit?: NativeSandboxValidationPermit;
}): { ok: boolean; reason?: string } {
  if (input.tool.nativeSandbox && !nativeSandboxPermitMatches(input.nativeSandboxPermit, input.workspace, input.tool, input.args)) {
    return { ok: false, reason: "nativeSandbox requires the bound native Linux Bubblewrap shell; this caller cannot enforce it" };
  }
  // The invariant, first and for every tool. This replaces a branch that
  // applied a hardcoded glob list to `git.*` alone — protection three tools
  // happened to get because of how they were named.
  const cwdValue = input.args.cwd;
  if (typeof cwdValue === "string" && cwdValue.length > 0) {
    const cwdResult = pathAllowedByPatterns(
      input.workspace,
      resolve(input.workspace, cwdValue),
      CWD_ALLOW_PATTERNS,
      []
    );
    if (!cwdResult.ok) {
      return { ok: false, reason: `working directory not allowed: ${cwdResult.reason ?? cwdValue}` };
    }
  }

  const allowPaths = input.tool.allow?.paths ?? [];
  const denyPaths = input.tool.deny?.paths ?? [];
  if (allowPaths.length > 0 || denyPaths.length > 0) {
    const paths = argumentStrings(input.args, PATH_ARGUMENTS);
    if (paths.length === 0) {
      return { ok: false, reason: "path is required" };
    }
    for (const candidate of paths) {
      const pathResult = pathAllowedByPatterns(
        input.workspace,
        resolve(input.workspace, candidate),
        allowPaths,
        denyPaths
      );
      if (!pathResult.ok) {
        return { ok: false, reason: pathResult.reason };
      }
    }
  }

  const hostAllowlist = input.tool.allow?.hostAllowlist ?? [];
  if (hostAllowlist.length > 0 || input.tool.denyByDefault === true) {
    const urls = argumentStrings(input.args, URL_ARGUMENTS);
    if (urls.length === 0) {
      return { ok: false, reason: "url is required" };
    }
    for (const urlText of urls) {
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
  }

  const binaries = input.tool.allow?.binariesAllowlist ?? [];
  if (binaries.length > 0) {
    const named = argumentStrings(input.args, BINARY_ARGUMENTS);
    if (named.length === 0) {
      return { ok: false, reason: "binary is required" };
    }
    for (const binary of named) {
      if (!binaryAllowedForTool(input.tool, binary)) {
        return { ok: false, reason: `binary not allowed: ${binary}` };
      }
    }
  }

  const denyPatterns = input.tool.deny?.argvRegexDenylist ?? [];
  if (denyPatterns.length > 0) {
    // Every string the call carries under a command-ish role, joined. A deny
    // pattern cares what the process is being asked to do, not whether the
    // caller spelled it as `argv: [...]` or `command: "..."`.
    const commandText = argumentStrings(input.args, COMMAND_ARGUMENTS);
    if (commandText.length === 0) {
      return { ok: false, reason: "a command is required" };
    }
    const argvCheck = argvAllowed(input.tool, commandText);
    if (!argvCheck.ok) {
      return { ok: false, reason: argvCheck.reason };
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
