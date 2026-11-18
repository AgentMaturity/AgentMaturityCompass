/**
 * Session export (UX-05): one native agent session's signed rows, as `amc session export` writes them. Two shapes:
 *
 * - the sealed bundle (`kind: "amc.session-export"`, `v: 1`), written for a `.json` path; and
 * - the viewer document (`schema: "amc.session-export/v1"`), embedded in the `.html` viewer and written by `--json-out`.
 *
 * Every row's `event_hash` is recomputed from its pre-image (AMC's `canonicalMetadataForHash`), its `writer_sig` is
 * Ed25519 over the 32 hash bytes, and the rows must form one per-session chain (envelope `seq` 0, 1, … and
 * `prevSessionEventHash` from `SESSION_GENESIS`). The signer is looked up among the supplied trust lists' keys and must
 * be admitted for `ledger-row`; a key the export carries only tells the verifier which key to look for. A sealed
 * session's seal must name the last row and verify; an unsealed one (a chat left open to be continued) is said to be
 * unsealed, and its completeness is not evaluated, because a cut-off tail cannot be detected.
 *
 * Not checked here, and said so: the workspace-wide chain across sessions, payloads the export does not carry, the
 * viewer's usage summary, and the page around an HTML viewer's embedded data (`amc session verify-export` checks that).
 */
import { canonicalize, same, sha256Hex, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { isRecord } from "../schema.js";
import { admit, listedKeys } from "../trust.js";
import { refused } from "./common.js";

const BUNDLE_KIND = "amc.session-export";
const VIEWER_SCHEMA = "amc.session-export/v1";
const GENESIS = "SESSION_GENESIS";
const HEX64 = /^[0-9a-f]{64}$/;
const CONTENT_EVENT_TYPES = new Set(["system/prompt", "user/message", "assistant/block", "tool/call", "tool/result"]);

interface Row {
  id: string; ts: number; session_id: string; runtime: string; event_type: string;
  payload_path: string | null; payload_inline: string | null; payload_sha256: string; meta_json: string;
  prev_event_hash: string; event_hash: string; writer_sig: string;
  canonical_payload_path?: string | null; canonical_payload_inline?: string | null;
}

interface Seal { ended: boolean; finalHash: string | null; signature: string | null }

interface Parsed {
  sessionId: string;
  rows: Row[];
  seal: Seal;
  carriedKeys: string[];
  descriptor: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  exportedAt: number | null;
}

/** Whether a parsed JSON value is a session export of either shape (any version: an unknown one fails closed). */
export function isSessionExport(value: Record<string, unknown>): boolean {
  return value.kind === BUNDLE_KIND || (typeof value.schema === "string" && value.schema.startsWith("amc.session-export"));
}

const str = (value: unknown): value is string => typeof value === "string";
const nullableStr = (value: unknown): boolean => value === null || value === undefined || typeof value === "string";

function asRow(value: unknown, index: number): Row {
  if (!isRecord(value)) throw new Error(`rows[${index}] is not an object`);
  const v = value;
  const ok = str(v.id) && Number.isSafeInteger(v.ts) && str(v.session_id) && str(v.runtime) && str(v.event_type)
    && nullableStr(v.payload_path) && nullableStr(v.payload_inline) && str(v.payload_sha256) && HEX64.test(v.payload_sha256 as string)
    && str(v.meta_json) && str(v.prev_event_hash) && str(v.event_hash) && HEX64.test(v.event_hash as string) && str(v.writer_sig)
    && nullableStr(v.canonical_payload_path) && nullableStr(v.canonical_payload_inline);
  if (!ok) throw new Error(`rows[${index}] is not a session evidence row`);
  return v as unknown as Row;
}

function parse(value: Record<string, unknown>): Parsed {
  const rows = Array.isArray(value.rows) ? value.rows.map(asRow) : [];
  if (rows.length === 0) throw new Error("the export carries no rows");
  if (!str(value.sessionId) || value.sessionId.length === 0) throw new Error("sessionId is missing");
  if (value.kind === BUNDLE_KIND) {
    const record = value.record;
    if (!isRecord(record) || !str(record.session_final_event_hash) || !str(record.session_seal_sig)) throw new Error("the bundle's record carries no seal");
    const keys = Array.isArray(value.monitorPublicKeys) ? value.monitorPublicKeys.filter(str) : [];
    return { sessionId: value.sessionId, rows, carriedKeys: keys, content: null, exportedAt: Number.isSafeInteger(value.exportedTs) ? value.exportedTs as number : null,
      descriptor: isRecord(value.descriptor) ? value.descriptor : null,
      seal: { ended: true, finalHash: record.session_final_event_hash, signature: record.session_seal_sig } };
  }
  const record = value.record;
  if (record !== null && !isRecord(record)) throw new Error("record is not an object");
  const ended = isRecord(record) && record.ended_ts !== null && record.ended_ts !== undefined;
  const content = value.content === null || value.content === undefined ? null : isRecord(value.content) ? value.content : null;
  if (value.content !== null && value.content !== undefined && content === null) throw new Error("content is not an object");
  return { sessionId: value.sessionId, rows, content, descriptor: null, exportedAt: Number.isSafeInteger(value.exportedAt) ? value.exportedAt as number : null,
    carriedKeys: str(value.monitorPublicKeyPem) ? [value.monitorPublicKeyPem] : [],
    seal: { ended, finalHash: isRecord(record) && str(record.session_final_event_hash) ? record.session_final_event_hash : null,
      signature: isRecord(record) && str(record.session_seal_sig) ? record.session_seal_sig : null } };
}

/** AMC's `canonicalMetadataForHash`: the receipt fields added after hashing are stripped from parseable meta. */
function metaForHash(metaJson: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(metaJson); } catch { return metaJson; }
  if (typeof parsed !== "object" || parsed === null) return metaJson;
  const clone: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  delete clone.receipt;
  delete clone.receipt_sha256;
  return JSON.stringify(clone);
}

