import { expect, test } from "vitest";
import { resumeRuleFor } from "../src/session/resumeRules.js";
import type { ActionClass } from "../src/types.js";

// P2-12: which interrupted calls may run again after a crash. The rule decides, never the model asking again.
const before = "a".repeat(64);
const changed = "b".repeat(64);

test.each<[ActionClass, string, string]>([
  ["READ_ONLY", "fs.read", "may-repeat"],
  ["WRITE_LOW", "fs.write", "repeat-with-same-idempotency-key"],
  ["WRITE_HIGH", "fs.edit", "repeat-with-same-idempotency-key"],
  ["NETWORK_EXTERNAL", "web_fetch", "reconcile-first"],
  ["FINANCIAL", "payments.send", "reconcile-first"],
  ["DEPLOY", "deploy.release", "reconcile-first"],
  ["DATA_EXPORT", "records.export", "reconcile-first"],
  ["IDENTITY", "users.grant", "reconcile-first"],
  ["SECURITY", "keys.rotate", "reconcile-first"]
])("%s %s resumes as %s", (actionClass, toolName, rule) => {
  expect(resumeRuleFor({ actionClass, toolName, mcp: false, file: { beforeSha256: before, currentSha256: before } })).toBe(rule);
});

test("every MCP tool reconciles first, whatever class its grant declares", () => {
  for (const actionClass of ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"] as const) {
    expect(resumeRuleFor({ actionClass, toolName: "mcp_files_0123456789abcdef", mcp: true, file: { beforeSha256: before, currentSha256: before } }))
      .toBe("reconcile-first");
  }
});

test("a workspace write repeats only while the file still has its recorded beforeSha256", () => {
  const call = { actionClass: "WRITE_LOW" as const, toolName: "fs.write", mcp: false };
  expect(resumeRuleFor({ ...call, file: { beforeSha256: before, currentSha256: changed } })).toBe("reconcile-first");
  expect(resumeRuleFor({ ...call, file: { beforeSha256: before, currentSha256: null } })).toBe("reconcile-first");
  // No recorded beforeSha256 at all (the crash came before the file change was recorded): nothing to compare.
  expect(resumeRuleFor({ ...call, file: null })).toBe("reconcile-first");
  // A created file records a null beforeSha256; it may repeat only while the file is still absent.
  expect(resumeRuleFor({ ...call, file: { beforeSha256: null, currentSha256: null } })).toBe("repeat-with-same-idempotency-key");
  expect(resumeRuleFor({ ...call, file: { beforeSha256: null, currentSha256: changed } })).toBe("reconcile-first");
});

test("a write tool that is not a workspace file tool, or an unknown class, reconciles first", () => {
  expect(resumeRuleFor({ actionClass: "WRITE_LOW", toolName: "tickets.update", mcp: false, file: { beforeSha256: before, currentSha256: before } }))
    .toBe("reconcile-first");
  expect(resumeRuleFor({ actionClass: "WRITE_HIGH", toolName: "bash", mcp: false, file: null })).toBe("reconcile-first");
  expect(resumeRuleFor({ actionClass: null, toolName: "fs.read", mcp: false, file: null })).toBe("reconcile-first");
});
