import { createHash } from "node:crypto";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import { ListResourcesResultSchema, ListResourceTemplatesResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { nativeMcpResultType } from "./protocol/version.js";

export const NATIVE_MCP_RESULT_BYTES = 256 * 1024;
export interface NativeMcpResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}
export interface NativeMcpResourceTemplate {
  readonly uriTemplate: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}
export interface NativeMcpResources {
  readonly resources: readonly NativeMcpResource[];
  readonly resourceTemplates: readonly NativeMcpResourceTemplate[];
}

/** Resource identities are sent only to the pinned MCP server, never fetched as URLs by AMC. */
function resourceUri(value: string): URL {
  if (!value || value.length > 2048 || /[\s\\\x00-\x1f\x7f{}]/.test(value)) throw new Error("Invalid MCP resource URI");
  let decoded = value;
  for (let depth = 0; depth < 4; depth++) {
    if (/[\\\x00-\x20\x7f]/.test(decoded) || /(^|[/:])\.{1,2}(\/|[?#]|$)/.test(decoded)) throw new Error("MCP resource traversal refused");
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    if (depth === 3) throw new Error("MCP resource encoding exceeds the accepted depth");
    decoded = next;
  }
  const uri = new URL(value);
  if (uri.username || uri.password || uri.hash) throw new Error("MCP resource credentials and fragments refused");
  return uri;
}

function template(value: string): UriTemplate {
  // ponytail: only whole, single path-segment variables; broader RFC6570 operators need separate review.
  const variables = [...value.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)];
  if (!variables.length || variables.length > 8 || value.length > 2048) throw new Error("Unsupported MCP resource template");
  const authority = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/.exec(value);
  if (!authority) throw new Error("MCP resource templates require a fixed authority");
  for (const variable of variables) {
    const start = variable.index!;
    const end = start + variable[0].length;
    if (start < authority[0].length || value[start - 1] !== "/" || (end < value.length && value[end] !== "/")) throw new Error("MCP template variables must be whole path segments");
  }
  const example = value.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, "amc-template-segment");
  if (example.includes("?") || new Set(variables.map(item => item[1])).size !== variables.length) throw new Error("Unsupported MCP resource template");
  resourceUri(example);
  return new UriTemplate(value);
}

function mime(value: unknown): void {
  if (value !== undefined && (typeof value !== "string" || value.length > 128 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:;[ -~]*)?$/.test(value))) {
    throw new Error("Invalid MCP resource media type");
  }
}

/** Finite metadata snapshot. Merely listing it never creates a read grant. */
export async function readNativeMcpResources(request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<NativeMcpResources> {
  const resources: NativeMcpResource[] = [];
  const resourceTemplates: NativeMcpResourceTemplate[] = [];
  for (const method of ["resources/list", "resources/templates/list"] as const) {
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const raw = await request(method, cursor === undefined ? {} : { cursor });
      if (nativeMcpResultType(raw) !== "complete") throw new Error("Incomplete MCP resource catalog refused");
      const page = method === "resources/list"
        ? { ...ListResourcesResultSchema.parse(raw), resourceTemplates: [] }
        : { ...ListResourceTemplatesResultSchema.parse(raw), resources: [] };
      if (method === "resources/list") {
        for (const item of page.resources) {
          resourceUri(item.uri); mime(item.mimeType);
          if (resources.length >= 256 || resources.some(other => other.uri === item.uri)) throw new Error("MCP resource catalog is oversized or repeats a URI");
          resources.push({ uri: item.uri, name: item.name, ...(item.description === undefined ? {} : { description: item.description }),
            ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }) });
        }
      } else {
        for (const item of page.resourceTemplates) {
          template(item.uriTemplate); mime(item.mimeType);
          if (resourceTemplates.length >= 256 || resourceTemplates.some(other => other.uriTemplate === item.uriTemplate)) throw new Error("MCP resource templates are oversized or repeated");
          resourceTemplates.push({ uriTemplate: item.uriTemplate, name: item.name, ...(item.description === undefined ? {} : { description: item.description }),
            ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }) });
        }
      }
      cursor = page.nextCursor;
      if (cursor !== undefined) {
        if (!cursor || cursor.length > 2048 || cursors.has(cursor) || cursors.size >= 32) throw new Error("MCP resource pagination refused");
        cursors.add(cursor);
      }
    } while (cursor !== undefined);
  }
  resources.sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  resourceTemplates.sort((a, b) => a.uriTemplate < b.uriTemplate ? -1 : a.uriTemplate > b.uriTemplate ? 1 : 0);
  return { resources, resourceTemplates };
}

