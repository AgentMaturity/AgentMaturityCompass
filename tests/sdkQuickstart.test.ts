import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stubProviderAdapter } from "../src/agent/stubProvider.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";

/**
 * P1-40: the SDK quickstart (examples/sdk/quickstart.mjs) against the built package, from `amc init --coding` to a
 * verified synthetic action, and the stub's scripted call it relies on.
 */
const CLI = resolve("dist/cli.js");
const QUICKSTART = resolve("examples/sdk/quickstart.mjs");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

async function stubCall(texts: readonly string[], tools: readonly string[]) {
  const body = JSON.stringify({ messages: texts.map((text) => ({ role: "user", content: [{ type: "text", text }] })), tools: tools.map((name) => ({ name })) });
  const chunks: StreamChunk[] = [];
  for await (const chunk of stubProviderAdapter.decode({ status: 200, headers: {}, body: bodyFromChunks([body]) })) chunks.push(chunk);
  const end = chunks.find((c) => c.type === "block-end");
  return end?.type === "block-end" && end.block.kind === "tool_use" ? { name: end.block.name, args: JSON.parse(end.block.arguments) } : null;
}

describe("the stub provider's scripted call (P1-40)", () => {
  it("makes the call a prompt spells out when it names an offered tool, and otherwise calls the first tool with the text", async () => {
    const directive = JSON.stringify({ tool: "fs.write", arguments: { path: "hello.txt", content: "hi" } });
    expect(await stubCall([directive], ["fs.read", "fs.write"])).toEqual({ name: "fs.write", args: { path: "hello.txt", content: "hi" } });
    expect(await stubCall(["runtime context", directive, "a later note"], ["fs.read", "fs.write"]), "found in any user text").toEqual(
      { name: "fs.write", args: { path: "hello.txt", content: "hi" } });
    for (const text of [JSON.stringify({ tool: "net.fetch", arguments: {} }), JSON.stringify({ tool: "fs.write", arguments: [] }), "hello", "null"]) {
      expect(await stubCall([text], ["fs.read", "fs.write"]), text).toEqual({ name: "fs.read", args: { text } });
    }
  });
});

describe("the TypeScript SDK quickstart against the built package (P1-40)", () => {
  function initCoding(): { ws: string; env: NodeJS.ProcessEnv; fingerprint: string } {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-sdk-quickstart-")));
    dirs.push(root);
    const ws = join(root, "ws");
    mkdirSync(ws);
    const env = { ...process.env, AMC_VAULT_PASSPHRASE: "sdk-quickstart-passphrase", AMC_HOME: join(root, "home"),
      AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), AMC_BOOTSTRAP_OWNER_USERNAME: "quickstart-owner",
      AMC_BOOTSTRAP_OWNER_PASSWORD: "quickstart-owner-password", NO_COLOR: "1" };
    const init = spawnSync(process.execPath, [CLI, "init", "--coding"], { cwd: ws, env, encoding: "utf8" });
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).not.toContain("sdk-quickstart-passphrase");
    expect(init.stdout).not.toContain("quickstart-owner-password");
    const fingerprint = /export AMC_EXPECTED_MONITOR_FINGERPRINT=([0-9a-f]{64})/.exec(init.stdout)?.[1];
    expect(fingerprint).toBeDefined();
    return { ws, env, fingerprint: fingerprint! };
  }

  it("writes hello.txt through one governed call and verifies the session against the pinned monitor key", () => {
    const { ws, env, fingerprint } = initCoding();
    const run = spawnSync(process.execPath, [QUICKSTART, ws], { cwd: ws, env: { ...env, AMC_EXPECTED_MONITOR_FINGERPRINT: fingerprint }, encoding: "utf8" });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const lines = run.stdout.trim().split("\n");
    expect(lines.every((line) => line.startsWith("[synthetic] ")), "every output line is labelled synthetic").toBe(true);
    expect(run.stdout).toContain("claim kind synthetic_example");
    expect(run.stdout).toContain("governed tool call fs.write hello.txt: completed; hello.txt written: yes");
    expect(run.stdout).toContain("verification: verified, externally-anchored");
    expect(run.stdout).toMatch(/receipt sha256: [0-9a-f]{64}/);
    expect(run.stdout).not.toMatch(/\b(certified|compliant)\b/i);
    expect(readFileSync(join(ws, "hello.txt"), "utf8")).toContain("synthetic stub run");
  }, 180_000);

  it("refuses to claim verification without the pin, or with a pin for another key", () => {
    const { ws, env } = initCoding();
    const unpinned = spawnSync(process.execPath, [QUICKSTART, ws], { cwd: ws, env, encoding: "utf8" });
    expect(unpinned.status).toBe(1);
    expect(unpinned.stderr).toContain("Set AMC_EXPECTED_MONITOR_FINGERPRINT");
    const forged = spawnSync(process.execPath, [QUICKSTART, ws], { cwd: ws, env: { ...env, AMC_EXPECTED_MONITOR_FINGERPRINT: "0".repeat(64) }, encoding: "utf8" });
    expect(forged.status).not.toBe(0);
    expect(forged.stdout).not.toContain("verification: verified");
  }, 180_000);
});
