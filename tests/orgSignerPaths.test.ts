import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../src/org/orgSigner.js";
import { lockVault } from "../src/vault/vault.js";
import { initFileSealedNotaryKey, loadNotarySigner } from "../src/notary/notarySigner.js";
import { appendNotaryLogEntry, initNotaryLog, verifyNotaryLog } from "../src/notary/notaryLog.js";
import { defaultNotaryConfig, notaryLogPath, notarySealPath, notarySealSigPath } from "../src/notary/notaryConfigStore.js";
import { initOrgConfig } from "../src/org/orgStore.js";
import { renderOrgCompareReportFile, renderOrgNodeReportFile, renderOrgSystemicReport } from "../src/org/orgApi.js";

const roots: string[] = [];
beforeEach(() => vi.stubEnv("AMC_VAULT_PASSPHRASE", "signature-path-regression"));
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc signer workspace with spaces "));
  roots.push(root);
  ensureSigningKeys(root);
  return root;
}

describe("signed file paths", () => {
  it("signs a bare relative filename without creating a directory at the signature path", () => {
    const root = workspace();
    const signer = new URL("../src/org/orgSigner.ts", import.meta.url).href;
    // A separate cwd exercises a real slashless path on every OS. The former
    // slash-only parent regex also left absolute Windows paths unchanged.
    const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", `
      import { writeFileSync, statSync } from "node:fs";
      import { signFileWithAuditor, verifySignedFileWithAuditor } from ${JSON.stringify(signer)};
      writeFileSync("adapters.yaml", "adapters: {}\\n");
      const signature = signFileWithAuditor(process.cwd(), "adapters.yaml");
      console.log(JSON.stringify({ signature, file: statSync(signature).isFile(), valid: verifySignedFileWithAuditor(process.cwd(), "adapters.yaml").valid }));
    `], { cwd: root, env: process.env, encoding: "utf8", timeout: 20_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ signature: "adapters.yaml.sig", file: true, valid: true });
  });

  it("creates and replaces a valid signature at the native absolute path", () => {
    const root = workspace();
    const file = join(root, ".amc", "adapters.yaml");
    writeFileSync(file, "adapters: {}\n");
    const signature = signFileWithAuditor(root, file);
    expect(statSync(signature).isFile()).toBe(true);
    expect(verifySignedFileWithAuditor(root, file).valid).toBe(true);
    if (process.platform !== "win32") expect(statSync(signature).mode & 0o777).toBe(0o644);

    writeFileSync(file, "adapters: { changed: true }\n");
    expect(verifySignedFileWithAuditor(root, file)).toMatchObject({ valid: false, reason: "digest mismatch" });
    signFileWithAuditor(root, file);
    expect(verifySignedFileWithAuditor(root, file).valid).toBe(true);
    expect(readdirSync(join(root, ".amc")).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves an existing directory at the signature destination on failure", () => {
    const root = workspace();
    const file = join(root, ".amc", "adapters.yaml");
    writeFileSync(file, "adapters: {}\n");
    mkdirSync(`${file}.sig`);
    writeFileSync(join(`${file}.sig`, "owned.txt"), "preserve existing data");
    expect(() => signFileWithAuditor(root, file)).toThrow();
    expect(readFileSync(join(`${file}.sig`, "owned.txt"), "utf8")).toBe("preserve existing data");
    expect(readdirSync(join(root, ".amc")).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  it("creates real sealed notary key and log files under a native path with spaces", () => {
    const root = workspace();
    const notaryDir = join(root, "nested notary");
    const passphrase = "notary-path-regression";
    vi.stubEnv("AMC_NOTARY_PASSPHRASE", passphrase);
    const keys = initFileSealedNotaryKey({ notaryDir, passphrase });
    const signer = loadNotarySigner({ notaryDir, backend: defaultNotaryConfig().notary.backend });
    initNotaryLog(notaryDir, signer);
    for (const file of [keys.keyPath, keys.publicKeyPath, notaryLogPath(notaryDir), notarySealPath(notaryDir), notarySealSigPath(notaryDir)]) {
      expect(statSync(file).isFile()).toBe(true);
    }
    if (process.platform !== "win32") expect(statSync(keys.keyPath).mode & 0o777).toBe(0o600);
    expect(verifyNotaryLog(notaryDir)).toMatchObject({ ok: true, count: 0 });
    appendNotaryLogEntry({ notaryDir, signer, requestId: "path-regression", kind: "BUNDLE", payloadSha256: "a".repeat(64) });
    expect(verifyNotaryLog(notaryDir)).toMatchObject({ ok: true, count: 1 });
    const log = notaryLogPath(notaryDir);
    writeFileSync(log, readFileSync(log, "utf8").replace("path-regression", "tampered-request"));
    expect(verifyNotaryLog(notaryDir).ok).toBe(false);
  });

  it("writes organization reports as files inside new native parent directories", () => {
    const root = workspace();
    initOrgConfig(root);
    const node = renderOrgNodeReportFile({ workspace: root, nodeId: "enterprise", outFile: join("reports with spaces", "node.md") });
    const comparison = renderOrgCompareReportFile({ workspace: root, nodeA: "enterprise", nodeB: "ecosystem", format: "json", outFile: join("compare reports", "comparison.json") });
    const systemic = renderOrgSystemicReport({ workspace: root, outFile: join("systemic reports", "systemic.md") });
    expect(readFileSync(node.outFile, "utf8")).toBe(node.markdown);
    expect(JSON.parse(readFileSync(comparison.outFile, "utf8"))).toEqual(comparison.payload);
    expect(readFileSync(systemic.outFile, "utf8")).toBe(systemic.markdown);
  });
});
