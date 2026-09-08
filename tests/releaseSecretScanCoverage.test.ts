import { randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, copyFileSync, ftruncateSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, rmSync, symlinkSync, writeFileSync, writeSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  scanDirectoryForSecrets, scanReleaseArchive, scanExtractedReleaseForSecrets, writeSecretScanReport,
  SECRET_SCAN_LIMITS, SecretScanIncompleteError,
  type SecretScanReport
} from "../src/release/releaseSecretScan.js";
import { runTarCreate } from "../src/release/releaseUtils.js";

const fixtures: string[] = [];
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-release-coverage-"));
  fixtures.push(root);
  return root;
}
// Generated synthetic detector fixture, never a credential issued by a provider.
const syntheticToken = (): string => `sk-${randomBytes(24).toString("hex")}`;

function requireKeyFinding(report: SecretScanReport, path: string, token: string): void {
  expect(report.status).toBe("FAIL");
  expect(report.findings.some((finding) =>
    finding.type === "OPENAI_STYLE_KEY" && finding.severity === "HIGH" && finding.path === path
  ), "the scanner must identify the synthetic token in the requested file").toBe(true);
  expect(JSON.stringify(report).includes(token), "reports must not expose the complete synthetic token").toBe(false);
}

/** Existing unreadable-input behavior throws; an explicit FAIL report is also
 * acceptable. Missing/omitted evidence must never look like a successful scan. */
