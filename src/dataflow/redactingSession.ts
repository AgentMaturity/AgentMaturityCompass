/**
 * Redaction before commit (P2-02). Every composed native session is wrapped; while its workspace has opted in (a processor
 * registry file or its `.sig` exists, checked on every record and latched once seen), user messages, queued inbox text,
 * text attachments and tool results are tokenized before the session writes a row, a spill or a model-visible part.
 * Values a signed tool definition declares in `protectedFields` are tokenized first; the experimental text detectors are
 * the backstop for everything else. They scan JSON as the strings a JSON reader sees, and other text as it is and then
 * with its JSON escapes decoded.
 *
 * Every failure refuses the commit: a locked vault, a vault or receipt write that fails, a token collision, text over the
 * per-leaf limit, undecodable bytes, a declaring tool's unparseable OK result or a runtime without number source text
 * (Node 20) throws a static `RedactionRefused`, and the raw value is never committed. A refused tool result (or native-validation output) is still answered, with a static
 * withheld notice and a `PROTECTED_DATA_REDACTION_REFUSED` audit row, so the transcript stays well formed. Binary
 * attachments and media inbox input are refused (`attachment_not_redactable`), media before anything is spilled.
 * Each redaction writes one `RedactionReceiptV1` audit row before the commit it describes.
 *
 * Detection is heuristic: regexes miss names and free-text identifiers outside declared fields, and model output is
 * recorded as the model produced it. Tokenization reduces identifiers; it is not de-identification or anonymization.
 */
import { redactionReceiptV1Schema, type RedactionReceiptV1 } from "../contracts/v1/redactionReceipt.js";
import { NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { NATIVE_IMAGE_INPUT_FORMAT } from "../attachments/nativeImageInput.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../attachments/nativeOrderedInput.js";
import { OUTCOME_UNKNOWN_NOTICES } from "../agent/pipelineToolSeam.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { RUN_CODE_TOOL } from "../tools/toolPipeline.js";
import { sha256Hex } from "../utils/hash.js";
import { assertNoDuplicateJsonKeys, canonicalize } from "../utils/json.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { decodedFinds, detectProtectedText, DETECTOR_SET_DIGEST, isPasswordMember, isRawJson, MAX_PROTECTED_TEXT_CHARS,
  redactJsonLeaves, redactProtectedText, type ProtectedDataSpan } from "./detectors.js";
import { protectedDataOptedIn } from "./processorRegistry.js";
import { digestField, keyedOutputDigest, RedactionRefused, TOKEN_PATTERN_SOURCE, tokenFor } from "./tokenizer.js";
import { loadTokenKeys, openTokenLookup, storeTokens, type TokenEntry, type TokenKeys } from "./tokenVault.js";

export type DeclaredFields = Readonly<Record<string, ProtectedDataClass>>;
export interface Redaction {
  readonly text: string;
  readonly findings: Readonly<RedactionReceiptV1["findings"]>;
  readonly declaredFields: readonly string[];
}
/**
 * `unparseable` says what a declaring tool's result that is not JSON gets: `refuse` (declared_fields_unparseable), or
 * `detectors` (the text detectors only; for error, denial and cancellation text, which is often plain text).
 */
export interface Redactor { redact(text: string, declared?: DeclaredFields, unparseable?: "refuse" | "detectors"): Redaction }

const MAX_JSON_DEPTH = 64;
// ponytail: for the detectors, JSON inside a string leaf (an MCP result's text holding JSON) is parsed one level deep; JSON
// nested deeper is scanned as text and then searched with its escapes decoded (`scanFallback`). Each level scans its text
// about three times, so raise this only with a scan budget. Declared fields follow JSON strings at any depth.
const MAX_NESTED_JSON = 1;
const WHOLE_TOKEN = new RegExp(`^${TOKEN_PATTERN_SOURCE}$`);
const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;
const NOT_JSON = Symbol("not JSON");

/**
 * Parses JSON text so that re-serializing it reproduces every number's source text (`JSON.rawJSON`, Node 21 and later;
 * redaction refuses without it); `NOT_JSON` when the text is not JSON. A duplicate key keeps its last value, as the parse
 * does. Anything else that stops the parse (nesting too deep) refuses.
 */
