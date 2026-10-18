/**
 * The built-in distrust list (src/trust/amc-distrust.json), shipped with the package. No flag or environment variable
 * disables it, it beats any pin at verification (src/trust/trustContext.ts) and it refuses a key at signing
 * (src/keys/signingKeys.ts assertSigningKeyUsable).
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { distrustEntrySchema, parseTrustValue, type DistrustEntry } from "./trustList.js";

const builtInDistrustSchema = z.strictObject({ distrust: z.array(distrustEntrySchema) });

export function builtInDistrust(): DistrustEntry[] {
  const text = readFileSync(new URL("./amc-distrust.json", import.meta.url), "utf8");
  return parseTrustValue(builtInDistrustSchema, JSON.parse(text) as unknown, "built-in amc-distrust.json").distrust;
}
