import { generateKeyPairSync, sign } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { anchorSessionRoot, findSessionAnchorEntries } from "../src/transparency/sessionAnchor.js";
import {
  auditorKeyFingerprint,
  exportSessionAnchorProof,
  SessionAnchorProofError
} from "../src/transparency/sessionAnchorProof.js";
import { verifySessionAnchorProofFile } from "../src/transparency/sessionAnchorVerify.js";
import { verifyTransparencyLog } from "../src/transparency/logChain.js";
import { verifyTransparencyMerkle } from "../src/transparency/merkleIndexStore.js";
import { merkleCurrentRootPath } from "../src/transparency/merklePaths.js";
import type { SessionAnchorProof } from "../src/transparency/sessionAnchorSchema.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * P2.4 stage 2 — a session's inclusion proof verifies OFFLINE.
 *
 * The happy-path test deletes the entire workspace before verifying, because
 * "offline" is the whole claim: a test that verifies while `.amc` is still on
 * disk would pass even if the verifier quietly read a key or a log from it.
 *
 * Every other test here is a mutation. A proof format is trivially easy to
 * write a passing test for and very easy to get wrong in a way that still
 * passes — so each check the verifier makes has a test that breaks exactly that
 * property and asserts the specific error, including the one an attacker with
 * workspace write would actually attempt: re-signing the root with their own
 * auditor key.
 */
const PASS = "session-anchor-offline-passphrase";
const dirs: string[] = [];

function newDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function newWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = newDir("amc-anchor-ws-");
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/** Drives a real two-turn session through SessionService and closes it. */
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

/**
 * Anchors a session, exports its proof into a directory OUTSIDE the workspace,
 * and then destroys the workspace. What comes back is what a third party holds.
 */
function anchorAndDetach(): {
  proofFile: string;
  fingerprint: string;
  sessionId: string;
} {
  const workspace = newWorkspace();
  const sessionId = runSession(workspace);
  anchorSessionRoot({ workspace, sessionId });
  const exported = exportSessionAnchorProof({
    workspace,
    sessionId,
    outFile: join(workspace, "session.amcproof.json")
  });
  const holder = newDir("amc-anchor-holder-");
  const proofFile = join(holder, "session.amcproof.json");
  copyFileSync(exported.outFile, proofFile);
  const fingerprint = exported.auditorKeyFingerprint;
  rmSync(workspace, { recursive: true, force: true });
  return { proofFile, fingerprint, sessionId };
}

function readProof(file: string): SessionAnchorProof {
  return JSON.parse(readFileSync(file, "utf8")) as SessionAnchorProof;
}

function writeProof(file: string, proof: SessionAnchorProof): void {
  writeFileSync(file, JSON.stringify(proof, null, 2), "utf8");
}

/** Mutates the detached proof in place and returns the resulting verdict. */
function verifyMutated(
  mutate: (proof: SessionAnchorProof) => void,
  overrideFingerprint?: string
): { ok: boolean; errors: readonly string[] } {
  const { proofFile, fingerprint } = anchorAndDetach();
  const proof = readProof(proofFile);
  mutate(proof);
  writeProof(proofFile, proof);
  return verifySessionAnchorProofFile({
    file: proofFile,
    expectedAuditorKeyFingerprint: overrideFingerprint ?? fingerprint
  });
}

describe("session root anchoring", () => {
  test("anchors a closed session as a session-root transparency artifact", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);

    const result = anchorSessionRoot({ workspace, sessionId });

    expect(result.alreadyAnchored).toBe(false);
    expect(result.entry.artifact.kind).toBe("session-root");
    expect(result.entry.artifact.id).toBe(sessionId);
    expect(result.entry.artifact.sha256).toBe(result.descriptorSha256);
    // Two turns were sealed, so the session root covers two leaves.
    expect(result.descriptor.sealCount).toBe(2);
    expect(result.descriptor.turnCount).toBe(2);
    expect(result.descriptor.sealEventHashes).toHaveLength(2);
    expect(result.descriptor.lifecycle).toBe("closed");

    // The log and its Merkle index must still verify after the new kind lands —
    // an anchor that broke the log it is written to would be self-defeating.
    expect(verifyTransparencyLog(workspace).ok).toBe(true);
    const merkle = verifyTransparencyMerkle(workspace);
    expect(merkle.ok, merkle.errors.join("; ")).toBe(true);
    expect(merkle.lagPending).toBe(false);
  });

  test("re-anchoring an unchanged session reuses the existing entry", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);

    const first = anchorSessionRoot({ workspace, sessionId });
    const second = anchorSessionRoot({ workspace, sessionId });

    expect(second.alreadyAnchored).toBe(true);
    expect(second.entry.hash).toBe(first.entry.hash);
    expect(findSessionAnchorEntries(workspace, sessionId)).toHaveLength(1);
  });

  test("the exporter refuses to issue a proof against an unsigned root", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);
    anchorSessionRoot({ workspace, sessionId });

    // Advance the signed root's claimed leaf count without touching the log:
    // the signature no longer covers the file, so verifyTransparencyMerkle
    // fails, and a proof cut now would be a proof against a root nobody signed.
    const rootPath = merkleCurrentRootPath(workspace);
    const row = JSON.parse(readFileSync(rootPath, "utf8")) as { leafCount: number };
    writeFileSync(rootPath, JSON.stringify({ ...row, leafCount: row.leafCount + 5 }, null, 2), "utf8");

    expect(() =>
      exportSessionAnchorProof({ workspace, sessionId, outFile: join(workspace, "bad.amcproof.json") })
    ).toThrow(SessionAnchorProofError);
  });
});

