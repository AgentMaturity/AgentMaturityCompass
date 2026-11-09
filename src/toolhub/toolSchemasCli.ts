import { selectSupportedNativeTools } from "../agent/nativeToolCapabilities.js";
import { nativeToolSchemas, type NativeToolSchemaListing } from "../tools/builtin/nativeToolSchemas.js";
import { loadVerifiedToolsConfigSnapshot } from "./toolhubValidators.js";

/**
 * `amc tools list --schemas` (SH-TOOLS-06a): every built-in tool's published JSON Schema and digest, and whether this
 * workspace's signed policy grants it. Reads the policy; never runs a tool.
 */
export interface ToolSchemasReport extends NativeToolSchemaListing {
  readonly policy: { readonly signatureValid: boolean; readonly grants: readonly string[] };
}

export function toolSchemasReport(workspace: string, filter?: string): ToolSchemasReport {
  const listing = nativeToolSchemas(workspace);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  const grants = selectSupportedNativeTools(snapshot).map((tool) => tool.name).sort();
  const tools = filter === undefined ? listing.tools : listing.tools.filter((tool) => tool.name === filter);
  if (filter !== undefined && tools.length === 0) throw new Error(`no built-in tool named "${filter}"`);
  return { ...listing, tools, policy: { signatureValid: snapshot.signatureValid, grants } };
}

export function formatToolSchemasText(report: ToolSchemasReport): string {
  const granted = new Set(report.policy.grants);
  const lines = [`Native built-in tool schemas (${report.tools.length}); document digest sha256 ${report.documentDigestSha256}`,
    report.policy.signatureValid ? `Signed policy grants: ${report.policy.grants.join(", ") || "(none)"}` : "Signed policy: not verifiable (amc tools verify)", ""];
  for (const tool of report.tools) {
    lines.push(`${tool.name}  [${tool.actionClass}]  ${granted.has(tool.name) ? "granted" : "not granted"}  schema sha256 ${tool.schemaDigestSha256}`);
    lines.push(`  ${tool.description}`);
    lines.push(`  ${JSON.stringify(tool.parameters)}`, "");
  }
  if (report.unavailable.length > 0) lines.push(`Schema unavailable in this listing (needs a live composition): ${report.unavailable.join(", ")}`);
  return lines.join("\n");
}
