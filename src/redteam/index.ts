export { runRedTeam, renderRedTeamMarkdown } from "./runner.js";
export type { RedTeamReport, RedTeamVulnerability, RedTeamPluginResult, RunRedTeamInput } from "./runner.js";
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
} from "./mcpAgentProvider.js";

export type {
  MCPAgentRedTeamReport,
  MCPAgentScenario,
  EvilToolDefinition,
  MCPAttackCategory,
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
