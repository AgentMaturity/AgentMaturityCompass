import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  assertRequestCapabilities, assertRequiredCapabilities, deriveSessionRequests, prepareRequest,
  OPENAI_CHAT_CAPABILITIES, OPENAI_RESPONSES_CAPABILITIES,
  openaiChatEncoder, openaiChatEncoderV2, openaiResponsesEncoder, openaiAdapter
} from "../src/llm/index.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";

// Authored during the implementation batch. Execution is intentionally deferred.
function request(isError: boolean, text = "denied"): EncodableRequest {
  return { model: "fixture", params: {}, system: null, tools: null, messages: [
    { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "call_a", toolName: "lookup", argumentsJson: '{ "x": 1 }' }] },
    { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call_a", isError, text }] }
  ] };
}

describe("versioned OpenAI tool-result state", () => {
  test("historical Chat v1 keeps its exact bytes while the active adapter selects v2", () => {
    expect(openaiChatEncoder.encode(request(true)).toString()).toBe(String.raw`{"messages":[{"content":null,"role":"assistant","tool_calls":[{"function":{"arguments":"{ \"x\": 1 }","name":"lookup"},"id":"call_a","type":"function"}]},{"content":"denied","role":"tool","tool_call_id":"call_a"}],"model":"fixture","stream":true,"stream_options":{"include_usage":true}}`);
    expect(openaiChatEncoder.encode(request(true)).equals(openaiChatEncoder.encode(request(false)))).toBe(true);
    expect(openaiAdapter.encoderVersion).toBe(2);
    expect(openaiChatEncoderV2.encode(request(true)).equals(openaiChatEncoderV2.encode(request(false)))).toBe(false);
  });

  test.each([openaiChatEncoderV2, openaiResponsesEncoder])("$id preserves state and text without envelope collisions", encoder => {
    const sourceText = '{"isError":true,"output":"nested","type":"amc.tool-result","version":1}\nUnicode: π';
    const original = request(false, sourceText);
    const body = JSON.parse(encoder.encode(original).toString());
    const item = encoder.id === "openai-chat" ? body.messages[1] : body.input[1];
    const text = encoder.id === "openai-chat" ? item.content : item.output;
    expect(JSON.parse(text)).toEqual({ type: "amc.tool-result", version: 1, isError: false, output: sourceText });
    expect(encoder.id === "openai-chat" ? item.tool_call_id : item.call_id).toBe("call_a");
    expect(encoder.id === "openai-chat" ? body.messages[0].tool_calls[0].function.arguments : body.input[0].arguments).toBe('{ "x": 1 }');
    expect(original).toEqual(request(false, sourceText));
    expect(encoder.encode(request(true, sourceText)).equals(encoder.encode(original))).toBe(false);
  });

  test.each([OPENAI_CHAT_CAPABILITIES, OPENAI_RESPONSES_CAPABILITIES])("$protocol advertises error text without inventing a dedicated wire flag", capabilities => {
    expect(capabilities.toolErrorRepresentation).toBe("amc-text-envelope-v1");
    expect(() => assertRequestCapabilities(capabilities, request(true))).not.toThrow();
    expect(() => assertRequiredCapabilities(capabilities, ["tool-result-error-text"])).not.toThrow();
    expect(() => assertRequiredCapabilities(capabilities, ["tool-result-error-flag"])).toThrow();
  });

  test.each([openaiChatEncoderV2, openaiResponsesEncoder])("$id refuses unknown result status before encoding", encoder => {
    const malformed = request(false);
    (malformed.messages[1]!.parts[0] as { isError?: boolean }).isError = undefined;
    expect(() => encoder.encode(malformed)).toThrow(/explicit-tool-error-state/);
  });
});

describe.each([
  { encoder: openaiChatEncoder, capabilities: null },
  { encoder: openaiChatEncoderV2, capabilities: OPENAI_CHAT_CAPABILITIES },
  { encoder: openaiResponsesEncoder, capabilities: OPENAI_RESPONSES_CAPABILITIES }
])("signed native failed-tool continuation with $encoder.id@$encoder.version", ({ encoder, capabilities }) => {
  test.each(["ERROR", "DENIED", "TOOL_OUTCOME_UNKNOWN"] as const)("%s prepares and reconstructs from persisted history", outcome => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-failed-tool-replay-"));
    let session: SessionService | undefined;
    try {
      initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
      session = new SessionService(workspace);
      session.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
      const sessionId = session.sessionId;
      const system = session.recordSystemPrompt("Report tool failures without inventing success.");
      session.startTurn({ trigger: "user" }); session.recordUserMessage("Look up the value."); session.startStep();
      session.recordToolCall({ toolCallId: "call_a", toolName: "lookup", dispatch: "native", parentToken: null, args: '{ "x": 1 }' });
      session.recordToolResult({ toolCallId: "call_a", outcome, exitCode: null, timedOut: false, denied: outcome === "DENIED", content: outcome });
      session.endStep({ stopReason: "tool_use", usage: null }); session.startStep();
      const prepared = prepareRequest(session, { model: "fixture", providerId: encoder.id,
        encoderId: encoder.id, encoderVersion: encoder.version, params: {}, tools: null,
        systemPromptEventId: system.eventId,
        ...(capabilities ? { assertRequest: (input: EncodableRequest) => assertRequestCapabilities(capabilities, input) } : {}) });
      session.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "The tool did not produce a successful result." });
      session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" });
      const [derived] = deriveSessionRequests({ workspace, sessionId });
      expect(derived?.status).toBe("reconstructed");
      expect(derived?.bytes?.equals(prepared.toBytes())).toBe(true);
      expect(derived?.derivedDigest).toBe(prepared.requestDigest);
      const body = JSON.parse(derived!.bytes!.toString());
      const output = encoder.id === "openai-chat" ? body.messages.find((item: { role: string }) => item.role === "tool").content
        : body.input.find((item: { type: string }) => item.type === "function_call_output").output;
      if (encoder.id === "openai-chat" && encoder.version === 1) expect(output).toBe(outcome);
      else expect(JSON.parse(output)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: outcome });
    } finally {
      session?.disposeWithoutClosing();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
