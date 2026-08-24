import { describe, expect, it } from "vitest";
import { BlockAssembler, type StreamChunk, type ToolCallId, toolCallId } from "../src/llm/index.js";
import {
  type LlmStreamProtocolCode,
  isLlmStreamProtocolError
} from "../src/llm/streamProtocol.js";

/**
 * Negative coverage for the stream grammar.
 *
 * Every rule here has exactly one code and exactly one row below, so deleting
 * the rule turns this file red. That is the whole point: the P2.0 post-mortem
 * in this repository was three verifier checks that had no failing case and so
 * could be removed without anyone noticing. A grammar rule with no failing test
 * is decoration.
 *
 * These run against a stub stream — no network, no adapter, no credentials.
 * That is not a convenience, it is the only way the ordering guarantee is
 * testable at all: no live provider can be asked to emit `finish` before
 * `usage` on demand.
 */

const CALL = toolCallId("call_x");
const GOOD_USAGE: StreamChunk = { type: "usage", usage: { inputTokens: 5, outputTokens: 2 } };
const STOP: StreamChunk = { type: "finish", reason: { kind: "stop" } };

/**
 * Drive a stream and return the protocol code it violated.
 *
 * Throws when NOTHING was thrown, so a removed rule fails loudly here instead
 * of quietly passing an `expect(...).toThrow()` that never ran.
 */
function violationCode(chunks: readonly StreamChunk[], settle: "none" | "complete" = "none"): string {
  const assembler = new BlockAssembler();
  try {
    for (const chunk of chunks) assembler.push(chunk);
    if (settle === "complete") assembler.complete();
  } catch (error) {
    if (!isLlmStreamProtocolError(error)) throw error;
    return error.code;
  }
  throw new Error("expected a stream protocol violation, but the stream was accepted");
}

