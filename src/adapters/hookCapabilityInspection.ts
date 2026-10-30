/** Fixed read-only status readers for capability receipt negatives; no writer initialization or lease recovery. */
import { lstatSync, type Stats } from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { CLAUDE_NOT_GOVERNED_NOTE, type ClaudeCodeGovernance } from "../bridge/claudeCodeSessionRegistry.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { assertNeverAnchored, assertNotRolledBack } from "../keys/anchors.js";
import { MAX_REVOCATION_LIST_BYTES, revocationListSha256, signedRevocationListSchema, revocationListSigningBytes } from "../keys/revocationList.js";
import { signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { leaseRevocationsSchema, type LeasePayload } from "../leases/leaseSchema.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { CONTROL_HOOK_ROUTE } from "../bridge/hookControl.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { cachedFileSha256 } from "./pi/piInstall.js";

// Exact maintained registration schema and newest-prefix/query recipe from claudeCodeSessionRegistry.ts.
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.strictObject({
  kind: z.literal("amc.claude-code-session-registration/v1"), agentId: z.string().min(1), sessionSha256: hash,
  claudeCodeVersion: z.string().min(1), claudeCodeSha256: hash, forwarderSha256: hash, manifestSha256: hash,
  userSettingsPath: z.string().min(1), hookSourcesSha256: hash.nullable(), qualified: z.boolean()
});
const PREFIX_LENGTH = "cc_registration_".length + 44;
export function readOnlyCapabilityGovernance(workspace: string, agentId: string): ClaudeCodeGovernance {
  const manifestSha256 = cachedFileSha256(join(workspace, ".amc", "hooks", "claude-code.json"));
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const all = ledger.db.prepare("SELECT id, ts, meta_json FROM evidence_events WHERE event_type = 'audit' AND id LIKE 'cc_registration_%' ORDER BY ts ASC, rowid ASC")
      .all() as Array<{ id: string; ts: number; meta_json: string }>;
    const rows = [...new Map(all.map(row => [row.id.slice(0, PREFIX_LENGTH), row])).values()];
    let registered = 0, qualified = 0, invalidRegistrations = 0, latest: number | null = null;
    for (const row of rows) {
      if (!row.meta_json.includes(`"agentId":${JSON.stringify(agentId)}`)) continue;
      let record: z.infer<typeof recordSchema> | null = null;
      const current = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(row.id) as { meta_json: string } | undefined;
      if (current !== undefined) {
        try {
          const meta = JSON.parse(current.meta_json) as { registration?: unknown; receipt?: unknown }, parsed = recordSchema.parse(meta.registration);
          const integrity = verifyEvidenceEventIntegrity({ ledger, eventId: row.id, requireReceipt: true, requireSealedSession: true });
          const receipt = verifyReceipt(String(meta.receipt), getPurposeKeyHistory(workspace, "receipt"));
          if (integrity.ok && receipt.ok && receipt.payload?.kind === "work_accepted" && receipt.payload.providerId === "hook-registration:claude-code"
            && receipt.payload.agentId === agentId && parsed.agentId === agentId && receipt.payload.body_sha256 === sha256Hex(Buffer.from(canonicalize(parsed), "utf8"))) record = parsed;
        } catch { /* The original row verifier reports an invalid registration. */ }
        if (record === null) invalidRegistrations += 1;
      }
      if (record === null || record.manifestSha256 !== manifestSha256) continue;
      registered += 1; if (record.qualified) qualified += 1; latest = row.ts;
    }
    return { claim: qualified > 0 ? "enforced_at_claude_code_pretooluse" : "not_governed", registeredSessions: registered,
      qualifiedSessions: qualified, invalidRegistrations, latestRegistrationAt: latest === null ? null : new Date(latest).toISOString(), note: CLAUDE_NOT_GOVERNED_NOTE };
  } finally { ledger.close(); }
}

