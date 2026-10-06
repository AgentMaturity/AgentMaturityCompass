#!/usr/bin/env node
/** Real local artifact qualification. No mocked execution, global installation or provider calls. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackedRun } from "./packed-evidence-verification.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function qualifyPlatform({ root = process.cwd(), out = join(root, "tmp/platform-qualification/report.json"), keep = false } = {}) {
  const reportPath = resolve(out), directory = dirname(reportPath);
  // Claim the whole result directory before scratch creation or any command.
  // Recursive creation of the leaf would silently reuse another run's evidence.
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === "EEXIST") throw Object.assign(new Error("Platform qualification output must use a new directory; preserve the existing evidence and choose a new parent for --out."), { code: "output-exists" });
    throw error;
  }
  // Reserve the report name too, so it cannot collide with a step artifact.
  // A setup/write failure can leave an empty or partial file, never a receipt of success.
  const reportFd = openSync(reportPath, "wx", 0o600);
  try { return qualifyPlatformInOwnedDirectory({ root, out: reportPath, keep, reportFd }); }
  finally { closeSync(reportFd); }
}

function qualifyPlatformInOwnedDirectory({ root, out, keep, reportFd }) {
  const scratch = mkdtempSync(join(tmpdir(), "amc-platform-"));
  const home = join(scratch, "home"), consumer = join(scratch, "consumer"), workspace = join(scratch, "workspace with spaces");
  for (const dir of [home, consumer, workspace]) mkdirSync(dir, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData/Roaming"), LOCALAPPDATA: join(home, "AppData/Local"), CI: "1" };
  for (const key of Object.keys(env)) if (/^AMC_|^npm_config_|(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key)) delete env[key];
  delete env.NODE_OPTIONS; delete env.NODE_PATH;
  Object.assign(env, { AMC_VAULT_PASSPHRASE: "platform-qualification-ephemeral", npm_config_cache: join(home, "npm-cache"),
    npm_config_userconfig: join(home, "npmrc"), npm_config_globalconfig: join(home, "npmrc-global"), npm_config_global: "false" });
  writeFileSync(env.npm_config_userconfig, ""); writeFileSync(env.npm_config_globalconfig, "");
  const packageInfo = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const report = { schema: "amc.platform-qualification", version: 1, generatedAt: new Date().toISOString(),
    platform: process.platform, arch: process.arch, osRelease: release(), node: process.version,
    supportedNode: [22, 24].includes(Number(process.versions.node.split(".")[0])), package: `${packageInfo.name}@${packageInfo.version}`,
    sourceCommit: null, sourceDirty: null, packageSha256: null, steps: [], status: "inconclusive", cleanup: "pending", scratch,
    scope: "local npm artifact, Node entry point, keyless native SQLite/signing and cold verification",
    limitations: ["No real-provider task, desktop installer, OS shell sandbox, global npm shim or published release qualification."] };
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 10_000 });
  if (git.status === 0 && /^[a-f0-9]{40}\s*$/.test(git.stdout)) report.sourceCommit = git.stdout.trim();
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8", timeout: 10_000 });
  if (status.status === 0) report.sourceDirty = status.stdout.trim().length > 0;
  const npmCli = process.env.npm_execpath;
  const command = (id, executable, args, cwd = workspace, expectedFailure = false) => {
    const startedAt = new Date().toISOString(), started = performance.now();
    const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 300_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const expected = !result.error && result.signal === null && (expectedFailure ? result.status !== null && result.status !== 0 : result.status === 0);
    const stdout = result.stdout ?? "", stderr = result.stderr ?? "";
    // No terminal output is trusted as a result and no environment or credential values are published.
    const filename = `${String(report.steps.length).padStart(2, "0")}-${id.replace(/[^a-z0-9-]/gi, "-")}.json`;
    const artifact = { stdout, stderr, exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null };
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    const artifactPath = join(dirname(out), filename);
    writeFileSync(artifactPath, serialized, { mode: 0o600, flag: "wx" });
    report.steps.push({ id, status: expected ? "passed" : "failed", startedAt, durationMs: performance.now() - started,
      exitCode: result.status, signal: result.signal, expectedFailure, artifact: filename, artifactSha256: hash(serialized) });
    console.log(`${expected ? "ok" : "failed"}: ${id}`);
    return { ok: expected, stdout };
  };
  const requireStep = (result) => { if (!result.ok) throw new Error("qualification step refused"); return result; };
  try {
    if (!npmCli || !existsSync(npmCli) || !/npm-cli\.(?:c?js)$/i.test(npmCli)) throw new Error("Run through npm run qualify:platform so the exact cross-platform npm JavaScript entry point is available.");
    if (!existsSync(join(root, "dist/cli.js"))) throw new Error("Build this source before platform qualification.");
    const pack = requireStep(command("pack", process.execPath, [npmCli, "pack", "--ignore-scripts", "--pack-destination", scratch, "--json"], root));
    const packed = JSON.parse(pack.stdout);
    if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string" || !/^[^/\\]+\.tgz$/.test(packed[0].filename)) throw new Error("Invalid pack receipt");
    const tarball = join(scratch, packed[0].filename);
    report.packageSha256 = hash(readFileSync(tarball));
    requireStep(command("fresh-install", process.execPath, [npmCli, "install", "--omit=dev", "--no-audit", "--no-fund", tarball], consumer));
    const cli = join(consumer, "node_modules", packageInfo.name, "dist", "cli.js");
    const runCli = (id, args) => command(id, process.execPath, [cli, ...args]);
    requireStep(command("private-kernel-absent", process.execPath, ["-e", "try{require.resolve('@amc/core');process.exit(1)}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}"], consumer));
    requireStep(runCli("help", ["--help"]));
    const guide = requireStep(runCli("read-only-guide", ["agent-loop", "guide", "--json"]));
    JSON.parse(guide.stdout);
    requireStep(runCli("initialize", ["init", "--trust-boundary", "isolated"]));
    // The monitor-key fingerprint recorded right after init, outside the ledger it later anchors (P0-09).
    const expectMonitor = hash(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub")));
    const turn = requireStep(runCli("native-keyless-task", ["agent-loop", "run", "--provider", "stub", "--json", "say hello"]));
    if (!verifyPackedRun({ summary: JSON.parse(turn.stdout), runCommand: runCli, expectMonitor })) throw new Error("Installed native evidence failed cold verification");
    const held = `${cli}.platform-held`;
    renameSync(cli, held);
    try { requireStep(command("missing-launcher-refuses", process.execPath, [cli, "--help"], workspace, true)); }
    finally { renameSync(held, cli); }
    requireStep(runCli("restored-launcher", ["--help"]));
    if (!verifyPackedRun({ summary: JSON.parse(turn.stdout), runCommand: runCli, expectMonitor })) throw new Error("Evidence did not survive launcher restoration");
    report.status = report.supportedNode ? "passed" : "inconclusive";
    if (!report.supportedNode) report.limitations.push("This Node major is not a supported production qualification target.");
  } catch (error) {
    report.status = report.steps.some(step => step.status === "failed") ? "failed" : "inconclusive";
    report.reason = error instanceof SyntaxError ? "A command returned malformed JSON" : error instanceof Error ? error.message : "Qualification could not complete";
  } finally {
    if (keep || report.status !== "passed") report.cleanup = "retained-for-inspection";
    else {
      try { rmSync(scratch, { recursive: true, force: true }); report.cleanup = "removed"; }
      catch { report.cleanup = "failed"; report.status = "failed"; }
    }
    writeFileSync(reportFd, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf("--out");
  const report = qualifyPlatform({ out: outIndex < 0 ? undefined : resolve(process.argv[outIndex + 1] ?? "tmp/platform-qualification/report.json"), keep: process.argv.includes("--keep") });
  console.log(`Platform qualification: ${report.status}`);
  process.exitCode = report.status === "passed" ? 0 : 1;
}