export function rowEventHash(row: Row): string {
  const metadata = canonicalize({ id: row.id, ts: row.ts, session_id: row.session_id, runtime: row.runtime, event_type: row.event_type,
    payload_path: row.canonical_payload_path ?? row.payload_path, payload_inline: row.canonical_payload_inline ?? row.payload_inline,
    meta_json: metaForHash(row.meta_json) });
  return sha256Hex(`${row.prev_event_hash}${metadata}${row.payload_sha256}`);
}

const signs = (pem: string, hashHex: string, signature: string): boolean =>
  HEX64.test(hashHex) && verifySignature(Buffer.from(hashHex, "hex"), pem, Buffer.from(signature, "base64"));

function envelopeOf(row: Row): { sessionId: unknown; seq: unknown; prevSessionEventHash: unknown } | null {
  try {
    const meta: unknown = JSON.parse(row.meta_json);
    const envelope = isRecord(meta) ? meta.amcSession : undefined;
    return isRecord(envelope) && envelope.v === 1 ? { sessionId: envelope.sessionId, seq: envelope.seq, prevSessionEventHash: envelope.prevSessionEventHash } : null;
  } catch {
    return null;
  }
}

function merkleRoot(hashes: readonly string[]): string {
  const digest = (...parts: Buffer[]) => Buffer.from(sha256Hex(Buffer.concat(parts)), "hex");
  if (hashes.length === 0) return sha256Hex(Buffer.alloc(0));
  let level = hashes.map(hex => digest(Buffer.from([0]), Buffer.from(hex, "hex")));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(level[i + 1] === undefined ? level[i]! : digest(Buffer.from([1]), level[i]!, level[i + 1]!));
    level = next;
  }
  return level[0]!.toString("hex");
}

function agentOf(row: Row): string {
  try {
    const meta: unknown = JSON.parse(row.meta_json);
    return isRecord(meta) && str(meta.agentId) && meta.agentId.length > 0 ? meta.agentId : "unknown";
  } catch {
    return "unknown";
  }
}

/** The descriptor AMC derives from the rows alone (`describeSessionRows`); a sealed bundle carries it. */
function descriptorFor(parsed: Parsed, fingerprint: string): Record<string, unknown> {
  const { rows } = parsed;
  const seals = rows.filter(row => row.event_type === "turn/seal").map(row => row.event_hash);
  return { v: 1, sessionId: parsed.sessionId, lifecycle: "closed", runtime: rows[0]!.runtime, agentId: agentOf(rows[0]!), startedTs: rows[0]!.ts,
    endedTs: rows[rows.length - 1]!.ts, eventCount: rows.length, turnCount: rows.filter(row => row.event_type === "turn/start").length,
    sealCount: seals.length, sealEventHashes: seals, sessionMerkleRoot: merkleRoot(seals), openEventHash: rows[0]!.event_hash,
    closeEventHash: rows[rows.length - 1]!.event_hash, monitorKeyFingerprint: fingerprint };
}

