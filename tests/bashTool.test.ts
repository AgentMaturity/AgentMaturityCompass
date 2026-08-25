import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { bashTool } from "../src/tools/builtin/bashTool.js";

/**
 * The shell tool is a thin body over the P4.2 substrate, and these tests are
 * about whether it actually inherits what the substrate provides — the
 * timeout, the tree kill, the byte cap, the scrub — rather than reimplementing
 * a weaker version of each.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function harness(scrubValues: readonly string[] = []): {
  workspace: string;
  run: (args: Record<string, unknown>, mode?: "EXECUTE" | "SIMULATE") => ReturnType<ToolPipeline["execute"]>;
} {
  const workspace = mkdtempSync(join(tmpdir(), "amc-bash-"));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  registry.define(bashTool({ scrubValues }));
  const pipeline = new ToolPipeline({ registry, workspace });
  return {
    workspace,
    run: (args, mode = "EXECUTE") =>
      pipeline.execute({ name: "bash", agentId: "alice", arguments: args, requestedMode: mode })
  };
}

describe("running a command", () => {
  it("returns stdout and the exit code", async () => {
    const h = harness();
    const outcome = await h.run({ command: "echo hello" });
    expect(outcome.output).toContain("hello");
    expect(outcome.exitCode).toBe(0);
  });

  it("returns stderr as well as stdout", async () => {
    const h = harness();
    const outcome = await h.run({ command: "echo out; echo err 1>&2" });
    expect(outcome.output).toContain("out");
    expect(outcome.output).toContain("err");
  });

  it("reports a non-zero exit without calling it a denial", async () => {
    // Policy permitted this; the program chose to fail. Conflating the two
    // would credit the guards with stopping something they allowed.
    const h = harness();
    const outcome = await h.run({ command: "exit 42" });
    expect(outcome.exitCode).toBe(42);
    expect(outcome.denied).toBeNull();
  });

  it("runs in the workspace directory", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "marker.txt"), "here");
    const outcome = await h.run({ command: "ls" });
    expect(outcome.output).toContain("marker.txt");
  });
});

describe("what it inherits from the substrate", () => {
  it("kills a command that outlives its timeout, and says so", async () => {
    const h = harness();
    const outcome = await h.run({ command: "sleep 30", timeoutMs: 300 });

    expect(outcome.timedOut, "orthogonal to the exit code, as everywhere else").toBe(true);
    expect(outcome.output).toContain("killed after 300ms");
  });

  it("kills the whole tree, not just the shell it started", async () => {
    // The property P4.2 was built for, reached through a tool. A grandchild
    // that survives is a process nothing can reach afterwards.
    const h = harness();
    const marker = join(h.workspace, "leaf.pid");
    await h.run({ command: `sleep 30 & echo $! > ${marker}; wait; :`, timeoutMs: 400 });

    expect(existsSync(marker), "the leaf started").toBe(true);
    const leaf = Number(readFileSync(marker, "utf8").trim());
    const alive = (): boolean => {
      try { process.kill(leaf, 0); return true; } catch { return false; }
    };
    const until = Date.now() + 3_000;
    while (alive() && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
    expect(alive(), "the grandchild outlives a kill aimed at the shell alone").toBe(false);
  });

  it("bounds output and reports how much it dropped", async () => {
    const h = harness();
    const outcome = await h.run({ command: "yes AAAAAAAAAA | head -c 200000" });

    expect(Buffer.byteLength(outcome.output, "utf8")).toBeLessThan(80_000);
    expect(outcome.output, "a silently truncated transcript is a lie about the run")
      .toContain("bytes of output not shown");
  });

  it("scrubs a known secret out of the command's output", async () => {
    const secret = "lease-abcdef0123456789";
    const h = harness([secret]);
    const outcome = await h.run({ command: `echo "token is ${secret}"` });

    expect(outcome.output).not.toContain(secret);
    expect(outcome.output).toContain("[amc:redacted]");
  });

  it("does not hand the shell AMC's own provider keys", async () => {
    const h = harness();
    const prior = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-must-not-reach-the-shell";
    try {
      const outcome = await h.run({ command: 'echo "[$ANTHROPIC_API_KEY]"' });
      expect(outcome.output, "a shell that can echo a key is a disclosure with extra steps")
        .not.toContain("must-not-reach-the-shell");
    } finally {
      if (prior === undefined) delete process.env["ANTHROPIC_API_KEY"];
      else process.env["ANTHROPIC_API_KEY"] = prior;
    }
  });
});

describe("simulation", () => {
  it("describes the command without running it", async () => {
    const h = harness();
    const outcome = await h.run({ command: `touch ${join(h.workspace, "created.txt")}` }, "SIMULATE");

    expect(outcome.output).toContain("SIMULATE");
    expect(existsSync(join(h.workspace, "created.txt")), "a simulated command must not act").toBe(false);
  });
});
