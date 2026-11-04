import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { canonicalize } from "../../../../src/utils/json.js";
import { fixtureResult, type OracleRunResult } from "./deviceSimulator.js";

export interface MarkingInput {
  assets: Array<{ kind: "image" | "audio"; bytes: string }>;
  signer: "pinned" | "unknown";
  markingPresent: boolean;
  /** Models bytes stripped or rewritten after the issuer marked the original output. */
  publishedSuffix: string;
  publishReceiptsAvailable: boolean;
  verifierAvailable: boolean;
}
interface Marking { issuer: string; signature: Buffer }
const signedMessage = (kind: "image" | "audio", bytes: Buffer): string => canonicalize({ kind, sha256: sha256Hex(bytes) });

/** The authority is pinned by the fixture harness, independently of the marking under inspection. */
export function verifyMarking(kind: "image" | "audio", bytes: Buffer, marking: Marking | null,
  pinned: ReadonlyMap<string, KeyObject>): boolean {
  if (marking === null) return false;
  const key = pinned.get(marking.issuer);
  return key !== undefined && verify(null, Buffer.from(signedMessage(kind, bytes)), key, marking.signature);
}

export function runMarkingVerifier(input: MarkingInput): OracleRunResult {
  if (input.publishReceiptsAvailable !== true) return fixtureResult("not_evaluated", "publish_receipts_missing");
  if (input.verifierAvailable !== true) return fixtureResult("not_evaluated", "verifier_unavailable");
  if (typeof input.markingPresent !== "boolean" || !["pinned", "unknown"].includes(input.signer)) {
    return fixtureResult("not_evaluated", "marking_protocol_invalid");
  }
  if (input.assets.some((asset) => asset.bytes.length === 0) || input.assets.length !== 2 || !["image", "audio"].every((kind) => input.assets.some((asset) => asset.kind === kind))) {
    return fixtureResult("not_evaluated", "media_incomplete");
  }
  // Test-only signing keys exist in memory for this run and are never written to a fixture or receipt.
  const authority = generateKeyPairSync("ed25519");
  const signer = input.signer === "pinned" ? authority : generateKeyPairSync("ed25519");
  const issuer = input.signer === "pinned" ? "fixture-authority" : "unknown-authority";
  const pinned = new Map([["fixture-authority", authority.publicKey]]);
  const published = input.assets.map((asset) => {
    const original = Buffer.from(asset.bytes);
    const marking = input.markingPresent === true ? { issuer, signature: sign(null, Buffer.from(signedMessage(asset.kind, original)), signer.privateKey) } : null;
    const bytes = Buffer.concat([original, Buffer.from(input.publishedSuffix)]);
    return { kind: asset.kind, bytes, marking };
  });
  const valid = published.every((asset) => verifyMarking(asset.kind, asset.bytes, asset.marking, pinned));
  const reasonCode = valid ? "marking_verified" : !input.markingPresent ? "marking_absent"
    : input.signer === "unknown" ? "issuer_unknown" : "marking_invalid";
  const decision = valid ? "allow" : "deny";
  return { ...fixtureResult(decision, reasonCode), receipts: published.map((asset) =>
    ({ decision, mediaKind: asset.kind, bytesSha256: sha256Hex(asset.bytes) })) };
}
