import { describe, expect, it } from "vitest";
import { stubProviderAdapter } from "../src/agent/stubProvider.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";

/** UX-28: a plain sentence in a chat with workspace tools gets a reply, not a call the tool's schema refuses. */
async function reply(text: string, tools: readonly object[]) {
  const body = JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text }] }], tools });
  const chunks: StreamChunk[] = [];
  for await (const chunk of stubProviderAdapter.decode({ status: 200, headers: {}, body: bodyFromChunks([body]) })) chunks.push(chunk);
  const end = chunks.find((c) => c.type === "block-end");
  return end?.type === "block-end" ? end.block : null;
}

const fsRead = { name: "fs.read", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };
const fsWrite = { name: "fs.write", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } };
const echo = { name: "echo", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } };

describe("the stand-in model and a plain sentence (UX-28)", () => {
  it("answers in text, with a tool request to try, when no offered tool takes the sentence as its text", async () => {
    const block = await reply("first turn", [fsRead, fsWrite]);
    expect(block?.kind).toBe("text");
    const text = block?.kind === "text" ? block.text : "";
    expect(text).toContain("first turn");
    expect(text).toContain('{"tool": "fs.write", "arguments": {"path": "hello.txt", "content": "hi"}}');
  });

  it("still calls the first tool whose only required argument is text (the demo's echo)", async () => {
    expect(await reply("hello", [fsRead, echo])).toMatchObject({ kind: "tool_use", name: "echo", arguments: JSON.stringify({ text: "hello" }) });
  });

  it("still makes the call a typed tool request spells out", async () => {
    const directive = JSON.stringify({ tool: "fs.read", arguments: { path: "notes.txt" } });
    expect(await reply(directive, [fsRead, fsWrite])).toMatchObject({ kind: "tool_use", name: "fs.read", arguments: JSON.stringify({ path: "notes.txt" }) });
  });
});
