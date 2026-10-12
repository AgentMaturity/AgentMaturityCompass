import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), "utf8")) as T;

describe("deploy target configs match the code at HEAD", () => {
  const scripts = readJson<{ scripts: Record<string, string> }>("package.json").scripts;

  test("railway starts a package.json script that exists and health-checks a route the API serves", () => {
    const railway = readJson<{ deploy: { startCommand: string; healthcheckPath?: string } }>("railway.json");
    const match = /^(?:npm run|pnpm(?: run)?) ([\w:.-]+)$/.exec(railway.deploy.startCommand);
    expect(match, railway.deploy.startCommand).not.toBeNull();
    const script = scripts[match![1]];
    expect(script).toBeTruthy();
    const entry = /\b(api\/[\w./-]+\.ts)\b/.exec(script)?.[1];
    expect(entry && existsSync(join(root, entry)), script).toBe(true);
    expect(railway.deploy.healthcheckPath).toBe("/api/health");
    expect(readFileSync(join(root, entry!), "utf8")).toContain(`path === '${railway.deploy.healthcheckPath}'`);
  });

  test("vercel builds and routes to an entry that exists", () => {
    const vercel = readJson<{ builds: Array<{ src: string }>; routes: Array<{ dest: string }> }>("vercel.json");
    for (const build of vercel.builds) expect(existsSync(join(root, build.src)), build.src).toBe(true);
    for (const route of vercel.routes) expect(existsSync(join(root, route.dest.replace(/^\//, ""))), route.dest).toBe(true);
  });
});
