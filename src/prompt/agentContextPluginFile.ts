/**
 * The agent's A4 context plugin file (P1-61 writes it at Adapt Build; P2-37 loads it into Studio native tasks): the
 * attributed literal `{ schema, name, order 160, source a4:<projectId>@r<n>, sha256, text }` at
 * `<agent>/a4/context-plugin.json`, signed beside it as an `a4-context-plugin` artifact. One definition for the writer
 * (src/a4/adaptContextPlugin.ts) and the loader (src/studio/nativeTaskContext.ts).
 */
import { join } from "node:path";
import { z } from "zod";
import { getAgentPaths } from "../fleet/paths.js";
import { readAndVerifyArtifactFileSignature } from "../lifecycle/artifactSignature.js";
import { sha256Hex } from "../utils/hash.js";

export const AGENT_CONTEXT_PLUGIN_SCHEMA = "amc.a4-context-plugin/v1";
export const AGENT_CONTEXT_PLUGIN_ORDER = 160;
export const AGENT_CONTEXT_PLUGIN_ARTIFACT = "a4-context-plugin";
const MAX_PLUGIN_BYTES = 1 << 20;

export const agentContextPluginFileSchema = z.strictObject({
  schema: z.literal(AGENT_CONTEXT_PLUGIN_SCHEMA), name: z.string().min(1), order: z.literal(AGENT_CONTEXT_PLUGIN_ORDER),
  source: z.string().regex(/^a4:[A-Za-z0-9_-]+@r\d+$/), sha256: z.string().regex(/^[0-9a-f]{64}$/), text: z.string().min(1)
});
export type AgentContextPluginFile = z.infer<typeof agentContextPluginFileSchema>;

export const agentContextPluginPath = (workspace: string, agentId: string): string => join(getAgentPaths(workspace, agentId).rootDir, "a4", "context-plugin.json");

export type SignedAgentContextPlugin =
  | { readonly status: "absent" }
  | { readonly status: "unverified"; readonly reason: string }
  | { readonly status: "verified"; readonly plugin: AgentContextPluginFile; readonly fileSha256: string };

/**
 * The plugin from one read of its bytes, accepted only when its artifact signature verifies under this workspace's keys,
 * the body parses and its text hashes to its sha256. A file without a signature, or with a bad one, is `unverified`.
 */
export function readSignedAgentContextPlugin(workspace: string, agentId: string): SignedAgentContextPlugin {
  const checked = readAndVerifyArtifactFileSignature({ workspace, path: agentContextPluginPath(workspace, agentId),
    artifactKind: AGENT_CONTEXT_PLUGIN_ARTIFACT, requireDomainSeparated: true, maxArtifactBytes: MAX_PLUGIN_BYTES });
  if (checked.reason === "artifact missing") return { status: "absent" };
  if (!checked.valid || checked.artifactBytes === null) return { status: "unverified", reason: checked.reason ?? "signature invalid" };
  let plugin: AgentContextPluginFile;
  try {
    plugin = agentContextPluginFileSchema.parse(JSON.parse(checked.artifactBytes.toString("utf8")));
  } catch {
    return { status: "unverified", reason: "not an A4 context plugin" };
  }
  if (sha256Hex(plugin.text) !== plugin.sha256) return { status: "unverified", reason: "text does not match its sha256" };
  return { status: "verified", plugin, fileSha256: sha256Hex(checked.artifactBytes) };
}
