import { describe, expect, it } from "vitest";
import {
  BlockAssembler,
  type StreamAssembly,
  type StreamChunk,
  billedInputTokens,
  droppedBlocks,
  isContentDelta,
  surfaceBlocks,
  toolCallId
} from "../src/llm/index.js";
import { isLlmStreamProtocolError } from "../src/llm/streamProtocol.js";

/**
 * The fold from chunks to blocks.
 *
 * Two properties are load-bearing beyond "does it concatenate deltas":
 *
 * 1. Output order is FIRST-SEEN order, not numeric index order, so interleaved
 *    blocks come out the way the model produced them.
 * 2. Nothing is dropped silently. Every opened index appears in the record with
 *    an outcome, and content that could not be assembled is still carried as a
 *    `partial`. dsh filters truncated tool calls and whitespace text out of its
 *    result; here the filtering is a projection (`surfaceBlocks`) over a total
 *    record, which is what keeps "model-visible ⟺ logged" true for a stream
 *    that was cut off.
 */

const USAGE: StreamChunk = {
  type: "usage",
  usage: { inputTokens: 11, outputTokens: 7, cacheReadTokens: 3 }
};

/** Every opened index is accounted for, and no record hides its content. */
function assertNothingLost(assembly: StreamAssembly, openedIndexes: readonly number[]): void {
  expect(assembly.blocks.map((record) => record.index)).toEqual(openedIndexes);
  expect(assembly.blocks.map((record) => record.ordinal)).toEqual(openedIndexes.map((_, i) => i));
  for (const record of assembly.blocks) {
    // The invariant that makes "nothing vanishes" checkable: a record either
    // assembled into a block or preserved the raw accumulations, never neither.
    expect(record.block === null).toBe(record.partial !== null);
  }
}

describe("BlockAssembler — multi-block assembly", () => {
  it("assembles interleaved text, thinking and tool_use in first-seen order", () => {
    const call = toolCallId("call_a1");
    const assembler = new BlockAssembler();
    const chunks: StreamChunk[] = [
      { type: "block-start", index: 0, blockKind: "text" },
      { type: "text-delta", index: 0, text: "Look" },
      { type: "block-start", index: 1, blockKind: "thinking" },
      { type: "thinking-delta", index: 1, text: "weigh " },
      { type: "block-start", index: 2, blockKind: "tool_use" },
      { type: "tool-call-delta", index: 2, id: call, name: "read_file", argumentsDelta: '{"path":' },
      // Interleaving: block 0 resumes after blocks 1 and 2 opened.
      { type: "text-delta", index: 0, text: "ing it up." },
      { type: "thinking-delta", index: 1, text: "options" },
      { type: "tool-call-delta", index: 2, id: call, argumentsDelta: '"/etc/hosts"}' },
      // Closing out of order: 1 closes before 0, which closes before 2.
      { type: "block-end", index: 1, block: { kind: "thinking", text: "weigh options" } },
      { type: "block-end", index: 0, block: { kind: "text", text: "Looking it up." } },
      {
        type: "block-end",
        index: 2,
        block: { kind: "tool_use", id: call, name: "read_file", arguments: '{"path":"/etc/hosts"}' }
      },
      USAGE,
      { type: "finish", reason: { kind: "tool_calls" } }
    ];
    for (const chunk of chunks) assembler.push(chunk);
    const assembly = assembler.complete();

    expect(assembly.termination).toBe("finish");
    expect(assembly.finishReason).toEqual({ kind: "tool_calls" });
    expect(assembly.abortCause).toBeNull();
    expect(assembly.usage).toEqual({ inputTokens: 11, outputTokens: 7, cacheReadTokens: 3 });

    assertNothingLost(assembly, [0, 1, 2]);
    expect(assembly.blocks.map((record) => record.blockKind)).toEqual(["text", "thinking", "tool_use"]);
    expect(assembly.blocks.every((record) => record.closed)).toBe(true);
    expect(assembly.blocks.map((record) => record.outcome)).toEqual([
      { status: "completed" },
      { status: "completed" },
      { status: "completed" }
    ]);

    expect(surfaceBlocks(assembly)).toEqual([
      { kind: "text", text: "Looking it up." },
      { kind: "thinking", text: "weigh options" },
      { kind: "tool_use", id: call, name: "read_file", arguments: '{"path":"/etc/hosts"}' }
    ]);
    expect(droppedBlocks(assembly)).toEqual([]);
  });

  it("folds deltas itself when block-end never carries the assembled value", () => {
    // Adapters must not reassemble; an adapter that closes a block without
    // restating its content still gets the same block out of the fold, because
    // the fold — not the adapter — is what accumulated it.
    const call = toolCallId("call_b2");
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 4, blockKind: "tool_use" });
    assembler.push({ type: "tool-call-delta", index: 4, id: call, name: "grep", argumentsDelta: '{"q"' });
    assembler.push({ type: "tool-call-delta", index: 4, id: call, argumentsDelta: ':"x"}' });
    assembler.push(USAGE);
    // No block-end and no successful finish: an error finish leaves it open.
    assembler.push({
      type: "finish",
      reason: { kind: "error", failure: { message: "stream cut", code: "TRANSPORT" } }
    });
    const assembly = assembler.complete();

    const record = assembly.blocks[0];
    expect(record?.closed).toBe(false);
    expect(record?.block).toEqual({
      kind: "tool_use",
      id: call,
      name: "grep",
      arguments: '{"q":"x"}'
    });
    // An undispatched tool call is recorded, not surfaced.
    expect(record?.outcome).toEqual({ status: "dropped", reason: "tool_call_truncated" });
    expect(surfaceBlocks(assembly)).toEqual([]);
  });

  it("records a max_tokens tool-call drop instead of filtering it away", () => {
    // dsh removes every tool call from a max-tokens response and leaves no
    // trace. The removal is right; the silence is not — a token meter reading
    // the log would under-report with nothing to explain the gap.
    const call = toolCallId("call_c3");
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 0, blockKind: "text" });
    assembler.push({ type: "text-delta", index: 0, text: "partial answer" });
    assembler.push({ type: "block-end", index: 0, block: { kind: "text", text: "partial answer" } });
    assembler.push({ type: "block-start", index: 1, blockKind: "tool_use" });
    assembler.push({ type: "tool-call-delta", index: 1, id: call, name: "rm", argumentsDelta: '{"p":"/' });
    assembler.push({
      type: "block-end",
      index: 1,
      block: { kind: "tool_use", id: call, name: "rm", arguments: '{"p":"/' }
    });
    assembler.push(USAGE);
    assembler.push({ type: "finish", reason: { kind: "max_tokens" } });
    const assembly = assembler.complete();

    assertNothingLost(assembly, [0, 1]);
    expect(assembly.blocks[1]?.closed).toBe(true);
    expect(assembly.blocks[1]?.outcome).toEqual({
      status: "dropped",
      reason: "max_tokens_truncated"
    });
    expect(assembly.blocks[1]?.block).toEqual({
      kind: "tool_use",
      id: call,
      name: "rm",
      arguments: '{"p":"/'
    });
    expect(surfaceBlocks(assembly)).toEqual([{ kind: "text", text: "partial answer" }]);
    expect(droppedBlocks(assembly)).toHaveLength(1);
  });
});

