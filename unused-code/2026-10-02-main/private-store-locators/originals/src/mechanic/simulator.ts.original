import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { mechanicSimulationSchema, type MechanicSimulation } from "./mechanicSchema.js";
import { aggregateProjectedEffects } from "./simulatorModels.js";
import { mechanicSimulatorGate } from "./simulatorEvidenceGates.js";
import type { MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { mechanicRoot } from "./targetsStore.js";

export function mechanicSimulationPath(workspace: string): string {
  return join(mechanicRoot(workspace), "simulations", "latest.json");
}

export function loadLatestMechanicSimulation(workspace: string): MechanicSimulation | null {
  const path = mechanicSimulationPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  return mechanicSimulationSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function saveMechanicSimulation(workspace: string, simulation: MechanicSimulation): {
  path: string;
  sigPath: string;
} {
  const path = mechanicSimulationPath(workspace);
  ensureDir(join(mechanicRoot(workspace), "simulations"));
  writeFileAtomic(path, `${JSON.stringify(mechanicSimulationSchema.parse(simulation), null, 2)}\n`, 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function verifyMechanicSimulationSignature(workspace: string) {
  const path = mechanicSimulationPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "mechanic simulation missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function simulateMechanicPlan(params: {
  workspace: string;
  plan: MechanicUpgradePlan;
  integrityIndex: number;
  correlationRatio: number;
}): {
  simulation: MechanicSimulation;
  path: string;
  sigPath: string;
} {
  const gate = mechanicSimulatorGate({
    integrityIndex: params.integrityIndex,
    correlationRatio: params.correlationRatio
  });

  const actions = params.plan.phases.flatMap((phase) => phase.actions);
  const kinds = actions.map((action) => action.kind);

  if (!gate.ok) {
    const simulation = mechanicSimulationSchema.parse({
      v: 1,
      simulationId: `sim_${randomUUID().replace(/-/g, "")}`,
      generatedTs: Date.now(),
      scope: params.plan.scope,
      status: "INSUFFICIENT_EVIDENCE",
      reasons: gate.reasons,
      candidates: [
        {
          candidateId: "candidate-main",
          actions: actions.map((action) => ({ id: action.id, kind: action.kind })),
          projected: {
            tradeoffs: ["Insufficient evidence gates prevent numeric projections."]
          },
          honestyNotes: [
            "Projection disabled because integrity/correlation gates were not met.",
            "Collect observed evidence before relying on simulation output."
          ]
        }
      ]
    });
    const saved = saveMechanicSimulation(params.workspace, simulation);
    return {
      simulation,
      ...saved
    };
  }

  const effect = aggregateProjectedEffects(kinds);
  const simulation = mechanicSimulationSchema.parse({
    v: 1,
    simulationId: `sim_${randomUUID().replace(/-/g, "")}`,
    generatedTs: Date.now(),
    scope: params.plan.scope,
    status: "OK",
    reasons: [],
    candidates: [
      {
        candidateId: "candidate-main",
        actions: actions.map((action) => ({ id: action.id, kind: action.kind })),
        projected: {
          evidenceCoverageDelta: effect.evidenceCoverageDelta,
          maturityDeltaBand: {
            low: effect.maturity.low,
            mid: effect.maturity.mid,
            high: effect.maturity.high
          },
          riskIndexDeltaBand: {
            low: effect.risk.low,
            mid: effect.risk.mid,
            high: effect.risk.high
          },
          valueDeltaBand: {
            low: effect.value.low,
            mid: effect.value.mid,
            high: effect.value.high
          },
          tradeoffs: effect.tradeoffs
        },
        honestyNotes: [
          "Projection assumes listed actions complete successfully and evidence checkpoints are collected.",
          "Measured maturity will not increase until a fresh evidence-derived diagnostic run confirms improvements."
        ]
      }
    ]
  });
  const saved = saveMechanicSimulation(params.workspace, simulation);
  return {
    simulation,
    ...saved
  };
}