function parseExact(text: string): unknown {
  try {
    return JSON.parse(text, (_key, value: unknown, context?: { readonly source?: unknown }) => {
      if (typeof value !== "number") return value;
      if (rawJSON === undefined || typeof context?.source !== "string") throw new RedactionRefused("runtime_unsupported");
      return rawJSON(context.source);
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NOT_JSON;
    throw error instanceof RedactionRefused ? error : new RedactionRefused("detector_invalid");
  }
}

/** Whether JSON text the parse accepted repeats a key: the parse kept the last value, and the earlier one was never read. */
function hasDuplicateKey(source: string): boolean {
  try { assertNoDuplicateJsonKeys(source); return false; } catch { return true; }
}

/** A parse whose strings the leaf scan reads: an object, an array or a string. A number or literal is scanned as its text. */
const isDocument = (root: unknown): boolean => typeof root === "string" || (typeof root === "object" && root !== null && !isRawJson(root));

/**
 * Tokenizes declared paths in a parsed JSON document; `tokenize` counts each value. Returns the tokenized document.
 * Under a declared path every string, number and boolean is a value, and so is every object key (`byName: phi` over
 * {"Jane Roe": {...}}). A value or key that is a token this workspace issued stays as it is, so redacting twice changes
 * nothing. JSON held in a string leaf, at any depth (an MCP result's text block, an HTTP-style `body` inside it), is part
 * of the document: a path that reaches such a string continues inside it, and every path also applies from its top, so a
 * bare `patient.name` covers the text block and a `body` within it. Each string, number literal and key tokenized goes into
 * `values`, for the detector pass to tokenize wherever else the result repeats it (a `structuredContent.patient.name` copy
 * in the text block). A boolean is tokenized only where its path reaches it; recorded, every `true` or `false` in the
 * result would be. ToolHub evidence reuses this walk with a fixed marker for `tokenize`.
 */
export function tokenizeDeclared(parsed: unknown, declared: DeclaredFields, tokenize: (dataClass: ProtectedDataClass, value: string) => string,
  matched: Set<string>, issued: (token: string) => boolean, values: Map<string, ProtectedDataClass>): unknown {
  let tokens = 0;
  const deeper = (depth: number) => { if (depth > MAX_JSON_DEPTH) throw new RedactionRefused("declared_fields_unparseable"); return depth + 1; };
  const mapOwn = (value: object, map: (item: unknown, key: string) => unknown) =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, map(item, key)]));
  const tokenOf = (dataClass: ProtectedDataClass, text: string): string => {
    if (WHOLE_TOKEN.test(text) && issued(text)) return text;
    tokens += 1;
    return tokenize(dataClass, text);
  };
  /** `update` over the JSON object or array a string leaf holds, re-serialized when that tokenized anything; else the leaf. */
  const within = (text: string, update: (doc: unknown) => unknown): string => {
    if (!/^\s*[[{]/.test(text)) return text;
    const doc = parseExact(text);
    if (doc === null || typeof doc !== "object" || isRawJson(doc)) return text;
    const before = tokens;
    const result = update(doc);
    return tokens > before ? JSON.stringify(result) : text;
  };
  // ponytail: a short declared value (7, "x") also tokenizes every equal leaf or key elsewhere in the result; add a minimum
  // length here if that over-redaction matters.
  const record = (dataClass: ProtectedDataClass, text: string): string => {
    const token = tokenOf(dataClass, text);
    if (token !== text) values.set(text, dataClass);
    return token;
  };
  const cover = (item: unknown, dataClass: ProtectedDataClass, depth: number): unknown => {
    const next = deeper(depth);
    if (typeof item === "string") return record(dataClass, item);
    if (typeof item === "number") return record(dataClass, String(item));
    if (typeof item === "boolean") return tokenOf(dataClass, String(item));
    if (isRawJson(item)) return record(dataClass, item.rawJSON);
    if (Array.isArray(item)) return item.map(element => cover(element, dataClass, next));
    if (item === null || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [record(dataClass, key), cover(child, dataClass, next)]));
  };
  const apply = (value: unknown, parts: readonly string[], dataClass: ProtectedDataClass, depth: number): unknown => {
    const next = deeper(depth);
    if (Array.isArray(value)) return value.map(item => apply(item, parts, dataClass, next));
    if (parts.length === 0) return cover(value, dataClass, next);
    if (typeof value === "string") return within(value, doc => apply(doc, parts, dataClass, next));
    if (value === null || typeof value !== "object" || isRawJson(value) || !Object.hasOwn(value, parts[0]!)) return value;
    return mapOwn(value, (item, key) => key === parts[0] ? apply(item, parts.slice(1), dataClass, next) : item);
  };
  const applyAll = (doc: unknown): unknown => Object.entries(declared).reduce((current, [path, dataClass]) => {
    const before = tokens;
    const result = apply(current, path.split("."), dataClass, 0);
    if (tokens > before) matched.add(path);
    return result;
  }, doc);
  // `nested` counts the JSON strings entered, so every path applies from the top of each, as deep as they go.
  const reroot = (value: unknown, nested: number): unknown => typeof value === "string" ? within(value, doc => reroot(applyAll(doc), deeper(nested)))
    : Array.isArray(value) ? value.map(item => reroot(item, nested))
      : value === null || typeof value !== "object" || isRawJson(value) ? value : mapOwn(value, item => reroot(item, nested));
  return reroot(applyAll(parsed), 0);
}