/** Rows, chain and seal; integrity findings, plus the signer key id when a listed key made the signatures. */
function checkRows(parsed: Parsed, env: Env, integrity: Finding<"integrity">[]): { signer: { keyId: string; pem: string } | null } {
  const { rows, sessionId } = parsed;
  const first = rows[0]!;
  // A carried key only narrows the search; the signer must be a key the supplied lists hold.
  const carried = new Set(parsed.carriedKeys.map(pem => sha256Hex(pem)));
  const listed = listedKeys(env.ctx);
  const ordered = [...listed.filter(key => carried.has(key.keyId)), ...listed.filter(key => !carried.has(key.keyId))];
  const signer = ordered.find(key => signs(key.publicKeyPem, first.event_hash, first.writer_sig)) ?? null;
  let expectedSeq = 0;
  let expectedPrev = GENESIS;
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) integrity.push({ code: "MALFORMED", detail: `event ${row.id} appears twice` });
    ids.add(row.id);
    if (row.session_id !== sessionId) integrity.push({ code: "MALFORMED", detail: `event ${row.id} belongs to another session` });
    if (rowEventHash(row) !== row.event_hash) integrity.push({ code: "DIGEST_MISMATCH", detail: `event ${row.id} was changed: its hash does not match its contents` });
    if (signer !== null && !signs(signer.publicKeyPem, row.event_hash, row.writer_sig)) {
      integrity.push({ code: "SIGNATURE_INVALID", detail: `event ${row.id} is not signed by the key that signed the first event` });
    }
    const envelope = envelopeOf(row);
    if (envelope === null) integrity.push({ code: "MALFORMED", detail: `event ${row.id} carries no session envelope` });
    else {
      if (envelope.sessionId !== row.session_id) integrity.push({ code: "MALFORMED", detail: `event ${row.id} names another session in its envelope` });
      if (envelope.seq !== expectedSeq || envelope.prevSessionEventHash !== expectedPrev) {
        integrity.push({ code: "DIGEST_MISMATCH", detail: `the session chain is broken at event ${row.id} (a row was removed, added or reordered)` });
      }
    }
    expectedSeq += 1;
    expectedPrev = row.event_hash;
  }
  if (first.event_type !== "session/open") integrity.push({ code: "MALFORMED", detail: "the export does not begin with the session's first event" });
  if (parsed.seal.ended) {
    const last = rows[rows.length - 1]!;
    if (last.event_type !== "session/close") integrity.push({ code: "MALFORMED", detail: "a sealed session's export does not end with its closing event" });
    if (parsed.seal.finalHash === null || !same(parsed.seal.finalHash, last.event_hash)) integrity.push({ code: "DIGEST_MISMATCH", detail: "the seal does not name the last event" });
    else if (signer !== null && (parsed.seal.signature === null || !signs(signer.publicKeyPem, parsed.seal.finalHash, parsed.seal.signature))) {
      integrity.push({ code: "SIGNATURE_INVALID", detail: "the seal is not signed by the key that signed the events" });
    }
  }
  if (parsed.descriptor !== null && signer !== null && canonicalize(descriptorFor(parsed, signer.keyId)) !== canonicalize(parsed.descriptor)) {
    integrity.push({ code: "DIGEST_MISMATCH", detail: "the bundle's summary (descriptor) does not match the rows it describes" });
  }
  return { signer: signer === null ? null : { keyId: signer.keyId, pem: signer.publicKeyPem } };
}

function spillOf(row: Row): { locator: string; commitment: unknown } | null {
  try {
    const meta: unknown = JSON.parse(row.meta_json);
    const ref = isRecord(meta) ? meta.spilled : undefined;
    return isRecord(ref) && str(ref.locator) ? { locator: ref.locator, commitment: ref.contentSha256 } : null;
  } catch {
    return null;
  }
}

const CONTENT_KEYS = "redactions,sha256,source,text,truncated";

/**
 * Content entries a viewer document embeds, by the rules of AMC's `verifySessionExport` (tests/verifier/sessionExport
 * runs both over the same exports): the exact key set; `source` as the row's payload is stored (spill only when the row's
 * signed meta names a spill); `sha256` the row's committed digest for EVERY entry; `redactions` a non-negative integer.
 * A field that contradicts the signed row fails integrity. Shown text that cannot be compared with its commitment
 * (shortened, redacted or spilled) is returned by id: it was not checked, so the export is not a pass.
 */
