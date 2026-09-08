/**
 * The evidence spine as composed services (P2.1).
 *
 * Four capabilities — ledger, crypto, receipts, blobs — become services on the
 * Cordis tree so later phases can inject them instead of importing modules
 * directly. Injection is what makes them replaceable: a consumer that declares
 * `inject: ["amcLedger"]` stays PENDING when no ledger is provided, rather than
 * calling into a module that is always there whether or not it should be.
 *
 * These are facades. Every method delegates to the existing implementation with
 * the same open/close lifetime the direct callers use today, so the wrap can be
 * reverted without touching behaviour — ADR-2's strangler rule, and the reason
 * the plan says wrap-before-decompose. In particular the ledger service does
 * *not* hold a connection open across calls: pooling belongs with the database
 * consolidation, which is staged dual-write → parity → cutover, and quietly
 * changing connection lifetime here would prejudge it.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * that the published npm tarball does not contain; the architecture-boundaries
 * gate enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import { openLedger, type AppendEvidenceInput, type AppendEvidenceResult } from "../../ledger/ledger.js";
import type { RuntimeName } from "../../types.js";
import { verifyLedgerIntegrity, type VerifyResult } from "../../ledger/ledgerVerification.js";
import { getPublicKeyHistory, signHexDigest, verifyHexDigestAny, getPrivateKeyPem } from "../../crypto/keys.js";
import { mintReceipt, verifyReceipt } from "../../receipts/receipt.js";
import {
  verifyDelegationChain,
  countStoredReceipts,
  type ChainVerificationResult
} from "../../receipts/receiptChain.js";
import { storeEncryptedBlob, loadBlobPlaintext } from "../../storage/blobs/blobStore.js";

export const LEDGER_SEAM = defineSeam("amcLedger");
export const CRYPTO_SEAM = defineSeam("amcCrypto");
export const RECEIPTS_SEAM = defineSeam("amcReceipts");
export const BLOBS_SEAM = defineSeam("amcBlobs");

export interface EvidenceServiceConfig {
  /** Workspace these services read and write. */
  readonly workspace: string;
}

/**
 * Append-and-verify access to the evidence ledger.
 *
 * Each call opens and closes its own handle, matching what direct callers do.
 * The `finally` matters more than it looks: an exception mid-append that left
 * the handle open would hold a SQLite lock for the life of the process, and the
 * next writer would fail with something unrelated to the real cause.
 */
export class LedgerService extends AmcSeam {
  private readonly workspace: string;

  constructor(ctx: Context, config: EvidenceServiceConfig) {
    super(ctx, LEDGER_SEAM.name);
    this.workspace = config.workspace;
  }

  /**
   * Opens a session.
   *
   * Exposed because an event without one does not verify: the chain check
   * reports "references missing session", so append-only access would hand a
   * consumer a ledger it could fill with evidence that fails verification.
   */
  startSession(params: {
    sessionId: string;
    runtime: RuntimeName;
    binaryPath: string;
    binarySha256: string;
  }): void {
    const ledger = openLedger(this.workspace);
    try {
      ledger.startSession(params);
    } finally {
      ledger.close();
    }
  }

  append(input: AppendEvidenceInput): AppendEvidenceResult {
    const ledger = openLedger(this.workspace);
    try {
      return ledger.appendEvidenceDetailed(input);
    } finally {
      ledger.close();
    }
  }

  sealSession(sessionId: string): void {
    const ledger = openLedger(this.workspace);
    try {
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }
  }

  /**
   * Verifies the workspace's evidence.
   *
   * Returns both halves: the evidence chain and the configuration signatures
   * are different claims, and a consumer deciding whether evidence was
   * tampered with must not be answered with "a gateway config is unsigned".
   */
  verify(): VerifyResult {
    return verifyLedgerIntegrity(this.workspace);
  }
}

/** Signing and the public keys a verifier is allowed to trust. */
export class CryptoService extends AmcSeam {
  private readonly workspace: string;

  constructor(ctx: Context, config: EvidenceServiceConfig) {
    super(ctx, CRYPTO_SEAM.name);
    this.workspace = config.workspace;
  }

  sign(digestHex: string, kind: "monitor" | "auditor" = "auditor"): string {
    return signHexDigest(digestHex, getPrivateKeyPem(this.workspace, kind));
  }

  verify(digestHex: string, signature: string, kind: "monitor" | "auditor" = "auditor"): boolean {
    return verifyHexDigestAny(digestHex, signature, this.trustedKeys(kind));
  }

  /**
   * The keys that may sign for a role.
   *
   * Read through getPublicKeyHistory, which fails closed on a broken hash
   * chain — a key appended by someone with workspace write access does not
   * become trusted just because it is in the file.
   */
  trustedKeys(kind: "monitor" | "auditor" | "lease" | "session"): string[] {
    return getPublicKeyHistory(this.workspace, kind);
  }
}

/** Receipts and the delegation chains between them. */
export class ReceiptsService extends AmcSeam {
  private readonly workspace: string;

  constructor(ctx: Context, config: EvidenceServiceConfig) {
    super(ctx, RECEIPTS_SEAM.name);
    this.workspace = config.workspace;
  }

  mint(input: Parameters<typeof mintReceipt>[0]): ReturnType<typeof mintReceipt> {
    return mintReceipt(input);
  }

  verify(receipt: string, publicKeysPem: string[]): ReturnType<typeof verifyReceipt> {
    return verifyReceipt(receipt, publicKeysPem);
  }

  verifyChain(leafReceiptId: string, publicKeysPem: string[]): ChainVerificationResult {
    return verifyDelegationChain(leafReceiptId, publicKeysPem, this.workspace);
  }

  /** How many chained receipts exist — distinguishes "absent id" from "none recorded". */
  chainedCount(): number {
    return countStoredReceipts(this.workspace);
  }
}

/** Encrypted evidence payloads held outside the ledger rows. */
export class BlobsService extends AmcSeam {
  private readonly workspace: string;

  constructor(ctx: Context, config: EvidenceServiceConfig) {
    super(ctx, BLOBS_SEAM.name);
    this.workspace = config.workspace;
  }

  store(plaintext: Buffer): ReturnType<typeof storeEncryptedBlob> {
    return storeEncryptedBlob(this.workspace, plaintext);
  }

  load(payloadPath: string): ReturnType<typeof loadBlobPlaintext> {
    return loadBlobPlaintext(this.workspace, payloadPath);
  }
}

/**
 * Registers all four as one unit.
 *
 * They are provided together because a consumer of evidence needs the whole
 * spine: a ledger whose receipts cannot be verified, or whose blobs cannot be
 * read, is not a usable half.
 */
export const evidenceServices = {
  name: "amc-evidence-services",
  apply(ctx: Context, config: EvidenceServiceConfig): void {
    ctx.plugin(LedgerService, config);
    ctx.plugin(CryptoService, config);
    ctx.plugin(ReceiptsService, config);
    ctx.plugin(BlobsService, config);
  }
};
