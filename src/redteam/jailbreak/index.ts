/**
 * Jailbreak Detection & Testing Module
 *
 * Comprehensive jailbreak testing for AI agents covering:
 *  - DAN (Do Anything Now) prompts
 *  - Roleplaying exploits
 *  - System prompt override attempts
 *  - Instruction hierarchy attacks
 *  - Persona manipulation
 *  - TAP (Tree of Attacks with Pruning) automated attack refinement
 */

// Attack library
export {
  listAttacks,
  getAttack,
  getAttacksByCategory,
  getAttacksByTag,
  renderAttackPrompt,
  type JailbreakAttack,
  type JailbreakCategory,
} from "./attacks.js";

// Detection engine
export {
  detectJailbreak,
  detectJailbreakBatch,
  type JailbreakVerdict,
  type DetectionSignal,
} from "./detector.js";

// Output normalization
export {
  normalizeResponse,
  getComplianceText,
  type NormalizedResponse,
} from "./normalizer.js";

// TAP implementation
export {
  runTAP,
  renderTAPMarkdown,
  DEFAULT_TAP_CONFIG,
  type TAPConfig,
  type TAPNode,
  type TAPResult,
  type RunTAPInput,
} from "./tap.js";

// Test runner
export {
  runJailbreakTests,
  renderJailbreakMarkdown,
  type JailbreakTestResult,
  type JailbreakReport,
  type JailbreakSummary,
  type RunJailbreakTestInput,
} from "./runner.js";
