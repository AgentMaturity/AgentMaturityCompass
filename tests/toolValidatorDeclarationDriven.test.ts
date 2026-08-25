import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateToolRequest } from "../src/toolhub/toolhubValidators.js";
import type { ToolDefinition } from "../src/toolhub/toolsSchema.js";

/**
 * The allowlist governs what a tool DECLARES, never what it is called.
 *
 * `validateToolRequest` used to decide what to check by matching the name:
 * `"fs.read"`/`"fs.write"` for path globs, `"http.fetch"` for the host
 * allowlist, `"process.spawn"` for binaries and argv patterns, and
 * `startsWith("git.")` for a hardcoded cwd rule. That is a policy about four
 * identifiers, and it produced three separate holes before the shape was
 * noticed:
 *
 *   - a network tool under any other name got no host check;
 *   - a filesystem tool under any other name got no path check;
 *   - a `bash` entry declaring `argvRegexDenylist` was dead config, because
 *     argv patterns only ever reached `"process.spawn"`.
 *
 * Every test below therefore uses a DELIBERATELY UNFAMILIAR NAME. If any of
 * them starts passing because of what a tool is called, the fix has been
 * undone.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-validator-"));
  dirs.push(dir);
  return dir;
}

const tool = (overrides: Partial<ToolDefinition> & { name: string }): ToolDefinition =>
  ({ actionClass: "READ_ONLY", ...overrides } as ToolDefinition);

describe("a declared PATH policy is enforced on any tool", () => {
  it("denies a path outside the globs for a tool named nothing like fs.read", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "notebook.open",
        allow: { paths: ["./allowed/**"] },
        deny: { paths: ["**/.amc/**"] }
      }),
      args: { path: "elsewhere/secret.txt" }
    });
    expect(verdict.ok, "the check follows the declaration, not the name").toBe(false);
  });

  it("permits a path inside the globs", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "notebook.open", allow: { paths: ["./allowed/**"] } }),
      args: { path: "allowed/notes.txt" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });

  it("checks EVERY path-carrying argument, not just the first", () => {
    // A tool taking two paths must have both checked, or the second is a way
    // out of the policy the first is bound by.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "notebook.copy", allow: { paths: ["./allowed/**"] } }),
      args: { path: "allowed/a.txt", file_path: "elsewhere/b.txt" }
    });
    expect(verdict.ok).toBe(false);
  });

  it("denies when a path policy is declared and the call names no path", () => {
    // A declared policy that cannot be evaluated has not been satisfied.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "notebook.open", allow: { paths: ["./allowed/**"] } }),
      args: {}
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("path is required");
  });

  it("leaves a tool that declares NO path policy alone", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "notebook.open" }),
      args: { path: "anywhere/at/all.txt" }
    });
    expect(verdict.ok, "declaring nothing is how a tool opts out").toBe(true);
  });
});

describe("a declared HOST policy is enforced on any tool", () => {
  it("denies an off-allowlist host for a tool not called http.fetch", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "webhook.post",
        actionClass: "NETWORK_EXTERNAL",
        allow: { hostAllowlist: ["hooks.slack.com"] },
        denyByDefault: true
      }),
      args: { url: "https://evil.example.com/steal" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("evil.example.com");
  });

  it("permits an allowlisted host", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "webhook.post",
        actionClass: "NETWORK_EXTERNAL",
        allow: { hostAllowlist: ["hooks.slack.com"] },
        denyByDefault: true
      }),
      args: { url: "https://hooks.slack.com/services/x" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });

  it("denies when a host policy is declared and the call names no url", () => {
    // Same rule as the path case: a declared policy that cannot be evaluated
    // has not been satisfied.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "webhook.post", allow: { hostAllowlist: ["hooks.slack.com"] } }),
      args: { body: "payload" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("url is required");
  });

  it("denies a url it cannot parse rather than skipping the check", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "webhook.post", allow: { hostAllowlist: ["hooks.slack.com"] } }),
      args: { url: "not a url" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("invalid url");
  });
});

describe("declared BINARY and ARGV policies are enforced on any tool", () => {
  it("denies a binary outside the allowlist for a tool not called process.spawn", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "runner.exec",
        actionClass: "WRITE_HIGH",
        allow: { binariesAllowlist: ["node"] }
      }),
      args: { binary: "curl", argv: ["https://example.com"] }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("curl");
  });

  it("applies argv deny patterns to a COMMAND string, not only to an argv array", () => {
    // The exact hole this rewrite closes: a `bash` entry declaring deny
    // patterns was dead config, because they only ever reached the literal
    // name "process.spawn" and only ever looked at `argv`.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "bash",
        actionClass: "WRITE_HIGH",
        deny: { argvRegexDenylist: ["(^|\\s)sudo(\\s|$)"] }
      }),
      args: { command: "sudo rm -rf /" }
    });
    expect(verdict.ok, "a deny pattern must reach however the caller spelled it").toBe(false);
    expect(verdict.reason).toContain("deny pattern");
  });

  it("applies the same patterns to an argv array", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "runner.exec",
        actionClass: "WRITE_HIGH",
        deny: { argvRegexDenylist: ["(^|\\s)sudo(\\s|$)"] }
      }),
      args: { argv: ["sudo", "rm"] }
    });
    expect(verdict.ok).toBe(false);
  });

  it("permits a command the patterns do not match", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({
        name: "bash",
        actionClass: "WRITE_HIGH",
        deny: { argvRegexDenylist: ["(^|\\s)sudo(\\s|$)"] }
      }),
      args: { command: "echo hello" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });

  it("does not treat an EMPTY allowlist as a policy", () => {
    // `binaryAllowedForTool` reads an empty list as "no restriction", so
    // treating its presence as a declaration would deny every call for naming
    // no binary — a policy nobody wrote.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "bash", actionClass: "WRITE_HIGH", allow: { binariesAllowlist: [] } }),
      args: { command: "echo hello" }
    });
    expect(verdict.ok).toBe(true);
  });
});

describe("the working-directory invariant applies to every tool", () => {
  it("refuses a cwd outside the workspace", () => {
    // Was a hardcoded rule reachable only by names starting `git.` — and its
    // allow list contained `./**`, so the only thing it really excluded was a
    // cwd outside the workspace. Generalised, that is worth keeping.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "anything.at.all" }),
      args: { cwd: "../../etc" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("working directory");
  });

  it("refuses a cwd inside .git, whatever the tool is called", () => {
    // A tool working inside .git can write a hook, which runs on the next
    // commit. What refuses it is the ALLOW pattern `./**`, which never matches
    // a leading dot — measured, not assumed. Pinned here because that is a
    // property of the glob implementation, and a change to it would otherwise
    // open .git silently.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "anything.at.all" }),
      args: { cwd: ".git/hooks" }
    });
    expect(verdict.ok).toBe(false);
  });

  it("refuses a cwd inside .amc — enforced below this function, not by it", () => {
    // Measured: `pathAllowedByPatterns` refuses `.amc` unconditionally, before
    // any allow or deny list is consulted. Pinned so the guarantee stays
    // visible from here, and so nobody re-adds `.amc` to this function's deny
    // list believing that is what keeps the vault safe.
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "anything.at.all" }),
      args: { cwd: ".amc/keys" }
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(".amc");
  });

  it("permits a cwd inside the workspace", () => {
    const verdict = validateToolRequest({
      workspace: workspace(),
      tool: tool({ name: "anything.at.all" }),
      args: { cwd: "src" }
    });
    expect(verdict.ok, `denied: ${verdict.reason ?? ""}`).toBe(true);
  });
});
