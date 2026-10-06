import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createAuditBinderArtifact } from "../src/audit/binderArtifact.js";
import { createPassportArtifact } from "../src/passport/passportArtifact.js";
import * as binderVerifier from "../src/audit/binderVerifier.js";
import * as passportVerifier from "../src/passport/passportVerifier.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { passportPolicySigPath, revokePassport, savePassportPolicy } from "../src/passport/passportStore.js";
import { binderExportsScopeDir } from "../src/audit/binderStore.js";
import { auditPolicySigPath } from "../src/audit/auditPolicyStore.js";
import { binderPiiScanSchema } from "../src/audit/binderSchema.js";
import { passportPiiScanSchema } from "../src/passport/passportSchema.js";
import { extractValidatedTarGzipArchive } from "../src/security/safeTarArchive.js";
import { sha256Hex } from "../src/utils/hash.js";
import { cleanupSignedArtifactVerification } from "../src/utils/signedArtifactVerification.js";
import type { TrustContext } from "../src/trust/index.js";
import { pinnedTrust, workspaceKeyTrust } from "./helpers/trustContext.js";

const archive = "unused-code/2026-10-02-native/signed-artifacts";
const owned: string[] = [];
const sourceHashes = {
  "src/audit/binderVerifier.ts": "c0497062161defcd8edbf877e463bbd14140b8095a32394f3383cb7991df52c8",
  "src/passport/passportVerifier.ts": "c22f33a747c722f72cbac7ce0ddeb6969004904b80edd9a29cd5a2acf2dbf566"
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-signed-artifact-parity-"));
  owned.push(root);
  return root;
}

// Execute each entire archived module with its actual unchanged imported modules.
// Only TS compilation/module loading is adapted; no verifier body is reconstructed.
async function originalModule<T>(path: keyof typeof sourceHashes): Promise<T> {
  const bytes = readFileSync(resolve(archive, "originals", path));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sourceHashes[path]);
  const source = bytes.toString("utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
  const dependencies = new Map<string, unknown>();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    const location = specifier.startsWith(".")
      ? resolve(dirname(path), specifier).replace(/\.js$/, ".ts")
      : specifier;
    dependencies.set(specifier, await vi.importActual(location));
  }
  const compiled = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true
  });
  expect(compiled.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, Buffer, Date,
    require: (specifier: string) => {
      if (!dependencies.has(specifier)) throw new Error(`Unmapped actual dependency: ${specifier}`);
      return dependencies.get(specifier);
    }
  }, { filename: `${path}.archived.cjs` });
  return exports as T;
}

type VerifyParams = { file: string; workspace?: string; publicKeyPath?: string };
type VerifyResult = { ok: boolean; errors: Array<{ code: string; message: string }>; fileSha256: string };
interface Domain {
  name: "binder" | "passport";
  directory: string;
  file: string;
  verify(params: VerifyParams): VerifyResult;
  original(params: VerifyParams): VerifyResult;
}
let workspace: string;
let originalBinder: typeof binderVerifier;
let originalPassport: typeof passportVerifier;
let domains: Domain[];
let operatorTrust: TrustContext;

/**
 * P0-09 PR 2: the passport verifier takes the operator's trust context and returns a report. The parity runs with the
 * workspace's auditor key pinned (recorded at creation), keeps the getter order of the original parameters and
 * compares every original field; the cases where P0-09 changes the verdict on purpose are asserted below.
 */
function passportWithTrust(params: VerifyParams, trust: TrustContext = operatorTrust): VerifyResult {
  const { report: _report, ...rest } = passportVerifier.verifyPassportArtifactFile(Object.create(params, { trust: { value: trust } }));
  return rest;
}

