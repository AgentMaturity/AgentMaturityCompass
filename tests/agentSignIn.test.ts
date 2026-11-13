import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { inspectSignIn, parseSignInState, registerLoginCommands, SIGN_IN_AGENTS, type CommandOutcome, type CommandRunner } from "../src/setup/agentSignIn.js";
import { CODEX_NEXT_STEPS } from "../src/adapters/hookProviders/codex.js";

const [claude, codex] = SIGN_IN_AGENTS;
const out = (stdout: string, status = 0, stderr = ""): CommandOutcome => ({ status, stdout, stderr });
const missing: CommandOutcome = { error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }), status: null, stdout: "", stderr: "" };

describe("amc login: vendor sign-in status", () => {
  it("reads Claude Code's own loggedIn answer and nothing else", () => {
    expect(parseSignInState(claude!, out('{"loggedIn": true, "authMethod": "claude.ai"}'))).toBe("signed-in");
    expect(parseSignInState(claude!, out('{"loggedIn": false, "authMethod": "none"}', 1))).toBe("signed-out");
    expect(parseSignInState(claude!, out("Logged in"))).toBe("unknown");
    expect(parseSignInState(claude!, out('{"authMethod": "claude.ai"}'))).toBe("unknown");
  });

  it("reads Codex's status line; an unreadable answer is never signed-in", () => {
    expect(parseSignInState(codex!, out("Logged in using ChatGPT"))).toBe("signed-in");
    expect(parseSignInState(codex!, out("", 1, "Not logged in"))).toBe("signed-out");
    expect(parseSignInState(codex!, out("Logged in using ChatGPT", 1))).toBe("unknown");
    expect(parseSignInState(codex!, out(""))).toBe("unknown");
  });

  it("reports a missing binary as not installed and names the next command per state", () => {
    const run: CommandRunner = (binary) => (binary === "claude" ? missing : out("Logged in using ChatGPT"));
    const reports = inspectSignIn(run);
    expect(reports.map((report) => report.state)).toEqual(["not-installed", "signed-in"]);
    expect(reports[0]!.next).toContain("amc login claude");
    expect(reports[1]!.next).toBe(codex!.connect);
  });

  it("status asks only for status, with captured output; login hands the terminal to the vendor command", async () => {
    const calls: Array<{ binary: string; args: readonly string[]; inherit: boolean }> = [];
    const lines: string[] = [];
    const run: CommandRunner = (binary, args, inherit) => { calls.push({ binary, args, inherit }); return out(binary === "claude" ? '{"loggedIn": false}' : "Logged in using ChatGPT"); };
    const program = new Command().exitOverride();
    registerLoginCommands(program, run, (line) => lines.push(line));
    await program.parseAsync(["node", "amc", "login", "status"]);
    expect(calls).toEqual([{ binary: "claude", args: ["auth", "status"], inherit: false }, { binary: "codex", args: ["login", "status"], inherit: false }]);
    expect(lines.join("\n")).toMatch(/Claude Code\s+signed-out\s+next: amc login claude/);
    expect(lines.join("\n")).toContain("never sees or stores");
    await program.parseAsync(["node", "amc", "login", "codex"]);
    expect(calls.at(-1)).toEqual({ binary: "codex", args: ["login"], inherit: true });
    expect(lines.at(-1)).toBe(`Next: ${codex!.connect}`);
  });

  it("Codex hook guidance names the trust steps Codex requires", () => {
    expect(CODEX_NEXT_STEPS.join("\n")).toMatch(/trust the folder[\s\S]*\/hooks/);
  });
});
