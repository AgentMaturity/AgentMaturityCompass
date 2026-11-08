import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { adminTokenCheck } from "../src/doctor/secretFileChecks.js";
import { ensureAdminToken } from "../src/studio/studioState.js";

/**
 * LIVE-VAULT-12 (vault part; the constant-time compare and the empty-header refusal are the runtime area's): the Studio
 * admin token is 64 hex characters, a malformed token file is replaced, and `amc doctor` checks the file's mode and shape.
 */
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): { root: string; token: string } {
  const root = mkdtempSync(join(tmpdir(), "amc-admin-token-"));
  roots.push(root);
  mkdirSync(join(root, ".amc", "studio"), { recursive: true });
  return { root, token: join(root, ".amc", "studio", "admin.token") };
}

describe("ensureAdminToken", () => {
  test.each(["", "   \n", "short-token", "A".repeat(64), `${"a".repeat(64)}x`])("replaces a malformed token file (%j) and says so once", (content) => {
    const { root, token } = workspace();
    writeFileSync(token, content, { mode: 0o600 });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const issued = ensureAdminToken(root);
    expect(issued).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(token, "utf8").trim()).toBe(issued);
    expect(stderr.mock.calls.map((call) => String(call[0]))).toEqual(["Replaced a malformed .amc/studio/admin.token\n"]);
  });

  test("keeps a well-formed token and creates a missing one", () => {
    const { root, token } = workspace();
    const issued = ensureAdminToken(root);
    expect(issued).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureAdminToken(root)).toBe(issued);
    expect(readFileSync(token, "utf8").trim()).toBe(issued);
  });
});

describe.skipIf(process.platform === "win32")("amc doctor's studio-admin-token check", () => {
  test("fails for a token readable by group or other, or not 64 hex characters, and passes for a private well-formed one", () => {
    const { root, token } = workspace();
    expect(adminTokenCheck(root)).toBeNull();
    writeFileSync(token, `${"b".repeat(64)}\n`);
    chmodSync(token, 0o644);
    expect(adminTokenCheck(root)).toEqual({ id: "studio-admin-token", status: "FAIL", message: ".amc/studio/admin.token is open to group or other users (mode 644)",
      fixHint: "Run: chmod 600 .amc/studio/admin.token" });
    writeFileSync(token, "short\n");
    chmodSync(token, 0o600);
    expect(adminTokenCheck(root)).toEqual({ id: "studio-admin-token", status: "FAIL", message: ".amc/studio/admin.token is not 64 hexadecimal characters",
      fixHint: "Run: amc down, delete .amc/studio/admin.token, then amc up (a new token is written)" });
    writeFileSync(token, `${"c".repeat(64)}\n`);
    expect(adminTokenCheck(root)).toEqual({ id: "studio-admin-token", status: "PASS", message: ".amc/studio/admin.token is private and well formed" });
  });
});
