import { createPrivateKey, type KeyObject } from "node:crypto";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import { getSigningKey } from "./signingKeys.js";

/** Cache PEM parsing only. Creating the closure is lazy; every use must pass the current signing gate. */
export function cachedSigningKey(workspace: string, purpose: KeyPurpose): () => KeyObject {
  let cachedPem: string | null = null;
  let cachedKey: KeyObject | null = null;
  return () => {
    const pem = getSigningKey(workspace, purpose);
    if (cachedKey === null || cachedPem !== pem) {
      cachedKey = createPrivateKey(pem);
      cachedPem = pem;
    }
    return cachedKey;
  };
}
