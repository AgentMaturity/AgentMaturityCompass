import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { main } from "../../packages/verifier/src/cli.js";
import { FIXTURES, loadCase } from "./fixtures.js";

const scratch = mkdtempSync(join(tmpdir(), "amc-verify-cli-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let out = "";
let err = "";
beforeEach(() => {
  out = "";
  err = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { out += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { err += String(chunk); return true; });
});
afterEach(() => vi.restoreAllMocks());

/** The CLI arguments a fixture case's params.json describes. */
function argsFor(name: string, extra: string[] = []): string[] {
  const { params } = loadCase(name);
  const dir = join(FIXTURES, name);
  return ["verify", join(dir, "artifact.json"), "--trust-list", join(dir, "trust-list.json"), ...(params.trustRoots ?? []).flatMap(root => ["--trust-root", root]),
    ...(params.asOf ? ["--as-of", params.asOf] : []), ...Object.entries(params.expect ?? {}).flatMap(([key, value]) => [`--expect-${key}`, value!]),
    ...Object.entries(params.knownSequences ?? {}).flatMap(([id, sequence]) => ["--known-sequence", `${id}=${sequence}`]),
    "--evidence-dir", join(dir, "evidence"), ...extra];
}

describe("amc-verify", () => {
  test("prints six separate results and exits 0, 1 or 3 by them", () => {
    expect(main(argsFor("valid-attestation"))).toBe(0);
    expect(out).toMatch(/integrity\s+pass/);
    expect(out).toContain("not that its statement is true");
    out = "";
    expect(main(argsFor("forged-embedded-key"))).toBe(1);
    expect(out).toMatch(/issuerAdmission\s+fail\s+ISSUER_NOT_PINNED/);
    expect(main(argsFor("valid-receipt", ["--json"]))).toBe(3);
  });

  test("--json prints the verifier report", () => {
    main(argsFor("cross-tenant", ["--json"]));
    const report = JSON.parse(out) as { reasonCodes: { scope: string[] }; verifier: { name: string } };
    expect(report.reasonCodes.scope).toEqual(["SCOPE_MISMATCH"]);
    expect(report.verifier.name).toBe("amc-verify");
  });

  test("--version and --help", () => {
    expect(main(["--version"])).toBe(0);
    expect(out).toMatch(/^amc-verify@\d+\.\d+\.\d+\n$/);
    expect(main(["--help"])).toBe(0);
    expect(out).toContain("usage:");
  });

  const dir = join(FIXTURES, "valid-attestation");
  test.each([
    ["no command", []],
    ["an unknown flag", ["verify", join(dir, "artifact.json"), "--allow-unpinned"]],
    ["a missing artifact", ["verify", join(scratch, "absent.json")]],
    ["a bad --as-of", ["verify", join(dir, "artifact.json"), "--as-of", "yesterday"]],
    ["two --as-of", ["verify", join(dir, "artifact.json"), "--as-of", "2026-10-01T00:00:00Z", "--as-of", "2026-10-02T00:00:00Z"]],
    ["a short --trust-root", ["verify", join(dir, "artifact.json"), "--trust-root", "abc"]],
    ["a bad --known-sequence", ["verify", join(dir, "artifact.json"), "--known-sequence", "subject=-1"]],
    ["a repeated --known-sequence id", ["verify", join(dir, "artifact.json"), "--known-sequence", "a=1", "--known-sequence", "a=2"]],
    ["an empty --expect-tenant", ["verify", join(dir, "artifact.json"), "--expect-tenant", ""]],
    ["a trust list that is not JSON", ["verify", join(dir, "artifact.json"), "--trust-list", join(dir, "README.md")]],
    ["a missing evidence directory", ["verify", join(dir, "artifact.json"), "--evidence-dir", join(scratch, "absent")]]
  ])("refuses %s with exit 64", (_name, args) => {
    expect(main(args)).toBe(64);
    expect(err).toContain("usage:");
  });

  test("refuses a symlink in the evidence directory and a symlinked artifact", () => {
    const evidence = join(scratch, "evidence");
    mkdirSync(evidence);
    symlinkSync(join(dir, "artifact.json"), join(evidence, "link"));
    expect(main(["verify", join(dir, "artifact.json"), "--evidence-dir", evidence])).toBe(64);
    symlinkSync(join(dir, "artifact.json"), join(scratch, "artifact-link.json"));
    expect(main(["verify", join(scratch, "artifact-link.json")])).toBe(64);
  });

  test("reads evidence by content: a file's name is ignored", () => {
    const renamed = join(scratch, "renamed");
    mkdirSync(renamed);
    for (const [index, bytes] of [...(loadCase("valid-attestation").options.evidence ?? new Map()).values()].entries()) writeFileSync(join(renamed, `item-${index}`), bytes);
    const args = argsFor("valid-attestation");
    args[args.length - 1] = renamed;
    expect(main(args)).toBe(0);
  });
});
