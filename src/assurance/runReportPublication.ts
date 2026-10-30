import { join } from "node:path";
import type { Ledger } from "../ledger/ledger.js";
import { captureRunReportOutputs, runReportFailure } from "../ledger/runReportOutputs.js";
import type { RunHashPublicationOptions } from "../ledger/runHashSignature.js";
import type { AssuranceReport } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { renderAssuranceMarkdown } from "./report.js";
import { persistV1Artifacts, persistV1ArtifactsAsync } from "./assuranceArtifactPersistence.js";

/** Actual scan report suffix; completed scenario/session evidence remains when a later report phase refuses. */
export async function publishAssuranceReport(params: {
  workspace: string; ledger: Ledger; body: AssuranceReport; noSign: boolean; reportsDir: string; outputMarkdownPath?: string;
  sessionId: string; packIds: string[]; allPackIds: string[]; options: RunHashPublicationOptions; assertOriginal(): void;
}): Promise<AssuranceReport> {
  const { ledger, options } = params, body = structuredClone(params.body), hash = sha256Hex(canonicalize(body));
  const jsonPath = join(params.reportsDir, `${body.assuranceRunId}.json`), markdownPath = params.outputMarkdownPath ?? join(params.reportsDir, `${body.assuranceRunId}.md`);
  const asyncSeal = !params.noSign && !options.synchronousSeal; let outputs: ReturnType<typeof captureRunReportOutputs> | null = null;
  const completed = [`sealed-session:${params.sessionId}`]; let phase = "assurance-destinations";
  try {
    outputs = asyncSeal ? captureRunReportOutputs(params.workspace, [jsonPath, markdownPath]) : null; phase = "assurance-seal";
    const beforeSign = () => { options.beforePublish?.(); params.assertOriginal(); };
    beforeSign(); const prepared = asyncSeal ? await ledger.signRunHashAsync(hash, beforeSign) : null;
    const runSealSig = params.noSign ? "unsigned" : options.synchronousSeal ? ledger.signRunHash(hash) : prepared!.signature;
    const report: AssuranceReport = { ...body, reportJsonSha256: hash, runSealSig };
    const current = () => { options.beforePublish?.(); params.assertOriginal(); prepared?.assertCurrent(); outputs?.assertPublishedCurrent(); };
    phase = "assurance-json"; const json = JSON.stringify(report, null, 2); current();
    if (outputs) outputs.write(jsonPath, json); else writeFileAtomic(jsonPath, json, 0o644); completed.push(jsonPath);
    phase = "assurance-markdown"; const markdown = renderAssuranceMarkdown(report); current();
    if (outputs) outputs.write(markdownPath, markdown); else writeFileAtomic(markdownPath, markdown, 0o644); completed.push(markdownPath);
    phase = "assurance-sql"; current(); ledger.insertAssuranceRun({ assurance_run_id: report.assuranceRunId, agent_id: report.agentId,
      window_start_ts: report.windowStartTs, window_end_ts: report.windowEndTs, mode: report.mode, pack_ids_json: JSON.stringify(params.allPackIds),
      report_json_sha256: hash, run_seal_sig: runSealSig, status: report.status }); completed.push(`assurance-run:${report.assuranceRunId}`);
    phase = "assurance-v1-artifacts";
    const documents = { workspace: params.workspace, agentId: report.agentId, report,
      policySha256: sha256Hex(canonicalize({ packIds: params.packIds, mode: report.mode })) };
    if (asyncSeal) { const v1 = await persistV1ArtifactsAsync(documents, current); completed.push(...v1.paths); v1.assertCurrent(); }
    else persistV1Artifacts(documents);
    current(); return report;
  } catch (cause) { runReportFailure(completed, phase, cause); }
}
