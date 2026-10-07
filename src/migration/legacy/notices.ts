/**
 * Versioned notices for results AMC 1.x wrote (P1-35). A notice names the rules that relabel a 1.x result and why;
 * bump `version` in a new file when the rules or wording change, and keep every old version here so records that
 * cite it still resolve. See docs/migration/LEGACY_RESULTS.md.
 */
import notice2026001v1 from "./notices/AMC-LEGACY-2026-001.json" with { type: "json" };

export type LegacyClaimKind = "self_reported" | "synthetic_example";

export interface LegacyNotice {
  id: string;
  version: number;
  /** YYYY-MM-DD the notice took effect. */
  date: string;
  reason: string;
  rules: Array<{ id: string; claimKind: LegacyClaimKind; detects: string }>;
  docs: "docs/migration/LEGACY_RESULTS.md";
}

const LEGACY_NOTICES: readonly LegacyNotice[] = [notice2026001v1 as LegacyNotice];

/** The notice new labels and records cite: the last one listed. */
export const CURRENT_LEGACY_NOTICE: LegacyNotice = LEGACY_NOTICES[LEGACY_NOTICES.length - 1]!;

/** How labels cite a notice: "AMC-LEGACY-2026-001 v1". */
export function noticeRef(notice: Pick<LegacyNotice, "id" | "version"> = CURRENT_LEGACY_NOTICE): string {
  return `${notice.id} v${notice.version}`;
}
