import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { appendTransparencyEntry } from "../../src/transparency/logChain.js";
import { exportTransparencyProofBundle, verifyTransparencyProofBundle } from "../../src/transparency/merkleIndexStore.js";
import { SessionService } from "../../src/session/sessionService.js";
import { anchorSessionRoot } from "../../src/transparency/sessionAnchor.js";
import { exportSessionAnchorProof } from "../../src/transparency/sessionAnchorProof.js";
import { verifySessionAnchorProofFile } from "../../src/transparency/sessionAnchorVerify.js";
import type { SessionAnchorProof } from "../../src/transparency/sessionAnchorSchema.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { workspaceKeyPem, workspaceKeyTrust } from "../helpers/trustContext.js";
const roots: string[] = [];
const fresh = () => { const root = mkdtempSync(join(tmpdir(), "amc-transparency-envelope-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

test.each([
  { name: "outer proof", path: "proof.sig", error: "proof signature invalid" },
  { name: "bundled signed root", path: "root.sig", error: "signed root signature invalid" }
])("exported transparency $name forwards its own envelope through the private signedBy call", target => {
  const workspace = fresh(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const pem = workspaceKeyPem(workspace, "auditor"), trust = workspaceKeyTrust(workspace);
  const entry = appendTransparencyEntry({ workspace, type: "BOM_SIGNED", agentId: "default", artifact: { kind: "bom", sha256: sha256Hex("synthetic BOM"), id: "owned-proof" } });
  const source = exportTransparencyProofBundle({ workspace, entryHash: entry.hash, outFile: "source.amcproof" }).outFile;
  expect(verifyTransparencyProofBundle(source, trust).ok).toBe(true);
  const unpack = join(workspace, "unpacked"); mkdirSync(unpack);
  extractValidatedTarGzipArchive({ file: source, destination: unpack, label: "owned transparency proof forwarding fixture",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  const path = join(unpack, target.path); const original = JSON.parse(readFileSync(path, "utf8"));
  expect(original.envelope.alg).toBe("ed25519");
  expect(verify(null, Buffer.from(original.digestSha256, "hex"), pem, Buffer.from(original.signature, "base64"))).toBe(true);
  const pack = (label: string, value: unknown) => {
    writeFileSync(path, JSON.stringify(value)); const output = join(workspace, `${label}.amcproof`);
    const packed = spawnSync("tar", ["-czf", output, "-C", unpack, "."], { encoding: "utf8" }); expect(packed.status, packed.stderr).toBe(0);
    return output;
  };
  const bad = verifyTransparencyProofBundle(pack("bad-envelope", { ...original, envelope: { ...original.envelope, fingerprint: "0".repeat(64) } }), trust);
  expect(bad.ok).toBe(false); expect(bad.report.integrity.status).toBe("fail"); expect(bad.errors).toEqual([target.error]);
  const { envelope: _absent, ...legacy } = original;
  expect(verifyTransparencyProofBundle(pack("legacy", legacy), trust).ok).toBe(true);
  // Mutation target: remove only envelope:sig.envelope from merkleIndexStore's private signedBy checkDigestSignature.
  // Each public artifact case above must become RED independently; no private helper is exported or reconstructed.
});

// Existing tests/sessionAnchorOfflineProof.test.ts real two-turn session fixture, unchanged.
function runSession(workspace: string): string {
  const service = new SessionService(workspace);
  service.open({
    agentId: "default",
    harnessVersion: "2.4.0",
    compositionDigest: sha256Hex("composition"),
    policyDigest: sha256Hex("policy")
  });
  const sessionId = service.sessionId;
  const systemPrompt = service.recordSystemPrompt("You are a careful assistant.");

  for (const turn of [1, 2]) {
    service.startTurn({ trigger: turn === 1 ? "user" : "followup" });
    service.recordUserMessage(`turn ${turn}: summarise the log`);
    const step = service.startStep();
    service.recordRequestHeader({
      model: "claude-opus-4-8",
      providerId: "anthropic",
      params: { max_tokens: 512 },
      encoderId: "anthropic-messages",
      encoderVersion: 1,
      systemPromptEventId: systemPrompt.eventId,
      toolSchema: null,
      projectionCutoffEventId: step.eventId,
      projectionDigest: sha256Hex(`projection-${turn}`),
      sourceEventIds: [systemPrompt.eventId],
      requestBytes: JSON.stringify({ turn })
    });
    service.recordAssistantBlock({
      blockIndex: 0,
      blockKind: "text",
      stopReason: "end_turn",
      content: `answer for turn ${turn}`
    });
    service.endStep({
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 20, cacheRead: 0, cacheWrite: 0 }
    });
    service.endTurn({ reason: "complete" });
    service.sealTurn();
  }

  service.close({ reason: "completed" });
  return sessionId;
}

test("detached offline session proofs accept real P-256 with or without envelope and refuse DER, high-S, wrong labels and wrong pins", () => {
  // Independently generated operator key and pin before any proof is read. No carried key appoints its own trust.
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString(); const pin = signingKeyId(pem)!;
  const workspace = fresh(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const oldPin = sha256Hex(workspaceKeyPem(workspace, "auditor")); const sessionId = runSession(workspace);
  anchorSessionRoot({ workspace, sessionId }); const holder = fresh(), file = join(holder, "session.amcproof.json");
  exportSessionAnchorProof({ workspace, sessionId, outFile: file });
  expect(verifySessionAnchorProofFile({ file, expectedAuditorKeyFingerprint: oldPin }).ok).toBe(true);
  const original = JSON.parse(readFileSync(file, "utf8")) as SessionAnchorProof;
  const digest = sha256Hex(Buffer.from(original.signedRoot.fileText)); const message = Buffer.from(digest, "hex");
  const canonical = lowS(sign("sha256", message, { key: pair.privateKey, dsaEncoding: "ieee-p1363" }));
  const der = sign("sha256", message, { key: pair.privateKey, dsaEncoding: "der" });
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const high = Buffer.concat([canonical.subarray(0, 32), Buffer.from((order - BigInt(`0x${canonical.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
  expect(verify("sha256", message, { key: pair.publicKey, dsaEncoding: "der" }, der)).toBe(true);
  expect(verify("sha256", message, { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
  const { envelope: _originalEnvelope, ...base } = original.signedRoot.signature;
  function publish(bytes: Buffer, withEnvelope: boolean, alg = "ecdsa-p256-sha256") {
    const signature = bytes.toString("base64");
    const envelope = { v: 1, alg, pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: pin, sigB64: signature,
      signedTs: base.signedTs, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } };
    writeFileSync(file, JSON.stringify({ ...original, auditorPublicKeyPem: pem, auditorKeyFingerprint: pin,
      signedRoot: { ...original.signedRoot, signature: { ...base, digestSha256: digest, signature, ...(withEnvelope ? { envelope } : {}) } } }));
  }
  // Verification really is offline: destroy the workspace and its keys before exercising the new signature paths.
  lockVault(workspace); rmSync(workspace, { recursive: true, force: true }); expect(existsSync(join(holder, ".amc"))).toBe(false);
  for (const withEnvelope of [false, true]) {
    publish(canonical, withEnvelope);
    expect(verifySessionAnchorProofFile({ file, expectedAuditorKeyFingerprint: pin })).toMatchObject({ ok: true, errors: [], sessionId });
    expect(verifySessionAnchorProofFile({ file, expectedAuditorKeyFingerprint: oldPin }).ok).toBe(false);
    for (const invalid of [der, high]) {
      publish(invalid, withEnvelope); const result = verifySessionAnchorProofFile({ file, expectedAuditorKeyFingerprint: pin });
      expect(result.ok).toBe(false); expect(result.errors.join(";")).toContain("signed root signature invalid");
    }
  }
  for (const algorithm of ["ed25519", "rsa-sha256"]) {
    publish(canonical, true, algorithm); expect(verifySessionAnchorProofFile({ file, expectedAuditorKeyFingerprint: pin }).ok).toBe(false);
  }
}, 180_000);
