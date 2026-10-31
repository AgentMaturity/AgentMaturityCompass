/** Fixed actual bank prerequisite for mechanic planning; captures consumed bytes before earlier target waits. */
import YAML from "yaml";
import { diagnosticBankPath, prepareDiagnosticBankAsync, captureDiagnosticBankInput } from "../diagnostic/bank/bankLoader.js";
import { diagnosticBankSchema } from "../diagnostic/bank/bankSchema.js";
import { defaultDiagnosticBankV1 } from "../diagnostic/bank/bankV1.js";
import { captureOrgFiles, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";

export function captureMechanicAnalysisBankAttempt(workspace: string) {
  const path = diagnosticBankPath(workspace), before = captureDiagnosticBankInput(workspace), bytes = orgPairBytes(before, path);
  const bank = diagnosticBankSchema.parse(bytes === null ? defaultDiagnosticBankV1() : YAML.parse(bytes.toString("utf8")) as unknown);
  const project = (value: typeof bank, questionIds: readonly string[]) => {
    const byId = new Map(value.diagnosticBank.questions.map(row => [row.qId, row]));
    return canonicalize({ version: value.diagnosticBank.version, selected: questionIds.map(qId => ({ qId, hints: byId.get(qId)?.upgradeHints ?? null })) });
  };
  return { async initialize(options: OrgPairsOptions) {
    const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
    let publishedCurrent = () => {}, completedPaths: readonly string[] = [];
    const fixed = () => { assertInputsCurrent?.(); beforePublish?.(); publishedCurrent(); };
    if (bytes === null) {
      const prepared = await prepareDiagnosticBankAsync(workspace, bank, options, before), saved = prepared.publish()[0]!;
      publishedCurrent = prepared.assertCurrent; completedPaths = Object.freeze([saved.path, saved.sigPath]);
    }
    return { bank, completedPaths, assertCurrent(questionIds: readonly string[]) {
      fixed();
      const current = orgPairBytes(captureOrgFiles([path]), path);
      if (current === null) throw new Error("selected mechanic diagnostic bank is missing");
      const parsed = diagnosticBankSchema.parse(YAML.parse(current.toString("utf8")) as unknown);
      if (project(parsed, questionIds) !== project(bank, questionIds)) throw new Error("selected mechanic bank version or upgrade hints changed while signing");
    } };
  } };
}
