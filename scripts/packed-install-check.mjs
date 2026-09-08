#!/usr/bin/env node
/**
 * Packed-install check (AMC-1510): prove the PUBLISHED artifact delivers the
 * governed native runtime.
 *
 * Packs the tarball exactly as `npm publish` would, installs it into a fresh
 * directory OUTSIDE the checkout with an empty HOME and its own npm cache, and
 * runs a keyless native turn there. Two things must hold at once:
 *
 *   - `@amc/core` must NOT be resolvable from the consumer directory: the
 *     private workspace packages are not published, and a check that passed
 *     because it quietly found them through the checkout's node_modules would
 *     prove nothing about a user's machine;
 *   - the turn must complete over the signed session anyway.
 *
 * Today the second step fails with "The composition kernel (@amc/core) is not
 * installed" — the engine exists in source and public installation does not
 * deliver it. This script is the reproduction and, once the kernel closure is
 * bundled into dist, the proof.
 *
 * A configured real provider is exercised only when AMC_PACKED_SMOKE_PROVIDER
 * (and its credential env) is set; otherwise that step is reported as skipped,
 * never as passed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function run(label, cmd, args, opts) {
  const started = Date.now();
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  const ok = result.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) console.error(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n"));
  return { ok, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

export function packedInstallCheck({ root = process.cwd(), build = true, keep = false } = {}) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const work = mkdtempSync(join(tmpdir(), "amc-packed-install-"));
  const home = join(work, "home"); const consumer = join(work, "consumer"); const workspace = join(work, "workspace");
  for (const dir of [home, consumer, workspace]) mkdirSync(dir);
  console.log(`packed-install check of ${pkg.name}@${pkg.version} in ${work}`);

  const env = { ...process.env, CI: "1" };
  // Nothing from this machine: no ~/.amc, no ~/.npmrc, no shared npm cache.
  const isolated = { ...env, HOME: home, npm_config_cache: join(home, ".npm"), AMC_VAULT_PASSPHRASE: "packed-install-check" };
  delete isolated.NODE_PATH;

  let tarball = null;
  const steps = [
    () => !build || run("pnpm run build", "pnpm", ["run", "build"], { cwd: root, env }).ok,
    () => {
      // --ignore-scripts: the package's `prepack` hook is the RELEASE gate (full
      // test suite, dependency audit, smoke) and measures the working tree. This
      // check measures the artifact; the release gate stays its own explicit
      // command (`npm run release:gate`), and a green result here is not one.
      console.log("note: packing with --ignore-scripts; the prepack release gate is a separate gate, not exercised here");
      const r = run("npm pack --ignore-scripts (same files as publish)", "npm", ["pack", "--ignore-scripts", "--pack-destination", work, "--json"], { cwd: root, env });
      if (!r.ok) return false;
      tarball = join(work, JSON.parse(r.out)[0].filename);
      return existsSync(tarball) || (console.error(`FAIL tarball not found at ${tarball}`), false);
    },
    () => run("npm install <tarball> (fresh dir, empty HOME)", "npm", ["install", "--no-audit", "--no-fund", "--omit=dev", tarball], { cwd: consumer, env: isolated }).ok,
    () => {
      // The private workspace packages must be ABSENT here — the runtime has to work without them.
      const r = spawnSync("node", ["-e", "require.resolve('@amc/core')"], { cwd: consumer, env: isolated, encoding: "utf8" });
      const absent = r.status !== 0;
      console.log(`${absent ? "ok  " : "FAIL"} @amc/core is not resolvable from the consumer directory`);
      return absent;
    },
    () => run("amc doctor", join(consumer, "node_modules", ".bin", "amc"), ["doctor"], { cwd: workspace, env: isolated }).ok,
    () => run("amc init (isolated workspace)", join(consumer, "node_modules", ".bin", "amc"), ["init", "--trust-boundary", "isolated"], { cwd: workspace, env: isolated }).ok,
    () => {
      const r = run("amc agent-loop run \"say hello\" (stub provider, keyless)", join(consumer, "node_modules", ".bin", "amc"), ["agent-loop", "run", "say hello"], { cwd: workspace, env: isolated });
      if (!r.ok) return false;
      const signed = /unsigned\s+0\b/.test(r.out) && /turn 1 ended: complete/.test(r.out);
      console.log(`${signed ? "ok  " : "FAIL"} the turn completed over a fully signed session`);
      return signed;
    },
    () => {
      const provider = process.env.AMC_PACKED_SMOKE_PROVIDER;
      if (!provider) { console.log("skip real-provider smoke: AMC_PACKED_SMOKE_PROVIDER not set (keyless run only)"); return true; }
      const model = process.env.AMC_PACKED_SMOKE_MODEL;
      const r = run(`amc agent-loop run --provider ${provider} (real provider; key stays in env)`, join(consumer, "node_modules", ".bin", "amc"),
        ["agent-loop", "run", "--provider", provider, ...(model ? ["--model", model] : []), "reply with the single word ok"], { cwd: workspace, env: isolated });
      return r.ok && !/sk-[A-Za-z0-9]{8,}/.test(r.out);
    }
  ];
  let ok = true;
  for (const step of steps) { if (!step()) { ok = false; break; } }
  if (keep || !ok) console.log(`${ok ? "kept" : "left for inspection"}: ${work}`); else rmSync(work, { recursive: true, force: true });
  return ok;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(packedInstallCheck({ build: !process.argv.includes("--no-build"), keep: process.argv.includes("--keep") }) ? 0 : 1);
}
