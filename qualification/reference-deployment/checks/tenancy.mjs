// TS-1 to TS-5 (docs/deploy/reference/TENANT_ONBOARDING.md). The chart runs one single-workspace Studio per release;
// a second tenant needs a second release in another namespace, which this harness does not install yet.
import { notRun } from "./lib.mjs";

const SECOND_TENANT = "needs a second tenant release (one release per namespace) and per-tenant fixtures";

export const checks = {
  "TS-1": async () => notRun(`${SECOND_TENANT}; route list from src/studio/openapi.ts`, ["P2-01", "P2-06 follow-up"]),
  "TS-2": async () => notRun(`${SECOND_TENANT}; lease and agent token replay`, ["P2-01", "P2-06 follow-up"]),
  "TS-3": async () => notRun(`${SECOND_TENANT}; the cross-tenant evidence fixture`, ["P1-11", "P2-06 follow-up"]),
  "TS-4": async () => notRun(`${SECOND_TENANT}; kind's default CNI (kindnet) does not enforce NetworkPolicy, so a policy-enforcing CNI is needed`, ["P2-06 follow-up"]),
  "TS-5": async () => notRun(`${SECOND_TENANT}; guard-event and stream scoping`, ["P2-01", "P2-06 follow-up"])
};
