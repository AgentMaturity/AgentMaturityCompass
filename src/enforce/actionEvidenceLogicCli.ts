import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  applyActionEvidenceLogic,
  compileActionEvidenceLogic,
  inspectActionEvidenceLogic,
  isActionEvidenceLogicError,
  type ActionEvidenceLogicApplyResult,
  type ActionEvidenceLogicCompilation,
  type ActionEvidenceLogicInspection,
} from "./actionEvidenceLogic.js";

function readLogic(path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as unknown;
  } catch {
    throw new Error("Evidence logic file must contain valid JSON.");
  }
}

function renderInspection(inspection: ActionEvidenceLogicInspection): string {
  return [
    "AMC Action Policy Evidence Logic",
    `Action class: ${inspection.actionClass}`,
    `Configured tree: ${inspection.configured ? "YES" : "NO (implicit ALL)"}`,
    `Evidence gates: ${inspection.gateCount}`,
    `Alternatives: ${inspection.hasAlternatives ? "YES" : "NO"}`,
    ...inspection.gates.map((gate) => `- ${gate.gateId}: ${gate.label}`),
    `Mandatory outside tree: ${inspection.mandatoryGates.join(", ")}`,
    `Policy hash: ${inspection.baseline.actionPolicySha256}`,
    "",
  ].join("\n");
}

function renderCompilation(compilation: ActionEvidenceLogicCompilation): string {
  return [
    "AMC Action Policy Evidence Logic Preview",
    `Action class: ${compilation.actionClass}`,
    `Compile ID: ${compilation.compileId}`,
    `Status: ${compilation.status === "no_changes" ? "NO CHANGES" : "READY FOR EXACT CONFIRMATION"}`,
    `Evidence gates: ${compilation.gateCount}`,
    `Alternative paths: ${compilation.hasAlternatives ? "YES" : "NO"}`,
    `Alternative acknowledgement required: ${compilation.requiresAlternativeAcknowledgement ? "YES" : "NO"}`,
    `Baseline policy hash: ${compilation.baseline.actionPolicySha256}`,
    `Candidate policy hash: ${compilation.candidate.actionPolicySha256}`,
    `Candidate logic hash: ${compilation.logic.candidateSha256}`,
    `Mandatory outside tree: ${compilation.mandatoryGates.join(", ")}`,
    "",
  ].join("\n");
}

function renderApply(result: ActionEvidenceLogicApplyResult): string {
  if (!result.applied) {
    return `${renderCompilation(result.compilation)}Result: NO CHANGES; no policy or evidence was written.\n`;
  }
  return [
    "AMC Action Policy Evidence Logic Applied",
    `Action class: ${result.compilation.actionClass}`,
    `Compile ID: ${result.compileId}`,
    `Logic hash: ${result.compilation.logic.candidateSha256}`,
    `Transparency hash: ${result.transparencyHash}`,
    `Audit event: ${result.auditEventId}`,
    "",
  ].join("\n");
}

function fail(error: unknown, json: boolean): void {
  const code = isActionEvidenceLogicError(error) ? error.code : "LOGIC_INVALID";
  const message = isActionEvidenceLogicError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : "Action Policy evidence-logic operation failed.";
  if (json) console.error(JSON.stringify({ ok: false, error: { code, message } }));
  else console.error(`Action Policy evidence logic blocked [${code}]: ${message}`);
  process.exitCode = 2;
}

export function registerActionEvidenceLogicCommands(policyAction: Command): void {
  const logic = policyAction
    .command("logic")
    .description("Compose existing Action Policy evidence requirements");

  logic
    .command("show")
    .description("Show declared evidence gates and effective logic")
    .argument("<actionClass>", "Existing AMC action class")
    .option("--json", "Output as JSON")
    .action((actionClass: string, options: { json?: boolean }) => {
      try {
        const inspection = inspectActionEvidenceLogic({ workspace: process.cwd(), actionClass });
        if (options.json) console.log(JSON.stringify(inspection, null, 2));
        else process.stdout.write(renderInspection(inspection));
      } catch (error) {
        fail(error, options.json === true);
      }
    });

  logic
    .command("compile")
    .description("Preview a deterministic evidence-logic change without writing")
    .argument("<actionClass>", "Existing AMC action class")
    .requiredOption("--file <path>", "JSON evidence-logic tree")
    .option("--json", "Output as JSON")
    .action((actionClass: string, options: { file: string; json?: boolean }) => {
      try {
        const compilation = compileActionEvidenceLogic({
          workspace: process.cwd(),
          actionClass,
          logic: readLogic(options.file),
        });
        if (options.json) console.log(JSON.stringify(compilation, null, 2));
        else process.stdout.write(renderCompilation(compilation));
      } catch (error) {
        fail(error, options.json === true);
      }
    });

  logic
    .command("apply")
    .description("Apply evidence logic after exact confirmation")
    .argument("<actionClass>", "Existing AMC action class")
    .requiredOption("--file <path>", "JSON evidence-logic tree")
    .requiredOption("--confirm <compileId>", "Exact compile ID returned by a fresh preview")
    .option("--acknowledge-alternatives", "Acknowledge that ANY creates alternative evidence paths")
    .option("--json", "Output as JSON")
    .action((actionClass: string, options: {
      file: string;
      confirm: string;
      acknowledgeAlternatives?: boolean;
      json?: boolean;
    }) => {
      try {
        const result = applyActionEvidenceLogic({
          workspace: process.cwd(),
          actionClass,
          logic: readLogic(options.file),
          confirmCompileId: options.confirm,
          acknowledgeAlternatives: options.acknowledgeAlternatives === true,
        });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else process.stdout.write(renderApply(result));
      } catch (error) {
        fail(error, options.json === true);
      }
    });
}