/** Declared fields first, then the text detectors over the result; every token's value is stored before this returns. */
export function createWorkspaceRedactor(workspace: string): Redactor {
  return Object.freeze({
    redact(text: string, declared?: DeclaredFields, unparseable: "refuse" | "detectors" = "refuse"): Redaction {
      const lookup = openTokenLookup(workspace);
      try {
        if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) throw new RedactionRefused("detector_invalid");
        // A re-serialized number must keep its literal; without number source text nothing is redacted, or committed.
        if (rawJSON === undefined) throw new RedactionRefused("runtime_unsupported");
        let keys: TokenKeys | undefined;
        const entries = new Map<string, TokenEntry>();
        // Issued: stored by an earlier redaction, or made by this one (stored only when it returns).
        const issued = (token: string) => entries.has(token) || lookup.issued(token);
        const counts = new Map<string, { dataClass: ProtectedDataClass; detector: string; count: number }>();
        const tokenize = (dataClass: ProtectedDataClass, detector: string, value: string): string => {
          keys ??= loadTokenKeys(workspace);
          const token = tokenFor(keys.hmac, dataClass, value);
          // Two values under one 64-bit token in the same redaction would otherwise merge silently.
          const prior = entries.get(token);
          if (prior !== undefined && prior.value !== value) throw new RedactionRefused("token_collision");
          entries.set(token, { token, dataClass, value });
          const finding = counts.get(`${dataClass}\0${detector}`) ?? { dataClass, detector, count: 0 };
          counts.set(`${dataClass}\0${detector}`, { ...finding, count: finding.count + 1 });
          return token;
        };
        const detected = (region: ProtectedDataSpan, value: string) => tokenize(region.dataClass, region.detector, value);
        const scanText = (value: string) => redactProtectedText(value, detected, issued).text;
        // Values a declared path tokenized, by value.
        const declaredValues = new Map<string, ProtectedDataClass>();
        /**
         * JSON is scanned as a JSON reader sees it: each string leaf and key decoded, each number as its literal, and JSON
         * inside a string leaf the same way. Escaped, a value right after \n or \t has no word boundary, so the patterns
         * would miss it. A `password` member's value is also scanned with its key beside it (`redactMember`). The parse is
         * committed re-serialized, compact, when `force`, when a leaf changed, or when it repeats a key (the earlier value
         * was never read); otherwise its bytes are kept. Neither is scanned again as a whole, so tokens longer than the
         * values they replace never push committed JSON over the per-leaf limit.
         */
        const redactJson = (root: unknown, source: string, nested: number, force: boolean): string => {
          let changed = false;
          const leaves = redactJsonLeaves(root, (value, key) => {
            const redactedLeaf = redactMember(value, key, nested + 1);
            changed ||= redactedLeaf !== value;
            return redactedLeaf;
          });
          return force || changed || hasDuplicateKey(source) ? JSON.stringify(leaves) : source;
        };
        /**
         * One key or leaf (`key`: the member a string leaf sits under). A value a declared path tokenized is tokenized
         * wherever the result repeats it whole. A `password` member's string is also scanned with its key beside it, as
         * the JSON password heuristic needs, and a detection tokenizes the whole value.
         */
        const redactMember = (value: string, key: string | undefined, nested: number): string => {
          const declaredClass = declaredValues.get(value);
          if (declaredClass !== undefined) return tokenize(declaredClass, "declared_field", value);
          const redactedLeaf = redactLeaf(value, nested);
          return isPasswordMember(key, redactedLeaf, issued)
            ? tokenize("credential", key!.toLowerCase() === "password" ? "password_json" : "secret_json", value) : redactedLeaf;
        };
        const redactLeaf = (value: string, nested: number): string => {
          if (nested > MAX_NESTED_JSON || !/^\s*[[{]/.test(value)) return scanFallback(value);
          const root = parseExact(value);
          return root === NOT_JSON ? scanFallback(value) : redactJson(root, value, nested, false);
        };
        /**
         * The class of a value a declared path tokenized that `text` repeats whole, as a JSON string or key (`"Jane Roe"`)
         * or a JSON number, where the leaf scan does not parse it (JSON nested deeper than MAX_NESTED_JSON, JSONL).
         * ponytail: one substring search per declared value; an index over the values if results declare thousands.
         */
        const declaredIn = (text: string): ProtectedDataClass | undefined => {
          if (declaredValues.size === 0) return undefined;
          for (const [value, dataClass] of declaredValues) {
            if (text.includes(JSON.stringify(value))) return dataClass;
            if (!/^-?\d/.test(value)) continue;
            for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
              if (/[:[,\s]/.test(text.charAt(at - 1)) && /^(?:[,\]}\s]|$)/.test(text.charAt(at + value.length))) return dataClass;
            }
          }
          return undefined;
        };
        /**
         * Text that is not one JSON document (JSONL, a log-prefixed line) or JSON nested deeper than MAX_NESTED_JSON:
         * scanned as it is, then searched with its escapes decoded (`decodedFinds`). A declared value it repeats whole, as
         * it is or decoded, and anything only decoding shows, tokenize the whole text; text whose decoding does not settle
         * refuses.
         */
        const scanFallback = (value: string): string => {
          const repeated = declaredIn(value);
          if (repeated !== undefined) return tokenize(repeated, "declared_field", value);
          const scanned = scanText(value);
          const hit: { span?: ProtectedDataSpan; declared?: ProtectedDataClass } = {};
          const found = decodedFinds(scanned, decoded => {
            hit.declared = declaredIn(decoded);
            hit.span = hit.declared === undefined ? detectProtectedText(decoded, issued)[0] : undefined;
            return hit.declared !== undefined || hit.span !== undefined;
          });
          if (!found) return scanned;
          if (hit.declared !== undefined) return tokenize(hit.declared, "declared_field", value);
          if (hit.span === undefined) throw new RedactionRefused("detector_invalid");
          return tokenize(hit.span.dataClass, hit.span.detector, value);
        };
        const matched = new Set<string>();
        const root = parseExact(text);
        const declaring = declared !== undefined && Object.keys(declared).length > 0;
        if (declaring && root === NOT_JSON && unparseable === "refuse") throw new RedactionRefused("declared_fields_unparseable");
        let redacted: string;
        try {
          // A declaring tool's parsed result is always committed re-serialized, never as its original bytes: a shadowed
          // duplicate key's value was never inspected, and declared fields bind exactly the committed bytes.
          redacted = declaring && root !== NOT_JSON
            ? redactJson(tokenizeDeclared(root, declared!, (dataClass, value) => tokenize(dataClass, "declared_field", value), matched, issued,
              declaredValues), text, 0, true)
            : isDocument(root) ? redactJson(root, text, 0, false) : scanFallback(text);
        } catch (error) {
          throw error instanceof RedactionRefused ? error : new RedactionRefused("detector_invalid");
        }
        if (keys !== undefined) storeTokens(workspace, keys, [...entries.values()]);
        return Object.freeze({ text: redacted, findings: Object.freeze([...counts.values()]), declaredFields: Object.freeze([...matched].sort()) });
      } catch (error) {
        // JSON.parse and driver errors can quote input; only a static reason leaves this function.
        throw error instanceof RedactionRefused ? error : new RedactionRefused("redaction_failed");
      } finally {
        lookup.close();
      }
    }
  });
}

