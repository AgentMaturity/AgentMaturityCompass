/**
 * Streamable HTTP request-metadata headers (spec 2026-07-28,
 * basic/transports/streamable-http §Request Metadata, §Custom Headers from Tool Parameters).
 */

export interface McpParamHeader {
  /** Header name, `Mcp-Param-{x-mcp-header}`. */
  readonly header: string;
  /** Chain of `properties` keys from the schema root. */
  readonly path: readonly string[];
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PRIMITIVE = new Set(["string", "integer", "boolean"]);
/** Keywords whose values are data, not subschemas. */
const DATA_KEYWORDS = new Set(["const", "enum", "default", "examples"]);

/** §Value Encoding: plain visible ASCII, otherwise the `=?base64?…?=` sentinel form. */
export function mcpHeaderValue(value: string): string {
  const plain = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/.test(value) && !(value.startsWith("=?base64?") && value.endsWith("?="));
  return plain ? value : `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Returns the tool's header bindings, or the reason the tool must be excluded
 * from the catalog (§Schema Extension: "MUST exclude the invalid tool").
 */
export function mcpParamHeaderBindings(schema: unknown): McpParamHeader[] | string {
  const bindings: McpParamHeader[] = [];
  const seen = new Set<string>();
  let invalid: string | undefined;
  const visit = (node: unknown, path: readonly string[] | null, depth: number): void => {
    if (invalid || node === null || typeof node !== "object") return;
    if (depth > 64) { invalid = "schema nesting exceeds the accepted depth"; return; }
    if (Array.isArray(node)) { for (const item of node) visit(item, null, depth + 1); return; }
    const record = node as Record<string, unknown>;
    if (Object.hasOwn(record, "x-mcp-header")) {
      const name = record["x-mcp-header"];
      if (path === null || path.length === 0) { invalid = "x-mcp-header is not on a statically reachable property"; return; }
      if (typeof name !== "string" || !TOKEN.test(name) || name.length > 64) { invalid = "x-mcp-header is not a valid header token"; return; }
      if (seen.has(name.toLowerCase())) { invalid = "x-mcp-header values are not unique"; return; }
      if (typeof record.type !== "string" || !PRIMITIVE.has(record.type)) { invalid = "x-mcp-header is on a non-primitive or number parameter"; return; }
      seen.add(name.toLowerCase());
      bindings.push({ header: `Mcp-Param-${name}`, path });
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "x-mcp-header" || DATA_KEYWORDS.has(key)) continue;
      if (key === "properties" && path !== null && value && typeof value === "object" && !Array.isArray(value)) {
        for (const [property, child] of Object.entries(value as Record<string, unknown>)) visit(child, [...path, property], depth + 1);
      } else visit(value, null, depth + 1);
    }
  };
  visit(schema, [], 0);
  return invalid ?? bindings;
}

/** §Client Behavior: mirror present values; omit absent or null ones. */
export function mcpParamHeaders(bindings: readonly McpParamHeader[], args: unknown): [string, string][] {
  const headers: [string, string][] = [];
  for (const { header, path } of bindings) {
    let value: unknown = args;
    for (const key of path) value = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
    if (value === undefined || value === null) continue;
    if (typeof value === "string") headers.push([header, mcpHeaderValue(value)]);
    else if (typeof value === "boolean") headers.push([header, String(value)]);
    else if (typeof value === "number" && Number.isSafeInteger(value)) headers.push([header, String(value)]);
    else throw new Error("MCP header parameter is not a string, boolean or safe integer");
  }
  return headers;
}
