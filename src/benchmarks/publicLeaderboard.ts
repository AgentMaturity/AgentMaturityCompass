import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createHFAutoPublishPlan,
  type HFAutoPublishPlan,
  type HFDatasetPublishOptions
} from "./huggingFacePublisher.js";
import {
  pseudonymizeAgentId,
  type GlobalIndexEntry
} from "./globalIndex.js";

export type PublicLeaderboardBundle = {
  entries: GlobalIndexEntry[];
  publishPlan: HFAutoPublishPlan;
};

export type PublicLeaderboardBundleInput = {
  workspace: string;
  pseudonymSalt?: string;
  includeModelFamily?: boolean;
  datasetId?: string;
  prettyName?: string;
  license?: string;
  amcVersion?: string;
  minAgents?: number;
  includeProviderId?: boolean;
};

type RunLayerScore = {
  layerName?: string;
  name?: string;
  avgFinalLevel?: number;
  score?: number;
};

type LatestRun = {
  integrityIndex?: number;
  layerScores?: RunLayerScore[];
  trustLabel?: string;
  status?: string;
  ts?: number | string;
  questionScores?: unknown[];
  questionsAnswered?: number;
  questionCount?: number;
  modelFamily?: string;
  providerId?: string;
};

function readLatestRun(workspace: string, agentId: string): LatestRun | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!existsSync(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir).filter((file) => file.endsWith(".json")).sort();
  const latestFile = files.at(-1);
  if (!latestFile) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(join(runsDir, latestFile), "utf8")) as LatestRun;
  } catch {
    return null;
  }
}

function layerScoresToRecord(layers: RunLayerScore[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const layer of layers ?? []) {
    const name = layer.layerName ?? layer.name;
    const value = layer.avgFinalLevel ?? layer.score;
    if (name && typeof value === "number" && Number.isFinite(value)) {
      out[name] = Number(value.toFixed(3));
    }
  }
  return out;
}

function runCompositeScore(run: LatestRun): number {
  if (typeof run.integrityIndex === "number" && Number.isFinite(run.integrityIndex)) {
    return Number((Math.max(0, Math.min(1, run.integrityIndex)) * 100).toFixed(2));
  }
  const scores = Object.values(layerScoresToRecord(run.layerScores));
  if (scores.length === 0) {
    return 0;
  }
  const avgLevel = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Number((Math.max(0, Math.min(5, avgLevel)) * 20).toFixed(2));
}

function questionsAnswered(run: LatestRun): number {
  if (typeof run.questionsAnswered === "number") {
    return run.questionsAnswered;
  }
  if (Array.isArray(run.questionScores)) {
    return run.questionScores.length;
  }
  if (typeof run.questionCount === "number") {
    return run.questionCount;
  }
  return 0;
}

function assessedAt(run: LatestRun): string {
  if (typeof run.ts === "string") {
    return run.ts;
  }
  if (typeof run.ts === "number" && Number.isFinite(run.ts)) {
    return new Date(run.ts).toISOString();
  }
  return new Date().toISOString();
}

export function collectPublicLeaderboardEntries(input: PublicLeaderboardBundleInput): GlobalIndexEntry[] {
  const agentsDir = join(input.workspace, ".amc", "agents");
  if (!existsSync(agentsDir)) {
    return [];
  }

  const salt = input.pseudonymSalt ?? "amc-public-leaderboard";
  const entries = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .flatMap((agentId): GlobalIndexEntry[] => {
      const latest = readLatestRun(input.workspace, agentId);
      if (!latest) {
        return [];
      }
      return [{
        agentPseudonym: pseudonymizeAgentId(agentId, salt),
        amcVersion: input.amcVersion ?? "1.0.0",
        compositeScore: runCompositeScore(latest),
        layerScores: layerScoresToRecord(latest.layerScores),
        trustLabel: latest.trustLabel ?? latest.status ?? "UNSPECIFIED",
        modelFamily: input.includeModelFamily ? latest.modelFamily : undefined,
        providerId: input.includeProviderId ? latest.providerId : undefined,
        assessedAt: assessedAt(latest),
        questionsAnswered: questionsAnswered(latest),
        privacyTier: "pseudonymized"
      }];
    });

  return entries.sort((a, b) => b.compositeScore - a.compositeScore);
}

export function buildPublicLeaderboardBundle(input: PublicLeaderboardBundleInput): PublicLeaderboardBundle {
  const entries = collectPublicLeaderboardEntries(input);
  const minAgents = input.minAgents ?? 5;
  if (entries.length < minAgents) {
    throw new Error(`Public leaderboard export requires at least ${minAgents} scored agents; found ${entries.length}. Use a lower --min-agents only for private review.`);
  }

  const publishOptions: HFDatasetPublishOptions = {
    datasetId: input.datasetId ?? "AgentMaturity/amc-global-index",
    prettyName: input.prettyName ?? "AMC Global Index",
    license: input.license ?? "apache-2.0",
    amcVersion: input.amcVersion ?? "1.0.0",
    private: false,
    description: [
      "An anonymized Agent Maturity Compass public leaderboard export.",
      "Rows are pseudonymized and intended for aggregate procurement comparison, not re-identification."
    ].join(" ")
  };

  return {
    entries,
    publishPlan: createHFAutoPublishPlan(entries, publishOptions)
  };
}

export function writePublicLeaderboardBundle(outputDir: string, bundle: PublicLeaderboardBundle): string[] {
  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(bundle.publishPlan.files)) {
    const target = join(outputDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    written.push(target);
  }
  return written;
}
