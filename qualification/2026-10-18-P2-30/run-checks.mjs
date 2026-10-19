import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "checks");
const raw = "/Users/sid/AgentMaturityCompass-worktrees/codex-7f/evidence/p2-30/checks";
mkdirSync(out, { recursive: true });
mkdirSync(raw, { recursive: true });
writeFileSync(join(out, "source-state.json"), JSON.stringify({
  clone: process.cwd(), node: process.version, tmpdir: process.env.TMPDIR,
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  int: execFileSync("git", ["rev-parse", "int"], { encoding: "utf8" }).trim(),
  statusPorcelain: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
}, null, 2) + "\n");
const checks = [
  ["build", "npm", ["run", "-s", "build"]],
  ["typecheck", "npm", ["run", "-s", "typecheck"]],
  ["typecheck-tests", "npm", ["run", "-s", "typecheck:tests"]],
  ["lint", "npm", ["run", "-s", "lint"]],
  ["counts", "npm", ["run", "-s", "check:counts"]],
  ["docs-drift", "npm", ["run", "-s", "check:docs-drift"]],
  ["freeze", "pnpm", ["check:freeze", "--", "--base-ref", "int"]],
  ["architecture-boundaries", "npm", ["run", "-s", "check:architecture-boundaries"]],
  ["gates", "npm", ["run", "-s", "check:gates"]],
  ["schemas", "npm", ["run", "-s", "check:schemas"]],
  ["api-ref", "npm", ["run", "-s", "check:api-ref"]],
  ["threat-model", "npm", ["run", "-s", "check:threat-model"]],
  ["citations", "npm", ["run", "-s", "check:citations"]],
  ["qualification", "npm", ["run", "-s", "check:qualification"]],
  ["duplicates", "npm", ["run", "-s", "check:duplicates"]],
  ["dead-code", "npm", ["run", "-s", "check:dead-code"]],
  ["clean-source", "npm", ["run", "-s", "check:clean-source"]],
  ["focused", "npx", ["vitest", "run", "tests/catalog/stations/technology", "tests/catalog/l0", "tests/usRegister.test.ts", "tests/wealthOverlay.test.ts", "tests/regulatoryClocks.test.ts"]],
  ["full-suite", "npm", ["test", "--", "--reporter=dot"]]
];
const results = [];
for (const [name, command, args] of checks) {
  const started = performance.now();
  const logPath = join(raw, `${name}.log`);
  const log = createWriteStream(logPath);
  const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const exit = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  await new Promise((resolve) => log.end(resolve));
  const bytes = readFileSync(logPath);
  const text = bytes.toString("utf8");
  const result = { name, cmd: [command, ...args].join(" "), exit, durationMs: Math.round(performance.now() - started),
    rawLogPath: logPath, rawLogSha256: createHash("sha256").update(bytes).digest("hex"), rawLogBytes: bytes.length };
  results.push(result);
  writeFileSync(join(out, `${name}.log`), text.length <= 200_000 ? text : `${text.slice(0, 20_000)}\n[Middle omitted; full log path and SHA-256 are in results.json.]\n${text.slice(-180_000)}`);
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(`${name}: exit ${exit}; ${result.durationMs} ms`);
}
process.exitCode = results.some((result) => result.exit !== 0) ? 1 : 0;
