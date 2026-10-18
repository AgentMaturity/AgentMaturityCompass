import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { controlCheckpointDir, type SignedControlKind } from "../src/lifecycle/signedControlJournal.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [], records: Array<Record<string, unknown>> = [];
const kinds: SignedControlKind[] = ["runtime-firewall-policy", "guardrail-control", "compiled-control-plan", "legal-hold-head"];
let evidence: string;

function snapshot(root: string) {
  const rows: Array<Record<string, unknown>> = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    rows.push({ path: relative(root, path) || ".", kind: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
      mode: stat.mode, inode: stat.ino, links: stat.nlink, modifiedMs: stat.mtimeMs,
      ...(stat.isSymbolicLink() ? { target: readlinkSync(path) } : stat.isFile() ? { sha256: sha256Hex(readFileSync(path)) } : {}) });
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root); return rows;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-p0-27-checkpoint-")); roots.push(root);
  const workspace = join(root, "workspace"), home = join(root, "operator-home"), external = join(root, "external");
  for (const dir of [workspace, home, external]) mkdirSync(dir);
  writeFileSync(join(root, "sentinel.txt"), "Owned checkpoint fixture\n");
  return { root, workspace, home, external };
}

function check(name: string, f: ReturnType<typeof fixture>, home: string, configured: string | undefined,
  kind: SignedControlKind = "runtime-firewall-policy") {
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", f.home); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", configured);
  const before = snapshot(f.root);
  let value: string | undefined, error: unknown;
  try { value = controlCheckpointDir(f.workspace, kind); } catch (caught) { error = caught; }
  const after = snapshot(f.root);
  records.push({ name, workspace: f.workspace, home, configured, kind, value, error: error instanceof Error ? error.message : null, before, after });
  expect(after).toEqual(before);
  return { value, error };
}

function refused(actual: ReturnType<typeof check>, workspace: string) {
  expect(actual.value).toBeUndefined(); expect(actual.error).toBeInstanceOf(Error);
  expect((actual.error as Error).name).toBe("SignedControlJournalError");
  expect((actual.error as Error).message).toContain(`must be outside the governed workspace ${realpathSync(workspace)}`);
  expect((actual.error as Error).message).toContain("Set AMC_CONTROL_CHECKPOINT_DIR to a directory outside the workspace.");
}

function accepted(actual: ReturnType<typeof check>, workspace: string, physicalRoot: string, kind: SignedControlKind = "runtime-firewall-policy") {
  expect(actual.error).toBeUndefined();
  expect(actual.value).toBe(join(physicalRoot, sha256Hex(realpathSync(workspace)), kind));
}

beforeAll(() => {
  expect([22, 24]).toContain(Number(process.versions.node.split(".")[0]));
  evidence = process.env.AMC_P0_27_CHECKPOINT_EFFECTS_DIR ?? mkdtempSync(join(tmpdir(), "amc-p0-27-checkpoint-effects-"));
  mkdirSync(evidence, { recursive: true });
  records.push({ kind: "inputs", node: process.version, sources: ["src/lifecycle/signedControlJournal.ts", "src/utils/pathSafety.ts"]
    .map(path => ({ path, sha256: sha256Hex(readFileSync(resolve(path))) })) });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  writeFileSync(join(evidence, "checkpoint-effects.json"), JSON.stringify(records, null, 2) + "\n");
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("P0-27 actual checkpoint root layouts", () => {
  test("accepts a sibling HOME default without creating checkpoint directories", () => {
    const f = fixture(); accepted(check("sibling-home", f, f.home, undefined), f.workspace, join(realpathSync(f.home), ".amc/control-checkpoints"));
  });
  test("refuses HOME equal to the workspace", () => {
    const f = fixture(); refused(check("equal-home", f, f.workspace, undefined), f.workspace);
  });
  test("refuses HOME nested under the workspace", () => {
    const f = fixture(), home = join(f.workspace, "home"); mkdirSync(home);
    refused(check("nested-home", f, home, undefined), f.workspace);
  });
  test("refuses a configured checkpoint root equal to the workspace", () => {
    const f = fixture(); refused(check("equal-configured", f, f.home, f.workspace), f.workspace);
  });
  test("refuses the ..cache child by path segments", () => {
    const f = fixture(); refused(check("dotdot-cache", f, f.home, join(f.workspace, "..cache/cp")), f.workspace);
  });
  test.each(kinds)("accepts the external physical root for %s", kind => {
    const f = fixture(); accepted(check(`external-${kind}`, f, f.home, f.external, kind), f.workspace, realpathSync(f.external), kind);
  });
  test("accepts missing external leaf segments without creating them", () => {
    const f = fixture(); accepted(check("external-missing", f, f.home, join(f.external, "missing/deep")), f.workspace,
      join(realpathSync(f.external), "missing/deep"));
  });
  test("refuses an outside alias whose target is physically inside", () => {
    const f = fixture(), inside = join(f.workspace, "checkpoints"), alias = join(f.root, "checkpoint-alias");
    mkdirSync(inside); symlinkSync(inside, alias); refused(check("alias-inside", f, f.home, alias), f.workspace);
  });
  test("accepts an inside alias whose target is physically outside", () => {
    const f = fixture(), alias = join(f.workspace, "external-alias"); symlinkSync(f.external, alias);
    accepted(check("alias-outside", f, f.home, alias), f.workspace, realpathSync(f.external));
  });
  test("uses one workspace identity across owned aliases and actual macOS var aliases", () => {
    const f = fixture(), alias = join(f.root, "workspace-alias"); symlinkSync(f.workspace, alias);
    const canonical = check("canonical-workspace", f, f.home, f.external);
    accepted(canonical, f.workspace, realpathSync(f.external));
    const aliased = check("owned-workspace-alias", { ...f, workspace: alias }, f.home, f.external);
    expect(aliased.value).toBe(canonical.value); expect(aliased.error).toBeUndefined();
    if (process.platform === "darwin" && realpathSync(f.workspace).startsWith("/private/var/")) {
      const short = realpathSync(f.workspace).replace(/^\/private\/var\//, "/var/");
      expect(realpathSync(short)).toBe(realpathSync(f.workspace));
      expect(check("macos-var-alias", { ...f, workspace: short }, f.home, f.external).value).toBe(canonical.value);
    }
  });
});
