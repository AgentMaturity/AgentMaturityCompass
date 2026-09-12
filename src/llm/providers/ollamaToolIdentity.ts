import { canonicalize } from "../../utils/json.js";
import { ollamaFail, ollamaKeys, ollamaText } from "./ollamaContract.js";
import { parseOllamaJson } from "./ollamaJson.js";

/** This prefix labels AMC join provenance, NOT a provider-issued ID. The signed
 * tool/call row already persists the complete key; no new session metadata is
 * needed. Only wireId/index/type explicitly reported upstream are replayed.
 */
export const OLLAMA_CALL_KEY_PREFIX = "amc-ollama-call-v1:";
export interface OllamaCallIdentity {
  readonly stream: string;
  readonly ordinal: number;
  readonly wireId: string | null;
  readonly wireIndex: number | null;
  readonly wireType: "function" | null;
}
export function ollamaCallKey(identity: OllamaCallIdentity): string {
  ollamaKeys(identity, ["stream", "ordinal", "wireId", "wireIndex", "wireType"], "call identity");
  if (typeof identity.stream !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identity.stream)) ollamaFail("invalid local stream identity");
  if (!Number.isSafeInteger(identity.ordinal) || identity.ordinal < 0 || identity.ordinal >= 128) ollamaFail("invalid local call ordinal");
  if (identity.wireIndex !== null && identity.wireIndex !== identity.ordinal) ollamaFail("native call index is not in original order");
  if (identity.wireType !== null && identity.wireType !== "function") ollamaFail("unsupported native tool type");
  if (identity.wireId !== null) ollamaText(identity.wireId, "native tool ID", true);
  return OLLAMA_CALL_KEY_PREFIX + Buffer.from(canonicalize(identity), "utf8").toString("base64url");
}
export function readOllamaCallKey(key: string): OllamaCallIdentity {
  if (typeof key !== "string" || !key.startsWith(OLLAMA_CALL_KEY_PREFIX) || key.length > 2048) ollamaFail("tool replay requires its labelled original Ollama call key");
  const encoded = key.slice(OLLAMA_CALL_KEY_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) ollamaFail("malformed Ollama call key");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) ollamaFail("noncanonical Ollama call key");
  let value: unknown;
  try { value = parseOllamaJson(bytes.toString("utf8")).value; } catch { ollamaFail("malformed Ollama call key JSON"); }
  const identity = value as OllamaCallIdentity;
  if (ollamaCallKey(identity) !== key) ollamaFail("Ollama call key lost its canonical provenance");
  return Object.freeze({ ...identity });
}
