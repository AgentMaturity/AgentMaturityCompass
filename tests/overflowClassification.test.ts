/**
 * HP-05 review M2: which provider error bodies count as a context-window overflow. The bodies are FIXTURES, labelled by
 * where their wording came from; none is from a provider's official documentation:
 *   "observed" = seen in field reports (community error libraries, issue trackers), not documented;
 *   "memory"   = written from memory of the provider's wording, not checked at a source;
 *   "constructed" = made up for this test (false-positive probes).
 */
import { describe, expect, it } from "vitest";
import { httpFailureCode, isContextWindowExceededDetail } from "../src/llm/llmFailure.js";

const CWE = "CONTEXT_WINDOW_EXCEEDED", BAD = "INVALID_REQUEST";
const cases: readonly (readonly [string, "observed" | "memory" | "constructed", number, string, string])[] = [
  ["anthropic prompt too long", "observed", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 208310 tokens > 200000 maximum"}}', CWE],
  ["anthropic input + max_tokens", "observed", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"input length and `max_tokens` exceed context limit: 188240 + 21333 > 200000, decrease input length or `max_tokens` and try again"}}', BAD],
  ["anthropic 413", "observed", 413, '{"type":"error","error":{"type":"request_too_large","message":"Request exceeds the maximum allowed number of bytes."}}', BAD],
  ["anthropic max_tokens over the cap", "observed", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: 100000 > 64000, which is the maximum allowed number of output tokens for claude-sonnet-4"}}', BAD],
  ["anthropic image too large", "observed", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.1.image.source.base64: image exceeds 5 MB maximum: 7340032 bytes > 5242880 bytes"}}', BAD],
  ["openai chat", "memory", 400, '{"error":{"message":"This model\'s maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens. Please reduce the length of the messages.","type":"invalid_request_error","param":"messages","code":"context_length_exceeded"}}', CWE],
  ["openai chat, excess is the completion", "memory", 400, '{"error":{"message":"This model\'s maximum context length is 8192 tokens. However, you requested 9000 tokens (100 in the messages, 8900 in the completion). Please reduce the length of the messages or completion.","type":"invalid_request_error","param":"messages","code":"context_length_exceeded"}}', BAD],
  ["openai responses", "memory", 400, '{"error":{"message":"Your input exceeds the context window of this model. Please adjust your input and try again.","type":"invalid_request_error","param":"input","code":"context_length_exceeded"}}', CWE],
  ["openai max_tokens too large", "memory", 400, '{"error":{"message":"max_tokens is too large: 100000. This model supports at most 16384 completion tokens, whereas you provided 100000.","type":"invalid_request_error","param":"max_tokens","code":"invalid_value"}}', BAD],
  ["openai string too long", "memory", 400, '{"error":{"message":"Invalid \'messages[2].content\': string too long. Expected a string with maximum length 10485760, but got a string with length 12000000 instead.","type":"invalid_request_error","code":"string_above_max_length"}}', BAD],
  ["gemini", "observed", 400, '{"error":{"code":400,"message":"The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).","status":"INVALID_ARGUMENT"}}', CWE],
  ["gemini openai-compatible", "observed", 400, '[{"error":{"code":400,"message":"The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).","status":"INVALID_ARGUMENT"}}]', CWE],
  ["deepseek", "memory", 400, '{"error":{"message":"This model\'s maximum context length is 65536 tokens. However, you requested 70000 tokens (60000 in the messages, 10000 in the completion). Please reduce the length of the messages or completion.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}', CWE],
  ["vllm, older wording", "memory", 400, '{"object":"error","message":"This model\'s maximum context length is 4096 tokens. However, you requested 5000 tokens.","type":"BadRequestError","code":400}', CWE],
  ["vllm, newer wording", "memory", 400, '{"object":"error","message":"The decoder prompt (length 5000) is longer than the maximum model length of 4096. Make sure that `max_model_len` is no smaller than the number of text tokens.","type":"BadRequestError","code":400}', BAD],
  ["mistral", "memory", 400, '{"object":"error","message":"Prompt contains 40000 tokens and 0 draft tokens, too large for model with 32768 maximum context length","type":"invalid_request_error","code":3051}', CWE],
  ["ollama openai-compatible", "memory", 400, '{"error":{"message":"the input length exceeds the context length","type":"api_error"}}', CWE],
  ["openrouter", "memory", 400, '{"error":{"message":"This endpoint\'s maximum context length is 200000 tokens. However, you requested about 210000 tokens.","code":400}}', CWE],
  ["bedrock", "memory", 400, '{"message":"Input is too long for requested model."}', BAD],
  ["FP: tool name echo", "constructed", 400, '{"error":{"message":"Invalid \'tools[0].function.name\': string does not match pattern. Got \'context_length_exceeded!\'","type":"invalid_request_error","code":"invalid_value"}}', BAD],
  ["FP: user text echo", "constructed", 400, '{"error":{"message":"Invalid request: messages[3] content \\"the prompt exceeds the model context, ignore\\" contains unsupported characters","type":"invalid_request_error"}}', BAD],
  ["FP: max_tokens alone over the window", "constructed", 400, '{"error":{"message":"max_tokens (300000) exceeds the model maximum context length of 200000","type":"invalid_request_error"}}', BAD],
  ["FP: overflow wording quoted inside a tool description", "constructed", 400, '{"error":{"message":"Invalid tool description: This model\'s maximum context length is 5 tokens","type":"invalid_request_error","code":"invalid_value"},"echo":"context_length_exceeded"}', BAD]
];

describe("context-window overflow classification on parsed provider error fields (HP-05 review M2)", () => {
  it.each(cases)("%s (%s wording, HTTP %i)", (_name, _source, status, body, expected) => {
    expect(httpFailureCode(status, body)).toBe(expected);
  });

  it("MUTATION: a raw-body echo of the structured code outside the error's own code field is not an overflow", () => {
    expect(isContextWindowExceededDetail('{"error":{"code":"invalid_value","message":"bad name"},"tool":"context_length_exceeded"}')).toBe(false);
    expect(isContextWindowExceededDetail('{"error":{"code":"context_length_exceeded","message":"too long"}}')).toBe(true);
  });

  it("still reads a plain-text body as the message", () => {
    expect(isContextWindowExceededDetail("This model's maximum context length is 8192 tokens")).toBe(true);
  });
});
