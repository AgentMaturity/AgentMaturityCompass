/**
 * Restoration at egress (P2-02 step 9). A sending tool body calls `detokenize` as its last step before the bytes leave:
 * tokens in its payload become their values only when the call carries a bound authorization record whose purpose is
 * the signed registry's run purpose, the destination is a P2-01 destination a processor in the signed registry operates,
 * and that purpose lets that processor receive every class present (one `processorUse` rule with model admission).
 * Nothing is decrypted until every policy check has passed. A refusal is a `DetokenizeRefused` (nothing was sent) and a
 * `PROTECTED_DATA_EGRESS_REFUSED` ops row; a release is a `DetokenizationReceiptV1` in a `PROTECTED_DATA_DETOKENIZED` ops
 * row, written before the send. Neither row, nor any error, holds a value, a token, a URL or a hash of one.
 *
 * Recorded data never changes: the record, journal, guards, approvals and evidence see the frozen tokenized arguments,
 * and `retokenize` turns echoed values in the response back into tokens before the pipeline and the session see it.
 * Experimental: the processor and purpose rules await named expert review, and contract references are operator claims.
 */
import { detokenizationReceiptV1Schema, type DetokenizationReceiptV1 } from "../contracts/v1/detokenizationReceipt.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { checkScopedEgress } from "../residency/checkEgress.js";
import { DefiniteFailureError, type ToolExecution } from "../tools/toolTypes.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { NOT_JSON, parseExact, redactJsonLeaves } from "./detectors.js";
import { loadProcessorRegistrySnapshot, protectedDataOptedIn } from "./processorRegistry.js";
import { processorUse, runPurposeOf } from "./purposePolicy.js";
import { RedactionRefused, TOKEN_PATTERN_SOURCE } from "./tokenizer.js";
import { revealTokens, type TokenEntry } from "./tokenVault.js";

const REASONS = ["processor_not_allowlisted", "purpose_violation", "token_unknown", "payload_not_restorable",
  "vault_unavailable", "vault_integrity", "receipt_failed"] as const;
export type DetokenizeRefusal = typeof REASONS[number];

/** Nothing was sent: a definite failure, so the journal records `completed/not_applied`. Static text only. */
export class DetokenizeRefused extends DefiniteFailureError {
  readonly code = "PROTECTED_DATA_EGRESS_REFUSED";
  readonly reason: DetokenizeRefusal;
  constructor(reason: DetokenizeRefusal) {
    const safeReason = REASONS.find(value => value === reason) ?? "processor_not_allowlisted";
    super(`Protected data egress refused: ${safeReason}`);
    this.name = "DetokenizeRefused";
    this.reason = safeReason;
  }
}

export interface DetokenizeScope {
  readonly execution: Pick<ToolExecution, "workspace" | "agentId" | "name" | "executionId" | "authorization">;
  /** Where the bytes go, exactly as the transport sends them; null when there is no URL (stdio MCP). */
  readonly destination: { readonly channel: "network-tool" | "mcp-http"; readonly url: string } | null;
  /** Wire text (HTTP body/headers): a non-JSON string restores only as one whole token whose value has no control char; keys never. */
  readonly strictText: boolean;
}
export interface Detokenized<T> { readonly value: T; readonly retokenize: (text: string) => string }

