/** Bounded JSON syntax tree retaining exact value substrings, including args.
 * JSON.parse alone loses duplicate keys and numeric spelling before evidence can
 * be committed. No evaluation, SDK, provider request, or external dependency.
 */
export interface GeminiJsonNode {
  readonly value: unknown;
  readonly raw: string;
  readonly fields?: ReadonlyMap<string, GeminiJsonNode>;
  readonly items?: readonly GeminiJsonNode[];
}
export function parseGeminiJson(source: string): GeminiJsonNode {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > 8 * 1024 * 1024
      || Buffer.from(source, "utf8").toString("utf8") !== source) throw new Error("Gemini JSON is oversized or not lossless UTF-8");
  let at = 0, nodes = 0;
  const fail = (): never => { throw new Error("Gemini JSON has invalid syntax, duplicate keys, excessive nesting, or unrepresentable numbers"); };
  const ws = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!") && at < source.length) at++; };
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
  const value = (depth: number): GeminiJsonNode => {
    ws(); const start = at;
    if (depth > 64 || ++nodes > 65536) return fail();
    const char = source[at];
    if (char === '"') { const v = string(); return { value: v, raw: source.slice(start, at) }; }
    if (char === "{") {
      at++; ws(); const fields = new Map<string, GeminiJsonNode>();
      const object: Record<string, unknown> = Object.create(null);
      if (source[at] !== "}") for (;;) {
        ws(); if (source[at] !== '"') return fail();
        const key = string(); ws(); if (source[at++] !== ":" || fields.has(key)) return fail();
        const node = value(depth + 1); fields.set(key, node); object[key] = node.value; ws();
        if (source[at] === "}") break;
        if (source[at++] !== ",") return fail();
      }
      at++; return { value: object, raw: source.slice(start, at), fields };
    }
    if (char === "[") {
      at++; ws(); const items: GeminiJsonNode[] = [];
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
    const v: unknown = JSON.parse(literal[0]);
    if (typeof v === "number" && (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))) return fail();
    return { value: v, raw: source.slice(start, at) };
  };
  const result = value(0); ws(); if (at !== source.length) return fail(); return result;
}

/** Host-side parameters must not be lossy on canonicalization. */
export function assertGeminiJsonValue(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 64) throw new Error("Gemini JSON nesting exceeds its bound");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (Buffer.from(value, "utf8").toString("utf8") !== value) throw new Error("Gemini JSON contains invalid Unicode");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) && !Object.is(value, -0)) return;
  if (typeof value !== "object" || value === null || seen.has(value)) throw new Error("Gemini JSON contains a non-JSON value or cycle");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Gemini JSON requires plain objects");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 65536) throw new Error("Gemini JSON array exceeds its bound");
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new Error("Gemini JSON arrays cannot contain holes or accessors");
      assertGeminiJsonValue(descriptor.value, depth + 1, seen);
    }
    if (Reflect.ownKeys(value).some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)))) throw new Error("Gemini JSON array has extra properties");
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error("Gemini JSON has a symbol key");
      assertGeminiJsonValue(key, depth + 1, seen);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("Gemini JSON cannot contain accessors or hidden values");
      assertGeminiJsonValue(descriptor.value, depth + 1, seen);
    }
  }
  seen.delete(value);
}
