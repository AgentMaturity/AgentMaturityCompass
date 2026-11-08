import { z } from "zod";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { openSessionEventStore, resolveSessionStoreBackend } from "../persistence/openSessionEventStore.js";
import { merkleRoot } from "../session/sessionMerkle.js";
import { sessionRootDescriptorSchema, type SessionRootDescriptor } from "../transparency/sessionAnchorSchema.js";
import { buildSessionRootDescriptor, verifySeal, verifySessionRows } from "../transparency/sessionRootDescriptor.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

/**
 * One sealed native session as a self-contained signed bundle (SH-TRUST-06), verifiable on another machine with
 * nothing but the file and a monitor-key fingerprint obtained out of band.
 *
 * What travels: the session's rows exactly as stored (each row's `event_hash`, `writer_sig` and session envelope are
 * what the verifier recomputes and checks), the session lifecycle record with its seal, the recomputed root
 * descriptor, and the monitor public keys the rows were signed with. Keys travel only to locate a signer: the verifier
 * admits one only when its sha256 equals the caller's pinned fingerprint, the same discipline as `session verify-proof`
 * (ADR-0007). Spilled payloads are not embedded; a row's `payload_sha256` is inside its hash pre-image, so the bundle
 * commits to them without carrying them. The global `prev_event_hash` chain across sessions cannot be checked from one
 * session's slice and is not claimed; that remains `amc session verify` on the workspace, or `session proof` for an
 * anchored session.
 */
export const SESSION_EXPORT_KIND = "amc.session-export";

const rowSchema = z.object({
  id: z.string().min(1), ts: z.number().int(), session_id: z.string().min(1), runtime: z.string(), event_type: z.string().min(1),
  payload_path: z.string().nullable(), payload_sha256: z.string().length(64), payload_inline: z.string().nullable(),
  meta_json: z.string(), prev_event_hash: z.string(), event_hash: z.string().length(64), writer_sig: z.string(),
  canonical_payload_path: z.string().nullable().optional(), canonical_payload_inline: z.string().nullable().optional()
}).passthrough();

export const sessionExportSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal(SESSION_EXPORT_KIND),
  sessionId: z.string().min(1),
  exportedTs: z.number().int(),
  descriptor: sessionRootDescriptorSchema,
  record: z.strictObject({
    started_ts: z.number().int(), ended_ts: z.number().int(), runtime: z.string(), binary_path: z.string(), binary_sha256: z.string(),
    session_final_event_hash: z.string().length(64), session_seal_sig: z.string().min(1)
  }),
  rows: z.array(rowSchema).min(1),
  /** Monitor public key PEMs the rows and seal verify against; admitted only by the pinned fingerprint. */
  monitorPublicKeys: z.array(z.string().min(1)).min(1)
});
export type SessionExport = z.infer<typeof sessionExportSchema>;

export class SessionExportError extends Error {
  constructor(readonly sessionId: string, readonly errors: readonly string[]) {
    super(`session ${sessionId} cannot be exported: ${errors.join("; ")}`);
    this.name = "SessionExportError";
  }
}

/** Reads one sealed session out of the workspace's own store and bundles it; refuses anything that does not verify here. */
export function exportSessionBundle(params: { workspace: string; sessionId: string; trust?: TrustContext; expectedMonitorFingerprint?: string }): SessionExport {
  const { workspace, sessionId } = params;
  const store = openSessionEventStore(workspace, resolveSessionStoreBackend(workspace), { readOnly: true });
  let rows: readonly EvidenceEvent[], record: SessionRecord | null;
  try {
    rows = store.readSessionEvents(sessionId);
    record = store.readSessionRecord(sessionId);
  } finally {
    store.close();
  }
  if (record === null || record.ended_ts === null || record.session_final_event_hash === null || record.session_seal_sig === null) {
    throw new SessionExportError(sessionId, ["SESSION_NOT_SEALED: only a sealed (closed) session can be exported"]);
  }
  // The descriptor builder runs every per-row, envelope and seal rule against the workspace's keys and throws otherwise.
  const descriptor = buildSessionRootDescriptor({ workspace, sessionId, rows, record,
    options: { ...(params.trust === undefined ? {} : { trust: params.trust }),
      ...(params.expectedMonitorFingerprint === undefined ? {} : { expectedMonitorFingerprint: params.expectedMonitorFingerprint }) } });
  return sessionExportSchema.parse({
    v: 1, kind: SESSION_EXPORT_KIND, sessionId, exportedTs: Date.now(), descriptor,
    record: { started_ts: record.started_ts, ended_ts: record.ended_ts, runtime: record.runtime, binary_path: record.binary_path,
      binary_sha256: record.binary_sha256, session_final_event_hash: record.session_final_event_hash, session_seal_sig: record.session_seal_sig },
    rows: rows.map((row) => ({ ...row })),
    monitorPublicKeys: getPublicKeyHistory(workspace, "monitor")
  });
}

