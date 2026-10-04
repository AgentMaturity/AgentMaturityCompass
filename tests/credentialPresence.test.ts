import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const root = process.cwd();
const script = resolve(root, "scripts/credentials-presence-check.mjs");

/** The contract named by the S2 acceptance (planner-tracks.json, S2). */
const CONTRACT = ["NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN", "RAILWAY_TOKEN", "VERCEL_TOKEN", "GHCR_TOKEN", "NPMRC_AUTH_TOKEN_LINE"];
const ENV_NAMES = ["NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN", "RAILWAY_TOKEN", "VERCEL_TOKEN", "GHCR_TOKEN",
  "AMC_RELEASE_SIGNING_KEY", "HOMEBREW_TAP_TOKEN", "AMC_DEPLOY_VERIFY_LEASE", "GITHUB_TOKEN"];

type Entry = { present: boolean; requiredFor: string; configureAt: string };

/** Every secret name the workflows reference, read the same way a reviewer would. */
function workflowSecretNames(): string[] {
  const dir = join(root, ".github", "workflows");
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(match[1]);
  }
  return [...names].sort();
}

const homes: string[] = [];
function tempHome(npmrc?: string): string {
  const home = mkdtempSync(join(tmpdir(), "amc-cred-presence-"));
  homes.push(home);
  if (npmrc !== undefined) writeFileSync(join(home, ".npmrc"), npmrc);
  return home;
}
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

function run(args: string[], env: Record<string, string>, home: string): Promise<{ code: number; out: string }> {
  // Start from the caller's environment minus every credential name, so the
  // developer's real tokens can neither leak into nor satisfy a test.
  const base: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  for (const name of ENV_NAMES) delete base[name];
  return new Promise((done) => {
    execFile(process.execPath, [script, ...args], { cwd: root, env: { ...base, ...env } }, (error, stdout, stderr) => {
      done({ code: error ? (typeof error.code === "number" ? error.code : 99) : 0, out: `${stdout}${stderr}` });
    });
  });
}

describe("credentials-presence-check", () => {
  test("--json names each contract credential as {present, requiredFor, configureAt} and exits 1 when absent", async () => {
    const { code, out } = await run(["--json"], { NPM_TOKEN: "", CHANGESETS_GITHUB_TOKEN: "" }, tempHome());
    expect(code).toBe(1);
    const report = JSON.parse(out) as Record<string, Entry>;
    for (const name of CONTRACT) {
      expect(Object.keys(report[name]).sort(), name).toEqual(["configureAt", "present", "requiredFor"]);
      expect(report[name].present, name).toBe(false);
      expect(report[name].requiredFor.length, name).toBeGreaterThan(0);
      expect(report[name].configureAt.length, name).toBeGreaterThan(0);
    }
    for (const entry of Object.values(report)) expect(Object.keys(entry).sort()).toEqual(["configureAt", "present", "requiredFor"]);
  });

  test("never prints a value in text or JSON mode, even when every credential is set", async () => {
    const env = Object.fromEntries(ENV_NAMES.map((name, index) => [name, `zz-secret-${index}-zz`]));
    env.NPM_TOKEN = "s2-canary-value-9f3";
    const home = tempHome("//registry.npmjs.org/:_authToken=npmrc-canary-77\n");
    for (const args of [[], ["--json"], ["--for", "all"], ["--for", "all", "--json"]]) {
      const { code, out } = await run(args, env, home);
      expect(code, args.join(" ")).toBe(0);
      expect(out).not.toContain("s2-canary-value-9f3");
      expect(out).not.toContain("zz-secret");
      expect(out).not.toContain("npmrc-canary");
    }
    const report = JSON.parse((await run(["--json"], env, home)).out) as Record<string, Entry>;
    for (const name of CONTRACT) expect(report[name].present, name).toBe(true);
  });

  test("detects an _authToken line in $HOME/.npmrc by presence only, ignoring comments", async () => {
    const withLine = await run(["--json"], {}, tempHome("registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=npmrc-canary-77\n"));
    expect((JSON.parse(withLine.out) as Record<string, Entry>).NPMRC_AUTH_TOKEN_LINE.present).toBe(true);
    expect(withLine.out).not.toContain("npmrc-canary");
    const commented = await run(["--json"], {}, tempHome("; //registry.npmjs.org/:_authToken=old\n# _authToken=older\n"));
    expect((JSON.parse(commented.out) as Record<string, Entry>).NPMRC_AUTH_TOKEN_LINE.present).toBe(false);
    const missing = await run(["--json"], {}, tempHome());
    expect((JSON.parse(missing.out) as Record<string, Entry>).NPMRC_AUTH_TOKEN_LINE.present).toBe(false);
  });

  test("--for limits what is required: exit 0 when the action's credentials are present", async () => {
    const { code, out } = await run(["--for", "publish"], { NPM_TOKEN: "a", CHANGESETS_GITHUB_TOKEN: "b" }, tempHome());
    expect(code).toBe(0);
    expect(out).toContain("NPM_TOKEN: present");
    expect(out).toContain("RAILWAY_TOKEN: absent");
  });

  test("exits 1 and names the missing credential; blank or whitespace counts as absent", async () => {
    const { code, out } = await run(["--for", "publish"], { NPM_TOKEN: "  ", CHANGESETS_GITHUB_TOKEN: "x" }, tempHome());
    expect(code).toBe(1);
    expect(out).toContain("NPM_TOKEN: absent");
    expect(out).toMatch(/^missing for publish: NPM_TOKEN$/m);
  });

  test("covers every secret the workflows reference (GITHUB_TOKEN is provisioned by Actions)", async () => {
    const report = JSON.parse((await run(["--json"], {}, tempHome())).out) as Record<string, Entry>;
    for (const name of workflowSecretNames().filter((name) => name !== "GITHUB_TOKEN")) expect(report[name], name).toBeDefined();
  });

  test("exits 2 on an unknown action or argument", async () => {
    expect((await run(["--for", "nonsense"], {}, tempHome())).code).toBe(2);
    expect((await run(["--verbose"], {}, tempHome())).code).toBe(2);
  });
});
