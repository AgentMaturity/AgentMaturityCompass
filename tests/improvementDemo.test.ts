import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const fixture = resolve("examples/improvement-demo");
const entry = join(fixture, "run.mjs");
const temporary: string[] = [];
const temp = (): string => {
  const path = mkdtempSync(join(tmpdir(), "amc-demo-only-test-"));
  temporary.push(path);
  return path;
};
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

// The child has no provider credentials, and all network entry points throw before AMC loads.
function run(fixtureDir?: string): string {
  const home = temp();
  const guard = join(home, "offline.mjs");
  writeFileSync(guard, `import net from "node:net"; import http from "node:http"; import https from "node:https";
import tls from "node:tls"; import dgram from "node:dgram"; import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
let attempts = 0;
const deny = () => { attempts++; throw new Error("DEMO_ONLY_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny; net.Socket.prototype.connect = deny; net.Server.prototype.listen = deny;
http.request = deny; http.get = deny; https.request = deny; https.get = deny; tls.connect = deny;
dgram.createSocket = deny; dns.lookup = deny; dns.resolve = deny; dns.promises.lookup = deny;
syncBuiltinESMExports();
process.on("exit", () => { if (attempts !== 0) process.exitCode = 91; });
`);
  const args = fixtureDir === undefined ? [entry] : ["--input-type=module", "--eval",
    `const { runDemo } = await import(${JSON.stringify(pathToFileURL(entry).href)}); console.log(JSON.stringify(await runDemo({ fixtureDir: ${JSON.stringify(fixtureDir)} })));`];
  return execFileSync(process.execPath, ["--import", guard, ...args], {
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: home }, encoding: "utf8", timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

describe("demo-only deterministic improvement (H2X-22)", () => {
  test("runs the pinned fixture through real offline native trials, independent oracle and promotion gate", () => {
    const output = run();
    const result = JSON.parse(output) as {
      demoOnly: boolean; maturityEvidence: boolean; label: string; method: string;
      baseline: { failed: number }; candidate: { passed: number };
      gate: { status: string; decision: string }; provenance: { syntheticRows: number; bookkeepingRows: number; maturityRows: number };
      cases: { demoOnly: boolean; baseline: string; candidate: string; baselineOracle: boolean; candidateOracle: boolean }[];
    };
    expect(result.demoOnly).toBe(true);
    expect(result.maturityEvidence).toBe(false);
    expect(result.label).toContain("DEMO ONLY");
    expect(result.method).toBe("native-trials/1");
    expect(result.baseline.failed).toBe(3);
    expect(result.candidate.passed).toBe(3);
    expect(result.gate).toEqual({ status: "pass", decision: "promote-candidate" });
    expect(result.cases).toHaveLength(3);
    for (const row of result.cases) {
      expect(row).toMatchObject({ demoOnly: true, baseline: "failed", candidate: "passed", baselineOracle: false, candidateOracle: true });
    }
    expect(result.provenance.syntheticRows).toBeGreaterThan(0);
    expect(result.provenance.bookkeepingRows).toBe(12);
    expect(result.provenance.maturityRows).toBe(0);
  }, 120_000);

  test("refuses a changed pinned artifact before executing", async () => {
    const copy = join(temp(), "fixture");
    cpSync(fixture, copy, { recursive: true });
    writeFileSync(join(copy, "candidate.json"), "{}\n");
    const { verifyPins } = await import(pathToFileURL(entry).href);
    expect(() => verifyPins(copy)).toThrow(/pin mismatch: candidate.json/);
  });

  test("the independent oracle refuses missing, failed and incorrect recorded output", async () => {
    const { oracle } = await import(pathToFileURL(join(fixture, "oracle.mjs")).href);
    expect(oracle("demo-only-1", [])).toBe(false);
    expect(oracle("demo-only-1", [{ outcome: "OK", content: "wrong" }])).toBe(false);
    expect(oracle("demo-only-1", [{ outcome: "ERROR", content: "DEMO ONLY: amber\n" }])).toBe(false);
    expect(oracle("unknown", [{ outcome: "OK", content: "" }])).toBe(false);
  });

  test("a re-pinned defective candidate cannot satisfy the demo or the gate", () => {
    const copy = join(temp(), "fixture");
    cpSync(fixture, copy, { recursive: true });
    const bytes = readFileSync(join(copy, "baseline.json"));
    writeFileSync(join(copy, "candidate.json"), bytes);
    const manifest = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8")) as { files: Record<string, string> };
    manifest.files["candidate.json"] = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(copy, "manifest.json"), JSON.stringify(manifest));
    expect(() => run(copy)).toThrow(/demo-only acceptance failed: gate=fail\/keep-baseline/);
  }, 120_000);
});
