import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { scanDirectoryForSecrets } from "../src/release/releaseSecretScan.js";

/**
 * The scanner derived a finding's reported path with
 * `fullPath.slice(rootDir.length + 1)`. `join()` normalises "./qa" to "qa"
 * when building fullPath, but rootDir keeps its "./", so the slice ate two real
 * characters: scanning "./qa" reported a secret in "nv" instead of ".env".
 *
 * For a security tool, a finding that names a file which does not exist is
 * close to useless — the operator cannot go look at it.
 */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-scan-"));
  mkdirSync(join(dir, "nested"), { recursive: true });
  writeFileSync(join(dir, ".env"), "ANTHROPIC_API_KEY=sk-ant-not-a-real-key-000\n");
  writeFileSync(join(dir, "nested", "config.ts"), "export const x = 1;\n");
  return dir;
}

describe("secret scan path reporting", () => {
  it("reports paths that actually exist, whatever form the root takes", () => {
    const dir = fixture();
    try {
      // A genuinely relative root, the form the CLI passes ("./qa").
      const relForm = `./${relative(process.cwd(), dir)}`;
      const forms = [dir, `${dir}/`, relForm];
      for (const root of forms) {
        const report = scanDirectoryForSecrets(root);
        const paths = report.findings.map((f) => f.path);
        expect(paths.length, `root form: ${root}`).toBeGreaterThan(0);
        expect(paths, `root form: ${root}`).toContain(".env");
        // The truncation signature: a path that lost its leading characters.
        expect(paths, `root form: ${root}`).not.toContain("nv");
        for (const p of paths) {
          expect(p.startsWith("/"), `${p} should be relative`).toBe(false);
          expect(p.startsWith("."), `${p} should not start with a path segment marker`)
            .toBe(p === ".env");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a relative path a reader can open from the scan root", () => {
    const dir = fixture();
    try {
      const report = scanDirectoryForSecrets(`./${relative(process.cwd(), dir)}`);
      const envFinding = report.findings.find((f) => f.type === "SECRET_FILENAME");
      expect(envFinding).toBeDefined();
      expect(envFinding!.path).toBe(".env");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
