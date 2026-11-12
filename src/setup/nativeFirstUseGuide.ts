import { statSync } from "node:fs";
import { resolveAgentId } from "../fleet/paths.js";
import { join, resolve } from "node:path";
import { credentialRef } from "../credentials/credentialRef.js";
import type { CredentialDescription } from "../credentials/credentialSources.js";
import { CredentialsFileParseError, CredentialsFilePermissionsError } from "../credentials/credentialsStoreErrors.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";
import { OLLAMA_DEFAULT_BASE_URL } from "../llm/providers/ollamaContract.js";
import { credentialOptionalOrigin, OPENAI_COMPATIBLE_ROUTES, openaiCompatibleRouteFor } from "../llm/providers/openaiCompatibleRoutes.js";
import { defaultCredentialRefFor, nativeRouteDefaults } from "../llm/nativeRouteDefaults.js";

const COMPATIBLE = OPENAI_COMPATIBLE_ROUTES.map(route => route.providerId);
/** Every provider the native CLI/ACP route inventory admits (see cli-agent-options.ts), in the order the guide offers them. */
export const NATIVE_FIRST_USE_PROVIDERS: readonly string[] = Object.freeze(["openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama", ...COMPATIBLE, "stub"]);
export type NativeFirstUseProvider = string;
export const NATIVE_FIRST_USE_PROVIDER_LIST = `openai (Chat Completions), openai-responses, anthropic, deepseek, gemini, gemini-audio, ollama (local model server), ${COMPATIBLE.join(", ")} (OpenAI-compatible), or stub`;
function isNativeFirstUseProvider(value: string): value is NativeFirstUseProvider {
  return NATIVE_FIRST_USE_PROVIDERS.includes(value);
}
/** The origin a route will call: the override, else the provider's documented default (null: the operator must name one). */
function effectiveOrigin(provider: string, baseUrl: string | null): string | null {
  return baseUrl ?? (provider === "ollama" ? OLLAMA_DEFAULT_BASE_URL : nativeRouteDefaults(provider)?.defaultBaseUrl ?? null);
}
/** Ollama, and an OpenAI-compatible local server on a plain-http loopback origin, need no credential reference. */
function credentialOptional(provider: string, origin: string | null): boolean {
  return provider === "stub" || provider === "ollama" || (openaiCompatibleRouteFor(provider) !== null && origin !== null && credentialOptionalOrigin(origin));
}
function choiceLabel(provider: string): string {
  if (provider === "stub") return "Local recording demonstration (no model answer)";
  if (provider === "ollama") return "ollama: real task with a local model server (no credential reference; supply --credential only for an authenticated origin)";
  const compat = openaiCompatibleRouteFor(provider);
  if (compat !== null && compat.defaultBaseUrl === null) return `${provider}: real task on your ${compat.displayName} resource (--base-url and --credential required)`;
  if (compat !== null && credentialOptionalOrigin(compat.defaultBaseUrl ?? "")) return `${provider}: real task with a local ${compat.displayName.replace(/ \(local\)$/, "")} server (no credential reference on loopback)`;
  return `${provider === "openai" ? "openai (Chat Completions)" : provider}: real task with your model and credential reference`;
}
export interface NativeFirstUseOptions {
  readonly workspace: string;
  readonly agentId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  /** Explicit fixture boundaries; the CLI uses the runtime's default layers. */
  readonly env?: NodeJS.ProcessEnv;
  readonly userEnvPath?: string;
}
export interface NativeGuideAction {
  readonly cwd: string;
  /** Executable followed by arguments. Never executed by the guide. */
  readonly argv: readonly string[];
}
export interface NativeFirstUseGuide {
  readonly schemaVersion: "2026-09-08";
  readonly status: "choose-provider" | "needs-setup" | "needs-model" | "needs-credential" | "blocked" | "ready";
  readonly code: string;
  readonly message: string;
  readonly agentId: string;
  readonly provider: NativeFirstUseProvider | null;
  readonly model: string | null;
  readonly baseUrl: string | null;
  readonly credential: ({ readonly ref: string } & CredentialDescription) | null;
  readonly workspace: { readonly path: string; readonly directoryPresent: boolean | null; readonly configPresent: boolean | null };
  readonly choices: readonly { readonly provider: NativeFirstUseProvider; readonly label: string; readonly action: NativeGuideAction }[];
  readonly nextAction: NativeGuideAction | null;
  readonly recheck: NativeGuideAction | null;
  readonly boundary: string;
}