function declaredFieldsFor(workspace: string, toolName: string | undefined): DeclaredFields | undefined {
  let snapshot: ReturnType<typeof loadVerifiedToolsConfigSnapshot>;
  try { snapshot = loadVerifiedToolsConfigSnapshot(workspace); } catch { throw new RedactionRefused("declared_fields_unverifiable"); }
  // An unsigned config declares nothing; a signed one that no longer verifies cannot say what it declared.
  if (snapshot.config === null) {
    if (snapshot.signatureExists) throw new RedactionRefused("declared_fields_unverifiable");
    return undefined;
  }
  if (toolName !== undefined && toolName !== RUN_CODE_TOOL) return findToolDefinition(snapshot.config, toolName)?.protectedFields;
  // A result whose call this session never recorded (or whose ID two calls share) cannot be matched to its tool's
  // declarations, and a Code Mode result relays what declaring tools returned to the program, raw.
  // ponytail: so every run_code result is refused (withheld) while some tool declares fields; tokenizing each sub-call's
  // declared fields at the ToolPipeline boundary, before the program sees them, lifts that.
  if (snapshot.config.tools.allowedTools.some(tool => tool.protectedFields !== undefined)) throw new RedactionRefused("declared_fields_unverifiable");
  return undefined;
}

function decodeText(content: string | Buffer, refusal: "content_not_text" | "attachment_not_redactable"): string {
  if (typeof content === "string") return content;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(content); } catch { throw new RedactionRefused(refusal); }
}

