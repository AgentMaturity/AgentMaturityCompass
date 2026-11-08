/**
 * P1-67 follow-up: Studio hands a native task's lease to its `amc acp` child over an inherited pipe (fd 3), never in the
 * child's environment, where the same user could read it while the runtime runs. The child (`takeNativeTaskLease`, the
 * reader `amc acp` calls before anything runs) still receives the exact token; with no pipe it has none and refuses
 * under a plan as before. The fixture child runs the built reader (dist/), so build first.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const TOKEN = `eyJ${"a".repeat(24)}.${"b".repeat(48)}`;

/** Starts a child that takes the lease as `amc acp` does and records what it got and its environment, then exits. */
async function child(options: { leaseToken?: string }): Promise<{ token: string | null; env: Record<string, string> }> {
  const dir = mkdtempSync(join(tmpdir(), "amc-lease-fd-"));
  dirs.push(dir);
  const out = join(dir, "seen.json");
  const fixture = join(dir, "child.mjs");
  writeFileSync(fixture, `import { writeFileSync } from "node:fs";
const { takeNativeTaskLease } = await import(${JSON.stringify(pathToFileURL(resolve("dist/acp/nativeTaskLease.js")).href)});
const token = takeNativeTaskLease();
writeFileSync(process.env.LEASE_FIXTURE_OUT, JSON.stringify({ token: token ?? null, env: process.env }));
process.exit(0);
`);
  await expect(AMCNativeClient.start({ workspace: dir, provider: "stub", command: [process.execPath, fixture], env: { LEASE_FIXTURE_OUT: out },
    timeoutMs: 20_000, ...options })).rejects.toThrow();
  return JSON.parse(readFileSync(out, "utf8")) as { token: string | null; env: Record<string, string> };
}

describe("native task lease handoff", () => {
  test("the child receives the token over the pipe and its environment never holds it", async () => {
    const seen = await child({ leaseToken: TOKEN });
    expect(seen.token).toBe(TOKEN);
    expect(Object.entries(seen.env).filter(([, value]) => value.includes(TOKEN))).toEqual([]);
    expect(Object.keys(seen.env).filter((key) => key.startsWith("AMC_NATIVE_TASK_LEASE"))).toEqual([]);
  }, 30_000);

  test("with no lease the child has none (and refuses under a plan as before)", async () => {
    expect((await child({})).token).toBeNull();
  }, 30_000);

  test("a token with a line break is refused before any child starts", async () => {
    await expect(AMCNativeClient.start({ workspace: tmpdir(), provider: "stub", leaseToken: `${TOKEN}\nX` })).rejects.toThrow(/lease/i);
  });
});