function checkContent(parsed: Parsed, integrity: Finding<"integrity">[]): string[] {
  if (parsed.content === null) return [];
  const byId = new Map(parsed.rows.map(row => [row.id, row]));
  const unchecked: string[] = [];
  for (const [id, entry] of Object.entries(parsed.content)) {
    const row = byId.get(id);
    const bad = (detail: string) => integrity.push({ code: "MALFORMED", detail: `the content of ${id} ${detail}` });
    if (row === undefined || !CONTENT_EVENT_TYPES.has(row.event_type)) { bad("is attached to an event that is not a content event of this session"); continue; }
    if (!isRecord(entry)) { bad("is not an object"); continue; }
    const keys = Object.keys(entry).sort().join(",");
    if (keys === "unavailable") { if (!str(entry.unavailable) || entry.unavailable === "") bad("has an empty unavailable marker"); continue; }
    if (keys !== CONTENT_KEYS) { bad("carries fields the exporter never writes"); continue; }
    if (!str(entry.text) || typeof entry.truncated !== "boolean" || !Number.isSafeInteger(entry.redactions) || (entry.redactions as number) < 0) { bad("is malformed"); continue; }
    const spill = row.event_type === "tool/result" ? spillOf(row) : null;
    const source = spill !== null ? "spill" : row.payload_inline !== null && row.payload_inline !== undefined ? "inline" : "blob";
    if (entry.source !== source) { bad(`claims source ${String(entry.source)} but the recorded payload is ${source}`); continue; }
    const committed = spill !== null ? spill.commitment : row.payload_sha256;
    if (!str(entry.sha256) || !str(committed) || !same(entry.sha256, committed)) {
      integrity.push({ code: "DIGEST_MISMATCH", detail: `the content of ${id} names a digest that is not the recorded one` });
      continue;
    }
    if (source === "spill" || entry.truncated === true || (entry.redactions as number) > 0) { unchecked.push(id); continue; }
    if (sha256Hex(Buffer.from(entry.text, "utf8")) !== row.payload_sha256) {
      integrity.push({ code: "DIGEST_MISMATCH", detail: `the text shown for ${id} is not the text that was recorded` });
    }
  }
  return unchecked;
}

export function evaluateSessionExport(value: Record<string, unknown>, env: Env, fromHtml: boolean): Evaluation {
  const supported = (value.kind === BUNDLE_KIND && value.v === 1) || value.schema === VIEWER_SCHEMA;
  if (!supported) return refused("session-export", { code: "UNSUPPORTED_VERSION", detail: "a session export version this verifier does not know" });
  let parsed: Parsed;
  try {
    parsed = parse(value);
  } catch (error) {
    return refused("session-export", { code: "MALFORMED", detail: error instanceof Error ? error.message : String(error) });
  }
  const integrity: Finding<"integrity">[] = [];
  const warnings: string[] = [];
  const { signer } = checkRows(parsed, env, integrity);
  const unchecked = checkContent(parsed, integrity);
  // A closed session's last signed row is its session/close: an export whose rows show that close but carry no seal had it removed.
  const lastRow = parsed.rows[parsed.rows.length - 1]!;
  if (!parsed.seal.ended && lastRow.event_type === "session/close") {
    integrity.push({ code: "MALFORMED", detail: "the rows show the session was closed, but the export carries no seal: the seal was removed" });
  }
  const notEstablished: string[] = [];
  if (!parsed.seal.ended) notEstablished.push("the session is not sealed (a chat closed with /exit stays open so it can be continued), so this may be a cut-off copy: events after the last one shown would not be noticed");
  if (unchecked.length > 0) notEstablished.push(`the shown text of ${unchecked.length} event${unchecked.length === 1 ? "" : "s"} (${unchecked.slice(0, 5).join(", ")}${unchecked.length > 5 ? ", …" : ""}) was shortened, had secrets removed or was stored apart, so it was not checked against the record`);
  if (fromHtml) notEstablished.push("the readable page was not checked against the record: only the signed data inside it was (amc session verify-export checks the page)");
  const admission = admit({ signature: "session events and seal", keyId: signer?.keyId ?? null, purpose: "ledger-row" }, env.ctx);
  if (value.schema === VIEWER_SCHEMA) warnings.push("the usage and cost summary in this export was not checked");
  warnings.push("not checked: the workspace's chain across other sessions, and any public log anchoring");
  const last = parsed.rows[parsed.rows.length - 1]!;
  return {
    kind: "session-export", integrity, admissions: [admission],
    unverifiable: signer === null ? ["session events: no key in the supplied trust lists made these signatures"] : [],
    admissionFindings: [], anchoring: { status: "not-applicable", detail: null },
    claimedAt: new Date(last.ts).toISOString(), warnings,
    scope: () => scopeResult({ subject: agentOf(parsed.rows[0]!) }, env.expect),
    freshness: () => result<"freshness">(env.ctx.asOf < last.ts ? [{ code: "NOT_YET_VALID", detail: "the session's last event is after the as-of time" }] : []),
    completeness: () => result<"completeness">([], notEstablished.length === 0 ? null : `not established: ${notEstablished.join("; ")}`),
    satisfaction: () => notRecomputable("a session record shows what was recorded, not whether the work was right")
  };
}

/** The embedded document of an `amc session export` HTML viewer: exactly one embedded block, parsed, nothing run. */
export function embeddedSessionExport(bytes: Uint8Array): unknown {
  const html = Buffer.from(bytes).toString("utf8");
  const open = '<script type="application/json" id="amc-session-export">';
  const start = html.indexOf(open);
  if (start < 0 || html.indexOf(open, start + 1) >= 0) return undefined;
  const end = html.indexOf("</script>", start + open.length);
  if (end < 0) return undefined;
  try { return JSON.parse(html.slice(start + open.length, end)); } catch { return undefined; }
}