/** Writes the receipt row for `result` on `session` when anything was found; failure refuses (receipt_failed). */
function writeReceipt(session: SessionService, result: Redaction, source: RedactionReceiptV1["source"], callId: string | null): void {
  if (result.findings.length === 0) return;
  try {
    const receipt = redactionReceiptV1Schema.parse({ schema: "amc.redaction-receipt/v1", sessionId: session.sessionId, source, callId,
      detectorsVersion: DETECTOR_SET_DIGEST, findings: result.findings, declaredFields: result.declaredFields, redactedDigest: sha256Hex(result.text) });
    session.recordProjectedEvidence({ eventType: "audit", payload: canonicalize(receipt), meta: { auditType: "PROTECTED_DATA_REDACTED",
      redactionSource: receipt.source, callId: receipt.callId, detectorsVersion: receipt.detectorsVersion, findings: receipt.findings,
      declaredFields: receipt.declaredFields, redactedDigest: receipt.redactedDigest } });
  } catch {
    throw new RedactionRefused("receipt_failed");
  }
}

/** Redacts `text` and, when anything was found, writes its receipt row on `session` first; any failure refuses. */
function redactWithReceipt(session: SessionService, redactor: Redactor, text: string, source: RedactionReceiptV1["source"],
  callId: string | null, declared?: DeclaredFields, unparseable?: "refuse" | "detectors"): string {
  const result = redactor.redact(text, declared, unparseable);
  writeReceipt(session, result, source, callId);
  return result.text;
}

// The canonical encodings of queued media input start with their format (canonicalize sorts keys, and "format" sorts first).
const MEDIA_INPUT_PREFIXES = [NATIVE_IMAGE_INPUT_FORMAT, NATIVE_ORDERED_INPUT_FORMAT, NATIVE_AUDIO_INPUT_FORMAT]
  .map(format => Buffer.from(`{"format":"${format}"`, "utf8"));

/**
 * Wraps `session`: while `active()`, the record methods below redact, then delegate; otherwise they delegate unchanged.
 * Every other member is the session's own.
 */
