/** The first-use guide offers every provider the native route inventory admits, with honest credential semantics. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectNativeFirstUse, NATIVE_FIRST_USE_PROVIDERS } from "../src/setup/nativeFirstUseGuide.js";
import { OLLAMA_DEFAULT_BASE_URL } from "../src/llm/providers/ollamaContract.js";

describe("native first-use guide provider coverage", () => {
  let root: string, workspace: string, home: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "amc-guide-providers-"));
    workspace = join(root, "workspace"); home = join(root, "home");
    mkdirSync(join(workspace, ".amc"), { recursive: true }); mkdirSync(home, { mode: 0o700 });
    writeFileSync(join(workspace, ".amc", "amc.config.yaml"), "profile: dev\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const inspect = (extra: Record<string, unknown>) => inspectNativeFirstUse({ workspace, credentialsHome: home, userEnvPath: join(root, "user.env"), env: {}, ...extra });

  it("offers the same providers the native CLI/ACP route inventory admits", async () => {
    const guide = await inspect({ provider: undefined });
    expect(guide.status).toBe("choose-provider");
    expect(guide.choices.map(choice => choice.provider)).toEqual([...NATIVE_FIRST_USE_PROVIDERS]);
    expect(NATIVE_FIRST_USE_PROVIDERS).toEqual(expect.arrayContaining(["gemini", "gemini-audio", "ollama", "deepseek"]));
    const unsupported = await inspect({ provider: "not-a-provider" });
    expect(unsupported).toMatchObject({ status: "blocked", code: "PROVIDER_UNSUPPORTED" });
    for (const name of ["gemini-audio", "ollama", "deepseek"]) expect(unsupported.message).toContain(name);
  });

  it("maps Gemini to GEMINI_API_KEY and asks for it before any run", async () => {
    for (const provider of ["gemini", "gemini-audio"] as const) {
      const guide = await inspect({ provider, model: "gemini-model" });
      expect(guide).toMatchObject({ status: "needs-credential", code: "CREDENTIAL_MISSING", provider, credential: { ref: "GEMINI_API_KEY", configured: false } });
      expect(guide.nextAction?.argv.slice(0, 4)).toEqual(["amc", "credentials", "set", "GEMINI_API_KEY"]);
    }
  });

  it("treats ollama as a local model server: model required, no credential assumed, origin named", async () => {
    expect(await inspect({ provider: "ollama" })).toMatchObject({ status: "needs-model", code: "MODEL_REQUIRED", provider: "ollama", credential: null });
    const ready = await inspect({ provider: "ollama", model: "local-model" });
    expect(ready).toMatchObject({ status: "ready", code: "LOCAL_CONFIGURATION_PRESENT", credential: null });
    expect(ready.message).toContain(OLLAMA_DEFAULT_BASE_URL);
    expect(ready.nextAction?.argv).toEqual(expect.arrayContaining(["--provider", "ollama", "--model", "local-model", "--tools", "none"]));
    expect(ready.nextAction?.argv).not.toContain("--credential");
    // An explicit reference for an authenticated origin is retained, never invented.
    const authenticated = await inspect({ provider: "ollama", model: "local-model", credential: "OLLAMA_TOKEN", baseUrl: "https://ollama.example" });
    expect(authenticated).toMatchObject({ status: "needs-credential", credential: { ref: "OLLAMA_TOKEN", configured: false }, baseUrl: "https://ollama.example" });
  });
});
