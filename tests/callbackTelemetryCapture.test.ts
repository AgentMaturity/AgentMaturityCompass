// AMC-1517: attribute admission in the passive callback capture. In-process
// synthetic spans only; this is not Pi conformance or exporter qualification.
import { describe, expect, test } from "vitest";
import { createCallbackTelemetryCapture } from "../src/importers/callbackTelemetryCapture.js";

const CONTENT = {
  "pi.message.content": "PRIVATE-MESSAGE", "user.email": "person@example.invalid", "pi.tool.result_text": "PRIVATE-RESULT",
  "gen_ai.prompt": "PRIVATE-PROMPT"
};

describe("callback capture attribute admission", () => {
  test("keys outside the operational allowlist are dropped and counted on spans, updates and events", async () => {
    const capture = createCallbackTelemetryCapture();
    await capture.startSpan({ name: "turn", attributes: { ...CONTENT, "pi.tool.name": "read" } }, span => {
      span.setAttributes({ ...CONTENT, "pi.step.kind": "model" });
      span.addEvent("chunk", { ...CONTENT, "pi.event.type": "delta" });
    });
    const document = capture.snapshot(), [span] = document.spans;
    expect(span!.attributes).toEqual({ "pi.tool.name": "read", "pi.step.kind": "model" });
    expect(span!.events[0]!.attributes).toEqual({ "pi.event.type": "delta" });
    expect(document.stats.filteredAttributes).toBe(12);
    expect(JSON.stringify(document)).not.toMatch(/PRIVATE-|person@/);
  });

  test("an explicit extension admits operational keys but never content-shaped keys", async () => {
    const capture = createCallbackTelemetryCapture({ allowedAttributes: ["app.region", "app.prompt.text", "app.api_key"] });
    await capture.startSpan({ name: "turn", attributes: { "app.region": "eu", "app.prompt.text": "PRIVATE-PROMPT", "app.api_key": "PRIVATE-KEY" } }, () => undefined);
    expect(capture.snapshot().spans[0]!.attributes).toEqual({ "app.region": "eu" });
  });

  test("known token counters stay admitted although their names contain input/output", async () => {
    const capture = createCallbackTelemetryCapture();
    await capture.startSpan({ name: "model", attributes: { "pi.ai.usage.input_tokens": 3, "pi.ai.usage.output_tokens": 2 } }, () => undefined);
    expect(capture.snapshot().spans[0]!.attributes).toEqual({ "pi.ai.usage.input_tokens": 3, "pi.ai.usage.output_tokens": 2 });
  });
});
