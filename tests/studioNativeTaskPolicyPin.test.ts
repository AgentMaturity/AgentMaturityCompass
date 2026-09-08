import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { loadVerifiedToolsConfigSnapshot, signToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { toolhubAllowlistGuard } from "../src/tools/guards/policyGuards.js";
import { ToolPipeline, type ToolApprovalAnswer } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";

test("a new signed grant while approval is pending cannot widen a pinned native dispatch", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-studio-tool-pin-"));
  const prior = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "synthetic-tool-pin-vault";
  try {
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const path = join(root, ".amc", "tools.yaml");
    const configure = (scope: string) => {
      writeFileSync(path, YAML.stringify({ tools: { version: 1, denyByDefault: true, allowedTools: [{
        name: "fs.write", actionClass: "WRITE_LOW", allow: { paths: [scope] }, deny: { paths: ["**/.amc/**", "**/.git/**"] }
      }] } })); signToolsConfig(root);
    };
    configure("./safe/**");
    const pin = loadVerifiedToolsConfigSnapshot(root).digestSha256!;
    const registry = new ToolRegistry(); for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
    registry.guard("tool-allowlist", toolhubAllowlistGuard(root, undefined, pin));
    let allow!: (value: ToolApprovalAnswer) => void;
    const pending = new Promise<ToolApprovalAnswer>(resolveAnswer => { allow = resolveAnswer; });
    const pipeline = new ToolPipeline({ registry, workspace: root, approvalRequiredFor: new Set(["WRITE_LOW"]), approve: () => pending });
    const call = { name: "fs.write", agentId: "default", requestedMode: "EXECUTE" as const,
      arguments: { path: "expanded/effect.txt", content: "exact-native-effect" } };
    const result = pipeline.execute(call);
    expect(existsSync(join(root, "expanded", "effect.txt"))).toBe(false);
    configure("./expanded/**");
    expect(loadVerifiedToolsConfigSnapshot(root).digestSha256).not.toBe(pin);
    allow("allow");
    const refused = await result;
    expect(refused.denied).toMatchObject({ stage: "guard", guardLabel: "tool-allowlist" });
    expect(refused.denied?.reason).toContain("reviewed digest");
    expect(existsSync(join(root, "expanded", "effect.txt"))).toBe(false);
    // Legacy callers that did not request a scope pin continue to use current signed policy.
    const legacyRegistry = new ToolRegistry(); for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) legacyRegistry.define(tool);
    legacyRegistry.guard("tool-allowlist", toolhubAllowlistGuard(root));
    const legacy = new ToolPipeline({ registry: legacyRegistry, workspace: root });
    expect((await legacy.execute(call)).denied).toBeNull();
    expect(readFileSync(join(root, "expanded", "effect.txt"), "utf8")).toBe("exact-native-effect");
  } finally {
    lockVault(root); rmSync(root, { recursive: true, force: true });
    if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  }
});
