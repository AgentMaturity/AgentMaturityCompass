/**
 * P1-08 rotation statements, checked offline. A key rotation is authorized by the key it replaces, as a supplied trust
 * list admits that key for the purpose, or (key-compromise, first key) by pinned trust-list roots; the next key's
 * signature only proves possession. A root-set rotation is authorized by the pinned root set it replaces. Neither ever
 * changes a pin: the trust-list owner publishes a new list.
 */
import { canonicalize, signingKeyId, same, statementMessage, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import type { Env, Evaluation } from "../evaluation.js";
import { signedKeyRotation, signedRootRotation } from "../records/statements.js";
import { admit, distrustOf, listedPem, rootAdmission, type Admission } from "../trust.js";
import { chainHead, parseCanonical, refused, rollback, statementTail } from "./common.js";

const DAY_MS = 86_400_000;
export const MAX_OVERLAP_DAYS = 30;

const distrusted = (keyId: string, env: Env, role: string): Finding<"issuerAdmission">[] =>
  distrustOf(keyId, env.ctx) ? [{ code: "ISSUER_DISTRUSTED", detail: `the ${role} key ${keyId} is distrusted` }] : [];

export function evaluateKeyRotation(value: unknown, bytes: Uint8Array, env: Env): Evaluation {
  const parsed = parseCanonical(signedKeyRotation, value, bytes);
  if (!parsed.ok) return refused("key-rotation", parsed.finding);
  const { statement, signatures } = parsed.value;
  const integrity: Finding<"integrity">[] = chainHead(statement.sequence, statement.previousStatementSha256);
  const unverifiable: string[] = [];
  if (!same(signingKeyId(statement.nextPublicKeyPem) ?? "", statement.nextKeyId)) integrity.push({ code: "DIGEST_MISMATCH", detail: "nextKeyId is not the key id of nextPublicKeyPem" });
  const span = statement.overlap === null ? null : Date.parse(statement.overlap.notAfter) - Date.parse(statement.overlap.notBefore);
  if (statement.reason === "key-compromise" ? span !== null : span !== null && (span <= 0 || span > MAX_OVERLAP_DAYS * DAY_MS)) {
    integrity.push({ code: "MALFORMED", detail: `overlap must be null for key-compromise, otherwise positive and at most ${MAX_OVERLAP_DAYS} days` });
  }
  const message = statementMessage("AMC_KEY_ROTATION_V1", "AMC_KEY_ROTATION_V2_DIGEST", canonicalize(statement), parsed.value.signatureVersion);
  const admissions: Admission[] = [];
  const admissionFindings: Finding<"issuerAdmission">[] = [];
  const isRotated = (keyId: string) => same(keyId, statement.nextKeyId) || (statement.previousKeyId !== null && same(keyId, statement.previousKeyId));
  let rootsSigned = 0;
  for (const row of signatures) {
    // The key each role must be: next = nextKeyId, previous = previousKeyId, root = a root other than both.
    const wrongKey = row.by === "next" ? !same(row.keyId, statement.nextKeyId)
      : row.by === "previous" ? statement.previousKeyId === null || !same(row.keyId, statement.previousKeyId) : isRotated(row.keyId);
    if (wrongKey) {
      integrity.push({ code: "MALFORMED", detail: `the ${row.by} signature is by ${row.keyId}, which is not the key that role names` });
      continue;
    }
    if (row.by === "root" && !env.ctx.roots.has(row.keyId)) {
      admissions.push(rootAdmission(`root signature ${row.keyId}`, row.keyId, env.ctx));
      continue;
    }
    const pem = row.by === "next" ? statement.nextPublicKeyPem : row.by === "previous" ? listedPem(env.ctx, row.keyId) : env.ctx.rootPems.get(row.keyId) ?? null;
    if (pem === null) unverifiable.push(`${row.by} signature by ${row.keyId}: its key is not in the supplied trust lists`);
    else if (!verifySignature(message, pem, Buffer.from(row.signature, "base64"))) {
      integrity.push({ code: "SIGNATURE_INVALID", detail: `the ${row.by} signature by ${row.keyId} does not verify` });
    } else if (row.by === "root") {
      const admission = rootAdmission(`root signature ${row.keyId}`, row.keyId, env.ctx);
      admissions.push(admission);
      if (!admission.finding) rootsSigned += 1;
    }
  }
  if (!signatures.some(row => row.by === "next")) integrity.push({ code: "MALFORMED", detail: "no next signature: possession of the new key is not proven" });
  let signerValidFrom: string | null = null;
  if (statement.reason === "key-compromise" || statement.previousKeyId === null) {
    if (rootsSigned < env.ctx.rootThreshold) {
      admissionFindings.push({ code: "ISSUER_NOT_PINNED", detail: `needs ${env.ctx.rootThreshold} pinned root signature(s); the previous key has no authority here` });
    }
  } else if (!signatures.some(row => row.by === "previous")) {
    admissionFindings.push({ code: "ISSUER_NOT_PINNED", detail: "no previous signature: the rotation is not authorized by the key it replaces" });
  } else {
    const previous = admit({ signature: "previous signature", keyId: statement.previousKeyId, purpose: statement.purpose }, env.ctx);
    admissions.push(previous);
    signerValidFrom = previous.entry?.validFrom ?? null;
  }
  admissionFindings.push(...distrusted(statement.nextKeyId, env, "next"),
    ...rollback(`${statement.workspaceId}/${statement.purpose}`, statement.sequence, env));
  return {
    kind: "key-rotation", integrity, unverifiable, admissions, admissionFindings,
    anchoring: { status: "not-applicable", detail: null }, claimedAt: statement.issuedAt,
    warnings: [],
    ...statementTail(env, statement.issuedAt, statement.previousStatementSha256, signerValidFrom)
  };
}

export function evaluateRootRotation(value: unknown, bytes: Uint8Array, env: Env): Evaluation {
  const parsed = parseCanonical(signedRootRotation, value, bytes);
  if (!parsed.ok) return refused("root-rotation", parsed.finding);
  const { statement, signatures } = parsed.value;
  const integrity: Finding<"integrity">[] = chainHead(statement.sequence, statement.previousSha256);
  const unverifiable: string[] = [];
  // A decrease is judged against the threshold the verifier pinned too, not only the one the statement states.
  const currentThreshold = Math.max(statement.previousThreshold, env.ctx.rootThreshold);
  if ((statement.newThreshold < currentThreshold || statement.newRoots.length < statement.previousRoots.length) && !statement.allowDecrease) {
    integrity.push({ code: "MALFORMED", detail: "it lowers the threshold or the set size without allowDecrease" });
  }
  const message = statementMessage("amc.root-rotation/v1", "amc.root-rotation/v2-digest", canonicalize(statement), parsed.value.signatureVersion);
  const admissions: Admission[] = [];
  let newSigned = 0;
  let currentSigned = 0;
  for (const row of signatures) {
    const index = statement.newRoots.indexOf(row.keyId);
    const pem = row.by === "new" ? (index >= 0 ? statement.newRootPublicKeyPems[index]! : null) : env.ctx.rootPems.get(row.keyId) ?? null;
    if ((row.by === "new" && index < 0) || (row.by === "current" && !statement.previousRoots.includes(row.keyId))) {
      integrity.push({ code: "MALFORMED", detail: `the ${row.by} signature by ${row.keyId} is not by a key of the ${row.by} root set` });
    } else if (pem === null) {
      unverifiable.push(`current signature by ${row.keyId}: no supplied trust list carries this pinned root's key`);
    } else if (!verifySignature(message, pem, Buffer.from(row.signature, "base64"))) {
      integrity.push({ code: "SIGNATURE_INVALID", detail: `the ${row.by} signature by ${row.keyId} does not verify` });
    } else if (row.by === "new") newSigned += 1;
    else {
      const admission = rootAdmission(`current signature ${row.keyId}`, row.keyId, env.ctx);
      admissions.push(admission);
      if (!admission.finding) currentSigned += 1;
    }
  }
  if (newSigned < statement.newThreshold) integrity.push({ code: "SIGNATURE_INVALID", detail: `the new set proves possession with ${newSigned} of ${statement.newThreshold} signatures` });
  const admissionFindings: Finding<"issuerAdmission">[] = [];
  const pinned = [...env.ctx.roots].sort();
  if (pinned.length !== statement.previousRoots.length || [...statement.previousRoots].sort().some((root, index) => root !== pinned[index])) {
    admissionFindings.push({ code: "ISSUER_NOT_PINNED", detail: "previousRoots is not the root set pinned with --trust-root" });
  }
  const required = Math.max(statement.previousThreshold, env.ctx.rootThreshold);
  if (currentSigned < required) admissionFindings.push({ code: "ISSUER_NOT_PINNED", detail: `needs ${required} signatures by the pinned current roots; ${currentSigned} verified` });
  admissionFindings.push(...statement.newRoots.flatMap(root => distrusted(root, env, "new root")),
    ...rollback(statement.rootSetId, statement.sequence, env));
  return {
    kind: "root-rotation", integrity, unverifiable, admissions, admissionFindings,
    anchoring: { status: "not-applicable", detail: null }, claimedAt: statement.issuedAt, warnings: [],
    ...statementTail(env, statement.issuedAt, statement.previousSha256)
  };
}
