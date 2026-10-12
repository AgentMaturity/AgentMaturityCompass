/**
 * Redaction before commit (P2-02). In a workspace that has opted in (a processor registry file or its `.sig` exists), the
 * native session is wrapped so user messages, queued inbox text, text attachments and tool results are tokenized before
 * the session writes a row, a spill or a model-visible part. Values a signed tool definition declares in
 * `protectedFields` are tokenized first; the experimental text detectors are the backstop for everything else.
 *
 * Every failure refuses the commit: a locked vault, a vault or receipt write that fails, a token collision, text over the
 * per-leaf limit, undecodable bytes or a declaring tool's unparseable result throws a static `RedactionRefused`, and the
 * raw value is never committed. Binary attachments and media inbox input are refused (`attachment_not_redactable`).
 * Each redaction writes one `RedactionReceiptV1` audit row before the commit it describes.
 *
 * Detection is heuristic: regexes miss names and free-text identifiers outside declared fields, and model output is
 * recorded as the model produced it. Tokenization reduces identifiers; it is not de-identification or anonymization.
 */
import { redactionReceiptV1Schema, type RedactionReceiptV1 } from "../contracts/v1/redactionReceipt.js";
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { DETECTOR_SET_DIGEST, MAX_PROTECTED_TEXT_CHARS, redactProtectedText } from "./detectors.js";
import { loadProcessorRegistrySnapshot } from "./processorRegistry.js";
import { isShieldingToken, RedactionRefused, TOKEN_PATTERN_SOURCE, tokenFor } from "./tokenizer.js";
import { loadTokenKeys, storeTokens, type TokenEntry, type TokenKeys } from "./tokenVault.js";

export type DeclaredFields = Readonly<Record<string, ProtectedDataClass>>;
export interface Redaction {
  readonly text: string;
  readonly findings: Readonly<RedactionReceiptV1["findings"]>;
  readonly declaredFields: readonly string[];
}
export interface Redactor { redact(text: string, declared?: DeclaredFields): Redaction }

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

/** Tokenizes declared paths in a JSON document; `tokenize` counts each value. Returns the re-serialized document. */
function tokenizeDeclared(text: string, declared: DeclaredFields, tokenize: (dataClass: ProtectedDataClass, value: string) => string,
  matched: Set<string>): string {
  let root = parseExact(text);
  let tokens = 0;
  const deeper = (depth: number) => { if (depth > MAX_JSON_DEPTH) throw new RedactionRefused("declared_fields_unparseable"); return depth + 1; };
  const mapOwn = (value: object, map: (item: unknown, key: string) => unknown) =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, map(item, key)]));
  const cover = (value: unknown, dataClass: ProtectedDataClass, depth: number): unknown => {
    const next = deeper(depth);
    // A value that already is a token stays as it is, so redacting twice changes nothing.
    if (typeof value === "string" && WHOLE_TOKEN.test(value) && isShieldingToken(value)) return value;
    if (typeof value === "string" || typeof value === "number") { tokens += 1; return tokenize(dataClass, String(value)); }
    if (isRawJson(value)) { tokens += 1; return tokenize(dataClass, value.rawJSON); }
    if (Array.isArray(value)) return value.map(item => cover(item, dataClass, next));
    return value !== null && typeof value === "object" ? mapOwn(value, item => cover(item, dataClass, next)) : value;
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
  return JSON.stringify(root, null, text.includes("\n") ? 2 : undefined);
}

