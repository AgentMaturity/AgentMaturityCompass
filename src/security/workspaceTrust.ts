/**
 * Trust on first use for workspace configuration (SH-SANDBOX-07).
 *
 * A workspace signs its own `.amc` with its own key set, and a repository can ship both. Cloning it and running a
 * native agent session would apply its signed `tools.yaml` (shell write grants, egress hosts, read-deny, binaries)
 * and its signed presets with the operator's rights. The key set itself is already adopted on first use by
 * `keyset.ts` (a machine-local high-water record; a later fork or rollback is refused there). What was missing is
 * CONSENT before that adoption counts for a session. This module adds it, on top of the existing anchoring:
 *
 * - a key set this machine committed (`keysetAnchoring` = `committed`: `amc init` or a key rotation ran here) is the
 *   operator's own work and needs no record;
 * - a workspace with no key set has nothing signed that could grant anything, so there is nothing to trust;
 * - otherwise a consent record in `<AMC home>/state/workspace-trust.json` must name this workspace (by the digest of
 *   its real path, never an id read from its files), its key-set digest and its signed `tools.yaml` digest. A changed
 *   key set or tools policy is a changed surface: the session is refused until the operator trusts it again.
 *
 * The record is outside every workspace (a workspace writer cannot grant itself trust), 0600, written atomically. An
 * unreadable or malformed store refuses every workspace until `amc trust workspace --repair-store` moves it aside:
 * fail closed, with a named recovery. Consent comes only from the operator: `amc trust workspace`, `--trust-workspace`
 * on the CLI and ACP, `trustWorkspace` on the SDK, or `AMC_TRUST_WORKSPACE=1` for a headless host. Never from a file in
 * the workspace.
 */
