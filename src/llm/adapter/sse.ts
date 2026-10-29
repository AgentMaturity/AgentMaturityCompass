/**
 * Server-sent events, decoded once for every adapter that speaks them.
 *
 * Anthropic and OpenAI both stream `text/event-stream`, and AMC's own gateway
 * proxies whichever of the two it is fronting. Writing the framing twice would
 * mean two places where a chunk split across a TCP boundary is handled — and
 * the bug that produces is invisible until a token happens to land on the seam,
 * which is exactly the kind of defect that reaches production.
 *
 * The decoder is deliberately narrow: it frames events and nothing else. It
 * does not know what a `data:` payload means, does not parse JSON, and does not
 * decide when a stream is over. Those are wire-format facts owned by the
 * adapter, and folding them in here would make this module a second place where
 * a provider's protocol lives.
 */

import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";

/** One framed event. `event` is null when the stream used only `data:` lines. */
export interface SseEvent {
  readonly event: string | null;
  readonly data: string;
}

/**
 * Where one event ends.
 *
 * The spec separates events with a blank line. Normalising LF, CRLF and bare CR
 * across byte boundaries means the
 * scan below has one terminator to look for instead of two overlapping ones.
 */
const EVENT_SEPARATOR = "\n\n";

/**
 * Frame one byte stream into events.
 *
 * Incremental by construction: bytes are appended to a buffer and complete
 * events are cut off the front, so an event split across any number of network
 * chunks reassembles, and a chunk carrying several events yields several.
 *
 * A trailing partial event at end-of-stream is DISCARDED rather than yielded.
 * A truncated frame is not an event that happened — emitting half of one would
 * hand the adapter a malformed payload to misparse, and the stream's own
 * grammar check (a missing terminal `finish`) is what reports the truncation.
 */
export async function* sseEvents(body: AsyncIterable<Uint8Array>): AsyncIterable<SseEvent> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", held = "";
  function decode(bytes?: Uint8Array, stream = false): string {
    try { return decoder.decode(bytes, { stream }); }
    catch { throw new LlmError("SSE stream contains malformed or truncated UTF-8", LLM_FAILURE_CODE.TRANSPORT); }
  }
  function* append(decoded: string, final = false): Generator<SseEvent> {
    const combined = held + decoded;
    // A CR may be the first byte of CRLF in the next network chunk. Hold it
    // until its partner is known; bare CR is also a valid SSE line ending.
    held = !final && combined.endsWith("\r") ? "\r" : "";
    buffer += (held ? combined.slice(0, -1) : combined).replace(/\r\n|\r/g, "\n");
    let separator = buffer.indexOf(EVENT_SEPARATOR);
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + EVENT_SEPARATOR.length);
      const event = parseFrame(frame);
      if (event !== null) yield event;
      separator = buffer.indexOf(EVENT_SEPARATOR);
    }
  }
  for await (const chunk of body) yield* append(decode(chunk, true));
  // Flush the incremental decoder so a truncated UTF-8 suffix cannot vanish.
  yield* append(decode(), true);
}

/**
 * Parse one frame's lines, or null when it carries no data.
 *
 * Comment lines (`:` first) and unknown fields are ignored per the spec.
 * Multiple `data:` lines in one frame are joined with a newline, which is what
 * the spec says and what a provider streaming a multi-line payload relies on.
 */
function parseFrame(frame: string): SseEvent | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.length === 0 || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // One optional space after the colon is part of the framing, not the value.
    const rawValue = colon === -1 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}