beforeAll(async () => {
  originalBinder = await originalModule<typeof binderVerifier>("src/audit/binderVerifier.ts");
  originalPassport = await originalModule<typeof passportVerifier>("src/passport/passportVerifier.ts");
  workspace = fixture();
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  operatorTrust = workspaceKeyTrust(workspace);
  savePassportPolicy(workspace, defaultPassportPolicy());
  const binder = await createAuditBinderArtifact({ workspace, scopeType: "WORKSPACE", outFile: join(workspace, "test.amcaudit") });
  const passport = createPassportArtifact({ workspace, scopeType: "WORKSPACE", outFile: join(workspace, "test.amcpass") });
  domains = [
    { name: "binder", directory: "amc-audit", file: binder.outFile, verify: binderVerifier.verifyAuditBinderFile, original: originalBinder.verifyAuditBinderFile },
    { name: "passport", directory: "amc-passport", file: passport.outFile, verify: (params) => passportWithTrust(params), original: originalPassport.verifyPassportArtifactFile }
  ];
});

afterAll(() => {
  vi.restoreAllMocks();
  for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true });
});

function unpack(domain: Domain): { root: string; document: string } {
  const root = fixture();
  extractValidatedTarGzipArchive({
    file: domain.file, destination: root, label: "owned parity fixture",
    limits: { maxEntries: 10000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 }
  });
  return { root, document: join(root, domain.directory) };
}

