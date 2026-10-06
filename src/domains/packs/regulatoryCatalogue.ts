import type { RegulatoryInstrument } from "./regulatorySchema.js";
import { EU_INSTRUMENTS } from "./catalogueEu.js";
import { INTL_INSTRUMENTS } from "./catalogueIntl.js";
import { US_INSTRUMENTS } from "./catalogueUs.js";

/** Every instrument cited by industry-pack regulatoryBasis and complianceFrameworks, with currency. */
export const REGULATORY_CATALOGUE: readonly RegulatoryInstrument[] = [...EU_INSTRUMENTS, ...US_INSTRUMENTS, ...INTL_INSTRUMENTS];
