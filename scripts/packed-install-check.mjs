#!/usr/bin/env node
/**
 * Packed-install check (AMC-1510): verify that the locally packed artifact delivers the
 * governed native runtime.
 *
 * Packs the publish file set without running the separate release gate, installs it into a fresh
 * directory OUTSIDE the checkout with an empty HOME and its own npm cache, and
 * runs a keyless native turn there. Two things must hold at once:
 *
 *   - `@amc/core` must NOT be resolvable from the consumer directory: the
 *     private workspace packages are not published, and a check that passed
 *     because it quietly found them through the checkout's node_modules would
 *     prove nothing about a user's machine;
 *   - the tool turn must complete and both installed verification commands must
 *     authenticate its evidence and reconstruct every recorded request.
 *
 * A configured real provider is exercised only when AMC_PACKED_SMOKE_PROVIDER
 * (and its credential env) is set; otherwise that step is reported as skipped,
 * never as passed.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyPackedRun } from "./packed-evidence-verification.mjs";

function run(label, cmd, args, opts) {
  const started = Date.now();
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  const ok = result.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) console.error(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n"));
  return { ok, stdout: result.stdout ?? "", out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

export function isolatedInstallEnvironment(base, home) {
  const isolated = { ...base, HOME: home, CI: "1" };
  for (const key of Object.keys(isolated)) {
    if (key.startsWith("AMC_") || /^npm_config_/i.test(key)) delete isolated[key];
  }
  isolated.AMC_VAULT_PASSPHRASE = "packed-install-check";
  isolated.npm_config_cache = join(home, ".npm");
  isolated.npm_config_userconfig = join(home, ".npmrc");
  isolated.npm_config_globalconfig = join(home, ".npmrc-global");
  isolated.npm_config_global = "false";
  delete isolated.NODE_PATH;
  delete isolated.NODE_OPTIONS;
  return isolated;
}

export function verifyPackedComposition(result, source) {
  if (!result.ok) return false;
  try {
    const dump = JSON.parse(result.stdout);
    return dump?.composition?.sha256 === createHash("sha256").update(source).digest("hex")
      && dump.composition.signed === false
      && dump.composition.signatureReason === "no signature sidecar"
      && dump.entries?.length === 1
      && dump.entries[0]?.id === "packed-inspection"
      && dump.entries[0]?.name === "./not-installed-plugin.mjs"
      && dump.entries[0]?.disabled === true;
  } catch { return false; }
}

/** `tarball` (or AMC_PACKED_INSTALL_TARBALL) checks that exact file instead of building and packing (P0-34). */
export function packedInstallCheck({ root = process.cwd(), build = true, keep = false, tarball: given = process.env.AMC_PACKED_INSTALL_TARBALL } = {}) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const work = mkdtempSync(join(tmpdir(), "amc-packed-install-"));
  const home = join(work, "home"); const consumer = join(work, "consumer"); const workspace = join(work, "workspace");
  for (const dir of [home, consumer, workspace]) mkdirSync(dir);
  console.log(`packed-install check of ${pkg.name}@${pkg.version} in ${work}`);

  const env = { ...process.env, CI: "1" };
  // Nothing from this machine: no ~/.amc, no ~/.npmrc, no shared npm cache.
  const isolated = isolatedInstallEnvironment(env, home);
  writeFileSync(isolated.npm_config_userconfig, "");
  writeFileSync(isolated.npm_config_globalconfig, "");
  const amc = join(consumer, "node_modules", ".bin", "amc");
  // The monitor-key fingerprint recorded right after `amc init`, outside the ledger it later anchors (P0-09).
  let expectMonitor;
  const verifyRun = (r, requireTool = true) => {
    if (!r.ok) return false;
    let summary;
    try { summary = JSON.parse(r.stdout); } catch { console.error("FAIL native run did not return a JSON summary"); return false; }
    const verified = verifyPackedRun({ summary, requireTool, expectMonitor,
      runCommand: (label, args) => run(label, amc, args, { cwd: workspace, env: isolated }) });
    console.log(`${verified ? "ok  " : "FAIL"} installed evidence and request reconstruction`);
    return verified;
  };

  let tarball = null;
  const steps = [
    () => Boolean(given) || !build || run("pnpm run build", "pnpm", ["run", "build"], { cwd: root, env }).ok,
    () => {
      if (given) {
        tarball = resolve(given);
        console.log(`note: checking the given tarball ${tarball}; nothing is built or packed`);
        return existsSync(tarball) || (console.error(`FAIL tarball not found at ${tarball}`), false);
      }
      // --ignore-scripts: the package's `prepack` hook is the RELEASE gate (full
      // test suite, dependency audit, smoke) and measures the working tree. This
      // check measures the artifact; the release gate stays its own explicit
      // command (`npm run release:gate`), and a green result here is not one.
      console.log("note: packing with --ignore-scripts; the prepack release gate is a separate gate, not exercised here");
      const r = run("npm pack --ignore-scripts (same files as publish)", "npm", ["pack", "--ignore-scripts", "--pack-destination", work, "--json"], { cwd: root, env });
      if (!r.ok) return false;
      tarball = join(work, JSON.parse(r.stdout)[0].filename);
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
    () => run("installed standalone production API (no dev dependencies)", "node",
      [join(root, "scripts", "standalone-api-smoke.mjs"), join(consumer, "node_modules", pkg.name, "dist", "standalone-api.js")],
      { cwd: workspace, env: isolated }).ok,
    () => {
      // The control catalog ships as catalog/** next to dist/ and loads through its default root (P1-09).
      const entry = pathToFileURL(join(consumer, "node_modules", pkg.name, "dist", "catalog", "index.js")).href;
      const script = `const m = await import(${JSON.stringify(entry)}); const v = m.validateCatalog(m.loadCatalog());`
        + " if (!v.ok) { console.error(JSON.stringify(v.errors, null, 2)); process.exit(1); }"
        + " console.log(m.buildCatalogLock(m.loadCatalog()).catalog.digest);";
      return run("installed control catalog loads with loadCatalog() and validates", "node", ["--input-type=module", "-e", script], { cwd: workspace, env: isolated }).ok;
    },
    () => run("amc doctor", join(consumer, "node_modules", ".bin", "amc"), ["doctor"], { cwd: workspace, env: isolated }).ok,
    () => {
      const ok = run("amc init (isolated workspace)", join(consumer, "node_modules", ".bin", "amc"), ["init", "--trust-boundary", "isolated"], { cwd: workspace, env: isolated }).ok;
      if (ok) expectMonitor = createHash("sha256").update(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"))).digest("hex");
      return ok;
    },
    () => {
      // Inspection must work without resolving either @amc/core or the plugin.
      const source = "- id: packed-inspection\n  name: ./not-installed-plugin.mjs\n  disabled: true\n";
      writeFileSync(join(workspace, "packed-composition.yml"), source);
      const r = run("amc composition (installed kernel, no private packages)", amc,
        ["composition", "--config", "packed-composition.yml", "--json"], { cwd: workspace, env: isolated });
      const valid = verifyPackedComposition(r, source);
      if (!valid) console.error("FAIL installed composition inspection did not preserve source provenance and entries");
      return valid;
    },
    () => {
      // D-20: every A4 surface stays off in the installed package unless the process sets AMC_A4_PREVIEW=1.
      const a4Tools = (env) => {
        const r = run(`amc mcp list-tools --json (AMC_A4_PREVIEW ${env.AMC_A4_PREVIEW ?? "unset"})`, amc, ["mcp", "list-tools", "--json"], { cwd: workspace, env });
        try { return r.ok ? JSON.stringify(JSON.parse(r.stdout)).match(/amc_a4_[a-z_]+/g) ?? [] : null; } catch { return null; }
      };
      const closed = a4Tools(isolated);
      const open = a4Tools({ ...isolated, AMC_A4_PREVIEW: "1" });
      const router = pathToFileURL(join(consumer, "node_modules", pkg.name, "dist", "a4", "a4Router.js")).href;
      const script = `const { handleA4Route } = await import(${JSON.stringify(router)}); let status = 0; let body = "";`
        + " const res = { writeHead: (s) => { status = s; }, setHeader() {}, end: (b) => { body = String(b); } };"
        + ` await handleA4Route("/api/v1/a4/projects", "GET", { headers: {} }, res, { workspace: ${JSON.stringify(workspace)}, nativeTasks: { demo: false } });`
        + " if (status !== 404 || JSON.parse(body).code !== \"A4_PREVIEW_DISABLED\") { console.error(status, body); process.exit(1); }";
      const route = run("installed /api/v1/a4 answers 404 A4_PREVIEW_DISABLED without the preview", "node", ["--input-type=module", "-e", script], { cwd: workspace, env: isolated }).ok;
      const gated = Array.isArray(closed) && closed.length === 0 && Array.isArray(open) && open.length > 0 && route;
      console.log(`${gated ? "ok  " : "FAIL"} A4 preview gate: ${closed?.length ?? "?"} amc_a4_* tools without it, ${open?.length ?? "?"} with it`);
      return gated;
    },
    () => {
      const r = run("amc agent-loop run (stub provider, keyless)", amc,
        ["agent-loop", "run", "--provider", "stub", "--json", "say hello"], { cwd: workspace, env: isolated });
      return verifyRun(r);
    },
    () => {
      const provider = process.env.AMC_PACKED_SMOKE_PROVIDER;
      if (!provider) { console.log("skip real-provider smoke: AMC_PACKED_SMOKE_PROVIDER not set (keyless run only)"); return true; }
      const model = process.env.AMC_PACKED_SMOKE_MODEL;
      const r = run(`amc agent-loop run --provider ${provider} (real provider; key stays in env)`, join(consumer, "node_modules", ".bin", "amc"),
        ["agent-loop", "run", "--json", "--provider", provider, ...(model ? ["--model", model] : []), "reply with the single word ok"], { cwd: workspace, env: isolated });
      return r.ok && !/sk-[A-Za-z0-9]{8,}/.test(r.out) && verifyRun(r, false);
    }
  ];
  let ok = true;
  for (const step of steps) { if (!step()) { ok = false; break; } }
  if (keep || !ok) console.log(`${ok ? "kept" : "left for inspection"}: ${work}`); else rmSync(work, { recursive: true, force: true });
  return ok;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf("--tarball");
  process.exit(packedInstallCheck({ build: !process.argv.includes("--no-build"), keep: process.argv.includes("--keep"),
    ...(at > 0 ? { tarball: process.argv[at + 1] } : {}) }) ? 0 : 1);
}
