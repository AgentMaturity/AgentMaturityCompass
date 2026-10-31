import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { publishOrgPairs, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyMechanicPair } from "./mechanicPairs.js";
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

function saveMechanicSimulation(workspace: string, simulation: MechanicSimulation): {
  path: string;
  sigPath: string;
} {
  const path = mechanicSimulationPath(workspace);
  return publishOrgPairs(workspace, [{ path, bytes: simulationBytes(simulation) }])[0]!;
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
  return verifyMechanicPair(workspace, path, "mechanic simulation missing");
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
  const simulation = calculateMechanicSimulation(params);
  return { simulation, ...saveMechanicSimulation(params.workspace, simulation) };
}

export function calculateMechanicSimulation(params: Parameters<typeof simulateMechanicPlan>[0]): MechanicSimulation {
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
    return simulation;
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
  return simulation;
}

function simulationBytes(simulation: MechanicSimulation): Buffer {
  return Buffer.from(`${JSON.stringify(mechanicSimulationSchema.parse(simulation), null, 2)}\n`, "utf8");
}
export async function prepareMechanicSimulation(workspace: string, simulation: MechanicSimulation, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const path = mechanicSimulationPath(workspace), bytes = simulationBytes(simulation), prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes }], options, previous);
  return { bytes: Buffer.from(bytes), assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}
