/**
 * Instruments known to be superseded, revoked or withdrawn. A citation that
 * matches one of these patterns must resolve to a catalogue record marked
 * "repealed" with supersededBy, or check-citations reports CIT001.
 *
 * Sources: the AMC strategy's regulated-industry pack plan and the F5 citation
 * review. Add an entry only with a source for the replacement; agents draft
 * these entries but a named expert approves them (truth rule 8).
 */
export interface SupersededInstrument {
  id: string;
  pattern: RegExp;
  replacement: string;
  note: string;
}

export const SUPERSEDED_INSTRUMENTS: readonly SupersededInstrument[] = [
  {
    id: "OMB M-24-10",
    pattern: /\bM-24-10\b/,
    replacement: "OMB M-25-21",
    note: "OMB M-25-21 (3 April 2025) replaced M-24-10 for federal agency use of AI.",
  },
  {
    id: "SR 11-7",
    pattern: /\bSR\s?11-7\b/,
    replacement: "SR 26-2",
    note: "Federal Reserve SR 26-2 superseded SR 11-7 model risk management guidance.",
  },
  {
    id: "EO 14110",
    pattern: /\b(?:EO|E\.O\.|Executive Order)\s*14110\b/i,
    replacement: "none (revoked by EO 14148 on 2025-01-20)",
    note: "Executive Order 14110 was revoked; it has no successor instrument.",
  },
  {
    id: "EEOC AI technical assistance",
    pattern: /\bEEOC\b[^;]*\b(?:AI|artificial intelligence|algorithmic)\b[^;]*\b(?:guidance|technical assistance)\b/i,
    replacement: "none (withdrawn; re-verify current EEOC position)",
    note: "The EEOC's AI technical-assistance documents were withdrawn; re-verify before citing.",
  },
  {
    id: "21 CFR 820.30",
    pattern: /\b21\s*CFR\s*(?:§\s*)?820\.30\b/,
    replacement: "21 CFR 820.10 (QMSR)",
    note: "The Quality Management System Regulation (effective 2026-02-02) replaced the 820.30 design-control text.",
  },
  {
    id: "ICH E6(R2)",
    pattern: /\bE6\s*\(R2\)/,
    replacement: "ICH E6(R3)",
    note: "ICH E6(R3) replaced E6(R2) Good Clinical Practice.",
  },
  {
    id: "Directive 2003/98/EC",
    pattern: /\b2003\/98\b/,
    replacement: "Directive (EU) 2019/1024",
    note: "The Open Data Directive (EU) 2019/1024 recast and repealed Directive 2003/98/EC.",
  },
];
