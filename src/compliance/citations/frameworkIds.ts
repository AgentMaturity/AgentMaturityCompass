/**
 * Framework identifier formats, reference tables and pair rules for CIT002.
 *
 * The reference tables record the official file they were extracted from (url,
 * retrievedAt, sha256). The ISO/IEC 42001 Annex A table stays empty until a
 * named expert supplies it from a licensed copy; an empty table skips the
 * membership check for that framework.
 */
import atlasTable from "./reference/atlas.json" with { type: "json" };
import nistAiRmfTable from "./reference/nistAiRmf.json" with { type: "json" };
import iso42001AnnexATable from "./reference/iso42001AnnexA.json" with { type: "json" };

export type CitationFramework = "atlas" | "nist-ai-rmf" | "iso-42001";

export const FRAMEWORK_ID_FORMATS: Readonly<Record<CitationFramework, RegExp>> = {
  atlas: /^AML\.T\d{4}(\.\d{3})?$/,
  "nist-ai-rmf": /^(GOVERN|MAP|MEASURE|MANAGE) \d+\.\d+$/,
  "iso-42001": /^A\.\d+(\.\d+)?$/,
};

export interface ReferenceTableSource {
  title: string;
  url: string;
  retrievedAt: string;
  sha256: string;
}

export interface FrameworkReferenceTable {
  framework: string;
  source: ReferenceTableSource | null;
  extraction: string;
  entries: ReadonlyArray<{ id: string }>;
}

export const FRAMEWORK_REFERENCE_TABLES: Readonly<{
  atlas: FrameworkReferenceTable;
  nistAiRmf: FrameworkReferenceTable;
  iso42001AnnexA: FrameworkReferenceTable;
}> = {
  atlas: atlasTable,
  nistAiRmf: nistAiRmfTable,
  iso42001AnnexA: iso42001AnnexATable as FrameworkReferenceTable,
};

/** A broken pairing of id and label, or null. Rules come from the AMC strategy's citation review. */
export function frameworkPairViolation(framework: CitationFramework, id: string, label: string): string | null {
  if (framework === "atlas" && /prompt injection/i.test(label) && !/^AML\.T0051(\.\d{3})?$/.test(id)) {
    return `prompt injection is ATLAS AML.T0051, not ${id}`;
  }
  if (framework === "iso-42001" && /^A\.5(\.\d+)?$/.test(id) && /\bAI policy\b|policies related to AI/i.test(label)) {
    return `ISO/IEC 42001 ${id} must not be labelled as AI policy`;
  }
  return null;
}
