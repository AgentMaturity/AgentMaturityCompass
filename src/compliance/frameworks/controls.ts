import type { FrameworkControl } from "../mappingSchema.js";
import { doraControls } from "./controls/dora.js";
import { hhsHti1HipaaControls } from "./controls/hhsHti1Hipaa.js";
import { nis2Controls } from "./controls/nis2.js";
import { nistAi600_1Controls } from "./controls/nistAi600_1.js";
import { usStateAiLawControls } from "./controls/usStateAiLaws.js";

/**
 * Clause-level controls quoted from official texts, each linked to the built-in mappings whose evidence
 * bears on it, with a relation and a rationale per link. Applied from the round-2 framework research on
 * 2026-10-04 and hand-maintained since P1-45; see docs/COMPLIANCE_MAPS.md "Clause-level controls and
 * crosswalk links". Links are information only: a result for one framework never sets another's.
 */
export const frameworkControls: readonly FrameworkControl[] = [
  ...doraControls,
  ...nis2Controls,
  ...nistAi600_1Controls,
  ...usStateAiLawControls,
  ...hhsHti1HipaaControls,
];
