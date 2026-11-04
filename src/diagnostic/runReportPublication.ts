import { join } from "node:path";
import type { Ledger } from "../ledger/ledger.js";
import { captureRunReportOutputs, runReportFailure } from "../ledger/runReportOutputs.js";
import type { RunHashPublicationOptions } from "../ledger/runHashSignature.js";
import type { DiagnosticReport } from "../types.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

/** Actual runner tail; the original report calculation and Markdown renderer stay in runner.ts. */
export async function publishDiagnosticReport(params: {
  workspace: string; ledger: Ledger; body: DiagnosticReport; noSign: boolean; unsignedStore: boolean;
  runsDir: string; reportsDir: string; outputMarkdownPath?: string; targetProfileId: string | null;
  options: RunHashPublicationOptions; priorEffects: readonly string[]; assertOriginal(): void; render(report: DiagnosticReport): string;
}): Promise<DiagnosticReport> {
  const { ledger, options } = params, body = structuredClone(params.body), hash = sha256Hex(canonicalize(body));
  const jsonPath = join(params.runsDir, `${body.runId}.json`), markdownPath = params.outputMarkdownPath ?? join(params.reportsDir, `${body.runId}.md`);
  const asyncSeal = !params.noSign && !options.synchronousSeal; let outputs: ReturnType<typeof captureRunReportOutputs> | null = null;
  const completed = [...params.priorEffects]; let phase = "diagnostic-destinations";
  try {
    outputs = asyncSeal ? captureRunReportOutputs(params.workspace, [jsonPath, markdownPath]) : null; phase = "diagnostic-seal";
    const beforeSign = () => { options.beforePublish?.(); params.assertOriginal(); };
    beforeSign(); const prepared = asyncSeal ? await ledger.signRunHashAsync(hash, beforeSign) : null;
    const runSealSig = params.noSign ? "unsigned" : options.synchronousSeal ? ledger.signRunHash(hash) : prepared!.signature;
    const report: DiagnosticReport = { ...body, runSealSig, reportJsonSha256: hash };
    const current = () => { options.beforePublish?.(); params.assertOriginal(); prepared?.assertCurrent(); outputs?.assertPublishedCurrent(); };
    phase = "diagnostic-json"; current(); ensureDir(params.runsDir);
    const json = JSON.stringify(report, null, 2); current();
    if (outputs) outputs.write(jsonPath, json); else writeFileAtomic(jsonPath, json, 0o644);
    completed.push(jsonPath);
    if (!params.noSign || params.unsignedStore) { phase = "diagnostic-sql"; current(); ledger.insertRun({
      run_id: report.runId, window_start_ts: report.windowStartTs, window_end_ts: report.windowEndTs,
      target_profile_id: params.targetProfileId, report_json_sha256: hash, run_seal_sig: runSealSig, status: report.status
    }); completed.push(`run:${report.runId}`); }
    phase = "diagnostic-markdown"; const markdown = params.render(report); current(); ensureDir(params.reportsDir);
    if (outputs) outputs.write(markdownPath, markdown); else writeFileAtomic(markdownPath, markdown, 0o644);
    completed.push(markdownPath); current(); return report;
  } catch (cause) { runReportFailure(completed, phase, cause); }
}
