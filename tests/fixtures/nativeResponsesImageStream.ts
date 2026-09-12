/** AUTHORED UNEXECUTED. Scripted HTTP edge for the actual Responses decoder.
 * No credentials, model endpoint, workspace or process is opened on import.
 */
import type { HttpResponse } from "../../src/llm/adapter/transport.js";

export function responsesImageStream(options: { text?: string; toolName?: string; rawArguments?: string; callId?: string } = {}): HttpResponse {
  const responseId = "resp_native_image_fixture", itemId = "item_native_image_fixture";
  const text = options.text ?? "Native image fixture response";
  const content = { type: "output_text", text, annotations: [] };
  const tool = options.toolName !== undefined;
  const completed = tool
    ? { type: "function_call", id: itemId, status: "completed", call_id: options.callId ?? "image-read",
      name: options.toolName, arguments: options.rawArguments ?? '{"path":"fixture.txt"}' }
    : { type: "message", id: itemId, status: "completed", role: "assistant", content: [content] };
  const frames: Record<string, unknown>[] = [
    { type: "response.created", response: { id: responseId } },
    { type: "response.output_item.added", output_index: 0, item: tool
      ? { ...completed, status: "in_progress", arguments: "" }
      : { type: "message", id: itemId, status: "in_progress", role: "assistant", content: [] } }
  ];
  if (tool) {
    frames.push(
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: itemId, delta: completed.arguments },
      { type: "response.function_call_arguments.done", output_index: 0, item_id: itemId, arguments: completed.arguments }
    );
  } else {
    frames.push(
      { type: "response.content_part.added", output_index: 0, item_id: itemId, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
      { type: "response.output_text.delta", output_index: 0, item_id: itemId, content_index: 0, delta: text },
      { type: "response.output_text.done", output_index: 0, item_id: itemId, content_index: 0, text },
      { type: "response.content_part.done", output_index: 0, item_id: itemId, content_index: 0, part: content }
    );
  }
  frames.push(
    { type: "response.output_item.done", output_index: 0, item: completed },
    { type: "response.completed", response: { id: responseId, status: "completed", output: [completed],
      usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13, input_tokens_details: { cached_tokens: 0 } } } }
  );
  const bytes = Buffer.from(frames.map((frame, sequence_number) => {
    const value = { ...frame, sequence_number };
    return `event: ${frame.type}\ndata: ${JSON.stringify(value)}\n\n`;
  }).join(""));
  return { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () {
    for (let offset = 0; offset < bytes.length; offset += 7) yield bytes.subarray(offset, offset + 7);
  })() };
}
