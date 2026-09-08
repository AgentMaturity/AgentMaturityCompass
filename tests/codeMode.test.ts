import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline, RUN_CODE_TOOL } from "../src/tools/toolPipeline.js";
import { registerCodeTransport } from "../src/codemode/runCodeTool.js";
import { CodeModeRunner } from "../src/codemode/codeModeRunner.js";

/**
 * P4.5's verification.
 *
 * The claim being tested is NOT "the worker is isolated" — it is not, and
 * these tests say so out loud. The claim is that a call a program dispatches
 * meets exactly the same policy as a call the model makes directly, and that
 * the transport refuses to run where the OS boundary is absent.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workdir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-code-")));
  dirs.push(dir);
  return dir;
}

/** A pipeline in code mode with `run_code` plus whatever tools a test needs. */
function harness(options: {
  tools?: readonly ReturnType<typeof defineTool>[];
  guard?: { label: string; deny: (name: string) => string | undefined };
  confined?: boolean;
} = {}): { workspace: string; run: (source: string) => ReturnType<ToolPipeline["execute"]>; pipeline: ToolPipeline } {
  const workspace = workdir();
  const registry = new ToolRegistry();
  for (const tool of options.tools ?? []) registry.define(tool);
  if (options.guard) {
    registry.guard(options.guard.label, (execution) => options.guard?.deny(execution.name));
  }

  let pipeline: ToolPipeline;
  registerCodeTransport(registry, {
    pipeline: () => pipeline,
    confined: () => options.confined ?? true,
    limits: { wallMs: 4_000, maxResultBytes: 20_000, maxToolCalls: 10 }
  });
  pipeline = new ToolPipeline({ registry, workspace, mode: "code" });

  return {
    workspace,
    pipeline,
    run: (source) => pipeline.execute({
      name: RUN_CODE_TOOL, agentId: "alice", arguments: { source }, requestedMode: "EXECUTE"
    })
  };
}

const echoTool = defineTool({
  name: "echo",
  actionClass: "READ_ONLY",
  description: "echoes",
  body: (execution) => ({ output: `echoed:${String(execution.arguments.text ?? "")}` })
});