/** Declared fields first, then the text detectors over the result; every token's value is stored before this returns. */
export function createWorkspaceRedactor(workspace: string): Redactor {
  return Object.freeze({
    redact(text: string, declared?: DeclaredFields): Redaction {
      try {
        if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) throw new RedactionRefused("detector_invalid");
        let keys: TokenKeys | undefined;
        const entries = new Map<string, TokenEntry>();
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
        const declaredText = declared === undefined || Object.keys(declared).length === 0 ? text
          : tokenizeDeclared(text, declared, (dataClass, value) => tokenize(dataClass, "declared_field", value), matched);
        let redacted: string;
        try {
          redacted = redactProtectedText(declaredText, (region, value) => tokenize(region.dataClass, region.detector, value)).text;
        } catch (error) {
          throw error instanceof RedactionRefused ? error : new RedactionRefused("detector_invalid");
        }
        if (keys !== undefined) storeTokens(workspace, keys, [...entries.values()]);
        return Object.freeze({ text: redacted, findings: Object.freeze([...counts.values()]), declaredFields: Object.freeze([...matched].sort()) });
      } catch (error) {
        // JSON.parse and driver errors can quote input; only a static reason leaves this function.
        throw error instanceof RedactionRefused ? error : new RedactionRefused("redaction_failed");
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
  if (toolName !== undefined) return findToolDefinition(snapshot.config, toolName)?.protectedFields;
  // A result whose call this session never recorded cannot be matched to its tool's declarations.
  if (snapshot.config.tools.allowedTools.some(tool => tool.protectedFields !== undefined)) throw new RedactionRefused("declared_fields_unverifiable");
  return undefined;
}

function decodeText(content: string | Buffer, refusal: "content_not_text" | "attachment_not_redactable"): string {
  if (typeof content === "string") return content;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(content); } catch { throw new RedactionRefused(refusal); }
}

/** Wraps `session`: the record methods below redact, then delegate; every other member is the session's own. */
export function createRedactingSession(session: SessionService, redactor: Redactor): SessionService {
  const toolNames = new Map<string, string>();
  const spilledDescriptors = new Set<string>();
  const redact = (text: string, source: RedactionReceiptV1["source"], callId: string | null, declared?: DeclaredFields): string => {
    const result = redactor.redact(text, declared);
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
  };
  const toolNameOf = (callId: string): string | undefined => {
    const known = toolNames.get(callId);
    if (known !== undefined) return known;
    // A call recorded before this wrapper existed (a resumed session): its signed tool/call row names the tool.
    for (const event of [...session.readEvents()].reverse()) {
      if (event.event_type !== "tool/call") continue;
      let meta: { toolCallId?: unknown; toolName?: unknown };
      try { meta = JSON.parse(event.meta_json) as typeof meta; } catch { throw new RedactionRefused("declared_fields_unverifiable"); }
      if (meta.toolCallId === callId && typeof meta.toolName === "string") return meta.toolName;
    }
    return undefined;
  };
  const overrides = {
    recordUserMessage(text: string, provenance?: Parameters<SessionService["recordUserMessage"]>[1]): SessionEventRef {
      return session.recordUserMessage(redact(text, "user/message", null), provenance);
    },
    recordUserAttachment(params: Parameters<SessionService["recordUserAttachment"]>[0]): SessionEventRef {
      // ponytail: image and audio bytes are refused outright, whatever the provider's processor contract covers; admitting
      // them under a covering contract needs processors on destinations (P2-02 step 7, slice 3).
      if (params.kind !== "text") throw new RedactionRefused("attachment_not_redactable");
      const content = redact(decodeText(params.content, "attachment_not_redactable"), "user/attachment", null);
      return session.recordUserAttachment({ ...params, filename: redact(params.filename, "user/attachment", null), content });
    },
    recordToolCall(call: Parameters<SessionService["recordToolCall"]>[0]): SessionEventRef {
      const ref = session.recordToolCall(call);
      toolNames.set(call.toolCallId, call.toolName);
      return ref;
    },
    recordToolResult(result: Parameters<SessionService["recordToolResult"]>[0]): SessionEventRef {
      // Declared fields bind a successful result's JSON; error, denial and cancellation text gets the detectors only.
      const declared = result.outcome === "OK" ? declaredFieldsFor(session.workspace, toolNameOf(result.toolCallId)) : undefined;
      const content = redact(decodeText(result.content, "content_not_text"), "tool/result", result.toolCallId, declared);
      return session.recordToolResult({ ...result, content });
    },
    // The inbox row is the queued message's first durable copy, so it is redacted here, before user/message is.
    recordLoopEvent(record: Parameters<SessionService["recordLoopEvent"]>[0]): SessionEventRef {
      if (record.kind !== "inbox" || record.op !== "insert" || record.text === null) return session.recordLoopEvent(record);
      if (record.payloadFormat !== undefined) throw new RedactionRefused("attachment_not_redactable");
      if (spilledDescriptors.has(record.text)) return session.recordLoopEvent(record);
      return session.recordLoopEvent({ ...record, text: redact(record.text, "loop/inbox", null) });
    },
    retainOversizeInput(...[what, bytes, cap, subject]: Parameters<SessionService["retainOversizeInput"]>): ReturnType<SessionService["retainOversizeInput"]> {
      if (subject.subject !== "loop/inbox") return session.retainOversizeInput(what, bytes, cap, subject);
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

/** Opt-in, like admission: with no processor registry file and no `.sig`, the session is returned unchanged. */
export function redactingSessionFor(session: SessionService): SessionService {
  return loadProcessorRegistrySnapshot(session.workspace).state === "missing" ? session
    : createRedactingSession(session, createWorkspaceRedactor(session.workspace));
}
