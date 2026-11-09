/** P2-01 CLI alert POSTs (src/cli-trace-commands.ts: `amc alert send`, `amc alert test`, `amc alert watch`). */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerAlertCommands } from "../../src/cli-trace-commands.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

const timeline = vi.hoisted(() => ({ onBuild: () => undefined as void }));
vi.mock("../../src/observability/timeline.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/observability/timeline.js")>(),
  buildAgentTimelineData: () => { timeline.onBuild(); return { anomalies: [{ severity: "CRITICAL", type: "spike", message: "fixture" }] }; }
}));

vi.setConfig({ testTimeout: 60_000 });
const cwd = process.cwd();
let root: string, blocked: string, open: string, elsewhere: string, hook: Listener, logs: string[];
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  elsewhere = newWorkspace(root, "elsewhere"); // unregulated: a check read from here would be admitted
  hook = await listen((_req, res) => { res.writeHead(200).end("ok"); });
  logs = [];
  const log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  vi.spyOn(console, "log").mockImplementation(log);
  vi.spyOn(console, "error").mockImplementation(log);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
  vi.spyOn(globalThis, "setInterval").mockImplementation((() => 0) as never);
  timeline.onBuild = () => undefined;
}, 60_000); // Three real vault and signing-key initializations can exceed the default hook timeout.
afterEach(async () => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); await closeFixtures(); });

const destinations = (workspace: string, config: Record<string, string>) => {
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  writeFileSync(join(workspace, ".amc", "alerts.json"), JSON.stringify(config));
};
async function amc(workspace: string, ...args: string[]): Promise<void> {
  process.chdir(workspace);
  const program = new Command().exitOverride();
  registerAlertCommands(program, () => undefined);
  await program.parseAsync(["node", "amc", "alert", ...args]).catch((error: Error) => { logs.push(error.message); });
}

describe("CLI alert commands", () => {
  test("denied send, test and watch POSTs call no fetch and open no socket; send and test exit nonzero", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await amc(blocked, "send", "--url", `${hook.url}/send`, "--message", "m");
    expect(logs).toContain("exit 1");
    destinations(blocked, { webhook: `${hook.url}/a`, slack: `${hook.url}/b` });
    await amc(blocked, "test");
    expect(process.exitCode).toBe(1);
    expect(logs.filter(line => /Residency egress blocked/.test(line))).toHaveLength(3);
    await amc(blocked, "watch");
    expect(logs.filter(line => /Residency egress blocked/.test(line))).toHaveLength(5);
    expect(spy).not.toHaveBeenCalled();
    expect(hook.connections).toBe(0);
  });

  test("the action-entry workspace holds: a cwd change during the first delivery or the timeline read does not widen later checks", async () => {
    const second = await listen((_req, res) => { res.writeHead(200).end("ok"); });
    const first = await listen((_req, res) => { blockResidency(open); process.chdir(elsewhere); res.writeHead(200).end("ok"); });
    destinations(open, { webhook: `${first.url}/a`, slack: `${second.url}/b` });
    destinations(elsewhere, { webhook: `${second.url}/a` });
    await amc(open, "test");
    expect(first.requests).toHaveLength(1);
    expect(second.connections).toBe(0);
    expect(process.exitCode).toBe(1);

    // watch: the workspace captured before the timeline read is checked, not the cwd the read moved to.
    destinations(blocked, { webhook: `${second.url}/a` });
    timeline.onBuild = () => process.chdir(elsewhere);
    await amc(blocked, "watch");
    expect(second.connections).toBe(0);
    expect(logs.some(line => /Residency egress blocked/.test(line))).toBe(true);
  });

  test("a 3xx is reported as not sent, never followed", async () => {
    const redirector = await redirectTo(hook);
    await amc(open, "send", "--url", `${redirector.url}/send`, "--message", "m", "--json");
    expect(JSON.parse(logs.find(line => line.startsWith("{"))!)).toMatchObject({ sent: false, status: 302 });
    destinations(open, { webhook: `${redirector.url}/a` });
    await amc(open, "test");
    await amc(open, "watch");
    expect(logs.some(line => /webhook: 302/.test(line))).toBe(true);
    expect(hook.connections).toBe(0);
  });
});
