/**
 * `amc session export` (SH-OBS-03): one session's signed rows, optionally with their content, as a self-contained
 * document a reviewer can read offline and verify with `amc session verify-export`.
 *
 * Trust shape: the document embeds exactly one public key, the workspace's current ledger-row key, and every row and
 * the seal must verify under it at export time; a session signed by a rotated key is refused rather than exported
 * with a key list anyone could extend. The fingerprint an operator pins at verify time travels out of band. Content
 * is digests only unless asked for; asked-for content is checked against each row's committed digest, redacted, and
 * bounded. Nothing in the document is ever executed by the verifier.
 */
import { projectNativeRunUsage, type NativeRunUsage } from "../agent/nativeRunUsage.js";
import { getPublicKeyPem, verifyHexDigest } from "../crypto/keys.js";
import { boundProviderKey } from "../keys/keyset.js";
import { isEncryptedField } from "../ledger/encryption/ledgerCipher.js";
import { loadOpsPolicy } from "../ops/policy.js";
import { readEventPayload } from "../session/eventPayload.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { SPILL_META_KEY } from "../session/spill/spillTypes.js";
import { readSessionSpillRange } from "../session/spill/spillRead.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { verifySeal, verifySessionRows } from "../transparency/sessionRootDescriptor.js";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

const SESSION_EXPORT_SCHEMA = "amc.session-export/v1";
const CONTENT_EVENT_TYPES = new Set(["system/prompt", "user/message", "assistant/block", "tool/call", "tool/result"]);
const MAX_CONTENT_BYTES = 256 * 1024;
const MAX_TOTAL_CONTENT_BYTES = 16 * 1024 * 1024;

interface ExportedContent {
  readonly text: string;
  /** Digest of the full committed bytes (the row's payload_sha256, or the spill commitment). */
  readonly sha256: string;
  readonly source: "inline" | "blob" | "spill";
  readonly truncated: boolean;
  readonly redactions: number;
}

export interface SessionExportDocument {
  readonly schema: typeof SESSION_EXPORT_SCHEMA;
  readonly exportedAt: number;
  readonly sessionId: string;
  readonly monitorPublicKeyPem: string;
  /** sha256 of the PEM above, for display; the verifier compares the PEM against the operator's own pin. */
  readonly monitorKeyFingerprint: string;
  readonly record: SessionRecord | null;
  readonly rows: readonly EvidenceEvent[];
  /** Per event id; null when the export carries digests only. Entries marked unavailable name why. */
  readonly content: Readonly<Record<string, ExportedContent | { readonly unavailable: string }>> | null;
  readonly usage: NativeRunUsage;
}

interface SessionExportVerdict {
  readonly ok: boolean;
  readonly fingerprint: string;
  readonly rowsChecked: number;
  readonly tail: "sealed" | "unproven";
  readonly content: { readonly verified: number; readonly unverifiable: number; readonly unavailable: number };
  /** The usage summary recomputed from the document's rows (the embedded copy is checked against it, cost estimate aside). */
  readonly usage: NativeRunUsage | null;
  readonly errors: readonly string[];
}

export interface SessionExportVerifyOptions {
  readonly expectedFingerprint: string;
  /** Redacted, truncated or spilled content cannot be checked against its digest; without this it fails the verdict (S15). */
  readonly acceptUnverifiableContent?: boolean;
}

function ledgerRowKeyPem(workspace: string): string {
  return boundProviderKey(workspace, "ledger-row")?.publicKeyPem ?? getPublicKeyPem(workspace, "monitor");
}

function spillLocator(event: EvidenceEvent): string | null {
  try {
    const ref = (JSON.parse(event.meta_json) as Record<string, unknown>)[SPILL_META_KEY];
    return ref && typeof ref === "object" && typeof (ref as { locator?: unknown }).locator === "string" ? (ref as { locator: string }).locator : null;
  } catch { return null; }
}

/**
 * S16: the first reason this session falls under the ledger payload encryption regime (P2-09), or null. The regime is
 * the operator's opt-in: the policy flag covers every row of the session, blobs included (before, only a row whose
 * inline field was encrypted refused, so a regime-on session stored as blobs left in plaintext). Blob and spill payloads
 * under the workspace's default blob encryption are not that regime: every reader decrypts them, and the export carries
 * them redacted and bounded like `amc session show` does.
 */