function pack(root: string): string {
  const file = join(fixture(), "test.tar.gz");
  const result = spawnSync("tar", ["-czf", file, "-C", root, "."], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return file;
}

function compare(domain: Domain, params: VerifyParams): VerifyResult {
  const actual = domain.verify(params);
  const expected = domain.original(params);
  // Native parser/FS errors can name the independently allocated verifier temp dir.
  const normalize = (value: VerifyResult) => JSON.stringify(value).replace(/amc-(?:audit|passport)-verify-[A-Za-z0-9]+/g, "amc-verifier-TMP");
  expect(normalize(actual)).toBe(normalize(expected));
  expect(actual.fileSha256).toBe(sha256Hex(readFileSync(params.file)));
  return actual;
}

function codes(result: VerifyResult): string[] { return result.errors.map(row => row.code); }

describe("entire archived signed artifact workflows against real local signatures", () => {
  test("archives are pinned to the ownership base with a complete restoration map", () => {
    const map = JSON.parse(readFileSync(resolve(archive, "restoration-map.json"), "utf8")) as {
      baseCommit: string; files: Array<{ sourcePath: keyof typeof sourceHashes; archivePath: string; restoreTo: string; sha256: string; bytes: number }>;
    };
    expect(map.baseCommit).toBe("b30e1c771b89e23ecedb13604cc0bf9102078136");
    expect(map.files.map(row => row.sourcePath).sort()).toEqual(Object.keys(sourceHashes).sort());
    for (const entry of map.files) {
      const bytes = readFileSync(resolve(entry.archivePath));
      expect(entry.restoreTo).toBe(entry.sourcePath);
      expect(entry.sha256).toBe(sourceHashes[entry.sourcePath]);
      expect(bytes.length).toBe(entry.bytes);
      expect(sha256Hex(bytes)).toBe(entry.sha256);
    }
    expect(Object.keys(originalBinder)).toEqual(Object.keys(binderVerifier));
    expect(Object.keys(originalPassport)).toEqual(Object.keys(passportVerifier));
  });

  for (const name of ["binder", "passport"] as const) {
    describe(name, () => {
      const domain = () => domains.find(row => row.name === name)!;
      test("real signatures verify through embedded, explicit and workspace trust paths", () => {
        const d = domain();
        const { document } = unpack(d);
        for (const params of [{ file: d.file }, { file: d.file, workspace }, { file: d.file, publicKeyPath: join(document, "signer.pub") }]) {
          expect(compare(d, params).ok).toBe(true);
        }
      });

      test("public argument getters keep the original access order", () => {
        const d = domain(), currentAccess: string[] = [], originalAccess: string[] = [];
        const params = (access: string[]): VerifyParams => ({
          get file() { access.push("file"); return d.file; },
          get workspace() { access.push("workspace"); return workspace; },
          get publicKeyPath() { access.push("publicKeyPath"); return undefined; }
        });
        expect(d.verify(params(currentAccess))).toEqual(d.original(params(originalAccess)));
        // P0-09: the passport verifier no longer reads workspace keys to check the signature (the original read
        // workspace a second time for that); the trust context decides instead.
        expect(currentAccess).toEqual(name === "passport" ? originalAccess.slice(0, -1) : originalAccess);
        if (name === "passport") expect(originalAccess.at(-1)).toBe("workspace");
      });

      test.each(["renamed child", "flat root"])("preserves %s root discovery", layout => {
        const d = domain(), { root, document } = unpack(d);
        if (layout === "renamed child") renameSync(document, join(root, "custom"));
        else {
          for (const entry of readdirSync(document)) renameSync(join(document, entry), join(root, entry));
          rmSync(document, { recursive: true });
        }
        expect(compare(d, { file: pack(root), workspace }).ok).toBe(true);
      });

      test("canonical directory wins even when a valid sibling exists", () => {
        const d = domain(), { root, document } = unpack(d);
        renameSync(document, join(root, "valid-child"));
        mkdirSync(document);
        expect(codes(compare(d, { file: pack(root) }))).toEqual([`MISSING_${name.toUpperCase()}_JSON`]);
      });

      test.each(["json", "sig"])("missing %s refuses with the original ordered error", extension => {
        const d = domain(), { root, document } = unpack(d);
        rmSync(join(document, `${name}.${extension}`));
        const result = compare(d, { file: pack(root) });
        expect(result.ok).toBe(false);
        expect(codes(result)).toEqual([`MISSING_${name.toUpperCase()}_${extension.toUpperCase()}`]);
      });

      test("native malformed document/schema errors refuse", () => {
        const d = domain();
        for (const content of ["{bad-json", "{}", "null"]) {
          const { root, document } = unpack(d);
          writeFileSync(join(document, `${name}.json`), content);
          const result = compare(d, { file: pack(root) });
          expect(result.ok).toBe(false);
          expect(codes(result)).toEqual(["VERIFY_EXCEPTION"]);
        }
      });

      test.each(["digest", "signature", "unsupported algorithm", "envelope mismatch"])("tampered %s refuses", tamper => {
        const d = domain(), { root, document } = unpack(d);
        const path = join(document, `${name}.sig`);
        const signature = JSON.parse(readFileSync(path, "utf8"));
        if (tamper === "digest") signature.digestSha256 = "0".repeat(64);
        else if (tamper === "signature") {
          signature.signature = Buffer.alloc(64).toString("base64");
          if (signature.envelope) signature.envelope.sigB64 = signature.signature;
        } else if (tamper === "unsupported algorithm") signature.envelope.alg = "rsa";
        else signature.envelope.sigB64 = Buffer.alloc(64).toString("base64");
        writeFileSync(path, JSON.stringify(signature));
        const result = compare(d, { file: pack(root), workspace });
        expect(result.ok).toBe(false);
        expect(codes(result)).toContain(tamper === "digest" ? "DIGEST_MISMATCH" : tamper === "unsupported algorithm" ? "VERIFY_EXCEPTION" : "SIGNATURE_INVALID");
      });

      test("no admitted key and wrong explicit public key refuse", () => {
        const d = domain(), { root, document } = unpack(d);
        rmSync(join(document, "signer.pub"));
        const file = pack(root);
        const key = join(fixture(), "wrong.pub");
        writeFileSync(key, "invalid public key");
        if (name === "binder") {
          expect(codes(compare(d, { file }))).toContain("SIGNATURE_INVALID");
          expect(codes(compare(d, { file, workspace, publicKeyPath: key }))).toContain("SIGNATURE_INVALID");
          return;
        }
        // P0-09: the original refused because no key was named; now the signature is checked against the keys the
        // artifact names (here only its envelope) and admission decides. Unpinned it is refused as not-pinned;
        // with the operator's pin the same signature is admitted, whatever --pubkey text is supplied.
        expect(codes(d.original({ file }))).toContain("SIGNATURE_INVALID");
        expect(codes(d.original({ file, workspace, publicKeyPath: key }))).toContain("SIGNATURE_INVALID");
        const unpinned = passportVerifier.verifyPassportArtifactFile({ file, trust: pinnedTrust([]) });
        expect(unpinned.ok).toBe(false);
        expect(unpinned.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
        expect(passportWithTrust({ file }).ok).toBe(true);
        expect(passportWithTrust({ file, workspace, publicKeyPath: key }).ok).toBe(true);
      });

      test.each(["missing scan", "failed scan", "malformed scan", "checksum mismatch", "missing checksum"])("privacy %s retains the domain policy", tamper => {
        const d = domain(), { root, document } = unpack(d);
        const scan = join(document, "checks", "pii-scan.json"), checksum = join(document, "checks", "pii-scan.sha256");
        if (tamper === "missing scan") rmSync(scan);
        else if (tamper === "missing checksum") rmSync(checksum);
        else if (tamper === "checksum mismatch") writeFileSync(checksum, "0".repeat(64));
        else {
          writeFileSync(scan, tamper === "malformed scan" ? "{}" : JSON.stringify({ v: 1, status: "FAIL", findings: [] }));
          writeFileSync(checksum, sha256Hex(readFileSync(scan)));
        }
        const result = compare(d, { file: pack(root) });
        if (tamper === "missing checksum" && name === "passport") expect(result.ok).toBe(true);
        else {
          expect(result.ok).toBe(false);
          const error = { "missing scan": "MISSING_PII_SCAN", "failed scan": "PII_SCAN_FAILED", "malformed scan": "VERIFY_EXCEPTION", "checksum mismatch": "PII_SHA_MISMATCH", "missing checksum": "MISSING_PII_SHA" }[tamper];
          expect(codes(result)).toContain(error);
        }
      });

      test("the native schema parser getter runs before malformed scan JSON is read", () => {
        const d = domain(), { root, document } = unpack(d);
        writeFileSync(join(document, "checks", "pii-scan.json"), "INVALID_JSON");
        const file = pack(root);
        const schema = name === "binder" ? binderPiiScanSchema : passportPiiScanSchema;
        const descriptor = Object.getOwnPropertyDescriptor(schema, "parse")!;
        Object.defineProperty(schema, "parse", { configurable: true, get() { throw new Error("native schema parser getter"); } });
        try {
          const result = compare(d, { file });
          expect(result.errors.at(-1)!.message).toBe("Error: native schema parser getter");
        } finally {
          Object.defineProperty(schema, "parse", descriptor);
        }
      });

      test("proof loading preserves filename order, ignores other suffixes and refuses invalid proof bytes", () => {
        const d = domain(), { root, document } = unpack(d);
        const dir = join(document, "proofs", "inclusion");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "01.json"), "FIRST_INVALID_PROOF");
        writeFileSync(join(dir, "02.json"), "SECOND_INVALID_PROOF");
        writeFileSync(join(dir, "00.txt"), "IGNORED");
        const result = compare(d, { file: pack(root) });
        expect(codes(result)).toContain("VERIFY_EXCEPTION");
        expect(result.errors.at(-1)!.message).toContain("FIRST");
      });

      test("absent inclusion directory and ignored suffixes preserve existing proof admission", () => {
        const d = domain(), { root, document } = unpack(d);
        const dir = join(document, "proofs", "inclusion");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "ignored.txt"), "INVALID_PROOF");
        expect(compare(d, { file: pack(root) }).ok).toBe(true);
        rmSync(dir, { recursive: true });
        // Missing proof files still undergo the original proof-id binding check.
        compare(d, { file: pack(root) });
      });

      test("multiple privacy failures retain error order and checksum whitespace behavior", () => {
        const d = domain(), { root, document } = unpack(d);
        const scan = join(document, "checks", "pii-scan.json"), checksum = join(document, "checks", "pii-scan.sha256");
        writeFileSync(scan, JSON.stringify({ v: 1, status: "FAIL", findings: [] }));
        writeFileSync(checksum, `  ${"0".repeat(64)}\n`);
        expect(codes(compare(d, { file: pack(root) }))).toEqual(["PII_SCAN_FAILED", "PII_SHA_MISMATCH"]);
        writeFileSync(scan, JSON.stringify({ v: 1, status: "PASS", findings: [] }));
        writeFileSync(checksum, `  ${sha256Hex(readFileSync(scan))}\n`);
        expect(compare(d, { file: pack(root) }).ok).toBe(true);
      });

      test("a cryptographically invalid inclusion proof and mismatched ids refuse", () => {
        const d = domain(), { root, document } = unpack(d);
        const dir = join(document, "proofs", "inclusion");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "added.json"), JSON.stringify({ v: 1, proofId: "unexpected-proof", eventHash: "a".repeat(64), rootHash: "b".repeat(64), merklePath: [], verifiedBy: "amc" }));
        // P0-09: a passport proof is also bound to the signed merkle root, which adds a refusal the original lacked.
        const result = name === "binder" ? compare(d, { file: pack(root) }) : passportWithTrust({ file: pack(root) });
        expect(codes(result)).toContain("PROOF_INVALID");
        expect(codes(result)).toContain("PROOF_IDS_MISMATCH");
        if (name === "passport") expect(result.errors.map(row => row.message)).toContain("inclusion proof unexpected-proof does not resolve to the signed merkle root");
      });

      test("root and calculation-manifest hash tampering refuses", () => {
        const d = domain();
        for (const path of ["proofs/transparency.root.json", "proofs/merkle.root.json", "meta/calculation-manifest.json"]) {
          const { root, document } = unpack(d);
          mkdirSync(dirname(join(document, path)), { recursive: true });
          writeFileSync(join(document, path), "{}");
          // P0-09: a passport's inclusion proofs are also checked against the signed merkle root, so replacing that
          // root adds proof refusals the original lacked; every other case keeps exact parity.
          const signedRoot = name === "passport" && path === "proofs/merkle.root.json";
          const result = signedRoot ? passportWithTrust({ file: pack(root) }) : compare(d, { file: pack(root) });
          expect(result.ok).toBe(false);
          expect(codes(result).some(code => code.endsWith("SHA_MISMATCH"))).toBe(true);
          if (signedRoot) expect(result.errors.map(row => row.message)).toContain("signed merkle root digest mismatch");
        }
      });

      test("missing input preserves the native pre-extraction exception", () => {
        const file = join(fixture(), "missing-file");
        const outcome = (fn: Domain["verify"]) => {
          try { fn({ file }); return "did not throw"; }
          catch (error) { return String(error); }
        };
        expect(outcome(domain().verify)).toBe(outcome(domain().original));
        expect(outcome(domain().verify)).toContain("ENOENT");
      });

      test("unsupported archive data and symlink extraction are refused", () => {
        const d = domain(), root = fixture();
        const bad = join(root, "invalid.tar.gz");
        writeFileSync(bad, "not an archive");
        expect(codes(compare(d, { file: bad }))).toEqual(["VERIFY_EXCEPTION"]);
        const result = spawnSync("ln", ["-s", "/etc", join(root, "escape")], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        const refused = compare(d, { file: pack(root) });
        expect(refused.ok).toBe(false);
        expect(codes(refused)).toEqual(["VERIFY_EXCEPTION"]);
        expect(refused.errors[0]!.message).toMatch(/link/i);
      });
    });
  }

  test("multiple unbound expected proof ids refuse even when their input order differs", () => {
    const d = domains.find(row => row.name === "binder")!;
    const { root, document } = unpack(d);
    const path = join(document, "binder.json");
    const binder = JSON.parse(readFileSync(path, "utf8"));
    binder.proofBindings.includedEventProofIds = ["unbound-z", "unbound-a"];
    writeFileSync(path, JSON.stringify(binder));
    const result = compare(d, { file: pack(root), workspace });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("DIGEST_MISMATCH");
    expect(codes(result)).toContain("PROOF_IDS_MISMATCH");
  });

  test("workspace verification reports every refusal from a tampered registered binder", () => {
    const d = domains.find(row => row.name === "binder")!;
    const { root, document } = unpack(d);
    const signaturePath = join(document, "binder.sig");
    const signature = JSON.parse(readFileSync(signaturePath, "utf8"));
    signature.signature = Buffer.alloc(64).toString("base64");
    if (signature.envelope) signature.envelope.sigB64 = signature.signature;
    writeFileSync(signaturePath, JSON.stringify(signature));
    const exportRoot = binderExportsScopeDir(workspace, "WORKSPACE", "coverage-refusal");
    mkdirSync(exportRoot, { recursive: true });
    const file = join(exportRoot, "tampered.amcaudit");
    copyFileSync(pack(root), file);
    const fileResult = compare(d, { file, workspace });
    expect(fileResult.ok).toBe(false);
    expect(codes(fileResult)).toContain("SIGNATURE_INVALID");
    const actual = binderVerifier.verifyAuditWorkspace({ workspace });
    expect(actual).toEqual(originalBinder.verifyAuditWorkspace({ workspace }));
    expect(actual.ok).toBe(false);
    expect(actual.errors).toContain(`export ${file}: ${fileResult.errors.map(error => error.message).join("; ")}`);
  });

  test("workspace policy trust refusals match both complete originals", () => {
    const ws = fixture();
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    savePassportPolicy(ws, defaultPassportPolicy());
    writeFileSync(auditPolicySigPath(ws), "tampered\n");
    writeFileSync(passportPolicySigPath(ws), "tampered\n");
    const binder = binderVerifier.verifyAuditWorkspace({ workspace: ws });
    const passport = passportVerifier.verifyPassportWorkspace({ workspace: ws });
    expect(binder).toEqual(originalBinder.verifyAuditWorkspace({ workspace: ws }));
    expect(passport).toEqual(originalPassport.verifyPassportWorkspace({ workspace: ws }));
    expect(binder.ok).toBe(false);
    expect(passport.ok).toBe(false);
  });

  test("passport revocation remains enforced with workspace trust", () => {
    const d = domains.find(row => row.name === "passport")!;
    const verified = passportVerifier.verifyPassportArtifactFile({ file: d.file, workspace, trust: operatorTrust });
    revokePassport({ workspace, passportId: verified.passport!.passportId, reason: "parity test revocation" });
    expect(codes(compare(d, { file: d.file, workspace }))).toContain("PASSPORT_REVOKED");
  });

  test("passport expiry is enforced without changing the signed document", () => {
    const d = domains.find(row => row.name === "passport")!;
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2100, 0, 1));
    try {
      expect(codes(compare(d, { file: d.file }))).toContain("PASSPORT_EXPIRED");
    } finally {
      now.mockRestore();
    }
  });

  test("verification cleanup removes only the supplied temporary directory", () => {
    const root = fixture(), target = join(root, "temporary"), sibling = join(root, "sibling");
    mkdirSync(target); mkdirSync(sibling);
    cleanupSignedArtifactVerification(target);
    cleanupSignedArtifactVerification(target);
    expect(() => cleanupSignedArtifactVerification(`${target}\0invalid`)).not.toThrow();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(sibling)).toBe(true);
  });
});
