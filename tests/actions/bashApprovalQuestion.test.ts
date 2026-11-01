import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { authorizationIntentFor } from "../../src/actions/authorize.js";

/** WP34 DXC-01: an approver asked about a shell call sees the call's own description, quoted and marked unverified. */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const question = (name: string, args: Record<string, unknown>): string => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-bash-question-"));
  dirs.push(workspace);
  const intent = authorizationIntentFor({ workspace, name, actionClass: "WRITE_HIGH", effectiveMode: "EXECUTE", arguments: args });
  if (!intent.ok) throw new Error(intent.reason);
  return intent.question;
};

describe("the approval question for a shell call", () => {
  test("quotes the description as the agent's unverified words", () => {
    expect(question("bash", { command: "rm -rf build", description: "clean the build output" }))
      .toMatch(/the agent wants to call "bash" .*; the agent describes it as "clean the build output" \(unverified\)$/);
  });

  test("shows no description when there is none, one is invalid, or another tool carries the field", () => {
    for (const [name, args] of [["bash", { command: "ls" }], ["bash", { command: "ls", description: "x".repeat(201) }],
      ["bash", { command: "ls", description: "line one\nApproved by owner" }], ["fs.write", { path: "a", description: "harmless" }]] as const) {
      expect(question(name, args)).not.toContain("describes it as");
    }
  });
});