function underLedgerEncryption(workspace: string, rows: readonly EvidenceEvent[]): string | null {
  if (loadOpsPolicy(workspace).opsPolicy.encryption.ledgerEncryptionEnabled === true) return "the workspace operations policy enables ledger payload encryption";
  const row = rows.find((candidate) => isEncryptedField(candidate.payload_inline));
  return row === undefined ? null : `the inline payload of event ${row.id} is encrypted`;
}

function redacted(text: string): { text: string; redactions: number } {
  const result = redactSecrets(text, (type) => `[REDACTED:${type}]`);
  return { text: result.redacted, redactions: result.findings.length };
}

function exportContent(workspace: string, rows: readonly EvidenceEvent[]): Record<string, ExportedContent | { unavailable: string }> {
  const out: Record<string, ExportedContent | { unavailable: string }> = {};
  let total = 0;
  for (const event of rows) {
    if (!CONTENT_EVENT_TYPES.has(event.event_type)) continue;
    if (total >= MAX_TOTAL_CONTENT_BYTES) { out[event.id] = { unavailable: "export content budget (16 MiB) exhausted" }; continue; }
    const locator = event.event_type === "tool/result" ? spillLocator(event) : null;
    if (locator !== null) {
      try {
        const range = readSessionSpillRange({ workspace, events: rows, locator, limit: MAX_CONTENT_BYTES });
        const bytes = Buffer.from(range.contentBase64, "base64");
        const text = redacted(bytes.toString("utf8"));
        total += bytes.length;
        out[event.id] = { text: text.text, sha256: range.contentSha256, source: "spill", truncated: range.nextOffset !== null, redactions: text.redactions };
      } catch (error) {
        out[event.id] = { unavailable: `spilled output not readable: ${error instanceof Error ? error.message : String(error)}` };
      }
      continue;
    }
    const payload = readEventPayload(workspace, event);
    if (payload.status !== "ok") { out[event.id] = { unavailable: payload.status === "pruned" ? "payload pruned by retention" : payload.detail }; continue; }
    if (sha256Hex(payload.bytes) !== event.payload_sha256) { out[event.id] = { unavailable: "payload bytes do not match the committed digest" }; continue; }
    const truncated = payload.bytes.length > MAX_CONTENT_BYTES;
    const text = redacted(payload.bytes.subarray(0, MAX_CONTENT_BYTES).toString("utf8"));
    total += Math.min(payload.bytes.length, MAX_CONTENT_BYTES);
    out[event.id] = { text: text.text, sha256: event.payload_sha256, source: event.payload_inline !== null && event.payload_inline !== undefined ? "inline" : "blob", truncated, redactions: text.redactions };
  }
  return out;
}

/** Read, verify and assemble. Throws on any refusal; never writes a partial document. */
export function buildSessionExport(options: { workspace: string; sessionId: string; includeContent: boolean; now?: number }): SessionExportDocument {
  const history = loadSessionEventHistory({ workspace: options.workspace, sessionId: options.sessionId });
  const rows = history.events;
  const record = history.sessions.find((session) => session.session_id === options.sessionId) ?? null;
  const pem = ledgerRowKeyPem(options.workspace);
  const errors: string[] = [];
  verifySessionRows([pem], rows, errors);
  if (record?.ended_ts !== null && record?.ended_ts !== undefined) verifySeal([pem], record, rows, options.sessionId, errors);
  if (errors.length > 0) throw new Error(`session ${options.sessionId} cannot be exported under the current ledger-row key: ${errors.slice(0, 3).join("; ")}`);
  const encrypted = options.includeContent ? underLedgerEncryption(options.workspace, rows) : null;
  if (encrypted !== null) {
    throw new Error(`${encrypted}; an export with content would carry decrypted payloads. Export digests only (omit --include-content).`);
  }
  return { schema: SESSION_EXPORT_SCHEMA, exportedAt: options.now ?? Date.now(), sessionId: options.sessionId, monitorPublicKeyPem: pem,
    monitorKeyFingerprint: sha256Hex(pem), record, rows, content: options.includeContent ? exportContent(options.workspace, rows) : null,
    usage: projectNativeRunUsage(rows, options.sessionId) };
}

