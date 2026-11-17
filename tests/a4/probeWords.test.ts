/**
 * The A4 full walk (2026-11-17): before Adapt's completion request the panel said "Run the context probe: one in-process
 * turn on the stub provider; AMC checks its signed user/message row for the plugin's text". What a person reads names
 * the built-in model "the stand-in model" (never "stub"), in plain words. The labels are Studio's readiness next
 * actions (shown by the console panel and `amc a4 guide`) and the Adapt card's text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the context probe in words a person reads", () => {
  test("Studio's next actions for the probe say stand-in model, not stub provider", () => {
    const labels = [...read("src/a4/adaptContextPlugin.ts").matchAll(/label: "([^"]*)"/g)].map((match) => match[1]);
    expect(labels.some((label) => label.startsWith("Run the context probe: ") && label.includes("stand-in model"))).toBe(true);
    expect(labels.filter((label) => /stub|in-process|user\/message row|frame/i.test(label))).toEqual([]);
  });

  test("the Adapt card says stand-in model", () => {
    const text = read("src/console/assets/a4Adapt.js").split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join("\n");
    expect(text).not.toMatch(/stub provider/);
    expect(text).toContain("stand-in model");
  });
});
