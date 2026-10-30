import type { NativeExtensionManager } from "../../extensions/nativeExtensionRuntime.js";
import { NativeExtensionError } from "../../extensions/nativeExtensionManifest.js";
import { readNativeExtension } from "../../extensions/nativeExtensionStore.js";
import type { MountedNativeMcpServer, NativeMcpMountReceipt } from "../../mcp/nativeMcpClient.js";
import { buildSkillCatalog, skillCatalogDigest } from "../../skills/skillCatalog.js";
import type { ToolRegistry } from "../../tools/toolRegistry.js";

interface NativeExtensionResourceStatus {
  readonly id: string;
  readonly manifestPath: string;
  readonly manifestDigest: string;
  readonly state: "loaded" | "unavailable";
  readonly failureCode: string | null;
  readonly execution: "not-evaluated";
}

interface NativeMcpResourceStatus {
  readonly serverId: string;
  readonly catalogDigest: string;
  /** The mount receipt as recorded at mount time; `_amc/session/mcp` re-projects it like `/mcp`. */
  readonly protocol: NativeMcpMountReceipt["protocol"];
  readonly auth: NativeMcpMountReceipt["auth"];
  readonly toolNames: readonly string[];
  readonly state: "registered" | "unavailable";
  readonly execution: "not-evaluated";
}

export type NativeMcpResourceSource = () => NativeMcpResourceStatus;

export interface NativeResourceStatusSources {
  readonly extensions?: NativeExtensionManager;
  readonly mcp?: readonly NativeMcpResourceSource[];
  readonly skillRoots?: readonly string[];
}

export interface NativeResourceStatus {
  /** Null means this host was not bound; an empty array means its observed live set is empty. */
  readonly extensions: readonly NativeExtensionResourceStatus[] | null;
  readonly mcp: readonly NativeMcpResourceStatus[] | null;
  readonly skills: {
    readonly catalogDigest: string;
    readonly loaded: null;
    /** The existing catalog does not report unreadable directory observations. */
    readonly completeness: "unknown";
    readonly entries: readonly {
      readonly name: string;
      readonly sourcePath: string;
      readonly digest: string;
      readonly state: "discovered";
      /** Frontmatter eligibility only. Tool policy and successful invocation remain unevaluated. */
      readonly modelInvocation: boolean;
    }[];
    readonly problems: readonly { readonly name: string; readonly sourcePath: string; readonly state: "unavailable" }[];
  } | null;
}

/**
 * Bind immediately after mounting. Registration identity, rather than a tool's
 * name alone, stops a later replacement from reviving this mount's stale pin.
 * This observes local grants, not remote transport health or execution approval.
 */
export function bindNativeMcpResourceStatus(mount: MountedNativeMcpServer, registry: ToolRegistry, agentId: string): NativeMcpResourceSource {
  const { serverId, catalogDigest, protocol, auth } = mount.receipt;
  const toolNames = [...mount.toolNames];
  const current = toolNames.map(name => registry.admissionCheck(name, agentId));
  return () => ({ serverId, catalogDigest, protocol, auth, toolNames: [...toolNames],
    state: current.length > 0 && current.every(check => check()) ? "registered" : "unavailable", execution: "not-evaluated" });
}

/**
 * Process-local observations only. Installation is never treated as a live
 * load. Skill catalog membership means discovered text; neither skill.load
 * results nor previously composed skill contexts have a shared load registry.
 * Reading status must not admit, execute, revoke, close or sign anything.
 */
export function projectNativeResourceStatus(sources: NativeResourceStatusSources = {}): NativeResourceStatus {
  const extensions = sources.extensions?.list().map((pin): NativeExtensionResourceStatus => {
    try {
      readNativeExtension({ workspace: sources.extensions!.workspace,
        manifestPath: pin.manifestPath, expectedDigest: pin.manifestDigest });
      return { ...pin, state: "loaded", failureCode: null, execution: "not-evaluated" };
    } catch (error) {
      return { ...pin, state: "unavailable", failureCode: error instanceof NativeExtensionError ? error.code : "EXTENSION_UNAVAILABLE",
        execution: "not-evaluated" };
    }
  }) ?? null;
  const catalog = sources.skillRoots === undefined ? null : buildSkillCatalog(sources.skillRoots);
  return {
    extensions,
    mcp: sources.mcp?.map(source => source()) ?? null,
    skills: catalog === null ? null : {
      catalogDigest: skillCatalogDigest(catalog), loaded: null, completeness: "unknown",
      entries: catalog.skills.map(skill => ({ name: skill.name, sourcePath: skill.sourcePath, digest: skill.digest,
        state: "discovered" as const, modelInvocation: skill.disableModelInvocation !== true })),
      problems: catalog.problems.map(problem => ({ name: problem.name, sourcePath: problem.sourcePath, state: "unavailable" as const }))
    }
  };
}
