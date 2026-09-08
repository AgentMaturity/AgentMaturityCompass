import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function entrypoint(args: string[], options: { bootstrap?: boolean; failBootstrap?: boolean; missingSecret?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "amc-container-entrypoint-")); dirs.push(dir);
  const fake = join(dir, "amc"); const calls = join(dir, "calls.jsonl");
  writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(process.env.AMC_TEST_CALLS,JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[2]==='bootstrap'&&process.env.AMC_TEST_FAIL==='1')process.exit(17);\n`);
  chmodSync(fake, 0o755);
  const env: NodeJS.ProcessEnv = { PATH: `${dir}:${process.env.PATH}`, HOME: dir, AMC_TEST_CALLS: calls, AMC_WORKSPACE_DIR: join(dir, "workspace with spaces"), AMC_TEST_FAIL: options.failBootstrap ? "1" : "0" };
  if (options.bootstrap === false) env.AMC_BOOTSTRAP = "0";
  if (!options.missingSecret) {
    for (const key of ["AMC_VAULT_PASSPHRASE_FILE", "AMC_BOOTSTRAP_OWNER_USERNAME_FILE", "AMC_BOOTSTRAP_OWNER_PASSWORD_FILE"]) {
      const file = join(dir, key); writeFileSync(file, "runtime-secret"); env[key] = file;
    }
  }
  const result = spawnSync("bash", [resolve("docker/entrypoint.sh"), ...args], { env, encoding: "utf8" });
  return { ...result, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [], dir };
}

describe("container source build and runtime contracts", () => {
  it("builds the frozen workspace and installs its packed artifact in separate stages", () => {
    const file = read("Dockerfile");
    expect(file).toContain("pnpm install --frozen-lockfile");
    expect(file).toContain("pnpm run build");
    expect(file).toContain("npm pack --ignore-scripts");
    expect(file).toContain("npm install --omit=dev");
    expect(file).toMatch(/FROM .* AS runner/);
    expect(file).toMatch(/FROM .* AS studio/);
    expect(file).not.toMatch(/package-lock\.json|npm ci|npm link|COPY \. \./);
    for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "scripts/", "vendor/", "packages/", "src/"]) expect(file).toContain(path);
    expect(file).toContain("USER 10001:10001");
    expect(file).not.toMatch(/(?:ENV|ARG)\s+AMC_.*(?:PASSPHRASE|PASSWORD|SECRET)/);
    expect(existsSync("Dockerfile.runner")).toBe(false);
    expect(existsSync("deploy/compose/Dockerfile")).toBe(false);
  });

  it("points source compose services at the canonical target and installed executable", () => {
    for (const path of ["deploy/compose/docker-compose.yml", "deploy/compose/docker-compose.tls.yml", "docker/docker-compose.yml"]) {
      const compose = YAML.parse(read(path));
      for (const service of Object.values(compose.services) as any[]) {
        if (!service.build) continue;
        expect(service.build.dockerfile).toBe("Dockerfile");
        expect(service.build.target).toBe("studio");
        expect(existsSync(resolve(path, "..", service.build.context, service.build.dockerfile))).toBe(true);
        expect(JSON.stringify(service)).not.toContain("dist/cli.js");
      }
    }
  });

  it("passes explicit CLI arguments through without initializing state", () => {
    const result = entrypoint(["notary", "start", "--notary-dir", "/custom path"], { missingSecret: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([["notary", "start", "--notary-dir", "/custom path"]]);
    expect(existsSync(join(result.dir, "workspace with spaces"))).toBe(false);
  });

  it("preserves an explicit studio subcommand rather than applying the default startup", () => {
    const result = entrypoint(["studio", "--help"], { missingSecret: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([["studio", "--help"]]);
  });

  it("qualifies the exact loaded image before either publication workflow pushes it", () => {
    for (const file of [".github/workflows/docker-runner.yml", ".github/workflows/release.yml"]) {
      const workflow = YAML.parse(read(file));
      const steps = Object.values(workflow.jobs).flatMap((job: any) => job.steps ?? []) as any[];
      const buildIndex = steps.findIndex((step) => step.id === "runtime_image");
      const build = steps[buildIndex];
      expect(build.with).toMatchObject({ load: true, push: false, platforms: "linux/amd64" });
      const qualifyIndex = steps.findIndex((step) => String(step.run ?? "").includes("scripts/container-smoke.mjs"));
      expect(qualifyIndex).toBeGreaterThan(buildIndex);
      expect(Object.values(steps[qualifyIndex].env)).toContain("${{ steps.runtime_image.outputs.imageid }}");
      const pushIndex = steps.findIndex((step) => String(step.run ?? "").includes('docker push "$tag"'));
      expect(pushIndex).toBeGreaterThan(qualifyIndex);
      expect(String(steps[pushIndex].run)).toContain("docker image inspect --format '{{.Id}}'");
    }
  });

  it("bootstraps then starts the installed CLI with the exact workspace", () => {
    const result = entrypoint([]);
    expect(result.status, result.stderr).toBe(0);
    const workspace = join(result.dir, "workspace with spaces");
    expect(result.calls).toEqual([["bootstrap", "--workspace", workspace], ["studio", "start", "--workspace", workspace, "--bind", "0.0.0.0", "--port", "3212"]]);
  });

  it("does not start Studio when bootstrap fails", () => {
    const result = entrypoint([], { failBootstrap: true });
    expect(result.status).toBe(17);
    expect(result.calls).toHaveLength(1);
  });

  it("fails before bootstrap when runtime secrets are missing", () => {
    const result = entrypoint([], { missingSecret: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("AMC_VAULT_PASSPHRASE_FILE");
    expect(result.calls).toEqual([]);
  });

  it("allows an initialized workspace to start with bootstrap disabled", () => {
    const result = entrypoint([], { bootstrap: false });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].slice(0, 2)).toEqual(["studio", "start"]);
  });
});
