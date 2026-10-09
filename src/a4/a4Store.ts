/**
 * A4 Forge project store (P1-56 fills it).
 *
 * Only this file may contain the literal `auditType: "A4_STATE"`: `npm run check:gates` scans audit literals per
 * source file, and `NON_MATURITY_AUDIT_MODULES` (src/diagnostic/evidenceEmitters.ts) classifies this module alone.
 * Other A4 modules pass the kind through a parameter.
 */
export const A4_AUDIT_TYPE = "A4_STATE" as const;