const BOUNDARY = "Local inspection only. No provider authentication, model access, signing, or task completion has been tested. The selected agent is pinned in native task commands; existing signed policy and budgets still apply.";
const TASK = "Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.";

/** A POSIX shell display, with argv retained separately for other shells. */
export function renderNativeGuideCommand(action: NativeGuideAction): string {
  return action.argv.map(arg => /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
}

/**
 * Smoke L-2: the evidence-verification command in the form that works. Without an operator pin the verdict is
 * UNANCHORED and exits 1, so unless AMC_EXPECTED_MONITOR_FINGERPRINT is set the hint carries --expect-monitor and the
 * documented way to obtain it (docs/EVIDENCE_TRUST.md). The fingerprint is never read from the workspace here.
 */
export function renderNativeVerifyHint(cwd: string, sessionId: string): string {
  const command = renderNativeGuideCommand({ cwd, argv: ["amc", "agent-loop", "verify", sessionId] });
  return process.env.AMC_EXPECTED_MONITOR_FINGERPRINT?.trim() ? command
    : `${command} --expect-monitor <monitor sha256>\n  (<monitor sha256>: shasum -a 256 .amc/keys/monitor_ed25519.pub, recorded outside this workspace when it was created; or set AMC_EXPECTED_MONITOR_FINGERPRINT or a trust list)`;
}

function pathKind(path: string): "missing" | "directory" | "file" | "other" {
  try {
    const stats = statSync(path);
    return stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

/** Reads path presence and credential metadata only; never opens an AMC session. */
export async function inspectNativeFirstUse(options: NativeFirstUseOptions): Promise<NativeFirstUseGuide> {
  const cwd = resolve(options.workspace);
  let baseUrl: string | null = null;
  let endpointError = false;
  // OpenAI-compatible bases may carry a path (Groq `/openai`, Azure `/openai`): the adapter appends `/v1/chat/completions`.
  const pathAllowed = options.provider !== undefined && openaiCompatibleRouteFor(options.provider) !== null;
  if (options.baseUrl !== undefined) {
    try {
      const url = new URL(options.baseUrl);
      if (/[\x00-\x20\x7f]/.test(options.baseUrl) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (!pathAllowed && url.pathname !== "/")) throw new Error("invalid origin");
      baseUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    } catch { endpointError = true; }
  }
  const endpointArgs = baseUrl === null ? [] : ["--base-url", baseUrl];
  let agentId = "default";
  let identityError = false;
  try { agentId = resolveAgentId(cwd, options.agentId); } catch { identityError = true; }
  const action = (...argv: string[]): NativeGuideAction => ({ cwd, argv });
  const nativeAction = (...argv: string[]): NativeGuideAction => action("amc", "--agent", agentId, "agent-loop", ...argv);
  const homeArgs = options.credentialsHome === undefined ? [] : ["--credentials-home", options.credentialsHome];
  const overrides = [...homeArgs,
    ...(options.credentialsFile === undefined ? [] : ["--credentials-file", options.credentialsFile])];
  let result: NativeFirstUseGuide = {
    schemaVersion: "2026-09-08", status: "choose-provider", code: "PROVIDER_REQUIRED",
    message: "Choose a provider for a real task, or choose the local recording demonstration.",
    agentId, provider: null, model: null, baseUrl, credential: null,
    workspace: { path: cwd, directoryPresent: null, configPresent: null },
    choices: [],
    nextAction: null, recheck: null, boundary: BOUNDARY
  };
  const finish = (status: NativeFirstUseGuide["status"], code: string, message: string, nextAction: NativeGuideAction | null = null): NativeFirstUseGuide =>
    ({ ...result, status, code, message, nextAction });
  if (endpointError || identityError) result = { ...result, choices: [] };
  if (endpointError) return finish("blocked", "PROVIDER_ORIGIN_INVALID", "Use an HTTP(S) server origin without a path, query, fragment or embedded credentials. Set secrets through a credential reference.");
  if (identityError) return finish("blocked", "AGENT_SELECTION_INVALID", "Could not read a valid selected agent. Inspect --agent, AMC_AGENT_ID and .amc/current-agent before continuing.");
  if (options.provider !== undefined && !isNativeFirstUseProvider(options.provider)) {
    return finish("blocked", "PROVIDER_UNSUPPORTED", `Choose ${NATIVE_FIRST_USE_PROVIDER_LIST} with --provider.`);
  }
  // Terminal control characters cannot form useful copyable model/path inputs.
  if ([options.model, options.credentialsHome, options.credentialsFile, cwd].some(value => value !== undefined && /[\x00-\x1f\x7f]/.test(value))) {
    return finish("blocked", "ARGUMENT_INVALID", "Model and path arguments must not contain control characters.");
  }
  let requestedRef: ReturnType<typeof credentialRef> | undefined;
  try {
    if (options.provider !== "stub" && options.credential !== undefined) requestedRef = credentialRef(options.credential);
  } catch {
    return finish("blocked", "AMC_CREDENTIAL_REF_INVALID", "Use a credential reference name, such as OPENAI_API_KEY; never pass a key value.");
  }
  if (options.provider === undefined) return {
    ...result,
    choices: NATIVE_FIRST_USE_PROVIDERS.map(provider => ({
      provider,
      label: choiceLabel(provider),
      // Choosing a provider must not discard setup already supplied. A deliberate
      // stub choice keeps local paths but does not inherit unused live-route data.
      action: nativeAction("guide", "--provider", provider, ...(provider === "stub" ? [] : [
        ...endpointArgs, ...(options.model?.trim() ? ["--model", options.model] : []),
        ...(requestedRef === undefined ? [] : ["--credential", requestedRef])
      ]), ...overrides)
    }))
  };
  const provider = options.provider as NativeFirstUseProvider;
  // The run's own rule: a default reference goes only to the provider's own origin, never to an --base-url override.
  // ollama keeps an explicit reference only for an operator-configured authenticated origin; it is never assumed.
  const defaultRef = defaultCredentialRefFor(provider, baseUrl ?? undefined);
  const ref = provider === "stub" ? null : requestedRef ?? (defaultRef === null ? null : credentialRef(defaultRef));
  if (provider === "stub" && (options.baseUrl !== undefined || options.credential !== undefined || (options.model !== undefined && options.model !== STUB_PROVIDER_MODEL))) {
    return finish("blocked", "STUB_OPTIONS_UNUSED", `The local demonstration uses ${STUB_PROVIDER_MODEL} without a credential reference. Omit --base-url, --credential and --model.`);
  }
  const model = provider === "stub" ? STUB_PROVIDER_MODEL : options.model?.trim() ? options.model : null;
  result = { ...result, provider, model, choices: [], recheck: nativeAction("guide", "--provider", provider, ...endpointArgs,
    ...(model === null ? [] : ["--model", model]), ...(ref === null ? [] : ["--credential", ref]), ...overrides) };
  const origin = effectiveOrigin(provider, baseUrl);
  if (provider !== "stub" && origin === null) {
    return finish("blocked", "PROVIDER_ORIGIN_REQUIRED", `${provider} has no default origin: rerun with --base-url (Azure OpenAI: https://<resource>.openai.azure.com/openai) and --credential <reference>.`);
  }
  if (ref === null && !credentialOptional(provider, origin)) {
    const own = nativeRouteDefaults(provider);
    return finish("blocked", "CREDENTIAL_REF_REQUIRED", own?.defaultCredentialRef && own.defaultBaseUrl
      ? `${provider} uses its default reference ${own.defaultCredentialRef} only against its own origin (${own.defaultBaseUrl}). Name the reference for ${origin} explicitly with --credential.`
      : `${provider} has no default credential reference for ${origin}; rerun with --credential <reference>.`);
  }
  let store: LocalCredentialsService | undefined;
  try {
    const directory = pathKind(join(cwd, ".amc"));
    const config = directory === "directory" ? pathKind(join(cwd, ".amc", "amc.config.yaml")) : "missing";
    result = { ...result, workspace: { path: cwd, directoryPresent: directory === "directory", configPresent: config === "file" } };
    if (directory === "missing") return finish("needs-setup", "WORKSPACE_MISSING", "Initialize this workspace explicitly, then rerun the guide. This is a setup recommendation; the guide has created nothing.", action("amc", "init", "--minimal"));
    if (directory !== "directory" || config !== "file") return finish("blocked", "WORKSPACE_INCOMPLETE", "The existing .amc path lacks the expected directory or config file. Inspect it before changing setup; the guide will not overwrite it.", action("amc", "doctor"));
    store = new LocalCredentialsService({
      watch: false, projectDir: cwd,
      ...(options.credentialsHome === undefined ? {} : { homeDir: options.credentialsHome }),
      ...(options.credentialsFile === undefined ? {} : { path: options.credentialsFile }),
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.userEnvPath === undefined ? {} : { userEnvPath: options.userEnvPath })
    });
    if (ref !== null) result = { ...result, credential: { ref, ...store.describe(ref) } };
    if (model === null) return finish("needs-model", "MODEL_REQUIRED", "Choose a model ID you can access and rerun the guide with --model. No model default or remote access check is implied.");
    // Pin the exact inspected file in both actions. The same project and user
    // .env layers still apply, and environment values still have precedence.
    const file = store.paths.file;
    const home = options.credentialsHome === undefined ? [] : ["--home", options.credentialsHome];
    if (result.credential?.configured === false) return finish("needs-credential", "CREDENTIAL_MISSING", "Set the reference using the masked terminal prompt (or stdin), then rerun the guide. Never add the key value to the command.", action("amc", "credentials", "set", ref!, ...home, "--file", file, "--project-dir", cwd));
    return finish("ready", "LOCAL_CONFIGURATION_PRESENT", provider === "stub"
      ? "Run a local recording demonstration. Its canned response is not a real model answer."
      : provider === "ollama" || ref === null
        ? `Local setup markers are present. Run this bounded task against your local model server (${origin}); the server must be running with the model ${provider === "ollama" ? "pulled" : "loaded"}, and no credential is used${ref === null ? "" : " beyond the supplied reference"}. Provider errors remain possible.`
        : "Local setup markers and credential metadata are present. Run this bounded task to request a real model answer; provider errors remain possible.",
    nativeAction("run", provider === "stub" ? "Check recording with a local demonstration." : TASK,
      "--provider", provider, ...endpointArgs, "--model", model, ...(ref === null ? [] : ["--credential", ref]),
      ...homeArgs, "--credentials-file", file, "--tools", provider === "stub" ? "echo" : "none", "--max-steps", provider === "stub" ? "2" : "1", "--max-tokens", "512"));
  } catch (error) {
    if (error instanceof CredentialsFilePermissionsError) return finish("blocked", error.code,
      `The credentials ${error.kind} permissions allow other users access. Review the exposure and restrict permissions, then rerun the guide.`,
      action("chmod", error.kind === "file" ? "600" : "700", error.path));
    if (error instanceof CredentialsFileParseError) return finish("blocked", error.code,
      `Repair the credentials file ${JSON.stringify(error.path)}${error.position ? ` at line ${error.position.line}, column ${error.position.column}` : ""}, then rerun the guide. File content is withheld.`);
    return finish("blocked", "LOCAL_INSPECTION_FAILED", "Could not read local setup. Check workspace and credential-file access, then rerun the guide.");
  } finally {
    if (store !== undefined) await store.close();
  }
}

/**
 * Smoke L-1: when the selected credential reference is not configured, the guide's own fix (the reference and its masked
 * `amc credentials set` command) so a run can refuse before opening a session; otherwise null.
 */
export async function missingCredentialGuidance(options: NativeFirstUseOptions): Promise<string | null> {
  try {
    const guide = await inspectNativeFirstUse(options);
    if (guide.status !== "needs-credential" || guide.credential === null || guide.nextAction === null) return null;
    const ref = guide.credential.ref;
    return `MISSING_CREDENTIAL: credential reference ${ref} for provider ${guide.provider} is not configured; no session was opened. `
      + `Set ${ref} in the environment, or store it with the masked prompt (POSIX shell, in ${JSON.stringify(guide.nextAction.cwd)}):\n  ${renderNativeGuideCommand(guide.nextAction)}`;
  } catch {
    return null; // The runtime still refuses an unresolvable reference with its recorded MISSING_CREDENTIAL.
  }
}

export function renderNativeFirstUseGuide(guide: NativeFirstUseGuide): string {
  const lines = [`Native first task · agent ${guide.agentId}`, "", guide.message, "", guide.boundary];
  if (guide.baseUrl !== null) lines.push(`Provider origin: ${guide.baseUrl} (not contacted by this guide).`);
  if (guide.credential !== null) lines.push(`Credential reference ${guide.credential.ref}: ${guide.credential.configured ? `configured in ${guide.credential.source}` : "not configured"}.`);
  for (const choice of guide.choices) lines.push("", choice.label, `  ${renderNativeGuideCommand(choice.action)}`);
  if (guide.nextAction !== null) lines.push("", `Next action (POSIX shell, in ${JSON.stringify(guide.nextAction.cwd)}):`, `  ${renderNativeGuideCommand(guide.nextAction)}`);
  if (guide.recheck !== null && guide.status !== "ready") lines.push("", "After addressing the requirement, rerun:", `  ${renderNativeGuideCommand(guide.recheck)}`);
  lines.push("", "Use --json for structured argv and local inspection status.");
  return lines.join("\n");
}
