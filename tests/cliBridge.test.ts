import { describe, it, expect } from "vitest";
import { validateCliExec } from "../src/studio/cliBridge.js";

describe("CLI Bridge", () => {
  describe("validateCliExec", () => {
    it("rejects empty command", () => {
      expect(validateCliExec({ command: "" })).toContain("required");
      expect(validateCliExec({ command: "   " })).toContain("cannot be empty");
    });

    it("rejects missing command", () => {
      expect(validateCliExec({ command: undefined as any })).toContain("required");
    });

    it("rejects shell injection", () => {
      expect(validateCliExec({ command: "status; rm -rf /" })).toContain("disallowed");
      expect(validateCliExec({ command: "status | grep foo" })).toContain("disallowed");
      expect(validateCliExec({ command: "status $(whoami)" })).toContain("disallowed");
      expect(validateCliExec({ command: "status `id`" })).toContain("disallowed");
    });

    it("rejects dangerous commands without confirm", () => {
      expect(validateCliExec({ command: "vault seal" })).toContain("confirm:true");
      expect(validateCliExec({ command: "vault destroy" })).toContain("confirm:true");
      expect(validateCliExec({ command: "down" })).toContain("confirm:true");
    });

    it("matches dangerous and interactive commands on the argv that runs, not the raw string", () => {
      for (const command of ["vault  seal", "vault\tseal", '"vault" seal', "'vault' 'seal'", "--json vault seal", "vault --json seal", "amc  vault   seal"]) {
        expect(validateCliExec({ command }), command).toContain("confirm:true");
        expect(validateCliExec({ command, confirm: true }), command).toBeNull();
      }
      expect(validateCliExec({ command: '"quickscore"' })).toContain("cannot run headless");
      expect(validateCliExec({ command: "--json  host   init" })).toContain("cannot run headless");
      expect(validateCliExec({ command: "download-report" })).toBeNull();
      expect(validateCliExec({ command: 'agent-loop run "improve the setup"' })).toBeNull();
      expect(validateCliExec({ command: "--agent default quickscore" })).toContain("cannot run headless");
    });

    it("applies both lists to args too, and refuses an args key that is not an option name", () => {
      expect(validateCliExec({ command: "--no-color", args: { json: "down" } })).toContain("confirm:true");
      expect(validateCliExec({ command: "--no-color", args: { json: "quickscore" } })).toContain("cannot run headless");
      expect(validateCliExec({ command: "--json", args: { "--": "down" } })).toContain("not an option name");
      expect(validateCliExec({ command: "status", args: { "": "down" } })).toContain("not an option name");
      expect(validateCliExec({ command: "score", args: { agent: "default", "--tier": "quick" } })).toBeNull();
    });

    it("allows dangerous commands with confirm", () => {
      expect(validateCliExec({ command: "vault seal", confirm: true })).toBeNull();
      expect(validateCliExec({ command: "down", confirm: true })).toBeNull();
    });

    it("rejects interactive commands", () => {
      expect(validateCliExec({ command: "quickscore" })).toContain("cannot run headless");
      expect(validateCliExec({ command: "amc quickscore" })).toContain("cannot run headless");
      expect(validateCliExec({ command: "setup" })).toContain("cannot run headless");
      expect(validateCliExec({ command: "bootstrap" })).toContain("cannot run headless");
    });

    it("allows normal commands", () => {
      expect(validateCliExec({ command: "amc" })).toBeNull();
      expect(validateCliExec({ command: "amc doctor --json" })).toBeNull();
      expect(validateCliExec({ command: "status" })).toBeNull();
      expect(validateCliExec({ command: "doctor --json" })).toBeNull();
      expect(validateCliExec({ command: "score formal-spec default" })).toBeNull();
      expect(validateCliExec({ command: "assurance run default" })).toBeNull();
      expect(validateCliExec({ command: "evidence list default" })).toBeNull();
    });

    it("never passes the unconfined-shell opt-in through the HTTP bridge (P0-06)", () => {
      // The opt-in belongs to an operator at a terminal or in Studio's own
      // environment; a request (or a forged one, through CSRF) must not carry it.
      const refusal = "--unsafe-unconfined-shell cannot be passed through the Studio API";
      expect(validateCliExec({ command: "agent-loop run list --unsafe-unconfined-shell" })).toContain(refusal);
      expect(validateCliExec({ command: "amc acp --unsafe-unconfined-shell=true" })).toContain(refusal);
      expect(validateCliExec({ command: "agent-loop run list", args: { "unsafe-unconfined-shell": "" } })).toContain(refusal);
      expect(validateCliExec({ command: "agent-loop run list", args: { "--unsafe-unconfined-shell": "true" } })).toContain(refusal);
      expect(validateCliExec({ command: "agent-loop run list", args: { tools: "--unsafe-unconfined-shell" } })).toContain(refusal);
      expect(validateCliExec({ command: "agent-loop run list", args: { tools: "workspace" } })).toBeNull();
    });

    it("rejects overly long commands", () => {
      const long = "a".repeat(2001);
      expect(validateCliExec({ command: long })).toContain("too long");
    });
  });
});

describe("CLI entry (H2)", () => {
  it("runs the running package's own dist/cli.js, not <workspace>/dist/cli.js", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { execCliCommand } = await import("../src/studio/cliBridge.js");
    const workspace = mkdtempSync(join(tmpdir(), "amc-clibridge-"));
    try {
      const result = await execCliCommand(workspace, { command: "amc --version", format: "text", timeout: 60_000 });
      expect(result.stderr).not.toContain(resolve(workspace, "dist/cli.js"));
      expect(result.ok, result.stderr).toBe(true);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 90_000);
});
