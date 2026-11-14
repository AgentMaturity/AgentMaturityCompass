import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providerWithKeyInEnv, resolveChatSetup, workspaceModelFamilies, type ChatSetupDeps } from "../src/setup/nativeChatSetup.js";
import { choiceLabel } from "../src/setup/nativeFirstUseGuide.js";
import type { NativeFirstUseGuide } from "../src/setup/nativeFirstUseGuide.js";

const guide = (status: NativeFirstUseGuide["status"], ref: string | null = null) => ({ status, credential: ref === null ? null : { ref } } as unknown as NativeFirstUseGuide);

function deps(over: Partial<ChatSetupDeps> & { answers?: string[] } = {}) {
  const answers = [...(over.answers ?? [])];
  const asked: string[] = [];
  const lines: string[] = [];
  const base: ChatSetupDeps = {
    env: {}, log: (line) => lines.push(line),
    ask: async (message) => { asked.push(message); return answers.shift() ?? null; },
    askSecret: vi.fn(async () => "sk-test-value-not-shown"),
    inspect: vi.fn(async () => guide("ready")),
    storeCredential: vi.fn(async () => "/home/x/.credentials.yaml"),
    modelFamilies: () => ["claude-*"]
  };
  return { deps: { ...base, ...over }, asked, lines };
}

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("chat setup never dead-ends on provider, model or key", () => {
  it("offers the provider whose key is in the environment as the default answer", async () => {
    expect(providerWithKeyInEnv({ ANTHROPIC_API_KEY: "x" })).toEqual({ provider: "anthropic", ref: "ANTHROPIC_API_KEY" });
    expect(providerWithKeyInEnv({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    const t = deps({ env: { ANTHROPIC_API_KEY: "x" }, answers: ["", "claude-test-model"] });
    const result = await resolveChatSetup({ workspace: "/ws" }, t.deps);
    expect(t.asked[0]).toBe("Provider [anthropic, ANTHROPIC_API_KEY is set]: ");
    expect(result?.provider).toBe("anthropic");
    expect(t.asked[1]).toContain("this workspace expects claude-* for anthropic");
    expect(result?.model).toBe("claude-test-model");
  });

  it("keeps the plain question when no key is set, and skips the model for stub", async () => {
    const t = deps({ answers: ["stub"] });
    const result = await resolveChatSetup({ workspace: "/ws" }, t.deps);
    expect(t.asked).toEqual(["Provider (no default): "]);
    expect(result?.provider).toBe("stub");
  });

  it("asks for a missing key masked, stores it, and continues with a fresh check", async () => {
    const inspect = vi.fn().mockResolvedValueOnce(guide("needs-credential", "ANTHROPIC_API_KEY")).mockResolvedValueOnce(guide("ready"));
    const t = deps({ inspect });
    const result = await resolveChatSetup({ workspace: "/ws", provider: "anthropic", model: "claude-x" }, t.deps);
    expect(t.deps.askSecret).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
    expect(t.deps.storeCredential).toHaveBeenCalledWith(expect.objectContaining({ ref: "ANTHROPIC_API_KEY", value: "sk-test-value-not-shown" }));
    expect(result?.guide.status).toBe("ready");
    expect(t.lines.join("\n")).not.toContain("sk-test-value-not-shown");
  });

  it("stops without storing when the key question is left empty or cancelled", async () => {
    const t = deps({ inspect: vi.fn(async () => guide("needs-credential", "OPENAI_API_KEY")), askSecret: vi.fn(async () => "") });
    const result = await resolveChatSetup({ workspace: "/ws", provider: "openai", model: "gpt-x" }, t.deps);
    expect(result?.guide.status).toBe("needs-credential");
    expect(t.deps.storeCredential).not.toHaveBeenCalled();
    const cancelled = deps({ inspect: vi.fn(async () => guide("needs-credential", "OPENAI_API_KEY")), askSecret: vi.fn(async () => null) });
    await expect(resolveChatSetup({ workspace: "/ws", provider: "openai", model: "gpt-x" }, cancelled.deps)).resolves.toBeNull();
    await expect(resolveChatSetup({ workspace: "/ws" }, deps().deps)).resolves.toBeNull();
  });

  it("reads model families from the workspace taxonomy (its default when the file is absent)", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-chat-setup-"));
    roots.push(ws);
    expect(workspaceModelFamilies(ws, "anthropic")).toEqual(["claude-*"]);
    expect(workspaceModelFamilies(ws, "lmstudio")).toContain("local-*");
    expect(workspaceModelFamilies(ws, "deepseek")).toEqual([]);
  });

  it("names the llama.cpp server once", () => {
    expect(choiceLabel("llamacpp")).not.toMatch(/server server/);
    expect(choiceLabel("llamacpp")).toContain("llama.cpp server");
  });
});
