import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { VERIFIER_VERSION } from "../../packages/verifier/src/index.js";
import { FIXTURES, loadCase } from "./fixtures.js";

const PACKAGE = "packages/verifier";
const scratch = mkdtempSync(join(tmpdir(), "amc-verifier-pack-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function files(dir: string, suffix: RegExp): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, suffix) : suffix.test(name) ? [path] : [];
  });
}

/** Every module specifier a file imports, statically or dynamically. */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]/g)].map(match => match[1]!);
}

describe("the standalone verifier package", () => {
  beforeAll(() => {
    if (!existsSync(join(PACKAGE, "dist/packages/verifier/src/cli.js"))) execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", join(PACKAGE, "tsconfig.json")]);
  });

  test("declares no runtime, peer or optional dependencies and stays private until Sid names it", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as Record<string, unknown>;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "bundledDependencies"]) expect(manifest[field], field).toBeUndefined();
    expect(manifest).toMatchObject({ name: "agent-maturity-compass-verifier", version: VERIFIER_VERSION, private: true, type: "module",
      engines: { node: ">=20" }, bin: { "amc-verify": "./bin/amc-verify.mjs" } });
  });

  test("imports only node: built-ins, its own modules and the shared admission rule, in source and in what it ships", () => {
    const shared = resolve("src/trust/admissionRule.ts");
    const shipped = [...files(join(PACKAGE, "src"), /\.ts$/), ...files(join(PACKAGE, "dist"), /\.js$/), ...files(join(PACKAGE, "bin"), /\.mjs$/),
      ...files(join(PACKAGE, "conformance"), /\.mjs$/), join(FIXTURES, "generate.mjs"), shared];
    const foreign = shipped.flatMap(path => specifiers(readFileSync(path, "utf8")).filter(spec => {
      if (spec.startsWith("node:")) return false;
      const target = resolve(dirname(path), spec).replace(/\.js$/, "");
      return !target.startsWith(resolve(PACKAGE)) && target !== shared.replace(/\.ts$/, "");
    }).map(spec => `${path}: ${spec}`));
    expect(foreign).toEqual([]);
    expect(specifiers(readFileSync(shared, "utf8")).every(spec => spec.startsWith("node:"))).toBe(true);
  });

  test("packs, installs offline into an empty directory and verifies valid-attestation with exit 0", () => {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", scratch], { cwd: PACKAGE, encoding: "utf8" })) as Array<{ filename: string; files: Array<{ path: string }> }>;
    const tarball = join(scratch, packed[0]!.filename);
    expect(packed[0]!.files.map(file => file.path).filter(path => !/^(bin\/amc-verify\.mjs|dist\/.+\.(js|d\.ts)|conformance\/run\.mjs|package\.json)$/.test(path))).toEqual([]);
    const consumer = join(scratch, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true }));
    execFileSync("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", tarball], { cwd: consumer, encoding: "utf8" });
    expect(readdirSync(join(consumer, "node_modules")).filter(name => !name.startsWith("."))).toEqual(["agent-maturity-compass-verifier"]);

    const { params } = loadCase("valid-attestation");
    const dir = join(FIXTURES, "valid-attestation");
    const args = ["verify", join(dir, "artifact.json"), "--trust-list", join(dir, "trust-list.json"), ...(params.trustRoots ?? []).flatMap(root => ["--trust-root", root]),
      "--as-of", params.asOf!, ...Object.entries(params.expect ?? {}).flatMap(([key, value]) => [`--expect-${key}`, value!]),
      ...Object.entries(params.knownSequences ?? {}).flatMap(([id, sequence]) => ["--known-sequence", `${id}=${sequence}`]), "--evidence-dir", join(dir, "evidence")];
    const run = spawnSync(join(consumer, "node_modules/.bin/amc-verify"), args, { cwd: scratch, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/satisfaction\s+pass/);
  }, 120_000);
});
