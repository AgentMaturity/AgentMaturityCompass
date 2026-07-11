import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import {
  OBSERVED_AEP_HOOK_PATH,
  observedAepActionEventSchema,
  type ObservedAepActionEvent
} from "../bridge/hookIngress.js";
import {
  CONTROL_HOOK_PATH,
  CONTROL_HOOK_ROUTE,
  renderProviderControlResponse,
  verifyProviderHookControlResult,
  type HookControlDecision,
  type ProviderControlResponse,
  type ProviderHookControlResult,
} from "../bridge/hookControl.js";
import { redactBridgeText } from "../bridge/bridgeRedaction.js";
import {
  approvalPolicyPath,
  approvalPolicySigPath,
  initApprovalPolicy,
  verifyApprovalPolicySignature,
} from "../approvals/approvalPolicyEngine.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import {
  ensureLeaseRevocationStore,
  issueLeaseForCli,
  parseLeaseTtlToMs,
  revokeLeaseForCli
} from "../leases/leaseCli.js";
import { leasePayloadSchema, type LeasePayload } from "../leases/leaseSchema.js";
import { loadLeaseRevocations } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { writeFileAtomic } from "../utils/fs.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

export const CLAUDE_CODE_HOOK_SOURCE = {
  provider: "claude-code",
  contract: "Claude Code project-local PreToolUse command hook",
  url: "https://code.claude.com/docs/en/hooks.md",
  reference: "sha256:e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1"
} as const;

export const GEMINI_CLI_HOOK_SOURCE = {
  provider: "gemini-cli",
  contract: "Gemini CLI project BeforeTool command hook",
  url: "https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/docs/hooks/reference.md",
  reference: "f354eebaf43b25bacb176007e449bb9a638fd101"
} as const;

export const HOOK_INTEGRATION_ID = "amc-observe-v1";
export const HOOK_CONTROL_INTEGRATION_ID = "amc-control-v1";
export const MAX_PROVIDER_HOOK_INPUT_BYTES = 262_144;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_PROVIDER_CONFIG_BYTES = 4 * 1024 * 1024;
const STALE_INSTALL_LOCK_MS = 5 * 60_000;
const HOOK_TOKEN_MODE = 0o600;
const DEFAULT_BRIDGE_BASE = "http://127.0.0.1:3212";
const DEFAULT_HOOK_TTL = "7d";
const DEFAULT_HOOK_RPM = 120;
const CLAUDE_STATUS_MESSAGE = `AMC Observe [${HOOK_INTEGRATION_ID}]`;
const CLAUDE_CONTROL_STATUS_MESSAGE = `AMC Control [${HOOK_CONTROL_INTEGRATION_ID}]`;
const GITIGNORE_MARKER = "# AMC managed hook credentials";
const GITIGNORE_ENTRY = ".amc/hooks/";

export type HookProvider = "claude-code" | "gemini-cli";
export type HookMode = "observe" | "control";

export type HookIntegrationErrorCode =
  | "HOOK_PROVIDER_UNSUPPORTED"
  | "HOOK_AGENT_INVALID"
  | "HOOK_BRIDGE_INVALID"
  | "HOOK_BRIDGE_INSECURE"
  | "HOOK_CONTROL_REMOTE_UNSUPPORTED"
  | "HOOK_CONTROL_POLICY_INVALID"
  | "HOOK_CONFIG_INVALID"
  | "HOOK_CONFIG_AMBIGUOUS"
  | "HOOK_PATH_UNSAFE"
  | "HOOK_INSTALL_BUSY"
  | "HOOK_MANIFEST_INVALID"
  | "HOOK_OWNERSHIP_CONFLICT"
  | "HOOK_TOKEN_INVALID"
  | "HOOK_INPUT_TOO_LARGE"
  | "HOOK_INPUT_INVALID"
  | "HOOK_INPUT_AMBIGUOUS"
  | "HOOK_INPUT_UNSUPPORTED"
  | "HOOK_DELIVERY_FAILED";

export class HookIntegrationError extends Error {
  readonly code: HookIntegrationErrorCode;

  constructor(code: HookIntegrationErrorCode, message: string) {
    super(message);
    this.name = "HookIntegrationError";
    this.code = code;
  }
}

const hookProviderSchema = z.enum(["claude-code", "gemini-cli"]);
const hookModeSchema = z.enum(["observe", "control"]);
const sourceSchema = z.object({
  provider: hookProviderSchema,
  contract: z.string().min(1),
  url: z.string().url(),
  reference: z.string().min(1)
}).strict();

const manifestSchema = z.object({
  v: z.literal(1),
  installationId: z.enum([HOOK_INTEGRATION_ID, HOOK_CONTROL_INTEGRATION_ID]),
  mode: hookModeSchema.default("observe"),
  provider: hookProviderSchema,
  source: sourceSchema,
  configPath: z.string().min(1),
  ignorePath: z.string().min(1),
  tokenPath: z.string().min(1),
  agentId: z.string().min(1),
  bridgeBase: z.string().url(),
  leaseId: z.string().min(1),
  leaseIssuedTs: z.number().int(),
  leaseExpiresTs: z.number().int(),
  configExistedBefore: z.boolean(),
  ignoreExistedBefore: z.boolean(),
  ignoreBlockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  handlerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  installedTs: z.number().int(),
  updatedTs: z.number().int(),
  observation: z.object({
    eventType: z.literal("action.requested"),
    controlDecision: z.boolean(),
    rawProviderInputForwarded: z.literal(false),
    correlation: z.enum(["provider-call-id", "derived-event-id"])
  }).strict(),
  control: z.object({
    endpoint: z.literal(CONTROL_HOOK_ROUTE),
    localOnly: z.literal(true),
    rawInputTransport: z.literal("loopback-memory-only"),
    leaseScope: z.literal("hook:control"),
    providerOutcomes: z.array(z.enum(["allow", "deny", "ask"])).min(2)
  }).strict().nullable().default(null)
}).strict();

type HookManifest = z.infer<typeof manifestSchema>;
type JsonObject = Record<string, unknown>;

export interface HookFileChange {
  path: string;
  action: "create" | "update" | "delete" | "unchanged" | "would-create" | "would-update" | "would-delete";
  sensitive: boolean;
}

export interface HookMutationResult {
  operation: "install" | "remove";
  provider: HookProvider;
  mode: HookMode;
  source: typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE;
  dryRun: boolean;
  applied: boolean;
  changed: boolean;
  files: HookFileChange[];
  lease: {
    scope: "hook:observe";
    scopes: Array<"hook:observe" | "hook:control">;
    route: "/hooks";
    leaseId: string | null;
    expiresTs: number | null;
  };
  limitations: string[];
}

export interface HookIntegrationStatus {
  provider: HookProvider;
  agentId: string | null;
  mode: HookMode | null;
  state: "not-installed" | "installed" | "drifted" | "expired" | "invalid";
  source: typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE;
  configOwned: boolean;
  manifestValid: boolean;
  leaseValid: boolean;
  leaseId: string | null;
  expiresTs: number | null;
  issues: string[];
  files: {
    config: string;
    ignore: string;
    token: string;
    manifest: string;
    signature: string;
  };
}