import { mkdirSync, realpathSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { keysetAnchoring, keysetIdentity } from "../keys/keyset.js";
import { workspaceScope } from "../keys/highWater.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { ensureContainedDir, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";

export const TRUST_WORKSPACE_ENV = "AMC_TRUST_WORKSPACE";
const STORE_REL = "state/workspace-trust.json";
const MAX_BYTES = 4 * 1024 * 1024;

export type TrustConsentSource = "command" | "cli-flag" | "acp-flag" | "sdk-option" | "env";

const recordSchema = z.strictObject({
  realpath: z.string().min(1),
  keysetSha256: z.string().regex(/^[0-9a-f]{64}$/),
  keysetGeneration: z.number().int().nonnegative(),
  /** null: the workspace had no verifiable signed tools policy when trusted. */
  toolsDigestSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  trustedAt: z.iso.datetime(),
  by: z.enum(["command", "cli-flag", "acp-flag", "sdk-option", "env"])
});
const storeSchema = z.strictObject({
  type: z.literal("amc.workspace-trust"),
  version: z.literal(1),
  workspaces: z.record(z.string().regex(/^[0-9a-f]{16}$/), recordSchema)
});
export type WorkspaceTrustRecord = z.infer<typeof recordSchema>;
type Store = z.infer<typeof storeSchema>;

export interface TrustOptions { readonly env?: NodeJS.ProcessEnv; readonly amcHome?: string }
const homeOf = (opts: TrustOptions): string => opts.amcHome ?? resolveAmcHome({ env: opts.env });

/** What the workspace's signed configuration would apply, for the refusal text and the record. */
export interface WorkspaceTrustSurface {
  readonly keyset: { readonly generation: number; readonly sha256: string } | null;
  readonly toolsDigestSha256: string | null;
  readonly toolsSummary: string;
}

export type WorkspaceTrustVerdict =
  | { readonly state: "trusted"; readonly reason: "committed-keys" | "no-key-set" | "consented"; readonly record: WorkspaceTrustRecord | null }
  | { readonly state: "first-use"; readonly surface: WorkspaceTrustSurface }
  | { readonly state: "changed"; readonly changed: readonly ("key-set" | "tools-policy")[]; readonly record: WorkspaceTrustRecord; readonly surface: WorkspaceTrustSurface }
  | { readonly state: "refused"; readonly reason: string };

function readStore(opts: TrustOptions): Store | null | "corrupt" {
  const bytes = readContainedOrNull(homeOf(opts), STORE_REL, MAX_BYTES);
  if (bytes === null) return null;
  try {
    return storeSchema.parse(parseCanonicalJson(bytes));
  } catch {
    return "corrupt";
  }
}

function realWorkspace(workspace: string): string {
  try { return realpathSync(workspace); } catch { return resolve(workspace); }
}

/** The surface a session would apply: key set identity and the signed tools policy, summarised without paths. */
export function workspaceTrustSurface(workspace: string): WorkspaceTrustSurface {
  const keyset = keysetIdentity(workspace);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  const tools = snapshot.signatureValid ? snapshot.config?.tools.allowedTools ?? [] : [];
  const shell = tools.find(tool => tool.name === "bash");
  const grants = shell?.nativeSandbox;
  const parts = [`${tools.length} signed tool${tools.length === 1 ? "" : "s"}`];
  if (grants) {
    parts.push(`shell write grants: ${grants.writableDirectories.length}`);
    if (grants.egress?.allowHosts.length) parts.push(`shell egress hosts: ${grants.egress.allowHosts.length}`);
  }
  if (shell?.allow?.binariesAllowlist?.length) parts.push(`shell binaries: ${shell.allow.binariesAllowlist.length}`);
  return { keyset, toolsDigestSha256: snapshot.signatureValid ? snapshot.digestSha256 : null,
    toolsSummary: snapshot.signatureValid ? parts.join(", ") : "no verifiable signed tools policy (every tool denied)" };
}

/** How this machine holds the workspace's configuration. Never throws on a bad store: that is the `refused` verdict. */
export function workspaceTrustVerdict(workspace: string, opts: TrustOptions = {}): WorkspaceTrustVerdict {
  let surface: WorkspaceTrustSurface;
  try {
    if (keysetAnchoring(workspace).state === "committed") return { state: "trusted", reason: "committed-keys", record: null };
    surface = workspaceTrustSurface(workspace);
  } catch (error) {
    return { state: "refused", reason: `the workspace's key set cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (surface.keyset === null) return { state: "trusted", reason: "no-key-set", record: null };
  const store = readStore(opts);
  if (store === "corrupt") return { state: "refused", reason: `the workspace trust store at ${homeOf(opts)}/${STORE_REL} is unreadable; run \`amc trust workspace --repair-store\` to move it aside, then trust the workspace again` };
  const record = store?.workspaces[workspaceScope(workspace)] ?? null;
  if (record === null) return { state: "first-use", surface };
  const changed: ("key-set" | "tools-policy")[] = [];
  if (record.keysetSha256 !== surface.keyset.sha256 || record.keysetGeneration !== surface.keyset.generation || record.realpath !== realWorkspace(workspace)) changed.push("key-set");
  if (record.toolsDigestSha256 !== surface.toolsDigestSha256) changed.push("tools-policy");
  return changed.length === 0 ? { state: "trusted", reason: "consented", record } : { state: "changed", changed, record, surface };
}

function writeStore(opts: TrustOptions, mutate: (store: Store) => Store): Store {
  const home = homeOf(opts);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  ensureContainedDir(home, "state");
  return withControlFileLock({ root: `${home}/state`, name: "workspace-trust", operation: () => {
    const current = readStore(opts);
    if (current === "corrupt") throw new Error(`the workspace trust store at ${home}/${STORE_REL} is unreadable; run \`amc trust workspace --repair-store\` first`);
    const next = storeSchema.parse(mutate(current ?? { type: "amc.workspace-trust", version: 1, workspaces: {} }));
    writeContained(home, STORE_REL, canonicalize(next), 0o600);
    return next;
  } });
}

/** Record the operator's consent for this workspace as it is now. Throws when there is nothing to trust or the store is corrupt. */
export function trustWorkspace(workspace: string, by: TrustConsentSource, opts: TrustOptions = {}): WorkspaceTrustRecord {
  const surface = workspaceTrustSurface(workspace);
  if (surface.keyset === null) throw new Error("this workspace has no key set, so nothing signed in it can grant anything; there is nothing to trust");
  const record: WorkspaceTrustRecord = { realpath: realWorkspace(workspace), keysetSha256: surface.keyset.sha256, keysetGeneration: surface.keyset.generation,
    toolsDigestSha256: surface.toolsDigestSha256, trustedAt: new Date().toISOString(), by };
  writeStore(opts, store => ({ ...store, workspaces: { ...store.workspaces, [workspaceScope(workspace)]: record } }));
  return record;
}

/** Remove this workspace's consent record; true when one was there. */
export function revokeWorkspaceTrust(workspace: string, opts: TrustOptions = {}): boolean {
  let removed = false;
  writeStore(opts, store => {
    const scope = workspaceScope(workspace);
    removed = Object.hasOwn(store.workspaces, scope);
    const { [scope]: _gone, ...rest } = store.workspaces;
    return { ...store, workspaces: rest };
  });
  return removed;
}

/** Move an unreadable store aside (never deleted) so a fresh one can be written. Returns where it went, or null when there was none. */
export function repairWorkspaceTrustStore(opts: TrustOptions = {}): string | null {
  if (readStore(opts) !== "corrupt") return null;
  const path = `${homeOf(opts)}/${STORE_REL}`;
  const aside = `${path}.corrupt-${Date.now()}`;
  renameSync(path, aside);
  return aside;
}

/** The consent an operator supplied for this process, if any: a flag beats the environment. */
export function suppliedTrustConsent(flag: TrustConsentSource | undefined, env: NodeJS.ProcessEnv = process.env): TrustConsentSource | null {
  if (flag !== undefined) return flag;
  return env[TRUST_WORKSPACE_ENV]?.trim() === "1" ? "env" : null;
}

/**
 * The one check every native session entry makes before it loads anything the workspace signed. Records consent when
 * the operator supplied it for a first use or a changed surface; refuses otherwise, naming what would be applied and
 * how to trust it.
 */
export function requireWorkspaceTrust(workspace: string, consent: TrustConsentSource | null, opts: TrustOptions = {}):
  { readonly ok: true; readonly verdict: WorkspaceTrustVerdict; readonly recorded: WorkspaceTrustRecord | null } | { readonly ok: false; readonly reason: string } {
  const verdict = workspaceTrustVerdict(workspace, opts);
  if (verdict.state === "trusted") return { ok: true, verdict, recorded: null };
  if (verdict.state === "refused") return { ok: false, reason: `workspace trust: ${verdict.reason}` };
  if (consent !== null) {
    try {
      return { ok: true, verdict, recorded: trustWorkspace(workspace, consent, opts) };
    } catch (error) {
      return { ok: false, reason: `workspace trust could not be recorded: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const what = verdict.state === "first-use" ? "This machine has not trusted this workspace's configuration before."
    : `This workspace's ${verdict.changed.join(" and ")} changed since this machine trusted it (${verdict.record.trustedAt}).`;
  const keyset = verdict.surface.keyset!;
  return { ok: false, reason: `${what} Its signed configuration would apply with your rights: key set generation ${keyset.generation} (${keyset.sha256.slice(0, 16)}…), `
    + `${verdict.surface.toolsSummary}. Review .amc/tools.yaml and .amc/agents.yaml, then trust it with \`amc trust workspace\` (or pass --trust-workspace; `
    + `headless hosts set ${TRUST_WORKSPACE_ENV}=1). A workspace file can never grant this.` };
}
