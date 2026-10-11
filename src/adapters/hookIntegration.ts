import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";
import {
  OBSERVED_AEP_HOOK_PATH,
  OBSERVED_HOOK_CORRELATION_PATH,
  observedAepActionEventSchema,
  type ObservedAepActionEvent
} from "../bridge/hookIngress.js";
import {
  CONTROL_HOOK_PATH,
  CONTROL_HOOK_ROUTE,
  verifyProviderHookControlResult,
  type ProviderHookControlResult,
} from "../bridge/hookControl.js";
import { renderProviderControlResponse, type HookControlDecision, type HookProvider, type ProviderControlResponse } from "../bridge/hookProviders.js";
import { installPiHook, piHookStatus, PI_HOOK_SOURCE, removePiHook } from "./hookProviders/pi.js";
import type { PiGovernance } from "../bridge/piSessionRegistry.js";
import { redactBridgeText } from "../bridge/bridgeRedaction.js";
import { boundedFetchSignal, CLAUDE_HOOK_TIMEOUT_SECONDS } from "./hookDeadline.js";
import { approvalPolicyPath, approvalPolicySigPath, initApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { revokeLeaseForCli } from "../leases/leaseCli.js";
import { verifyManagedLease } from "./managedHookLease.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { writeFileAtomic } from "../utils/fs.js";
import {
  isSafeProviderActionId,
  resolveProviderHookRequestIdentity,
  type HookActionIdentitySource,
} from "../bridge/hookActionIdentity.js";
import {
  addManagedIgnoreBlock, assertAllPathsSafe, assertControlBridgeLocal, assertManagedPathSafe, controlApprovalPolicy, managedLeaseStatus,
  leaseManifestFields, obtainHookLease, parseInstallOptions, fileChange, HOOK_CONTROL_INTEGRATION_ID, HOOK_INTEGRATION_ID, HOOK_TOKEN_MODE, HookIntegrationError,
  hasManagedIgnoreBlock, hookModeSchema, ignoreBlockHash, integrationId, leaseScopes, normalizeBridgeBase, parseMode, relativePortable,
  removeManagedIgnoreBlock, restore, snapshot, validateAgentId, withInstallLock, type HookFileChange, type HookMode,
} from "./hookProviders/installFiles.js";
export {
  HOOK_CONTROL_INTEGRATION_ID, HOOK_INTEGRATION_ID, HookIntegrationError, type HookFileChange, type HookMode,
} from "./hookProviders/installFiles.js";

export const CLAUDE_CODE_HOOK_SOURCE = {
  provider: "claude-code",
  contract: "Claude Code project-local tool lifecycle command hooks",
  url: "https://code.claude.com/docs/en/hooks.md",
  reference: "sha256:e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1"
} as const;

export const GEMINI_CLI_HOOK_SOURCE = {
  provider: "gemini-cli",
  contract: "Gemini CLI project tool lifecycle command hooks",
  url: "https://github.com/google-gemini/gemini-cli/blob/f354eebaf43b25bacb176007e449bb9a638fd101/docs/hooks/reference.md",
  reference: "f354eebaf43b25bacb176007e449bb9a638fd101"
} as const;

const LEGACY_HOOK_SOURCES = {
  "claude-code": {
    provider: "claude-code",
    contract: "Claude Code project-local PreToolUse command hook",
    url: CLAUDE_CODE_HOOK_SOURCE.url,
    reference: CLAUDE_CODE_HOOK_SOURCE.reference,
  },
  "gemini-cli": {
    provider: "gemini-cli",
    contract: "Gemini CLI project BeforeTool command hook",
    url: GEMINI_CLI_HOOK_SOURCE.url,
    reference: GEMINI_CLI_HOOK_SOURCE.reference,
  },
} as const;

export const MAX_PROVIDER_HOOK_INPUT_BYTES = 262_144;

const MAX_PROVIDER_CONFIG_BYTES = 4 * 1024 * 1024;
const CLAUDE_STATUS_MESSAGE = `AMC Observe [${HOOK_INTEGRATION_ID}]`;
const CLAUDE_CONTROL_STATUS_MESSAGE = `AMC Control [${HOOK_CONTROL_INTEGRATION_ID}]`;
/** The providers configured through a JSON hooks file; Pi installs through src/adapters/hookProviders/pi.ts. */
type ConfigHookProvider = Exclude<HookProvider, "pi">;
export type { HookProvider };
const hookProviderSchema = z.enum(["claude-code", "gemini-cli"]);
const nativeHookEventNameSchema = z.enum([
  "AfterTool",
  "BeforeTool",
  "PostToolUse",
  "PostToolUseFailure",
  "PreToolUse",
]);
const lifecyclePhaseSchema = z.enum(["requested", "completed", "failed", "completed-or-failed"]);
const sourceSchema = z.object({
  provider: hookProviderSchema,
  contract: z.string().min(1),
  url: z.string().url(),
  reference: z.string().min(1)
}).strict();

const manifestCommonSchema = z.object({
  installationId: z.enum([HOOK_INTEGRATION_ID, HOOK_CONTROL_INTEGRATION_ID]),
  mode: hookModeSchema.default("observe"),
  provider: hookProviderSchema,
  source: sourceSchema,
  configPath: z.string().min(1),
  ignorePath: z.string().min(1),
  tokenPath: z.string().min(1),
  ...leaseManifestFields,
  configExistedBefore: z.boolean(),
  ignoreExistedBefore: z.boolean(),
  ignoreBlockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  installedTs: z.number().int(),
  updatedTs: z.number().int(),
  control: z.object({
    endpoint: z.literal(CONTROL_HOOK_ROUTE),
    localOnly: z.literal(true),
    rawInputTransport: z.literal("loopback-memory-only"),
    leaseScope: z.literal("hook:control"),
    providerOutcomes: z.array(z.enum(["allow", "deny", "ask"])).min(2)
  }).strict().nullable().default(null)
}).strict();

const manifestV1Schema = manifestCommonSchema.extend({
  v: z.literal(1),
  handlerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observation: z.object({
    eventType: z.literal("action.requested"),
    controlDecision: z.boolean(),
    rawProviderInputForwarded: z.literal(false),
    correlation: z.enum(["provider-call-id", "derived-event-id"])
  }).strict(),
}).strict();

const manifestV2Schema = manifestCommonSchema.extend({
  v: z.literal(2),
  handlers: z.array(z.object({
    eventName: nativeHookEventNameSchema,
    phase: lifecyclePhaseSchema,
    handlerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(2),
  observation: z.object({
    eventTypes: z.array(z.enum(["action.requested", "action.completed", "action.failed"])).min(2),
    controlDecision: z.boolean(),
    rawProviderInputForwarded: z.literal(false),
    correlation: z.enum(["provider-call-id", "derived-request-id-with-terminal-resolution"])
  }).strict(),
}).strict();

const manifestSchema = z.discriminatedUnion("v", [manifestV1Schema, manifestV2Schema]);

type HookManifest = z.infer<typeof manifestSchema>;
type NativeHookEventName = z.infer<typeof nativeHookEventNameSchema>;
type LifecyclePhase = z.infer<typeof lifecyclePhaseSchema>;
type JsonObject = Record<string, unknown>;

export interface HookMutationResult {
  operation: "install" | "remove";
  provider: HookProvider;
  mode: HookMode;
  source: typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE | typeof PI_HOOK_SOURCE;
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
  source: typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE | typeof PI_HOOK_SOURCE;
  configOwned: boolean;
  manifestValid: boolean;
  leaseValid: boolean;
  leaseId: string | null;
  expiresTs: number | null;
  issues: string[];
  files: { config: string; ignore: string; token: string; manifest: string; signature: string };
  /** Pi only: what AMC may claim for the agent's Pi sessions, from verified session registrations. */
  governance?: PiGovernance;
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

interface LocatedHandler {
  eventName: NativeHookEventName;
  groupIndex: number;
  handlerIndex: number;
  handler: JsonObject;
}

interface ProviderHookSpec {
  eventName: NativeHookEventName;
  phase: LifecyclePhase;
  eventType: "action.requested" | "action.completed" | "action.failed";
}

function providerHookSpecs(provider: ConfigHookProvider): ProviderHookSpec[] {
  return provider === "claude-code"
    ? [
        { eventName: "PostToolUse", phase: "completed", eventType: "action.completed" },
        { eventName: "PostToolUseFailure", phase: "failed", eventType: "action.failed" },
        { eventName: "PreToolUse", phase: "requested", eventType: "action.requested" },
      ]
    : [
        { eventName: "AfterTool", phase: "completed-or-failed", eventType: "action.completed" },
        { eventName: "BeforeTool", phase: "requested", eventType: "action.requested" },
      ];
}

function providerObservedEventTypes(provider: ConfigHookProvider): Array<"action.requested" | "action.completed" | "action.failed"> {
  return provider === "claude-code"
    ? ["action.requested", "action.completed", "action.failed"]
    : ["action.requested", "action.completed", "action.failed"];
}

function providerSource(provider: ConfigHookProvider): typeof CLAUDE_CODE_HOOK_SOURCE | typeof GEMINI_CLI_HOOK_SOURCE {
  return provider === "claude-code" ? CLAUDE_CODE_HOOK_SOURCE : GEMINI_CLI_HOOK_SOURCE;
}

function parseProvider(provider: unknown): ConfigHookProvider {
  const parsed = hookProviderSchema.safeParse(provider);
  if (!parsed.success) {
    throw new HookIntegrationError(
      "HOOK_PROVIDER_UNSUPPORTED",
      `unsupported hook provider: ${String(provider)}; supported providers: claude-code, gemini-cli`
    );
  }
  return parsed.data;
}

function providerControlOutcomes(provider: ConfigHookProvider): HookControlDecision[] {
  return provider === "claude-code" ? ["allow", "deny", "ask"] : ["allow", "deny"];
}

function managedPaths(workspaceInput: string, provider: ConfigHookProvider): ManagedPaths {
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

function forwardArgs(input: {
  workspace: string;
  provider: ConfigHookProvider;
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

/** AMC's own dist/cli.js, resolved from this installed package and never from the caller's cwd. */
export function amcCliScriptPath(mode: HookMode, moduleUrl = import.meta.url): string {
  const cliPath = resolve(dirname(fileURLToPath(moduleUrl)), "..", "..", "dist", "cli.js");
  if (mode === "control" && cliPath.split(sep).includes("_npx")) {
    throw new HookIntegrationError("HOOK_PATH_UNSAFE", "control hooks cannot run AMC from the purgeable npx cache; install AMC with npm, then re-run the install");
  }
  return cliPath;
}

function expectedHandler(input: {
  workspace: string;
  provider: ConfigHookProvider;
  mode: HookMode;
  agentId: string;
  bridgeBase: string;
  tokenPath: string;
}): JsonObject {
  const args = forwardArgs(input);
  if (input.provider === "claude-code") {
    return {
      type: "command",
      command: process.execPath,
      args: [amcCliScriptPath(input.mode), ...args],
      timeout: CLAUDE_HOOK_TIMEOUT_SECONDS,
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

/**
 * The Claude Code control handler this AMC would install for the workspace's signed manifest,
 * built from the same inputs install validates. Throws when there is no valid control manifest.
 */
export function expectedClaudeControlHandler(workspaceInput: string): JsonObject {
  const workspace = resolve(workspaceInput);
  const paths = managedPaths(workspace, "claude-code");
  const manifest = loadSignedManifest(workspace, paths);
  if (manifest?.mode !== "control") {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "no signed Claude Code control installation manifest");
  }
  validateManifestPaths(workspace, "claude-code", paths, manifest);
  const bridgeBase = normalizeBridgeBase(manifest.bridgeBase);
  assertControlBridgeLocal("control", bridgeBase);
  const agentId = validateAgentId(manifest.agentId);
  return expectedHandler({ workspace, provider: "claude-code", mode: "control", agentId, bridgeBase, tokenPath: paths.token });
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

function isOwnedHandler(provider: ConfigHookProvider, handler: unknown): handler is JsonObject {
  if (!isJsonObject(handler)) return false;
  if (provider === "gemini-cli") {
    return handler.name === HOOK_INTEGRATION_ID || handler.name === HOOK_CONTROL_INTEGRATION_ID;
  }
  return handler.statusMessage === CLAUDE_STATUS_MESSAGE || handler.statusMessage === CLAUDE_CONTROL_STATUS_MESSAGE;
}

function locateOwnedHandlers(config: JsonObject, provider: ConfigHookProvider): LocatedHandler[] {
  const found: LocatedHandler[] = [];
  for (const { eventName } of providerHookSpecs(provider)) {
    const groups = eventGroups(config, eventName, false) ?? [];
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
  }
  return found;
}

function addOwnedHandler(
  config: JsonObject,
  provider: ConfigHookProvider,
  eventName: NativeHookEventName,
  handler: JsonObject,
): void {
  const groups = eventGroups(config, eventName, true)!;
  groups.push({
    matcher: provider === "claude-code" ? "*" : ".*",
    ...(provider === "gemini-cli" ? { sequential: false } : {}),
    hooks: [handler]
  });
}

function removeOwnedHandlers(config: JsonObject, located: LocatedHandler[]): void {
  const ordered = [...located].sort((left, right) => {
    if (left.eventName !== right.eventName) return left.eventName.localeCompare(right.eventName);
    if (left.groupIndex !== right.groupIndex) return right.groupIndex - left.groupIndex;
    return right.handlerIndex - left.handlerIndex;
  });
  for (const handler of ordered) removeOwnedHandler(config, handler);
}

function handlerBindings(located: LocatedHandler[]): Array<{
  eventName: NativeHookEventName;
  handlerSha256: string;
}> {
  return located
    .map((row) => ({ eventName: row.eventName, handlerSha256: handlerHash(row.handler) }))
    .sort((left, right) => left.eventName.localeCompare(right.eventName));
}

function manifestBindings(manifest: HookManifest): Array<{
  eventName: NativeHookEventName;
  handlerSha256: string;
}> {
  if (manifest.v === 1) {
    return [{
      eventName: manifest.provider === "claude-code" ? "PreToolUse" : "BeforeTool",
      handlerSha256: manifest.handlerSha256,
    }];
  }
  return manifest.handlers
    .map((row) => ({ eventName: row.eventName, handlerSha256: row.handlerSha256 }))
    .sort((left, right) => left.eventName.localeCompare(right.eventName));
}

function bindingsEqual(
  left: Array<{ eventName: NativeHookEventName; handlerSha256: string }>,
  right: Array<{ eventName: NativeHookEventName; handlerSha256: string }>,
): boolean {
  return canonicalize(left) === canonicalize(right);
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

function validateManifestPaths(workspace: string, provider: ConfigHookProvider, paths: ManagedPaths, manifest: HookManifest): void {
  const expectedSource = manifest.v === 1 ? LEGACY_HOOK_SOURCES[provider] : providerSource(provider);
  const expectedControl = manifest.mode === "control";
  const lifecycleBindingValid = manifest.v === 1
    ? manifest.observation.eventType === "action.requested"
      && manifest.observation.correlation === (provider === "claude-code" ? "provider-call-id" : "derived-event-id")
    : canonicalize(manifest.handlers.map(({ eventName, phase }) => ({ eventName, phase }))) === canonicalize(
        providerHookSpecs(provider).map(({ eventName, phase }) => ({ eventName, phase })),
      )
      && canonicalize(manifest.observation.eventTypes) === canonicalize(providerObservedEventTypes(provider))
      && manifest.observation.correlation === (
        provider === "claude-code" ? "provider-call-id" : "derived-request-id-with-terminal-resolution"
      );
  if (
    manifest.installationId !== integrationId(manifest.mode) ||
    manifest.provider !== provider ||
    canonicalize(manifest.source) !== canonicalize(expectedSource) ||
    manifest.configPath !== relativePortable(workspace, paths.config) ||
    manifest.ignorePath !== relativePortable(workspace, paths.ignore) ||
    manifest.tokenPath !== relativePortable(workspace, paths.token) ||
    manifest.ignoreBlockSha256 !== ignoreBlockHash() ||
    manifest.observation.controlDecision !== expectedControl ||
    !lifecycleBindingValid ||
    (expectedControl
      ? manifest.control?.endpoint !== CONTROL_HOOK_ROUTE
        || manifest.control.leaseScope !== "hook:control"
        || canonicalize(manifest.control.providerOutcomes) !== canonicalize(providerControlOutcomes(provider))
      : manifest.control !== null)
  ) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest source, path, or provider binding is invalid");
  }
}

function limitations(provider: ConfigHookProvider, mode: HookMode): string[] {
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

function unchangedInstallResult(input: {
  workspace: string;
  provider: ConfigHookProvider;
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
  if (options.provider === "pi") return installPiHook(options, join(dirname(amcCliScriptPath(parseMode(options.mode))), "adapters", "pi", "amcPiExtension.js"));
  const provider = parseProvider(options.provider);
  const { mode, workspace, agentId, bridgeBase, ttl, rpm } = parseInstallOptions(options);
  const paths = managedPaths(workspace, provider);
  assertAllPathsSafe(workspace, Object.values(paths));

  const execute = (): HookMutationResult => {
    const config = loadConfig(paths.config);
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreRaw = ignoreBefore.existed ? (ignoreBefore.bytes ?? Buffer.alloc(0)).toString("utf8") : null;
    const desiredIgnoreText = addManagedIgnoreBlock(ignoreRaw);
    const desiredIgnoreBytes = Buffer.from(desiredIgnoreText, "utf8");
    const existingManifest = loadSignedManifest(workspace, paths);
    if (existingManifest) validateManifestPaths(workspace, provider, paths, existingManifest);
    const owned = locateOwnedHandlers(config.value, provider);
    if (!existingManifest && owned.length > 0) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "provider config contains an AMC-marked hook without a signed installation manifest");
    }
    if (existingManifest && !bindingsEqual(handlerBindings(owned), manifestBindings(existingManifest))) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler set differs from the signed installation manifest");
    }

    const { path: approvalPath, sigPath: approvalSigPath, before: approvalBefore, sigBefore: approvalSigBefore } =
      controlApprovalPolicy(workspace, mode);

    const desiredHandler = expectedHandler({ workspace, provider, mode, agentId, bridgeBase, tokenPath: paths.token });
    const desiredHandlerHash = handlerHash(desiredHandler);
    const desiredHandlers = providerHookSpecs(provider).map((spec) => ({
      ...spec,
      handler: desiredHandler,
      handlerSha256: desiredHandlerHash,
    }));
    const desiredBindings = desiredHandlers.map((row) => ({
      eventName: row.eventName,
      handlerSha256: row.handlerSha256,
    }));
    const existingLease = verifyManagedLease({ workspace, tokenPath: paths.token, expectedAgentId: agentId, mode });
    const currentConfigSha = config.raw === null ? null : sha256Hex(Buffer.from(config.raw, "utf8"));
    if (
      existingManifest &&
      existingManifest.v === 2 &&
      existingManifest.mode === mode &&
      existingManifest.agentId === agentId &&
      existingManifest.bridgeBase === bridgeBase &&
      bindingsEqual(handlerBindings(owned), desiredBindings) &&
      bindingsEqual(manifestBindings(existingManifest), desiredBindings) &&
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

    removeOwnedHandlers(config.value, owned);
    for (const row of desiredHandlers) {
      addOwnedHandler(config.value, provider, row.eventName, row.handler);
    }
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

    const { token, payload: leasePayload, issued: issuedNewLease } = obtainHookLease({
      workspace, agentId, mode, ttl, rpm, tokenPath: paths.token, existing: existingLease,
    });

    const now = Date.now();
    const manifest = manifestSchema.parse({
      v: 2,
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
      handlers: desiredHandlers.map((row) => ({
        eventName: row.eventName,
        phase: row.phase,
        handlerSha256: row.handlerSha256,
      })),
      installedTs: existingManifest?.installedTs ?? now,
      updatedTs: now,
      observation: {
        eventTypes: providerObservedEventTypes(provider),
        controlDecision: mode === "control",
        rawProviderInputForwarded: false,
        correlation: provider === "claude-code" ? "provider-call-id" : "derived-request-id-with-terminal-resolution"
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

  return options.dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}

export function getHookIntegrationStatus(input: { workspace: string; provider: HookProvider }): HookIntegrationStatus {
  if (input.provider === "pi") return piHookStatus(input.workspace);
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
  assertAllPathsSafe(workspace, Object.values(paths));
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
  let configOwned = manifest ? bindingsEqual(handlerBindings(owned), manifestBindings(manifest)) : false;
  if (manifest && owned.length === 0) issues.push("managed hook handler is missing from provider config");
  if (manifest && owned.length > 0 && !configOwned) {
    issues.push("managed hook handler set differs from the signed installation manifest");
    configOwned = false;
  }
  if (manifest?.v === 1) {
    issues.push("legacy single-handler manifest requires reinstall for terminal lifecycle coverage");
  }
  if (manifest && config.raw !== null && sha256Hex(Buffer.from(config.raw, "utf8")) !== manifest.configSha256) {
    issues.push("provider config changed after installation");
  }
  const ignoreRaw = existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null;
  const ignoreProtected = hasManagedIgnoreBlock(ignoreRaw);
  if (manifest && !ignoreProtected) issues.push(".amc/hooks/ is not protected by .gitignore");

  const lease = managedLeaseStatus(workspace, paths.token, manifest, issues);

  let state: HookIntegrationStatus["state"] = "installed";
  if (!manifestValid || !lease.valid && !lease.expired || !ignoreProtected || issues.some((issue) => issue.includes("signature") || issue.includes("permissions") || issue.includes("lease ID"))) {
    state = "invalid";
  } else if (lease.expired) {
    state = "expired";
  } else if (!configOwned || manifest?.v === 1 || (manifest && config.raw !== null && sha256Hex(Buffer.from(config.raw, "utf8")) !== manifest.configSha256)) {
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
  if (options.provider === "pi") return removePiHook(options);
  const provider = parseProvider(options.provider);
  const workspace = resolve(options.workspace);
  const paths = managedPaths(workspace, provider);
  assertAllPathsSafe(workspace, Object.values(paths));
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
    if (!bindingsEqual(handlerBindings(owned), manifestBindings(manifest))) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler set differs from the signed installation manifest");
    }
    removeOwnedHandlers(config.value, owned);
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
  return options.dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}

const baseProviderInputSchema = z.object({
  session_id: z.string().min(1).max(4096).optional(),
  hook_event_name: z.string().min(1).max(128),
  tool_name: z.string().min(1).max(4096),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  error: z.unknown().optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  tool_use_id: z.string().min(1).max(4096).optional(),
  tool_call_id: z.string().min(1).max(4096).optional(),
}).passthrough();

type ParsedProviderHookInput = z.infer<typeof baseProviderInputSchema>;
type ProviderCorrelationSource = HookActionIdentitySource | "bridge-unmatched-request";

export interface ProviderHookEventInspection {
  eventName: NativeHookEventName;
  eventType: "action.requested" | "action.completed" | "action.failed";
  phase: LifecyclePhase;
  correlationSha256: string;
}

function stablePrivateId(prefix: string, provider: ConfigHookProvider, value: string): string {
  return `${prefix}_${sha256Hex(`${provider}:${value}`).slice(0, 32)}`;
}

function safeToolName(raw: string): string {
  const redacted = redactBridgeText(raw).trim().slice(0, 512);
  return redacted || "unknown-tool";
}

function parseProviderHookInput(rawInput: string): ParsedProviderHookInput {
  const parsed = parseUnambiguousJson(rawInput, "input");
  const result = baseProviderInputSchema.safeParse(parsed);
  if (!result.success) {
    throw new HookIntegrationError("HOOK_INPUT_INVALID", "provider hook input does not contain the required tool event fields");
  }
  return result.data;
}

function hasProviderError(value: unknown): boolean {
  if (!isJsonObject(value) || !("error" in value)) return false;
  const error = value.error;
  return error !== undefined && error !== null && error !== false && error !== "";
}

function hookEventSpec(provider: ConfigHookProvider, parsed: ParsedProviderHookInput): ProviderHookSpec {
  const spec = providerHookSpecs(provider).find((row) => row.eventName === parsed.hook_event_name);
  if (!spec) {
    throw new HookIntegrationError(
      "HOOK_INPUT_UNSUPPORTED",
      `${provider} hook forwarder does not support ${parsed.hook_event_name}`,
    );
  }
  if (provider === "gemini-cli" && spec.eventName === "AfterTool" && hasProviderError(parsed.tool_response)) {
    return { ...spec, eventType: "action.failed" };
  }
  return spec;
}

function hookCorrelationSha256(provider: ConfigHookProvider, parsed: ParsedProviderHookInput, rawInputSha256: string): {
  actionId: string;
  correlationSha256: string;
  source: HookActionIdentitySource;
} {
  return resolveProviderHookRequestIdentity({
    provider,
    providerActionId: parsed.tool_use_id ?? parsed.tool_call_id,
    sessionId: parsed.session_id,
    timestamp: parsed.timestamp,
    toolName: parsed.tool_name,
    toolInput: parsed.tool_input,
    rawInputSha256,
  });
}

export function inspectProviderHookEvent(input: {
  provider: HookProvider;
  rawInput: string;
}): ProviderHookEventInspection {
  const provider = parseProvider(input.provider);
  const parsed = parseProviderHookInput(input.rawInput);
  const spec = hookEventSpec(provider, parsed);
  const rawInputSha256 = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  return {
    eventName: spec.eventName,
    eventType: spec.eventType,
    phase: spec.phase,
    correlationSha256: hookCorrelationSha256(provider, parsed, rawInputSha256).correlationSha256,
  };
}

export function mapProviderHookEvent(input: {
  provider: HookProvider;
  agentId: string;
  rawInput: string;
  observedAt?: number;
  resolvedActionId?: string;
}): ObservedAepActionEvent {
  const provider = parseProvider(input.provider);
  const agentId = validateAgentId(input.agentId);
  const parsed = parseProviderHookInput(input.rawInput);
  const spec = hookEventSpec(provider, parsed);
  const observedAt = input.observedAt ?? Date.now();
  if (!Number.isFinite(observedAt)) {
    throw new HookIntegrationError("HOOK_INPUT_INVALID", "observed timestamp must be finite");
  }
  const rawHash = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  const eventId = `evt_${sha256Hex(`${provider}:${observedAt}:${rawHash}`).slice(0, 32)}`;
  const requestIdentity = hookCorrelationSha256(provider, parsed, rawHash);
  let actionId = requestIdentity.actionId;
  let correlationSource: ProviderCorrelationSource = requestIdentity.source;
  if (spec.phase !== "requested") {
    const providerActionId = parsed.tool_use_id ?? parsed.tool_call_id;
    if (provider === "claude-code" && isSafeProviderActionId(providerActionId)) {
      actionId = providerActionId;
      correlationSource = "provider-call-id";
    } else if (provider === "gemini-cli" && isSafeProviderActionId(input.resolvedActionId)) {
      actionId = input.resolvedActionId;
      correlationSource = "bridge-unmatched-request";
    } else {
      throw new HookIntegrationError(
        "HOOK_CORRELATION_REQUIRED",
        `${provider} terminal hook requires a verified request correlation before it can be observed`,
      );
    }
  }
  const toolName = safeToolName(parsed.tool_name);
  const isMcp = provider === "claude-code" ? toolName.startsWith("mcp__") : toolName.startsWith("mcp_");
  const action = {
    type: "tool_call" as const,
    id: actionId,
    ...(spec.eventType === "action.completed" ? { status: "success" as const } : {}),
    ...(spec.eventType === "action.failed" ? {
      status: "failure" as const,
      error: { code: "PROVIDER_TOOL_FAILURE" },
    } : {}),
  };
  const event = {
    aep_version: "0.1",
    id: eventId,
    type: spec.eventType,
    time: new Date(observedAt).toISOString(),
    hook: spec.eventName,
    agent: {
      slug: agentId,
      surface: provider
    },
    ...(parsed.session_id ? {
      session: { id: stablePrivateId("session", provider, parsed.session_id) }
    } : {}),
    action,
    tool: {
      type: isMcp ? "mcp" : "native",
      name: toolName,
      original_name: toolName
    },
    ...(isMcp ? {
      server: { name: "provider-declared-mcp" }
    } : {}),
    extensions: {
      "x-amc-correlation": {
        v: 1,
        provider,
        sha256: requestIdentity.correlationSha256,
        source: correlationSource,
        rawStored: false,
      },
    },
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
  provider: ConfigHookProvider;
  mode: HookMode;
  agentId: string;
  bridgeBase: string;
  tokenFile: string;
}): { bridgeBase: string; tokenPath: string; token: string } {
  const paths = managedPaths(input.workspace, input.provider);
  assertAllPathsSafe(input.workspace, Object.values(paths));
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
  if (!bindingsEqual(handlerBindings(owned), manifestBindings(manifest))) {
    throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", "managed hook handler set differs from the signed installation manifest");
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

async function resolveProviderTerminalAction(input: {
  authorization: { bridgeBase: string; token: string };
  provider: ConfigHookProvider;
  correlationSha256: string;
  retryDelayMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  const body = JSON.stringify({
    provider: input.provider,
    correlationSha256: input.correlationSha256,
  });
  const url = `${input.authorization.bridgeBase}${OBSERVED_HOOK_CORRELATION_PATH}`;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: boundedFetchSignal(input.timeoutMs, input.signal),
        headers: {
          authorization: `Bearer ${input.authorization.token}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
        },
        body,
      });
      if (response.status >= 500 && attempt === 0) {
        await response.arrayBuffer();
        await delay(input.retryDelayMs);
        continue;
      }
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        const reason = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
        throw new HookIntegrationError(
          "HOOK_CORRELATION_REQUIRED",
          `terminal hook correlation failed closed: ${reason}`,
        );
      }
      if (payload?.resolved !== true || !isSafeProviderActionId(payload.actionId)) {
        throw new HookIntegrationError("HOOK_CORRELATION_REQUIRED", "terminal hook correlation response is incomplete");
      }
      return payload.actionId;
    } catch (error) {
      if (error instanceof HookIntegrationError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        await delay(input.retryDelayMs);
        continue;
      }
    }
  }
  throw new HookIntegrationError(
    "HOOK_CORRELATION_REQUIRED",
    `terminal hook correlation failed before a verified response${lastError ? `: ${lastError}` : ""}`,
  );
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
  signal?: AbortSignal;
}): Promise<{
  status: number;
  receiptId: string;
  idempotentReplay: boolean;
  actionId: string;
  sourceEventType: ObservedAepActionEvent["type"];
}> {
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
  const retryDelayMs = input.retryDelayMs ?? 100;
  const timeoutMs = input.timeoutMs ?? 5_000;
  const inspection = inspectProviderHookEvent({ provider, rawInput: input.rawInput });
  const resolvedActionId = provider === "gemini-cli" && inspection.phase !== "requested"
    ? await resolveProviderTerminalAction({
        authorization,
        provider,
        correlationSha256: inspection.correlationSha256,
        retryDelayMs,
        timeoutMs,
        signal: input.signal,
      })
    : undefined;
  const event = mapProviderHookEvent({
    provider,
    agentId,
    rawInput: input.rawInput,
    observedAt: input.observedAt,
    resolvedActionId,
  });
  const body = JSON.stringify(event);
  const url = `${authorization.bridgeBase}${OBSERVED_AEP_HOOK_PATH}`;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: boundedFetchSignal(timeoutMs, input.signal),
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
        idempotentReplay: payload.idempotentReplay === true,
        actionId: typeof payload.actionId === "string" ? payload.actionId : event.action.id,
        sourceEventType: event.type,
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
  signal?: AbortSignal;
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
        signal: boundedFetchSignal(timeoutMs, input.signal),
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
