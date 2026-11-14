/**
 * Chat's setup questions, asked before its line editor exists (a readline left on stdin would also take the keys of a
 * masked question into its line and history): the provider (the one whose API key is in the environment offered as
 * the default), the model (with the family the workspace model taxonomy expects), and a missing credential, stored the
 * way `amc credentials set` stores it, behind a masked prompt. Nothing here prints or logs a key value.
 */
import { loadModelTaxonomy } from "../bridge/modelTaxonomy.js";
import { nativeRouteDefaults } from "../llm/nativeRouteDefaults.js";
import { NATIVE_FIRST_USE_PROVIDER_LIST, NATIVE_FIRST_USE_PROVIDERS, type NativeFirstUseGuide, type NativeFirstUseOptions } from "./nativeFirstUseGuide.js";

export interface ChatSetupDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly log: (line: string) => void;
  /** A plain question; null when the operator cancels (Ctrl-C). */
  readonly ask: (message: string) => Promise<string | null>;
  /** The masked question `amc credentials set` asks for a reference; null when the operator cancels. */
  readonly askSecret: (ref: string) => Promise<string | null>;
  readonly inspect: (options: NativeFirstUseOptions) => Promise<NativeFirstUseGuide>;
  readonly storeCredential: (input: { ref: string; value: string; options: NativeFirstUseOptions }) => Promise<string>;
  /** Family patterns per taxonomy provider, e.g. anthropic → ["claude-*"]. */
  readonly modelFamilies: (workspace: string, provider: string) => readonly string[];
}

/** The first real provider whose default credential reference is set in the environment (presence only, never the value). */
export function providerWithKeyInEnv(env: NodeJS.ProcessEnv): { provider: string; ref: string } | null {
  for (const provider of NATIVE_FIRST_USE_PROVIDERS) {
    const ref = nativeRouteDefaults(provider)?.defaultCredentialRef;
    if (provider !== "stub" && ref && (env[ref] ?? "").trim().length > 0) return { provider, ref };
  }
  return null;
}

/** The provider name the workspace model taxonomy files a chat provider under (bridge providers), or null. */
function taxonomyProvider(provider: string): string | null {
  if (provider === "openai" || provider === "openai-responses") return "openai";
  if (provider === "gemini" || provider === "gemini-audio") return "gemini";
  if (["anthropic", "xai", "openrouter"].includes(provider)) return provider;
  return ["ollama", "lmstudio", "vllm", "llamacpp"].includes(provider) ? "local" : null;
}

export function workspaceModelFamilies(workspace: string, provider: string): readonly string[] {
  const filed = taxonomyProvider(provider);
  if (filed === null) return [];
  try {
    return loadModelTaxonomy(workspace).taxonomy.providers.find((entry) => entry.provider === filed)?.families.map((family) => family.pattern) ?? [];
  } catch {
    return []; // an unreadable taxonomy only loses the hint
  }
}

/** Provider, model and credential for chat, or null when the operator cancelled a question. */
export async function resolveChatSetup(options: NativeFirstUseOptions, deps: ChatSetupDeps): Promise<{ provider: string; model: string | undefined; guide: NativeFirstUseGuide } | null> {
  let provider = options.provider;
  if (provider === undefined) {
    const keyed = providerWithKeyInEnv(deps.env);
    deps.log(`Choose ${NATIVE_FIRST_USE_PROVIDER_LIST.replace(/, or stub$/, "")} for a real model task; choose stub for a local recording demonstration.`);
    const answer = await deps.ask(keyed === null ? "Provider (no default): " : `Provider [${keyed.provider}, ${keyed.ref} is set]: `);
    if (answer === null) return null;
    provider = answer.trim() || keyed?.provider || "";
  }
  let model = options.model;
  if (provider !== "stub" && !model?.trim()) {
    const families = deps.modelFamilies(options.workspace, provider);
    const answer = await deps.ask(`Model ID you can access${families.length > 0 ? ` (this workspace expects ${families.join(" or ")} for ${provider})` : ""}: `);
    if (answer === null) return null;
    model = answer.trim();
  }
  const chosen = { ...options, provider, model };
  let guide = await deps.inspect(chosen);
  if (guide.status === "needs-credential" && guide.credential !== null) {
    const ref = guide.credential.ref;
    deps.log(`${ref} is not configured. Paste it to store it as \`amc credentials set ${ref}\` does (masked; never shown or put on a command line), or press Enter to stop.`);
    const value = await deps.askSecret(ref);
    if (value === null) return null;
    if (value.trim().length > 0) {
      deps.log(`Stored ${ref} in ${await deps.storeCredential({ ref, value: value.trim(), options: chosen })}.`);
      guide = await deps.inspect(chosen);
    }
  }
  return { provider, model, guide };
}
