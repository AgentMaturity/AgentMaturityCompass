import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";

/**
 * A complete workspace-write attacker (P1-08): besides swapping a public key, it names that key for `purpose` in the
 * unsigned .amc/keys/keyset.json. A machine without this workspace's mark takes the key set as found and cannot tell;
 * the machine that committed the key set refuses it, and pinned keys or an external anchor catch it anywhere.
 */
export function forgeKeysetKey(workspace: string, purpose: string, publicKeyPem: string): void {
  const keys = join(workspace, ".amc", "keys");
  writeFileSync(join(keys, `${purpose}.pub`), publicKeyPem);
  const path = join(keys, "keyset.json");
  const keyset = JSON.parse(readFileSync(path, "utf8")) as { keys: Record<string, string>; files: Record<string, string> };
  writeFileSync(path, canonicalize({
    ...keyset,
    keys: { ...keyset.keys, [purpose]: ed25519KeyId(publicKeyPem) },
    files: { ...keyset.files, [`keys/${purpose}.pub`]: sha256Hex(Buffer.from(publicKeyPem, "utf8")) }
  }));
}
