import { describe, expect, test } from "vitest";
import { detectProtectedRequest, protectedWalk } from "../src/dataflow/detectors.js";

/**
 * P2-02: the password rule reads member names as decoded, so a `password` key spelled with JSON escapes (once, or
 * escaped again inside an escaped document) is the same credential member on every walk path: parsed JSON, text that
 * does not parse, and a tool call's arguments.
 */
const SECRET = "hunter2-fixture";
const redacted = (text: string): string =>
  protectedWalk({ budget: 1_000_000, replace: (finding) => `<${finding.dataClass}>`, opaque: (reason) => `<opaque:${reason}>` }).text(text);

describe("the password rule on decoded member names", () => {
  test.each([
    ["plain key in JSON", `{"password":"${SECRET}"}`],
    ["escaped key in JSON", `{"\\u0070assword":"${SECRET}"}`],
    ["escaped upper-case key in JSON", `{"\\u0050ASSWORD":"${SECRET}"}`],
    ["escaped key in text that does not parse", `log "pass\\u0077ord": "${SECRET}" and more`],
    ["escaped key with a number value in text that does not parse", `x "\\u0070assword": 20261101 y`],
    ["escaped key in an escaped document", `{"note":"{\\"\\\\u0070assword\\":\\"${SECRET}\\"}"}`],
    ["doubly escaped key in JSON", `{"\\\\u0070assword":"${SECRET}"}`],
    ["doubly escaped key with a number value", `{"\\\\u0070assword":20261101}`],
    ["doubly escaped key in an array item", `[{"\\\\u0070assword":"${SECRET}"}]`],
    ["doubly escaped key in text that does not parse", `x "\\\\u0070assword": 20261101 y`]
  ])("%s: the value is replaced", (_name, text) => {
    const out = redacted(text);
    expect(out).toContain("<credential>");
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("20261101");
  });

  test("a model request whose tool-call arguments hold a doubly escaped password key is detected", () => {
    const detection = detectProtectedRequest({ model: "m", system: null, params: {}, tools: [], messages: [{ role: "assistant",
      parts: [{ kind: "tool_use", toolCallId: "c1", toolName: "login", argumentsJson: `{"\\\\u0070assword":"${SECRET}"}` }] }] } as never);
    expect(detection.classes).toContain("credential");
  });

  test.each([
    ["an escaped non-secret key", `{"\\u0070assword_hint":"the usual"}`],
    ["a page cursor under an escaped name", `{"next\\u0050ageToken":"cursor-0001"}`]
  ])("%s is not a credential", (_name, text) => {
    expect(redacted(text)).toBe(text);
  });
});