export interface InstallHookIntegrationOptions {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  mode?: HookMode;
  bridgeBase?: string;
  ttl?: string;
  rpm?: number;
  dryRun?: boolean;
}

export interface RemoveHookIntegrationOptions {
  workspace: string;
  provider: HookProvider;
  dryRun?: boolean;
}

interface ManagedPaths {
  config: string;
  ignore: string;
  token: string;
  manifest: string;
  signature: string;
  lock: string;
}

interface FileSnapshot {
  existed: boolean;
  bytes: Buffer | null;
  mode: number;
}

interface LocatedHandler {
  eventName: "PreToolUse" | "BeforeTool";
  groupIndex: number;
  handlerIndex: number;
  handler: JsonObject;
}

function providerSource(provider: HookProvider): typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE {
  return provider === "claude-code" ? CLAUDE_CODE_HOOK_SOURCE : GEMINI_CLI_HOOK_SOURCE;
}

function parseProvider(provider: unknown): HookProvider {
  const parsed = hookProviderSchema.safeParse(provider);
  if (!parsed.success) {
    throw new HookIntegrationError(
      "HOOK_PROVIDER_UNSUPPORTED",
      `unsupported hook provider: ${String(provider)}; supported providers: claude-code, gemini-cli`
    );
  }
  return parsed.data;
}

function parseMode(mode: unknown): HookMode {
  const parsed = hookModeSchema.safeParse(mode ?? "observe");
  if (!parsed.success) {
    throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", "hook mode must be observe or control");
  }
  return parsed.data;
}

function integrationId(mode: HookMode): typeof HOOK_INTEGRATION_ID | typeof HOOK_CONTROL_INTEGRATION_ID {
  return mode === "control" ? HOOK_CONTROL_INTEGRATION_ID : HOOK_INTEGRATION_ID;
}

function leaseScopes(mode: HookMode): Array<"hook:observe" | "hook:control"> {
  return mode === "control" ? ["hook:observe", "hook:control"] : ["hook:observe"];
}

function providerControlOutcomes(provider: HookProvider): HookControlDecision[] {
  return provider === "claude-code" ? ["allow", "deny", "ask"] : ["allow", "deny"];
}

function assertControlBridgeLocal(mode: HookMode, bridgeBase: string): void {
  if (mode !== "control") return;
  const host = new URL(bridgeBase).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new HookIntegrationError(
      "HOOK_CONTROL_REMOTE_UNSUPPORTED",
      "control mode keeps raw provider input local and requires a loopback Bridge origin",
    );
  }
}

function validateAgentId(agentId: string): string {
  if (agentId.length < 1 || agentId.length > 160 || !SAFE_ID.test(agentId)) {
    throw new HookIntegrationError("HOOK_AGENT_INVALID", "agent ID must be a stable 1-160 character identifier");
  }
  return agentId;
}

function normalizeBridgeBase(raw: string | undefined): string {
  let url: URL;
  try {
    url = new URL((raw ?? DEFAULT_BRIDGE_BASE).trim());
  } catch {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must be an absolute HTTP or HTTPS URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must be an HTTP(S) origin without credentials, query, or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must not include a path");
  }
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
    throw new HookIntegrationError("HOOK_BRIDGE_INSECURE", "remote hook delivery requires HTTPS");
  }
  return url.origin;
}

function managedPaths(workspaceInput: string, provider: HookProvider): ManagedPaths {
  const workspace = resolve(workspaceInput);
  const config = provider === "claude-code"
    ? join(workspace, ".claude", "settings.local.json")
    : join(workspace, ".gemini", "settings.json");
  const base = join(workspace, ".amc", "hooks", provider);
  return {
    config,
    ignore: join(workspace, ".gitignore"),
    token: `${base}.lease`,
    manifest: `${base}.json`,
    signature: `${base}.json.sig`,
    lock: `${base}.lock`
  };
}

function assertManagedPathSafe(workspaceInput: string, path: string): void {
  const workspace = resolve(workspaceInput);
  const target = resolve(path);
  const rel = relative(workspace, target);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new HookIntegrationError("HOOK_PATH_UNSAFE", "managed hook path escapes the workspace");
  }
  let cursor = workspace;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new HookIntegrationError("HOOK_PATH_UNSAFE", `managed hook path contains a symlink: ${cursor}`);
    }
  }
}

function assertAllPathsSafe(workspace: string, paths: ManagedPaths): void {
  for (const path of Object.values(paths)) {
    assertManagedPathSafe(workspace, path);
  }
}

function snapshot(path: string): FileSnapshot {
  if (!existsSync(path)) return { existed: false, bytes: null, mode: 0o644 };
  return {
    existed: true,
    bytes: readFileSync(path),
    mode: statSync(path).mode & 0o777
  };
}

function restore(path: string, before: FileSnapshot): void {
  if (!before.existed) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  writeFileAtomic(path, before.bytes ?? Buffer.alloc(0), before.mode);
}

