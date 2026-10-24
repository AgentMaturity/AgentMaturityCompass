import { dirname, resolve, join } from "node:path";
import { ensureDir, writeFileAtomic } from "../../utils/fs.js";
import { loadDiagnosticBankAttemptAsync, DiagnosticBankFollowupError } from "../bank/bankLoader.js";
import type { DiagnosticBank } from "../bank/bankSchema.js";
import { captureOrgFiles, assertOrgPairsCurrent, type OrgPairsOptions } from "../../org/preparedOrgPairs.js";
import { diagnosticBankPath, captureDiagnosticBankInput } from "../bank/bankLoader.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { renderContextualizedDiagnostic } from "./contextualizer.js";

function toMarkdown(rendered: ReturnType<typeof renderContextualizedDiagnostic>): string {
  const lines: string[] = [];
  lines.push(`# AMC Contextualized Diagnostic (${rendered.agentId})`);
  lines.push("");
  lines.push(`Generated: ${new Date(rendered.generatedTs).toISOString()}`);
  lines.push(`Agent type: ${rendered.profile.agentType}`);
  lines.push(`Operating mode: ${rendered.profile.operatingMode}`);
  lines.push("");
  for (const question of rendered.questions) {
    lines.push(`## ${question.qId} — ${question.title}`);
    lines.push(question.howThisApplies);
    lines.push(`Target: ${question.ownerTarget === null ? "(not set)" : question.ownerTarget}`);
    lines.push("Evidence examples:");
    for (const example of question.tailoredEvidenceExamples) {
      lines.push(`- ${example}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function contextualizedDiagnosticRenderCli(params: {
  workspace: string;
  agentId?: string;
  format: "json" | "md";
  outFile?: string;
  bank?: DiagnosticBank;
}): {
  render: ReturnType<typeof renderContextualizedDiagnostic>;
  outFile: string | null;
} {
  const render = renderContextualizedDiagnostic({
    workspace: params.workspace,
    agentId: params.agentId, bank: params.bank
  });
  let outFile: string | null = null;
  if (params.outFile) {
    const outputPath = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outputPath));
    const body = params.format === "md" ? toMarkdown(render) : JSON.stringify(render, null, 2);
    writeFileAtomic(outputPath, body, 0o644);
    outFile = outputPath;
  }
  return {
    render,
    outFile
  };
}

/** The only new awaited prerequisite is the real missing bank; existing bank reads do not require unlock. */
export async function contextualizedDiagnosticRenderCliAsync(params: Parameters<typeof contextualizedDiagnosticRenderCli>[0], options: OrgPairsOptions = {}) {
  const input = { workspace: params.workspace, agentId: params.agentId, format: params.format, outFile: params.outFile };
  const outputPath = input.outFile ? resolve(input.workspace, input.outFile) : null, bankPath = diagnosticBankPath(input.workspace);
  if (outputPath === resolve(bankPath) || outputPath === resolve(`${bankPath}.sig`)) throw new Error("diagnostic render output must differ from its bank input");
  const output = captureOrgFiles(outputPath === null ? [] : [outputPath]), bankBefore = captureDiagnosticBankInput(input.workspace);
  for (const out of output.members) for (const source of bankBefore.members)
    if (resolve(out.path) === resolve(source.path) || (out.identity !== null && out.identity === source.identity)) throw new Error("diagnostic render output must differ from its bank input");
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  const stable = () => { beforePublish?.(); assertInputsCurrent?.(); assertOrgPairsCurrent(output); };
  const selected = await loadDiagnosticBankAttemptAsync(input.workspace, { beforePublish, assertInputsCurrent: stable }, bankBefore);
  try {
    stable(); selected.assertCurrent();
    const result = contextualizedDiagnosticRenderCli({ ...input, outFile: undefined, bank: selected.bank });
    if (outputPath !== null) {
      const body = input.format === "md" ? toMarkdown(result.render) : JSON.stringify(result.render, null, 2);
      withControlFileLock({ root: join(input.workspace, ".amc"), name: "org-auditor-pairs", operation() {
        stable(); selected.assertCurrent(); ensureDir(dirname(outputPath)); writeFileAtomic(outputPath, body, 0o644);
      } });
    }
    return { render: result.render, outFile: outputPath };
  } catch (cause) { if (selected.completedPaths.length > 0) throw new DiagnosticBankFollowupError(selected.completedPaths, cause); throw cause; }
}
