import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadNativeValidationConfiguration, resolveNativeValidationSelection, selectNativeValidationChecks } from "../src/setup/nativeValidationConfig.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const check = { id: "unit", title: "Public unit tests", command: "npm test", timeoutMs: 4000 };
function fixture(value: unknown = { schemaVersion: 1, checks: [check] }) {
  const root = mkdtempSync(join(tmpdir(), "amc-validation-config-")); roots.push(root);
  const file = join(root, "checks.json"); writeFileSync(file, JSON.stringify(value)); return { root, file };
}

describe("operator-owned native validation selection", () => {
  test("pins exact file bytes, selected ordering and an immutable plan without execution", () => {
    const f = fixture({ schemaVersion: 1, checks: [check, { ...check, id: "types", title: "Types", timeoutMs: undefined }] });
    const expected = createHash("sha256").update(readFileSync(f.file)).digest("hex");
    const loaded = loadNativeValidationConfiguration(f.file, expected);
    const plan = selectNativeValidationChecks(loaded, ["types", "unit"]);
    expect(plan).toEqual({ configSha256: expected, checks: [{ ...check, id: "types", title: "Types", timeoutMs: 120000 }, check] });
    expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.checks)).toBe(true);
    expect(Object.isFrozen(plan.checks[0])).toBe(true);
    writeFileSync(f.file, JSON.stringify({ schemaVersion: 1, checks: [{ ...check, command: "changed" }] }));
    expect(plan.checks[1]?.command).toBe("npm test");
    expect(() => loadNativeValidationConfiguration(f.file, expected)).toThrow("changed from its pinned digest");
  });
  test("absence is explicit and config alone never selects every command", () => {
    expect(resolveNativeValidationSelection({})).toBeUndefined();
    const f = fixture();
    expect(() => resolveNativeValidationSelection({ validationConfig: f.file })).toThrow("Select one through eight");
    expect(() => resolveNativeValidationSelection({ validate: ["unit"] })).toThrow("explicit validation config");
    expect(() => resolveNativeValidationSelection({ validationConfigSha256: "a".repeat(64) })).toThrow("explicit validation config");
    expect(resolveNativeValidationSelection({ validationConfig: f.file, validate: ["unit"] })?.checks[0]?.id).toBe("unit");
  });
  test.each([[], ["unit", "unit"], ["missing"], Array.from({ length: 9 }, (_, i) => `check${i}`)].map(ids => ({ ids })))("refuses an invalid explicit selection %#", ({ ids }) => {
    const f = fixture(); expect(() => selectNativeValidationChecks(loadNativeValidationConfiguration(f.file), ids)).toThrow();
  });
  test.each([
    { schemaVersion: 2, checks: [check] },
    { schemaVersion: 1, checks: [] },
    { schemaVersion: 1, checks: [check, check] },
    { schemaVersion: 1, checks: Array.from({ length: 9 }, (_, i) => ({ ...check, id: `c${i}` })) },
    { schemaVersion: 1, checks: [{ ...check, command: " " }] },
    { schemaVersion: 1, checks: [{ ...check, command: "x\0y" }] },
    { schemaVersion: 1, checks: [{ ...check, command: "x".repeat(8193) }] },
    { schemaVersion: 1, checks: [{ ...check, id: "--extra flag" }] },
    { schemaVersion: 1, checks: [{ ...check, title: "line\nbreak" }] },
    { schemaVersion: 1, checks: [{ ...check, timeoutMs: 0 }] },
    { schemaVersion: 1, checks: [{ ...check, timeoutMs: 600001 }] },
    { schemaVersion: 1, checks: [{ ...check, timeoutMs: 0.5 }] },
    { schemaVersion: 1, checks: [{ ...check, env: { SECRET: "must not echo" } }] },
    { schemaVersion: 1, checks: [check], autoGrant: true }
  ])("refuses malformed or authority-widening configuration %#", value => {
    const f = fixture(value); expect(() => loadNativeValidationConfiguration(f.file)).toThrow();
    try { loadNativeValidationConfiguration(f.file); } catch (error) { expect(String(error)).not.toContain("must not echo"); }
  });
  test.each(["oversize", "utf8", "json", "symlink", "directory"])("refuses an unreadable source without echoing content: %s", kind => {
    const f = fixture();
    if (kind === "oversize") writeFileSync(f.file, "secret-source".repeat(4000));
    if (kind === "utf8") writeFileSync(f.file, Buffer.from([0xff]));
    if (kind === "json") writeFileSync(f.file, "secret-source{");
    if (kind === "symlink") { const target = join(f.root, "other"); writeFileSync(target, readFileSync(f.file)); rmSync(f.file); symlinkSync(target, f.file); }
    if (kind === "directory") { rmSync(f.file); mkdirSync(f.file); }
    expect(() => loadNativeValidationConfiguration(f.file)).toThrow();
    try { loadNativeValidationConfiguration(f.file); } catch (error) { expect(String(error)).not.toContain("secret-source"); }
  });
});
