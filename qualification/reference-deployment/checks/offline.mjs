// OV-1 and OV-2 (docs/deploy/reference/OFFLINE_VERIFICATION.md).
import { notRun } from "./lib.mjs";

export const checks = {
  "OV-1": async () => notRun("bundle export plus the standalone verifier on a network-less host, with tampered, forged-embedded-key, unpinned-issuer and revoked-key fixtures, is not wired into this harness yet", ["P1-06", "P2-06 follow-up"]),
  "OV-2": async () => notRun("WORM export needs an object-lock bucket (or a stand-in) reachable from the cluster", ["P2-09", "P2-06 follow-up"])
};
