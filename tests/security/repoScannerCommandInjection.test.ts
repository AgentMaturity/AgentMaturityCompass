import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { scanRepo } from "../../src/scanner/repoScanner.js";

describe("security: repo scanner command injection", () => {
  test("does not execute shell metacharacters embedded in repo URL", () => {
    const markerPath = join(tmpdir(), `amc-repo-injection-${randomUUID()}`);
    const maliciousRepo = `/definitely-not-a-repo;touch ${markerPath}`;

    try {
      expect(() => scanRepo(maliciousRepo)).toThrow(/Failed to clone repo/);
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      if (existsSync(markerPath)) {
        rmSync(markerPath, { force: true });
      }
    }
  });
});
