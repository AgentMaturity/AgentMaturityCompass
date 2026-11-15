import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { canonicalImportRefusal } from "../prompt/context/instructionImports.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;

export interface AttachedPrompt {
  readonly prompt: string;
  /** One line per @file: attached, or why not. */
  readonly notes: readonly string[];
}

/**
 * `@path` in a task attaches that file's text to the prompt, as if pasted. Only regular text files inside this
 * workspace; AMC state, version control, dependencies, credential and environment files are refused, like instruction
 * imports. An `@word` that names no file (a mention, an e-mail handle) stays plain text.
 */
export function attachMentionedFiles(workspace: string, text: string): AttachedPrompt {
  const blocks: string[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const match of text.matchAll(/(?:^|\s)@([^\s]+)/g)) {
    const written = match[1]!.replace(/[.,;:!?)]+$/, "");
    if (written === "" || seen.has(written)) continue;
    seen.add(written);
    const shown = escapeTerminalControls(written);
    const path = resolve(workspace, written);
    let size: number;
    try {
      const stats = statSync(path);
      if (!stats.isFile()) { if (stats.isDirectory()) notes.push(`Not attached: @${shown} is a folder; name a file.`); continue; }
      size = stats.size;
    } catch { if (/[./]/.test(written)) notes.push(`Not attached: @${shown} (no such file in this folder).`); continue; }
    const refusal = canonicalImportRefusal(workspace, path);
    if (refusal !== null) { notes.push(`Not attached: @${shown}: ${refusal.replace(/^the import/, "the file")}.`); continue; }
    if (size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
      notes.push(`Not attached: @${shown} is too large (${Math.ceil(size / 1024)} KB; up to ${MAX_FILE_BYTES / 1024} KB per file, ${MAX_TOTAL_BYTES / 1024} KB per task). Ask the agent to read it instead.`);
      continue;
    }
    const bytes = readBounded(path, size);
    if (bytes.includes(0)) { notes.push(`Not attached: @${shown} is not a text file.`); continue; }
    const content = bytes.toString("utf8");
    total += size;
    const fence = "`".repeat(Math.max(3, ...[...content.matchAll(/`+/g)].map(run => run[0].length + 1)));
    blocks.push(`Attached file ${written}:\n${fence}\n${content}${content.endsWith("\n") ? "" : "\n"}${fence}`);
    const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    notes.push(`Attached @${shown} (${lines} line${lines === 1 ? "" : "s"}).`);
  }
  return { prompt: blocks.length === 0 ? text : `${text}\n\n${blocks.join("\n\n")}`, notes };
}

function readBounded(path: string, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  const fd = openSync(path, "r");
  try { return buffer.subarray(0, readSync(fd, buffer, 0, size, 0)); } finally { closeSync(fd); }
}

/**
 * The harmless choices a chat ran a session with (provider, model, tool level, limits, reasoning), so `chat --continue`
 * (or `--session`) can resume it without every flag. Kept in the person's AMC home, keyed by the workspace's real path,
 * never inside the workspace, and read only after the workspace is trusted. Where requests go (base URL), which credential
 * and credentials file are used, and every approval setting are never saved or restored: they come from the command line
 * each time, and resume itself refuses a session whose recorded composition differs. The unconfined shell, MCP servers,
 * extensions, presets and validation are never restored either.
 */
const RESTORED_CHAT_OPTIONS = ["provider", "model", "tools", "maxSteps", "maxTokens", "thinking", "reasoningEffort", "thinkingBudget",
  "cacheRetention", "maxRetries", "retryMaxDelay", "retryMaxProviderDelay", "contextWindow", "compactThreshold"] as const;
type RestoredKey = typeof RESTORED_CHAT_OPTIONS[number];
export type ChatSettings = Partial<Record<RestoredKey, string>> & { readonly autoSummary?: false; readonly autoCompact?: false };

function settingsDir(workspace: string, amcHome: string): string {
  let real: string;
  try { real = realpathSync(workspace); } catch { real = resolve(workspace); }
  return join(amcHome, "chat-sessions", createHash("sha256").update(real).digest("hex").slice(0, 32));
}

function settingsPath(workspace: string, sessionId: string, amcHome: string): string | null {
  return /^[A-Za-z0-9-]{1,128}$/.test(sessionId) ? join(settingsDir(workspace, amcHome), `${sessionId}.json`) : null;
}

export function saveChatSettings(workspace: string, sessionId: string, settings: ChatSettings, amcHome = resolveAmcHome()): void {
  const path = settingsPath(workspace, sessionId, amcHome);
  if (path === null) return;
  const kept = Object.fromEntries([...RESTORED_CHAT_OPTIONS, "autoSummary", "autoCompact"].flatMap(key => {
    const value = (settings as Record<string, unknown>)[key];
    return value === undefined ? [] : [[key, value]];
  }));
  try {
    mkdirSync(settingsDir(workspace, amcHome), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify({ schemaVersion: 2, sessionId, settings: kept }, null, 2)}\n`, { mode: 0o600 });
  } catch { /* Convenience only: a resume can still name its flags. */ }
}

/** The saved settings for a session, keeping only known keys with string values (or false for the two switches). */
export function loadChatSettings(workspace: string, sessionId: string, amcHome = resolveAmcHome()): ChatSettings | null {
  const path = settingsPath(workspace, sessionId, amcHome);
  if (path === null) return null;
  try {
    const row = JSON.parse(readFileSync(path, "utf8")) as { schemaVersion?: unknown; sessionId?: unknown; settings?: Record<string, unknown> };
    if (row.schemaVersion !== 2 || row.sessionId !== sessionId || row.settings === null || typeof row.settings !== "object") return null;
    const settings: Record<string, string | false> = {};
    for (const key of RESTORED_CHAT_OPTIONS) if (typeof row.settings[key] === "string" && row.settings[key] !== "") settings[key] = row.settings[key] as string;
    for (const key of ["autoSummary", "autoCompact"]) if (row.settings[key] === false) settings[key] = false;
    return settings as ChatSettings;
  } catch { return null; }
}

/**
 * Fill in what the person did not pass from a session's saved settings; anything passed on the command line wins. The tool
 * level is left out here: chat uses a saved one as its default (chatDefaults), so it never counts as the person's own
 * choice and workspace tools still come with an approval gate.
 */
export function withChatSettings<T extends object>(options: T, settings: ChatSettings): T {
  const current = options as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const key of RESTORED_CHAT_OPTIONS) if (key !== "tools" && current[key] === undefined && settings[key] !== undefined) merged[key] = settings[key];
  // Commander leaves these true unless --no-auto-summary / --no-auto-compact was passed, so only a saved false applies.
  for (const key of ["autoSummary", "autoCompact"] as const) if (settings[key] === false) merged[key] = false;
  return merged as T;
}
