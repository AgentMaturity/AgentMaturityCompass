/**
 * Trust-list root rotation (P1-08): a signed amc.key-rotation statement with purpose `trust-list-root`
 * (src/keys/rotationStatement.ts) replaces one pinned root in `<AMC home>/trust/trust-roots.json`. It needs the next
 * root's signature (possession) and either the replaced root's signature or `threshold` signatures from the other pinned
 * roots. Each statement is checked on its own against the roots pinned now: the key it replaces must still be pinned,
 * so an applied (or older) statement can never be replayed. Applied statements are kept under `trust/root-rotations/`,
 * and this machine's trust-list marks move to the new root set, so no list older than an accepted one comes back.
 */
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { parseRotationStatement, verifyRotationStatement } from "../keys/rotationStatement.js";
import { listContainedDir, readContained, writeContained } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import { parseTrustValue, ed25519KeyId, TrustListError } from "./trustList.js";
import { carryHighWaterMarks } from "../keys/highWater.js";
import { trustRootSetId, trustRootsSchema } from "./trustContext.js";

export function applyTrustRootRotation(opts: { statement: Buffer; rootPublicKeyPems: readonly string[]; amcHome?: string; env?: NodeJS.ProcessEnv }): {
  roots: string[]; threshold: number; replaced: string; added: string;
} {
  const home = opts.amcHome ?? resolveAmcHome({ env: opts.env ?? process.env });
  const rootsRel = "trust/trust-roots.json";
  const current = parseTrustValue(trustRootsSchema, JSON.parse(readContained(home, rootsRel, 1024 * 1024).toString("utf8")) as unknown, rootsRel);
  const threshold = current.threshold ?? 1;
  // Supplied public keys only locate the pinned roots; a key that is not pinned is ignored.
  const pinned = new Map(opts.rootPublicKeyPems.flatMap(pem => { const id = ed25519KeyId(pem); return id && current.roots.includes(id) ? [[id, pem] as const] : []; }));
  const claimed = parseRotationStatement(opts.statement).statement;
  if (claimed.previousKeyId === null || !current.roots.includes(claimed.previousKeyId)) {
    throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", "the statement replaces a root that is not pinned (already rotated, or never pinned)");
  }
  const verdict = verifyRotationStatement(opts.statement, {
    expected: { workspaceId: "trust-roots", purpose: "trust-list-root" },
    trustedCurrentPublicKeyPem: pinned.get(claimed.previousKeyId) ?? null,
    previous: null,
    roots: { publicKeyPems: [...pinned].filter(([id]) => id !== claimed.previousKeyId).map(([, pem]) => pem), threshold }
  });
  if (!verdict.valid) throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", `root rotation refused: ${verdict.reason}`);
  const { previousKeyId, nextKeyId } = verdict.signed.statement;
  if (current.roots.includes(nextKeyId)) throw new TrustListError("TRUST_LIST_INVALID", "the next root is already pinned");
  const roots = current.roots.map(root => root === previousKeyId ? nextKeyId : root);
  const next = parseTrustValue(trustRootsSchema, { ...current, roots }, rootsRel);
  const applied = listContainedDir(home, "trust/root-rotations").filter(name => /^[0-9]{1,6}\.json$/.test(name)).length;
  writeContained(home, `trust/root-rotations/${String(applied + 1).padStart(6, "0")}.json`, opts.statement, 0o600);
  // Trust-list marks are kept per root set: carry them over, so a list older than one already accepted stays refused.
  const from = `@${trustRootSetId(current.roots)}`;
  const to = `@${trustRootSetId(roots)}`;
  carryHighWaterMarks(key => key.startsWith("trust-list") && key.endsWith(from) ? `${key.slice(0, -from.length)}${to}` : null, { amcHome: home });
  writeContained(home, rootsRel, `${JSON.stringify(JSON.parse(canonicalize(next)), null, 2)}\n`, 0o600);
  return { roots, threshold, replaced: previousKeyId!, added: nextKeyId };
}
