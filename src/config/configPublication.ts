import { join } from "node:path";
import { assertOwnerMode } from "../mode/mode.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import { assertKeysetComplete, type Keyset } from "../keys/keyset.js";
import { CONFIG_REL } from "../keys/keysConfig.js";
import { withAmcConfigPublicationLock } from "./configPublicationLock.js";

const CONFIG_SIGNATURE_REL = `${CONFIG_REL}.sig`;
export const MAX_CONFIG_BYTES = 1024 * 1024;
export interface ConfigPublicationSnapshot { keyset: Keyset; config: Buffer | null; signature: Buffer | null }

/** Internal owner preparation; these bytes are predecessors, never authority for selecting a signer. */
export function captureConfigPublication(workspace: string): ConfigPublicationSnapshot {
  assertOwnerMode(workspace, "config sign");
  return withAmcConfigPublicationLock(workspace, () => {
    assertOwnerMode(workspace, "config sign");
    const keyset = assertKeysetComplete(workspace);
    if (keyset === null) throw new Error("config publication needs a committed workspace key set");
    return { keyset: structuredClone(keyset), config: readContainedOrNull(workspace, CONFIG_REL, MAX_CONFIG_BYTES),
      signature: readContainedOrNull(workspace, CONFIG_SIGNATURE_REL, 64 * 1024) };
  });
}

const equal = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
/** Call only inside the publication lock, immediately before commitKeyset. */
export function assertConfigPublicationCurrent(workspace: string, captured: ConfigPublicationSnapshot): void {
  assertOwnerMode(workspace, "config sign");
  const current = assertKeysetComplete(workspace);
  if (current === null || canonicalize(current) !== canonicalize(captured.keyset)) throw new Error("the committed key set changed while config signing was prepared; retry");
  if (!equal(captured.config, readContainedOrNull(workspace, CONFIG_REL, MAX_CONFIG_BYTES))
    || !equal(captured.signature, readContainedOrNull(workspace, CONFIG_SIGNATURE_REL, 64 * 1024))) {
    throw new Error("amc.config.yaml or its signature changed while config signing was prepared; retry");
  }
}

export function configSignatureBytes(configSha256: string, signature: Uint8Array): string {
  // Existing sidecar shape and encoding; no algorithm/provider field is added to legacy signed bytes.
  return JSON.stringify({ configSha256, signature: Buffer.from(signature).toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2);
}

export function configPairWrites(workspace: string, config: Buffer, signature: string) {
  return [{ path: join(workspace, CONFIG_REL), bytes: config, mode: 0o644 },
    { path: join(workspace, CONFIG_SIGNATURE_REL), bytes: signature, mode: 0o644 }];
}