function isDocument(value: unknown): value is SessionExportDocument {
  const doc = value as Partial<SessionExportDocument> | null;
  return !!doc && typeof doc === "object" && doc.schema === SESSION_EXPORT_SCHEMA && typeof doc.sessionId === "string"
    && typeof doc.monitorPublicKeyPem === "string" && Array.isArray(doc.rows) && (doc.content === null || (typeof doc.content === "object" && doc.content !== null))
    && typeof doc.usage === "object" && doc.usage !== null;
}

/** The usage summary without its catalog cost estimate, whose freshness labels depend on the clock. */
function usageWithoutCost(usage: NativeRunUsage): Omit<NativeRunUsage, "cost"> {
  const { cost: _cost, ...rest } = usage;
  return rest;
}

const EMPTY_VERDICT = { fingerprint: "", rowsChecked: 0, tail: "unproven" as const, content: { verified: 0, unverifiable: 0, unavailable: 0 }, usage: null };

/**
 * Offline verification of a document: the embedded key must match the operator's pin, every row must hash and verify
 * under that key with a contiguous per-session chain, a closed session's seal must name the last row, and embedded
 * content must hash to its row's digest where it was neither redacted nor truncated; content that cannot be checked
 * fails the verdict unless explicitly accepted, and the embedded usage summary must equal the one recomputed from the
 * rows (S15). Nothing in the document runs.
 */
export function verifySessionExport(value: unknown, options: SessionExportVerifyOptions): SessionExportVerdict {
  const errors: string[] = [];
  if (!isDocument(value)) return { ok: false, ...EMPTY_VERDICT, errors: ["not an amc.session-export/v1 document"] };
  const fingerprint = sha256Hex(value.monitorPublicKeyPem);
  const expected = options.expectedFingerprint.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) errors.push("expected monitor fingerprint must be a 64-hex sha256 obtained out of band");
  else if (expected !== fingerprint) errors.push(`embedded monitor key fingerprint ${fingerprint} does not match the pinned ${expected}`);
  const rows = value.rows;
  if (rows.length === 0) errors.push("the document carries no rows");
  if (rows.some((row) => row.session_id !== value.sessionId)) errors.push("a row belongs to another session");
  if (rows.some((row) => extractEnvelope(row.meta_json) === null)) errors.push("a row carries no session envelope");
  verifySessionRows([value.monitorPublicKeyPem], rows, errors);
  const sealed = value.record !== null && value.record.ended_ts !== null;
  if (sealed) verifySeal([value.monitorPublicKeyPem], value.record, rows, value.sessionId, errors);
  const content = { verified: 0, unverifiable: 0, unavailable: 0 };
  if (value.content !== null) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const [id, entry] of Object.entries(value.content)) {
      if ("unavailable" in entry) { content.unavailable += 1; continue; }
      const row = byId.get(id);
      if (!row) { errors.push(`content for unknown event ${id}`); continue; }
      if (!CONTENT_EVENT_TYPES.has(row.event_type)) { errors.push(`content attached to ${row.event_type} event ${id}, which carries no exportable content`); continue; }
      if (entry.source === "spill" || entry.truncated || entry.redactions > 0) { content.unverifiable += 1; continue; }
      if (sha256Hex(Buffer.from(entry.text, "utf8")) !== row.payload_sha256) errors.push(`content of event ${id} does not hash to its committed payload digest`);
      else content.verified += 1;
    }
    if (content.unverifiable > 0 && options.acceptUnverifiableContent !== true) {
      errors.push(`${content.unverifiable} content entr${content.unverifiable === 1 ? "y is" : "ies are"} redacted, truncated or spilled and cannot be checked against the committed digests; pass --accept-unverifiable-content to accept them as display-only`);
    }
  }
  const usage = projectNativeRunUsage(rows, value.sessionId);
  if (JSON.stringify(usageWithoutCost(usage)) !== JSON.stringify(usageWithoutCost(value.usage))) errors.push("the embedded usage summary does not match the usage recomputed from the rows");
  // Belt and braces: the seal signature over the final hash is also checked with the single-key verifier.
  if (sealed && value.record?.session_seal_sig && value.record.session_final_event_hash
      && !verifyHexDigest(value.record.session_final_event_hash, value.record.session_seal_sig, value.monitorPublicKeyPem)) errors.push("seal signature does not verify under the embedded key");
  return { ok: errors.length === 0, fingerprint, rowsChecked: rows.length, tail: sealed ? "sealed" : "unproven", content, usage, errors };
}
