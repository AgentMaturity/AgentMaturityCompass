/** The first-use guide offers every provider the native route inventory admits, with honest credential semantics. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectNativeFirstUse, NATIVE_FIRST_USE_PROVIDERS } from "../src/setup/nativeFirstUseGuide.js";
import { OLLAMA_DEFAULT_BASE_URL } from "../src/llm/providers/ollamaContract.js";
import { discoverNativeProviders, nativeRouteFor } from "../src/cli-agent-options.js";

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
    for (const name of ["gemini-audio", "ollama", "deepseek", "groq", "lmstudio", "azure-openai"]) expect(unsupported.message).toContain(name);
    // The docstring's claim is an invariant: exactly the inventory agent-loop run and acp admit (pi-ai routes are run-only).
    expect([...NATIVE_FIRST_USE_PROVIDERS].sort()).toEqual(discoverNativeProviders().providers.map(entry => entry.providerId).sort());
  });

  // Opus completion (SH-PROVIDERS-01 on chat and the guide). Mutation checks: drop the compat spread from
  // NATIVE_FIRST_USE_PROVIDERS → the inventory assertion above fails; apply a default reference to an --base-url override →
  // the own-origin cases below fail; treat a non-loopback local server as credential-free → the lmstudio case fails.
  it("guides the OpenAI-compatible routes with the run's own credential and origin rules", async () => {
    const groq = await inspect({ provider: "groq", model: "llama" });
    expect(groq).toMatchObject({ status: "needs-credential", credential: { ref: "GROQ_API_KEY", configured: false }, baseUrl: null });
    const local = await inspect({ provider: "lmstudio", model: "qwen" });
    expect(local).toMatchObject({ status: "ready", credential: null });
    expect(local.message).toContain("http://127.0.0.1:1234");
    expect(local.nextAction?.argv).toEqual(expect.arrayContaining(["--provider", "lmstudio", "--model", "qwen"]));
    expect(local.nextAction?.argv).not.toContain("--credential");
    // The guide's ready command is a route agent-loop run accepts as written.
    const argv = local.nextAction!.argv, at = (flag: string) => argv[argv.indexOf(flag) + 1];
    expect(nativeRouteFor(at("--provider")!, {}, at("--model"))).toMatchObject({ providerId: "lmstudio", credentialRef: null });
    expect(await inspect({ provider: "lmstudio", model: "qwen", baseUrl: "https://lmstudio.example" }))
      .toMatchObject({ status: "blocked", code: "CREDENTIAL_REF_REQUIRED" });
    expect(await inspect({ provider: "azure-openai", model: "gpt" })).toMatchObject({ status: "blocked", code: "PROVIDER_ORIGIN_REQUIRED" });
    expect(await inspect({ provider: "azure-openai", model: "gpt", baseUrl: "https://res.openai.azure.com/openai" }))
      .toMatchObject({ status: "blocked", code: "CREDENTIAL_REF_REQUIRED", baseUrl: "https://res.openai.azure.com/openai" });
    const azure = await inspect({ provider: "azure-openai", model: "gpt", baseUrl: "https://res.openai.azure.com/openai/", credential: "AZURE_KEY" });
    expect(azure).toMatchObject({ status: "needs-credential", credential: { ref: "AZURE_KEY" }, baseUrl: "https://res.openai.azure.com/openai" });
    // A path stays refused where the route has none (it would be appended to a native path).
    expect(await inspect({ provider: "openai", model: "m", baseUrl: "https://proxy.example/v1" })).toMatchObject({ status: "blocked", code: "PROVIDER_ORIGIN_INVALID" });
  });

  it("never carries a default reference to an --base-url override, as agent-loop run refuses to", async () => {
    for (const [provider, baseUrl, ref] of [["openai", "https://proxy.example", "OPENAI_API_KEY"], ["groq", "https://proxy.example/openai", "GROQ_API_KEY"],
      ["anthropic", "http://127.0.0.1:43123", "ANTHROPIC_API_KEY"]] as const) {
      const guide = await inspect({ provider, model: "m", baseUrl });
      expect(guide).toMatchObject({ status: "blocked", code: "CREDENTIAL_REF_REQUIRED", credential: null });
      expect(guide.message).toContain(ref);
      expect(JSON.stringify(guide.nextAction ?? null) + JSON.stringify(guide.recheck)).not.toContain(ref);
      expect(() => nativeRouteFor(provider, { baseUrl }, "m")).toThrow(/--credential is required/);
      // An explicit reference is the operator's choice for that origin; the provider's own origin keeps its default.
      expect(await inspect({ provider, model: "m", baseUrl, credential: ref })).toMatchObject({ status: "needs-credential", credential: { ref } });
    }
    expect(await inspect({ provider: "groq", model: "m", baseUrl: "https://api.groq.com/openai" })).toMatchObject({ credential: { ref: "GROQ_API_KEY" } });
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