describe("BlockAssembler — an aborted stream is recorded, never truncated silently", () => {
  /**
   * Five blocks in five states when the consumer walks away. The point of the
   * test is that all five survive into the record with a reason, because a
   * shorter list of blocks is indistinguishable from a shorter model response.
   */
  function abortedAssembly(): StreamAssembly {
    const call = toolCallId("call_d4");
    const assembler = new BlockAssembler();
    // 0: closed before the abort.
    assembler.push({ type: "block-start", index: 0, blockKind: "text" });
    assembler.push({ type: "text-delta", index: 0, text: "done" });
    assembler.push({ type: "block-end", index: 0, block: { kind: "text", text: "done" } });
    // 1: open with real content.
    assembler.push({ type: "block-start", index: 1, blockKind: "text" });
    assembler.push({ type: "text-delta", index: 1, text: "half a sen" });
    // 2: open with whitespace only.
    assembler.push({ type: "block-start", index: 2, blockKind: "thinking" });
    assembler.push({ type: "thinking-delta", index: 2, text: "   " });
    // 3: open tool call, id known, arguments incomplete.
    assembler.push({ type: "block-start", index: 3, blockKind: "tool_use" });
    assembler.push({ type: "tool-call-delta", index: 3, id: call, name: "bash", argumentsDelta: '{"cmd' });
    // 4: opened and nothing else — a kind that cannot be built from deltas.
    assembler.push({ type: "block-start", index: 4, blockKind: "image" });
    return assembler.abort("user_cancelled");
  }

  it("keeps every opened block with an explicit outcome", () => {
    const assembly = abortedAssembly();
    expect(assembly.termination).toBe("abort");
    expect(assembly.abortCause).toBe("user_cancelled");
    // No finish chunk arrived, and none is invented: dsh defaults a missing
    // finish to `{kind:"stop"}`, which would sign a claim that the model
    // finished cleanly when it was cut off.
    expect(assembly.finishReason).toBeNull();
    expect(assembly.usage).toBeNull();

    assertNothingLost(assembly, [0, 1, 2, 3, 4]);
    expect(assembly.blocks.map((record) => record.outcome)).toEqual([
      { status: "completed" },
      { status: "truncated" },
      { status: "dropped", reason: "empty" },
      { status: "dropped", reason: "tool_call_truncated" },
      { status: "dropped", reason: "unassemblable" }
    ]);
  });

  it("carries the content of every block it declines to surface", () => {
    const assembly = abortedAssembly();
    // Truncated text keeps what arrived...
    expect(assembly.blocks[1]?.block).toEqual({ kind: "text", text: "half a sen" });
    // ...the whitespace block keeps its whitespace...
    expect(assembly.blocks[2]?.block).toEqual({ kind: "thinking", text: "   " });
    // ...the undispatched tool call keeps its partial arguments...
    expect(assembly.blocks[3]?.block).toEqual({
      kind: "tool_use",
      id: toolCallId("call_d4"),
      name: "bash",
      arguments: '{"cmd'
    });
    // ...and the block that could not be assembled at all still says so with
    // its raw accumulations rather than disappearing.
    expect(assembly.blocks[4]?.block).toBeNull();
    expect(assembly.blocks[4]?.partial).toEqual({ text: "", toolName: null, toolArguments: "" });
  });

  it("surfaces only the safe prefix, as a projection of the full record", () => {
    const assembly = abortedAssembly();
    expect(surfaceBlocks(assembly)).toEqual([
      { kind: "text", text: "done" },
      { kind: "text", text: "half a sen" }
    ]);
    // The projection is narrower than the record, and the record is what a
    // durable writer signs.
    expect(assembly.blocks).toHaveLength(5);
  });

  it("never synthesizes a tool call id for a call the provider never named", () => {
    // dsh falls back to `call-${index}`. Signed rows are keyed by this id, and
    // "call-0" is unique to neither a session nor a step, so a synthesized id
    // would be a durable claim that the provider issued something it did not.
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 0, blockKind: "tool_use" });
    const assembly = assembler.abort("timeout");
    expect(assembly.blocks[0]?.block).toBeNull();
    expect(assembly.blocks[0]?.partial).toEqual({
      text: "",
      toolName: null,
      toolArguments: ""
    });
  });

  it("refuses to accept chunks once the consumer aborted", () => {
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 0, blockKind: "text" });
    assembler.abort("user_cancelled");
    let code: string | null = null;
    try {
      assembler.push({ type: "text-delta", index: 0, text: "late" });
    } catch (error) {
      if (!isLlmStreamProtocolError(error)) throw error;
      code = error.code;
    }
    // Output arriving after nobody is listening is output nobody will sign.
    expect(code).toBe("AMC_LLM_STREAM_CHUNK_AFTER_TERMINATION");
  });

  it("refuses to call a stream that never finished a completion", () => {
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 0, blockKind: "text" });
    assembler.push({ type: "text-delta", index: 0, text: "hi" });
    assembler.push({ type: "block-end", index: 0, block: { kind: "text", text: "hi" } });
    assembler.push(USAGE);
    let code: string | null = null;
    try {
      assembler.complete();
    } catch (error) {
      if (!isLlmStreamProtocolError(error)) throw error;
      code = error.code;
    }
    // A dropped connection read as a clean ending is the failure mode this
    // rejection exists to prevent; the caller must abort() instead.
    expect(code).toBe("AMC_LLM_STREAM_NOT_TERMINATED");
  });
});

