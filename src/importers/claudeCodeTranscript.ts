/**
 * Claude Code session transcripts (the JSONL file a hook names as `transcript_path`). EXPERIMENTAL.
 *
 * Anthropic documents only that the file exists ("Path to conversation JSON", code.claude.com/docs/en/hooks, read
 * 2026-11-17); its line format is not published. Inferred fields: each line's `type` ("user" | "assistant"; others are
 * skipped), `uuid`, `sessionId`, `timestamp`, `version`, and `message`, which holds a Messages API message: `model`,
 * `content` blocks (`text`, `tool_use` {id, name, input}, `tool_result` {tool_use_id, content, is_error}), `stop_reason`
 * ("refusal" is a documented stop reason) and `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`).
 */
import { digestOf, isRecord, newSessionFormat, nonNegativeInt, plainName, storedText, type JsonRow, type SessionImportContext,
  type SessionImportFormat, type SessionStep } from "./sessionImportCommon.js";

const CLI_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

export function looksLikeClaudeCodeTranscript(rows: JsonRow[]): boolean {
  return rows.some(({ value }) => (value.type === "user" || value.type === "assistant") && isRecord(value.message)
    && typeof value.sessionId === "string" && typeof value.uuid === "string");
}

export function parseClaudeCodeTranscript(read: { rows: JsonRow[]; lines: number; malformed: number; overLong: number; overCap: number },
  ctx: SessionImportContext): { format: SessionImportFormat; steps: SessionStep[] } {
  const firstVersion = read.rows.map(({ value }) => value.version).find((value) => typeof value === "string");
  const version = typeof firstVersion === "string" && CLI_VERSION.test(firstVersion) ? firstVersion : null;
  const format = newSessionFormat("claude-code-transcript", version, true, ctx, read);
  const steps: SessionStep[] = [];
  const calls = new Map<string, number>();
  const session = (value: Record<string, unknown>) => `session-${digestOf(value.sessionId).slice(0, 12)}`;
  for (const { value, line } of read.rows) {
    const message = value.message;
    if ((value.type !== "user" && value.type !== "assistant") || !isRecord(message)) { format.records.skipped += 1; continue; }
    format.records.mapped += 1;
    const blocks = Array.isArray(message.content) ? message.content.filter(isRecord) : [];
    if (value.type === "assistant") {
      const usage = isRecord(message.usage) ? message.usage : null;
      const stop = typeof message.stop_reason === "string" ? plainName(message.stop_reason) : null;
      const texts = blocks.filter((block) => block.type === "text").map((block) => block.text);
      steps.push({ step: steps.length + 1, kind: "model-reply", time: value.timestamp, sessionLabel: session(value), sourceStep: line, model: plainName(message.model),
        output: texts.length > 0 ? storedText(texts.join("\n"), ctx) : null, outcome: stop === "refusal" ? "refused" : "completed", stopReason: stop,
        tokens: usage ? { input: nonNegativeInt(usage.input_tokens), output: nonNegativeInt(usage.output_tokens),
          cached: nonNegativeInt(usage.cache_read_input_tokens) } : null });
      for (const block of blocks.filter((item) => item.type === "tool_use")) {
        const tool = plainName(block.name);
        steps.push({ step: steps.length + 1, kind: "tool-call", time: value.timestamp, sessionLabel: session(value), sourceStep: line, tool,
          input: storedText(block.input, ctx), outcome: "unknown", callDigest: digestOf({ tool, input: block.input ?? null }) });
        if (typeof block.id === "string") calls.set(block.id, steps.length - 1);
      }
      continue;
    }
    for (const block of blocks.filter((item) => item.type === "tool_result")) {
      const index = typeof block.tool_use_id === "string" ? calls.get(block.tool_use_id) : undefined;
      const call = index === undefined ? undefined : steps[index];
      if (!call) { format.records.skipped += 1; continue; }
      const failed = block.is_error === true;
      call.output = storedText(block.content, ctx);
      call.outcome = failed ? "failed" : "completed";
      call.error = failed;
      if (failed) call.errorMessage = `The tool call reported an error (${call.tool ?? "unnamed tool"}).`;
    }
  }
  return { format, steps };
}
