/**
 * Redaction before commit (P2-02). Every composed native session is wrapped; while its workspace has opted in (a processor
 * registry file or its `.sig` exists, checked on every record and latched once seen), user messages, queued inbox text,
 * text attachments and tool results are tokenized before the session writes a row, a spill or a model-visible part.
 * Values a signed tool definition declares in `protectedFields` are tokenized first; the experimental text detectors are
 * the backstop for everything else. Both run in one parse-first walk (`protectedWalk`): JSON as the strings a JSON reader
 * sees, each value also beside its member name, and other text as it is and then each line decoded.
 *
 * Every failure refuses the commit: a locked vault, a vault or receipt write that fails, a token collision, text over the
 * per-leaf limit, undecodable bytes, a declaring tool's unparseable OK result or a runtime without number source text
 * (Node 20) throws a static `RedactionRefused`, and the raw value is never committed. A refused tool result (or native-validation output) is still answered, with a static
 * withheld notice and a `PROTECTED_DATA_REDACTION_REFUSED` audit row, so the transcript stays well formed. Binary
 * attachments, media inbox input and tool results holding media are refused (`attachment_not_redactable`), media input
 * before anything is spilled.
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
import { canonicalize } from "../utils/json.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { DETECTOR_SET_DIGEST, MAX_PROTECTED_TEXT_CHARS, NOT_JSON, parseExact, protectedWalk, rawJSON, WalkRefused,
  type DeclaredFields } from "./detectors.js";
import { protectedDataOptedIn } from "./processorRegistry.js";
import { digestField, keyedOutputDigest, RedactionRefused, tokenFor } from "./tokenizer.js";
import { loadTokenKeys, openTokenLookup, storeTokens, type TokenEntry, type TokenKeys } from "./tokenVault.js";

export type { DeclaredFields } from "./detectors.js";
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
// Characters one redaction may charge (units, parses, gap scans, decoded views, declared-repeat lookups, member contexts)
// before it refuses (detector_invalid), so no path through it stalls the session that records it. A declaring tool's
// result is walked twice (its declared paths first), and this covers both.
const MAX_REDACTION_SCAN_CHARS = 32 * MAX_PROTECTED_TEXT_CHARS;

/**
 * The refusal a walk failure becomes: a zero byte is not text; nesting too deep in a declaring tool's result makes its
 * declared fields unparseable; anything else (over-long text, decoding that does not settle, the scan budget) is
 * detector_invalid.
 */
function walkRefusal(error: WalkRefused, declaring: boolean): RedactionRefused {
  if (error.reason === "not_text") return new RedactionRefused("content_not_text");
  return new RedactionRefused(error.reason === "too_deep" && declaring ? "declared_fields_unparseable" : "detector_invalid");
}

/**
 * Declared fields first, then the text detectors, in one walk (`protectedWalk`) that tokenizes each finding; every token's
 * value is stored before this returns. Under a declared path every string, number and boolean is a value, and so is every
 * object key; JSON held in a string at any depth is part of the result, a path that reaches it continues inside it, and
 * every path also applies from its top. A declared string, number or key is tokenized wherever else the result repeats it.
 * A value or key that is a token this workspace issued stays as it is, so redacting twice changes nothing. JSON is committed
 * as its original bytes unless something in it was tokenized or it repeats a key (then compact, re-serialized).
 */
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
        const declaring = declared !== undefined && Object.keys(declared).length > 0;
        if (declaring && unparseable === "refuse" && parseExact(text) === NOT_JSON) throw new RedactionRefused("declared_fields_unparseable");
        const walk = protectedWalk({ budget: MAX_REDACTION_SCAN_CHARS, issued, declared: declaring ? { fields: declared! } : undefined,
          replace: (finding, value) => tokenize(finding.dataClass, finding.detector, value) });
        let redacted: string;
        try {
          redacted = walk.text(text);
        } catch (error) {
          if (error instanceof RedactionRefused) throw error;
          throw error instanceof WalkRefused ? walkRefusal(error, declaring) : new RedactionRefused("detector_invalid");
        }
        if (keys !== undefined) storeTokens(workspace, keys, [...entries.values()]);
        return Object.freeze({ text: redacted, findings: Object.freeze([...counts.values()]), declaredFields: walk.declaredMatched });
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

const TEXT_MIME = /^(?:text\/|application\/(?:[\w.+-]*\+)?json(?:$|[;\s]))/i;
/**
 * Whether tool output that is JSON (an MCP result) holds media the detectors cannot read: an image or audio block's data,
 * or a resource blob whose mimeType is not text or JSON. A text blob's base64 is decoded and scanned like other text.
 */
function holdsMedia(text: string): boolean {
  if (!/^\s*[[{]/.test(text)) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return false; } // not JSON: scanned as text; too deep: the redactor refuses
  const visit = (value: unknown, depth: number): boolean => {
    if (depth > MAX_JSON_DEPTH || value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(item => visit(item, depth + 1));
    const block = value as Record<string, unknown>;
    if ((block.type === "image" || block.type === "audio") && typeof block.data === "string") return true;
    if (typeof block.blob === "string" && !(typeof block.mimeType === "string" && TEXT_MIME.test(block.mimeType))) return true;
    return Object.values(block).some(item => visit(item, depth + 1));
  };
  return visit(parsed, 0);
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
      // ponytail: image and audio are refused in every opted-in session whatever the provider contract covers; admitting
      // them under a BAA needs the pinned provider route at commit time (composition sites), with P2-04.
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
        // Media in a result (an MCP image or audio block, a binary resource blob) is refused like media input.
        if (holdsMedia(text.slice(notice.length))) throw new RedactionRefused("attachment_not_redactable");
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