// The core byte verifier is private; retain its exact recipe through the existing exported schema/signing bytes.
function verifiedLeaseList(bytes: Buffer, listId: string, trustedPublicKeyPems: readonly string[]) {
  const signed = signedRevocationListSchema.parse(parseCanonicalJson(bytes));
  if (signed.list.listId !== listId) throw new Error(`revocation list is ${signed.list.listId}, not ${listId}`);
  const key = trustedPublicKeyPems.find(pem => signingKeyId(pem) === signed.signature.keyId);
  if (key === undefined) throw new Error(`revocation list signer ${signed.signature.keyId} is not a trusted revocation-list key`);
  let valid = false;
  try { valid = verifyWithKey(revocationListSigningBytes(signed.list, signed.signatureVersion), key, Buffer.from(signed.signature.signature, "base64")); }
  catch { /* Report the same signature refusal as the maintained reader. */ }
  if (!valid) throw new Error("revocation list signature verification failed");
  return signed;
}
const LEASES = ".amc/studio/leases", FINAL = `${LEASES}/revocations.signed.json`, PENDING = `${FINAL}.pending`;
function noPendingLeaseList(workspace: string): void {
  if (readContainedOrNull(workspace, PENDING, MAX_REVOCATION_LIST_BYTES) !== null)
    throw new Error("lease revocation list has a pending update; finish its existing recovery before signing a capability receipt");
}
function readOnlyRevokedLeaseIds(workspace: string): Set<string> {
  noPendingLeaseList(workspace);
  const listId = `leases:${workspaceIdFromDirectory(workspace)}`, trustedPublicKeyPems = getPurposeKeyHistory(workspace, "revocation-list");
  const bytes = readContainedOrNull(workspace, FINAL, MAX_REVOCATION_LIST_BYTES);
  let ids: Set<string>;
  if (bytes !== null) {
    const signed = verifiedLeaseList(bytes, listId, trustedPublicKeyPems);
    assertNotRolledBack({ workspace, type: "REVOCATION_LIST", id: listId, sequence: signed.list.sequence,
      sha256: revocationListSha256(signed.list), fileSha256: sha256Hex(bytes), entryHash: signed.anchor?.transparencyEntryHash ?? null }, { record: false });
    ids = new Set(signed.list.revoked.filter(row => row.kind === "lease").map(row => row.id));
  } else {
    assertNeverAnchored(workspace, "REVOCATION_LIST", listId);
    const body = readContainedOrNull(workspace, `${LEASES}/revocations.json`, MAX_REVOCATION_LIST_BYTES);
    const sidecar = readContainedOrNull(workspace, `${LEASES}/revocations.json.sig`, 64 * 1024);
    if (body === null && sidecar === null) ids = new Set();
    else {
      if (body === null) throw new Error("revocation list missing but signature present");
      if (sidecar === null) throw new Error("revocation signature missing");
      const signed = JSON.parse(sidecar.toString("utf8")) as { digestSha256: string; signature: string }, digest = sha256Hex(body);
      if (signed.digestSha256 !== digest) throw new Error("digest mismatch");
      if (!verifyHexDigestAny(digest, signed.signature, trustedPublicKeyPems)) throw new Error("signature verification failed");
      ids = new Set(leaseRevocationsSchema.parse(JSON.parse(body.toString("utf8"))).revocations.map(row => row.leaseId));
    }
  }
  noPendingLeaseList(workspace); return ids;
}
function readOnlyManagedLease(input: { workspace: string; tokenPath: string; expectedAgentId?: string; mode: "observe" | "control" }): {
  valid: boolean; expired: boolean; payload: LeasePayload | null; error: string | null;
} {
  let first: Stats;
  try { first = lstatSync(input.tokenPath); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { valid: false, expired: false, payload: null, error: "lease token missing" }; throw cause; }
  const token = readContainedOrNull(input.workspace, relative(input.workspace, input.tokenPath).split(sep).join("/"), Number.MAX_SAFE_INTEGER);
  const last = lstatSync(input.tokenPath);
  if (token === null || first.dev !== last.dev || first.ino !== last.ino || first.size !== last.size || first.mtimeMs !== last.mtimeMs || first.mode !== last.mode)
    throw new Error("hook lease token changed while being read");
  if ((last.mode & 0o077) !== 0) return { valid: false, expired: false, payload: null, error: "lease token permissions must be 0600" };
  const text = token.toString("utf8").trim();
  if (!text) return { valid: false, expired: false, payload: null, error: "lease token is empty" };
  let revokedLeaseIds: Set<string>;
  try { revokedLeaseIds = readOnlyRevokedLeaseIds(input.workspace); }
  catch (cause) { return { valid: false, expired: false, payload: null, error: `lease revocation store unverifiable (${cause instanceof Error ? cause.message : String(cause)}); refusing to treat it as empty` }; }
  let verified = verifyLeaseToken({ workspace: input.workspace, token: text, expectedAgentId: input.expectedAgentId,
    requiredScope: "hook:observe", routePath: "/hooks/aep/0.1/events", revokedLeaseIds });
  if (verified.ok && input.mode === "control") verified = verifyLeaseToken({ workspace: input.workspace, token: text,
    expectedAgentId: input.expectedAgentId, requiredScope: "hook:control", routePath: CONTROL_HOOK_ROUTE, revokedLeaseIds });
  return { valid: verified.ok, expired: verified.error === "lease expired", payload: verified.payload, error: verified.error ?? null };
}
export function readOnlyCapabilityLeaseStatus(workspace: string, tokenPath: string,
  manifest: { agentId: string; mode: "observe" | "control"; leaseId: string } | null, issues: string[]) {
  const lease = readOnlyManagedLease({ workspace, tokenPath, expectedAgentId: manifest?.agentId, mode: manifest?.mode ?? "observe" });
  if (!lease.valid) {
    if (lease.error === "lease token permissions must be 0600") issues.push(lease.error);
    else issues.push(`lease invalid: ${lease.error ?? "verification failed"}`);
  }
  if (manifest && lease.payload && lease.payload.leaseId !== manifest.leaseId) issues.push("lease ID differs from the signed installation manifest");
  return lease;
}
