import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * P1-40: `amc init --coding` and `amc init --regulated`. The platform and both shell backends are pinned where the
 * shell decision is asserted, so those rows do not depend on the host (as tests/nativeShellComposition.test.ts does).
 */
const backend = vi.hoisted(() => ({ bwrap: { ok: true } as { ok: true } | { ok: false; reason: string },
  seatbelt: { ok: true } as { ok: true } | { ok: false; reason: string } }));
vi.mock("../src/sandbox/bwrapBackend.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/sandbox/bwrapBackend.js")>()),
  bwrapBackend: () => ({ kind: "bwrap", available: () => backend.bwrap, run: vi.fn() })
}));
vi.mock("../src/sandbox/seatbeltNativeShell.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/sandbox/seatbeltNativeShell.js")>()),
  seatbeltNativeShell: () => ({ kind: "seatbelt", available: () => backend.seatbelt, run: vi.fn() })
}));

import { checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { verifyApprovalPolicySignature } from "../src/approvals/approvalPolicyEngine.js";
import { activeUserRecord } from "../src/auth/authApi.js";
import { verifyBudgetsConfigSignature } from "../src/budgets/budgets.js";
import { activeControlPlan } from "../src/catalog/compiler/activate.js";
import { assertSignedPlan } from "../src/catalog/compiler/sign.js";
import { loadCatalog } from "../src/catalog/loader.js";
import { verifyAmcConfigSignature } from "../src/config/amcConfigSignature.js";
import { readPresets, resolvePreset } from "../src/presets/agentPresets.js";
import { inspectRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { applyStarterProfile, runStarterInit, starterProfileFlag } from "../src/setup/starterProfiles.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { lockVault } from "../src/vault/vault.js";
import { freePort } from "./helpers/piHookFixtures.js";
import { initWorkspace, loadAMCConfig } from "../src/workspace.js";

const OWNER = { username: "starter-owner", password: "starter-owner-password" };
const PASSPHRASE = "starter-profile-passphrase";
const CLI = resolve("dist/cli.js");
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const dirs: string[] = [];

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  backend.bwrap = { ok: true };
  backend.seatbelt = { ok: true };
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) {
    try { lockVault(dir); } catch { /* not a workspace */ }
    rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

/** An empty directory with the operator's passphrase and a control checkpoint root outside it. */
function emptyDir(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(tempDir("amc-starter-ckpt-"), "checkpoints"));
  return tempDir("amc-starter-");
}

function workspace(): string {
  const root = emptyDir();
  initWorkspace({ workspacePath: root });
  return root;
}

function bash(ws: string) {
  return loadVerifiedToolsConfigSnapshot(ws).config?.tools.allowedTools.find((tool) => tool.name === "bash");
}

describe("amc init --coding (P1-40)", () => {
  it("signs fs.read, fs.write, fs.edit and a contained bash with no egress, a warn firewall, profile dev and an active owner", () => {
    const ws = workspace();
    const report = applyStarterProfile(ws, "coding", OWNER);

    const tools = loadVerifiedToolsConfigSnapshot(ws);
    expect(tools.signatureValid).toBe(true);
    expect(tools.config?.tools.allowedTools.map((tool) => tool.name)).toEqual(["fs.read", "fs.write", "fs.edit", "bash"]);
    expect(bash(ws)?.nativeSandbox).toEqual({ kind: "os-native", writableDirectories: ["."] });
    const text = readFileSync(join(ws, ".amc", "tools.yaml"), "utf8");
    expect(text).toContain("#       egress: { allowHosts: [registry.npmjs.org, pypi.org, files.pythonhosted.org] }");
    expect(text).toContain("# then run: amc tools sign");

    const firewall = inspectRuntimeFirewallPolicy(ws);
    expect([firewall.integrity, firewall.policy?.mode]).toEqual(["trusted", "warn"]);
    expect(loadAMCConfig(ws).profile).toBe("dev");
    expect(verifyAmcConfigSignature(ws).valid, "saveAMCConfig was followed by a re-sign").toBe(true);
    expect(verifyBudgetsConfigSignature(ws).valid).toBe(true);
    expect(activeUserRecord(ws, report.owner.userId)?.roles).toEqual(["OWNER"]);
    const presets = readPresets(ws);
    expect(presets.ok && presets.presets.length).toBe(0);
    expect(report.plan).toBeNull();
    expect(report.readiness.ready, report.readiness.blockers.join("; ")).toBe(true);
    expect(report.nextCommand).toBe('amc agent-loop run "..." --provider stub --tools workspace');
    expect(report.monitorFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([["linux", "linux-bwrap"], ["darwin", "macos-seatbelt"]] as const)("offers bash confined on %s", (os, boundary) => {
    const ws = workspace();
    applyStarterProfile(ws, "coding", OWNER);
    Object.defineProperty(process, "platform", { ...platform, value: os });
    expect(checkToolsetReadiness(ws).shell).toMatchObject({ offered: true, enforcement: "enforced", boundary });
  });

  it("never replaces an existing users.yaml", () => {
    const ws = workspace();
    const first = applyStarterProfile(ws, "coding", OWNER);
    expect(() => applyStarterProfile(ws, "regulated", { username: "intruder", password: "intruder-password" })).toThrow("users.yaml exists");
    expect(activeUserRecord(ws, first.owner.userId)?.username).toBe(OWNER.username);
    expect(inspectRuntimeFirewallPolicy(ws).policy?.mode, "nothing was rewritten").toBe("warn");
  });

  it("reports the broken signature when tools.yaml is edited after init without re-signing", () => {
    const ws = workspace();
    applyStarterProfile(ws, "coding", OWNER);
    appendFileSync(join(ws, ".amc", "tools.yaml"), "# edited after signing\n");
    const readiness = checkToolsetReadiness(ws);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join("\n")).toContain("tool allowlist is not verifiable");
  });
});

describe("amc init --regulated (P1-40)", () => {
  it("blocks at the firewall, signs the regulated approval preset, isolates the config and leaves egress denied", () => {
    const ws = workspace();
    const report = applyStarterProfile(ws, "regulated", OWNER);

    expect(inspectRuntimeFirewallPolicy(ws).policy?.mode).toBe("block");
    const preset = resolvePreset(ws, "regulated");
    expect(preset.ok && preset.preset).toMatchObject({ approveTools: "WRITE_HIGH", tools: "workspace", providerId: "stub" });
    expect(verifyApprovalPolicySignature(ws).valid).toBe(true);
    const config = loadAMCConfig(ws);
    expect([config.profile, config.security.trustBoundaryMode]).toEqual(["prod", "isolated"]);
    expect(verifyAmcConfigSignature(ws).valid).toBe(true);
    expect(bash(ws)?.nativeSandbox).toEqual({ kind: "os-native", writableDirectories: ["."] });
    expect(bash(ws)?.nativeSandbox?.egress, "deny-by-default egress").toBeUndefined();
    expect(activeUserRecord(ws, report.owner.userId)).not.toBeNull();
    expect(report.readiness.ready, report.readiness.blockers.join("; ")).toBe(true);
    expect(report.nextCommand).toBe('amc agent-loop run "..." --provider stub --tools workspace --preset regulated');
  });

  it("compiles and signs a Layer 0 plan, names the facts it waits for and activates nothing", () => {
    const ws = workspace();
    const { plan } = applyStarterProfile(ws, "regulated", OWNER);
    expect(plan?.status, "no deployment fact is guessed, so the plan waits for them").toBe("blocked");
    const compiled = JSON.parse(readFileSync(join(plan!.outDir, "plan.json"), "utf8"));
    const signature = JSON.parse(readFileSync(join(plan!.outDir, "plan.sig.json"), "utf8")).signature;
    expect(() => assertSignedPlan(ws, { plan: compiled, signature })).not.toThrow();
    const layer0 = [...loadCatalog().controls.keys()].filter((id) => id.startsWith("L0-")).sort();
    expect(layer0.length).toBeGreaterThan(0);
    expect(compiled.requirements.map((r: { controlId: string }) => r.controlId).sort()).toEqual(expect.arrayContaining(layer0));
    expect(plan!.unresolved.length).toBeGreaterThan(0);
    // Layer 0 waits for useCases and jurisdictions. Wealth adds stations because an unknown station may include
    // wealth; Technology also waits for domains (P2-30), and Governance adds dataClasses, entityTypes and roles (P3-14).
    const facts = new Set(plan!.unresolved.flatMap((r) => r.missingFacts));
    expect(facts).toEqual(new Set(["useCases", "jurisdictions", "stations", "domains", "dataClasses", "entityTypes", "roles"]));
    // The SDK page names exactly the facts this plan waits for.
    const page = readFileSync(join(import.meta.dirname, "..", "docs", "sdk", "TYPESCRIPT_SDK.md"), "utf8").replace(/\s+/g, " ");
    const stated = /plan stays blocked until you state (.+?) in the profile/.exec(page)?.[1] ?? "";
    expect(new Set([...stated.matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1]))).toEqual(facts);
    expect(existsSync(plan!.profilePath)).toBe(true);
    expect(activeControlPlan(ws), "activation needs stated facts and two other approvers").toBeNull();
  });
});

describe("init flag refusals (P1-40)", () => {
  it("refuses combinations before anything is written", () => {
    expect(starterProfileFlag({})).toBeNull();
    expect(starterProfileFlag({ coding: true })).toBe("coding");
    expect(() => starterProfileFlag({ coding: true, regulated: true })).toThrow("--coding and --regulated are mutually exclusive.");
    expect(() => starterProfileFlag({ regulated: true, minimal: true })).toThrow("--regulated cannot be combined with --minimal.");
    expect(() => starterProfileFlag({ coding: true, trustBoundary: "shared" })).toThrow("--coding sets the trust boundary; drop --trust-boundary.");
    expect(() => starterProfileFlag({ regulated: true, skipVault: true }))
      .toThrow("A regulated workspace needs a real vault passphrase; set AMC_VAULT_PASSPHRASE or run interactively.");
    expect(() => starterProfileFlag({ coding: true, skipVault: true }))
      .toThrow("A coding workspace needs a real vault passphrase; set AMC_VAULT_PASSPHRASE or run interactively.");
  });

  it("the installed CLI refuses --regulated --skip-vault and leaves no workspace", () => {
    const dir = tempDir("amc-starter-cli-");
    const env = { ...process.env, AMC_VAULT_PASSPHRASE: "" };
    const r = spawnSync(process.execPath, [CLI, "init", "--regulated", "--skip-vault"], { cwd: dir, env, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("A regulated workspace needs a real vault passphrase; set AMC_VAULT_PASSPHRASE or run interactively.");
    expect(existsSync(join(dir, ".amc"))).toBe(false);
  });
});

describe("runStarterInit (P1-40)", () => {
  it("never generates a passphrase: a non-interactive shell without one is refused", async () => {
    const dir = emptyDir();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(runStarterInit(dir, "regulated")).rejects.toThrow("A regulated workspace needs a real vault passphrase");
    expect(existsSync(join(dir, ".amc"))).toBe(false);
  });

  it("needs the owner's credentials from the operator and refuses an existing workspace", async () => {
    const dir = emptyDir();
    await expect(runStarterInit(dir, "coding")).rejects.toThrow("AMC_BOOTSTRAP_OWNER_PASSWORD");
    mkdirSync(join(dir, ".amc"));
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_USERNAME", OWNER.username);
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD", OWNER.password);
    await expect(runStarterInit(dir, "coding")).rejects.toThrow("already has an .amc directory");
  });

  it("collects the secrets before --force deletes anything", async () => {
    const dir = emptyDir();
    mkdirSync(join(dir, ".amc"));
    writeFileSync(join(dir, ".amc", "keep"), "an existing workspace");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(runStarterInit(dir, "coding", true)).rejects.toThrow("needs a real vault passphrase");
    expect(existsSync(join(dir, ".amc", "keep")), "a refused --force leaves the workspace alone").toBe(true);
  });

  it("initializes a ready workspace and prints no secret", async () => {
    const dir = emptyDir();
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_USERNAME", OWNER.username);
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD", OWNER.password);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.join(" ")); });
    const report = await runStarterInit(dir, "coding");
    const out = lines.join("\n");
    expect(report.readiness.ready).toBe(true);
    expect(out).not.toContain(PASSPHRASE);
    expect(out).not.toContain(OWNER.password);
    expect(out).toContain(report.monitorFingerprint);
    expect(out).toContain("synthetic");
    expect(out).not.toMatch(/\b(certified|compliant)\b/i);
  });
});

describe("ACP and Studio still start in each starter workspace (P1-40)", () => {
  it.each(["coding", "regulated"] as const)("%s", async (kind) => {
    const ws = workspace();
    applyStarterProfile(ws, kind, OWNER);
    const client = await AMCNativeClient.start({ workspace: ws, provider: "stub", tools: "workspace", command: [process.execPath, CLI] });
    try {
      expect((await client.newSession()).sessionId).toMatch(/\S/);
    } finally {
      await client.close();
    }
    const token = "starter-profile-admin-token";
    const studio = await startStudioApiServer({ workspace: ws, host: "127.0.0.1", port: await freePort(), token });
    try {
      const login = await fetch(`${studio.url}/auth/login`, { method: "POST", body: JSON.stringify(OWNER),
        headers: { "x-amc-admin-token": token, "content-type": "application/json" } });
      expect(login.status, "the owner signs in to Studio with the login init recorded").toBe(200);
    } finally {
      await studio.close();
    }
  }, 60_000);
});
