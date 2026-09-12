/** ollama-chat@1 JSON syntax, not a provider SDK. Retains argument substrings
 * before parsing can erase duplicate keys, whitespace or numeric spelling.
 * Kept independent of older encoders so their recorded byte contracts stay fixed.
 */
export interface OllamaJsonNode {
  readonly value: unknown;
  readonly raw: string;
  readonly fields?: ReadonlyMap<string, OllamaJsonNode>;
  readonly items?: readonly OllamaJsonNode[];
}

export function parseOllamaJson(source: string): OllamaJsonNode {
  const fail = (): never => { throw new Error("Ollama JSON has invalid syntax, duplicate keys, invalid Unicode, unsafe numbers or excessive size/nesting"); };
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > 8 * 1024 * 1024
      || Buffer.from(source, "utf8").toString("utf8") !== source) return fail();
  let at = 0, nodes = 0;
  const ws = () => { while (at < source.length && /[\x20\t\r\n]/.test(source[at]!)) at++; };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === "\\") { at++; continue; }
      if (char === '"') {
        let result: unknown;
        try { result = JSON.parse(source.slice(start, at)); } catch { return fail(); }
        if (typeof result !== "string" || Buffer.from(result, "utf8").toString("utf8") !== result) return fail();
        return result;
      }
    }
    return fail();
  };
  const value = (depth: number): OllamaJsonNode => {
    ws(); const start = at;
    if (depth > 64 || ++nodes > 65536) return fail();
    const char = source[at];
    if (char === '"') { const parsed = string(); return { value: parsed, raw: source.slice(start, at) }; }
    if (char === "{") {
      at++; ws(); const fields = new Map<string, OllamaJsonNode>();
      const object: Record<string, unknown> = Object.create(null);
      if (source[at] !== "}") for (;;) {
        ws(); if (source[at] !== '"') return fail();
        const key = string(); ws(); if (source[at++] !== ":" || fields.has(key)) return fail();
        const child = value(depth + 1); fields.set(key, child); object[key] = child.value; ws();
        if (source[at] === "}") break;
        if (source[at++] !== ",") return fail();
      }
      at++; return { value: object, raw: source.slice(start, at), fields };
    }
    if (char === "[") {
      at++; ws(); const items: OllamaJsonNode[] = [];
      if (source[at] !== "]") for (;;) {
        items.push(value(depth + 1)); ws();
        if (source[at] === "]") break;
        if (source[at++] !== ",") return fail();
      }
      at++; return { value: items.map(item => item.value), raw: source.slice(start, at), items };
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(at));
    if (!literal) return fail();
    at += literal[0].length;
    const parsed: unknown = JSON.parse(literal[0]);
    if (typeof parsed === "number" && (!Number.isFinite(parsed) || (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)))) return fail();
    return { value: parsed, raw: source.slice(start, at) };
  };
  const result = value(0); ws(); if (at !== source.length) return fail(); return result;
}

/** Host values must be passive, dense JSON; getters and toJSON never execute. */
export function assertOllamaJsonValue(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 64) throw new Error("Ollama JSON nesting exceeds its bound");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (Buffer.from(value, "utf8").toString("utf8") !== value) throw new Error("Ollama JSON contains invalid Unicode");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) && !Object.is(value, -0)) return;
  if (typeof value !== "object" || value === null || seen.has(value)) throw new Error("Ollama JSON contains a non-JSON value or cycle");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Ollama JSON requires plain objects");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 65536) throw new Error("Ollama JSON array exceeds its bound");
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("Ollama JSON arrays must be dense passive data");
      assertOllamaJsonValue(descriptor.value, depth + 1, seen);
    }
    if (Reflect.ownKeys(value).some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)
        || Number(key) >= value.length))) throw new Error("Ollama JSON array has extra properties");
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error("Ollama JSON has a symbol key");
      assertOllamaJsonValue(key, depth + 1, seen);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("Ollama JSON cannot contain accessors or hidden values");
      assertOllamaJsonValue(descriptor.value, depth + 1, seen);
    }
  }
  seen.delete(value);
}
