export interface EvidenceRefRow {
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
}

export function withBlankEvidenceRefs<T extends EvidenceRefRow>(rows: T[]): T[] {
  return rows.map((row, index) => {
    if (index === 0) return { ...row, evidenceRefs: ["   "] };
    if (index === 1) return { ...row, signedEvidenceRefs: ["", "  "] };
    return row;
  });
}
