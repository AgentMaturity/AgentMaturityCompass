// Shared runner for the regulated-industry examples. It drives only the built
// AMC CLI (no AMC imports), in a fresh workspace, with an environment built from
// scratch: PATH, a temp HOME, NO_COLOR, and a random vault passphrase that is
// generated here, used for this throwaway workspace, and never written out.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LIB, "..", "..", "..");
const STUB_MODEL = "amc-stub-1";
// Named so the assurance responder takes its explicit-endpoint branch; with no
// provider key set it refuses before sending any request.
const UNUSED_AGENT_URL = "http://127.0.0.1:1";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function parseArgs(argv) {
  const opts = { cli: join(REPO, "dist", "cli.js"), workdir: null, denyNetwork: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cli") opts.cli = resolve(argv[++i]);
    else if (argv[i] === "--workdir") opts.workdir = resolve(argv[++i]);
    else if (argv[i] === "--deny-network") opts.denyNetwork = true;
    else throw new Error(`unknown argument: ${argv[i]} (use --cli <dist/cli.js> --workdir <dir> --deny-network)`);
  }
  if (!existsSync(opts.cli)) throw new Error(`CLI not found at ${opts.cli}; run pnpm build or pass --cli`);
  return opts;
}

function sourceCommit() {
  const git = spawnSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" });
  return git.status === 0 ? git.stdout.trim() : "unknown";
}

function stationSteps(station, fixture) {
  return [
    { id: "init", args: ["init", "--skip-vault"] },
    { id: "domain-modules", args: ["domain", "modules", "--domain", station, "--json"], stdoutTo: "domain-modules.json" },
    { id: "pack-catalog", args: ["domain", "pack", "list", "--domain", station, "--json"], stdoutTo: "pack-catalog.json" },
    // Industry pack scoring needs a license key; without one the CLI exits 1.
    { id: "pack-run-gate", args: ["domain", "pack", "run", "--pack", fixture.industryPack, "--baseline", "--json"], stdoutTo: "pack-run-gate.json", expectExit: 1 },
    { id: "risk-classify", args: ["compliance", "risk-classify", "--agent", "default", "--capabilities", JSON.stringify(fixture.capabilities), "--json"], stdoutTo: "risk-classification.json" },
    { id: "assurance-pack", args: ["assurance", "describe", fixture.assurancePack], stdoutTo: "assurance-pack.json" },
    { id: "agent-run", args: ["--agent", "default", "agent-loop", "run", fixture.prompt, "--provider", "stub", "--model", STUB_MODEL, "--tools", "echo", "--max-steps", "2", "--max-tokens", "512", "--json"], stdoutTo: "agent-run.json" },
    { id: "agent-verify", args: (out) => ["agent-loop", "verify", readJson(join(out, "agent-run.json")).sessionId, "--json"], stdoutTo: "agent-verify.json" },
    { id: "evidence-export", args: ["evidence", "export", "--format", "json", "--out", "out/evidence.json", "--agent", "default", "--include-chain"], writes: "evidence.json" },
    { id: "binder-create", args: ["audit", "binder", "create", "--scope", "agent", "--id", "default", "--out", "out/binder.amcaudit"], writes: "binder.amcaudit" },
    { id: "binder-verify", args: ["audit", "binder", "verify", "out/binder.amcaudit"] },
    // No reachable agent under test and no key: the scan must abort (exit 2), not score.
    // Last on purpose: at 8f57ce63 an aborted scan leaves an unsealed ledger session
    // (and, with --no-sign, rows that fail the next stub turn's budget check), so
    // nothing that verifies the ledger runs after it. See the O20 receipt.
    { id: "assurance-gate", args: ["assurance", "run", "--agent", "default", "--pack", fixture.assurancePack, "--model", STUB_MODEL], env: { AMC_AGENT_BASE_URL: UNUSED_AGENT_URL }, expectExit: 2 }
  ];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function runStation(stationDir, argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const fixturePath = join(stationDir, "fixture.json");
  const fixture = readJson(fixturePath);
  const workdir = opts.workdir ?? mkdtempSync(join(tmpdir(), `amc-${fixture.station}-`));
  const workspace = join(workdir, "workspace");
  const home = join(workdir, "home");
  const out = join(workspace, "out");
  const netLog = join(workdir, "network-attempts.log");
  mkdirSync(out, { recursive: true });
  mkdirSync(home, { recursive: true });

  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    NO_COLOR: "1",
    AMC_VAULT_PASSPHRASE: randomBytes(24).toString("base64url")
  };
  if (opts.denyNetwork) {
    env.NODE_OPTIONS = `--import=${pathToFileURL(join(LIB, "denyNetwork.mjs")).href}`;
    env.AMC_EXAMPLE_NET_LOG = netLog;
  }

  const amc = (args, extraEnv = {}) =>
    spawnSync(process.execPath, [opts.cli, ...args], {
      cwd: workspace,
      env: { ...env, ...extraEnv },
      encoding: "utf8",
      input: "",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000
    });

  const steps = [];
  const written = [];
  for (const step of stationSteps(fixture.station, fixture)) {
    const args = typeof step.args === "function" ? step.args(out) : step.args;
    const expectExit = step.expectExit ?? 0;
    const result = amc(args, step.env);
    if (step.stdoutTo) {
      writeFileSync(join(out, step.stdoutTo), result.stdout);
      written.push(step.stdoutTo);
    }
    if (step.writes) written.push(step.writes);
    steps.push({ id: step.id, argv: ["amc", ...args], exitCode: result.status, expectedExit: expectExit, stdoutSha256: sha256(result.stdout) });
    if (result.status !== expectExit) {
      throw new Error(`${fixture.station}/${step.id}: expected exit ${expectExit}, got ${result.status}\n${result.stderr}`);
    }
    console.log(`ok ${step.id} (exit ${result.status})`);
  }

  const attempts = existsSync(netLog)
    ? readFileSync(netLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const summary = {
    schemaVersion: 1,
    station: fixture.station,
    generatedAt: new Date().toISOString(),
    provenance: {
      sourceCommit: sourceCommit(),
      amcVersion: amc(["--version"]).stdout.trim(),
      cli: relative(REPO, opts.cli),
      cliSha256: sha256(readFileSync(opts.cli)),
      fixture: relative(REPO, fixturePath),
      fixtureSha256: sha256(readFileSync(fixturePath)),
      node: process.version,
      platform: platform(),
      arch: arch()
    },
    network: opts.denyNetwork ? { mode: "denied", attempts } : { mode: "not-enforced", attempts },
    steps,
    artifacts: written.map((name) => ({ path: `out/${name}`, sha256: sha256(readFileSync(join(out, name))) }))
  };
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`summary: ${join(out, "summary.json")}`);
  if (attempts.length > 0) throw new Error(`${attempts.length} network attempt(s) recorded in ${netLog}`);
  return summary;
}
