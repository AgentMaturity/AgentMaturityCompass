export type { CorrectionTriggerType, CorrectionStatus, CorrectionEvent, CorrectionEffectivenessReport } from "./correctionTypes.js";

export {
  initCorrectionTables,
  insertCorrection,
  updateCorrectionVerification,
  markLinkedEvidenceAsCorrected,
  getCorrectionsByAgent,
  getCorrectionsByQuestion,
  getPendingCorrections,
  getLastCorrectionHash,
  getCorrectionById,
  getVerifiedCorrections,
  getCorrectionsByTriggerType,
  getCorrectionsByWindow
} from "./correctionStore.js";

export {
  verifyCorrection,
  autoVerifyPendingCorrections,
  computeCorrectionHash,
  computeEffectivenessReport,
  type VerificationResult
} from "./correctionTracker.js";

export {
  checkClosureEligibility,
  getOpenFeedbackLoops,
  generateFeedbackClosureReport,
  renderFeedbackClosureReport,
  type FeedbackLoopStatus,
  type FeedbackClosureReport,
  type ClosureVerificationResult
} from "./feedbackClosure.js";
