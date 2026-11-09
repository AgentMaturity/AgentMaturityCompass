/**
 * `amc session export` (SH-OBS-03): one session's signed rows, optionally with their content, as a self-contained
 * document a reviewer can read offline and verify with `amc session verify-export`.
 *
 * Trust shape: the document embeds exactly one public key, the workspace's current ledger-row key, and every row and
 * the seal must verify under it at export time; a session signed by a rotated key is refused rather than exported
 * with a key list anyone could extend. The fingerprint an operator pins at verify time travels out of band. Content
 * is digests only unless asked for; asked-for content is checked against each row's committed digest, redacted, and
 * bounded, and payloads stored encrypted are written out only with the operator's explicit `--decrypt-content` (never under
 * the ledger encryption regime). Nothing in the document is ever executed by the verifier.
 */
import { projectNativeRunUsage, type NativeRunUsage } from "../agent/nativeRunUsage.js";
import { getPublicKeyPem, verifyHexDigest } from "../crypto/keys.js";
import { boundProviderKey } from "../keys/keyset.js";
import { loadBlobMetadata } from "../storage/blobs/blobStore.js";
import { isEncryptedField } from "../ledger/encryption/ledgerCipher.js";
import { loadOpsPolicy } from "../ops/policy.js";
import { readEventPayload } from "../session/eventPayload.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { extractSpillRef, SPILL_META_KEY } from "../session/spill/spillTypes.js";
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
  /** The usage summary recomputed from the document's rows at the recorded export instant (the embedded copy is checked against it, cost included). */
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
 * the operator's opt-in to keep payloads encrypted: the policy flag covers every row of the session, blobs included,
 * and nothing overrides it.
 */
function underLedgerEncryption(workspace: string, rows: readonly EvidenceEvent[]): string | null {
  if (loadOpsPolicy(workspace).opsPolicy.encryption.ledgerEncryptionEnabled === true) return "the workspace operations policy enables ledger payload encryption";
  const row = rows.find((candidate) => isEncryptedField(candidate.payload_inline));
  return row === undefined ? null : `the inline payload of event ${row.id} is encrypted`;
}

/**
 * S16: the first content payload this session stores encrypted at rest (an encrypted blob, the workspace default, or a
 * v2 spill), or null. Exporting it writes plaintext to a file, so it needs the operator's explicit `--decrypt-content`.
 */
