import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";

/**
 * A complete workspace-write attacker (P1-08): besides swapping a public key, it names that key for `purpose` in the
 * unsigned .amc/keys/keyset.json. A machine without this workspace's mark takes the key set as found and cannot tell;
 * the machine that committed the key set refuses it, and pinned keys or an external anchor catch it anywhere.
 * It also re-records the digest of every public key file the key set lists (P2-08 readers check them all), so a legacy
 * alias the caller rewrote, such as monitor_ed25519.pub, matches too.
 */
export function forgeKeysetKey(workspace: string, purpose: string, publicKeyPem: string): void {
  const keys = join(workspace, ".amc", "keys");
  writeFileSync(join(keys, `${purpose}.pub`), publicKeyPem);
  const path = join(keys, "keyset.json");
  const keyset = JSON.parse(readFileSync(path, "utf8")) as { keys: Record<string, string>; files: Record<string, string> };
  const pubDigests = Object.fromEntries(Object.keys(keyset.files)
    .filter(rel => rel.startsWith("keys/") && rel.endsWith(".pub"))
    .map(rel => [rel, sha256Hex(readFileSync(join(workspace, ".amc", rel)))]));
  writeFileSync(path, canonicalize({
    ...keyset,
    keys: { ...keyset.keys, [purpose]: ed25519KeyId(publicKeyPem) },
    files: { ...keyset.files, ...pubDigests, [`keys/${purpose}.pub`]: sha256Hex(Buffer.from(publicKeyPem, "utf8")) }
  }));
}
