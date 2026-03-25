import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getWorkspacePaths } from "../src/workspace.js";

describe("workspace paths", () => {
  function makeWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-ws-test-"));
    mkdirSync(join(dir, ".amc"), { recursive: true });
    return dir;
  }

  test("getWorkspacePaths returns expected structure", () => {
    const ws = makeWorkspace();
    const paths = getWorkspacePaths(ws);
    expect(paths.amcDir).toContain(".amc");
    expect(paths.root).toBe(ws);
    expect(paths.keysDir).toBeDefined();
    expect(paths.blobsDir).toBeDefined();
    expect(paths.runsDir).toBeDefined();
    expect(paths.reportsDir).toBeDefined();
  });

  test("workspace paths are consistent across calls", () => {
    const ws = makeWorkspace();
    const p1 = getWorkspacePaths(ws);
    const p2 = getWorkspacePaths(ws);
    expect(p1.amcDir).toBe(p2.amcDir);
    expect(p1.root).toBe(p2.root);
    expect(p1.keysDir).toBe(p2.keysDir);
  });

  test("workspace paths contain expected directories", () => {
    const ws = makeWorkspace();
    const paths = getWorkspacePaths(ws);
    expect(paths.amcDir).toContain(join(ws, ".amc"));
    expect(paths.config).toContain(".amc");
  });
});
