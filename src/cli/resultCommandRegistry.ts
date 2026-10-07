/**
 * Every CLI command that prints a score, level, verdict, compliance status, certificate, passport, bundle
 * verification or attestation (P0-22). Each one prints a claim label (src/cli/claimOutput.ts); the postAction
 * hook (src/cli/claimLabelHooks.ts) enforces it. A new result command must be added here, or to
 * NON_RESULT_COMMANDS with the reason it prints no result. See docs/CLAIM_KINDS.md, "CLI and reports".
 */
import type { ClaimKind } from "../claims/eligibility/types.js";

export interface ResultCommand {
  /** The registered command path, e.g. "score fail-secure". */
  readonly path: string;
  /** The `provenance.producer` the command's envelope carries. */
  readonly producer: string;
  /** The kind the command prints when nothing stronger is proven. */
  readonly defaultKind: ClaimKind;
}

export interface NonResultCommand {
  readonly path: string;
  readonly reason: string;
}

const self = (path: string, producer: string): ResultCommand => ({ path, producer, defaultKind: "self_reported" });
const example = (path: string, producer: string): ResultCommand => ({ path, producer, defaultKind: "synthetic_example" });

export const RESULT_COMMANDS: readonly ResultCommand[] = [
  // Scores and levels
  self("quickscore", "diagnostic:quickscore"),
  self("run", "unified:run"),
  self("report", "diagnostic"),
  self("why-capped", "diagnostic"),
  self("unknowns", "diagnostic:knownUnknowns"),
  self("meta-confidence", "diagnostic:metaConfidence"),
  self("confidence-drift", "claims:confidenceDrift"),
  self("agent diagnose", "studio:diagnostic-self-run"),
  self("eval run", "diagnostic"),
  self("eval status", "eval:status"),
  self("executive brief", "diagnostic"),
  self("memory assess", "score:memoryMaturity"),
  self("score", "score:quickScore"),
  self("score formal-spec", "score:formalSpec"),
  self("score adversarial", "score:gamingResistanceTest"),
  self("score collect-evidence", "score:evidenceCollector"),
  self("score production-ready", "score:productionReadiness"),
  self("score operational-independence", "score:operationalIndependence"),
  self("score behavioral-contract", "score:behavioralContractMaturity"),
  self("score fail-secure", "score:failSecureGovernance"),
  self("score output-integrity", "score:outputIntegrityMaturity"),
  self("score state-portability", "score:agentStatePortability"),
  self("score eu-ai-act", "score:euAIActCompliance"),
  self("score owasp-llm", "score:owaspLLMCoverage"),
  self("score regulatory-readiness", "score:regulatoryReadiness"),
  self("score self-knowledge", "score:selfKnowledgeMaturity"),
  self("score kernel-sandbox", "score:kernelSandboxMaturity"),
  self("score runtime-identity", "score:runtimeIdentityMaturity"),
  self("score calibration-gap", "score:calibrationGap"),
  self("score evidence-conflict", "score:evidenceConflict"),
  self("score density-map", "score:densityMap"),
  self("score evidence-ingest", "score:evidenceIngestion"),
  self("score level-transition", "score:levelTransition"),
  self("score gaming-resistance", "score:gamingResistance"),
  self("score sleeper-detection", "score:sleeperDetection"),
  self("score audit-depth", "score:auditDepth"),
  self("score policy-consistency", "score:policyConsistency"),
  self("score autonomy-duration", "score:autonomyDuration"),
  self("score pause-quality", "score:pauseQuality"),
  self("score task-horizon", "score:taskHorizon"),
  self("score factuality", "score:factuality"),
  self("score alignment-index", "score:alignmentIndex"),
  self("score interpretability", "score:interpretability"),
  self("score faithfulness", "score:faithfulness"),
  self("score a2a-protocol", "score:a2aProtocol"),
  self("score distributed-agents", "score:distributedAgents"),
  self("score memory-integrity", "score:memoryIntegrity"),
  self("score memory-depth", "score:memoryDepth"),
  self("score output-attestation", "score:outputAttestation"),
  self("score mutual-verification", "score:mutualVerification"),
  self("score transparency-log", "score:networkTransparencyLog"),
  self("score tier", "score:quickScore"),
  self("score industry-adjust", "score:industryAdjusted"),
  self("score industry-benchmark", "score:industryBenchmark"),
  self("score simulation-lane", "lanes:simulationForecast"),
  self("score safety-research", "lanes:safetyResearch"),
  self("dag score", "score:orchestrationDAG"),
  // Leaderboards and business
  self("leaderboard show", "leaderboard"),
  self("leaderboard export", "leaderboard"),
  self("leaderboard public-export", "leaderboard:public-export"),
  self("business risk", "business:riskQuantification"),
  self("business grc-export", "business:grcTreatmentPlan"),
  self("business report", "business:impactReport"),
  // Imports
  self("eval import", "eval:import")
];

export const NON_RESULT_COMMANDS: readonly NonResultCommand[] = [
  { path: "history", reason: "lists run IDs, times and signature statuses; no score or level (amc report <runId> labels each run)" },
  { path: "score lean-profile", reason: "describes AMC's lean module profile; no agent is assessed" },
  { path: "score evidence-coverage", reason: "counts which AMC questions have automated evidence sources; no agent is assessed" },
  { path: "score industry-list", reason: "lists the built-in industry trust models; reference data, not a result" }
];

export const RESULT_COMMAND_PATHS: ReadonlySet<string> = new Set(RESULT_COMMANDS.map((command) => command.path));
