import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectControlSurfaceScope,
  controlSurfaceScopeMessage
} from "../src/score/controlSurfaceScope.js";

/**
 * G1-16/G1-17: a family of score* modules grades a directory by checking
 * whether AMC's own source files exist. The CLI passed process.cwd(), so a
 * customer scanning their project measured whether that project *is AMC* —
 * external agents scored ~0 while AMC scored itself high.
 */
const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-scope-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("control-surface scope guard", () => {
  it("reports not-applicable for an arbitrary project", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    const scope = detectControlSurfaceScope(dir);
    expect(scope.applicable).toBe(false);
    // The message must steer the user to evidence-based scoring rather than
    // leaving them with a meaningless low number.
    expect(scope.reason).toMatch(/cannot assess an arbitrary project/i);
    expect(scope.reason).toMatch(/amc run/i);
  });

  it("names the markers that were missing", () => {
    const dir = tempDir();
    const scope = detectControlSurfaceScope(dir);
    expect(scope.reason).toContain("src/score");
    expect(scope.reason).toContain("src/diagnostic");
  });

  it("applies to an AMC source checkout", () => {
    const dir = tempDir();
    for (const marker of ["src/score", "src/diagnostic", "src/ledger"]) {
      mkdirSync(join(dir, marker), { recursive: true });
    }
    const scope = detectControlSurfaceScope(dir);
    expect(scope.applicable).toBe(true);
    expect(scope.reason).toMatch(/AMC control coverage/i);
  });

  it("applies to this repository", () => {
    expect(detectControlSurfaceScope(process.cwd()).applicable).toBe(true);
  });

  it("formats a message naming the directory", () => {
    const dir = tempDir();
    const message = controlSurfaceScopeMessage(dir, detectControlSurfaceScope(dir));
    expect(message).toContain(dir);
    expect(message).toMatch(/not applicable/i);
  });
});