function encryptedAtRest(workspace: string, rows: readonly EvidenceEvent[]): string | null {
  for (const row of rows) {
    if (!CONTENT_EVENT_TYPES.has(row.event_type) || row.payload_pruned === 1) continue;
    if (row.event_type === "tool/result" && extractSpillRef(row.meta_json)?.v === 2) return `the spilled output of event ${row.id} is stored encrypted`;
    const path = row.payload_inline === null || row.payload_inline === undefined ? row.payload_path ?? row.canonical_payload_path ?? null : null;
    if (path === null) continue;
    try {
      if (loadBlobMetadata(workspace, path).encrypted) return `the payload of event ${row.id} is stored as an encrypted blob`;
    } catch { /* unreadable: the export marks it unavailable */ }
  }
  return null;
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

/**
 * Read, verify and assemble. Throws on any refusal; never writes a partial document. Content is refused under the
 * ledger encryption regime, and for payloads stored encrypted at rest unless `decryptContent` says to write them out.
 */
export function buildSessionExport(options: { workspace: string; sessionId: string; includeContent: boolean; decryptContent?: boolean; now?: number }): SessionExportDocument {
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
  const atRest = options.includeContent && options.decryptContent !== true ? encryptedAtRest(options.workspace, rows) : null;
  if (atRest !== null) {
    throw new Error(`${atRest}; an export with content would write it decrypted into the file. Pass --decrypt-content to accept that, or export digests only (omit --include-content).`);
  }
  const exportedAt = options.now ?? Date.now();
  return { schema: SESSION_EXPORT_SCHEMA, exportedAt, sessionId: options.sessionId, monitorPublicKeyPem: pem,
    monitorKeyFingerprint: sha256Hex(pem), record, rows, content: options.includeContent ? exportContent(options.workspace, rows) : null,
    usage: projectNativeRunUsage(rows, options.sessionId, exportedAt) };
}

const DOCUMENT_KEYS = new Set<keyof SessionExportDocument>(["schema", "exportedAt", "sessionId", "monitorPublicKeyPem", "monitorKeyFingerprint", "record", "rows", "content", "usage"]);

/** Exactly the exporter's shape: an unknown top-level key is refused, since the page would carry text the verifier never looked at. */
function isDocument(value: unknown): value is SessionExportDocument {
  const doc = value as Partial<SessionExportDocument> | null;
  return !!doc && typeof doc === "object" && Object.keys(doc).every((key) => DOCUMENT_KEYS.has(key as keyof SessionExportDocument))
    && doc.schema === SESSION_EXPORT_SCHEMA && typeof doc.exportedAt === "number" && Number.isFinite(doc.exportedAt) && typeof doc.sessionId === "string"
    && typeof doc.monitorPublicKeyPem === "string" && typeof doc.monitorKeyFingerprint === "string" && Array.isArray(doc.rows)
    && (doc.record === null || (typeof doc.record === "object" && doc.record !== undefined && !Array.isArray(doc.record)))
    && (doc.content === null || (typeof doc.content === "object" && doc.content !== undefined && !Array.isArray(doc.content))) && typeof doc.usage === "object" && doc.usage !== null;
}

const CONTENT_KEYS = "redactions,sha256,source,text,truncated";

/**
 * A content entry exactly as the exporter writes it, or the reason it is not: an `unavailable` marker alone, or text
 * whose source and digest are its row's (the payload digest, or the signed spill commitment for spilled output). The
 * page renders these fields, so none may be a value the verifier did not tie to a signed row.
 */
function contentEntryProblem(entry: unknown, row: EvidenceEvent): string | null {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return "is not a content entry";
  const keys = Object.keys(entry).sort().join(",");
  if (keys === "unavailable") return typeof (entry as { unavailable: unknown }).unavailable === "string" && (entry as { unavailable: string }).unavailable !== "" ? null : "has an empty or non-text unavailable marker";
  if (keys !== CONTENT_KEYS) return "carries fields the exporter never writes";
  const e = entry as ExportedContent;
  if (typeof e.text !== "string" || typeof e.truncated !== "boolean" || !Number.isSafeInteger(e.redactions) || e.redactions < 0) return "is malformed";
  const spilled = row.event_type === "tool/result" && spillLocator(row) !== null;
  const source = spilled ? "spill" : row.payload_inline !== null && row.payload_inline !== undefined ? "inline" : "blob";
  if (e.source !== source) return `claims source ${String(e.source)} but its row's payload is ${source}`;
  const committed = spilled ? extractSpillRef(row.meta_json)?.contentSha256 : row.payload_sha256;
  return e.sha256 === committed ? null : "names a digest that is not its row's committed digest";
}

const EMPTY_VERDICT = { fingerprint: "", rowsChecked: 0, tail: "unproven" as const, content: { verified: 0, unverifiable: 0, unavailable: 0 }, usage: null };

/**
 * Offline verification of a document: the embedded key must match the operator's pin, every row must hash and verify
 * under that key with a contiguous per-session chain, a closed session's seal must name the last row, and embedded
 * content must hash to its row's digest where it was neither redacted nor truncated; content that cannot be checked
 * fails the verdict unless explicitly accepted, and the embedded usage summary, cost included, must equal the one
 * recomputed from the rows at the recorded export instant (S15). Nothing in the document runs.
 */
export function verifySessionExport(value: unknown, options: SessionExportVerifyOptions): SessionExportVerdict {
  if (!isDocument(value)) return { ok: false, ...EMPTY_VERDICT, errors: ["not an amc.session-export/v1 document (unknown or missing fields)"] };
  try {
    return verifyDocument(value, options);
  } catch (error) {
    // A row or entry malformed past the shape check fails closed with a reason, never with a crash.
    return { ok: false, ...EMPTY_VERDICT, errors: [`malformed session export: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function verifyDocument(value: SessionExportDocument, options: SessionExportVerifyOptions): SessionExportVerdict {
  const errors: string[] = [];
  const fingerprint = sha256Hex(value.monitorPublicKeyPem);
  const expected = options.expectedFingerprint.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) errors.push("expected monitor fingerprint must be a 64-hex sha256 obtained out of band");
  else if (expected !== fingerprint) errors.push(`embedded monitor key fingerprint ${fingerprint} does not match the pinned ${expected}`);
  // The page prints the embedded fingerprint; it must be the one the embedded key actually has.
  if (value.monitorKeyFingerprint !== fingerprint) errors.push("the displayed monitor key fingerprint is not the sha256 of the embedded key");
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
      // Every entry, an unavailable marker included, must sit on a content row of this session.
      const row = byId.get(id);
      if (!row) { errors.push(`content for unknown event ${id}`); continue; }
      if (!CONTENT_EVENT_TYPES.has(row.event_type)) { errors.push(`content attached to ${row.event_type} event ${id}, which carries no exportable content`); continue; }
      const problem = contentEntryProblem(entry, row);
      if (problem !== null) { errors.push(`content of event ${id} ${problem}`); continue; }
      if ("unavailable" in entry) { content.unavailable += 1; continue; }
      if (entry.source === "spill" || entry.truncated || entry.redactions > 0) { content.unverifiable += 1; continue; }
      if (sha256Hex(Buffer.from(entry.text, "utf8")) !== row.payload_sha256) errors.push(`content of event ${id} does not hash to its committed payload digest`);
      else content.verified += 1;
    }
    if (content.unverifiable > 0 && options.acceptUnverifiableContent !== true) {
      errors.push(`${content.unverifiable} content entr${content.unverifiable === 1 ? "y is" : "ies are"} redacted, truncated or spilled and cannot be checked against the committed digests; pass --accept-unverifiable-content to accept them as display-only`);
    }
  }
  // Recomputed at the recorded export instant, so the catalog cost freshness labels match and the whole summary, cost included, must agree (S15b).
  const usage = projectNativeRunUsage(rows, value.sessionId, value.exportedAt);
  if (JSON.stringify(usage) !== JSON.stringify(value.usage)) errors.push("the embedded usage summary (cost included) does not match the usage recomputed from the rows at the recorded export time");
  // Belt and braces: the seal signature over the final hash is also checked with the single-key verifier.
  if (sealed && value.record?.session_seal_sig && value.record.session_final_event_hash
      && !verifyHexDigest(value.record.session_final_event_hash, value.record.session_seal_sig, value.monitorPublicKeyPem)) errors.push("seal signature does not verify under the embedded key");
  return { ok: errors.length === 0, fingerprint, rowsChecked: rows.length, tail: sealed ? "sealed" : "unproven", content, usage, errors };
}