const JSON_TEXT = /^\s*[[{]/;
const CONTROL = /[\x00-\x1f\x7f]/;
const WHOLE_TOKEN = new RegExp(`^${TOKEN_PATTERN_SOURCE}$`);
const tokensIn = () => new RegExp(TOKEN_PATTERN_SOURCE, "g");
const unchanged = (text: string): string => text;
const classOf = (token: string) => /^\[\[amc:([a-z_]+):/.exec(token)![1] as ProtectedDataClass;

/**
 * `text` with its tokens restored. JSON text is parsed and restored leaf by leaf, so a value can never change its
 * structure. In strict mode other text restores only as one whole token whose value has no control character. A token
 * the payload scan did not see (written with JSON escapes inside a string) refuses rather than pass as text.
 */
function restoreText(text: string, values: ReadonlyMap<string, TokenEntry>, strict: boolean): string {
  if (!text.includes("[[amc:")) return text;
  if (JSON_TEXT.test(text)) {
    let root: unknown;
    try { root = parseExact(text); } catch { throw new DetokenizeRefused("payload_not_restorable"); }
    if (root !== NOT_JSON) return JSON.stringify(redactJsonLeaves(root, leaf => restoreText(leaf, values, false)));
  }
  const valueOf = (token: string): string => {
    const entry = values.get(token);
    if (entry === undefined) throw new DetokenizeRefused("payload_not_restorable");
    return entry.value;
  };
  if (!strict) return text.replace(tokensIn(), valueOf);
  if (!WHOLE_TOKEN.test(text)) throw new DetokenizeRefused("payload_not_restorable");
  const value = valueOf(text);
  if (CONTROL.test(value)) throw new DetokenizeRefused("payload_not_restorable");
  return value;
}

// ponytail: echoes come back as whole JSON leaves, or inside other text as substrings of 4+ chars; shorter values
// inside text and escaped/transformed echoes are left to the session redactor at commit.
function retokenizer(entries: readonly TokenEntry[]): (text: string) => string {
  const byValue = new Map<string, string>();
  for (const entry of [...entries].sort((a, b) => b.value.length - a.value.length || a.token.localeCompare(b.token)))
    if (entry.value !== "" && !byValue.has(entry.value)) byValue.set(entry.value, entry.token);
  const long = [...byValue.keys()].filter(value => value.length >= 4);
  // One pass, longest first, so a token just put back is never scanned again.
  const inside = long.length === 0 ? null : new RegExp(long.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const swap = (out: string): string => byValue.get(out) ?? (inside === null ? out : out.replace(inside, value => byValue.get(value)!));
  return (text) => {
    if (JSON_TEXT.test(text)) {
      let root: unknown = NOT_JSON;
      try { root = parseExact(text); } catch { /* Too deep or no number source text: swapped as text below. */ }
      if (root !== NOT_JSON) {
        let changed = false;
        const out = redactJsonLeaves(root, leaf => { const swapped = swap(leaf); changed ||= swapped !== leaf; return swapped; });
        return changed ? JSON.stringify(out) : text;
      }
    }
    return swap(text);
  };
}

interface Decided {
  purposeId: string | null; destinationId: string | null; processorId: string | null;
  classes: readonly ProtectedDataClass[]; tokenCount: number;
}

function refuse(reason: DetokenizeRefusal, scope: DetokenizeScope, decided: Decided): never {
  try {
    appendOpsAuditEvent({ workspace: scope.execution.workspace, auditType: "PROTECTED_DATA_EGRESS_REFUSED", severity: "HIGH",
      payload: { reason, executionId: scope.execution.executionId ?? null, purposeId: decided.purposeId, toolName: scope.execution.name,
        destinationId: decided.destinationId, processorId: decided.processorId, dataClasses: [...decided.classes], tokenCount: decided.tokenCount } });
  } catch { /* A failed audit write never permits the egress or replaces its typed refusal. */ }
  throw new DetokenizeRefused(reason);
}

/**
 * Restores the tokens in `payload` for one send, or refuses (see the module comment). In a workspace that has not opted
 * in, or a payload with no token, it returns the same payload object and the identity function, reading nothing else.
 */
export function detokenize<T>(payload: T, scope: DetokenizeScope): Detokenized<T> {
  const { execution } = scope;
  if (!protectedDataOptedIn(execution.workspace)) return { value: payload, retokenize: unchanged };
  const tokens = [...new Set(JSON.stringify(payload)?.match(tokensIn()) ?? [])].sort();
  if (tokens.length === 0) return { value: payload, retokenize: unchanged };
  const decided: Decided = { purposeId: null, destinationId: null, processorId: null, classes: [...new Set(tokens.map(classOf))].sort(),
    tokenCount: tokens.length };
  try {
    const record = execution.authorization?.record;
    if (record === undefined || !execution.executionId || record.resource.purpose === null) return refuse("purpose_violation", scope, decided);
    decided.purposeId = record.resource.purpose;
    const snapshot = loadProcessorRegistrySnapshot(execution.workspace);
    if (snapshot.state !== "verified") return refuse("purpose_violation", scope, decided);
    const purpose = runPurposeOf(snapshot.registry);
    if (purpose === null || purpose.purposeId !== record.resource.purpose) return refuse("purpose_violation", scope, decided);
    if (scope.destination === null) return refuse("processor_not_allowlisted", scope, decided);
    let destinationId: string | null;
    try {
      destinationId = checkScopedEgress(execution.workspace, scope.destination.channel, scope.destination.url,
        { dataClasses: decided.classes, purpose: purpose.purposeId, agentId: execution.agentId }).destinationId;
    } catch { return refuse("processor_not_allowlisted", scope, decided); }
    decided.destinationId = destinationId;
    const processor = destinationId === null ? undefined
      : snapshot.registry.processors.find(row => row.destinationIds?.includes(destinationId) === true);
    if (processor === undefined) return refuse("processor_not_allowlisted", scope, decided);
    decided.processorId = processor.processorId;
    const use = processorUse(processor, purpose, execution.name, decided.classes);
    if (use.reason === "purpose_not_permitted" || use.reason === "class_not_permitted") return refuse("purpose_violation", scope, decided);
    if (use.reason !== "allowed") return refuse("processor_not_allowlisted", scope, decided);
    let entries: ReadonlyMap<string, TokenEntry> | null;
    try { entries = revealTokens(execution.workspace, tokens); }
    catch (error) { return refuse(error instanceof RedactionRefused && error.reason === "vault_integrity" ? "vault_integrity" : "vault_unavailable", scope, decided); }
    if (entries === null) return refuse("token_unknown", scope, decided);
    const values = entries;
    let value: T;
    try {
      value = redactJsonLeaves(payload, (text, key) => {
        if (scope.strictText && key === undefined) {
          if (text.includes("[[amc:")) throw new DetokenizeRefused("payload_not_restorable");
          return text;
        }
        return restoreText(text, values, scope.strictText);
      }) as T;
    } catch (error) {
      return refuse(error instanceof DetokenizeRefused ? error.reason : "payload_not_restorable", scope, decided);
    }
    try {
      const receipt: DetokenizationReceiptV1 = detokenizationReceiptV1Schema.parse({ schema: "amc.detokenization-receipt/v1",
        executionId: execution.executionId, processorId: processor.processorId, contractReferences: use.contractReferences,
        purposeId: purpose.purposeId, destinationId, dataClasses: decided.classes, tokenCount: tokens.length, registryDigest: snapshot.digestSha256 });
      const audit = appendOpsAuditEvent({ workspace: execution.workspace, auditType: "PROTECTED_DATA_DETOKENIZED", payload: { receipt } });
      if (!audit.eventId || !/^[a-f0-9]{64}$/.test(audit.eventHash)) throw new Error("audit_unacknowledged");
    } catch { return refuse("receipt_failed", scope, decided); }
    return { value, retokenize: retokenizer([...values.values()]) };
  } catch (error) {
    if (error instanceof DetokenizeRefused) throw error;
    return refuse("processor_not_allowlisted", scope, decided);
  }
}
