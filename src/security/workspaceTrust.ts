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
 * - a workspace with no signer (no key set, and no legacy role key the config-signature purpose falls back to) has
 *   nothing signed that could verify, so there is nothing to trust;
 * - otherwise a consent record in `<AMC home>/state/workspace-trust.json` must name this workspace (by the digest of
 *   its real path, never an id read from its files), its signer (the key-set digest, or the fingerprint of the legacy
 *   config-signature key a 1.x-layout workspace verifies with) and its signed `tools.yaml` digest. A changed signer or
 *   tools policy is a changed surface: the session is refused until the operator trusts it again.
 *
 * Every entry checks before the vault is unlocked, so a refused run never migrates a 1.x vault (which would commit a
 * key set here and count as the operator's own); only an explicit vault command in that workspace does.
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
import { getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { ensureContainedDir, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";

export const TRUST_WORKSPACE_ENV = "AMC_TRUST_WORKSPACE";
const STORE_REL = "state/workspace-trust.json";
const MAX_BYTES = 4 * 1024 * 1024;

export type TrustConsentSource = "command" | "cli-flag" | "acp-flag" | "sdk-option" | "env";

const recordSchema = z.strictObject({
  realpath: z.string().min(1),
  /** The key set's digest, or (generation 0) the fingerprint of the legacy config-signature public key. */
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
  /** Who signs it: its key set, or the legacy role key a 1.x layout verifies with (generation 0). */
  readonly signer: { readonly kind: "key-set" | "legacy-role-key"; readonly generation: number; readonly sha256: string } | null;
  readonly toolsDigestSha256: string | null;
  readonly toolsSummary: string;
}

export type WorkspaceTrustVerdict =
  | { readonly state: "trusted"; readonly reason: "committed-keys" | "no-signer" | "consented"; readonly record: WorkspaceTrustRecord | null }
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

/**
 * The signer, decided from what can verify, not from keyset.json alone: without a key set, signature verification falls
 * back to `.amc/keys/<role>_ed25519.pub` (src/keys/signingKeys.ts), so a repository shipping a 1.x layout with a
 * tools.yaml signed by its auditor key verifies too. That key's fingerprint is then the identity consent binds.
 */
function workspaceSigner(workspace: string): WorkspaceTrustSurface["signer"] {
  const keyset = keysetIdentity(workspace);
  if (keyset !== null) return { kind: "key-set", ...keyset };
  try {
    return { kind: "legacy-role-key", generation: 0, sha256: sha256Hex(getSigningPublicKeyPem(workspace, "config-signature")) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing public key")) return null;
    throw error;
  }
}

/** The surface a session would apply: the signer and the signed tools policy, summarised without paths. */
function workspaceTrustSurface(workspace: string): WorkspaceTrustSurface {
  const signer = workspaceSigner(workspace);
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
  return { signer, toolsDigestSha256: snapshot.signatureValid ? snapshot.digestSha256 : null,
    toolsSummary: snapshot.signatureValid ? parts.join(", ") : "no verifiable signed tools policy (every tool denied)" };
}

/** How this machine holds the workspace's configuration. Never throws on a bad store: that is the `refused` verdict. */
export function workspaceTrustVerdict(workspace: string, opts: TrustOptions = {}): WorkspaceTrustVerdict {
  let surface: WorkspaceTrustSurface;
  try {
    if (keysetAnchoring(workspace).state === "committed") return { state: "trusted", reason: "committed-keys", record: null };
    surface = workspaceTrustSurface(workspace);
  } catch (error) {
    return { state: "refused", reason: `the workspace's signing keys cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (surface.signer === null) return { state: "trusted", reason: "no-signer", record: null };
  const store = readStore(opts);
  if (store === "corrupt") return { state: "refused", reason: `the workspace trust store at ${homeOf(opts)}/${STORE_REL} is unreadable; run \`amc trust workspace --repair-store\` to move it aside, then trust the workspace again` };
  const record = store?.workspaces[workspaceScope(workspace)] ?? null;
  if (record === null) return { state: "first-use", surface };
  const changed: ("key-set" | "tools-policy")[] = [];
  if (record.keysetSha256 !== surface.signer.sha256 || record.keysetGeneration !== surface.signer.generation || record.realpath !== realWorkspace(workspace)) changed.push("key-set");
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
  if (surface.signer === null) throw new Error("this workspace has no signing key, so nothing signed in it can verify; there is nothing to trust");
  const record: WorkspaceTrustRecord = { realpath: realWorkspace(workspace), keysetSha256: surface.signer.sha256, keysetGeneration: surface.signer.generation,
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
export type WorkspaceTrustCheck =
  { readonly ok: true; readonly verdict: WorkspaceTrustVerdict; readonly recorded: WorkspaceTrustRecord | null } | { readonly ok: false; readonly reason: string };

/**
 * The pin for a session admitted while no signed tools policy could verify: a digest no file has (finding a preimage of
 * all zeros is infeasible), so a policy signed later is refused for the rest of the session instead of applying (S19b).
 */
export const NO_TOOLS_POLICY_PIN = "0".repeat(64);

/**
 * The signed tools.yaml digest the session is pinned to when it does not rest on keys this machine committed: the one
 * the operator's consent covers, so a tools.yaml re-signed while the session is open (a `git pull` under a long-lived
 * ACP, SDK or Studio session) is refused by the allowlist guard instead of taking effect without re-consent. Consent
 * given while no signed policy verified, and a workspace with no signer at all, pin NO_TOOLS_POLICY_PIN: "no policy at
 * admission" stays "no policy" for the session. Null only for this machine's own workspace (and a refused check).
 */
export function consentedToolsDigest(check: WorkspaceTrustCheck): string | null {
  if (!check.ok) return null;
  const verdict = check.verdict;
  const record = check.recorded ?? (verdict.state === "trusted" && verdict.reason === "consented" ? verdict.record : null);
  if (record !== null) return record.toolsDigestSha256 ?? NO_TOOLS_POLICY_PIN;
  return verdict.state === "trusted" && verdict.reason === "no-signer" ? NO_TOOLS_POLICY_PIN : null;
}

export function requireWorkspaceTrust(workspace: string, consent: TrustConsentSource | null, opts: TrustOptions = {}): WorkspaceTrustCheck {
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
  const signer = verdict.surface.signer!;
  const who = signer.kind === "key-set" ? `key set generation ${signer.generation}` : "legacy signing key (no key set)";
  return { ok: false, reason: `${what} Its signed configuration would apply with your rights: ${who} (${signer.sha256.slice(0, 16)}…), `
    + `${verdict.surface.toolsSummary}. Review .amc/tools.yaml and .amc/agents.yaml, then trust it with \`amc trust workspace\` (or pass --trust-workspace; `
    + `headless hosts set ${TRUST_WORKSPACE_ENV}=1). A workspace file can never grant this.` };
}
