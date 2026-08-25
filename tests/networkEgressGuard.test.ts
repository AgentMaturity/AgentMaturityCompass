import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig, signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { writeFileSync } from "node:fs";
import YAML from "yaml";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { networkEgressGuard } from "../src/tools/guards/policyGuards.js";

/**
 * Outbound network access is governed by what a tool IS, not by what it is
 * called.
 *
 * The trap: the signed allowlist reaches a call through `validateToolRequest`,
 * hard-keyed on the string "http.fetch". A second network tool under any other
 * name gets no host check from that path — so the allowlist looks like a
 * policy about network access and is actually a policy about one identifier.
 * These tests use a DIFFERENTLY NAMED tool on purpose.
 */
const PASS = "network-egress-guard-pass";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = prior ?? PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-egress-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initToolsConfig(dir);
  return dir;
}

/** Add a differently-named network tool to the SIGNED allowlist. */
function allowNamedTool(dir: string, name: string, hosts: string[]): void {
  const config = loadToolsConfig(dir);
  config.tools.allowedTools.push({
    name,
    actionClass: "NETWORK_EXTERNAL",
    allow: { hostAllowlist: hosts },
    denyByDefault: true
  } as (typeof config.tools.allowedTools)[number]);
  writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
  signToolsConfig(dir);
}

function pipelineWith(dir: string, toolName: string): ToolPipeline {
  const registry = new ToolRegistry();
  registry.define(defineTool({
    name: toolName,
    actionClass: "NETWORK_EXTERNAL",
    description: "fetches a url",
    body: () => ({ output: "FETCHED" })
  }));
  registry.guard("network-egress", networkEgressGuard(dir));
  return new ToolPipeline({ registry, workspace: dir });
}

const call = (name: string, url: unknown) => ({
  name, agentId: "default", arguments: url === undefined ? {} : { url }, requestedMode: "EXECUTE" as const
});

describe("egress is governed by actionClass, not by tool name", () => {
  it("governs a network tool that is NOT called http.fetch", async () => {
    const dir = workspace();
    allowNamedTool(dir, "web_fetch", ["api.github.com"]);

    const denied = await pipelineWith(dir, "web_fetch").execute(call("web_fetch", "https://evil.example.com/x"));
    expect(denied.ok, "a differently named network tool must still be checked").toBe(false);
    expect(denied.denied?.guardLabel).toBe("network-egress");
    expect(denied.denied?.reason).toContain("evil.example.com");
  });

  it("permits an allowlisted host for that same tool", async () => {
    const dir = workspace();
    allowNamedTool(dir, "web_fetch", ["api.github.com"]);
    const allowed = await pipelineWith(dir, "web_fetch").execute(call("web_fetch", "https://api.github.com/repos"));
    expect(allowed.ok, "the guard must not be a wall").toBe(true);
    expect(allowed.output).toBe("FETCHED");
  });

  it("denies a network tool the signed config does not name at all", async () => {
    // Registering a tool is not authorising its egress.
    const dir = workspace();
    const outcome = await pipelineWith(dir, "shadow_fetch").execute(call("shadow_fetch", "https://api.github.com/x"));
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.reason).toContain("ungoverned");
  });

  it("denies a network call whose destination cannot be determined", async () => {
    // A call with no url, or an unparseable one, cannot be checked against an
    // allowlist. "We could not tell where this was going" is not a reason to
    // let it go.
    const dir = workspace();
    allowNamedTool(dir, "web_fetch", ["api.github.com"]);
    const pipeline = pipelineWith(dir, "web_fetch");

    expect((await pipeline.execute(call("web_fetch", undefined))).denied?.reason).toContain("named no url");
    expect((await pipeline.execute(call("web_fetch", "not a url"))).denied?.reason).toContain("cannot be parsed");
  });

  it("leaves non-network tools alone", async () => {
    const dir = workspace();
    const registry = new ToolRegistry();
    registry.define(defineTool({
      name: "read_file", actionClass: "READ_ONLY", description: "reads",
      body: () => ({ output: "contents" })
    }));
    registry.guard("network-egress", networkEgressGuard(dir));

    const outcome = await new ToolPipeline({ registry, workspace: dir })
      .execute({ name: "read_file", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
    expect(outcome.ok, "a read tool has no egress to govern").toBe(true);
  });

  it("denies everything when the tools config cannot be verified", async () => {
    const dir = workspace();
    allowNamedTool(dir, "web_fetch", ["api.github.com"]);
    rmSync(join(dir, ".amc", "tools.yaml.sig"));

    const outcome = await pipelineWith(dir, "web_fetch").execute(call("web_fetch", "https://api.github.com/x"));
    expect(outcome.denied?.reason).toContain("not verifiable");
  });
});
