/** AUTHORED UNEXECUTED. Script only the HTTP edge of the actual Chat decoder.
 * No workspace, credentials, child process or provider call is opened on import.
 */
import type { HttpResponse } from "../../src/llm/adapter/transport.js";

export function chatImageStream(options: {
  text?: string; toolName?: string; rawArguments?: string; callId?: string; omitUsage?: boolean;
  unsupportedDelta?: Record<string, unknown>;
} = {}): HttpResponse {
  const frames: Record<string, unknown>[] = [];
  const choice = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
    id: "chatcmpl_native_image_fixture", object: "chat.completion.chunk", model: "fixture-model",
    choices: [{ index: 0, delta, finish_reason }]
  });
  frames.push(choice({ role: "assistant", content: options.text ?? "Native image fixture response" }));
  if (options.unsupportedDelta) frames.push(choice(options.unsupportedDelta));
  if (options.toolName !== undefined) {
    const raw = options.rawArguments ?? '{"path":"fixture.txt"}', split = Math.floor(raw.length / 2);
    frames.push(choice({ tool_calls: [{ index: 0, id: options.callId ?? "image-read", type: "function",
      function: { name: options.toolName, arguments: raw.slice(0, split) } }] }));
    frames.push(choice({ tool_calls: [{ index: 0, function: { arguments: raw.slice(split) } }] }));
  }
  frames.push(choice({}, options.toolName === undefined ? "stop" : "tool_calls"));
  if (!options.omitUsage) frames.push({ choices: [], usage: {
    prompt_tokens: 10, completion_tokens: 3, total_tokens: 13, prompt_tokens_details: { cached_tokens: 2 }
  } });
  const bytes = Buffer.from(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n");
  return { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
    for (let offset = 0; offset < bytes.length; offset += 7) yield bytes.subarray(offset, offset + 7);
  })() };
}
