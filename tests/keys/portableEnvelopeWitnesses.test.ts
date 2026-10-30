import { generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { createPassportArtifact } from "../../src/passport/passportArtifact.js";
import { verifyPassportArtifactFile } from "../../src/passport/passportVerifier.js";
import { savePassportPolicy } from "../../src/passport/passportStore.js";
import { defaultPassportPolicy } from "../../src/passport/passportPolicySchema.js";
import { appendTransparencyEntry, exportTransparencyBundle, verifyTransparencyBundle } from "../../src/transparency/logChain.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { withPins } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "amc-portable-envelope-"));
  roots.push(ws);
  process.env.AMC_VAULT_PASSPHRASE = "portable-envelope-fixture-passphrase";
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  savePassportPolicy(ws, defaultPassportPolicy());
  return ws;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

describe("portable verifiers honor a present signature envelope", () => {
  test.each(["passport", "transparency"] as const)("%s rejects a mislabeled P-256 envelope while preserving absent-envelope legacy", family => {
    const ws = workspace();
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const publicKeyPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
    const keyId = signingKeyId(publicKeyPem)!;
    // This operator pin comes from a fixture-created key, before any artifact is read.
    // The existing helper only admits Ed25519, so do not send P-256 through pinnedTrust.
    const pinnedKeys = [{ keyId, purposes: ["artifact-seal"] as const, origin: "fixture operator P-256" }];
    let source: string;
    if (family === "passport") {
      source = createPassportArtifact({ workspace: ws, scopeType: "AGENT", scopeId: "default", outFile: join(ws, "source.amcpass") }).outFile;
    } else {
      appendTransparencyEntry({ workspace: ws, type: "BOM_SIGNED", agentId: "default",
        artifact: { kind: "bom", sha256: sha256Hex(Buffer.from("portable-envelope-fixture")), id: "portable-envelope-fixture" } });
      source = exportTransparencyBundle({ workspace: ws, outFile: join(ws, "source.amctlog") }).outFile;
    }
    const trust = withPins(workspaceKeyTrust(ws), pinnedKeys);
    const check = (file: string) => family === "passport"
      ? verifyPassportArtifactFile({ workspace: ws, file, trust })
      : verifyTransparencyBundle(file, trust);
    expect(check(source).ok, "the genuine producer artifact must verify first").toBe(true);

    const unpack = join(ws, "unpacked");
    mkdirSync(unpack);
    extractValidatedTarGzipArchive({ file: source, destination: unpack, label: "owned portable envelope fixture",
      limits: { maxEntries: 10_000, maxCompressedBytes: 64 * 1024 * 1024, maxEntryBytes: 64 * 1024 * 1024,
        maxTotalBytes: 256 * 1024 * 1024, maxPathBytes: 1024 } });
    const root = family === "passport" ? join(unpack, "amc-passport") : unpack;
    const signaturePath = join(root, family === "passport" ? "passport.sig" : "log.seal.sig");
    const publicKeyPath = join(root, family === "passport" ? "signer.pub" : "auditor.pub");
    const original = JSON.parse(readFileSync(signaturePath, "utf8"));
    let digestHex: string = original.digestSha256;
    if (family === "transparency") {
      const sealPath = join(root, "log.seal.json");
      const seal = JSON.parse(readFileSync(sealPath, "utf8"));
      seal.signerFingerprint = keyId;
      writeFileSync(sealPath, JSON.stringify(seal, null, 2));
      digestHex = sha256Hex(readFileSync(sealPath));
    }
    const bytes = Buffer.from(digestHex, "hex");
    const signature = lowS(sign("sha256", bytes, { key: keys.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
    // Independent mathematical control: this is a valid P-256 signature. Its label alone will be wrong.
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64"))).toBe(true);
    writeFileSync(publicKeyPath, publicKeyPem);
    const { envelope: _oldEnvelope, ...legacy } = original;
    const base = { ...legacy, digestSha256: digestHex, signature };

    for (const present of [false, true]) {
      const envelope = { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(publicKeyPem).toString("base64"),
        fingerprint: keyId, sigB64: signature, signedTs: original.signedTs,
        signer: { type: "VAULT", attestationLevel: "SOFTWARE" } };
      writeFileSync(signaturePath, JSON.stringify({ ...base, ...(present ? { envelope } : {}) }, null, 2));
      const file = join(ws, `${family}-${present ? "mislabeled" : "legacy"}.tgz`);
      const packed = spawnSync("tar", ["-czf", file, "-C", unpack, family === "passport" ? "amc-passport" : "."], { encoding: "utf8" });
      expect(packed.status, `${packed.stdout ?? ""}${packed.stderr ?? ""}`).toBe(0);
      const result = check(file);
      expect(result.ok, JSON.stringify(result.errors)).toBe(!present);
      expect(result.report.integrity.status, JSON.stringify(result.report)).toBe(present ? "fail" : "pass");
      if (present) {
        expect(result.report.trusted).toBe(false);
        expect(result.report.integrity.errors.some(error => error.includes("signature"))).toBe(true);
      }
    }
  });
});
