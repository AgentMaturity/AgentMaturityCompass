import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { compileInputs } from "../../../src/catalog/compileInputs.js";
import { parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { buildOperatingProfile } from "../../../src/domains/operatingProfiles/operatingProfileBuilder.js";

/** fromOperatingProfile: compileInputs reads the referenced F1 profile from a fixture workspace and checks it. */
const base = JSON.parse(readFileSync("tests/fixtures/catalog/compiler/finance-ops-us.profile.json", "utf8")) as Record<string, unknown>;
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function fixture(mutate: (profile: Record<string, any>) => void = () => {}) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-compile-inputs-"));
  dirs.push(workspace);
  mkdirSync(join(workspace, "profiles"));
  const f1 = buildOperatingProfile({ station: "wealth", agentId: "finance-ops-agent", generatedAt: "2026-10-12T00:00:00.000Z" }) as unknown as Record<string, any>;
  mutate(f1);
  const bytes = `${JSON.stringify(f1, null, 2)}\n`;
  writeFileSync(join(workspace, "profiles", "wealth.json"), bytes);
  const ref = { path: "profiles/wealth.json", sha256: createHash("sha256").update(bytes).digest("hex"), schemaVersion: "2026-10-07" };
  return { workspace, f1, ref, profile: (r: object = ref) => parseDeploymentProfile({ ...base, operatingProfile: r }) };
}

describe("compileInputs: fromOperatingProfile", () => {
  test("a referenced, hash-matching F1 profile seeds its fragments; no reference seeds nothing", () => {
    const f = fixture();
    expect(compileInputs(f.workspace, f.profile()).fromOperatingProfile).toEqual(f.f1.proposedSignedConfigs);
    expect(compileInputs(f.workspace, parseDeploymentProfile(base))).toEqual({});
  });

  test("other bytes, another schema version, a path outside the workspace or an inconsistent profile refuse", () => {
    const f = fixture();
    expect(() => compileInputs(f.workspace, f.profile({ ...f.ref, sha256: "0".repeat(64) }))).toThrow("does not match the sha256");
    expect(() => compileInputs(f.workspace, f.profile({ ...f.ref, schemaVersion: "2026-10-03" }))).toThrow(/^OPERATING_PROFILE_INVALID/);
    // The same bytes beside the workspace, so only containment refuses them.
    const outside = `${f.workspace}-outside.json`;
    dirs.push(outside);
    writeFileSync(outside, readFileSync(join(f.workspace, f.ref.path)));
    expect(() => compileInputs(f.workspace, f.profile({ ...f.ref, path: `../${outside.split("/").pop()}` }))).toThrow(/^OPERATING_PROFILE_UNREADABLE/);
    const bad = fixture((p) => { p.firewall.mode.value = "observe"; });
    expect(() => compileInputs(bad.workspace, bad.profile())).toThrow("operating profile is inconsistent");
  });
});
