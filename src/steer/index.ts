export {
  createSteerPipeline,
} from "./pipeline.js";

export {
  classifySteerContext,
  createAutotuneStage,
  getAutotuneProfile,
} from "./autotune.js";

export {
  applyFeedbackObservation,
  createFeedbackLoopState,
  defaultFeedbackLoopConfig,
  getFeedbackAdjustedProfile,
} from "./feedbackLoop.js";

export type {
  AutotuneProfile,
  CreateAutotuneStageOptions,
  SteerContextClassification,
  SteerContextType,
} from "./autotune.js";

export type {
  FeedbackAdjustedAutotuneProfile,
  FeedbackLoopConfig,
  FeedbackLoopState,
  FeedbackObservation,
} from "./feedbackLoop.js";

export {
  createHygieneStage,
  directMode,
  stripHedges,
  stripPreamble,
} from "./hygiene.js";

export type {
  HygieneOptions,
} from "./hygiene.js";

export type {
  CreateSteerPipelineOptions,
  SteerPipeline,
  SteerRequestContext,
  SteerResponseContext,
  SteerStage,
} from "./types.js";

export { microScore } from "./microScore.js";
export type { MicroScoreResult, MicroScoreOptions } from "./microScore.js";

export { raceModels, createRaceStage } from "./race.js";
export type { RaceCandidate, RaceResult, RaceOptions } from "./race.js";

export {
  createLiquidStreamState,
  ingestDelta,
  flushRemaining,
  parseSSEDelta,
  createLiquidStage,
} from "./liquid.js";
export type { LiquidChunk, LiquidStreamState, LiquidOptions } from "./liquid.js";

export {
  generateCombinations,
  analyzeParameterSensitivity,
  buildMatrixRequestBody,
  buildMatrixReport,
} from "./parameterMatrix.js";
export type {
  ParameterRange,
  ParameterCombination,
  MatrixRunResult,
  MatrixReport,
  MatrixOptions,
} from "./parameterMatrix.js";

export {
  sanitizeTelemetryEvent,
  validatePrivacyCompliance,
} from "./privacyTiers.js";
export type {
  PrivacyTier,
  TelemetryEvent,
  SanitizedTelemetryEvent,
  PrivacyConfig,
} from "./privacyTiers.js";

export {
  STEER_CLI_COMMANDS,
  STEER_STUDIO_PANELS,
  generateSteerHelp,
  generateCommandHelp,
} from "./thermostatCLI.js";
export type { SteerCLICommand, StudioPanel } from "./thermostatCLI.js";
