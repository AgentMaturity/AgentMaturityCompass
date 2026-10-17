import {
  appendTransparencyEntry,
  exportTransparencyBundle,
  initTransparencyLog,
  tailTransparencyEntries,
  verifyTransparencyBundle as verifyTransparencyBundleCore,
  verifyTransparencyLog
} from "./logChain.js";
import { artifactClaim, withClaimFields } from "../cli/claimOutput.js";

export {
  appendTransparencyEntry,
  exportTransparencyBundle,
  initTransparencyLog,
  tailTransparencyEntries,
  verifyTransparencyLog
};

/** A verified seal proves integrity; the CLI's artifact claim remains self-reported and not evaluated. */
export function verifyTransparencyBundle(...args: Parameters<typeof verifyTransparencyBundleCore>) {
  return withClaimFields(verifyTransparencyBundleCore(...args), artifactClaim("transparency:log"));
}