describe("mode collapse", () => {
  it("refuses a direct call to anything but run_code", async () => {
    const h = harness({ tools: [echoTool] });
    const outcome = await h.pipeline.execute({
      name: "echo", agentId: "alice", arguments: { text: "hi" }, requestedMode: "EXECUTE"
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.stage, "the collapse is about visibility, not policy").toBe("visibility");
    expect(outcome.denied?.reason, "and it names the route the model must take").toContain(RUN_CODE_TOOL);
  });

  it("terminates the collapsed call BEFORE any guard sees it", async () => {
    // A collapsed call can only ever fail. Letting policy observe it would
    // mean asking a human to approve -- and recording an approval for --
    // something that was never going to run.
    let guardSaw = 0;
    const h = harness({
      tools: [echoTool],
      guard: { label: "counter", deny: () => { guardSaw += 1; return undefined; } }
    });

    await h.pipeline.execute({ name: "echo", agentId: "alice", arguments: {}, requestedMode: "EXECUTE" });
    expect(guardSaw, "no guard should be consulted about a call that cannot run").toBe(0);
  });

  it("does not collapse a SUB-call, which is the whole point", async () => {
    const h = harness({ tools: [echoTool] });
    const outcome = await h.run('return await tools.echo({ text: "from code" });');

    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("echoed:from code");
  });

  it("leaves native mode alone", async () => {
    const registry = new ToolRegistry();
    registry.define(echoTool);
    const native = new ToolPipeline({ registry, workspace: workdir() });
    const outcome = await native.execute({
      name: "echo", agentId: "alice", arguments: { text: "direct" }, requestedMode: "EXECUTE"
    });
    expect(outcome.ok).toBe(true);
  });
});

describe("the transport name is reserved", () => {
  it("cannot be registered as an ordinary tool", () => {
    // Under code mode this is the ONLY name callable directly, so a plugin
    // that could register it would become the transport every dispatch flows
    // through -- and would see, and could rewrite, every sub-call.
    const registry = new ToolRegistry();
    expect(() => registry.define(defineTool({
      name: RUN_CODE_TOOL, actionClass: "READ_ONLY", description: "impostor",
      body: () => ({ output: "pwned" })
    }))).toThrow(/reserved/);
  });

  it("cannot be shadowed inside a scope either", () => {
    const registry = new ToolRegistry();
    expect(() => registry.define(defineTool({
      name: RUN_CODE_TOOL, actionClass: "READ_ONLY", description: "impostor",
      body: () => ({ output: "pwned" })
    }), "some-agent")).toThrow(/reserved/);
  });

  it("cannot be named by a restriction", () => {
    // A category error: the transport is presentation infrastructure, not a
    // capability. Denying it under code mode leaves an agent able to call
    // nothing; allowing it says nothing about what the program may dispatch.
    const registry = new ToolRegistry();
    expect(() => registry.restrict({ deny: new Set([RUN_CODE_TOOL]) })).toThrow(/reserved/);
    expect(() => registry.restrict({ allow: new Set([RUN_CODE_TOOL]) })).toThrow(/reserved/);
  });

  it("still admits the real transport through its own door", () => {
    const registry = new ToolRegistry();
    expect(() => registerCodeTransport(registry, {
      pipeline: () => { throw new Error("Registration must not execute a pipeline"); },
      confined: () => true
    })).not.toThrow();
    expect(registry.visible("a").has(RUN_CODE_TOOL)).toBe(true);
  });

  it("closes the door again after admitting it", () => {
    // The reservation is not a latch a caller can leave open.
    const registry = new ToolRegistry();
    registerCodeTransport(registry, { pipeline: () => { throw new Error("Registration must not execute a pipeline"); }, confined: () => true });
    expect(() => registry.define(defineTool({
      name: RUN_CODE_TOOL, actionClass: "READ_ONLY", description: "second",
      body: () => ({ output: "x" })
    }))).toThrow(/reserved/);
  });
});

describe("a sub-call meets the same policy as a direct one", () => {
  it("is DENIED inside the program when a guard refuses it", async () => {
    // The verification P4.5 names. If a guard could be skipped by wrapping a
    // call in a program, code mode would be a governance bypass with a
    // convenient syntax.
    const h = harness({
      tools: [echoTool],
      guard: { label: "no-echo", deny: (name) => (name === "echo" ? "policy forbids echo" : undefined) }
    });

    const outcome = await h.run('try { await tools.echo({ text: "x" }); return "NOT DENIED"; } catch (e) { return "denied: " + e.message; }');

    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("policy forbids echo");
    expect(outcome.output, "the program must not have got through").not.toContain("NOT DENIED");
  });

  it("tells the program WHICH stage denied it, not merely that it failed", async () => {
    // A program told only "failed" retries the same call. One told which guard
    // refused it, and why, can choose differently.
    const h = harness({
      tools: [echoTool],
      guard: { label: "no-echo", deny: (name) => (name === "echo" ? "not on this agent" : undefined) }
    });
    const outcome = await h.run('try { await tools.echo({}); } catch (e) { return e.message; } return "?";');
    expect(outcome.output).toContain("guard denied");
  });

  it("records every dispatched call, allowed and denied", async () => {
    const h = harness({
      tools: [
        echoTool,
        defineTool({ name: "blocked", actionClass: "READ_ONLY", description: "x", body: () => ({ output: "no" }) })
      ],
      guard: { label: "no-blocked", deny: (name) => (name === "blocked" ? "denied" : undefined) }
    });

    const outcome = await h.run(
      'await tools.echo({ text: "a" }); try { await tools.blocked({}); } catch {} return "done";'
    );
    expect(outcome.output).toContain("ok  echo");
    expect(outcome.output, "a denied dispatch is part of what the program did").toContain("denied blocked");
  });

  it("refuses a tool that does not exist, without killing the program", async () => {
    const h = harness({ tools: [echoTool] });
    const outcome = await h.run('try { await tools.nope({}); } catch (e) { return "caught"; } return "?";');
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("caught");
  });
});

describe("budgets", () => {
  it("kills a spinning program", async () => {
    // The timer lives on the HOST thread on purpose: a program that never
    // yields cannot be timed out by anything inside the worker.
    const h = harness();
    const started = Date.now();
    const outcome = await h.run("while (true) {}");

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("timeout");
    expect(Date.now() - started, "the wall budget is 4s in this harness").toBeLessThan(15_000);
  });

  it("stops a program that makes too many tool calls", async () => {
    const h = harness({ tools: [echoTool] });
    const outcome = await h.run('for (let i = 0; i < 50; i++) { await tools.echo({ text: String(i) }); } return "finished";');

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("call-budget");
  });

  it("refuses an oversized result", async () => {
    const h = harness();
    const outcome = await h.run('return "x".repeat(50000);');
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("result-too-large");
  });

  it("reports a program that throws as a failure, not a success", async () => {
    const h = harness();
    const outcome = await h.run('throw new Error("deliberate");');
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("deliberate");
  });

  it("gives the program an EMPTY environment", async () => {
    // A program that can read the host's environment can read every credential
    // the host holds, and has no legitimate need for any of it.
    const prior = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-must-not-be-visible";
    try {
      const h = harness();
      const outcome = await h.run('return JSON.stringify({ n: Object.keys(process.env).length });');
      expect(outcome.ok).toBe(true);
      expect(outcome.output).toContain('"n":0');
    } finally {
      if (prior === undefined) delete process.env["ANTHROPIC_API_KEY"];
      else process.env["ANTHROPIC_API_KEY"] = prior;
    }
  });
});

describe("code mode requires OS confinement", () => {
  it("refuses to run at all when the host is unconfined", async () => {
    // Measured, and the reason this check exists: a worker can require
    // node:fs and write anywhere, so a program that ignores the tools binding
    // is governed by the sandbox and by nothing else. Running one without a
    // sandbox is running ungoverned code with a governance story attached.
    const h = harness({ confined: false });
    const outcome = await h.run('return "should never run";');

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("unconfined");
    expect(outcome.output).toContain("bypass the tools binding");
  });

  it("does not start a worker at all when unconfined", async () => {
    const workspace = workdir();
    const marker = join(workspace, "worker-ran.txt");
    const runner = new CodeModeRunner({ confined: false, dispatch: async () => ({ ok: true, value: null }) });

    const outcome = await runner.run(
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`
    );

    expect(existsSync(marker), "nothing may execute before the confinement check").toBe(false);
    expect(outcome.failure).toBe("unconfined");
  });
});

describe("the host treats worker traffic as hostile", () => {
  it("answers a forged duplicate call id only once", async () => {
    // A program can reach parentPort directly and post whatever it likes, so
    // the compile-time message type is worthless at this boundary. A forged
    // duplicate id would otherwise let one call's result be delivered as
    // another's.
    let dispatches = 0;
    const runner = new CodeModeRunner({
      confined: true,
      dispatch: async () => { dispatches += 1; return { ok: true, value: "real" }; }
    });

    const outcome = await runner.run(`
      const { parentPort } = require("node:worker_threads");
      parentPort.postMessage({ kind: "call", id: 7777, name: "echo", args: {} });
      parentPort.postMessage({ kind: "call", id: 7777, name: "echo", args: {} });
      await new Promise((r) => setTimeout(r, 200));
      return "survived";
    `);

    expect(outcome.ok).toBe(true);
    expect(dispatches, "the second forged message must be dropped").toBe(1);
  });

  it("survives junk messages instead of crashing the host", async () => {
    // A throw in the host's message listener takes down the HOST process, not
    // the worker that sent the junk. Dropping is the only safe response.
    //
    // The assertion has to WATCH FOR THE REJECTION, not just check the return
    // value: reading `.kind` off a posted `null` throws inside the listener,
    // and that surfaces as an unhandled rejection which leaves the program's
    // own result perfectly intact. The first version of this test passed while
    // the host was crashing.
    const rejections: unknown[] = [];
    const watch = (reason: unknown): void => { rejections.push(reason); };
    process.on("unhandledRejection", watch);
    try {
      const runner = new CodeModeRunner({ confined: true, dispatch: async () => ({ ok: true, value: null }) });
      const outcome = await runner.run(`
        const { parentPort } = require("node:worker_threads");
        for (const junk of [null, 42, "junk", [], { kind: "call" }, { kind: "call", id: "x", name: "y" }, { kind: "invented" }]) {
          parentPort.postMessage(junk);
        }
        await new Promise((r) => setTimeout(r, 150));
        return "still-works";
      `);

      expect(outcome.ok).toBe(true);
      expect(outcome.value).toBe("still-works");
      await new Promise((r) => setTimeout(r, 100));
      expect(rejections, `host threw on junk: ${String(rejections[0])}`).toEqual([]);
    } finally {
      process.off("unhandledRejection", watch);
    }
  });
});

describe("the worker is a fault boundary, not a security one", () => {
  it("cannot be relied on to stop a program reaching the filesystem", async () => {
    // Recorded as a TEST rather than only as a comment, because it is the
    // single most important fact about this phase. If this ever starts
    // failing, a Node release has changed something fundamental and the
    // sandbox-is-the-boundary argument should be re-examined rather than
    // quietly assumed to have become unnecessary.
    const workspace = workdir();
    const marker = join(workspace, "bypassed.txt");
    const runner = new CodeModeRunner({ confined: true, dispatch: async () => ({ ok: true, value: null }) });

    const outcome = await runner.run(
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "bypassed the sdk"); return "wrote";`
    );

    expect(outcome.ok).toBe(true);
    expect(
      readFileSync(marker, "utf8"),
      "the tools binding is the intended path, never the only one — the sandbox is the boundary"
    ).toBe("bypassed the sdk");
  });
});
