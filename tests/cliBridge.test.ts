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

    it("rejects overly long commands", () => {
      const long = "a".repeat(2001);
      expect(validateCliExec({ command: long })).toContain("too long");
    });
  });
});
