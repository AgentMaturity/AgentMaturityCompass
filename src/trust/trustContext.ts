import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { ROLE_PURPOSES, type KeyPurpose } from "./keyPurposes.js";
import {
  distrustEntrySchema, ed25519KeyId, parseTrustValue, readSignedTrustListFile, TrustListError, verifySignedTrustList,
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

const trustRootsSchema = z.strictObject({
  type: z.literal("amc.trust-roots"),
  version: z.literal(1),
  roots: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1)
});
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
  const listPaths = opts.trustLists?.length ? opts.trustLists : existsSync(defaultList) ? [defaultList] : [];
  const rootsFile = join(trustDir, "trust-roots.json");
  const roots = opts.trustRoots?.length
    ? opts.trustRoots.map(root => fingerprint(root, "--trust-root"))
    : listPaths.length && existsSync(rootsFile) ? parseTrustValue(trustRootsSchema, readSignedTrustListFile(rootsFile), rootsFile).roots : [];
  const now = opts.now ?? new Date();
  const lists = listPaths.map(path => {
    if (!roots.length) throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", `${path}: no trust-list root is pinned (--trust-root or ${rootsFile})`);
    return verifySignedTrustList(readSignedTrustListFile(path), { pinnedRootKeyIds: roots, now });
  });
  return {
    mode: "pinned", asOf: now, lists, explicitPins,
    distrust: [...builtInDistrust(), ...lists.flatMap(list => list.distrust)],
    allowUnpinned: opts.allowUnpinned === true, allowUnanchored: opts.allowUnanchored === true
  };
}

/**
 * For internal round trips only (an export re-checking what this workspace just signed). The keys come from the
 * workspace under test, so this is a self-check: never wire it into a CLI or API verdict, and never treat it as an
 * independent issuer. Only the role purposes are pinned, so independent-attestation and evidence-authority never pass.
 */
export function workspaceSelfTrust(workspace: string, now: Date = new Date()): TrustContext {
  const explicitPins = (Object.keys(ROLE_PURPOSES) as Array<keyof typeof ROLE_PURPOSES>).flatMap(role => {
    if (!existsSync(join(workspace, ".amc", "keys", `${role}_ed25519.pub`))) return [];
    return getPublicKeyHistory(workspace, role).flatMap(pem => {
      const keyId = ed25519KeyId(pem);
      return keyId ? [{ keyId, purposes: ROLE_PURPOSES[role], origin: `workspace-self:${role}` }] : [];
    });
  });
  return { mode: "workspace-self", asOf: now, lists: [], explicitPins, distrust: builtInDistrust(), allowUnpinned: false, allowUnanchored: false };
}

/**
 * `context` plus pins by key id, for fingerprints recorded outside the artifact being verified: a registry entry the
 * pinned registry signed, a peer key the operator added, a publisher the workspace's signed install lock names.
 */
export function withPins(context: TrustContext, pins: readonly TrustPin[]): TrustContext {
  return { ...context, explicitPins: [...context.explicitPins, ...pins] };
}
