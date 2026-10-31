import type { loadRunReport } from "../diagnostic/runner.js";
import type { loadLatestOrgScorecard } from "../org/orgScorecard.js";

export function byDimensionFromRun(run: ReturnType<typeof loadRunReport>): {
  DIM1: number | null;
  DIM2: number | null;
  DIM3: number | null;
  DIM4: number | null;
  DIM5: number | null;
} {
  const out = {
    DIM1: null as number | null,
    DIM2: null as number | null,
    DIM3: null as number | null,
    DIM4: null as number | null,
    DIM5: null as number | null
  };
  for (const layer of run.layerScores) {
    if (layer.layerName === "Strategic Agent Operations") {
      out.DIM1 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Leadership & Autonomy") {
      out.DIM2 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Culture & Alignment") {
      out.DIM3 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Resilience") {
      out.DIM4 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Skills") {
      out.DIM5 = Number(layer.avgFinalLevel.toFixed(6));
    }
  }
  return out;
}

export function byDimensionFromOrgNode(node: NonNullable<ReturnType<typeof loadLatestOrgScorecard>>["nodes"][number]): {
  DIM1: number | null;
  DIM2: number | null;
  DIM3: number | null;
  DIM4: number | null;
  DIM5: number | null;
} {
  const out = {
    DIM1: null as number | null,
    DIM2: null as number | null,
    DIM3: null as number | null,
    DIM4: null as number | null,
    DIM5: null as number | null
  };
  for (const layer of node.layerScores) {
    if (layer.layerName === "Strategic Agent Operations") {
      out.DIM1 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Leadership & Autonomy") {
      out.DIM2 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Culture & Alignment") {
      out.DIM3 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Resilience") {
      out.DIM4 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Skills") {
      out.DIM5 = Number(layer.median.toFixed(6));
    }
  }
  return out;
}

