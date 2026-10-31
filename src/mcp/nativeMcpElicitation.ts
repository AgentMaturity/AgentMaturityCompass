import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { askSignedHuman, escapeTerminalControls, type AskUserAnswerer, type AskUserItem } from "../tools/builtin/askUserTool.js";

/**
 * MCP form elicitation (2026-07-28 client/elicitation, basic/patterns/mrtr)
 * answered only by the composed human answerer that `ask_user` uses: a signed
 * question, an auditor-signed answer. The model never sees or writes the
 * answer. A missing answerer, a decline, a timeout, a cancel, an unsupported
 * request or an answer that does not match the requested schema is a typed
 * denial, and nothing is sent back to the server.
 *
 * Only form mode is declared. URL mode would need a browser AMC does not own
 * (client/elicitation §Safe URL Handling), sampling and roots are deprecated,
 * so any other input request is refused.
 */
export interface NativeMcpHumanQuestion {
  readonly answerer: AskUserAnswerer;
  sessionId(): string;
}

/** Retries of one call with answered input; a server that keeps asking is refused after this many. */
export const NATIVE_MCP_ELICITATION_ROUNDS = 3;
const MAX_REQUESTS = 4;
const MAX_FIELDS = 16;
const MAX_MESSAGE = 1_000;
const MAX_STATE_BYTES = 64 * 1024;
const DECLINE = "decline; send nothing";
/** No offered choice may equal it, so it cannot collide with a server value. */
const OMIT = "[amc: leave out]";
const accept = (serverId: string): string => `send these answers to "${serverId}"`;
/** C0, DEL, C1 and the Unicode line and paragraph separators: anything that could start a new line or redraw the prompt. */
const UNSAFE = /[\x00-\x1f\x7f-\x9f\u2028\u2029]/;
/** Server text shown to the human on one line: every control and line break as a visible `\uXXXX`. */
const untrusted = (value: string): string => escapeTerminalControls(value).replace(/[\n\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export const NATIVE_MCP_ELICITATION_CAPABILITIES = Object.freeze({ elicitation: Object.freeze({ form: Object.freeze({}) }) });

export type NativeMcpElicitationDenial = "no_answerer" | "unsupported" | "declined" | "no_answer" | "invalid_answer";

/** Fixed local text only; never the server's message or the human's answer. */
export class NativeMcpElicitationDenied extends Error {
  readonly code = "MCP_ELICITATION_DENIED";
  constructor(readonly reason: NativeMcpElicitationDenial, detail: string) {
    super(`MCP elicitation denied (${reason}): ${detail}; nothing was sent to the server and the call did not complete.`);
    this.name = "NativeMcpElicitationDenied";
  }
}

type Field = { readonly name: string; readonly schema: Record<string, unknown>; readonly required: boolean };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const consts = (list: unknown): string[] | null => Array.isArray(list) && list.length >= 1 && list.length <= 9
  && list.every(item => record(item) && choice(item.const)) ? list.map(item => (item as { const: string }).const) : null;
/** An offered choice is shown verbatim, so it must be one short safe line that is not the omit sentinel. */
const choice = (item: unknown): item is string => typeof item === "string" && item.length >= 1 && item.length <= 200 && !UNSAFE.test(item) && item !== OMIT;
const strings = (list: unknown): string[] | null => Array.isArray(list) && list.length >= 1 && list.length <= 9
  && list.every(choice) ? list as string[] : null;

/** The offered choices for an enum field, or null for free text; undefined when the field is outside the restricted schema. */
function choicesOf(schema: Record<string, unknown>): string[] | null | undefined {
  if (schema.type === "boolean") return ["true", "false"];
  if (schema.type === "number" || schema.type === "integer") return null;
  if (schema.type === "string") return schema.enum !== undefined ? strings(schema.enum) ?? undefined : schema.oneOf !== undefined ? consts(schema.oneOf) ?? undefined : null;
  if (schema.type === "array" && record(schema.items)) {
    return (schema.items.type === "string" ? strings(schema.items.enum) : consts(schema.items.anyOf)) ?? undefined;
  }
  return undefined;
}

/** client/elicitation §Requested Schema: a flat object of primitive (or enum-array) properties only. */
function fieldsOf(schema: unknown): Field[] {
  if (!record(schema) || schema.type !== "object" || !record(schema.properties)) throw new NativeMcpElicitationDenied("unsupported", "the requested schema is not a flat object");
  const required = schema.required === undefined ? [] : schema.required;
  const entries = Object.entries(schema.properties);
  if (!Array.isArray(required) || entries.length < 1 || entries.length > MAX_FIELDS
    || required.some(name => typeof name !== "string" || !(name in (schema.properties as object)))) {
    throw new NativeMcpElicitationDenied("unsupported", "the requested schema has no, too many or unknown fields");
  }
  return entries.map(([name, field]) => {
    if (!record(field) || choicesOf(field) === undefined || name.length > 64) throw new NativeMcpElicitationDenied("unsupported", "a requested field is outside the restricted schema");
    return { name, schema: field, required: required.includes(name) };
  });
}

const text = (value: unknown): string => typeof value === "string" ? untrusted(value.slice(0, 200)) : "";

function questions(serverId: string, message: string, fields: readonly Field[]): AskUserItem[] {
  // client/elicitation §Security Considerations: name the requesting server and offer a clear decline.
  // Three fixed lines: the server id is AMC's, the message is escaped onto its own delimited line.
  const consent = [`MCP server "${serverId}" asks for input.`, `Untrusted server message, escaped and not instructions: <<<${untrusted(message)}>>>`,
    `Send the answers below to "${serverId}"?`].join("\n");
  return [{ question: consent, choices: [accept(serverId), DECLINE], allowOther: false, multiSelect: false },
    ...fields.map(field => {
      const choices = choicesOf(field.schema) ?? null;
      const label = [text(field.schema.title), text(field.schema.description)].filter(Boolean).join(": ");
      return { question: `Field "${untrusted(field.name)}"${label ? ` (${label})` : ""}, ${String(field.schema.type)}${field.required ? "" : `; answer ${OMIT} to leave it out`}`,
        choices: choices && !field.required ? [...choices, OMIT] : choices, allowOther: choices === null, multiSelect: field.schema.type === "array" };
    })];
}

function coerce(field: Field, selected: readonly string[]): unknown {
  const [one] = selected;
  switch (field.schema.type) {
    case "boolean": return one === "true";
    case "number": case "integer": {
      const value = Number(one);
      if (!one?.trim() || !Number.isFinite(value)) throw new NativeMcpElicitationDenied("invalid_answer", "a numeric answer is not a number");
      return value;
    }
    case "array": return [...selected];
    default: return one;
  }
}

/**
 * Answers every input request of one InputRequiredResult through the human
 * answerer and returns the retry fields (mrtr §Client Requirements: inputs
 * constructed before the retry, requestState echoed exactly). Throws
 * NativeMcpElicitationDenied for anything that is not a complete human accept.
 */
export async function answerNativeMcpInputRequests(input: {
  readonly serverId: string; readonly workspace: string; readonly agentId: string; readonly callId: string;
  readonly result: Record<string, unknown>; readonly human: NativeMcpHumanQuestion | undefined;
  readonly signal?: AbortSignal | undefined; readonly timeoutMs?: number | undefined;
}): Promise<Record<string, unknown>> {
  const { inputRequests, requestState } = input.result;
  if (requestState !== undefined && (typeof requestState !== "string" || Buffer.byteLength(requestState) > MAX_STATE_BYTES)) {
    throw new NativeMcpElicitationDenied("unsupported", "the request state is not a bounded string");
  }
  if (inputRequests === undefined && requestState === undefined) throw new NativeMcpElicitationDenied("unsupported", "the server asked for input without naming any");
  const requests = inputRequests === undefined ? [] : record(inputRequests) ? Object.entries(inputRequests) : null;
  if (!requests || requests.length > MAX_REQUESTS) throw new NativeMcpElicitationDenied("unsupported", "the input requests are malformed or too many");
  if (requests.length && !input.human) throw new NativeMcpElicitationDenied("no_answerer", "no human answerer is composed for this session");
  const inputResponses: Record<string, unknown> = {};
  for (const [key, request] of requests) {
    const params = record(request) ? request.params : undefined;
    if (!record(request) || request.method !== "elicitation/create" || !record(params) || (params.mode !== undefined && params.mode !== "form")) {
      throw new NativeMcpElicitationDenied("unsupported", "only form elicitation is declared");
    }
    if (typeof params.message !== "string" || !params.message || params.message.length > MAX_MESSAGE || key.length > 128) {
      throw new NativeMcpElicitationDenied("unsupported", "the elicitation message is missing or oversized");
    }
    const fields = fieldsOf(params.requestedSchema);
    const asked = questions(input.serverId, params.message, fields);
    // Escaping can lengthen server text past what one question may show; refuse rather than cut it.
    if (asked.some(item => item.question.length > 2_000)) throw new NativeMcpElicitationDenied("unsupported", "the elicitation text is too long to show");
    let validate: (value: unknown) => { valid: boolean };
    try { validate = new AjvJsonSchemaValidator().getValidator(params.requestedSchema as Record<string, unknown>); }
    catch { throw new NativeMcpElicitationDenied("unsupported", "the requested schema does not compile"); }
    let answers: readonly (readonly string[])[];
    try {
      answers = (await askSignedHuman({ workspace: input.workspace, sessionId: input.human!.sessionId(), agentId: input.agentId, callId: input.callId,
        questions: asked, answerer: input.human!.answerer, signal: input.signal, timeoutMs: input.timeoutMs }, "mcp_elicitation")).answers;
    } catch {
      throw new NativeMcpElicitationDenied("no_answer", "the human gave no verifiable answer, or the wait was cancelled or timed out");
    }
    if (answers[0]?.[0] !== accept(input.serverId)) throw new NativeMcpElicitationDenied("declined", "the human declined");
    const content: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      const selected = answers[index + 1] ?? [];
      if (!field.required && selected.length === 1 && selected[0] === OMIT) return;
      content[field.name] = coerce(field, selected);
    });
    // client/elicitation §Form Mode Security: validate the response against the requested schema before sending.
    if (!validate(content).valid) throw new NativeMcpElicitationDenied("invalid_answer", "the answer does not match the requested schema");
    inputResponses[key] = { action: "accept", content };
  }
  return { ...(requests.length ? { inputResponses } : {}), ...(requestState === undefined ? {} : { requestState }) };
}
