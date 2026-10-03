import { join } from "node:path";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../../utils/fs.js";
import { sha256Hex } from "../../../utils/hash.js";
import { canonicalize } from "../../../utils/json.js";

/**
 * Signed, session-bound records for the native todo, plan and ask-user tools
 * (AMC-1549).
 *
 * WHY FILES AND NOT SESSION EVENTS. No todo/plan event type exists in
 * `SESSION_EVENT_TYPES`, and `src/session/**` is outside this change. The
 * records live under `<workspace>/.amc/native-tools/<sessionId>/`; each file
 * holds `{ record, digestSha256, signature, signer }` where the digest is
 * SHA-256 over the canonical JSON of `record`. A reader verifies before it
 * trusts anything, so an edit made outside the tool is a refusal rather than a
 * silently different plan.
 *
 * ROLES. Records the agent process writes (todo, plan, question) are signed
 * with the `monitor` key, like ledger rows. An ask-user ANSWER must verify
 * against the `auditor` key — the role approvals are signed with — so a
 * monitor-signed answer is refused.
 */

export type RecordSigner = "monitor" | "auditor";

export interface SignedRecordFile<T> {
  readonly record: T;
  readonly digestSha256: string;
  readonly signature: string;
  readonly signer: RecordSigner;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSessionId(sessionId: string): string {
  if (!SESSION_ID.test(sessionId) || sessionId.includes("..")) {
    throw new Error(`invalid session id for native tool records: ${JSON.stringify(sessionId)}`);
  }
  return sessionId;
}

export function sessionRecordDir(workspace: string, sessionId: string): string {
  return join(workspace, ".amc", "native-tools", assertSessionId(sessionId));
}

export function recordDigest(record: unknown): string {
  return sha256Hex(canonicalize(record));
}

export function signRecord<T>(workspace: string, record: T, signer: RecordSigner): SignedRecordFile<T> {
  const digestSha256 = recordDigest(record);
  return { record, digestSha256, signature: signHexDigest(digestSha256, getPrivateKeyPem(workspace, signer)), signer };
}

/** True only when the signature verifies over the record as it is now. */
export function verifyRecord(workspace: string, file: SignedRecordFile<unknown>, signer: RecordSigner): boolean {
  const digest = recordDigest(file.record);
  return digest === file.digestSha256
    && typeof file.signature === "string"
    && verifyHexDigestAny(digest, file.signature, getPublicKeyHistory(workspace, signer));
}

export function writeSignedRecord<T>(workspace: string, path: string, record: T, signer: RecordSigner): SignedRecordFile<T> {
  const signed = signRecord(workspace, record, signer);
  ensureDir(join(path, ".."));
  writeFileAtomic(path, JSON.stringify(signed, null, 2), 0o600);
  return signed;
}

/** null when absent; throws when present and not verifiable. */
export function readSignedRecord<T>(workspace: string, path: string, signer: RecordSigner): SignedRecordFile<T> | null {
  if (!pathExists(path)) return null;
  let parsed: SignedRecordFile<T>;
  try { parsed = JSON.parse(readUtf8(path)) as SignedRecordFile<T>; } catch {
    throw new Error(`native tool record ${path} is not valid JSON; refusing to trust it`);
  }
  if (!verifyRecord(workspace, parsed as SignedRecordFile<unknown>, signer)) {
    throw new Error(`native tool record ${path} failed signature verification; refusing to trust it`);
  }
  return parsed;
}
