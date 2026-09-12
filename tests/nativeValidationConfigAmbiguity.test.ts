/** AMC-1538 / batch02 T01 — AUTHORING ONLY, UNEXECUTED.
 * All commands, files, hashes and declarations are synthetic test inputs.
 * The actual loader/selection/Studio helpers are called only on a later authorized
 * test run. No command, provider, session or fixture was executed during authoring.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NativeValidationConfigError, loadNativeValidationConfiguration,
  resolveNativeValidationSelection, selectNativeValidationChecks
} from "../src/setup/nativeValidationConfig.js";
import { assertNativeTaskValidationPin, inspectNativeTaskValidation } from "../src/studio/nativeTaskValidation.js";

const check = { id: "first", title: "Synthetic first", command: "synthetic PRIVATE_CONFIG_VALUE_CANARY", timeoutMs: 4000 };
const checkJson = JSON.stringify(check);
const duplicateMessage = "Validation config contains duplicate JSON object members. File content is withheld.";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
let root = "", fileNumber = 0;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-validation-ambiguity-")));
  fileNumber = 0;
});
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = ""; });

function retain(bytes: string | Buffer) {
  const path = join(root, `config-${fileNumber++}.json`);
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  return path;
}
function caught(action: () => unknown): Error {
  try { action(); } catch (error) { assert.ok(error instanceof Error); return error; }
  assert.fail("The synthetic ambiguous or malformed input must be refused.");
}
function duplicateCheck(key: keyof typeof check, firstValue: unknown, secondSpelling = JSON.stringify(key)) {
  const others = Object.entries(check).filter(([name]) => name !== key)
    .map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`).join(",");
  return `{"schemaVersion":1,"checks":[{${others},${JSON.stringify(key)}:${JSON.stringify(firstValue)},${secondSpelling}:${JSON.stringify(check[key])}}]}`;
}

describe("duplicate-member refusal through native validation's actual loader", () => {
  const ambiguous = [
    { label: "root version conflict", text: `{"schemaVersion":0,"schemaVersion":1,"checks":[${checkJson}]}` },
    { label: "identical root version", text: `{"schemaVersion":1,"schemaVersion":1,"checks":[${checkJson}]}` },
    { label: "root roster replacement", text: `{"schemaVersion":1,"checks":[],"checks":[${checkJson}]}` },
    { label: "escaped root alias", text: String.raw`{"schemaVersion":1,"\u0073chemaVersion":1,"checks":[${checkJson}]}` },
    { label: "check ID replacement", text: duplicateCheck("id", "discarded") },
    { label: "check title replacement", text: duplicateCheck("title", "discarded title") },
    { label: "check command replacement", text: duplicateCheck("command", "discarded PRIVATE_CONFIG_FIRST_CANARY") },
    { label: "check timeout replacement", text: duplicateCheck("timeoutMs", 1) },
    { label: "identical check command", text: duplicateCheck("command", check.command) },
    { label: "escaped command alias", text: duplicateCheck("command", "discarded", String.raw`"comm\u0061nd"`) },
    { label: "escaped ID alias", text: duplicateCheck("id", "discarded", String.raw`"\u0069d"`) },
    { label: "private unknown member repeated", text: `{"schemaVersion":1,"checks":[${checkJson}],"PRIVATE_CONFIG_KEY_CANARY":0,"PRIVATE_CONFIG_KEY_CANARY":1}` }
  ];
  it.each(ambiguous)("refuses $label even when the exact original bytes are pinned", ({ text }) => {
    const lawful = retain(JSON.stringify({ schemaVersion: 1, checks: [check] }));
    expect(loadNativeValidationConfiguration(lawful).config.checks).toEqual([check]);
    const path = retain(text), before = readFileSync(path), digest = hash(before);
    for (const expected of [undefined, digest]) {
      const error = caught(() => loadNativeValidationConfiguration(path, expected));
      expect(error).toBeInstanceOf(NativeValidationConfigError);
      expect(error.message).toBe(duplicateMessage);
      expect(error.message).not.toContain("PRIVATE_CONFIG");
      expect(error.message).not.toContain(path);
    }
    expect(readFileSync(path)).toEqual(before);
  });

  it("rejects a duplicate inside a nested value instead of hiding it behind the last value", () => {
    const text = `{"schemaVersion":1,"checks":[${checkJson}],"extra":{"deep":[{"same":0,"same":1}]}}`;
    const path = retain(text);
    expect(caught(() => loadNativeValidationConfiguration(path)).message).toBe(duplicateMessage);
    expect(readFileSync(path, "utf8")).toBe(text);
  });

  it("retains digest mismatch precedence rather than decoding a differently pinned file", () => {
    const text = duplicateCheck("command", "discarded"), path = retain(text);
    const error = caught(() => loadNativeValidationConfiguration(path, hash("different synthetic bytes")));
    expect(error.message).toContain("changed from its pinned digest");
    expect(error.message).not.toContain("PRIVATE_CONFIG");
    expect(caught(() => loadNativeValidationConfiguration(path, hash(text))).message).toBe(duplicateMessage);
  });

  it("keeps repeated field names in distinct checks lawful and preserves explicit selection order", () => {
    const second = { ...check, id: "second", title: "Synthetic second", timeoutMs: undefined };
    const text = ` \n${JSON.stringify({ schemaVersion: 1, checks: [check, second] }, null, 2)}\n`;
    const path = retain(text), before = readFileSync(path), loaded = loadNativeValidationConfiguration(path, hash(before));
    const selected = selectNativeValidationChecks(loaded, ["second", "first"]);
    expect(selected.configSha256).toBe(hash(before));
    expect(selected.checks).toEqual([{ ...second, timeoutMs: 120000 }, check]);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.checks)).toBe(true);
    expect(selected.checks.every(item => Object.isFrozen(item))).toBe(true);
    expect(resolveNativeValidationSelection({ validationConfig: path, validationConfigSha256: hash(before), validate: ["second", "first"] })).toEqual(selected);
    expect(readFileSync(path)).toEqual(before);
    expect(inspectNativeTaskValidation(path, false)).toMatchObject({ ready: true, configSha256: hash(before),
      checks: [{ id: "first", title: check.title }, { id: "second", title: second.title }] });
  });

  it("does not mistake escaped quotes, commas, arrays or member-looking string contents for keys", () => {
    const value = { ...check, title: 'Synthetic { } [ ] : , "id" : "id" \\ suffix',
      command: String.raw`synthetic "id":"one","id":"two", [ { } ] \\ \u0061` };
    const path = retain(JSON.stringify({ schemaVersion: 1, checks: [value] }));
    expect(loadNativeValidationConfiguration(path).config.checks).toEqual([value]);
  });

  it("preserves the pre-existing schema and null/omitted timeout default behavior", () => {
    for (const timeoutMs of [undefined, null]) {
      const path = retain(JSON.stringify({ schemaVersion: 1, checks: [{ ...check, timeoutMs }] }));
      expect(loadNativeValidationConfiguration(path).config.checks[0]?.timeoutMs).toBe(120000);
    }
    const unsupported = retain(JSON.stringify({ schemaVersion: 2, checks: [check] }));
    expect(caught(() => loadNativeValidationConfiguration(unsupported)).message).toContain("schemaVersion 1");
  });

  it.each([
    { label: "malformed JSON", bytes: Buffer.from('{"PRIVATE_CONFIG_JSON_CANARY":') },
    { label: "invalid UTF-8", bytes: Buffer.from([0xff, 0xfe]) }
  ])("keeps $label in the existing private syntax/encoding refusal", ({ bytes }) => {
    const path = retain(bytes), before = readFileSync(path);
    expect(caught(() => loadNativeValidationConfiguration(path)).message)
      .toBe("Validation config must contain valid UTF-8 JSON. File content is withheld.");
    expect(readFileSync(path)).toEqual(before);
  });

  it("keeps the byte limit and unknown-field refusals before any command authority", () => {
    const large = retain(`{"PRIVATE_CONFIG_CANARY":"${"x".repeat(32 * 1024)}"}`);
    expect(caught(() => loadNativeValidationConfiguration(large)).message).toContain("32 KiB");
    const extra = retain(JSON.stringify({ schemaVersion: 1, checks: [check], autoGrant: true }));
    expect(caught(() => loadNativeValidationConfiguration(extra)).message).toContain("schemaVersion 1");
  });
});

describe("ambiguous configuration stays unavailable on public selection surfaces", () => {
  it("rejects selection, withholds Studio choices, and refuses even a matching file pin", () => {
    const text = duplicateCheck("command", "discarded PRIVATE_CONFIG_FIRST_CANARY"), path = retain(text);
    const before = readFileSync(path), digest = hash(before);
    expect(caught(() => resolveNativeValidationSelection({ validationConfig: path, validationConfigSha256: digest, validate: ["first"] })).message).toBe(duplicateMessage);
    const inspected = inspectNativeTaskValidation(path, false);
    expect(inspected).toMatchObject({ ready: false, checks: [], configSha256: null });
    expect(JSON.stringify(inspected)).not.toContain("PRIVATE_CONFIG");
    expect(JSON.stringify(inspected)).not.toContain(path);
    const error = caught(() => assertNativeTaskValidationPin(path, { configSha256: digest, checkIds: ["first"] }));
    expect(error).toMatchObject({ code: "NATIVE_VALIDATION_CHANGED", statusCode: 409 });
    expect(error.message).not.toContain("PRIVATE_CONFIG");
    expect(readFileSync(path)).toEqual(before);
  });

  it("keeps demo/no-selection paths nonexecuting and never implicitly selects all configured checks", () => {
    const path = retain(JSON.stringify({ schemaVersion: 1, checks: [check] }));
    expect(inspectNativeTaskValidation(path, true)).toMatchObject({ ready: false, checks: [], configSha256: null });
    expect(resolveNativeValidationSelection({})).toBeUndefined();
    expect(assertNativeTaskValidationPin(undefined, undefined)).toBeUndefined();
    expect(caught(() => resolveNativeValidationSelection({ validationConfig: path })).message).toContain("Select one through eight");
  });
});