describe("stream grammar — usage must precede a successful finish (VERIFY-2)", () => {
  it("rejects a finish that arrives before any usage", () => {
    // The headline rule. A step that reports no token accounting is a governed
    // agent that cannot answer what it cost, which is one of the questions this
    // product exists to answer.
    expect(violationCode([STOP])).toBe("AMC_LLM_STREAM_USAGE_MISSING");
  });

  it.each([["tool_calls"], ["max_tokens"]] as const)(
    "rejects a %s finish that arrives before any usage",
    (kind) => {
      expect(violationCode([{ type: "finish", reason: { kind } }])).toBe(
        "AMC_LLM_STREAM_USAGE_MISSING"
      );
    }
  );

  it("rejects usage that arrives after the finish", () => {
    // The other half of the ordering: the accounting is worthless if it can
    // arrive once the stream has already been declared over and folded.
    expect(violationCode([GOOD_USAGE, STOP, GOOD_USAGE])).toBe(
      "AMC_LLM_STREAM_CHUNK_AFTER_TERMINATION"
    );
  });

  it("accepts usage immediately before the finish", () => {
    const assembler = new BlockAssembler();
    assembler.push(GOOD_USAGE);
    assembler.push(STOP);
    expect(assembler.complete().usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it("does NOT require usage on a failed finish", () => {
    // The carve-out, and it is deliberate: a 429 has no completion to account
    // for. Demanding usage here would reclassify every provider failure as an
    // AMC contract violation and destroy the typed-error path a caller needs.
    const assembler = new BlockAssembler();
    assembler.push({
      type: "finish",
      reason: { kind: "error", failure: { message: "Too Many Requests", code: "RATE_LIMIT", status: 429 } }
    });
    const assembly = assembler.complete();
    expect(assembly.usage).toBeNull();
    expect(assembly.finishReason).toEqual({
      kind: "error",
      failure: { message: "Too Many Requests", code: "RATE_LIMIT", status: 429 }
    });
  });

  it("does NOT require every block to be closed on a failed finish", () => {
    // A stream cut off mid-block is exactly what a failure looks like; the
    // assembler records each open block's disposition instead.
    const assembler = new BlockAssembler();
    assembler.push({ type: "block-start", index: 0, blockKind: "text" });
    assembler.push({ type: "text-delta", index: 0, text: "partial" });
    assembler.push({
      type: "finish",
      reason: { kind: "aborted", failure: { message: "cancelled", code: "ABORTED" } }
    });
    expect(assembler.complete().blocks[0]?.outcome).toEqual({ status: "truncated" });
  });
});

describe("stream grammar — one rule, one code, one failing case", () => {
  const cases: ReadonlyArray<
    readonly [LlmStreamProtocolCode, readonly StreamChunk[], "none" | "complete"]
  > = [
    // A negative index cannot key a block, and a fractional one cannot key a
    // signed row's blockIndex either.
    ["AMC_LLM_STREAM_BLOCK_INDEX_INVALID", [{ type: "block-start", index: -1, blockKind: "text" }], "none"],
    [
      "AMC_LLM_STREAM_BLOCK_INDEX_INVALID",
      [{ type: "block-start", index: 1.5, blockKind: "text" }],
      "none"
    ],
    // AMC-specific strengthening: dsh permits reusing an index after closing
    // it, which would fold two model blocks into one signed row.
    [
      "AMC_LLM_STREAM_BLOCK_REOPENED",
      [
        { type: "block-start", index: 0, blockKind: "text" },
        { type: "block-end", index: 0, block: { kind: "text", text: "" } },
        { type: "block-start", index: 0, blockKind: "text" }
      ],
      "none"
    ],
    ["AMC_LLM_STREAM_DELTA_WITHOUT_BLOCK", [{ type: "text-delta", index: 0, text: "x" }], "none"],
    [
      "AMC_LLM_STREAM_DELTA_KIND_MISMATCH",
      [
        { type: "block-start", index: 0, blockKind: "thinking" },
        { type: "text-delta", index: 0, text: "x" }
      ],
      "none"
    ],
    [
      "AMC_LLM_STREAM_BLOCK_END_UNOPENED",
      [{ type: "block-end", index: 0, block: { kind: "text", text: "" } }],
      "none"
    ],
    [
      "AMC_LLM_STREAM_BLOCK_END_KIND_MISMATCH",
      [
        { type: "block-start", index: 0, blockKind: "text" },
        { type: "block-end", index: 0, block: { kind: "thinking", text: "" } }
      ],
      "none"
    ],
    [
      // The brand refuses an empty id, but a wire decoder can cast instead of
      // minting; this is the boundary that stops an unjoinable tool/call row.
      "AMC_LLM_STREAM_TOOL_CALL_ID_EMPTY",
      [
        { type: "block-start", index: 0, blockKind: "tool_use" },
        { type: "tool-call-delta", index: 0, id: "" as unknown as ToolCallId, argumentsDelta: "{}" }
      ],
      "none"
    ],
    [
      // One block is one call. dsh lets each delta overwrite the id, so a
      // provider switching ids mid-block mis-attributes the arguments forever.
      "AMC_LLM_STREAM_TOOL_CALL_ID_CHANGED",
      [
        { type: "block-start", index: 0, blockKind: "tool_use" },
        { type: "tool-call-delta", index: 0, id: CALL, argumentsDelta: "{" },
        { type: "tool-call-delta", index: 0, id: toolCallId("call_y"), argumentsDelta: "}" }
      ],
      "none"
    ],
    [
      // The closing frame may not rewrite what the deltas pinned either.
      "AMC_LLM_STREAM_TOOL_CALL_ID_CHANGED",
      [
        { type: "block-start", index: 0, blockKind: "tool_use" },
        { type: "tool-call-delta", index: 0, id: CALL, argumentsDelta: "{}" },
        {
          type: "block-end",
          index: 0,
          block: { kind: "tool_use", id: toolCallId("call_y"), name: "n", arguments: "{}" }
        }
      ],
      "none"
    ],
    ["AMC_LLM_STREAM_USAGE_REPEATED", [GOOD_USAGE, GOOD_USAGE], "none"],
    [
      "AMC_LLM_STREAM_USAGE_INVALID",
      [{ type: "usage", usage: { inputTokens: -1, outputTokens: 2 } }],
      "none"
    ],
    [
      "AMC_LLM_STREAM_USAGE_INVALID",
      [{ type: "usage", usage: { inputTokens: 1, outputTokens: 2.5 } }],
      "none"
    ],
    [
      // An optional count is validated too: absent means unreported, but a
      // present nonsense value must not reach a durable row.
      "AMC_LLM_STREAM_USAGE_INVALID",
      [{ type: "usage", usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: -3 } }],
      "none"
    ],
    [
      "AMC_LLM_STREAM_OPEN_BLOCK_AT_FINISH",
      [{ type: "block-start", index: 0, blockKind: "text" }, GOOD_USAGE, STOP],
      "none"
    ],
    ["AMC_LLM_STREAM_NOT_TERMINATED", [GOOD_USAGE], "complete"]
  ];

  it.each(cases)("rejects with %s", (code, chunks, settle) => {
    expect(violationCode(chunks, settle)).toBe(code);
  });

  it("accepts the complete, correctly ordered grammar", () => {
    const assembler = new BlockAssembler();
    const chunks: StreamChunk[] = [
      { type: "block-start", index: 0, blockKind: "text" },
      { type: "text-delta", index: 0, text: "a" },
      { type: "block-start", index: 1, blockKind: "tool_use" },
      { type: "tool-call-delta", index: 1, id: CALL, name: "echo", argumentsDelta: "{}" },
      { type: "block-end", index: 1, block: { kind: "tool_use", id: CALL, name: "echo", arguments: "{}" } },
      { type: "block-end", index: 0, block: { kind: "text", text: "a" } },
      GOOD_USAGE,
      { type: "finish", reason: { kind: "tool_calls" } }
    ];
    for (const chunk of chunks) assembler.push(chunk);
    expect(assembler.complete().blocks).toHaveLength(2);
  });

  it("reports which chunk and which block broke the rule", () => {
    // The error carries routing data, not just prose, so a caller records the
    // violation without parsing a message.
    const assembler = new BlockAssembler();
    try {
      assembler.push({ type: "block-end", index: 7, block: { kind: "text", text: "" } });
    } catch (error) {
      if (!isLlmStreamProtocolError(error)) throw error;
      expect(error.chunkType).toBe("block-end");
      expect(error.blockIndex).toBe(7);
      return;
    }
    throw new Error("expected a stream protocol violation");
  });
});
