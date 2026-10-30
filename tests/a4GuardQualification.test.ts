import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

const repoRoot = resolve(__dirname, "..");
const authoredScript = join(repoRoot, "scripts/check-no-fabrication.mjs");
// A private, reviewed scanner copy lets the same assertions witness a removed A4 root.
const script = process.env.AMC_P0_54_SCANNER ? resolve(process.env.AMC_P0_54_SCANNER) : authoredScript;
const ruleSchema = z.object({ found: z.number().int().nonnegative(), allowlisted: z.number().int().nonnegative(),
  failing: z.number().int().nonnegative() }).strict();
const reportSchema = z.object({
  ok: z.boolean(), strict: z.boolean(),
  rules: z.object({ R1: ruleSchema, R2: ruleSchema, R3: ruleSchema, R4: ruleSchema }).strict(),
  markers: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), failures: z.array(z.string())
}).strict();
type Rule = keyof z.infer<typeof reportSchema>["rules"];
const rules: Rule[] = ["R1", "R2", "R3", "R4"];
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
let evidenceRoot: string;

beforeAll(() => {
  expect([22, 24]).toContain(Number(process.versions.node.split(".")[0]));
  evidenceRoot = mkdtempSync(join(tmpdir(), "amc-p0-54-guard-"));
  const sourcePaths = ["scripts/check-no-fabrication.mjs", "scripts/no-fabrication-allowlist.json",
    "tests/checkNoFabrication.test.ts", "src/diagnostic/evidenceEmitters.ts", "docs/security/channel-map.json",
    "src/mode/mode.ts", "src/cli.ts", "src/cli/resultCommandRegistry.ts", "src/repl/replParser.ts"];
  const inputs = sourcePaths.map(path => ({ path, sha256: sha256(readFileSync(join(repoRoot, path))) }));
  writeFileSync(join(evidenceRoot, "inputs.json"), JSON.stringify({ node: process.version, executable: process.execPath,
    authoredScript, script, scannerSha256: sha256(readFileSync(script)), inputs }, null, 2) + "\n");
  console.info(`P0-54 guard evidence: ${evidenceRoot}`);
});

function scan(name: string, source: string) {
  const root = join(evidenceRoot, name), file = "src/a4/witness.ts";
  mkdirSync(join(root, "src/a4"), { recursive: true });
  mkdirSync(join(root, "scripts"));
  const home = join(root, "operator-home");
  mkdirSync(home);
  writeFileSync(join(root, file), source);
  const allowlist = JSON.stringify({ permanent: [], pending: [], pathPresence: [], pathPresenceBaseline: 0 });
  writeFileSync(join(root, "scripts/no-fabrication-allowlist.json"), allowlist);
  const args = [script, "--root", root, "--json", "--strict"];
  const environment = { HOME: home, AMC_HOME: home, PATH: dirname(process.execPath), LANG: "C", TZ: "UTC" };
  const actual = spawnSync(process.execPath, args, { cwd: root, env: environment, encoding: "utf8", timeout: 30_000 });
  writeFileSync(join(root, "stdout.json"), actual.stdout ?? "");
  writeFileSync(join(root, "stderr.log"), actual.stderr ?? "");
  writeFileSync(join(root, "actual.json"), JSON.stringify({ command: [process.execPath, ...args], cwd: root,
    environment, exit: actual.status, signal: actual.signal, error: actual.error?.message ?? null,
    scriptSha256: sha256(readFileSync(script)), sourceSha256: sha256(source), allowlistSha256: sha256(allowlist),
    stdoutSha256: sha256(actual.stdout ?? ""), stderrSha256: sha256(actual.stderr ?? "") }, null, 2) + "\n");
  expect(actual.error).toBeUndefined();
  expect(actual.signal).toBeNull();
  expect(actual.stderr).toBe("");
  return { exit: actual.status, report: reportSchema.parse(JSON.parse(actual.stdout) as unknown) };
}

function refused(name: string, source: string, rule: Rule, diagnostic: string) {
  const actual = scan(name, source);
  expect(actual.exit).toBe(1);
  expect(actual.report).toMatchObject({ ok: false, strict: true, pending: 0 });
  expect(actual.report.failures).toHaveLength(1);
  expect(actual.report.failures[0]).toContain(diagnostic);
  for (const key of rules) expect(actual.report.rules[key]).toEqual({ found: key === rule ? 1 : 0,
    allowlisted: 0, failing: key === rule ? 1 : 0 });
}

function allowed(name: string, source: string) {
  const actual = scan(name, source);
  expect(actual.exit).toBe(0);
  expect(actual.report).toMatchObject({ ok: true, strict: true, pending: 0, failures: [] });
  for (const rule of rules) expect(actual.report.rules[rule]).toEqual({ found: 0, allowlisted: 0, failing: 0 });
}

describe("P0-54 actual A4-root no-fabrication guard", () => {
  test("R1 refuses unmarked random output in the guarded A4 root", () => {
    refused("r1-random", "export const score = Math.random() * 100;\n", "R1", "src/a4/witness.ts:1 R1 Math.random");
  });

  test("R3 refuses path-presence scoring in the guarded A4 root", () => {
    const source = 'import { existsSync } from "node:fs";\nimport { join } from "node:path";\n'
      + 'export const has = (root: string) => existsSync(join(root, "src/ledger"));\n';
    refused("r3-path", source, "R3", 'src/a4/witness.ts:3 R3 path-presence check on "src/ledger"');
  });

  test("R2 globally refuses fabricated-result identifiers under A4", () => {
    refused("r2-global", "export function pseudoRandomScore() {}\n", "R2", "src/a4/witness.ts:1 R2 identifier pseudoRandomScore");
  });

  test("R4 globally refuses certification output under A4", () => {
    refused("r4-global", 'export const label = "Certified";\n', "R4", 'src/a4/witness.ts:1 R4 certification wording "Certified"');
  });

  test("harmless governance state passes without an allowlist exception", () => {
    allowed("harmless-state", 'export const governanceState = { status: "pending", transitionCount: 0 };\n');
  });

  test("certification detection regex and a warning comment remain harmless", () => {
    allowed("harmless-detection", '// Never print certified in AMC output.\nexport const detect = (text: string) => /certified/i.test(text);\n');
  });

  test("the approved preceding ID marker permits A4 identifier randomness", () => {
    allowed("id-marker", '// amc-allow-random: id\nexport const id = `a4_${Math.random()}`;\n');
  });

  test("the approved trailing fuzz-input marker permits an A4 attack input", () => {
    allowed("fuzz-marker", "export const attackInput = Math.random(); // amc-allow-random: fuzz-input\n");
  });
});
