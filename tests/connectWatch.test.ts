import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { offerWatchSignedIn, writeConnectEnvFile, type WatchOfferDeps } from "../src/studio/connectWatch.js";
import type { SignInReport } from "../src/setup/agentSignIn.js";

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

const report = (id: "claude" | "codex", state: SignInReport["state"]): SignInReport =>
  ({ id, displayName: id === "claude" ? "Claude Code" : "Codex", state, next: "" });

function deps(over: Partial<WatchOfferDeps> = {}) {
  const lines: string[] = [];
  const base: WatchOfferDeps = {
    signIn: () => [report("claude", "signed-in"), report("codex", "signed-out")],
    choose: vi.fn(async () => "claude"),
    confirm: vi.fn(async () => true),
    install: vi.fn(async () => ["AMC hook installed"]),
    log: (line) => lines.push(line)
  };
  return { deps: { ...base, ...over }, lines };
}

describe("amc connect offers the signed-in Claude Code or Codex first", () => {
  it("lists only signed-in agents, and installs an observe hook on a yes", async () => {
    const t = deps();
    await expect(offerWatchSignedIn("default", t.deps)).resolves.toBe("watched");
    const choices = (t.deps.choose as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Array<{ name: string }>;
    expect(choices.map((choice) => choice.name)).toEqual(["Watch Claude Code (signed in)", "Another agent: write the gateway environment for it"]);
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining(".claude/settings.local.json"));
    expect(t.deps.install).toHaveBeenCalledWith("claude-code", "default");
    expect(t.lines).toEqual(["AMC hook installed"]);
  });

  it("installs nothing without consent, for the exports choice, or when nobody is signed in", async () => {
    const no = deps({ confirm: vi.fn(async () => false) });
    await expect(offerWatchSignedIn("default", no.deps)).resolves.toBe("skipped");
    expect(no.deps.install).not.toHaveBeenCalled();
    const env = deps({ choose: vi.fn(async () => "env") });
    await expect(offerWatchSignedIn("default", env.deps)).resolves.toBe("skipped");
    expect(env.deps.install).not.toHaveBeenCalled();
    const none = deps({ signIn: () => [report("claude", "unknown")] });
    await expect(offerWatchSignedIn("default", none.deps)).resolves.toBe("skipped");
    expect(none.deps.choose).not.toHaveBeenCalled();
  });

  it("names Codex's hook file for Codex", async () => {
    const t = deps({ signIn: () => [report("codex", "signed-in")], choose: vi.fn(async () => "codex") });
    await offerWatchSignedIn("default", t.deps);
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining(".codex/hooks.json"));
    expect(t.deps.install).toHaveBeenCalledWith("codex", "default");
  });
});

describe("amc connect keeps the lease out of scrollback", () => {
  it("writes the exports to a 0600 file in the git-ignored studio folder and returns the source line", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-connect-env-"));
    roots.push(ws);
    const written = writeConnectEnvFile(ws, "default", ["export AMC_LEASE=fixture-lease", "export AMC_AGENT_ID=default"]);
    expect(written.sourceLine).toBe(`source ${join(".amc", "studio", "connect", "default.env")}`);
    expect(statSync(written.path).mode & 0o777).toBe(0o600);
    expect(readFileSync(written.path, "utf8")).toContain("export AMC_LEASE=fixture-lease");
    expect(() => writeConnectEnvFile(ws, "../x", [])).toThrow(/cannot name a file/);
  });
});
