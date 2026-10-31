/** Internal actual mechanic analysis reads; historical measurements are not re-run during output publication. */
import YAML from "yaml";
import { loadDiagnosticBank, diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { diagnosticBankSchema } from "../diagnostic/bank/bankSchema.js";
import { captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { calculateForecast } from "../forecast/forecastEngine.js";
import { canonicalize } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { buildGapAnalysis } from "./gapAnalysis.js";
import { mechanicEtaFromForecast, readMechanicCgxHash } from "./upgradePlanner.js";
export function captureMechanicAnalysisCgx(workspace: string, agentId: string) {
  const hash = readMechanicCgxHash(workspace, agentId);
  return { hash, assertCurrent() { if (readMechanicCgxHash(workspace, agentId) !== hash) throw new Error("selected mechanic CGX pack changed while signing"); } };
}
export function captureMechanicGap(input: Omit<Parameters<typeof buildGapAnalysis>[0], "readForecast">) {
  const used: { forecast?: ReturnType<typeof calculateForecast> } = {};
  const gap = buildGapAnalysis({ ...input, readForecast() {
    used.forecast = calculateForecast({ workspace: input.workspace, scope: { type: "WORKSPACE", id: "workspace" }, persist: false });
    return used.forecast.forecast;
  } });
  const forecast = used.forecast;
  if (forecast === undefined) throw new Error("mechanic gap did not select its forecast input");
  const original = canonicalize({ ...gap, generatedTs: 0 });
  return { gap, assertCurrent() {
    const next = buildGapAnalysis({ ...input, readForecast: forecast.readMechanicCurrent });
    if (canonicalize({ ...next, generatedTs: 0 }) !== original) throw new Error("selected mechanic gap inputs changed while signing");
  } };
}
export function captureMechanicEta(workspace: string) {
  let selected: ReturnType<typeof calculateForecast> | undefined;
  const read = () => {
    try {
      selected = calculateForecast({ workspace, scope: { type: "WORKSPACE", id: "workspace" }, persist: false });
      return mechanicEtaFromForecast(selected.forecast);
    } catch { return { status: "UNKNOWN" as const, reasons: ["forecast unavailable"] }; }
  };
  const eta = read(), original = canonicalize(eta), forecast = selected;
  return { eta, assertCurrent() {
    let next: typeof eta;
    if (forecast === undefined) next = read();
    else {
      try { next = mechanicEtaFromForecast(forecast.readMechanicCurrent()); }
      catch { next = { status: "UNKNOWN", reasons: ["forecast unavailable"] }; }
    }
    if (canonicalize(next) !== original) throw new Error("selected mechanic ETA input changed while signing");
  } };
}