export function createRedactingSession(session: SessionService, redactor: Redactor, active: () => boolean = () => true): SessionService {
  const spilledDescriptors = new Set<string>();
  const redact = (text: string, source: RedactionReceiptV1["source"], callId: string | null, declared?: DeclaredFields,
    unparseable?: "refuse" | "detectors"): string => redactWithReceipt(session, redactor, text, source, callId, declared, unparseable);
  /**
   * Tool output that must still be answered. A refusal commits a static notice in place of the output, after a
   * `PROTECTED_DATA_REDACTION_REFUSED` row naming the reason, so the call is never left unanswered; the output is not
   * committed anywhere.
   */
  const redactOrWithhold = (callId: string, redactOutput: () => string): string => {
    try {
      return redactOutput();
    } catch (error) {
      if (!(error instanceof RedactionRefused)) throw error;
      session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: { auditType: "PROTECTED_DATA_REDACTION_REFUSED",
        redactionSource: "tool/result", callId, reason: error.reason } });
      return `[amc] tool output withheld: protected-data redaction refused (${error.reason})`;
    }
  };
  /**
   * The tool each call ID names, from the session's signed tool/call rows (a resumed session's earlier calls included),
   * read once and then kept current by recordToolCall. Null when two calls share an ID (adapters do not reject that), so
   * a result is never matched to another tool's declarations.
   */
  let toolNames: Map<string, string | null> | undefined;
  const noteCall = (names: Map<string, string | null>, callId: string, toolName: string | null) =>
    names.set(callId, names.has(callId) ? null : toolName);
  const toolNameOf = (callId: string): string | null | undefined => {
    if (toolNames === undefined) {
      const names = new Map<string, string | null>();
      for (const event of session.readEvents()) {
        if (event.event_type !== "tool/call") continue;
        let meta: { toolCallId?: unknown; toolName?: unknown };
        try { meta = JSON.parse(event.meta_json) as typeof meta; } catch { throw new RedactionRefused("declared_fields_unverifiable"); }
        if (typeof meta.toolCallId === "string") noteCall(names, meta.toolCallId, typeof meta.toolName === "string" ? meta.toolName : null);
      }
      toolNames = names;
    }
    return toolNames.get(callId);
  };
  const keyedOutput = (fields: Readonly<Record<string, unknown>>): Record<string, unknown> => {
    if (!Object.hasOwn(fields, "outputSha256")) return { ...fields };
    const { outputSha256, ...kept } = fields;
    if (typeof outputSha256 !== "string" || !/^[0-9a-f]{64}$/.test(outputSha256)) throw new RedactionRefused("redaction_failed");
    return { ...kept, ...digestField("output", keyedOutputDigest(loadTokenKeys(session.workspace).hmac, outputSha256)) };
  };
  const overrides = {
    recordUserMessage(text: string, provenance?: Parameters<SessionService["recordUserMessage"]>[1]): SessionEventRef {
      return session.recordUserMessage(active() ? redact(text, "user/message", null) : text, provenance);
    },
    recordUserAttachment(params: Parameters<SessionService["recordUserAttachment"]>[0]): SessionEventRef {
      if (!active()) return session.recordUserAttachment(params);
      // ponytail: image and audio bytes are refused outright, whatever the provider's processor contract covers; admitting
      // them under a covering contract needs processors on destinations (P2-02 step 7, slice 3).
      if (params.kind !== "text") throw new RedactionRefused("attachment_not_redactable");
      const content = redact(decodeText(params.content, "attachment_not_redactable"), "user/attachment", null);
      return session.recordUserAttachment({ ...params, filename: redact(params.filename, "user/attachment", null), content });
    },
    recordToolCall(call: Parameters<SessionService["recordToolCall"]>[0]): SessionEventRef {
      const ref = session.recordToolCall(call);
      if (toolNames !== undefined) noteCall(toolNames, call.toolCallId, call.toolName);
      return ref;
    },
    recordToolResult(result: Parameters<SessionService["recordToolResult"]>[0]): SessionEventRef {
      if (!active()) return session.recordToolResult(result);
      const content = redactOrWithhold(result.toolCallId, () => {
        // Declared fields bind a declaring tool's result in every outcome: a failing EHR or HTTP tool can still return the
        // record. An OK result must be JSON; error, denial and cancellation text that is not JSON gets the detectors only.
        // An unknown or shared call ID has no single tool, so it counts as unrecorded.
        const declared = declaredFieldsFor(session.workspace, toolNameOf(result.toolCallId) ?? undefined);
        const text = decodeText(result.content, "content_not_text");
        // The seam puts a static notice before an unknown outcome's output, which is then no longer JSON; the output after
        // it is redacted as itself. Only an exact notice is set aside, so a tool cannot skip anything by imitating one.
        const notice = result.outcome === "TOOL_OUTCOME_UNKNOWN" ? OUTCOME_UNKNOWN_NOTICES.find(prefix => text.startsWith(prefix)) ?? "" : "";
        return notice + redact(text.slice(notice.length), "tool/result", result.toolCallId, declared,
          result.outcome === "OK" ? "refuse" : "detectors");
      });
      return session.recordToolResult({ ...result, content });
    },
    /**
     * Evidence about tool output. A native-validation check's output is redacted like a tool result. A stdout row's plain
     * `outputSha256`, which a short output (an SSN, a card number) would let anyone brute-force, becomes the keyed
     * `outputDigest` (`hmac-sha256` over that SHA-256): a delegate's report has one; a tool row already carries the
     * pipeline's keyed digest, the same one its action receipt binds.
     */
    recordProjectedEvidence(row: Parameters<SessionService["recordProjectedEvidence"]>[0]): SessionEventRef {
      if (!active()) return session.recordProjectedEvidence(row);
      if (row.eventType === "stdout") {
        let payload: unknown;
        try { payload = JSON.parse(row.payload); } catch { throw new RedactionRefused("redaction_failed"); }
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new RedactionRefused("redaction_failed");
        return session.recordProjectedEvidence({ ...row, payload: JSON.stringify(keyedOutput(payload as Record<string, unknown>)),
          meta: keyedOutput(row.meta) });
      }
      if (row.meta.kind === "native-validation" && row.meta.phase === "check-result" && row.payload !== "") {
        const callId = typeof row.meta.callId === "string" ? row.meta.callId : "native-validation";
        return session.recordProjectedEvidence({ ...row, payload: redactOrWithhold(callId, () => redact(row.payload, "tool/result", callId)) });
      }
      return session.recordProjectedEvidence(row);
    },
    // The inbox row is the queued message's first durable copy, so it is redacted here, before user/message is.
    recordLoopEvent(record: Parameters<SessionService["recordLoopEvent"]>[0]): SessionEventRef {
      if (!active() || record.kind !== "inbox" || record.op !== "insert" || record.text === null) return session.recordLoopEvent(record);
      if (record.payloadFormat !== undefined) throw new RedactionRefused("attachment_not_redactable");
      if (spilledDescriptors.has(record.text)) return session.recordLoopEvent(record);
      return session.recordLoopEvent({ ...record, text: redact(record.text, "loop/inbox", null) });
    },
    retainOversizeInput(...[what, bytes, cap, subject]: Parameters<SessionService["retainOversizeInput"]>): ReturnType<SessionService["retainOversizeInput"]> {
      if (!active() || subject.subject !== "loop/inbox") return session.retainOversizeInput(what, bytes, cap, subject);
      // Media is refused before its spill commitment or object is written, not after.
      if (MEDIA_INPUT_PREFIXES.some(prefix => bytes.subarray(0, prefix.length).equals(prefix))) throw new RedactionRefused("attachment_not_redactable");
      const redacted = Buffer.from(redact(decodeText(bytes, "content_not_text"), "loop/inbox", null), "utf8");
      const retained = session.retainOversizeInput(what, redacted, cap, subject);
      spilledDescriptors.add(retained.descriptor.toString("utf8"));
      return retained;
    }
  };
  return new Proxy(session, {
    get(target, property) {
      if (typeof property === "string" && Object.hasOwn(overrides, property)) return overrides[property as keyof typeof overrides];
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });
}

/**
 * The composition's wrapper. Opt-in, like admission, but read on every record rather than once: a long-lived session
 * (ACP, the SDK, A4) composed before `.amc/dataflow/processors.yaml` existed redacts from the moment it does. Until then
 * every record method delegates unchanged.
 */
export function redactingSessionFor(session: SessionService): SessionService {
  const workspace = session.workspace;
  return createRedactingSession(session, createWorkspaceRedactor(workspace), () => protectedDataOptedIn(workspace));
}

/**
 * Operator compaction text (`amc session compact`). In an opted-in workspace, the redacted text, which the edit is
 * validated and committed with (tokens are longer than short values, so validation must see them), and `writeReceipt`,
 * to call on the writing session immediately before the compaction append, so no receipt describes an edit validation
 * refused. Elsewhere the text unchanged and no receipt.
 */
export function redactCompactionReplacement(workspace: string, text: string):
  { readonly text: string; readonly writeReceipt: (session: SessionService) => void } {
  if (!protectedDataOptedIn(workspace)) return { text, writeReceipt: () => undefined };
  const result = createWorkspaceRedactor(workspace).redact(text);
  return { text: result.text, writeReceipt: (session) => writeReceipt(session, result, "operator/compaction", null) };
}
