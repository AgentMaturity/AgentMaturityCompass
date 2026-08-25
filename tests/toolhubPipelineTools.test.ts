import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, toolsConfigSigPath } from "../src/toolhub/toolhubValidators.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolhubAllowlistGuard } from "../src/tools/guards/policyGuards.js";
import { toolhubPipelineTools } from "../src/tools/executors/toolhubTools.js";
import { defineTool } from "../src/tools/toolRegistry.js";

/**
 * Toolhub's executors on the pipeline, still governed by the signed allowlist.
 *
 * The point of these tests is that the port is not a downgrade. The path
 * globs, host allowlists and argv deny patterns in `tools.yaml` used to be
 * enforced inside the toolhub server; a pipeline tool calling the same
 * executor without them would look like a migration and be a hole.
 */
const PASS = "toolhub-pipeline-tools-pass";

async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-toolhub-pipe-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initToolsConfig(workspace);
  mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
  try {
    await fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

function pipelineFor(workspace: string): ToolPipeline {
  const registry = new ToolRegistry();
  for (const tool of toolhubPipelineTools()) registry.define(tool);
  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace));
  return new ToolPipeline({ registry, workspace });
}

const call = (name: string, args: Record<string, unknown>) => ({
  name, agentId: "default", arguments: args, requestedMode: "EXECUTE" as const
});

describe("ported toolhub executors keep their allowlist", () => {
  it("reads a permitted path and returns its bytes", async () => {
    await withWorkspace(async (workspace) => {
      writeFileSync(join(workspace, "workspace", "notes.txt"), "hello from the workspace");
      const outcome = await pipelineFor(workspace).execute(
        call("fs.read", { path: "workspace/notes.txt" })
      );
      expect(outcome.ok).toBe(true);
      expect(outcome.output).toBe("hello from the workspace");
    });
  });

  it("denies a read outside the signed path globs", async () => {
    await withWorkspace(async (workspace) => {
      writeFileSync(join(workspace, "secret.txt"), "not for the agent");
      const outcome = await pipelineFor(workspace).execute(
        call("fs.read", { path: "secret.txt" })
      );
      expect(outcome.ok, "the default allowlist covers ./workspace/** only").toBe(false);
      expect(outcome.denied?.guardLabel).toBe("tool-allowlist");
    });
  });

  it("denies a write into .amc, which the deny globs name explicitly", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(
        call("fs.write", { path: ".amc/budgets.yaml", content: "tampered" })
      );
      expect(outcome.denied?.guardLabel).toBe("tool-allowlist");
      expect(
        readFileSync(join(workspace, ".amc", "budgets.yaml"), "utf8"),
        "the denial must happen before the body, not after"
      ).not.toContain("tampered");
    });
  });

  it("writes where the allowlist permits", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(
        call("fs.write", { path: "workspace/output/report.txt", content: "generated" })
      );
      expect(outcome.ok).toBe(true);
      expect(readFileSync(join(workspace, "workspace", "output", "report.txt"), "utf8")).toBe("generated");
    });
  });

  it("denies a binary outside the signed allowlist", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(
        call("process.spawn", { binary: "curl", argv: ["https://example.com"] })
      );
      expect(outcome.denied?.guardLabel).toBe("tool-allowlist");
    });
  });

  it("denies argv matching a deny pattern even for an allowed binary", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(
        call("process.spawn", { binary: "node", argv: ["-e", "rm -rf /"] })
      );
      expect(outcome.ok, "the binary is allowed; the arguments are not").toBe(false);
      expect(outcome.denied?.reason).toContain("deny pattern");
    });
  });

  it("keeps an exit code as an exit code and never as a denial", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(
        call("process.spawn", { binary: "node", argv: ["-e", "process.exit(3)"] })
      );
      expect(outcome.denied, "policy permitted this; the program chose to fail").toBeNull();
      expect(outcome.exitCode).toBe(3);
      expect(outcome.timedOut).toBe(false);
    });
  });

  it("simulates without touching the filesystem", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute({
        ...call("fs.write", { path: "workspace/output/sim.txt", content: "should not exist" }),
        requestedMode: "SIMULATE"
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.output).toContain("SIMULATE");
      expect(
        () => readFileSync(join(workspace, "workspace", "output", "sim.txt")),
        "a simulated write must not write"
      ).toThrow();
    });
  });

  it("reports a malformed argument as a failure, not as a policy denial", async () => {
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineFor(workspace).execute(call("fs.read", { path: "" }));
      expect(outcome.ok).toBe(false);
      // Either layer may catch it first, but it must never be credited to a
      // guard as though policy stopped an attack.
      if (outcome.denied !== null) {
        expect(outcome.denied.reason).toContain("path is required");
      }
    });
  });
});

describe("the signed allowlist governs which tools may run at all", () => {
  it("denies a registered tool that the signed config does not name", async () => {
    // A tool can be composed into the registry by any plugin. The signed
    // config is what says it may RUN — otherwise registering a tool would be
    // the same as authorising it, and the allowlist would only cover the
    // arguments of tools it already knew about.
    await withWorkspace(async (workspace) => {
      const registry = new ToolRegistry();
      registry.define(defineTool({
        name: "shadow.exfiltrate",
        actionClass: "DATA_EXPORT",
        description: "not in tools.yaml",
        body: () => ({ output: "sent" })
      }));
      registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace));
      const outcome = await new ToolPipeline({ registry, workspace })
        .execute(call("shadow.exfiltrate", {}));

      expect(outcome.ok).toBe(false);
      expect(outcome.denied?.reason).toContain("not in the signed tool allowlist");
    });
  });

  it("denies everything when the tools config signature is gone", async () => {
    // An unverifiable allowlist is not an empty one, and it is certainly not
    // an absent one. Deleting a .sig must never widen what may run.
    await withWorkspace(async (workspace) => {
      writeFileSync(join(workspace, "workspace", "notes.txt"), "readable");
      const pipeline = pipelineFor(workspace);
      expect((await pipeline.execute(call("fs.read", { path: "workspace/notes.txt" }))).ok).toBe(true);

      unlinkSync(toolsConfigSigPath(workspace));

      const outcome = await pipelineFor(workspace).execute(call("fs.read", { path: "workspace/notes.txt" }));
      expect(outcome.ok).toBe(false);
      expect(outcome.denied?.reason).toContain("not verifiable");
    });
  });
});

describe("http.fetch keeps HTTP facts out of process fields", () => {
  it("reports a 404 as a body and status, never as an exit code", async () => {
    // An HTTP status is not an exit status. Mapping one onto the other makes a
    // 404 read as a process that exited 404 — and 200 read as a clean exit,
    // which is worse, because 0 is the exit code that means success.
    const server = createServer((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no such page");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      await withWorkspace(async (workspace) => {
        // No allowlist guard here: the default host allowlist does not include
        // localhost, and the property under test is the outcome shape.
        const registry = new ToolRegistry();
        for (const tool of toolhubPipelineTools()) registry.define(tool);
        const outcome = await new ToolPipeline({ registry, workspace })
          .execute(call("http.fetch", { url: `http://127.0.0.1:${port}/missing` }));

        expect(outcome.ok).toBe(true);
        expect(outcome.output).toBe("no such page");
        expect(outcome.exitCode, "an HTTP status is not an exit code").toBeNull();
      });
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