export function admitNativeMcpResource(catalog: NativeMcpResources, uri: string): NativeMcpResource | NativeMcpResourceTemplate {
  resourceUri(uri);
  const exact = catalog.resources.find(item => item.uri === uri);
  if (exact) return exact;
  for (const item of catalog.resourceTemplates) {
    const match = template(item.uriTemplate).match(uri);
    if (match && Object.values(match).every(value => {
      if (typeof value !== "string" || !value) return false;
      for (let depth = 0; depth < 4; depth++) {
        if (/[\/\\?#]/.test(value) || value === "." || value === "..") return false;
        const decoded = decodeURIComponent(value);
        if (decoded === value) return true;
        value = decoded;
      }
      return false;
    })) return item;
  }
  throw new Error("MCP resource is absent from the reviewed catalog");
}

export function validateNativeMcpResourceResult(result: { contents: readonly { uri: string; mimeType?: string; text?: string; blob?: string }[] }, uri: string,
  reviewed: NativeMcpResource | NativeMcpResourceTemplate): void {
  if (!Array.isArray(result.contents) || !result.contents.length || result.contents.length > 32) throw new Error("MCP resource contents must be bounded and nonempty");
  for (const content of result.contents) {
    if (content.uri !== uri) throw new Error("MCP resource response changed the requested URI");
    mime(content.mimeType);
    if (reviewed.mimeType !== undefined && content.mimeType !== reviewed.mimeType) throw new Error("MCP resource media type differs from the reviewed catalog");
    if ((typeof content.text === "string" && content.blob === undefined) === (typeof content.blob === "string" && content.text === undefined)) throw new Error("MCP resource content must have exactly one supported type");
  }
}

interface ContentLoss { readonly path: string; readonly reason: string; readonly byteLength?: number; readonly sha256?: string }
/** Typed JSON survives the existing signed tool-output and session export paths. Never promote external data to authority. */
export function projectNativeMcpResult(result: Record<string, unknown>, catalog: { readonly serverId: string; readonly digest: string }, canonical: (value: unknown) => string): Record<string, unknown> {
  const raw = canonical(result);
  const byteLength = Buffer.byteLength(raw);
  if (byteLength > NATIVE_MCP_RESULT_BYTES) throw new Error("MCP result exceeds the accepted size");
  const losses: ContentLoss[] = [];
  const binary = (value: unknown, path: string) => {
    if (typeof value !== "string") throw new Error("Invalid MCP binary content");
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") !== value) throw new Error("Invalid MCP binary content");
    const metadata = { byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), dataOmitted: true };
    losses.push({ path, reason: "binary-not-retained", byteLength: metadata.byteLength, sha256: metadata.sha256 });
    return metadata;
  };
  const project = (value: unknown, path: string, resource = false): unknown => {
    if (!value || typeof value !== "object") throw new Error("Unsupported MCP content block");
    const block = value as Record<string, unknown>;
    if (resource) {
      if (typeof block.blob === "string") {
        const { blob, ...rest } = block; return { ...rest, ...binary(blob, `${path}.blob`) };
      }
      return block;
    }
    if (block.type === "image" || block.type === "audio") {
      const { data, ...rest } = block; return { ...rest, ...binary(data, `${path}.data`) };
    }
    if (block.type === "resource") return { ...block, resource: project(block.resource, `${path}.resource`, true) };
    if (block.type === "text" || block.type === "resource_link") return block;
    losses.push({ path, reason: "unsupported-content-type" });
    return { type: typeof block.type === "string" ? block.type : "unknown", dataOmitted: true };
  };
  return { ...result,
    ...(Array.isArray(result.content) ? { content: result.content.map((item, index) => project(item, `content[${index}]`)) } : {}),
    ...(Array.isArray(result.contents) ? { contents: result.contents.map((item, index) => project(item, `contents[${index}]`, true)) } : {}),
    amcProvenance: { serverId: catalog.serverId, catalogDigest: catalog.digest, trust: "untrusted-external", byteLength,
      contentSha256: createHash("sha256").update(raw).digest("hex") }, amcLosses: losses };
}
