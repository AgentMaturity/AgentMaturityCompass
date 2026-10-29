import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { readEventPayload } from "../session/eventPayload.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { extractSpillRef } from "../session/spill/spillTypes.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { sha256Hex } from "../utils/hash.js";

const OUTCOMES = new Set(["OK", "ERROR", "DENIED", "CANCELLED", "TOOL_OUTCOME_UNKNOWN"]);
const MAX_RESULTS = 8;
const MAX_TEXT = 2_000;

function display(text: string): string {
  const escaped = escapeTerminalControls(text);
  return escaped.length <= MAX_TEXT ? escaped : `${escaped.slice(0, MAX_TEXT)}\n[display truncated; original recorded evidence is unchanged]`;
}

/** Read-only latest-turn presentation. A tool outcome never establishes task completion. */
export function renderNativeInteractiveToolResults(workspace: string, sessionId: string): string[] {
  try {
    // Authenticate metadata before trusting tool identity, outcome or payload paths.
    // The existing reader takes no writer and never repairs or switches history.
    const history = loadSessionEventHistory({ workspace, sessionId });
    const events = history.events;
    let turn: number | null = null;
    for (const event of events) if (event.event_type === "turn/start") turn = extractEnvelope(event.meta_json)?.turn ?? null;
    if (turn === null) return [];
    const current = events.filter(event => extractEnvelope(event.meta_json)?.turn === turn);
    const names = new Map<string, string>();
    for (const event of current) {
      if (event.event_type !== "tool/call") continue;
      const meta = JSON.parse(event.meta_json) as { toolCallId?: unknown; toolName?: unknown };
      if (typeof meta.toolCallId === "string" && typeof meta.toolName === "string") names.set(meta.toolCallId, meta.toolName);
    }
    const results = current.filter(event => event.event_type === "tool/result");
    if (!results.length) return [];
    const lines = [`Recorded tool results · turn ${turn} (tool outcomes, not task validation):`];
    for (const event of results.slice(-MAX_RESULTS)) {
      const meta = JSON.parse(event.meta_json) as { toolCallId?: unknown; outcome?: unknown; exitCode?: unknown; timedOut?: unknown; denied?: unknown };
      const name = typeof meta.toolCallId === "string" ? names.get(meta.toolCallId) ?? "unnamed tool" : "unnamed tool";
      const outcome = typeof meta.outcome === "string" && OUTCOMES.has(meta.outcome) ? meta.outcome : "outcome unavailable";
      const details = [outcome, ...(Number.isSafeInteger(meta.exitCode) ? [`exit ${meta.exitCode}`] : []),
        ...(meta.timedOut === true ? ["timed out"] : []), ...(meta.denied === true ? ["denied"] : [])];
      lines.push(`${display(name)} · ${details.join(" · ")} · event ${escapeTerminalControls(event.id)}`);
      const payload = readEventPayload(workspace, event);
      if (payload.status !== "ok") lines.push(`[payload ${payload.status}; recorded output is unavailable]`);
      else if (sha256Hex(payload.bytes) !== event.payload_sha256) lines.push("[payload digest mismatch; output refused]");
      else {
        let text = payload.bytes.toString("utf8");
        try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Ordinary text needs no JSON rendering. */ }
        lines.push(display(text));
      }
      const spill = extractSpillRef(event.meta_json);
      if (spill) lines.push(spill.locator === null
        ? "[Retained output unavailable; this is a recorded preview only.]"
        : `[Recorded preview; ${spill.bytes} full bytes committed. Use session.spill_read with locator ${escapeTerminalControls(spill.locator)}.]`);
    }
    if (results.length > MAX_RESULTS) lines.push(`[${results.length - MAX_RESULTS} more tool results not displayed; original evidence is retained.]`);
    return lines;
  } catch (error) {
    return [`Tool results unavailable: ${display(error instanceof Error ? error.message : "recorded evidence could not be read")}. No output was inferred.`];
  }
}
