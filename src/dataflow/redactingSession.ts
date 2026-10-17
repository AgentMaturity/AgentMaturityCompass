/**
 * Redaction before commit (P2-02). Every composed native session is wrapped; while its workspace has opted in (a processor
 * registry file or its `.sig` exists, checked on every record and latched once seen), user messages, queued inbox text,
 * text attachments and tool results are tokenized before the session writes a row, a spill or a model-visible part.
 * Values a signed tool definition declares in `protectedFields` are tokenized first; the experimental text detectors are
 * the backstop for everything else, and they scan exactly the text that is committed.
 *
 * Every failure refuses the commit: a locked vault, a vault or receipt write that fails, a token collision, text over the
 * per-leaf limit, undecodable bytes or a declaring tool's unparseable OK result throws a static `RedactionRefused`, and the
 * raw value is never committed. A refused tool result (or native-validation output) is still answered, with a static
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
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { RUN_CODE_TOOL } from "../tools/toolPipeline.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { DETECTOR_SET_DIGEST, MAX_PROTECTED_TEXT_CHARS, redactProtectedText } from "./detectors.js";
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
const WHOLE_TOKEN = new RegExp(`^${TOKEN_PATTERN_SOURCE}$`);
interface RawJson { readonly rawJSON: string }
const jsonRaw = JSON as unknown as { rawJSON?: (text: string) => RawJson; isRawJSON?: (value: unknown) => value is RawJson };
const isRawJson = (value: unknown): value is RawJson => jsonRaw.isRawJSON?.(value) === true;
const JSON_STRING_OR_NUMBER = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * Parses a declaring tool's result so that re-serializing it reproduces every number's source text: where the engine
 * exposes it (Node 21+), each number keeps its literal; elsewhere a literal a double would change (1.0, 1e5, 2^53 + 1)
 * refuses. A duplicate key keeps its last value, as the parse does, and the committed text is that re-serialization.
 */
function parseExact(text: string): unknown {
  const rawJSON = jsonRaw.rawJSON;
  const refused = () => new RedactionRefused("declared_fields_unparseable");
  let root: unknown;
  try {
    root = rawJSON === undefined ? JSON.parse(text) : JSON.parse(text, (_key, value: unknown, context?: { readonly source?: unknown }) => {
      if (typeof value !== "number") return value;
      if (typeof context?.source !== "string") throw refused();
      return rawJSON(context.source);
    });
  } catch { throw refused(); }
  if (rawJSON === undefined) {
    for (const [literal] of text.matchAll(JSON_STRING_OR_NUMBER)) if (!literal.startsWith("\"") && String(Number(literal)) !== literal) throw refused();
  }
  return root;
}

/** The re-serialized parse, indented when the source had line breaks. */
const reserialize = (root: unknown, source: string): string => JSON.stringify(root, null, source.includes("\n") ? 2 : undefined);

/**
 * The text the detectors scan and the session commits. JSON whose strings hold \u escapes is committed as its
 * re-serialization, which writes each escaped character out (all but control characters and lone surrogates), so the
 * detectors see what any JSON reader sees ("\u0034111 1111 1111 1111" is a card number). Other text is kept as it is.
 * ponytail: escapes in text that is not JSON (code, a partial document) stay escaped and unseen by the detectors.
 */
function unescapedJson(text: string): string {
  if (!/\\u[0-9a-fA-F]{4}/.test(text)) return text;
  try { return reserialize(parseExact(text), text); } catch { return text; }
}

/**
 * Tokenizes declared paths in a parsed JSON document; `tokenize` counts each value. Returns the re-serialized document.
 * Under a declared path every string, number and boolean is a value, and so is every object key (`byName: phi` over
 * {"Jane Roe": {...}}). A value or key that is a token this workspace issued stays as it is, so redacting twice changes
 * nothing.
 */
