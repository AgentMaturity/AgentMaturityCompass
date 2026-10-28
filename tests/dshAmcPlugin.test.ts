/**
 * packages/dsh-amc-plugin against a fake Cordis context that runs a call the way DSH 0.2.1-rc.2's ToolRegistry
 * `prepareExecution` does: the `tools/pre-execute` waterfall (listeners outermost first, innermost `next` = allow), then
 * the guards only on allow, and a throwing listener fails the call undispatched. Not a run of the DSH binary.
 */
import { describe, expect, test, vi } from "vitest";
import {
  createAmcDshPlugin, DENY_MALFORMED, DENY_NO_ARGUMENTS, DENY_NOT_ALLOWED, DENY_UNAVAILABLE,
  type AmcDshAnswer, type AmcDshPluginOptions,
} from "../packages/dsh-amc-plugin/index.mjs";

type Decision = { kind: "allow" } | { kind: "deny"; reason: string } | { kind: "ask" } | { kind: "cancel" };
type Listener = (...args: any[]) => any;

function fakeDsh() {
  const preExecute: Listener[] = [];
  const results: Listener[] = [];
  const guards: Array<(exec: object) => string | undefined> = [];
  const ctx = {
    on(event: string, listener: Listener, prepend?: boolean) {
      const list = event === "tools/pre-execute" ? preExecute : event === "tools/result" ? results : null;
      if (!list) throw new Error(`unexpected event ${event}`);
      if (prepend) list.unshift(listener); else list.push(listener);
    },
    tools: { guard: (guard: (exec: object) => string | undefined) => guards.push(guard) },
  };
  /** One call: "dispatched", or the denial / failure DSH would return instead. */
  async function run(name: string, args: unknown): Promise<{ dispatched: boolean; reason?: string }> {
    const exec = Object.freeze({ callId: "call-1", rootCallId: "call-1", name, arguments: args, signal: new AbortController().signal });
    let decision: Decision;
    try {
      const queue = [...preExecute];
      const next = (): Promise<Decision> => {
        const listener = queue.shift();
        return listener ? listener(exec, next) : Promise.resolve({ kind: "allow" });
      };
      decision = await next();
    } catch (error) {
      return { dispatched: false, reason: `listener threw: ${(error as Error).message}` };
    }
    if (decision.kind === "ask") decision = { kind: "allow" }; // an approval service that grants allowed-once
    if (decision.kind === "deny") return { dispatched: false, reason: decision.reason };
    if (decision.kind === "cancel") return { dispatched: false, reason: "cancelled" };
    const guardReason = guards.map((guard) => guard(exec)).find((reason) => reason !== undefined);
    if (guardReason !== undefined) return { dispatched: false, reason: guardReason };
    for (const listener of results) listener(exec, { isError: false, content: [{ type: "text", text: "secret output" }] });
    return { dispatched: true };
  }
  return { ctx, run, preExecute };
}

function install(overrides: Partial<AmcDshPluginOptions> = {}, answer: AmcDshAnswer | (() => unknown) = { decision: "allow" }) {
  const decide = vi.fn(typeof answer === "function" ? answer : async () => answer);
  const dsh = fakeDsh();
  createAmcDshPlugin({ decide: decide as AmcDshPluginOptions["decide"], dshVersion: "0.2.1-rc.2", qualifiedVersions: ["0.2.1-rc.2"], ...overrides }).apply(dsh.ctx);
  return { ...dsh, decide };
}

describe("dsh-amc-plugin gate", () => {
  test("allow: AMC's allow dispatches the call and AMC saw its arguments", async () => {
    const { run, decide } = install();
    expect(await run("bash", { command: "ls" })).toEqual({ dispatched: true });
    expect((decide.mock.calls[0] as unknown[])[0]).toMatchObject({ tool: "bash", arguments: { command: "ls" }, dshVersion: "0.2.1-rc.2", nested: false });
  });

  test("deny: AMC's reason reaches DSH", async () => {
    const { run } = install({}, { decision: "deny", reason: "ToolHub refused bash" });
    expect(await run("bash", { command: "rm -rf /" })).toEqual({ dispatched: false, reason: "ToolHub refused bash" });
  });

  test("missing arguments: denied without asking AMC", async () => {
    const { run, decide } = install();
    expect(await run("write", undefined)).toEqual({ dispatched: false, reason: DENY_NO_ARGUMENTS });
    expect(await run("write", null)).toEqual({ dispatched: false, reason: DENY_NO_ARGUMENTS });
    expect(decide).not.toHaveBeenCalled();
  });

  test("bridge outage: a throwing transport denies", async () => {
    const { run } = install({}, () => { throw new Error("ECONNREFUSED"); });
    expect(await run("bash", { command: "ls" })).toEqual({ dispatched: false, reason: DENY_UNAVAILABLE });
  });

  test("bridge outage: a transport that never answers is denied at the timeout", async () => {
    const { run } = install({ timeoutMs: 20 }, () => new Promise(() => {}));
    expect(await run("bash", { command: "ls" })).toEqual({ dispatched: false, reason: DENY_UNAVAILABLE });
  });

  test("unqualified DSH version: denied without asking AMC", async () => {
    const { run, decide } = install({ dshVersion: "0.2.2-alpha.2" });
    expect((await run("read", { path: "a" })).reason).toMatch(/AMC has not qualified DSH 0\.2\.2-alpha\.2/);
    expect(decide).not.toHaveBeenCalled();
  });

  test("no qualified version at all denies every call", async () => {
    const { run } = install({ qualifiedVersions: [] });
    expect((await run("read", { path: "a" })).dispatched).toBe(false);
  });

  test.each([
    [{ decision: "allow", extra: true }],
    [{ decision: "deny" }],
    [{ decision: "deny", reason: "  " }],
    [{ decision: "ask" }],
    ["allow"],
    [null],
  ])("a malformed answer %j denies", async (answer) => {
    const { run } = install({}, async () => answer);
    expect(await run("bash", { command: "ls" })).toEqual({ dispatched: false, reason: DENY_MALFORMED });
  });

  test("a listener ahead of AMC's that allows without next() is denied by the guard", async () => {
    const dsh = install();
    dsh.preExecute.unshift(async () => ({ kind: "allow" }));
    expect(await dsh.run("bash", { command: "ls" })).toEqual({ dispatched: false, reason: DENY_NOT_ALLOWED });
    expect(dsh.decide).not.toHaveBeenCalled();
  });

  test("a later listener can still deny after AMC allows", async () => {
    const dsh = install();
    dsh.preExecute.push(async () => ({ kind: "deny", reason: "other policy" }));
    expect(await dsh.run("bash", { command: "ls" })).toEqual({ dispatched: false, reason: "other policy" });
  });

  test("observations carry no arguments or output", async () => {
    const observe = vi.fn();
    const { run } = install({ observe });
    await run("bash", { command: "cat secret" });
    expect(observe).toHaveBeenCalledWith({ tool: "bash", callId: "call-1", rootCallId: "call-1", isError: false });
    expect(JSON.stringify(observe.mock.calls)).not.toMatch(/secret/);
  });
});
