import chalk from "chalk";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { readEventPayload } from "../session/eventPayload.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { extractSpillRef } from "../session/spill/spillTypes.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { sha256Hex } from "../utils/hash.js";
import type { EvidenceEvent } from "../types.js";

const OUTCOMES = new Set(["OK", "ERROR", "DENIED", "CANCELLED", "TOOL_OUTCOME_UNKNOWN"]);
const MAX_RESULTS = 12;
const TARGET_KEYS = ["path", "file_path", "command", "cmd", "url", "pattern", "query", "name"];
const SIMULATED = "\nsimulated, not executed: ";

function short(text: string, max: number): string {
  const flat = escapeTerminalControls(text.replace(/\s+/g, " ").trim());
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** A payload's text, or why it is not shown (missing, pruned, or bytes that do not match the signed digest). */
function readText(workspace: string, event: EvidenceEvent): { text: string } | { problem: string } {
  const payload = readEventPayload(workspace, event);
  if (payload.status !== "ok") return { problem: `recorded output ${payload.status}` };
  if (sha256Hex(payload.bytes) !== event.payload_sha256) return { problem: "recorded output failed its digest check, so it is not shown" };
  return { text: payload.bytes.toString("utf8") };
}
function payloadText(workspace: string, event: EvidenceEvent): string | null {
  const read = readText(workspace, event);
  return "text" in read ? read.text : null;
}

/** The one argument a person recognises a call by (its path, command or URL), from the recorded call. */
function callTarget(workspace: string, event: EvidenceEvent | undefined): string {
  if (event === undefined) return "";
  const text = payloadText(workspace, event);
  if (text === null) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const args = parsed !== null && typeof parsed.arguments === "object" && parsed.arguments !== null ? parsed.arguments as Record<string, unknown> : parsed;
    const key = TARGET_KEYS.find(name => typeof args[name] === "string");
    return key === undefined ? "" : short(String(args[key]), 60);
  } catch { return ""; }
}

/** First non-empty line of a result, and how many more lines it had. */
function firstLine(text: string): string {
  let body = text;
  try { const parsed: unknown = JSON.parse(text); if (typeof parsed !== "string") body = JSON.stringify(parsed); else body = parsed; } catch { /* plain text */ }
  const lines = body.split("\n").filter(line => line.trim() !== "");
  if (lines.length === 0) return "no output";
  return `${short(lines[0]!, 100)}${lines.length > 1 ? chalk.dim(` (+${lines.length - 1} more line${lines.length === 2 ? "" : "s"})`) : ""}`;
}

/**
 * One line per tool call of the session's latest turn: what was called, on what, and its recorded result or failure.
 * Read-only: the reader takes no writer. A tool outcome never establishes task completion.
 */
export function renderNativeInteractiveToolResults(workspace: string, sessionId: string): string[] {
  try {
    // Authenticate metadata before trusting tool identity, outcome or payload paths.
    const events = loadSessionEventHistory({ workspace, sessionId }).events;
    let turn: number | null = null;
    for (const event of events) if (event.event_type === "turn/start") turn = extractEnvelope(event.meta_json)?.turn ?? null;
    if (turn === null) return [];
    const current = events.filter(event => extractEnvelope(event.meta_json)?.turn === turn);
    const calls = new Map<string, { name: string; event: EvidenceEvent }>();
    for (const event of current) {
      if (event.event_type !== "tool/call") continue;
      const meta = JSON.parse(event.meta_json) as { toolCallId?: unknown; toolName?: unknown };
      if (typeof meta.toolCallId === "string" && typeof meta.toolName === "string") calls.set(meta.toolCallId, { name: meta.toolName, event });
    }
    const results = current.filter(event => event.event_type === "tool/result");
    const lines = results.slice(-MAX_RESULTS).map(event => {
      const meta = JSON.parse(event.meta_json) as { toolCallId?: unknown; outcome?: unknown; exitCode?: unknown; timedOut?: unknown };
      const call = typeof meta.toolCallId === "string" ? calls.get(meta.toolCallId) : undefined;
      const target = callTarget(workspace, call?.event);
      const head = `${escapeTerminalControls(call?.name ?? "unnamed tool")}${target === "" ? "" : ` ${target}`}`;
      const outcome = typeof meta.outcome === "string" && OUTCOMES.has(meta.outcome) ? meta.outcome : "TOOL_OUTCOME_UNKNOWN";
      const read = readText(workspace, event);
      const exit = Number.isSafeInteger(meta.exitCode) ? `exit ${String(meta.exitCode)}${meta.timedOut === true ? ", timed out" : ""}: ` : meta.timedOut === true ? "timed out: " : "";
      const spillRef = extractSpillRef(event.meta_json);
      const spill = spillRef === null ? "" : chalk.dim(spillRef.locator === null ? " (preview only; the full output was not kept)"
        : ` (preview only; full output: session.spill_read ${escapeTerminalControls(spillRef.locator)})`);
      if ("problem" in read) return `  ${chalk.yellow("?")} ${head} · ${outcome === "OK" ? "ok" : outcome} · ${read.problem}`;
      const text = read.text;
      const simulated = text.indexOf(SIMULATED);
      if (outcome === "OK" && simulated >= 0) return `  ${chalk.yellow("○")} ${head} · simulated, not run: ${short(text.slice(simulated + SIMULATED.length), 240)}`;
      if (outcome === "OK") return `  ${chalk.green("✓")} ${head} · ${exit}${firstLine(text)}${spill}`;
      // A refusal is shown whole (UX-03): its reason, a hook's own words included, is what a person acts on.
      if (outcome === "DENIED") return `  ${chalk.red("✗")} ${head} · denied: ${short(redactSecrets(text.replace(/^\[amc\] /, ""), (type) => `[REDACTED:${type}]`).redacted, 2000)}`;
      const word = outcome === "CANCELLED" ? "cancelled" : outcome === "ERROR" ? "failed" : "outcome unknown";
      return `  ${chalk.red("✗")} ${head} · ${word}: ${exit}${firstLine(text)}${spill}`;
    });
    if (results.length > MAX_RESULTS) lines.unshift(chalk.dim(`  (${results.length - MAX_RESULTS} earlier tool calls in this turn not shown; /inspect lists them)`));
    return lines;
  } catch (error) {
    return [`Tool results unavailable: ${short(error instanceof Error ? error.message : "recorded evidence could not be read", 200)}. No output was inferred.`];
  }
}
