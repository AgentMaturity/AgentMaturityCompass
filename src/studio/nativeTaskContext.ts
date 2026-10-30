/**
 * What a Studio native task's runtime is told about its agent (P2-37; design §10.3): the agent's signed prompt pack and
 * the A4 context plugin Adapt built, loaded into the system prompt of the ACP child the task spawns. Each is loaded only
 * when its signature verifies under this workspace's keys (the pack: verifyWorkspacePromptPack over the bytes read; the
 * plugin: its `a4-context-plugin` artifact signature). In a regulated workspace (an active compiled plan, or a plan
 * journal that cannot be read) a pack or plugin that is present but does not verify refuses the start
 * (AGENT_CONTEXT_UNVERIFIED); elsewhere it is not loaded and the task starts without it. Nothing present, nothing
 * loaded: the child keeps its own default prompt. The prompt reaches the child through NATIVE_TASK_SYSTEM_PROMPT_ENV,
 * which `amc acp` reads and unsets before anything runs (never argv, which other local users can read).
 */
import { readSignedAgentContextPlugin } from "../prompt/agentContextPluginFile.js";
import { readPromptPackSnapshot } from "../prompt/promptPackSnapshot.js";
import { NativeTaskServiceError } from "./nativeTaskTypes.js";

/** `amc acp`'s own default system prompt (src/acp/acpCli.ts), kept when no pack is loaded. */
export const NATIVE_DEFAULT_SYSTEM_PROMPT = "You are a careful assistant.";
/** A composed prompt larger than this is not handed to the child (environment size), and is refused like an unverified one. */
const NATIVE_SYSTEM_PROMPT_MAX_BYTES = 64 * 1024;

export interface NativeTaskContext {
  /** The composed system prompt, or null when nothing was loaded (the child keeps its default). */
  readonly systemPrompt: string | null;
  /** What was loaded, e.g. `prompt-pack:<sha256>`, `context-plugin:<sha256>@<source>`. */
  readonly loaded: readonly string[];
  /** What was present and not loaded, with why (non-regulated workspaces only; a regulated one refuses instead). */
  readonly skipped: readonly string[];
}

const packTextFor = (provider: string, system: { openai: string; anthropic: string; gemini: string }): string =>
  provider === "anthropic" ? system.anthropic : provider === "gemini" || provider === "gemini-audio" ? system.gemini : system.openai;

export function loadNativeTaskContext(input: { workspace: string; agentId: string; provider: string; regulated: boolean }): NativeTaskContext {
  const loaded: string[] = [], skipped: string[] = [], parts: string[] = [];
  const refuse = (what: string): void => {
    if (input.regulated) {
      throw new NativeTaskServiceError("AGENT_CONTEXT_UNVERIFIED", 409,
        `The agent's ${what}; a regulated workspace starts no native task without it. Rebuild or re-sign it, then start again.`);
    }
    skipped.push(what);
  };
  const pack = readPromptPackSnapshot(input.workspace, input.agentId);
  if (pack.present && (pack.verified !== true || pack.system === null)) refuse(`prompt pack does not verify under this workspace's keys (${pack.problems} problem(s))`);
  else if (pack.present && pack.system !== null) {
    parts.push(packTextFor(input.provider, pack.system));
    loaded.push(`prompt-pack:${pack.sha256}`);
  }
  const plugin = readSignedAgentContextPlugin(input.workspace, input.agentId);
  if (plugin.status === "unverified") refuse(`A4 context plugin is not signed or does not verify (${plugin.reason})`);
  else if (plugin.status === "verified") {
    parts.push(plugin.plugin.text);
    loaded.push(`context-plugin:${plugin.plugin.sha256}@${plugin.plugin.source}`);
  }
  if (loaded.length === 0) return { systemPrompt: null, loaded, skipped };
  const systemPrompt = (loaded[0]!.startsWith("prompt-pack:") ? parts : [NATIVE_DEFAULT_SYSTEM_PROMPT, ...parts]).join("\n\n");
  if (Buffer.byteLength(systemPrompt, "utf8") > NATIVE_SYSTEM_PROMPT_MAX_BYTES) {
    refuse(`prompt pack and context plugin exceed ${NATIVE_SYSTEM_PROMPT_MAX_BYTES} bytes together`);
    return { systemPrompt: null, loaded: [], skipped };
  }
  return { systemPrompt, loaded, skipped };
}