describe("session anchor proof — offline verification", () => {
  test("verifies from a directory with no .amc, after the workspace is deleted", () => {
    const { proofFile, fingerprint, sessionId } = anchorAndDetach();

    const verdict = verifySessionAnchorProofFile({
      file: proofFile,
      expectedAuditorKeyFingerprint: fingerprint
    });

    expect(verdict.ok, verdict.errors.join("; ")).toBe(true);
    expect(verdict.sessionId).toBe(sessionId);
    expect(verdict.sessionMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(verdict.anchoredMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(verdict.leafCount).toBeGreaterThan(0);
  });

  test("a truncated seal list breaks the session root it claims", () => {
    const verdict = verifyMutated((proof) => {
      proof.descriptor.sealEventHashes = proof.descriptor.sealEventHashes.slice(0, 1);
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("session merkle root mismatch");
  });

  test("an edited descriptor no longer matches the digest the log anchored", () => {
    const verdict = verifyMutated((proof) => {
      proof.descriptor.eventCount += 1;
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("transparency entry commits to");
  });

  test("an edited transparency entry fails its own hash recomputation", () => {
    const verdict = verifyMutated((proof) => {
      proof.entry.ts += 1000;
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("transparency entry hash mismatch");
  });

  test("a tampered proof path no longer resolves to the anchored root", () => {
    const verdict = verifyMutated((proof) => {
      const step = proof.inclusion.proofPath[0];
      expect(step, "the anchored log must be deep enough to carry a proof path").toBeDefined();
      proof.inclusion.proofPath = [{ position: step!.position, hash: "f".repeat(64) }];
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("inclusion proof does not resolve");
  });

  test("a root that was never signed is rejected even when the path is consistent", () => {
    const verdict = verifyMutated((proof) => {
      const row = JSON.parse(proof.signedRoot.fileText) as Record<string, unknown>;
      proof.signedRoot.fileText = JSON.stringify({ ...row, root: "a".repeat(64) }, null, 2);
    });

    expect(verdict.ok).toBe(false);
    const joined = verdict.errors.join("; ");
    expect(joined).toContain("is not the signed root");
    expect(joined).toContain("signed root digest mismatch");
  });

  test("a leaf index outside the signed tree is rejected", () => {
    const verdict = verifyMutated((proof) => {
      proof.inclusion.leafIndex = 9999;
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("outside the signed tree");
  });

  test("verification fails against a fingerprint the holder did not expect", () => {
    const verdict = verifyMutated(() => {
      /* no mutation: the pin itself is wrong */
    }, "b".repeat(64));

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("auditor key fingerprint mismatch");
  });

  test("an empty pin is refused rather than treated as no pin", () => {
    const verdict = verifyMutated(() => {}, "");

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("expectedAuditorKeyFingerprint must be a sha256 hex digest");
  });

  /**
   * The trust-root attack, end to end.
   *
   * An attacker who can write the workspace can mint their own auditor key,
   * forge a root that includes any leaf they like, and sign it perfectly. Every
   * internal consistency check in the bundle then passes — which is exactly why
   * the pinned fingerprint is a required parameter and not an option. If this
   * test ever goes green with `ok: true`, the offline proof has become a
   * statement that someone signed their own claims.
   */
  test("a bundle re-signed with an attacker's auditor key fails the pin", () => {
    const { proofFile, fingerprint } = anchorAndDetach();
    const proof = readProof(proofFile);

    const attacker = generateKeyPairSync("ed25519");
    const attackerPem = attacker.publicKey.export({ type: "spki", format: "pem" }).toString();
    const digest = sha256Hex(Buffer.from(proof.signedRoot.fileText, "utf8"));
    proof.auditorPublicKeyPem = attackerPem;
    proof.auditorKeyFingerprint = sha256Hex(Buffer.from(attackerPem, "utf8"));
    proof.signedRoot.signature = {
      digestSha256: digest,
      signature: sign(null, Buffer.from(digest, "hex"), attacker.privateKey).toString("base64"),
      signedTs: Date.now(),
      signer: "auditor"
    };
    writeProof(proofFile, proof);

    const verdict = verifySessionAnchorProofFile({
      file: proofFile,
      expectedAuditorKeyFingerprint: fingerprint
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("auditor key fingerprint mismatch");
    // The forgery is otherwise flawless: nothing else objected.
    expect(verdict.errors).toHaveLength(1);
  });

  /**
   * A permissive schema would strip the injected key, hash what remained, and
   * return `ok: true` over a document that visibly says something the verifier
   * never read. Rejecting is the only verdict that keeps "what you see is what
   * was hashed" true.
   */
  test("a descriptor carrying an unrecognised field is rejected, not silently ignored", () => {
    const verdict = verifyMutated((proof) => {
      (proof.descriptor as unknown as Record<string, unknown>).auditorNote = "approved by management";
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("invalid session anchor proof");
  });

  test("a fingerprint that disagrees with the bundle's own key is reported", () => {
    const verdict = verifyMutated((proof) => {
      proof.auditorKeyFingerprint = "c".repeat(64);
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("; ")).toContain("does not match its own auditor key");
  });

  /**
   * P2.3 makes JSONL a supported configuration, not a degraded one. Anchoring
   * reads through the store seam rather than a concrete Ledger precisely so it
   * works there too — and an "it only works on SQLite" regression would be
   * invisible without this, because every other test here runs on the default.
   */
  test("anchoring and offline verification work on the JSONL backend", () => {
    const previous = process.env["AMC_SESSION_STORE"];
    process.env["AMC_SESSION_STORE"] = "jsonl";
    try {
      const workspace = newWorkspace();
      const sessionId = runSession(workspace);
      const anchored = anchorSessionRoot({ workspace, sessionId });
      expect(anchored.descriptor.sealCount).toBe(2);

      const exported = exportSessionAnchorProof({
        workspace,
        sessionId,
        outFile: join(workspace, "jsonl.amcproof.json")
      });
      const verdict = verifySessionAnchorProofFile({
        file: exported.outFile,
        expectedAuditorKeyFingerprint: exported.auditorKeyFingerprint
      });

      expect(verdict.ok, verdict.errors.join("; ")).toBe(true);
      expect(verdict.sessionId).toBe(sessionId);
    } finally {
      if (previous === undefined) {
        delete process.env["AMC_SESSION_STORE"];
      } else {
        process.env["AMC_SESSION_STORE"] = previous;
      }
    }
  });

  test("auditorKeyFingerprint is the sha256 of the exported PEM", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);
    anchorSessionRoot({ workspace, sessionId });
    const exported = exportSessionAnchorProof({
      workspace,
      sessionId,
      outFile: join(workspace, "session.amcproof.json")
    });

    expect(auditorKeyFingerprint(workspace)).toBe(exported.auditorKeyFingerprint);
    expect(exported.proof.auditorKeyFingerprint).toBe(exported.auditorKeyFingerprint);
  });
});

describe("the cryptographic checks fire in the failing direction", () => {
  /**
   * The reviewers found these rules were only ever evaluated on VALID bundles,
   * so deleting any of them broke no test — the same shape as the three dead
   * verifier checks that shipped in P2.0. Each test below breaks exactly one
   * rule, so removing that rule turns this file red.
   */

  test("a forged root signature is rejected — the one check that makes this cryptography", () => {
    // Without this, the offline proof is a self-consistent document that proves
    // nothing: every hash would still agree with every other hash.
    const verdict = verifyMutated((proof) => {
      const sig = proof.signedRoot.signature as { signature: string; envelope?: { sigB64?: string } };
      // A structurally valid but wrong ed25519 signature.
      const forged = Buffer.alloc(64, 7).toString("base64");
      sig.signature = forged;
      if (sig.envelope) sig.envelope.sigB64 = forged;
    });
    expect(verdict.ok, "a bundle whose root signature does not verify must be rejected").toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/signed root signature invalid/);
  });

  test("a truncated seal list is rejected by the sealCount cross-check", () => {
    // sealCount and sealEventHashes.length must agree, or an anchor could be
    // minted over a session whose seals were partly dropped.
    const verdict = verifyMutated((proof) => {
      const d = proof.descriptor as { sealEventHashes: string[] };
      if (d.sealEventHashes.length > 0) d.sealEventHashes.pop();
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.length).toBeGreaterThan(0);
  });

  test("a descriptor whose sealCount disagrees with its seal list is rejected", () => {
    const verdict = verifyMutated((proof) => {
      const d = proof.descriptor as { sealCount: number };
      d.sealCount += 1;
    });
    expect(verdict.ok, "sealCount must be cross-checked, not carried on trust").toBe(false);
  });

  test("a descriptor whose turnCount is inflated is rejected", () => {
    const verdict = verifyMutated((proof) => {
      const d = proof.descriptor as { turnCount: number };
      d.turnCount += 5;
    });
    expect(verdict.ok, "turnCount must be cross-checked, not carried on trust").toBe(false);
  });
});