describe("stream vocabulary", () => {
  it("counts billed input as uncached input plus both cache classes", () => {
    // The disjointness rule, encoded once. Providers that fold cache hits into
    // a single prompt total must subtract them back out in the adapter, and a
    // caller that adds the fields itself is the mistake this function prevents.
    expect(billedInputTokens({ inputTokens: 10, outputTokens: 4 })).toBe(10);
    expect(
      billedInputTokens({ inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2 })
    ).toBe(15);
  });

  it("does not count reasoning tokens, which are already inside outputTokens", () => {
    expect(billedInputTokens({ inputTokens: 10, outputTokens: 4, reasoningTokens: 4 })).toBe(10);
  });

  it("treats empty deltas and empty tool frames as carrying no content", () => {
    // One shared predicate, so a time-to-first-token measurement and a
    // "did this stream produce anything" check cannot disagree. Providers emit
    // empty frames as keepalives; counting one reports a token that never came.
    expect(isContentDelta({ type: "text-delta", index: 0, text: "" })).toBe(false);
    expect(isContentDelta({ type: "text-delta", index: 0, text: "a" })).toBe(true);
    expect(isContentDelta({ type: "thinking-delta", index: 0, text: "" })).toBe(false);
    expect(
      isContentDelta({ type: "tool-call-delta", index: 0, id: toolCallId("c"), argumentsDelta: "" })
    ).toBe(false);
    expect(
      isContentDelta({
        type: "tool-call-delta",
        index: 0,
        id: toolCallId("c"),
        name: "echo",
        argumentsDelta: ""
      })
    ).toBe(true);
    expect(isContentDelta({ type: "block-start", index: 0, blockKind: "text" })).toBe(false);
    expect(isContentDelta({ type: "finish", reason: { kind: "stop" } })).toBe(false);
  });
});
