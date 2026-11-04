import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { assertOwnerMode } from "../mode/mode.js";
import { extractLessonsFromCorrections, initLessonTables } from "./correctionMemory.js";
import { lessonTransferMetadataSchema } from "./lessonProvenance.js";

/** Existing memory-extract command boundary, including owner admission and connection cleanup. */
export function extractCorrectionLessonsCli(params: {
  workspace: string;
  agentId: string;
  minEffectiveness: number;
  provenanceFile?: string;
}) {
  if (params.provenanceFile) assertOwnerMode(params.workspace, "tune");
  const provenance = params.provenanceFile
    ? lessonTransferMetadataSchema.parse(JSON.parse(readFileSync(resolve(params.provenanceFile), "utf8"))) : undefined;
  const ledger = openLedger(params.workspace);
  try {
    initLessonTables(ledger.db);
    return extractLessonsFromCorrections(ledger.db, params.agentId, params.workspace,
      { minEffectivenessForLesson: params.minEffectiveness }, provenance);
  } finally { ledger.close(); }
}
