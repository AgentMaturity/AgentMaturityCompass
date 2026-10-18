import { signingKeyId } from "../keys/algorithmPolicy.js";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { AntiRollbackError, highWaterKey, readHighWater, recordHighWater } from "../keys/highWater.js";
import { readKeyRevocations } from "../keys/keyRevocations.js";
import { keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { readPinnedTrustRoots, trustRootSetIdOf } from "./rootRotation.js";
import { LOCAL_PURPOSES } from "../vault/vaultPayload.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ROLE_PURPOSES, type KeyPurpose } from "./keyPurposes.js";
import {
  distrustEntrySchema, ed25519KeyId, parseTrustValue, readSignedTrustListFile, signedTrustListSchema, TrustListError, verifySignedTrustList,
  type DistrustEntry, type TrustList
} from "./trustList.js";

export interface TrustPin { keyId: string; purposes: readonly KeyPurpose[]; origin: string }

export interface TrustContext {
  readonly mode: "pinned" | "workspace-self";
  readonly asOf: Date;                         // now; P1-06 adds --as-of
  readonly lists: readonly TrustList[];        // signature-verified only
  readonly explicitPins: readonly TrustPin[];
  readonly distrust: readonly DistrustEntry[]; // built-in plus every list's entries
  readonly allowUnpinned: boolean;
  readonly allowUnanchored: boolean;
}

export interface LoadTrustContextOptions {
  /** --pubkey <path>: pins that key for the purposes the command checks. */
  pubkey?: { path: string; purposes: readonly KeyPurpose[] };
  /** --expect-monitor <sha256>; falls back to AMC_EXPECTED_MONITOR_FINGERPRINT. Pins ledger-row. */
  expectMonitor?: string;
  /** --trust-list <file>, repeatable; defaults to <AMC home>/trust/amc-trust-list.json when it exists. */
  trustLists?: readonly string[];
  /** --trust-root <sha256>, repeatable; defaults to <AMC home>/trust/trust-roots.json. */
  trustRoots?: readonly string[];
  /** Command-line flags only: never read from the environment or a request body. */
  allowUnpinned?: boolean;
  allowUnanchored?: boolean;
  amcHome?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

const builtInDistrustSchema = z.strictObject({ distrust: z.array(distrustEntrySchema) });

/** Shipped with the package; no flag or environment variable disables it, and it beats any pin. */
function builtInDistrust(): DistrustEntry[] {
  const text = readFileSync(new URL("./amc-distrust.json", import.meta.url), "utf8");
  return parseTrustValue(builtInDistrustSchema, JSON.parse(text) as unknown, "built-in amc-distrust.json").distrust;
}

function fingerprint(value: string, origin: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${origin} must be a 64 hex sha256 fingerprint`);
  return normalized;
}

export function loadTrustContext(opts: LoadTrustContextOptions = {}): TrustContext {
  const env = opts.env ?? process.env;
  const trustDir = join(opts.amcHome ?? resolveAmcHome({ env }), "trust");
  const explicitPins: TrustPin[] = [];
  if (opts.pubkey) {
    const pem = boundedFile(opts.pubkey.path, 64 * 1024).toString("utf8");
    const keyId = ed25519KeyId(pem);
    if (keyId === null) throw new Error(`--pubkey ${opts.pubkey.path} is not an Ed25519 SPKI public key`);
    explicitPins.push({ keyId, purposes: [...opts.pubkey.purposes], origin: `--pubkey ${opts.pubkey.path}` });
  }
  const monitor = opts.expectMonitor !== undefined
    ? { value: opts.expectMonitor, origin: "--expect-monitor" }
    : env.AMC_EXPECTED_MONITOR_FINGERPRINT ? { value: env.AMC_EXPECTED_MONITOR_FINGERPRINT, origin: "AMC_EXPECTED_MONITOR_FINGERPRINT" } : null;
  if (monitor) explicitPins.push({ keyId: fingerprint(monitor.value, monitor.origin), purposes: ["ledger-row"], origin: monitor.origin });

  const defaultList = join(trustDir, "amc-trust-list.json");
  // lstat, not exists: a dangling or unreadable default list is refused when read, never taken as no list.
  const listPaths = opts.trustLists?.length ? opts.trustLists : lstatSync(defaultList, { throwIfNoEntry: false }) !== undefined ? [defaultList] : [];
  const rootsFile = join(trustDir, "trust-roots.json");
  // The operator's m-of-n policy is read whenever lists are checked and the file exists, --trust-root flags included:
  // a flag replaces the root set, never the threshold, and an unreadable policy is refused, never skipped (P1-08).
  // The file is also checked against this machine's verified root-set rotations (src/trust/rootRotation.ts).
  const policy = listPaths.length ? readPinnedTrustRoots(join(trustDir, "..")) : null;
  const roots = opts.trustRoots?.length ? opts.trustRoots.map(root => fingerprint(root, "--trust-root")) : policy?.roots ?? [];
  const now = opts.now ?? new Date();
  const lists = listPaths.map(path => {
    if (!roots.length) throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", `${path}: no trust-list root is pinned (--trust-root or ${rootsFile})`);
    const signed = readSignedTrustListFile(path);
    const listId = parseTrustValue(signedTrustListSchema, signed, path).list.listId;
    const marks = trustListMarks(listId, roots, { amcHome: opts.amcHome, env });
    const list = verifySignedTrustList(signed, { pinnedRootKeyIds: roots, now, threshold: Math.max(policy?.threshold ?? 1, marks.threshold) });
    marks.accept(list, Math.max(policy?.threshold ?? 1, list.rootThreshold ?? 1));
    return list;
  });
  return {
    mode: "pinned", asOf: now, lists, explicitPins,
    distrust: [...builtInDistrust(), ...lists.flatMap(list => list.distrust)],
    allowUnpinned: opts.allowUnpinned === true, allowUnanchored: opts.allowUnanchored === true
  };
}

/**
 * Anti-rollback (P1-08), per listId under the pinned root set (pinning other roots is a deliberate trust change, so it
 * starts other marks): a lower sequence is ROLLBACK_DETECTED and other content at an accepted sequence FORK_DETECTED; a
 * lower list version is refused; and the highest m-of-n threshold ever required for the list stays required, so a later
 * single-signature policy or list cannot downgrade it.
 */
function trustListMarks(listId: string, roots: readonly string[], opts: { amcHome: string | undefined; env: NodeJS.ProcessEnv }) {
  const rootSet = trustRootSetIdOf(roots);
  const key = (kind: "trust-list" | "trust-list-version" | "trust-list-threshold") => highWaterKey(kind, `${listId}@${rootSet}`);
  const rethrow = (error: unknown): never => {
    if (error instanceof AntiRollbackError) throw new TrustListError(error.code, `list "${listId}": ${error.message}`);
    throw error;
  };
  let threshold = 1;
  try { threshold = readHighWater(key("trust-list-threshold"), opts)?.sequence ?? 1; } catch (error) { rethrow(error); }
  return {
    threshold,
    accept(list: TrustList, required: number): void {
      try {
        recordHighWater(key("trust-list-version"), list.version, sha256Hex(`version ${list.version}`), opts);
        recordHighWater(key("trust-list"), list.sequence, sha256Hex(canonicalize(list)), opts);
        const floor = Math.max(threshold, required);
        if (floor > threshold) recordHighWater(key("trust-list-threshold"), floor, sha256Hex(`threshold ${floor}`), opts);
      } catch (error) {
        rethrow(error);
      }
    }
  };
}

/**
 * The operator's distrust: the built-in list, every AMC home trust list's distrust entries, and its key-compromise
 * revocations, which refuse a key for every purpose and time. Distrust beats every pin, workspace-self pins included.
 */
function operatorDistrust(now: Date): DistrustEntry[] {
  const operator = loadTrustContext({ now });
  const compromised = operator.lists.flatMap(list => list.entries.filter(entry => entry.revocationReason === "key-compromise")
    .map((entry): DistrustEntry => ({ keyId: entry.keyId, distrustedFrom: null, reason: "key-compromise",
      note: `revoked at ${entry.revokedAt ?? "an unrecorded time"} in trust list ${list.listId}`, source: `trust-list:${list.listId}` })));
  return [...operator.distrust, ...compromised];
}

/**
 * For internal round trips only (an export re-checking what this workspace just signed). The keys come from the
 * workspace under test, so this is a self-check: never wire it into a CLI or API verdict, and never treat it as an
 * independent issuer. Only the local purposes are pinned, so independent-attestation and evidence-authority never pass.
 * Since P1-08 each purpose pins its own key history (`<purpose>.pub`), so a key split off for one purpose is refused for
 * another (wrong-purpose); a workspace not yet migrated pins its role histories as before. The operator's distrust and
 * the workspace's own signed key revocations (`amc keys revoke`) still apply.
 */
export function workspaceSelfTrust(workspace: string, now: Date = new Date()): TrustContext {
  // A workspace with a key set pins purposes only; a missing purpose file then fails closed, never widens to roles.
  const migrated = keysetDeclared(workspace);
  const explicitPins = migrated
    ? LOCAL_PURPOSES.flatMap(purpose => getPurposeKeyHistory(workspace, purpose).flatMap(pem => {
      // A provider key the key set binds (P2-08) may be ECDSA P-256.
      const keyId = signingKeyId(pem);
      return keyId ? [{ keyId, purposes: [purpose], origin: `workspace-self:${purpose}` }] : [];
    }))
    : (Object.keys(ROLE_PURPOSES) as Array<keyof typeof ROLE_PURPOSES>).flatMap(role => {
      if (!existsSync(join(workspace, ".amc", "keys", `${role}_ed25519.pub`))) return [];
      return getPublicKeyHistory(workspace, role).flatMap(pem => {
        const keyId = ed25519KeyId(pem);
        return keyId ? [{ keyId, purposes: ROLE_PURPOSES[role], origin: `workspace-self:${role}` }] : [];
      });
    });
  const revoked = readKeyRevocations(workspace, migrated).map((row): DistrustEntry => ({
    keyId: row.keyId, distrustedFrom: row.reason === "key-compromise" ? null : row.revokedAt, reason: row.reason,
    note: `revoked by amc keys revoke at ${row.revokedAt}`, source: "workspace-key-revocations"
  }));
  return { mode: "workspace-self", asOf: now, lists: [], explicitPins, distrust: [...operatorDistrust(now), ...revoked], allowUnpinned: false, allowUnanchored: false };
}

/**
 * `context` plus pins by key id, for fingerprints recorded outside the artifact being verified: a registry entry the
 * pinned registry signed, a peer key the operator added, a publisher the workspace's signed install lock names.
 */
export function withPins(context: TrustContext, pins: readonly TrustPin[]): TrustContext {
  return { ...context, explicitPins: [...context.explicitPins, ...pins] };
}
