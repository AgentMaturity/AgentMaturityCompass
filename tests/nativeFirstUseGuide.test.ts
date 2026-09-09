import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import * as credentialWatcher from "../src/credentials/credentialsWatcher.js";
import { inspectNativeFirstUse, renderNativeFirstUseGuide, renderNativeGuideCommand, type NativeFirstUseOptions } from "../src/setup/nativeFirstUseGuide.js";

const SECRET = "synthetic-guide-value-never-render";
function snapshot(root: string): unknown {
  const stat = fs.lstatSync(root);
  return {
    mode: stat.mode, mtime: stat.mtimeMs,
    ...(stat.isDirectory()
      ? { children: fs.readdirSync(root).sort().map(name => [name, snapshot(join(root, name))]) }
      : { sha256: createHash("sha256").update(fs.readFileSync(root)).digest("hex") })
  };
}

describe("native first-use local inspection", () => {
  let root: string;
  let workspace: string;
  let home: string;
  let userEnvPath: string;
  beforeEach(() => {
    root = fs.mkdtempSync(join(tmpdir(), "amc-native-guide-"));
    workspace = join(root, "workspace");
    home = join(root, "absent-home");
    userEnvPath = join(root, "user.env");
    fs.mkdirSync(workspace);
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const input = (extra: Partial<NativeFirstUseOptions> = {}): NativeFirstUseOptions => ({
    workspace, credentialsHome: home, userEnvPath, env: {}, provider: "openai", model: "operator-model", ...extra
  });
  function workspaceMarker() {
    fs.mkdirSync(join(workspace, ".amc"));
    fs.writeFileSync(join(workspace, ".amc", "amc.config.yaml"), "profile: dev\n");
  }
  function ownedStore(raw = `OPENAI_API_KEY: ${SECRET}\n`, mode = 0o600, dirMode = 0o700) {
    fs.mkdirSync(home, { mode: dirMode });
    fs.writeFileSync(join(home, ".credentials.yaml"), raw, { mode });
    // Host umask must not turn an intentionally unsafe fixture into a safe store.
    fs.chmodSync(home, dirMode);
    fs.chmodSync(join(home, ".credentials.yaml"), mode);
  }
  async function inspect(extra: Partial<NativeFirstUseOptions> = {}) {
    const before = snapshot(root);
    const result = await inspectNativeFirstUse(input(extra));
    expect(snapshot(root)).toEqual(before);
    expect(JSON.stringify(result) + renderNativeFirstUseGuide(result)).not.toContain(SECRET);
    expect(result.boundary).toContain("No provider authentication");
    expect(result.agentId).toBe("default");
    return result;
  }

  it("pins a custom provider origin through every real-provider action without contacting it", async () => {
    workspaceMarker(); ownedStore();
    const ready = await inspect({ baseUrl: "http://127.0.0.1:43123/" });
    expect(ready.baseUrl).toBe("http://127.0.0.1:43123");
    for (const action of [ready.nextAction, ready.recheck]) expect(action?.argv).toEqual(expect.arrayContaining(["--base-url", "http://127.0.0.1:43123"]));
    const choices = await inspect({ provider: undefined, baseUrl: "https://models.example" });
    expect(choices.choices.filter(choice => choice.provider !== "stub").every(choice => choice.action.argv.includes("https://models.example"))).toBe(true);
  });
  it("retains explicit home, file, model and reference when the provider is chosen later", async () => {
    const file = join(root, "separate store", "selected.yaml");
    const model = "chosen'model;$(never-execute)";
    const result = await inspect({ provider: undefined, model, credential: "CHOSEN_API_KEY", credentialsFile: file, baseUrl: "https://models.example" });
    expect(result.status).toBe("choose-provider");
    expect(result.nextAction).toBeNull();
    for (const choice of result.choices) {
      expect(choice.action.cwd).toBe(workspace);
      expect(choice.action.argv).toEqual(expect.arrayContaining(["--credentials-home", home, "--credentials-file", file]));
      if (choice.provider === "stub") {
        expect(choice.action.argv).not.toContain("--model");
        expect(choice.action.argv).not.toContain("--credential");
        expect(choice.action.argv).not.toContain("--base-url");
      } else {
        expect(choice.action.argv).toEqual(expect.arrayContaining(["--model", model, "--credential", "CHOSEN_API_KEY", "--base-url", "https://models.example"]));
      }
    }
    expect(fs.existsSync(home)).toBe(false);
  });
  it("keeps the explicit shared home independently of the pinned ready-run credential file", async () => {
    workspaceMarker(); ownedStore();
    const elsewhere = join(root, "separate store");
    fs.mkdirSync(elsewhere, { mode: 0o700 });
    const file = join(elsewhere, "selected.yaml");
    fs.writeFileSync(file, `OPENAI_API_KEY: ${SECRET}\n`, { mode: 0o600 });
    const result = await inspect({ credentialsFile: file });
    expect(result.status).toBe("ready");
    for (const action of [result.nextAction, result.recheck]) {
      expect(action?.argv).toEqual(expect.arrayContaining(["--credentials-home", home, "--credentials-file", file]));
    }
    expect(result.nextAction?.argv.filter(value => value === "--credentials-home")).toHaveLength(1);
  });
  it("does not invent a shared skill home from an explicit credential file", async () => {
    workspaceMarker(); ownedStore();
    const result = await inspect({ credentialsHome: undefined, credentialsFile: join(home, ".credentials.yaml") });
    expect(result.status).toBe("ready");
    expect(result.nextAction?.argv).not.toContain("--credentials-home");
    expect(result.recheck?.argv).not.toContain("--credentials-home");
  });
  it("validates a supplied reference before copying it into provider choices", async () => {
    const result = await inspect({ provider: undefined, credential: SECRET });
    expect(result.code).toBe("AMC_CREDENTIAL_REF_INVALID");
    expect(result.choices).toEqual([]);
    expect(result.nextAction).toBeNull();
  });
  it.each([
    { model: "model\ncontrol" },
    { credentialsHome: "home\u001bcontrol" },
    { credentialsFile: "file\rcontrol" }
  ])("does not publish provider-choice argv containing terminal controls: %j", async extra => {
    const result = await inspect({ provider: undefined, ...extra });
    expect(result.code).toBe("ARGUMENT_INVALID");
    expect(result.choices).toEqual([]);
    expect(result.nextAction).toBeNull();
  });
  it.each(["https://user:secret@example.test", "https://example.test/v1", "https://example.test?key=secret", "https://example.test#secret", "file:///tmp/model", "https://exa\nmple.test"])("withholds invalid provider origins from actionable commands: %s", async baseUrl => {
    const result = await inspect({ baseUrl });
    expect(result.code).toBe("PROVIDER_ORIGIN_INVALID");
    expect(result.nextAction).toBeNull(); expect(result.recheck).toBeNull(); expect(result.choices).toEqual([]);
    expect(result.baseUrl).toBeNull();
    expect(JSON.stringify(result)).not.toContain(baseUrl);
  });

  it("pins an explicit identity in choices, recheck and the bounded run without writes", async () => {
    workspaceMarker(); ownedStore();
    fs.writeFileSync(join(workspace, ".amc", "current-agent"), "background\n");
    const before = snapshot(root);
    const guide = await inspectNativeFirstUse(input({ agentId: "Reviewer", provider: undefined }));
    expect(guide.agentId).toBe("reviewer");
    expect(guide.choices.every(choice => choice.action.argv.slice(0, 4).join(" ") === "amc --agent reviewer agent-loop")).toBe(true);
    const ready = await inspectNativeFirstUse(input({ agentId: "Reviewer" }));
    expect(ready.status).toBe("ready");
    expect(ready.recheck?.argv.slice(0, 5)).toEqual(["amc", "--agent", "reviewer", "agent-loop", "guide"]);
    expect(ready.nextAction?.argv.slice(0, 5)).toEqual(["amc", "--agent", "reviewer", "agent-loop", "run"]);
    expect(snapshot(root)).toEqual(before);
  });
  it("resolves the current workspace agent and reports an unreadable selector without writes", async () => {
    workspaceMarker();
    const previous = process.env.AMC_AGENT_ID;
    delete process.env.AMC_AGENT_ID;
    try {
      const selected = join(workspace, ".amc", "current-agent");
      fs.writeFileSync(selected, "reviewer\n");
      expect((await inspectNativeFirstUse(input())).agentId).toBe("reviewer");
      process.env.AMC_AGENT_ID = "environment-agent";
      expect((await inspectNativeFirstUse(input())).agentId).toBe("environment-agent");
      delete process.env.AMC_AGENT_ID;
      fs.unlinkSync(selected); fs.mkdirSync(selected);
      const before = snapshot(root);
      expect((await inspectNativeFirstUse(input())).code).toBe("AGENT_SELECTION_INVALID");
      expect(snapshot(root)).toEqual(before);
    } finally {
      if (previous === undefined) delete process.env.AMC_AGENT_ID; else process.env.AMC_AGENT_ID = previous;
    }
  });

  it("recommends explicit minimal setup without creating even a credentials home", async () => {
    const result = await inspect();
    expect(result.status).toBe("needs-setup");
    expect(result.nextAction).toEqual({ cwd: workspace, argv: ["amc", "init", "--minimal"] });
    expect(fs.existsSync(home)).toBe(false);
  });
  it("does not recommend overwriting an incomplete existing workspace", async () => {
    fs.mkdirSync(join(workspace, ".amc"));
    const result = await inspect();
    expect(result.code).toBe("WORKSPACE_INCOMPLETE");
    expect(result.nextAction?.argv).toEqual(["amc", "doctor"]);
  });
  it("requires a chosen live model without emitting a placeholder run", async () => {
    workspaceMarker(); ownedStore();
    const result = await inspect({ model: undefined });
    expect(result.status).toBe("needs-model");
    expect(result.nextAction).toBeNull();
    expect(result.credential?.configured).toBe(true);
  });
  it("offers the existing masked credential command, with the same file and project", async () => {
    workspaceMarker();
    const result = await inspect();
    expect(result.status).toBe("needs-credential");
    expect(result.nextAction?.argv).toEqual(["amc", "credentials", "set", "OPENAI_API_KEY", "--home", home, "--file", join(home, ".credentials.yaml"), "--project-dir", workspace]);
  });
  it.each(["file", "env", "project-env", "user-env"] as const)("honors the native %s credential layer without revealing its value", async layer => {
    workspaceMarker();
    if (layer === "file") ownedStore();
    if (layer === "project-env") fs.writeFileSync(join(workspace, ".env"), `OPENAI_API_KEY=${SECRET}\n`);
    if (layer === "user-env") fs.writeFileSync(userEnvPath, `OPENAI_API_KEY=${SECRET}\n`);
    const result = await inspect({ env: layer === "env" ? { OPENAI_API_KEY: SECRET } : {} });
    expect(result.status).toBe("ready");
    expect(result.credential?.source).toBe(layer);
    expect(result.credential?.writable).toBe(layer !== "env");
    expect(result.nextAction?.argv).toEqual(expect.arrayContaining(["--provider", "openai", "--model", "operator-model", "--tools", "none", "--max-steps", "1", "--max-tokens", "512"]));
  });
  it("pins the inspected file override in the next action and respects environment precedence", async () => {
    workspaceMarker(); ownedStore();
    const explicit = join(home, "other.yaml");
    fs.writeFileSync(explicit, `ANTHROPIC_API_KEY: ${SECRET}\n`, { mode: 0o600 });
    const result = await inspect({ provider: "anthropic", credentialsFile: explicit, env: { AMC_CREDENTIALS_FILE: join(home, "unused.yaml"), ANTHROPIC_API_KEY: SECRET } });
    expect(result.status).toBe("ready");
    expect(result.credential?.source).toBe("env");
    expect(result.nextAction?.argv).toEqual(expect.arrayContaining(["--credentials-file", explicit, "--credential", "ANTHROPIC_API_KEY"]));
  });
  it("does not let a home override defeat AMC_CREDENTIALS_FILE", async () => {
    workspaceMarker(); ownedStore();
    const selected = join(home, "selected.yaml");
    const result = await inspect({ env: { AMC_CREDENTIALS_FILE: selected } });
    expect(result.status).toBe("needs-credential");
    expect(result.nextAction?.argv).toEqual(expect.arrayContaining(["--file", selected]));
  });
  it("does not let an environment credential hide an invalid owned store", async () => {
    workspaceMarker(); ownedStore(`OPENAI_API_KEY: [${SECRET}\n`);
    const result = await inspect({ env: { OPENAI_API_KEY: SECRET } });
    expect(result.status).toBe("blocked");
    expect(result.code).toBe("AMC_CREDENTIAL_FILE_UNPARSABLE");
    expect(result.nextAction).toBeNull();
  });
  it.skipIf(process.platform === "win32")("prints a safely quoted corrective action without repairing permissions", async () => {
    workspaceMarker(); home = join(root, "home with 'quote';$(never-execute)"); ownedStore(undefined, 0o644);
    const result = await inspect();
    expect(result.code).toBe("AMC_CREDENTIAL_FILE_PERMISSIONS");
    expect(result.nextAction?.argv).toEqual(["chmod", "600", join(home, ".credentials.yaml")]);
    expect(renderNativeGuideCommand(result.nextAction!)).toContain("'\\''");
  });
  it.skipIf(process.platform === "win32")("blocks an insecure empty credentials directory", async () => {
    workspaceMarker(); fs.mkdirSync(home, { mode: 0o755 });
    fs.chmodSync(home, 0o755);
    const result = await inspect();
    expect(result.code).toBe("AMC_CREDENTIAL_FILE_PERMISSIONS");
    expect(result.nextAction?.argv).toEqual(["chmod", "700", home]);
  });
  it("labels a stub recipe as a recording demonstration and still checks its store", async () => {
    workspaceMarker();
    const demo = await inspect({ provider: "stub", model: undefined });
    expect(demo.status).toBe("ready");
    expect(demo.credential).toBeNull();
    expect(demo.message).toContain("not a real model answer");
    expect(demo.nextAction?.argv).toEqual(expect.arrayContaining(["--provider", "stub", "--model", "amc-stub-1", "--tools", "echo", "--max-steps", "2"]));
    ownedStore(`OPENAI_API_KEY: [${SECRET}\n`);
    expect((await inspect({ provider: "stub", model: undefined })).status).toBe("blocked");
  });
  it("withholds an invalid credential input and never falls back from an unsupported provider", async () => {
    expect((await inspect({ credential: SECRET })).code).toBe("AMC_CREDENTIAL_REF_INVALID");
    const unsupported = await inspect({ provider: "unsupported" });
    expect(unsupported.status).toBe("blocked");
    expect(unsupported.nextAction).toBeNull();
  });
  it("leaves watches, resolution, mutation and providers unused and closes the metadata store", async () => {
    workspaceMarker(); ownedStore();
    const methods = ["resolve", "set", "unset", "reload"] as const;
    const spies = methods.map(method => vi.spyOn(LocalCredentialsService.prototype, method).mockImplementation(() => { throw new Error(`Unexpected ${method}`); }));
    const watcher = vi.spyOn(credentialWatcher, "watchCredentialsFile").mockImplementation(() => { throw new Error("Unexpected watch"); });
    const provider = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Unexpected provider call"); });
    const closed = vi.spyOn(LocalCredentialsService.prototype, "close");
    expect((await inspect()).status).toBe("ready");
    for (const spy of [...spies, watcher, provider]) expect(spy).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });
  it("preserves a model containing shell metacharacters as one quoted argv value", async () => {
    workspaceMarker(); ownedStore();
    const model = "chosen'model;$(never-execute)";
    const result = await inspect({ model });
    const argv = result.nextAction!.argv;
    expect(argv[argv.indexOf("--model") + 1]).toBe(model);
    expect(renderNativeGuideCommand(result.nextAction!)).toContain("'chosen'\\''model;$(never-execute)'");
  });
});