function requireExplicitRefusal(scan: () => SecretScanReport): void {
  let result: SecretScanReport | undefined;
  let error: unknown;
  try { result = scan(); } catch (caught) { error = caught; }
  if (result !== undefined) expect(result.status, "unscanned input cannot report PASS").toBe("FAIL");
  else expect(error).toBeInstanceOf(Error);
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release secret scanner content coverage", () => {
  it.each([999_999, 1_000_000, 1_000_001])("detects a token at the end of a %i-byte file", (bytes) => {
    const root = fixture();
    const token = syntheticToken();
    writeFileSync(join(root, "module.js"), " ".repeat(bytes - token.length - 1) + token + "\n");
    requireKeyFinding(scanDirectoryForSecrets(root), "module.js", token);
  });

  it("detects a token beyond 1 MB even when it spans a common chunk boundary", () => {
    const root = fixture();
    const token = syntheticToken();
    writeFileSync(join(root, "large-module.js"), " ".repeat(1_048_575) + token + "\n");
    const report = scanDirectoryForSecrets(root);
    requireKeyFinding(report, "large-module.js", token);
    const output = join(fixture(), "scan-report.json");
    writeSecretScanReport(report, output);
    expect(readFileSync(output, "utf8").includes(token)).toBe(false);
  });

  it("scans large members through the actual npm archive API", () => {
    const root = fixture();
    const staging = join(root, "staging");
    mkdirSync(join(staging, "package", "dist"), { recursive: true });
    const token = syntheticToken();
    writeFileSync(join(staging, "package", "dist", "cli.js"), " ".repeat(1_100_000) + token + "\n");
    const archive = join(root, "candidate.tgz");
    runTarCreate(staging, archive);
    requireKeyFinding(scanReleaseArchive(archive), "package/dist/cli.js", token);
  });

  it("preserves detection through a release bundle's nested npm archive", () => {
    const root = fixture();
    const npm = join(root, "npm");
    mkdirSync(join(npm, "package", "dist"), { recursive: true });
    const token = syntheticToken();
    writeFileSync(join(npm, "package", "dist", "replay.js"), " ".repeat(1_100_000) + token + "\n");
    const release = join(root, "outer", "amc-release", "artifacts", "npm");
    mkdirSync(release, { recursive: true });
    runTarCreate(npm, join(release, "candidate.tgz"));
    // Consumers can scan the exact staged/verified root without re-reading an
    // external outer archive that could have changed since verification.
    requireKeyFinding(scanExtractedReleaseForSecrets(join(root, "outer", "amc-release")), "package/dist/replay.js", token);
    const archive = join(root, "candidate.amcrelease");
    runTarCreate(join(root, "outer"), archive);
    requireKeyFinding(scanReleaseArchive(archive), "package/dist/replay.js", token);
  });

  it("retains PASS for genuinely empty and fully readable clean inputs", () => {
    const root = fixture();
    expect(scanDirectoryForSecrets(root).status).toBe("PASS");
    writeFileSync(join(root, "clean-module.js"), " ".repeat(1_100_000));
    const report = scanDirectoryForSecrets(root);
    expect(report.status).toBe("PASS");
    expect(report.findings).toEqual([]);
  });

  it("does not report a nonexistent directory as a successful empty scan", () => {
    requireExplicitRefusal(() => scanDirectoryForSecrets(join(fixture(), "missing")));
  });

  it("does not silently omit content beyond the archive entry-size bound", () => {
    const root = fixture();
    const file = join(root, "oversized.js");
    // Sparse fixture: no large allocation. Implementations may refuse it at a
    // documented resource bound or scan and detect it, but cannot skip to PASS.
    const bytes = 128 * 1024 * 1024 + 1;
    const token = Buffer.from(`\n${syntheticToken()}\n`);
    const fd = openSync(file, "w");
    try {
      ftruncateSync(fd, bytes);
      writeSync(fd, token, 0, token.length, bytes - token.length);
    } finally { closeSync(fd); }
    requireExplicitRefusal(() => scanDirectoryForSecrets(root));
  });

  it("does not silently ignore symlinked content in a directory scan", () => {
    const root = fixture();
    const outside = join(fixture(), "outside.js");
    writeFileSync(outside, syntheticToken());
    symlinkSync(outside, join(root, "linked.js"));
    // Refusing links preserves confinement; following outside the root is not
    // necessary. Either refusal or a detected HIGH must prevent PASS.
    requireExplicitRefusal(() => scanDirectoryForSecrets(root));
  });

  it.each(["", "/"])("refuses a symlink scan root with suffix %j", (suffix) => {
    const root = fixture();
    const link = join(root, "linked-directory");
    symlinkSync(fixture(), link, "dir");
    expect(() => scanDirectoryForSecrets(link + suffix)).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_INPUT" }));
  });

  it("fully scans a regular file at the documented per-file limit", () => {
    const root = fixture();
    const token = syntheticToken();
    writeFileSync(join(root, "at-limit.js"), " ".repeat(SECRET_SCAN_LIMITS.maxFileBytes - token.length - 1) + token + "\n");
    requireKeyFinding(scanDirectoryForSecrets(root), "at-limit.js", token);
  });

  it("refuses one byte above the file budget with safe typed context", () => {
    const root = fixture();
    const token = syntheticToken();
    const fd = openSync(join(root, "over-limit.js"), "w");
    try {
      writeSync(fd, Buffer.from(token));
      ftruncateSync(fd, SECRET_SCAN_LIMITS.maxFileBytes + 1);
    } finally { closeSync(fd); }
    let failure: unknown;
    try { scanDirectoryForSecrets(root); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(SecretScanIncompleteError);
    expect(failure).toMatchObject({ code: "FILE_TOO_LARGE", path: "over-limit.js" });
    expect(String(failure).includes(token)).toBe(false);
  });

  it("refuses aggregate bytes beyond the budget even when each file is permitted", () => {
    const root = fixture();
    const count = Math.floor(SECRET_SCAN_LIMITS.maxTotalBytes / SECRET_SCAN_LIMITS.maxFileBytes) + 1;
    for (let i = 0; i < count; i += 1) {
      const fd = openSync(join(root, `part-${i}.js`), "w");
      try { ftruncateSync(fd, SECRET_SCAN_LIMITS.maxFileBytes); }
      finally { closeSync(fd); }
    }
    expect(() => scanDirectoryForSecrets(root)).toThrowError(expect.objectContaining({ code: "TOTAL_BYTES_EXCEEDED" }));
  });

  it("bounds filesystem entry count independently of content bytes", () => {
    const root = fixture();
    for (let i = 0; i <= SECRET_SCAN_LIMITS.maxEntries; i += 1) writeFileSync(join(root, `empty-${i}.js`), "");
    expect(() => scanDirectoryForSecrets(root)).toThrowError(expect.objectContaining({ code: "ENTRY_LIMIT_EXCEEDED" }));
  }, 15_000);

  it("refuses a file supplied as the scan directory", () => {
    const file = join(fixture(), "module.js");
    writeFileSync(file, "");
    expect(() => scanDirectoryForSecrets(file)).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_INPUT", path: "." }));
  });

  it("shares entry budgets across every nested npm archive", () => {
    const root = fixture();
    const npm = join(root, "npm");
    mkdirSync(join(npm, "package"), { recursive: true });
    for (let i = 0; i < Math.floor(SECRET_SCAN_LIMITS.maxEntries / 2); i += 1) {
      writeFileSync(join(npm, "package", `empty-${i}.js`), "");
    }
    const releaseRoot = join(root, "release");
    const npmDir = join(releaseRoot, "artifacts", "npm");
    mkdirSync(npmDir, { recursive: true });
    runTarCreate(npm, join(npmDir, "one.tgz"));
    copyFileSync(join(npmDir, "one.tgz"), join(npmDir, "two.tgz"));
    expect(() => scanExtractedReleaseForSecrets(releaseRoot)).toThrowError(expect.objectContaining({ code: "ENTRY_LIMIT_EXCEEDED" }));
  }, 15_000);

  it("retains a complete report at the finding budget", () => {
    const root = fixture();
    const hint = ["anthropic", "key"].join("_");
    writeFileSync(join(root, "names.js"), `${hint}\n`.repeat(SECRET_SCAN_LIMITS.maxFindings));
    const report = scanDirectoryForSecrets(root);
    expect(report.status).toBe("PASS");
    expect(report.findings).toHaveLength(SECRET_SCAN_LIMITS.maxFindings);
    expect(report.findings.every((finding) => finding.severity === "MEDIUM")).toBe(true);
  });

  it("refuses an incomplete report when another finding exceeds the shared cap", () => {
    const root = fixture();
    const hint = ["anthropic", "key"].join("_");
    writeFileSync(join(root, "names.js"), `${hint}\n`.repeat(SECRET_SCAN_LIMITS.maxFindings + 1));
    expect(() => scanDirectoryForSecrets(root)).toThrowError(expect.objectContaining({ code: "FINDING_LIMIT_EXCEEDED" }));
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("fails explicitly when a discovered file cannot be read", () => {
    const root = fixture();
    const file = join(root, "unreadable.js");
    writeFileSync(file, syntheticToken());
    chmodSync(file, 0o000);
    try { requireExplicitRefusal(() => scanDirectoryForSecrets(root)); }
    finally { chmodSync(file, 0o600); }
  });
});
