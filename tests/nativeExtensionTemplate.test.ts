import { describe, expect, it } from "vitest";
import { parseNativeExtensionManifest } from "../src/extensions/nativeExtensionManifest.js";
import { expandNativeExtensionTemplate, nativeExtensionTemplateVariables } from "../src/extensions/nativeExtensionTemplate.js";

const base = { path: "review.txt", sha256: "a".repeat(64) };
const command = { ...base, template: { version: 1 as const, positional: [{}, {}] } };
const manifest = (template: unknown) => Buffer.from(JSON.stringify({ schemaVersion: 1, id: "example", contexts: [], commands: { review: { ...base, template } } }));

describe("WP22 template guards", () => {
  it.each([
    ["unknown variable", "{{args}} {{unknown}}"],
    ["nested variable", "{{{args}}}"],
    ["unbalanced braces", "{{args}} {{unfinished"],
    ["empty variables", "plain text"]
  ])("refuses %s", (_name, template) => {
    expect(() => nativeExtensionTemplateVariables(template, base)).toThrow(/template/i);
  });
  it("refuses undeclared positional variables", () => {
    expect(() => nativeExtensionTemplateVariables("{{2}}", { ...base, template: { version: 1, positional: [{}] } })).toThrow(/undeclared/);
  });
  it.each(["x".repeat(16_385), "bad\0arg"])("bounds raw argument bytes and NUL %#", args => {
    expect(() => expandNativeExtensionTemplate("{{args}}", base, args)).toThrow(/text limit|NUL/);
  });
  it("refuses extra positional arguments", () => {
    expect(() => expandNativeExtensionTemplate("{{1}} {{2}}", command, "a b c")).toThrow(/at most 2/);
  });
  it("refuses missing positional arguments", () => {
    expect(() => expandNativeExtensionTemplate("{{1}} {{2}}", command, "a")).toThrow(/argument 2.*required/i);
  });
  it("bounds repeated expanded output", () => {
    expect(() => expandNativeExtensionTemplate("{{args}}".repeat(100), base, "x".repeat(16_384))).toThrow(/Expanded.*limit/);
  });
  it.each([
    ["version", { version: 2, positional: [{}] }],
    ["unknown field", { version: 1, positional: [{}], execute: true }],
    ["too many slots", { version: 1, positional: Array.from({ length: 33 }, () => ({})) }],
    ["no slots", { version: 1, positional: [] }],
    ["unknown slot field", { version: 1, positional: [{ execute: true }] }],
    ["NUL default", { version: 1, positional: [{ default: "bad\0value" }] }],
    ["UTF-8 byte default", { version: 1, positional: [{ default: "é".repeat(9_000) }] }],
    ["control character hint", { version: 1, positional: [{}], argumentHint: "bad\nhint" }],
    ["empty hint", { version: 1, positional: [{}], argumentHint: "" }],
    ["long hint", { version: 1, positional: [{}], argumentHint: "x".repeat(257) }]
  ])("refuses invalid metadata: %s", (_name, template) => {
    expect(() => parseNativeExtensionManifest(manifest(template))).toThrow(/strict v1/);
  });
  it("keeps substitutions literal, handles defaults and replaces every occurrence", () => {
    const entry = { ...base, template: { version: 1 as const, positional: [{}, { default: "{{literal}} $(no-shell)" }] } };
    expect(expandNativeExtensionTemplate("{{args}} {{args}} {{1}} {{2}}", entry, "subject"))
      .toBe('"subject" "subject" "subject" "{{literal}} $(no-shell)"');
  });
});