function tokenizeDeclared(parsed: unknown, source: string, declared: DeclaredFields,
  tokenize: (dataClass: ProtectedDataClass, value: string) => string, matched: Set<string>, issued: (token: string) => boolean): string {
  let root = parsed;
  let tokens = 0;
  const deeper = (depth: number) => { if (depth > MAX_JSON_DEPTH) throw new RedactionRefused("declared_fields_unparseable"); return depth + 1; };
  const mapOwn = (value: object, map: (item: unknown, key: string) => unknown) =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, map(item, key)]));
  const tokenOf = (dataClass: ProtectedDataClass, text: string): string => {
    if (WHOLE_TOKEN.test(text) && issued(text)) return text;
    tokens += 1;
    return tokenize(dataClass, text);
  };
  const cover = (item: unknown, dataClass: ProtectedDataClass, depth: number): unknown => {
    const next = deeper(depth);
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return tokenOf(dataClass, String(item));
    if (isRawJson(item)) return tokenOf(dataClass, item.rawJSON);
    if (Array.isArray(item)) return item.map(element => cover(element, dataClass, next));
    if (item === null || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [tokenOf(dataClass, key), cover(child, dataClass, next)]));
  };
  const apply = (value: unknown, parts: readonly string[], dataClass: ProtectedDataClass, depth: number): unknown => {
    const next = deeper(depth);
    if (Array.isArray(value)) return value.map(item => apply(item, parts, dataClass, next));
    if (parts.length === 0) return cover(value, dataClass, next);
    if (value === null || typeof value !== "object" || isRawJson(value) || !Object.hasOwn(value, parts[0]!)) return value;
    return mapOwn(value, (item, key) => key === parts[0] ? apply(item, parts.slice(1), dataClass, next) : item);
  };
  for (const [path, dataClass] of Object.entries(declared)) {
    const before = tokens;
    root = apply(root, path.split("."), dataClass, 0);
    if (tokens > before) matched.add(path);
  }
  // Always the re-serialized parse, never the original bytes: a shadowed duplicate key's value was never inspected.
  return reserialize(root, source);
}

/** Declared fields first, then the text detectors over the result; every token's value is stored before this returns. */
export function createWorkspaceRedactor(workspace: string): Redactor {
  return Object.freeze({
    redact(text: string, declared?: DeclaredFields, unparseable: "refuse" | "detectors" = "refuse"): Redaction {
      const lookup = openTokenLookup(workspace);
      try {
        if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) throw new RedactionRefused("detector_invalid");
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
        const matched = new Set<string>();
        let parsed: { readonly root: unknown } | null = null;
        if (declared !== undefined && Object.keys(declared).length > 0) {
          try { parsed = { root: parseExact(text) }; } catch (error) { if (unparseable === "refuse") throw error; }
        }
        // Declared fields bind exactly the committed bytes: a parsed result is committed as its re-serialization.
        const declaredText = parsed === null ? unescapedJson(text)
          : tokenizeDeclared(parsed.root, text, declared!, (dataClass, value) => tokenize(dataClass, "declared_field", value), matched, issued);
        let redacted: string;
        try {
          redacted = redactProtectedText(declaredText, (region, value) => tokenize(region.dataClass, region.detector, value), issued).text;
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

/** Redacts `text` and, when anything was found, writes its receipt row on `session` first; any failure refuses. */
function redactWithReceipt(session: SessionService, redactor: Redactor, text: string, source: RedactionReceiptV1["source"],
  callId: string | null, declared?: DeclaredFields, unparseable?: "refuse" | "detectors"): string {
  const result = redactor.redact(text, declared, unparseable);
  if (result.findings.length === 0) return result.text;
  try {
    const receipt = redactionReceiptV1Schema.parse({ schema: "amc.redaction-receipt/v1", sessionId: session.sessionId, source, callId,
      detectorsVersion: DETECTOR_SET_DIGEST, findings: result.findings, declaredFields: result.declaredFields, redactedDigest: sha256Hex(result.text) });
    session.recordProjectedEvidence({ eventType: "audit", payload: canonicalize(receipt), meta: { auditType: "PROTECTED_DATA_REDACTED",
      redactionSource: receipt.source, callId: receipt.callId, detectorsVersion: receipt.detectorsVersion, findings: receipt.findings,
      declaredFields: receipt.declaredFields, redactedDigest: receipt.redactedDigest } });
  } catch {
    throw new RedactionRefused("receipt_failed");
  }
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
        return redact(decodeText(result.content, "content_not_text"), "tool/result", result.toolCallId, declared,
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

/** Operator compaction text (`amc session compact`): redacted, with its receipt on `session`, in an opted-in workspace. */
export function redactCompactionReplacement(session: SessionService, text: string): string {
  return protectedDataOptedIn(session.workspace)
    ? redactWithReceipt(session, createWorkspaceRedactor(session.workspace), text, "operator/compaction", null) : text;
}
