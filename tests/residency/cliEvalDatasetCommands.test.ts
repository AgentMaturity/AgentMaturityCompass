/** P2-01 dataset-run POST (src/cli-eval-dataset-commands.ts `amc dataset run`). */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerEvalDatasetCommands } from "../../src/cli-eval-dataset-commands.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const COMPLETION = JSON.stringify({ choices: [{ message: { content: "ok" } }] });
const cwd = process.cwd();
let root: string, blocked: string, open: string, elsewhere: string, model: Listener, logs: string[];
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  elsewhere = newWorkspace(root, "elsewhere");
  model = await listen((_req, res) => { res.writeHead(200, { "content-type": "application/json" }).end(COMPLETION); });
  logs = [];
  const log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  vi.spyOn(console, "log").mockImplementation(log);
  vi.spyOn(console, "error").mockImplementation(log);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
});
afterEach(async () => { process.chdir(cwd); vi.restoreAllMocks(); await closeFixtures(); });

function dataset(workspace: string, cases: number): void {
  mkdirSync(join(workspace, ".amc", "datasets"), { recursive: true });
  writeFileSync(join(workspace, ".amc", "datasets", "golden.json"), JSON.stringify({ name: "golden", cases:
    Array.from({ length: cases }, (_, index) => ({ id: `c${index}`, prompt: `prompt ${index}`, expected: "ok", assertion: "contains" })) }));
}
async function run(workspace: string, endpoint: string): Promise<void> {
  process.chdir(workspace);
  const program = new Command().exitOverride();
  registerEvalDatasetCommands(program, () => undefined);
  await program.parseAsync(["node", "amc", "dataset", "run", "golden", "--endpoint", endpoint, "--json"]).catch((error: Error) => { logs.push(error.message); });
}

describe("dataset run", () => {
  test("a denied case calls no fetch, grades nothing and exits nonzero", async () => {
    dataset(blocked, 2);
    const spy = vi.spyOn(globalThis, "fetch");
    await run(blocked, `${model.url}/v1/chat/completions`);
    expect(logs).toContain("exit 1");
    expect(logs.some(line => /Residency egress blocked/.test(line))).toBe(true);
    expect(logs.some(line => /Results:/.test(line))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(model.connections).toBe(0);
  });

  test("the command-entry workspace holds across cases: a cwd change during the first case does not widen the second", async () => {
    const flipping = await listen((_req, res) => {
      blockResidency(open);
      process.chdir(elsewhere);
      res.writeHead(200, { "content-type": "application/json" }).end(COMPLETION);
    });
    dataset(open, 2);
    await run(open, `${flipping.url}/v1/chat/completions`);
    expect(flipping.requests).toHaveLength(1);
    expect(logs).toContain("exit 1");
  });

  test("a 3xx fails the case, never followed", async () => {
    const redirector = await redirectTo(model);
    dataset(open, 1);
    await run(open, `${redirector.url}/v1/chat/completions`);
    expect(logs.some(line => /Error: HTTP 302/.test(line))).toBe(true);
    expect(model.connections).toBe(0);
  });
});
