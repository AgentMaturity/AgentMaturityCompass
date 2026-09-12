/** AMC-1538 / batch02 T02 — AUTHORING ONLY, UNEXECUTED.
 * These synthetic direct-function cases never create sessions, files, processes,
 * providers, approvals or human observations. No test/module was run by authoring.
 */
import assert from "node:assert/strict";
import { describe, expect, it, vi } from "vitest";
import { freezeNativeValidationPlan, validationCheckPending, type NativeValidationPlan } from "../src/agent/nativeValidation.js";
import { parseNativeValidationResult } from "../src/agent/nativeValidationResult.js";

const check = (id = "first") => ({ id, title: "Synthetic check", command: "synthetic PRIVATE_PLAN_COMMAND_CANARY", timeoutMs: 4000 });
const plan = () => ({ configSha256: "a".repeat(64), checks: [check()] });
// Exercise runtime admission as a JavaScript/untyped caller; the cast is not validation.
const admit = (input: unknown) => freezeNativeValidationPlan(input as NativeValidationPlan);
function caught(input: unknown): Error {
  try { admit(input); } catch (error) { assert.ok(error instanceof Error); return error; }
  assert.fail("The malformed synthetic runtime plan must be refused.");
}

describe("native immutable plan admission refuses coercion and missing selected checks", () => {
  it("keeps a detached, dense immutable snapshot in the original selected order", () => {
    const input = { configSha256: "b".repeat(64), checks: [check("second"), check("first")] };
    const before = structuredClone(input), frozen = admit(input);
    expect(frozen).toEqual(before);
    expect(frozen).not.toBe(input); expect(frozen.checks).not.toBe(input.checks);
    expect(Object.isFrozen(frozen)).toBe(true); expect(Object.isFrozen(frozen.checks)).toBe(true);
    expect(frozen.checks.every(item => Object.isFrozen(item))).toBe(true);
    expect(frozen.checks.map(item => item.id)).toEqual(["second", "first"]);
    input.configSha256 = "c".repeat(64); input.checks[0]!.command = "synthetic changed command";
    input.checks.reverse(); input.checks.push(check("later"));
    expect(frozen).toEqual(before);
    const pending = { status: "pending", turn: 1, configSha256: frozen.configSha256, checks: frozen.checks.map(validationCheckPending) };
    expect(parseNativeValidationResult(pending)).toEqual(pending);
    expect(pending.checks.every(item => item.status === "pending" && item.callId === null && item.outputEventId === null)).toBe(true);
  });

  it("accepts already-frozen lawful input without changing it or granting execution", () => {
    const input = plan(), before = structuredClone(input);
    Object.freeze(input.checks[0]); Object.freeze(input.checks); Object.freeze(input);
    expect(admit(input)).toEqual(before); expect(input).toEqual(before);
  });

  it.each([
    { label: "null", value: null }, { label: "undefined", value: undefined },
    { label: "number", value: 1 }, { label: "boolean", value: true },
    { label: "string", value: "synthetic-plan" }, { label: "empty array", value: [] }
  ])("refuses a $label plan container with a bounded private error", ({ value }) => {
    expect(caught(value).message).toBe("Invalid native validation plan.");
  });

  it("does not admit a decorated array or function as a plan object", () => {
    const array = Object.assign([], plan()), fn = Object.assign(() => undefined, plan());
    expect(caught(array).message).toBe("Invalid native validation plan.");
    expect(caught(fn).message).toBe("Invalid native validation plan.");
  });

  it.each([
    { label: "numeric", value: 1 }, { label: "boolean", value: true },
    { label: "null", value: null }, { label: "undefined", value: undefined },
    { label: "bigint", value: 1n }, { label: "symbol", value: Symbol("synthetic") },
    { label: "boxed string", value: new String("first") }, { label: "single-element array", value: ["first"] }
  ])("rejects a $label ID instead of accepting its coerced spelling", ({ value }) => {
    const input = plan(); Reflect.set(input.checks[0]!, "id", value);
    expect(caught(input).message).toBe("Invalid native validation check.");
    expect(input.checks[0]!.id).toBe(value);
  });

  it.each([
    { label: "boxed string", value: new String("a".repeat(64)) },
    { label: "single-element array", value: ["a".repeat(64)] },
    { label: "null", value: null }, { label: "undefined", value: undefined },
    { label: "number", value: 0 }, { label: "symbol", value: Symbol("synthetic") }
  ])("rejects a $label digest rather than coercing it", ({ value }) => {
    const input = plan(); Reflect.set(input, "configSha256", value);
    expect(caught(input).message).toBe("Invalid native validation plan.");
    expect(input.configSha256).toBe(value);
  });

  it.each(["id", "digest"] as const)("does not invoke custom primitive conversion for an invalid %s", field => {
    const toPrimitive = vi.fn(() => field === "id" ? "first" : "a".repeat(64));
    const toString = vi.fn(() => "PRIVATE_PLAN_CONVERSION_CANARY");
    const supplied = { [Symbol.toPrimitive]: toPrimitive, toString };
    const input = plan();
    if (field === "id") Reflect.set(input.checks[0]!, "id", supplied);
    else Reflect.set(input, "configSha256", supplied);
    const error = caught(input);
    expect(error.message).toBe(field === "id" ? "Invalid native validation check." : "Invalid native validation plan.");
    expect(toPrimitive).not.toHaveBeenCalled(); expect(toString).not.toHaveBeenCalled();
    expect(error.message).not.toContain("PRIVATE_PLAN");
  });

  it.each([
    { label: "null", value: null }, { label: "undefined", value: undefined },
    { label: "number", value: 1 }, { label: "string", value: "first" },
    { label: "decorated array", value: Object.assign([], check()) },
    { label: "decorated function", value: Object.assign(() => undefined, check()) }
  ])("refuses a $label check container without skipping the selected slot", ({ value }) => {
    const input = { configSha256: "a".repeat(64), checks: [value] };
    expect(caught(input).message).toBe("Invalid native validation check.");
    expect(input.checks).toHaveLength(1); expect(input.checks[0]).toBe(value);
  });

  it.each(["all-holes", "middle-hole", "trailing-hole"] as const)("rejects %s instead of returning a sparse or shortened plan", mode => {
    const checks = new Array<ReturnType<typeof check>>(3);
    if (mode !== "all-holes") checks[0] = check("first");
    if (mode === "middle-hole") checks[2] = check("third");
    if (mode === "trailing-hole") checks[1] = check("second");
    const keys = Object.keys(checks), beforeLength = checks.length;
    Object.freeze(checks);
    expect(caught({ configSha256: "a".repeat(64), checks }).message).toBe("Invalid native validation check.");
    expect(Object.keys(checks)).toEqual(keys); expect(checks).toHaveLength(beforeLength);
  });

  it("does not fill a missing own slot from an inherited numeric property", () => {
    const checks = new Array<ReturnType<typeof check>>(1);
    const inherited = Object.create(Array.prototype);
    inherited[0] = check(); Object.setPrototypeOf(checks, inherited);
    expect(Object.hasOwn(checks, 0)).toBe(false);
    expect(caught({ configSha256: "a".repeat(64), checks }).message).toBe("Invalid native validation check.");
    expect(Object.hasOwn(checks, 0)).toBe(false); expect(checks[0]).toBe(inherited[0]);
  });

  it.each([
    { label: "no checks", checks: [] }, { label: "too many", checks: Array.from({ length: 9 }, (_, i) => check(`c${i}`)) },
    { label: "not an array", checks: { 0: check(), length: 1 } }, { label: "absent", checks: undefined }
  ])("retains refusal for $label", ({ checks }) => {
    expect(caught({ configSha256: "a".repeat(64), checks }).message).toBe("Invalid native validation plan.");
  });

  it("preserves one/eight-check limits, exact boundaries and case-sensitive ID order", () => {
    const first = check("A"), second = check("a");
    expect(admit({ configSha256: "a".repeat(64), checks: [first, second] }).checks.map(item => item.id)).toEqual(["A", "a"]);
    const checks = Array.from({ length: 8 }, (_, index) => check(`c${index}`));
    checks[0] = { id: "x".repeat(64), title: "t".repeat(160), command: "é".repeat(4096), timeoutMs: 600000 };
    checks[1]!.timeoutMs = 1;
    expect(admit({ configSha256: "a".repeat(64), checks }).checks).toEqual(checks);
    expect(admit(plan()).checks).toHaveLength(1);
  });

  const invalidFields: Array<{ label: string; field: string; value: unknown }> = [
    { label: "duplicate-compatible bad ID syntax", field: "id", value: "dot.name" },
    { label: "empty ID", field: "id", value: "" }, { label: "long ID", field: "id", value: "x".repeat(65) },
    { label: "empty title", field: "title", value: " " }, { label: "long title", field: "title", value: "x".repeat(161) },
    { label: "control title", field: "title", value: "synthetic\nline" },
    { label: "empty command", field: "command", value: " " }, { label: "null-byte command", field: "command", value: "synthetic\0command" },
    { label: "oversized UTF-8 command", field: "command", value: "é".repeat(4097) },
    { label: "zero timeout", field: "timeoutMs", value: 0 }, { label: "long timeout", field: "timeoutMs", value: 600001 },
    { label: "fractional timeout", field: "timeoutMs", value: 1.5 }, { label: "string timeout", field: "timeoutMs", value: "4000" },
    { label: "unknown timeout", field: "timeoutMs", value: null }
  ];
  it.each(invalidFields)("retains $label refusal without rewriting the input", ({ field, value }) => {
    const input = plan(); Reflect.set(input.checks[0]!, field, value);
    const before = structuredClone(input);
    Object.freeze(input.checks[0]); Object.freeze(input.checks); Object.freeze(input);
    const error = caught(input);
    expect(error.message).toBe("Invalid native validation check.");
    expect(error.message).not.toContain("PRIVATE_PLAN"); expect(input).toEqual(before);
  });

  it("refuses duplicate IDs without selecting a winner or changing prior declarations", () => {
    const input = { configSha256: "a".repeat(64), checks: [check(), { ...check(), command: "synthetic other command" }] };
    const before = structuredClone(input);
    expect(caught(input).message).toBe("Invalid native validation check."); expect(input).toEqual(before);
  });

  it("keeps projection of the documented fields without changing existing extra-field treatment", () => {
    const input = { ...plan(), additional: "synthetic ignored metadata" };
    Object.assign(input.checks[0]!, { additional: "synthetic ignored check metadata" });
    const before = structuredClone(input), frozen = admit(input);
    expect(frozen).toEqual(plan()); expect(frozen).not.toHaveProperty("additional");
    expect(frozen.checks[0]).not.toHaveProperty("additional"); expect(input).toEqual(before);
  });
});
