import { describe, expect, it } from "vitest";
import { LiveTextPreview, type LiveTextPreviewEvent } from "../src/llm/adapter/liveTextPreview.js";

function fixture(secret: string | null = null) {
  const events: LiveTextPreviewEvent[] = [];
  const preview = new LiveTextPreview({ sessionId: "session", headerEventId: "request", secret, notify: event => events.push(event) });
  const text = () => events.flatMap(event => event.kind === "text" ? [event.text] : []).join("");
  return { events, preview, text };
}

describe("native text preview is a bounded presentation channel", () => {
  it("redacts a credential split across chunks, blocks and stripped controls", () => {
    const f = fixture("sk-example-secret");
    f.preview.push({ type: "text-delta", index: 0, text: "Visible sk-exam" });
    f.preview.push({ type: "thinking-delta", index: 1, text: "private reasoning" });
    f.preview.push({ type: "text-delta", index: 2, text: "ple-\u0000secret done" });
    f.preview.finish();
    expect(f.text()).toBe("Visible <redacted> done");
    expect(f.events.every(event => event.trust === "provisional" && event.sessionId === "session" && event.headerEventId === "request")).toBe(true);
  });

  it("preserves a Unicode character split between provider chunks", () => {
    const f = fixture();
    f.preview.push({ type: "text-delta", index: 0, text: "a\ud83d" });
    f.preview.push({ type: "text-delta", index: 0, text: "\ude80b" });
    f.preview.finish();
    expect(f.text()).toBe("a🚀b");
  });

  it("bounds UTF-8 output without emitting a partial character and reports truncation", () => {
    const f = fixture();
    f.preview.push({ type: "text-delta", index: 0, text: "a".repeat(1024 * 1024 - 1) + "🚀" });
    f.preview.push({ type: "text-delta", index: 0, text: "late" });
    f.preview.finish();
    expect(Buffer.byteLength(f.text())).toBe(1024 * 1024 - 1);
    expect(f.text()).not.toContain("�");
    expect(f.events.at(-1)).toMatchObject({ kind: "end", truncated: true });
  });

  it("does not let presentation failure or late deltas change execution", () => {
    const preview = new LiveTextPreview({ sessionId: "s", headerEventId: "r", secret: null, notify: () => { throw new Error("display closed"); } });
    expect(() => { preview.push({ type: "text-delta", index: 0, text: "reply" }); preview.finish(); }).not.toThrow();
    const f = fixture();
    f.preview.finish(); f.preview.finish();
    f.preview.push({ type: "text-delta", index: 0, text: "late" });
    expect(f.events).toHaveLength(1);
    expect(f.text()).toBe("");
  });
});
