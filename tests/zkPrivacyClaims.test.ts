import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  schnorrProve,
  schnorrVerify,
  createZKRangeProof,
  verifyZKRangeProof,
  pedersenCommit,
  pedersenVerify
} from "../src/vault/zkPrivacy.js";

/**
 * This module was headed "Real ZK proof protocols". It is not one, and the
 * gap was not subtle: running the code shows the proofs do not verify.
 *
 * These tests record the measured behaviour so the claim cannot quietly come
 * back, and so that anyone who fixes the maths has a failing test telling them
 * to update the labels at the same time.
 */
describe("zkPrivacy claims match what the code does", () => {
  it("schnorr proofs do not verify, so nothing may depend on them", () => {
    // Measured at 299/300 honest failures. Asserting a strong majority rather
    // than an exact count keeps this stable while still failing loudly if the
    // protocol ever starts working — at which point the labels need revisiting.
    let failures = 0;
    for (let i = 0; i < 50; i += 1) {
      if (!schnorrVerify(schnorrProve(BigInt(1000 + i)))) failures += 1;
    }
    expect(failures).toBeGreaterThan(40);
  });

  it("an honest in-range claim does not verify", () => {
    expect(verifyZKRangeProof(createZKRangeProof(72, 50))).toBe(false);
  });

  it("a forged 'verified' flag does not make a proof verify", () => {
    // Verification used to begin `if (!proof.verified) return false`, trusting
    // a boolean the prover writes into the object.
    const forged = { ...createZKRangeProof(30, 50), verified: true };
    expect(verifyZKRangeProof(forged), "the prover must not decide the verdict").toBe(false);
  });

  it("pedersen commitments still open correctly", () => {
    // The part that does work, and the only part callers should rely on.
    const c = pedersenCommit(42n);
    expect(pedersenVerify(c.commitment, 42n, BigInt("0x" + c.blindingFactor))).toBe(true);
    expect(pedersenVerify(c.commitment, 43n, BigInt("0x" + c.blindingFactor))).toBe(false);
  });

  it("no surface presents this as a zero-knowledge proof", () => {
    const source = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

    const module = source("src/vault/zkPrivacy.ts");
    expect(module).toContain("NOT a zero-knowledge proof system");
    // The name lied about what the function checked.
    expect(module).not.toContain("function verifyBitProof");

    // The commands live in their own module: cli.ts is under a descending line
    // ratchet, and the disclaimers would have pushed it past its baseline.
    const cli = source("src/cli-vault-zk-commands.ts");
    expect(cli).not.toContain('"Create a zero-knowledge range proof that an AMC score meets a threshold"');
    expect(cli).toContain("NOT a zero-knowledge proof");
    expect(source("src/cli.ts")).not.toContain("zero-knowledge range proof");

    const api = source("src/api/vaultRouter.ts");
    expect(api).toContain("zeroKnowledge: false");
  });
});

describe("shamir secret sharing", () => {
  it("reconstructs from any threshold-sized subset", async () => {
    const { shamirSplit, shamirReconstruct } = await import("../src/vault/zkPrivacy.js");
    const secret = 123456789n;
    const shares = shamirSplit(secret, 2, 3);
    expect(shares).toHaveLength(3);
    for (const pick of [[0, 1], [0, 2], [1, 2]]) {
      expect(shamirReconstruct(pick.map((i) => shares[i]!))).toBe(secret);
    }
  });

  it("the CLI splits into the number of shares the operator asked for", () => {
    // `--shares 3 --threshold 2` used to call shamirSplit(secret, 3, 2): a
    // degree-2 polynomial split into two shares, needing three to reconstruct.
    // The secret was unrecoverable the moment it was split.
    const source = readFileSync(join(process.cwd(), "src/cli-vault-zk-commands.ts"), "utf8");
    expect(source).toContain("shamirSplit(secret, k, n)");
    expect(source).not.toContain("shamirSplit(secret, n, k)");
  });
});
