/**
 * The signer keys and key histories an evidence bundle (and a certificate, same `public-keys/` layout) carries, read but
 * never trusted on their own: admitKey and verifyKeyHistoryEnvelope decide against the verifier's pins. Moved out of
 * bundle.ts unchanged for its line budget; certificate.ts reuses it instead of its own copy.
 */
import { join } from "node:path";
import { verifyKeyHistoryEnvelope, type KeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { readUtf8 } from "../utils/fs.js";

/** The key-history envelope a bundle carries for a role, unverified: admitKey checks it against a pinned anchor. */
export function bundleKeyHistory(root: string, kind: "monitor" | "auditor"): unknown {
  try {
    const parsed: unknown = JSON.parse(readUtf8(join(root, "public-keys", "key-history.json")));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)[kind] : undefined;
  } catch {
    return undefined;
  }
}

export function authenticatedHistoryFromBundle(root: string, kind: "monitor" | "auditor"): KeyHistoryEnvelope | null {
  // The history cannot choose its own anchor or gain authority merely by
  // being copied into a manifest. Only the direct role key admits old keys.
  const result = verifyKeyHistoryEnvelope(bundleKeyHistory(root, kind), kind, readUtf8(join(root, "public-keys", `${kind}.pub`)));
  return result.valid ? result.envelope : null;
}

export function collectRoleKeysFromBundle(root: string, kind: "monitor" | "auditor"): string[] {
  const direct = readUtf8(join(root, "public-keys", `${kind}.pub`));
  const history = authenticatedHistoryFromBundle(root, kind);
  return [...new Set([direct, ...(history?.entries.map((entry) => entry.publicKeyPem) ?? [])])];
}

export function collectAuditorKeysFromBundle(root: string): string[] {
  return collectRoleKeysFromBundle(root, "auditor");
}

function collectMonitorKeysFromBundle(root: string): string[] {
  return collectRoleKeysFromBundle(root, "monitor");
}
