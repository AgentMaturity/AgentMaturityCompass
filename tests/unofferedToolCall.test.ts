/**
 * Smoke M-5: a model that calls a tool name it was not offered used to kill the whole turn
 * (AMC_LLM_UNOFFERED_TOOL_NAME surfaced as an unclassified native error, exit 1). Like malformed arguments, the call is
 * now answered with a refusal the model can read, recorded as a tool result, and never executed.
 */
import { describe, expect, test, vi } from "vitest";
import { ProviderToolBinding } from "../src/llm/adapter/providerToolBinding.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import { runToolCalls } from "../src/agent/toolCalls.js";
import type { AgentToolSeam } from "../src/agent/toolSeam.js";
import type { SessionService } from "../src/session/sessionService.js";
import type { ToolUseContentBlock } from "../src/llm/streamChunk.js";

const offered = new Map([[providerToolWireName("fs.read"), "fs.read"]]);

describe("an unoffered tool name is refused per call, not per turn (smoke M-5)", () => {
  test("the binding marks an unoffered call instead of failing the stream, and never binds it to an offered tool", () => {
    for (const name of ["fs.write", "fs.read"]) {
      const binding = new ProviderToolBinding(offered);
      const delta = binding.bind({ type: "tool-call-delta", index: 1, id: "c", name, argumentsDelta: "{}" });
      expect(delta).toMatchObject({ name, unoffered: true }); expect(delta).not.toHaveProperty("providerWireName");
      const end = binding.bind({ type: "block-end", index: 1, block: { kind: "tool_use", id: "c", name, arguments: "{}" } });
      expect(end).toMatchObject({ block: { name, unoffered: true } }); expect((end as { block: object }).block).not.toHaveProperty("providerWireName");
    }
    const wire = providerToolWireName("fs.read");
    expect(new ProviderToolBinding(offered).bind({ type: "block-end", index: 0, block: { kind: "tool_use", id: "d", name: wire, arguments: "{}" } }))
      .toEqual({ type: "block-end", index: 0, block: { kind: "tool_use", id: "d", name: "fs.read", providerWireName: wire, arguments: "{}" } });
  });

  test("the loop answers an unoffered call with a refusal naming the available tools and never dispatches it", async () => {
    const execute = vi.fn();
    const tools: AgentToolSeam = {
      schemas: () => [{ name: "fs.read", description: "read", parameters: { type: "object" } }, { name: "grep", description: "g", parameters: { type: "object" } }],
      executionMode: () => "exclusive",
      execute
    };
    const results: unknown[] = [];
    const session = { sessionId: "s", recordToolResult: (row: unknown) => { results.push(row); return { eventId: "e" }; } } as unknown as SessionService;
    const calls: ToolUseContentBlock[] = [{ kind: "tool_use", id: "c1", name: "fs.write", arguments: "{\"path\":\"x\"}", unoffered: true }];
    await runToolCalls({ session, tools, turn: 1, step: 1, signal: new AbortController().signal, maxParallel: 4, abandonGraceMs: 10,
      parentToken: null, acceptContext: () => {}, calls });
    expect(execute).not.toHaveBeenCalled();
    expect(results).toEqual([expect.objectContaining({ toolCallId: "c1", outcome: "DENIED", denied: true,
      content: `[amc] tool "fs.write" is not available in this session; available: ${providerToolWireName("fs.read")}, grep. Nothing was executed.` })]);
  });
});
