/** Metadata declarations select a source-owned case; expected results never become observations. */
import { z } from "zod";
import type { LoadedCatalog, LoadedFixture } from "../../catalog/loader.js";
import { fixtureEnvelopeSchema } from "../../catalog/schema.js";
import type { CompiledScenario } from "./types.js";
import { compileLegacyScenario, compileStationQuestion, benignRegistryFor } from "./routes.js";
const setupSchema = z.object({ synthetic: z.literal(true), metadataOnly: z.literal(true),
  execution: z.object({ scenarioId: z.string(), environmentId: z.string(), caseId: z.string() }).strict(),
  note: z.string().optional() }).strict();
const cases: Readonly<Record<string, { scenarioId: string; controlId: string; declaredEnvironment: string; profile: string | null; needsFaultWriter: boolean; benign?: boolean }>> = {
  "p227-minimum-declared-fields": {"scenarioId": "hc-zero-knowledge-prompt", "controlId": "L0-DAT-01", "declaredEnvironment": "phi-minimum-v1", "profile": "phi-minimum-v1", "needsFaultWriter": false},
  "p227-minimum-extra-identifier": {"scenarioId": "hc-zero-knowledge-prompt", "controlId": "L0-DAT-01", "declaredEnvironment": "phi-minimum-v1", "profile": "phi-minimum-v1", "needsFaultWriter": false},
  "p227-minimum-unknown-policy": {"scenarioId": "hc-zero-knowledge-prompt", "controlId": "L0-DAT-01", "declaredEnvironment": "phi-minimum-unknown-v1", "profile": "phi-minimum-unknown-v1", "needsFaultWriter": false},
  "p227-redacted-five-boundaries": {"scenarioId": "hc-phi-output-echo", "controlId": "L0-DAT-02", "declaredEnvironment": "phi-v1", "profile": "phi-v1", "needsFaultWriter": false},
  "p227-marker-five-boundaries": {"scenarioId": "hc-phi-output-echo", "controlId": "L0-DAT-02", "declaredEnvironment": "phi-v1", "profile": "phi-v1", "needsFaultWriter": false},
  "p227-unknown-phi-boundary": {"scenarioId": "hc-phi-output-echo", "controlId": "L0-DAT-02", "declaredEnvironment": "phi-incomplete-v1", "profile": "phi-incomplete-v1", "needsFaultWriter": false},
  "p227-allowlisted-redacted-send": {"scenarioId": "hc-dlp-blocking", "controlId": "L0-DAT-03", "declaredEnvironment": "phi-v1", "profile": "phi-v1", "needsFaultWriter": false},
  "p227-uncontracted-marker-send": {"scenarioId": "hc-dlp-blocking", "controlId": "L0-DAT-03", "declaredEnvironment": "phi-v1", "profile": "phi-v1", "needsFaultWriter": false},
  "p227-incomplete-processor-route": {"scenarioId": "hc-dlp-blocking", "controlId": "L0-DAT-03", "declaredEnvironment": "phi-incomplete-v1", "profile": "phi-incomplete-v1", "needsFaultWriter": false},
  "p227-isolation-meaningful-benign": {"scenarioId": "edu-record-isolation", "controlId": "L1-EDU-03", "declaredEnvironment": "ferpa-purpose-v1", "profile": "ferpa-purpose-v1", "needsFaultWriter": false, "benign": true},
  "p227-public-export-effect": {"scenarioId": "edu-record-isolation", "controlId": "L1-EDU-03", "declaredEnvironment": "ferpa-purpose-v1", "profile": "ferpa-purpose-v1", "needsFaultWriter": true},
  "p227-vendor-meaningful-benign": {"scenarioId": "edu-vendor-training-use", "controlId": "L1-EDU-03", "declaredEnvironment": "ferpa-purpose-v1", "profile": "ferpa-purpose-v1", "needsFaultWriter": false, "benign": true},
  "p227-vendor-training-export-effect": {"scenarioId": "edu-vendor-training-use", "controlId": "L1-EDU-03", "declaredEnvironment": "ferpa-purpose-v1", "profile": "ferpa-purpose-v1", "needsFaultWriter": true},
  "p227-unknown-export-purpose": {"scenarioId": "edu-vendor-training-use", "controlId": "L1-EDU-03", "declaredEnvironment": "ferpa-purpose-unknown-v1", "profile": "ferpa-purpose-unknown-v1", "needsFaultWriter": false},
  "p227-resolved-reason-lineage": {"scenarioId": "fin-decision-explainability", "controlId": "L0-EXP-01", "declaredEnvironment": "model-lineage-v1", "profile": "model-lineage-v1", "needsFaultWriter": false},
  "p227-unlinked-reasons-effect": {"scenarioId": "fin-decision-explainability", "controlId": "L0-EXP-01", "declaredEnvironment": "model-lineage-v1", "profile": "model-lineage-v1", "needsFaultWriter": false},
  "p227-missing-lineage-input": {"scenarioId": "fin-decision-explainability", "controlId": "L0-EXP-01", "declaredEnvironment": "model-lineage-missing-v1", "profile": "model-lineage-missing-v1", "needsFaultWriter": false},
  "p227-drift-alarm-effect": {"scenarioId": "fin-model-drift", "controlId": "L0-MON-01", "declaredEnvironment": "model-lineage-v1", "profile": "model-lineage-v1", "needsFaultWriter": false},
  "p227-drift-alarm-omitted": {"scenarioId": "fin-model-drift", "controlId": "L0-MON-01", "declaredEnvironment": "model-lineage-v1", "profile": "model-lineage-v1", "needsFaultWriter": false},
  "p227-missing-drift-input": {"scenarioId": "fin-model-drift", "controlId": "L0-MON-01", "declaredEnvironment": "model-lineage-missing-v1", "profile": "model-lineage-missing-v1", "needsFaultWriter": false},
  "p227-authorized-lot-disposition": {"scenarioId": "MOB-F3W-5", "controlId": "L1-MOB-01", "declaredEnvironment": "cold-chain-authorized-v1", "profile": "cold-chain-authorized-v1", "needsFaultWriter": false},
  "p227-quarantined-release-effect": {"scenarioId": "MOB-F3W-5", "controlId": "L1-MOB-01", "declaredEnvironment": "cold-chain-excursion-v1", "profile": "cold-chain-excursion-v1", "needsFaultWriter": true},
  "p227-missing-lot-samples": {"scenarioId": "MOB-F3W-5", "controlId": "L1-MOB-01", "declaredEnvironment": "cold-chain-missing-v1", "profile": "cold-chain-missing-v1", "needsFaultWriter": false},
  "p227-complete-genealogy-recall": {"scenarioId": "ENV-FF-16", "controlId": "L1-ENV-04", "declaredEnvironment": "recall-v1", "profile": "recall-v1", "needsFaultWriter": false},
  "p227-missed-shipment-recall": {"scenarioId": "ENV-FF-16", "controlId": "L1-ENV-04", "declaredEnvironment": "recall-v1", "profile": "recall-v1", "needsFaultWriter": false},
  "p227-incomplete-genealogy": {"scenarioId": "ENV-FF-16", "controlId": "L1-ENV-04", "declaredEnvironment": "recall-incomplete-v1", "profile": "recall-incomplete-v1", "needsFaultWriter": false},
  "known-answer-matches-actual-inputs": { scenarioId: "fin-numeric-accuracy", controlId: "L1-WLT-01", declaredEnvironment: "model-risk-v1", profile: "model-lineage-v1", needsFaultWriter: false },
  "incorrect-calculation-effect": { scenarioId: "fin-numeric-accuracy", controlId: "L1-WLT-01", declaredEnvironment: "model-risk-v1", profile: "model-lineage-v1", needsFaultWriter: false },
  "missing-numeric-input": { scenarioId: "fin-numeric-accuracy", controlId: "L1-WLT-01", declaredEnvironment: "model-risk-v1", profile: "model-lineage-missing-v1", needsFaultWriter: false },
  "consent-version-correction-valid": { scenarioId: "HLT-CT-2", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-v1", needsFaultWriter: false },
  "configured-trigger-reported-on-time": { scenarioId: "HLT-CT-1", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-v1", needsFaultWriter: false },
  "late-report-effect": { scenarioId: "HLT-CT-1", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-late-event-v1", needsFaultWriter: false },
  "unknown-jurisdiction-trigger": { scenarioId: "HLT-CT-1", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-unknown-v1", needsFaultWriter: false },
  "missing-consent-effect": { scenarioId: "HLT-CT-2", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-v1", needsFaultWriter: true },
  "unsigned-correction-effect": { scenarioId: "HLT-CT-2", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-v1", needsFaultWriter: true },
  "wrong-protocol-version-effect": { scenarioId: "HLT-CT-2", controlId: "L1-HLT-01", declaredEnvironment: "clinical-trials-v1", profile: "clinical-v1", needsFaultWriter: true },
  "pinned-boundary-authorized-fuel-use": { scenarioId: "MOB-SP-10", controlId: "L1-MOB-07", declaredEnvironment: "recall-sulphur-v1", profile: "sulphur-exception-v1", needsFaultWriter: false },
  "known-limit-exceeded-effect": { scenarioId: "MOB-SP-10", controlId: "L1-MOB-07", declaredEnvironment: "recall-sulphur-v1", profile: "sulphur-v1", needsFaultWriter: false },
  "unknown-boundary-version": { scenarioId: "MOB-SP-10", controlId: "L1-MOB-07", declaredEnvironment: "recall-sulphur-v1", profile: "sulphur-unknown-v1", needsFaultWriter: false },
  "unknown-exception-authority": { scenarioId: "MOB-SP-10", controlId: "L1-MOB-07", declaredEnvironment: "recall-sulphur-v1", profile: "sulphur-unknown-exception-v1", needsFaultWriter: false },
};
export function loadExecutedFixtureDeclaration(loaded: LoadedFixture, catalog: LoadedCatalog):
  { ok: true; kind: "declaration_only"; fixtureSha256: string; caseId: string; compiled: CompiledScenario;
    needsFaultWriter: boolean; expectedForAssertionOnly: unknown } | { ok: false; reason: string } {
  const envelope = fixtureEnvelopeSchema.safeParse(loaded.envelope);
  if (!envelope.success) return { ok: false, reason: "invalid_fixture_envelope" };
  const setup = setupSchema.safeParse(envelope.data.setup);
  if (!setup.success) return { ok: false, reason: "not_an_executed_fixture_declaration" };
  const entry = setup.data.execution, definition = cases[entry.caseId];
  if (!definition || definition.scenarioId !== entry.scenarioId || definition.controlId !== envelope.data.controlId ||
      definition.declaredEnvironment !== entry.environmentId || !loaded.path.startsWith(`fixtures/${definition.controlId}/`)) {
    return { ok: false, reason: "fixture_case_subject_mismatch" };
  }
  if (definition.profile === null) return { ok: false, reason: "unknown_authority_fact_adapter_unavailable" };
  const legacyPacks: Readonly<Record<string, string>> = { "hc-zero-knowledge-prompt": "healthcarePHI", "hc-phi-output-echo": "healthcarePHI",
    "hc-dlp-blocking": "healthcarePHI", "edu-record-isolation": "educationFERPA", "edu-vendor-training-use": "educationFERPA",
    "fin-decision-explainability": "financialModelRisk", "fin-numeric-accuracy": "financialModelRisk", "fin-model-drift": "financialModelRisk" };
  const packId = legacyPacks[entry.scenarioId];
  const result = packId ? compileLegacyScenario(packId, entry.scenarioId, catalog, 1) : compileStationQuestion(entry.scenarioId, catalog, 1);
  if (!result.ok) return result;
  let compiled = result.compiled;
  if (definition.benign) {
    const benign = compiled.scenario.benignControl === null ? undefined : benignRegistryFor(compiled).get(compiled.scenario.benignControl);
    if (!benign) return { ok: false, reason: "fixture_benign_case_unavailable" };
    compiled = benign;
  }
  if (compiled.controlId !== definition.controlId) return { ok: false, reason: "fixture_case_control_mismatch" };
  compiled.scenario.fixture.environment = definition.profile;
  return { ok: true, kind: "declaration_only", fixtureSha256: loaded.sha256, caseId: entry.caseId, compiled,
    needsFaultWriter: definition.needsFaultWriter, expectedForAssertionOnly: envelope.data.expected };
}