function withInstallLock<T>(workspace: string, paths: ManagedPaths, run: () => T): T {
  assertManagedPathSafe(workspace, paths.lock);
  mkdirSync(dirname(paths.lock), { recursive: true });
  let fd: number;
  try {
    fd = openSync(paths.lock, "wx", 0o600);
  } catch {
    try {
      if (existsSync(paths.lock) && Date.now() - statSync(paths.lock).mtimeMs > STALE_INSTALL_LOCK_MS) {
        unlinkSync(paths.lock);
        fd = openSync(paths.lock, "wx", 0o600);
      } else {
        throw new Error("active lock");
      }
    } catch {
      throw new HookIntegrationError("HOOK_INSTALL_BUSY", `hook integration is already being changed: ${paths.lock}`);
    }
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdTs: Date.now() })}\n`, "utf8");
    return run();
  } finally {
    closeSync(fd);
    try { unlinkSync(paths.lock); } catch { /* best-effort lock cleanup */ }
  }
}

function parseUnambiguousJson(text: string, kind: "config" | "input"): unknown {
  const bytes = Buffer.byteLength(text, "utf8");
  if (kind === "input" && bytes > MAX_PROVIDER_HOOK_INPUT_BYTES) {
    throw new HookIntegrationError("HOOK_INPUT_TOO_LARGE", "provider hook input exceeds 256 KiB");
  }
  if (kind === "config" && bytes > MAX_PROVIDER_CONFIG_BYTES) {
    throw new HookIntegrationError("HOOK_CONFIG_INVALID", "provider config exceeds 4 MiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new HookIntegrationError(
      kind === "config" ? "HOOK_CONFIG_INVALID" : "HOOK_INPUT_INVALID",
      `${kind === "config" ? "provider config" : "provider hook input"} must be valid JSON`
    );
  }
  const document = YAML.parseDocument(text, { uniqueKeys: true });
  const duplicate = document.errors.find((error) => /unique|duplicate/i.test(error.message));
  if (duplicate) {
    throw new HookIntegrationError(
      kind === "config" ? "HOOK_CONFIG_AMBIGUOUS" : "HOOK_INPUT_AMBIGUOUS",
      `${kind === "config" ? "provider config" : "provider hook input"} contains duplicate JSON keys`
    );
  }
  return parsed;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadConfig(path: string): { value: JsonObject; existed: boolean; raw: string | null; mode: number } {
  if (!existsSync(path)) return { value: {}, existed: false, raw: null, mode: 0o600 };
  const raw = readFileSync(path, "utf8");
  const parsed = parseUnambiguousJson(raw, "config");
  if (!isJsonObject(parsed)) {
    throw new HookIntegrationError("HOOK_CONFIG_INVALID", "provider config root must be a JSON object");
  }
  return { value: parsed, existed: true, raw, mode: statSync(path).mode & 0o777 };
}

function relativePortable(workspace: string, path: string): string {
  return relative(resolve(workspace), resolve(path)).split(sep).join("/");
}

function forwardArgs(input: {
  workspace: string;
  provider: HookProvider;
  mode: HookMode;
  agentId: string;
  bridgeBase: string;
  tokenPath: string;
}): string[] {
  return [
    "connect",
    "hooks",
    "forward",
    "--provider",
    input.provider,
    "--mode",
    input.mode,
    "--agent",
    input.agentId,
    "--bridge-url",
    input.bridgeBase,
    "--token-file",
    relativePortable(input.workspace, input.tokenPath)
  ];
}

function expectedHandler(input: {
  workspace: string;
  provider: HookProvider;
  mode: HookMode;
  agentId: string;
  bridgeBase: string;
  tokenPath: string;
}): JsonObject {
  const args = forwardArgs(input);
  if (input.provider === "claude-code") {
    return {
      type: "command",
      command: "amc",
      args,
      timeout: 10,
      statusMessage: input.mode === "control" ? CLAUDE_CONTROL_STATUS_MESSAGE : CLAUDE_STATUS_MESSAGE
    };
  }
  return {
    name: integrationId(input.mode),
    type: "command",
    command: ["amc", ...args].join(" "),
    timeout: 10_000,
    description: input.mode === "control"
      ? "Evaluate provider tool requests with signed AMC controls"
      : "Send privacy-minimal tool observations to AMC Watch"
  };
}

function handlerHash(handler: JsonObject): string {
  return sha256Hex(canonicalize(handler));
}

function hooksObject(config: JsonObject, create: boolean): JsonObject | null {
  const current = config.hooks;
  if (current === undefined) {
    if (!create) return null;
    const next: JsonObject = {};
    config.hooks = next;
    return next;
  }
  if (!isJsonObject(current)) {
    throw new HookIntegrationError("HOOK_CONFIG_INVALID", "provider config hooks field must be a JSON object");
  }
  return current;
}

function eventGroups(config: JsonObject, eventName: string, create: boolean): unknown[] | null {
  const hooks = hooksObject(config, create);
  if (!hooks) return null;
  const current = hooks[eventName];
  if (current === undefined) {
    if (!create) return null;
    const next: unknown[] = [];
    hooks[eventName] = next;
    return next;
  }
  if (!Array.isArray(current)) {
    throw new HookIntegrationError("HOOK_CONFIG_INVALID", `provider hook event ${eventName} must be an array`);
  }
  return current;
}

function isOwnedHandler(provider: HookProvider, handler: unknown): handler is JsonObject {
  if (!isJsonObject(handler)) return false;
  if (provider === "gemini-cli") {
    return handler.name === HOOK_INTEGRATION_ID || handler.name === HOOK_CONTROL_INTEGRATION_ID;
  }
  return handler.statusMessage === CLAUDE_STATUS_MESSAGE || handler.statusMessage === CLAUDE_CONTROL_STATUS_MESSAGE;
}

function locateOwnedHandlers(config: JsonObject, provider: HookProvider): LocatedHandler[] {
  const eventName = provider === "claude-code" ? "PreToolUse" : "BeforeTool";
  const groups = eventGroups(config, eventName, false) ?? [];
  const found: LocatedHandler[] = [];
  groups.forEach((group, groupIndex) => {
    if (!isJsonObject(group)) {
      throw new HookIntegrationError("HOOK_CONFIG_INVALID", `${eventName} hook groups must be JSON objects`);
    }
    if (!Array.isArray(group.hooks)) {
      throw new HookIntegrationError("HOOK_CONFIG_INVALID", `${eventName} hook group hooks must be an array`);
    }
    group.hooks.forEach((handler, handlerIndex) => {
      if (isOwnedHandler(provider, handler)) {
        found.push({ eventName, groupIndex, handlerIndex, handler });
      }
    });
  });
  return found;
}

function addOwnedHandler(config: JsonObject, provider: HookProvider, handler: JsonObject): void {
  const eventName = provider === "claude-code" ? "PreToolUse" : "BeforeTool";
  const groups = eventGroups(config, eventName, true)!;
  groups.push({
    matcher: provider === "claude-code" ? "*" : ".*",
    ...(provider === "gemini-cli" ? { sequential: false } : {}),
    hooks: [handler]
  });
}

function removeOwnedHandler(config: JsonObject, located: LocatedHandler): void {
  const hooks = hooksObject(config, false);
  if (!hooks) return;
  const groups = eventGroups(config, located.eventName, false);
  if (!groups) return;
  const group = groups[located.groupIndex];
  if (!isJsonObject(group) || !Array.isArray(group.hooks)) return;
  group.hooks.splice(located.handlerIndex, 1);
  if (group.hooks.length === 0) groups.splice(located.groupIndex, 1);
  if (groups.length === 0) delete hooks[located.eventName];
  if (Object.keys(hooks).length === 0) delete config.hooks;
}

function serializeConfig(config: JsonObject): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function managedIgnoreBlock(newline = "\n"): string {
  return `${GITIGNORE_MARKER}${newline}${GITIGNORE_ENTRY}${newline}`;
}

function hasManagedIgnoreBlock(raw: string | null): boolean {
  if (raw === null) return false;
  const lines = raw.split(/\r?\n/);
  return lines.some((line, index) => line === GITIGNORE_MARKER && lines[index + 1] === GITIGNORE_ENTRY);
}

function addManagedIgnoreBlock(raw: string | null): string {
  if (hasManagedIgnoreBlock(raw)) return raw!;
  const newline = raw?.includes("\r\n") ? "\r\n" : "\n";
  const prefix = raw && raw.length > 0
    ? raw.endsWith("\n") ? raw : `${raw}${newline}`
    : "";
  return `${prefix}${managedIgnoreBlock(newline)}`;
}

function removeManagedIgnoreBlock(raw: string): string {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = raw.endsWith("\n");
  const lines = raw.split(/\r?\n/);
  const markerIndex = lines.findIndex((line, index) => line === GITIGNORE_MARKER && lines[index + 1] === GITIGNORE_ENTRY);
  if (markerIndex < 0) return raw;
  lines.splice(markerIndex, 2);
  while (lines.length > 1 && lines.at(-1) === "" && lines.at(-2) === "") lines.pop();
  let next = lines.join(newline);
  if (hadTrailingNewline && next.length > 0 && !next.endsWith(newline)) next += newline;
  return next;
}

function ignoreBlockHash(): string {
  return sha256Hex(managedIgnoreBlock("\n"));
}

function loadSignedManifest(workspace: string, paths: ManagedPaths): HookManifest | null {
  const hasManifest = existsSync(paths.manifest);
  const hasSignature = existsSync(paths.signature);
  if (!hasManifest && !hasSignature) return null;
  if (!hasManifest || !hasSignature) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest or signature is missing");
  }
  const verification = verifySignedFileWithAuditor(workspace, paths.manifest);
  if (!verification.valid) {
    throw new HookIntegrationError(
      "HOOK_MANIFEST_INVALID",
      `hook installation manifest signature is invalid: ${verification.reason ?? "verification failed"}`
    );
  }
  try {
    return manifestSchema.parse(JSON.parse(readFileSync(paths.manifest, "utf8")) as unknown);
  } catch {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest does not match schema");
  }
}

function validateManifestPaths(workspace: string, provider: HookProvider, paths: ManagedPaths, manifest: HookManifest): void {
  const expectedSource = providerSource(provider);
  const expectedControl = manifest.mode === "control";
  if (
    manifest.installationId !== integrationId(manifest.mode) ||
    manifest.provider !== provider ||
    canonicalize(manifest.source) !== canonicalize(expectedSource) ||
    manifest.configPath !== relativePortable(workspace, paths.config) ||
    manifest.ignorePath !== relativePortable(workspace, paths.ignore) ||
    manifest.tokenPath !== relativePortable(workspace, paths.token) ||
    manifest.ignoreBlockSha256 !== ignoreBlockHash() ||
    manifest.observation.controlDecision !== expectedControl ||
    (expectedControl
      ? manifest.control?.endpoint !== CONTROL_HOOK_ROUTE
        || manifest.control.leaseScope !== "hook:control"
        || canonicalize(manifest.control.providerOutcomes) !== canonicalize(providerControlOutcomes(provider))
      : manifest.control !== null)
  ) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest source, path, or provider binding is invalid");
  }
}

function tokenModeSecure(path: string): boolean {
  return existsSync(path) && (statSync(path).mode & 0o077) === 0;
}

function verifyManagedLease(input: {
  workspace: string;
  tokenPath: string;
  expectedAgentId?: string;
  mode?: HookMode;
}): { valid: boolean; expired: boolean; payload: LeasePayload | null; error: string | null } {
  if (!existsSync(input.tokenPath)) {
    return { valid: false, expired: false, payload: null, error: "lease token missing" };
  }
  if (!tokenModeSecure(input.tokenPath)) {
    return { valid: false, expired: false, payload: null, error: "lease token permissions must be 0600" };
  }
  const token = readFileSync(input.tokenPath, "utf8").trim();
  if (!token) return { valid: false, expired: false, payload: null, error: "lease token is empty" };
  const revokedLeaseIds = new Set(loadLeaseRevocations(input.workspace).revocations.map((row) => row.leaseId));
  const scopes = leaseScopes(input.mode ?? "observe");
  let verification = verifyLeaseToken({
    workspace: input.workspace,
    token,
    expectedAgentId: input.expectedAgentId,
    requiredScope: "hook:observe",
    routePath: "/hooks/aep/0.1/events",
    revokedLeaseIds
  });
  if (verification.ok && scopes.includes("hook:control")) {
    verification = verifyLeaseToken({
      workspace: input.workspace,
      token,
      expectedAgentId: input.expectedAgentId,
      requiredScope: "hook:control",
      routePath: CONTROL_HOOK_ROUTE,
      revokedLeaseIds
    });
  }
  return {
    valid: verification.ok,
    expired: verification.error === "lease expired",
    payload: verification.payload,
    error: verification.error ?? null
  };
}

function limitations(provider: HookProvider, mode: HookMode): string[] {
  return [
    mode === "control"
      ? "control is loopback-only; raw provider input is evaluated in memory and never retained"
      : "observation only; no provider control decision is returned",
    mode === "control"
      ? "provider-local ask is a control response, not proof that AMC approval quorum was met"
      : "tool arguments, cwd, transcript path, and raw session ID are not forwarded",
    provider === "gemini-cli"
      ? "Gemini CLI does not expose a general provider tool-call ID in the pinned contract, so action identity is derived"
      : "Claude Code tool_use_id is used when present; otherwise action identity is derived",
    "Codex, Cursor, OpenCode, and other providers remain unsupported until their native contracts are pinned and fixture-tested"
  ];
}

function fileChange(path: string, sensitive: boolean, before: FileSnapshot, next: Buffer | null, dryRun: boolean): HookFileChange {
  const unchanged = before.existed === (next !== null) && (
    next === null || (before.bytes !== null && before.bytes.equals(next))
  );
  if (unchanged) return { path, action: "unchanged", sensitive };
  if (dryRun) {
    return {
      path,
      action: next === null ? "would-delete" : before.existed ? "would-update" : "would-create",
      sensitive
    };
  }
  return {
    path,
    action: next === null ? "delete" : before.existed ? "update" : "create",
    sensitive
  };
}

function unchangedInstallResult(input: {
  workspace: string;
  provider: HookProvider;
  paths: ManagedPaths;
  manifest: HookManifest;
  dryRun: boolean;
}): HookMutationResult {
  return {
    operation: "install",
    provider: input.provider,
    mode: input.manifest.mode,
    source: providerSource(input.provider),
    dryRun: input.dryRun,
    applied: false,
    changed: false,
    files: [
      { path: input.paths.config, action: "unchanged", sensitive: false },
      { path: input.paths.ignore, action: "unchanged", sensitive: false },
      { path: input.paths.token, action: "unchanged", sensitive: true },
      { path: input.paths.manifest, action: "unchanged", sensitive: false },
      { path: input.paths.signature, action: "unchanged", sensitive: false },
      ...(input.manifest.mode === "control" ? [
        { path: approvalPolicyPath(input.workspace), action: "unchanged" as const, sensitive: false },
        { path: approvalPolicySigPath(input.workspace), action: "unchanged" as const, sensitive: false },
      ] : [])
    ],
    lease: {
      scope: "hook:observe",
      scopes: leaseScopes(input.manifest.mode),
      route: "/hooks",
      leaseId: input.manifest.leaseId,
      expiresTs: input.manifest.leaseExpiresTs
    },
    limitations: limitations(input.provider, input.manifest.mode)
  };
}

export function installHookIntegration(options: InstallHookIntegrationOptions): HookMutationResult {
  const provider = parseProvider(options.provider);
  const mode = parseMode(options.mode);
  const workspace = resolve(options.workspace);
  const agentId = validateAgentId(options.agentId);
  const bridgeBase = normalizeBridgeBase(options.bridgeBase);
  assertControlBridgeLocal(mode, bridgeBase);
  const ttl = options.ttl ?? DEFAULT_HOOK_TTL;
  if (!Number.isFinite(parseLeaseTtlToMs(ttl)) || parseLeaseTtlToMs(ttl) <= 0) {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", "hook lease TTL must be positive");
  }
  const rpm = options.rpm ?? DEFAULT_HOOK_RPM;
  if (!Number.isInteger(rpm) || rpm < 1) {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", "hook lease RPM must be a positive integer");
  }
  const paths = managedPaths(workspace, provider);
  assertAllPathsSafe(workspace, paths);

  const execute = (): HookMutationResult => {
    const config = loadConfig(paths.config);
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreRaw = ignoreBefore.existed ? (ignoreBefore.bytes ?? Buffer.alloc(0)).toString("utf8") : null;
    const desiredIgnoreText = addManagedIgnoreBlock(ignoreRaw);
    const desiredIgnoreBytes = Buffer.from(desiredIgnoreText, "utf8");
    const existingManifest = loadSignedManifest(workspace, paths);
    if (existingManifest) validateManifestPaths(workspace, provider, paths, existingManifest);
    const owned = locateOwnedHandlers(config.value, provider);
    if (owned.length > 1 || (!existingManifest && owned.length > 0)) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "provider config contains an unowned or duplicate AMC hook handler");
    }
    if (existingManifest && owned.length === 1 && handlerHash(owned[0]!.handler) !== existingManifest.handlerSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler differs from the signed installation manifest");
    }

    const approvalPath = approvalPolicyPath(workspace);
    const approvalSigPath = approvalPolicySigPath(workspace);
    const approvalBefore = snapshot(approvalPath);
    const approvalSigBefore = snapshot(approvalSigPath);
    if (mode === "control") {
      if (approvalBefore.existed !== approvalSigBefore.existed) {
        throw new HookIntegrationError(
          "HOOK_CONTROL_POLICY_INVALID",
          "control mode requires a complete signed approval policy; repair it with amc policy approval init",
        );
      }
      if (approvalBefore.existed) {
        const approvalVerification = verifyApprovalPolicySignature(workspace);
        if (!approvalVerification.valid) {
          throw new HookIntegrationError(
            "HOOK_CONTROL_POLICY_INVALID",
            `control mode requires a valid approval policy signature: ${approvalVerification.reason ?? "verification failed"}`,
          );
        }
      }
    }

    const desiredHandler = expectedHandler({ workspace, provider, mode, agentId, bridgeBase, tokenPath: paths.token });
    const desiredHandlerHash = handlerHash(desiredHandler);
    const existingLease = verifyManagedLease({ workspace, tokenPath: paths.token, expectedAgentId: agentId, mode });
    const currentConfigSha = config.raw === null ? null : sha256Hex(Buffer.from(config.raw, "utf8"));
    if (
      existingManifest &&
      existingManifest.mode === mode &&
      owned.length === 1 &&
      existingManifest.agentId === agentId &&
      existingManifest.bridgeBase === bridgeBase &&
      existingManifest.handlerSha256 === desiredHandlerHash &&
      existingManifest.configSha256 === currentConfigSha &&
      hasManagedIgnoreBlock(ignoreRaw) &&
      existingLease.valid &&
      existingLease.payload?.leaseId === existingManifest.leaseId
    ) {
      return unchangedInstallResult({
        workspace,
        provider,
        paths,
        manifest: existingManifest,
        dryRun: options.dryRun === true
      });
    }

    if (owned.length === 1) removeOwnedHandler(config.value, owned[0]!);
    addOwnedHandler(config.value, provider, desiredHandler);
    const configText = serializeConfig(config.value);
    const configBytes = Buffer.from(configText, "utf8");

    if (options.dryRun) {
      const files = [
        fileChange(paths.config, false, snapshot(paths.config), configBytes, true),
        fileChange(paths.ignore, false, ignoreBefore, desiredIgnoreBytes, true),
        fileChange(paths.token, true, snapshot(paths.token), Buffer.from("planned dedicated lease\n"), true),
        fileChange(paths.manifest, false, snapshot(paths.manifest), Buffer.from("planned signed manifest\n"), true),
        fileChange(paths.signature, false, snapshot(paths.signature), Buffer.from("planned signature\n"), true),
      ];
      if (mode === "control") {
        files.push(
          fileChange(
            approvalPath,
            false,
            approvalBefore,
            approvalBefore.bytes ?? Buffer.from("planned signed approval policy\n"),
            true,
          ),
          fileChange(
            approvalSigPath,
            false,
            approvalSigBefore,
            approvalSigBefore.bytes ?? Buffer.from("planned approval policy signature\n"),
            true,
          ),
        );
      }
      return {
        operation: "install",
        provider,
        mode,
        source: providerSource(provider),
        dryRun: true,
        applied: false,
        changed: true,
        files,
        lease: { scope: "hook:observe", scopes: leaseScopes(mode), route: "/hooks", leaseId: null, expiresTs: null },
        limitations: limitations(provider, mode)
      };
    }

    const revocations = ensureLeaseRevocationStore(workspace);
    if (!revocations.signatureValid) {
      throw new HookIntegrationError("HOOK_TOKEN_INVALID", "lease revocation store signature is invalid");
    }
    let token: string;
    let leasePayload: LeasePayload;
    let issuedNewLease = false;
    if (existingLease.valid && existingLease.payload) {
      token = readFileSync(paths.token, "utf8").trim();
      leasePayload = existingLease.payload;
    } else {
      token = issueLeaseForCli({
        workspace,
        workspaceId: workspaceIdFromDirectory(workspace),
        agentId,
        ttl,
        scopes: leaseScopes(mode).join(","),
        routes: "/hooks",
        models: "*",
        rpm,
        tpm: 1,
        maxCostUsdPerDay: null
      }).token;
      leasePayload = leasePayloadSchema.parse(decodeLeasePayload(token));
      issuedNewLease = true;
    }

    const now = Date.now();
    const manifest = manifestSchema.parse({
      v: 1,
      installationId: integrationId(mode),
      mode,
      provider,
      source: providerSource(provider),
      configPath: relativePortable(workspace, paths.config),
      ignorePath: relativePortable(workspace, paths.ignore),
      tokenPath: relativePortable(workspace, paths.token),
      agentId,
      bridgeBase,
      leaseId: leasePayload.leaseId,
      leaseIssuedTs: leasePayload.issuedTs,
      leaseExpiresTs: leasePayload.expiresTs,
      configExistedBefore: existingManifest?.configExistedBefore ?? config.existed,
      ignoreExistedBefore: existingManifest?.ignoreExistedBefore ?? ignoreBefore.existed,
      ignoreBlockSha256: ignoreBlockHash(),
      configSha256: sha256Hex(configBytes),
      handlerSha256: desiredHandlerHash,
      installedTs: existingManifest?.installedTs ?? now,
      updatedTs: now,
      observation: {
        eventType: "action.requested",
        controlDecision: mode === "control",
        rawProviderInputForwarded: false,
        correlation: provider === "claude-code" ? "provider-call-id" : "derived-event-id"
      },
      control: mode === "control" ? {
        endpoint: CONTROL_HOOK_ROUTE,
        localOnly: true,
        rawInputTransport: "loopback-memory-only",
        leaseScope: "hook:control",
        providerOutcomes: providerControlOutcomes(provider)
      } : null
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const before = {
      config: snapshot(paths.config),
      ignore: ignoreBefore,
      token: snapshot(paths.token),
      manifest: snapshot(paths.manifest),
      signature: snapshot(paths.signature),
      approval: approvalBefore,
      approvalSignature: approvalSigBefore,
    };
    try {
      if (mode === "control" && !before.approval.existed) {
        initApprovalPolicy(workspace);
      }
      writeFileAtomic(paths.ignore, desiredIgnoreBytes, ignoreBefore.existed ? ignoreBefore.mode : 0o644);
      writeFileAtomic(paths.token, `${token}\n`, HOOK_TOKEN_MODE);
      writeFileAtomic(paths.config, configBytes, config.existed ? config.mode : provider === "claude-code" ? 0o600 : 0o644);
      writeFileAtomic(paths.manifest, manifestBytes, 0o644);
      signFileWithAuditor(workspace, paths.manifest);
      if (issuedNewLease && existingManifest && existingManifest.leaseId !== leasePayload.leaseId) {
        revokeLeaseForCli({
          workspace,
          leaseId: existingManifest.leaseId,
          reason: "AMC provider hook integration lease rotated"
        });
      }
    } catch (error) {
      restore(paths.config, before.config);
      restore(paths.ignore, before.ignore);
      restore(paths.token, before.token);
      restore(paths.manifest, before.manifest);
      restore(paths.signature, before.signature);
      restore(approvalPath, before.approval);
      restore(approvalSigPath, before.approvalSignature);
      if (issuedNewLease) {
        try { revokeLeaseForCli({ workspace, leaseId: leasePayload.leaseId, reason: "AMC hook installation rolled back" }); } catch { /* preserve original error */ }
      }
      throw error;
    }
    const files = [
      fileChange(paths.config, false, before.config, configBytes, false),
      fileChange(paths.ignore, false, before.ignore, desiredIgnoreBytes, false),
      fileChange(paths.token, true, before.token, Buffer.from(`${token}\n`), false),
      fileChange(paths.manifest, false, before.manifest, manifestBytes, false),
      { path: paths.signature, action: before.signature.existed ? "update" as const : "create" as const, sensitive: false },
    ];
    if (mode === "control") {
      files.push(
        fileChange(approvalPath, false, before.approval, snapshot(approvalPath).bytes, false),
        fileChange(approvalSigPath, false, before.approvalSignature, snapshot(approvalSigPath).bytes, false),
      );
    }
    return {
      operation: "install",
      provider,
      mode,
      source: providerSource(provider),
      dryRun: false,
      applied: true,
      changed: true,
      files,
      lease: {
        scope: "hook:observe",
        scopes: leaseScopes(mode),
        route: "/hooks",
        leaseId: leasePayload.leaseId,
        expiresTs: leasePayload.expiresTs
      },
      limitations: limitations(provider, mode)
    };
  };

  return options.dryRun ? execute() : withInstallLock(workspace, paths, execute);
}

function decodeLeasePayload(token: string): unknown {
  const [payloadPart] = token.split(".");
  if (!payloadPart) throw new HookIntegrationError("HOOK_TOKEN_INVALID", "issued lease token has no payload");
  const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
  } catch {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", "issued lease payload is invalid");
  }
}

export function getHookIntegrationStatus(input: { workspace: string; provider: HookProvider }): HookIntegrationStatus {
  const provider = parseProvider(input.provider);
  const workspace = resolve(input.workspace);
  const paths = managedPaths(workspace, provider);
  const files = {
    config: paths.config,
    ignore: paths.ignore,
    token: paths.token,
    manifest: paths.manifest,
    signature: paths.signature
  };
  assertAllPathsSafe(workspace, paths);
  const issues: string[] = [];
  const anyArtifact = [paths.token, paths.manifest, paths.signature].some((path) => existsSync(path));
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(paths.config);
  } catch (error) {
    return {
      provider,
      agentId: null,
      mode: null,
      state: "invalid",
      source: providerSource(provider),
      configOwned: false,
      manifestValid: false,
      leaseValid: false,
      leaseId: null,
      expiresTs: null,
      issues: [error instanceof Error ? error.message : String(error)],
      files
    };
  }
  let owned: LocatedHandler[] = [];
  try {
    owned = locateOwnedHandlers(config.value, provider);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (!anyArtifact && owned.length === 0) {
    return {
      provider,
      agentId: null,
      mode: null,
      state: "not-installed",
      source: providerSource(provider),
      configOwned: false,
      manifestValid: false,
      leaseValid: false,
      leaseId: null,
      expiresTs: null,
      issues: [],
      files
    };
  }

  let manifest: HookManifest | null = null;
  let manifestValid = false;
  try {
    manifest = loadSignedManifest(workspace, paths);
    if (!manifest) throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest is missing");
    validateManifestPaths(workspace, provider, paths, manifest);
    manifestValid = true;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  let configOwned = owned.length === 1;
  if (owned.length > 1) {
    issues.push("provider config contains duplicate AMC hook handlers");
    configOwned = false;
  }
  if (manifest && owned.length === 0) issues.push("managed hook handler is missing from provider config");
  if (manifest && owned.length === 1 && handlerHash(owned[0]!.handler) !== manifest.handlerSha256) {
    issues.push("managed hook handler differs from the signed installation manifest");
    configOwned = false;
  }
  if (manifest && config.raw !== null && sha256Hex(Buffer.from(config.raw, "utf8")) !== manifest.configSha256) {
    issues.push("provider config changed after installation");
  }
  const ignoreRaw = existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null;
  const ignoreProtected = hasManagedIgnoreBlock(ignoreRaw);
  if (manifest && !ignoreProtected) issues.push(".amc/hooks/ is not protected by .gitignore");

  const lease = verifyManagedLease({
    workspace,
    tokenPath: paths.token,
    expectedAgentId: manifest?.agentId,
    mode: manifest?.mode ?? "observe"
  });
  if (!lease.valid) {
    if (lease.error === "lease token permissions must be 0600") issues.push(lease.error);
    else issues.push(`lease invalid: ${lease.error ?? "verification failed"}`);
  }
  if (manifest && lease.payload && lease.payload.leaseId !== manifest.leaseId) {
    issues.push("lease ID differs from the signed installation manifest");
  }

  let state: HookIntegrationStatus["state"] = "installed";
  if (!manifestValid || !lease.valid && !lease.expired || !ignoreProtected || issues.some((issue) => issue.includes("signature") || issue.includes("permissions") || issue.includes("lease ID"))) {
    state = "invalid";
  } else if (lease.expired) {
    state = "expired";
  } else if (!configOwned || (manifest && config.raw !== null && sha256Hex(Buffer.from(config.raw, "utf8")) !== manifest.configSha256)) {
    state = "drifted";
  }
  return {
    provider,
    agentId: manifest?.agentId ?? null,
    mode: manifest?.mode ?? null,
    state,
    source: providerSource(provider),
    configOwned,
    manifestValid,
    leaseValid: lease.valid,
    leaseId: lease.payload?.leaseId ?? manifest?.leaseId ?? null,
    expiresTs: lease.payload?.expiresTs ?? manifest?.leaseExpiresTs ?? null,
    issues,
    files
  };
}

export function removeHookIntegration(options: RemoveHookIntegrationOptions): HookMutationResult {
  const provider = parseProvider(options.provider);
  const workspace = resolve(options.workspace);
  const paths = managedPaths(workspace, provider);
  assertAllPathsSafe(workspace, paths);
  const execute = (): HookMutationResult => {
    const manifest = loadSignedManifest(workspace, paths);
    if (!manifest) {
      const config = loadConfig(paths.config);
      if (locateOwnedHandlers(config.value, provider).length > 0) {
        throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "refusing to remove an AMC-marked hook without a signed manifest");
      }
      return {
        operation: "remove",
        provider,
        mode: "observe",
        source: providerSource(provider),
        dryRun: options.dryRun === true,
        applied: false,
        changed: false,
        files: [
          { path: paths.config, action: "unchanged", sensitive: false },
          { path: paths.ignore, action: "unchanged", sensitive: false },
          { path: paths.token, action: "unchanged", sensitive: true },
          { path: paths.manifest, action: "unchanged", sensitive: false },
          { path: paths.signature, action: "unchanged", sensitive: false }
        ],
        lease: { scope: "hook:observe", scopes: leaseScopes("observe"), route: "/hooks", leaseId: null, expiresTs: null },
        limitations: limitations(provider, "observe")
      };
    }
    validateManifestPaths(workspace, provider, paths, manifest);
    const config = loadConfig(paths.config);
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreRaw = ignoreBefore.existed ? (ignoreBefore.bytes ?? Buffer.alloc(0)).toString("utf8") : "";
    const owned = locateOwnedHandlers(config.value, provider);
    if (owned.length !== 1 || handlerHash(owned[0]!.handler) !== manifest.handlerSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler differs from the signed installation manifest");
    }
    removeOwnedHandler(config.value, owned[0]!);
    const shouldDeleteConfig = !manifest.configExistedBefore && Object.keys(config.value).length === 0;
    const nextConfig = shouldDeleteConfig ? null : Buffer.from(serializeConfig(config.value), "utf8");
    const nextIgnoreText = removeManagedIgnoreBlock(ignoreRaw);
    const nextIgnore = !manifest.ignoreExistedBefore && nextIgnoreText.trim().length === 0
      ? null
      : Buffer.from(nextIgnoreText, "utf8");
    const before = {
      config: snapshot(paths.config),
      ignore: ignoreBefore,
      token: snapshot(paths.token),
      manifest: snapshot(paths.manifest),
      signature: snapshot(paths.signature)
    };
    const files = [
      fileChange(paths.config, false, before.config, nextConfig, options.dryRun === true),
      fileChange(paths.ignore, false, before.ignore, nextIgnore, options.dryRun === true),
      fileChange(paths.token, true, before.token, null, options.dryRun === true),
      fileChange(paths.manifest, false, before.manifest, null, options.dryRun === true),
      fileChange(paths.signature, false, before.signature, null, options.dryRun === true)
    ];
    if (options.dryRun) {
      return {
        operation: "remove",
        provider,
        mode: manifest.mode,
        source: providerSource(provider),
        dryRun: true,
        applied: false,
        changed: files.some((row) => row.action !== "unchanged"),
        files,
        lease: { scope: "hook:observe", scopes: leaseScopes(manifest.mode), route: "/hooks", leaseId: manifest.leaseId, expiresTs: manifest.leaseExpiresTs },
        limitations: limitations(provider, manifest.mode)
      };
    }
    if (nextConfig === null) unlinkSync(paths.config);
    else writeFileAtomic(paths.config, nextConfig, config.mode);
    if (nextIgnore === null) {
      if (existsSync(paths.ignore)) unlinkSync(paths.ignore);
    } else {
      writeFileAtomic(paths.ignore, nextIgnore, ignoreBefore.mode);
    }
    try {
      revokeLeaseForCli({
        workspace,
        leaseId: manifest.leaseId,
        reason: "AMC provider hook integration removed"
      });
    } catch (error) {
      restore(paths.config, before.config);
      restore(paths.ignore, before.ignore);
      throw error;
    }
    for (const path of [paths.token, paths.manifest, paths.signature]) {
      if (existsSync(path)) unlinkSync(path);
    }
    return {
      operation: "remove",
      provider,
      mode: manifest.mode,
      source: providerSource(provider),
      dryRun: false,
      applied: true,
      changed: true,
      files,
      lease: { scope: "hook:observe", scopes: leaseScopes(manifest.mode), route: "/hooks", leaseId: manifest.leaseId, expiresTs: manifest.leaseExpiresTs },
      limitations: limitations(provider, manifest.mode)
    };
  };
  return options.dryRun ? execute() : withInstallLock(workspace, paths, execute);
}

const baseProviderInputSchema = z.object({
  session_id: z.string().min(1).max(4096).optional(),
  hook_event_name: z.string().min(1).max(128),
  tool_name: z.string().min(1).max(4096),
  tool_input: z.unknown().optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  tool_use_id: z.string().min(1).max(4096).optional()
}).passthrough();

function stablePrivateId(prefix: string, provider: HookProvider, value: string): string {
  return `${prefix}_${sha256Hex(`${provider}:${value}`).slice(0, 32)}`;
}

function safeToolName(raw: string): string {
  const redacted = redactBridgeText(raw).trim().slice(0, 512);
  return redacted || "unknown-tool";
}

export function mapProviderHookEvent(input: {
  provider: HookProvider;
  agentId: string;
  rawInput: string;
  observedAt?: number;
}): ObservedAepActionEvent {
  const provider = parseProvider(input.provider);
  const agentId = validateAgentId(input.agentId);
  const parsed = parseUnambiguousJson(input.rawInput, "input");
  const result = baseProviderInputSchema.safeParse(parsed);
  if (!result.success) {
    throw new HookIntegrationError("HOOK_INPUT_INVALID", "provider hook input does not contain the required tool event fields");
  }
  const expectedEvent = provider === "claude-code" ? "PreToolUse" : "BeforeTool";
  if (result.data.hook_event_name !== expectedEvent) {
    throw new HookIntegrationError(
      "HOOK_INPUT_UNSUPPORTED",
      `${provider} hook forwarder accepts only ${expectedEvent} observation events`
    );
  }
  const observedAt = input.observedAt ?? Date.now();
  if (!Number.isFinite(observedAt)) {
    throw new HookIntegrationError("HOOK_INPUT_INVALID", "observed timestamp must be finite");
  }
  const rawHash = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  const eventId = `evt_${sha256Hex(`${provider}:${observedAt}:${rawHash}`).slice(0, 32)}`;
  const providerActionId = provider === "claude-code" && result.data.tool_use_id &&
    result.data.tool_use_id.length <= 160 && SAFE_ID.test(result.data.tool_use_id)
    ? result.data.tool_use_id
    : `action_${sha256Hex(`${provider}:${observedAt}:${rawHash}:action`).slice(0, 32)}`;
  const toolName = safeToolName(result.data.tool_name);
  const isMcp = provider === "claude-code" ? toolName.startsWith("mcp__") : toolName.startsWith("mcp_");
  const event = {
    aep_version: "0.1",
    id: eventId,
    type: "action.requested",
    time: new Date(observedAt).toISOString(),
    hook: expectedEvent,
    agent: {
      slug: agentId,
      surface: provider
    },
    ...(result.data.session_id ? {
      session: { id: stablePrivateId("session", provider, result.data.session_id) }
    } : {}),
    action: {
      type: "tool_call",
      id: providerActionId
    },
    tool: {
      type: isMcp ? "mcp" : "native",
      name: toolName,
      original_name: toolName
    },
    ...(isMcp ? {
      server: { name: "provider-declared-mcp" }
    } : {})
  } as const;
  const validated = observedAepActionEventSchema.safeParse(event);
  if (!validated.success) {
    throw new HookIntegrationError("HOOK_INPUT_INVALID", "mapped provider hook input is not a valid observed action event");
  }
  return validated.data;
}

function resolveTokenPath(workspace: string, tokenFile: string): string {
  const path = isAbsolute(tokenFile) ? resolve(tokenFile) : resolve(workspace, tokenFile);
  assertManagedPathSafe(workspace, path);
  return path;
}

function authorizeForwardInvocation(input: {
  workspace: string;
  provider: HookProvider;
  mode: HookMode;
  agentId: string;
  bridgeBase: string;
  tokenFile: string;
}): { bridgeBase: string; tokenPath: string; token: string } {
  const paths = managedPaths(input.workspace, input.provider);
  assertAllPathsSafe(input.workspace, paths);
  const tokenPath = resolveTokenPath(input.workspace, input.tokenFile);
  if (tokenPath !== resolve(paths.token)) {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", "hook forwarder accepts only the signed installation lease path");
  }

  const manifest = loadSignedManifest(input.workspace, paths);
  if (!manifest) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "signed hook installation manifest is required before forwarding");
  }
  validateManifestPaths(input.workspace, input.provider, paths, manifest);
  if (manifest.mode !== input.mode || manifest.agentId !== input.agentId || manifest.bridgeBase !== input.bridgeBase) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook forwarder agent or Bridge origin differs from the signed installation manifest");
  }
  if (!hasManagedIgnoreBlock(existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null)) {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", ".amc/hooks/ must remain protected by the managed .gitignore block");
  }

  const config = loadConfig(paths.config);
  const owned = locateOwnedHandlers(config.value, input.provider);
  if (owned.length !== 1 || handlerHash(owned[0]!.handler) !== manifest.handlerSha256) {
    throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler differs from the signed installation manifest");
  }

  const lease = verifyManagedLease({
    workspace: input.workspace,
    tokenPath,
    expectedAgentId: input.agentId,
    mode: input.mode
  });
  if (!lease.valid || !lease.payload || lease.payload.leaseId !== manifest.leaseId) {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", `hook lease is invalid: ${lease.error ?? "lease binding mismatch"}`);
  }
  return {
    bridgeBase: manifest.bridgeBase,
    tokenPath,
    token: readFileSync(tokenPath, "utf8").trim()
  };
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function forwardProviderHookEvent(input: {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  bridgeBase?: string;
  tokenFile: string;
  rawInput: string;
  mode?: HookMode;
  observedAt?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}): Promise<{ status: number; receiptId: string; idempotentReplay: boolean }> {
  const workspace = resolve(input.workspace);
  const provider = parseProvider(input.provider);
  const mode = parseMode(input.mode);
  const bridgeBase = normalizeBridgeBase(input.bridgeBase);
  const agentId = validateAgentId(input.agentId);
  const authorization = authorizeForwardInvocation({
    workspace,
    provider,
    mode,
    agentId,
    bridgeBase,
    tokenFile: input.tokenFile
  });
  const event = mapProviderHookEvent({
    provider,
    agentId,
    rawInput: input.rawInput,
    observedAt: input.observedAt
  });
  const body = JSON.stringify(event);
  const url = `${authorization.bridgeBase}${OBSERVED_AEP_HOOK_PATH}`;
  const retryDelayMs = input.retryDelayMs ?? 100;
  const timeoutMs = input.timeoutMs ?? 5_000;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body))
        },
        body
      });
      lastStatus = response.status;
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(retryDelayMs);
        continue;
      }
      if (!response.ok) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", `hook ingress rejected the event with HTTP ${response.status}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      if (payload.observed !== true || typeof payload.receiptId !== "string") {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "hook ingress response is missing an observed receipt");
      }
      return {
        status: response.status,
        receiptId: payload.receiptId,
        idempotentReplay: payload.idempotentReplay === true
      };
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_DELIVERY_FAILED",
    lastStatus === null
      ? `hook delivery failed before a response${lastError ? `: ${lastError}` : ""}`
      : `hook delivery failed with HTTP ${lastStatus}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function forwardProviderHookControl(input: {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  bridgeBase?: string;
  tokenFile: string;
  rawInput: string;
  observedAt?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}): Promise<{
  observation: { status: number; receiptId: string; idempotentReplay: boolean };
  control: ProviderHookControlResult;
}> {
  const workspace = resolve(input.workspace);
  const provider = parseProvider(input.provider);
  const bridgeBase = normalizeBridgeBase(input.bridgeBase);
  assertControlBridgeLocal("control", bridgeBase);
  const agentId = validateAgentId(input.agentId);
  const authorization = authorizeForwardInvocation({
    workspace,
    provider,
    mode: "control",
    agentId,
    bridgeBase,
    tokenFile: input.tokenFile,
  });
  const observation = await forwardProviderHookEvent({
    ...input,
    workspace,
    provider,
    agentId,
    bridgeBase,
    mode: "control",
  });
  const retryDelayMs = input.retryDelayMs ?? 100;
  const timeoutMs = input.timeoutMs ?? 5_000;
  const url = `${authorization.bridgeBase}${CONTROL_HOOK_PATH}`;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(input.rawInput)),
          "x-amc-hook-provider": provider,
        },
        body: input.rawInput,
      });
      lastStatus = response.status;
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(retryDelayMs);
        continue;
      }
      if (!response.ok) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", `hook control rejected the request with HTTP ${response.status}`);
      }
      const payload = await response.json() as unknown;
      if (!isRecord(payload)) {
        throw new HookIntegrationError("HOOK_DELIVERY_FAILED", "hook control response is incomplete");
      }
      const verification = verifyProviderHookControlResult({
        workspace,
        authenticatedAgentId: agentId,
        provider,
        rawInput: input.rawInput,
        result: payload,
      });
      if (!verification.ok) {
        throw new HookIntegrationError(
          "HOOK_DELIVERY_FAILED",
          `hook control response verification failed: ${verification.error ?? "unknown verification error"}`,
        );
      }
      return {
        observation,
        control: payload as unknown as ProviderHookControlResult,
      };
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_DELIVERY_FAILED",
    lastStatus === null
      ? `hook control failed before a response${lastError ? `: ${lastError}` : ""}`
      : `hook control failed with HTTP ${lastStatus}`,
  );
}

export function failClosedProviderControlResponse(
  provider: HookProvider,
  reason = "AMC control is unavailable; the action is denied fail closed.",
): ProviderControlResponse {
  return renderProviderControlResponse(provider, "deny" satisfies HookControlDecision, reason);
}
