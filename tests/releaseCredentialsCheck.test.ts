import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const script = resolve(root, "scripts/release-credentials-check.mjs");

/** Every secret name the workflows reference, read the same way a reviewer would. */
function workflowSecretNames(): string[] {
  const dir = join(root, ".github", "workflows");
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

const KNOWN = ["NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN", "RAILWAY_TOKEN", "VERCEL_TOKEN", "GITHUB_TOKEN",
  "AMC_RELEASE_SIGNING_KEY", "HOMEBREW_TAP_TOKEN", "AMC_DEPLOY_VERIFY_LEASE", ...workflowSecretNames()];

function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  // Start from the caller's environment minus every credential name, so the
  // developer's real tokens can neither leak into nor satisfy a test.
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const name of KNOWN) delete base[name];
  return new Promise((done) => {
    execFile(process.execPath, [script, ...args], { cwd: root, env: { ...base, ...env } }, (error, stdout, stderr) => {
      done({ code: error ? (typeof error.code === "number" ? error.code : 99) : 0, out: `${stdout}${stderr}` });
    });
  });
}

describe("release-credentials-check", () => {
  test("reports SET for a present credential and never prints its value", async () => {
    const { out } = await run(["--for", "publish"], { NPM_TOKEN: "sentinel-value" });
    expect(out).toContain("NPM_TOKEN: SET");
    expect(out).not.toContain("sentinel-value");
    expect(out).not.toContain("sentinel");
  });

  test("never prints any value in text or JSON mode, for every name it knows", async () => {
    const env = Object.fromEntries(KNOWN.map((name, index) => [name, `zz-secret-${index}-zz`]));
    for (const args of [["--for", "all"], ["--for", "all", "--json"], []]) {
      const { code, out } = await run(args, env);
      expect(code).toBe(0);
      expect(out).not.toMatch(/zz-secret-\d+-zz/);
      expect(out).not.toContain("zz-secret");
    }
  });

  test("exits 1 and names the missing credential when a required one is unset", async () => {
    const { code, out } = await run(["--for", "publish"], { CHANGESETS_GITHUB_TOKEN: "x" });
    expect(code).toBe(1);
    expect(out).toContain("NPM_TOKEN: UNSET");
    expect(out).toMatch(/missing for publish: NPM_TOKEN\b/);
  });

  test("treats an empty or whitespace value as UNSET, matching the workflows' -z checks", async () => {
    const { code, out } = await run(["--for", "publish"], { NPM_TOKEN: "  ", CHANGESETS_GITHUB_TOKEN: "x" });
    expect(code).toBe(1);
    expect(out).toContain("NPM_TOKEN: UNSET");
  });

  test("exits 0 when every credential for the action is set", async () => {
    const { code, out } = await run(["--for", "publish"], { NPM_TOKEN: "a", CHANGESETS_GITHUB_TOKEN: "b" });
    expect(code).toBe(0);
    expect(out).toContain("CHANGESETS_GITHUB_TOKEN: SET");
  });

  test("inventories every secret name the workflows reference", async () => {
    const { out } = await run(["--json"]);
    const report = JSON.parse(out) as { workflowReferenced: Array<{ name: string; status: string }> };
    expect(report.workflowReferenced.map((entry) => entry.name).sort()).toEqual(workflowSecretNames());
    for (const entry of report.workflowReferenced) expect(entry.status).toBe("UNSET");
  });

  test("covers the deploy targets named in the brief", async () => {
    const railway = await run(["--for", "deploy-railway"]);
    expect(railway.code).toBe(1);
    expect(railway.out).toContain("RAILWAY_TOKEN: UNSET");
    const vercel = await run(["--for", "deploy-vercel"], { VERCEL_TOKEN: "v" });
    expect(vercel.code).toBe(0);
    expect(vercel.out).toContain("VERCEL_TOKEN: SET");
  });

  test("exits 2 on an unknown action", async () => {
    const { code, out } = await run(["--for", "nonsense"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown action");
  });
});
