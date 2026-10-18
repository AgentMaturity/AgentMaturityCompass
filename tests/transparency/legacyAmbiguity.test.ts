import { describe, expect, test } from "vitest";
import {
  entryInclusionProof, entryTreeRoot, verifyEntryInclusion, type MerkleProofStep
} from "../../src/transparency/merkle.js";

// Self-authored, already-derived synthetic entry digests; no log or signed authority.
const THREE = ["11".repeat(32), "22".repeat(32), "33".repeat(32)];
const FOUR = [...THREE, THREE[2]!];

describe("algorithm-aware legacy ambiguity", () => {
  test("legacy three/four roots collide while RFC roots differ and both proof APIs remain usable", () => {
    const legacyThree = entryTreeRoot("amc-legacy-v1", THREE);
    const legacyFour = entryTreeRoot("amc-legacy-v1", FOUR);
    expect(legacyThree).toBe(legacyFour);
    const legacyProof = entryInclusionProof("amc-legacy-v1", THREE, 2);
    expect(legacyProof.root).toBe(legacyThree);
    expect(verifyEntryInclusion({ algorithm: "amc-legacy-v1", entryHash: THREE[2]!,
      leafIndex: 2, treeSize: 3, proofPath: legacyProof.proofPath, root: legacyThree })).toBe(true);
    expect(verifyEntryInclusion({ algorithm: "amc-legacy-v1", entryHash: FOUR[2]!,
      leafIndex: 2, treeSize: 4, proofPath: legacyProof.proofPath, root: legacyFour })).toBe(true);

    const rfcThree = entryTreeRoot("rfc9162-sha256", THREE);
    const rfcFour = entryTreeRoot("rfc9162-sha256", FOUR);
    expect(rfcThree).not.toBe(rfcFour);
    const threeProof = entryInclusionProof("rfc9162-sha256", THREE, 2);
    const fourProof = entryInclusionProof("rfc9162-sha256", FOUR, 2);
    expect(threeProof.root).toBe(rfcThree);
    expect(fourProof.root).toBe(rfcFour);
    expect(verifyEntryInclusion({ algorithm: "rfc9162-sha256", entryHash: THREE[2]!,
      leafIndex: 2, treeSize: 3, proofPath: threeProof.proofPath, root: rfcThree })).toBe(true);
    expect(verifyEntryInclusion({ algorithm: "rfc9162-sha256", entryHash: FOUR[2]!,
      leafIndex: 2, treeSize: 4, proofPath: fourProof.proofPath, root: rfcFour })).toBe(true);
    expect(verifyEntryInclusion({ algorithm: "rfc9162-sha256", entryHash: FOUR[2]!,
      leafIndex: 2, treeSize: 4, proofPath: threeProof.proofPath, root: rfcFour })).toBe(false);
  });

  test("RFC entry verification needs index and size and derives sides rather than trusting flags", () => {
    const proof = entryInclusionProof("rfc9162-sha256", FOUR, 1);
    const input: Parameters<typeof verifyEntryInclusion>[0] = { algorithm: "rfc9162-sha256", entryHash: FOUR[1]!, leafIndex: 1,
      treeSize: 4, proofPath: proof.proofPath, root: proof.root };
    expect(verifyEntryInclusion(input)).toBe(true);
    expect(verifyEntryInclusion({ ...input, leafIndex: undefined })).toBe(false);
    expect(verifyEntryInclusion({ ...input, treeSize: undefined })).toBe(false);
    const reversedFlags = proof.proofPath.map((step): MerkleProofStep => ({
      position: step.position === "left" ? "right" : "left", hash: step.hash
    }));
    expect(verifyEntryInclusion({ ...input, proofPath: reversedFlags })).toBe(true);
    expect(verifyEntryInclusion({ ...input, entryHash: "not-a-digest" })).toBe(false);
  });
});
