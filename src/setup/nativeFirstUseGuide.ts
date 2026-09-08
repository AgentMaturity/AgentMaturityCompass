import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { credentialRef } from "../credentials/credentialRef.js";
import type { CredentialDescription } from "../credentials/credentialSources.js";
import { CredentialsFileParseError, CredentialsFilePermissionsError } from "../credentials/credentialsStoreErrors.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";

export type NativeFirstUseProvider = "openai" | "openai-responses" | "anthropic" | "stub";
export interface NativeFirstUseOptions {
  readonly workspace: string;
  readonly provider?: string;
  readonly model?: string;
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
  readonly agentId: "default";
  readonly provider: NativeFirstUseProvider | null;
  readonly model: string | null;
  readonly credential: ({ readonly ref: string } & CredentialDescription) | null;
  readonly workspace: { readonly path: string; readonly directoryPresent: boolean | null; readonly configPresent: boolean | null };
  readonly choices: readonly { readonly provider: NativeFirstUseProvider; readonly label: string; readonly action: NativeGuideAction }[];
  readonly nextAction: NativeGuideAction | null;
  readonly recheck: NativeGuideAction | null;
  readonly boundary: string;
}

const BOUNDARY = "Local inspection only. No provider authentication, model access, signing, or task completion has been tested. Native execution uses agent default; --agent does not change that identity.";
const TASK = "Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.";

/** A POSIX shell display, with argv retained separately for other shells. */
export function renderNativeGuideCommand(action: NativeGuideAction): string {
  return action.argv.map(arg => /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
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
  const action = (...argv: string[]): NativeGuideAction => ({ cwd, argv });
  let result: NativeFirstUseGuide = {
    schemaVersion: "2026-09-08", status: "choose-provider", code: "PROVIDER_REQUIRED",
    message: "Choose a provider for a real task, or choose the local recording demonstration.",
    agentId: "default", provider: null, model: null, credential: null,
    workspace: { path: cwd, directoryPresent: null, configPresent: null },
    choices: (["openai", "openai-responses", "anthropic", "stub"] as const).map(provider => ({
      provider,
      label: provider === "stub" ? "Local recording demonstration (no model answer)" : `${provider === "openai" ? "openai (Chat Completions)" : provider}: real task with your model and credential reference`,
      action: action("amc", "agent-loop", "guide", "--provider", provider)
    })),
    nextAction: null, recheck: null, boundary: BOUNDARY
  };
  const finish = (status: NativeFirstUseGuide["status"], code: string, message: string, nextAction: NativeGuideAction | null = null): NativeFirstUseGuide =>
    ({ ...result, status, code, message, nextAction });
  if (options.provider === undefined) return result;
  if (options.provider !== "openai" && options.provider !== "openai-responses" && options.provider !== "anthropic" && options.provider !== "stub") {
    return finish("blocked", "PROVIDER_UNSUPPORTED", "Choose openai (Chat Completions), openai-responses, anthropic, or stub with --provider.");
  }
  const provider = options.provider;
  // Terminal control characters cannot form useful copyable model/path inputs.
  if ([options.model, options.credentialsHome, options.credentialsFile, cwd].some(value => value !== undefined && /[\x00-\x1f\x7f]/.test(value))) {
    return finish("blocked", "ARGUMENT_INVALID", "Model and path arguments must not contain control characters.");
  }
  let ref: ReturnType<typeof credentialRef> | null = null;
  try {
    if (provider !== "stub") ref = credentialRef(options.credential ?? (provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"));
  } catch {
    return finish("blocked", "AMC_CREDENTIAL_REF_INVALID", "Use a credential reference name, such as OPENAI_API_KEY; never pass a key value.");
  }
  if (provider === "stub" && (options.credential !== undefined || (options.model !== undefined && options.model !== STUB_PROVIDER_MODEL))) {
    return finish("blocked", "STUB_OPTIONS_UNUSED", `The local demonstration uses ${STUB_PROVIDER_MODEL} without a credential reference. Omit --credential and --model.`);
  }
  const model = provider === "stub" ? STUB_PROVIDER_MODEL : options.model?.trim() ? options.model : null;
  const overrides = [
    ...(options.credentialsHome === undefined ? [] : ["--credentials-home", options.credentialsHome]),
    ...(options.credentialsFile === undefined ? [] : ["--credentials-file", options.credentialsFile])
  ];
  result = { ...result, provider, model, choices: [], recheck: action("amc", "agent-loop", "guide", "--provider", provider,
    ...(model === null ? [] : ["--model", model]), ...(ref === null ? [] : ["--credential", ref]), ...overrides) };
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
      : "Local setup markers and credential metadata are present. Run this bounded task to request a real model answer; provider errors remain possible.",
    action("amc", "agent-loop", "run", provider === "stub" ? "Check recording with a local demonstration." : TASK,
      "--provider", provider, "--model", model, ...(ref === null ? [] : ["--credential", ref]),
      "--credentials-file", file, "--tools", provider === "stub" ? "echo" : "none", "--max-steps", provider === "stub" ? "2" : "1", "--max-tokens", "512"));
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

export function renderNativeFirstUseGuide(guide: NativeFirstUseGuide): string {
  const lines = ["Native first task", "", guide.message, "", guide.boundary];
  if (guide.credential !== null) lines.push(`Credential reference ${guide.credential.ref}: ${guide.credential.configured ? `configured in ${guide.credential.source}` : "not configured"}.`);
  for (const choice of guide.choices) lines.push("", choice.label, `  ${renderNativeGuideCommand(choice.action)}`);
  if (guide.nextAction !== null) lines.push("", `Next action (POSIX shell, in ${JSON.stringify(guide.nextAction.cwd)}):`, `  ${renderNativeGuideCommand(guide.nextAction)}`);
  if (guide.recheck !== null && guide.status !== "ready") lines.push("", "After addressing the requirement, rerun:", `  ${renderNativeGuideCommand(guide.recheck)}`);
  lines.push("", "Use --json for structured argv and local inspection status.");
  return lines.join("\n");
}
