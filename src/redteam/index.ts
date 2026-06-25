export { runRedTeam, renderRedTeamMarkdown, scoreRedTeamCvss } from "./runner.js";
export type {
  RedTeamReport,
  RedTeamVulnerability,
  RedTeamPluginResult,
  RedTeamEvilMcpResult,
  RedTeamCvssScore,
  RedTeamCvssMetrics,
  RedTeamCvssQualitativeRating,
  RunRedTeamInput,
} from "./runner.js";
export { listStrategies, getStrategy, resolveStrategies } from "./strategies.js";
export type { RedTeamStrategy } from "./strategies.js";

// Attack Plugins
export {
  listAttackPlugins,
  getAttackPlugin,
  runAttackPlugins,
  renderAttackPluginReport,
} from "./attackPlugins.js";
export type {
  AttackPlugin,
  AttackPluginResult,
  AttackPluginReport,
  AttackContext,
} from "./attackPlugins.js";

// MCP Agent Provider — red team testing against evil MCP servers
export {
  runMCPAgentRedTeam,
  renderMCPAgentRedTeamMarkdown,
  buildEvilTools,
  buildScenarios,
  listMCPAttackCategories,
  normalizeMCPAttackCategories,
} from "./mcpAgentProvider.js";

export type {
  MCPAgentRedTeamReport,
  MCPAgentScenario,
  EvilToolDefinition,
  MCPAttackCategory,
  MCPAttackCategoryFilter,
  RecordedToolCall,
  ScenarioResult,
  RunMCPAgentRedTeamInput,
} from "./mcpAgentProvider.js";

// Jailbreak Detection & Testing Module
export {
  // Attack library
  listAttacks,
  getAttack,
  getAttacksByCategory,
  getAttacksByTag,
  renderAttackPrompt,
  // Detection engine
  detectJailbreak,
  detectJailbreakBatch,
  // TAP
  runTAP,
  renderTAPMarkdown,
  DEFAULT_TAP_CONFIG,
  // Test runner
  runJailbreakTests,
  renderJailbreakMarkdown,
} from "./jailbreak/index.js";

export type {
  JailbreakAttack,
  JailbreakCategory,
  JailbreakVerdict,
  DetectionSignal,
  TAPConfig,
  TAPNode,
  TAPResult,
  RunTAPInput,
  JailbreakTestResult,
  JailbreakReport,
  JailbreakSummary,
  RunJailbreakTestInput,
} from "./jailbreak/index.js";

export {
  PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION,
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "./promptInjectionRegressionSuite.js";
export type {
  PromptInjectionRegressionDecision,
  PromptInjectionRegressionFixtureInput,
  PromptInjectionRegressionFixtureStatus,
  PromptInjectionRegressionRowStatus,
  PromptInjectionRegressionSourceMetadata,
  PromptInjectionRegressionSuiteCoverage,
  PromptInjectionRegressionSuiteInput,
  PromptInjectionRegressionSuiteReceipt,
  PromptInjectionRegressionSuiteRow,
  PromptInjectionRegressionSuiteStatus,
  PromptInjectionRegressionSuiteVerification,
  PromptInjectionRegressionVector,
} from "./promptInjectionRegressionSuite.js";

export {
  RED_TEAM_EXPLOIT_LEDGER_SCHEMA_VERSION,
  buildRedTeamExploitLedgerReceipt,
  renderRedTeamExploitLedgerMarkdown,
  verifyRedTeamExploitLedgerReceipt,
} from "./exploitLedger.js";
export type {
  RedTeamExploitLedgerInput,
  RedTeamExploitLedgerReceipt,
  RedTeamExploitLedgerRow,
  RedTeamExploitLedgerRowStatus,
  RedTeamExploitLedgerSourceMetadata,
  RedTeamExploitLedgerStatus,
  RedTeamExploitLedgerVerification,
  RedTeamExploitRecordInput,
  RedTeamExploitReproducibility,
  RedTeamExploitRetestStatus,
  RedTeamExploitSeverity,
} from "./exploitLedger.js";