export interface SessionExportVerification {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly sessionId: string | null;
  readonly descriptorSha256: string | null;
  /** The carried key the pin admitted, for the caller's issuer admission; null when no key matched the pin. */
  readonly monitorPublicKeyPem: string | null;
  readonly eventCount: number | null;
}

/**
 * Verifies an export with nothing but the document and a pinned monitor fingerprint: the pin selects the one carried
 * key that may vouch; every row's hash pre-image, writer signature and session envelope are recomputed; the seal must
 * name the last row and verify; and the carried descriptor must equal the one recomputed from the rows.
 */
export function verifySessionExport(params: { bundle: unknown; expectedMonitorFingerprint: string }): SessionExportVerification {
  const errors: string[] = [];
  const parsed = sessionExportSchema.safeParse(params.bundle);
  if (!parsed.success) {
    return { ok: false, errors: [`export does not parse: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`],
      sessionId: null, descriptorSha256: null, monitorPublicKeyPem: null, eventCount: null };
  }
  const bundle = parsed.data;
  const expected = params.expectedMonitorFingerprint.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) errors.push("trust root: --expect-monitor must be the sha256 of the monitor public key PEM");
  // Only the pinned key vouches. A bundle that carries its own keys proves self-consistency alone without this step.
  const pinnedKey = bundle.monitorPublicKeys.find((pem) => sha256Hex(Buffer.from(pem, "utf8")) === expected) ?? null;
  if (pinnedKey === null) errors.push("trust root: no carried monitor key matches the expected fingerprint");
  const keys = pinnedKey === null ? [] : [pinnedKey];
  const rows = bundle.rows as unknown as EvidenceEvent[];
  if (rows.some((row) => row.session_id !== bundle.sessionId)) errors.push("a row belongs to another session");
  verifySessionRows(keys, rows, errors);
  const record = { session_id: bundle.sessionId, ...bundle.record } as SessionRecord;
  verifySeal(keys, record, rows, bundle.sessionId, errors);
  // The descriptor is recomputed from the rows, never read from the bundle's own claim.
  const sealEventHashes = rows.filter((row) => row.event_type === "turn/seal").map((row) => row.event_hash);
  const recomputed: SessionRootDescriptor = { ...bundle.descriptor, eventCount: rows.length, sealEventHashes, sessionMerkleRoot: merkleRoot(sealEventHashes),
    turnCount: rows.filter((row) => row.event_type === "turn/start").length, sealCount: sealEventHashes.length,
    openEventHash: rows[0]!.event_hash, closeEventHash: rows[rows.length - 1]!.event_hash, monitorKeyFingerprint: expected,
    startedTs: bundle.record.started_ts, endedTs: bundle.record.ended_ts };
  if (canonicalize(recomputed) !== canonicalize(bundle.descriptor)) errors.push("descriptor does not match the rows it describes");
  if (rows[0]!.event_type !== "session/open") errors.push(`session ${bundle.sessionId} does not begin with session/open`);
  if (rows[rows.length - 1]!.event_type !== "session/close") errors.push(`session ${bundle.sessionId} does not end with session/close`);
  return { ok: errors.length === 0, errors, sessionId: bundle.sessionId, descriptorSha256: sha256Hex(canonicalize(bundle.descriptor)),
    monitorPublicKeyPem: pinnedKey, eventCount: rows.length };
}
