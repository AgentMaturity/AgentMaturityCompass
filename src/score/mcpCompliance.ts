/**
 * MCP Compliance Scoring — Model Context Protocol
 *
 * MCP was donated to the Linux Foundation's Agentic AI Foundation.
 * It is becoming the industry standard for agent interoperability.
 * AMC scores agents against MCP compliance to position AMC as
 * the quality layer on top of the open agent ecosystem.
 */

export interface MCPComplianceCheck {
  id: string;
  name: string;
  description: string;
  weight: number;
  required: boolean;
}

export interface MCPSafetyDimensionResult {
  score: number;
  passedChecks: string[];
  failedChecks: string[];
  warnings: string[];
}

export interface MCPSafetyScorecard {
  overall: number;
  toolCallSafetyValidation: MCPSafetyDimensionResult;
  mcpServerTrust: MCPSafetyDimensionResult;
  promptInjectionDefense: MCPSafetyDimensionResult;
  permissionScopeEnforcement: MCPSafetyDimensionResult;
}

export interface MCPPromptInjectionSignal {
  messageIndex: number;
  patternId: string;
  excerpt: string;
}

export interface MCPPromptInjectionDetectionResult {
  detected: boolean;
  severity: "none" | "low" | "medium" | "high";
  signals: MCPPromptInjectionSignal[];
}

export interface MCPComplianceResult {
  score: number;            // 0–100
  level: 'full' | 'partial' | 'minimal' | 'non-compliant';
  passed: string[];
  failed: string[];
  warnings: string[];
  recommendations: string[];
  badge: 'MCP-Certified' | 'MCP-Compatible' | 'MCP-Aware' | 'Not-MCP';
  safety: MCPSafetyScorecard;
  promptInjection: MCPPromptInjectionDetectionResult;
}

export interface MCPCapabilityDeclaration {
  // Protocol basics
  supportsMcpProtocol: boolean;
  mcpVersion?: string;                    // e.g. "2024-11-05"

  // Tools
  declaresToolManifest: boolean;          // exposes tools/list endpoint
  toolsHaveInputSchemas: boolean;         // each tool has JSON Schema input
  toolsHaveDescriptions: boolean;         // tools have human-readable descriptions

  // Resources
  declaresResources: boolean;             // exposes resources/list
  resourcesHaveUris: boolean;             // resources have URI templates

  // Prompts
  declaresPrompts: boolean;               // exposes prompts/list

  // Sampling
  supportsSampling: boolean;              // implements sampling/createMessage

  // Transport
  supportsStdio: boolean;                 // stdio transport
  supportsHttp: boolean;                  // HTTP + SSE transport

  // Security
  validatesInputs: boolean;              // validates tool call inputs against schema
  validatesOutputs?: boolean;            // validates tool call outputs against schema
  validatesToolOutputsAgainstSchema?: boolean; // alias for compatibility
  limitsCapabilities: boolean;           // follows least-privilege for tool exposure
  supportsOauth: boolean;                // OAuth 2.0 authorization
  verifiesMcpServerIdentity?: boolean;   // verifies server identity (cert pinning, attestation)
  enforcesTrustedMcpServers?: boolean;   // only allow trusted/allowlisted MCP servers
  usesSignedMcpServerMetadata?: boolean; // verifies signed manifests/capabilities
  detectsPromptInjectionViaMcp?: boolean; // detects prompt injection in MCP payloads
  blocksPromptInjectionAttempts?: boolean; // blocks suspicious MCP payloads
  sanitizesMcpToolContent?: boolean;      // strips/neutralizes unsafe instructions
  declaredPermissionScopes?: string[];    // declared scope inventory
  enforcesToolPermissionScopes?: boolean; // enforces scope checks on each tool call
  hasDenyByDefaultScopes?: boolean;       // deny by default unless scope is granted
  mapsToolsToLeastPrivilegeScopes?: boolean; // per-tool least privilege mapping
  observedMcpMessages?: string[];         // optional runtime samples for injection scan

  // AMC-native additions
  emitsReceiptsOnToolCall: boolean;      // AMC: signs every tool call with receipt
  supportsPolicyGates: boolean;          // AMC: Governor can block tool calls
  hasAuditLog: boolean;                  // AMC: tool calls are audit-logged
}

interface WeightedMCPComplianceCheck extends MCPComplianceCheck {
  category: "core" | "transport" | "safety" | "governance";
}

const COMPLIANCE_CHECKS: WeightedMCPComplianceCheck[] = [
  // Core protocol (required for any compliance level)
  { id: 'mcp-protocol', name: 'MCP Protocol Support', description: 'Agent declares MCP protocol support', weight: 16, required: true, category: "core" },
  { id: 'tool-manifest', name: 'Tool Manifest', description: 'Exposes tools/list with all available tools', weight: 12, required: true, category: "core" },
  { id: 'tool-schemas', name: 'Tool Input Schemas', description: 'All tools have JSON Schema input definitions', weight: 12, required: true, category: "core" },
  { id: 'tool-descriptions', name: 'Tool Descriptions', description: 'All tools have human-readable descriptions', weight: 8, required: true, category: "core" },

  // Resources & prompts (required for partial+)
  { id: 'resources', name: 'Resource Declaration', description: 'Exposes resources/list endpoint', weight: 5, required: false, category: "core" },
  { id: 'prompts', name: 'Prompt Declaration', description: 'Exposes prompts/list endpoint', weight: 4, required: false, category: "core" },

  // Transport (required for partial+)
  { id: 'stdio-transport', name: 'Stdio Transport', description: 'Supports stdio transport protocol', weight: 5, required: false, category: "transport" },
  { id: 'http-transport', name: 'HTTP Transport', description: 'Supports HTTP+SSE transport', weight: 4, required: false, category: "transport" },

  // Safety and trust scoring
  { id: 'tool-input-validation', name: 'Tool Input Validation', description: 'Validates tool inputs against declared schema', weight: 6, required: false, category: "safety" },
  { id: 'tool-output-validation', name: 'Tool Output Validation', description: 'Validates tool outputs against declared schema', weight: 6, required: false, category: "safety" },
  { id: 'mcp-server-verified', name: 'MCP Server Identity Verification', description: 'Verifies MCP server identity prior to session', weight: 6, required: false, category: "safety" },
  { id: 'mcp-server-trust-policy', name: 'MCP Server Trust Policy', description: 'Only trusted/allowlisted MCP servers are allowed', weight: 4, required: false, category: "safety" },
  { id: 'mcp-server-signed-metadata', name: 'Signed MCP Metadata', description: 'Verifies signed MCP server metadata/manifests', weight: 4, required: false, category: "safety" },
  { id: 'mcp-injection-detection', name: 'MCP Prompt Injection Detection', description: 'Detects prompt-injection patterns in MCP payloads', weight: 6, required: false, category: "safety" },
  { id: 'mcp-injection-blocking', name: 'MCP Prompt Injection Blocking', description: 'Blocks MCP payloads flagged as prompt injection', weight: 4, required: false, category: "safety" },
  { id: 'mcp-injection-sanitization', name: 'MCP Payload Sanitization', description: 'Sanitizes untrusted MCP tool/resource text before use', weight: 4, required: false, category: "safety" },
  { id: 'permission-scopes-declared', name: 'Tool Permission Scope Declaration', description: 'Declares explicit permission scopes for tool operations', weight: 4, required: false, category: "safety" },
  { id: 'permission-scopes-enforced', name: 'Tool Permission Scope Enforcement', description: 'Enforces scope checks before each MCP tool call', weight: 6, required: false, category: "safety" },
  { id: 'permission-deny-by-default', name: 'Permission Deny-By-Default', description: 'Tool calls are denied unless an explicit scope is granted', weight: 4, required: false, category: "safety" },
  { id: 'permission-least-privilege', name: 'Permission Least Privilege', description: 'Each tool is mapped to minimum required scopes only', weight: 4, required: false, category: "safety" },
  { id: 'oauth', name: 'OAuth 2.0', description: 'Supports OAuth 2.0 authorization flow', weight: 3, required: false, category: "safety" },

  // AMC-native compliance bonuses
  { id: 'amc-receipts', name: 'AMC Receipts', description: 'Signs every tool call with evidence receipt', weight: 4, required: false, category: "governance" },
  { id: 'amc-policy-gates', name: 'AMC Policy Gates', description: 'Governor can intercept/block tool calls', weight: 4, required: false, category: "governance" },
  { id: 'amc-audit-log', name: 'AMC Audit Log', description: 'All tool calls written to tamper-evident audit log', weight: 4, required: false, category: "governance" },
];

const CHECK_INDEX = new Map(COMPLIANCE_CHECKS.map((check) => [check.id, check]));

const PROMPT_INJECTION_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "override-system-instructions", pattern: /\b(ignore|bypass|disregard)\b.{0,40}\b(system|developer|previous|prior)\b/i },
  { id: "secret-exfiltration", pattern: /\b(reveal|print|dump|expose)\b.{0,40}\b(secret|api[_ -]?key|token|credential|password)\b/i },
  { id: "tool-escalation", pattern: /\b(call|invoke|run|execute)\b.{0,60}\b(tool|function|command)\b.{0,40}\b(without|ignore).{0,20}\b(permission|approval|policy)\b/i },
  { id: "prompt-leakage", pattern: /\b(system prompt|developer prompt|hidden instructions)\b/i },
  { id: "shell-payload", pattern: /\b(curl|wget).{0,40}\|\s*(sh|bash)\b|\brm\s+-rf\b/i },
];

function evaluateCheckSet(checkIds: string[], capMap: Record<string, boolean>): MCPSafetyDimensionResult {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const warnings: string[] = [];
  let earned = 0;
  let total = 0;

  for (const checkId of checkIds) {
    const check = CHECK_INDEX.get(checkId);
    if (!check) {
      continue;
    }
    total += check.weight;
    if (capMap[checkId]) {
      earned += check.weight;
      passedChecks.push(checkId);
    } else {
      failedChecks.push(checkId);
      warnings.push(`${check.name} missing`);
    }
  }

  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { score, passedChecks, failedChecks, warnings };
}

function excerpt(input: string, max = 96): string {
  const flat = input.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, max - 1)}…`;
}

export function detectMcpPromptInjection(messages: string[]): MCPPromptInjectionDetectionResult {
  const signals: MCPPromptInjectionSignal[] = [];
  if (messages.length === 0) {
    return { detected: false, severity: "none", signals };
  }

  messages.forEach((message, messageIndex) => {
    for (const candidate of PROMPT_INJECTION_PATTERNS) {
      if (!candidate.pattern.test(message)) {
        continue;
      }
      signals.push({
        messageIndex,
        patternId: candidate.id,
        excerpt: excerpt(message)
      });
    }
  });

  const uniquePatterns = new Set(signals.map((signal) => signal.patternId));
  const severity: MCPPromptInjectionDetectionResult["severity"] =
    uniquePatterns.size >= 3 || signals.length >= 4
      ? "high"
      : uniquePatterns.size >= 2
        ? "medium"
        : signals.length > 0
          ? "low"
          : "none";

  return {
    detected: signals.length > 0,
    severity,
    signals
  };
}

export function scoreMcpCompliance(capabilities: MCPCapabilityDeclaration): MCPComplianceResult {
  const promptInjection = detectMcpPromptInjection(capabilities.observedMcpMessages ?? []);

  const outputValidation =
    capabilities.validatesOutputs === true || capabilities.validatesToolOutputsAgainstSchema === true;
  const permissionEnforcement = capabilities.enforcesToolPermissionScopes === true || capabilities.limitsCapabilities;
  const permissionLeastPrivilege =
    capabilities.mapsToolsToLeastPrivilegeScopes === true || capabilities.limitsCapabilities;
  const injectionBlockingEffective =
    capabilities.blocksPromptInjectionAttempts === true ||
    (!promptInjection.detected && capabilities.detectsPromptInjectionViaMcp === true);

  const capMap: Record<string, boolean> = {
    'mcp-protocol': capabilities.supportsMcpProtocol,
    'tool-manifest': capabilities.declaresToolManifest,
    'tool-schemas': capabilities.toolsHaveInputSchemas,
    'tool-descriptions': capabilities.toolsHaveDescriptions,
    'resources': capabilities.declaresResources,
    'prompts': capabilities.declaresPrompts,
    'stdio-transport': capabilities.supportsStdio,
    'http-transport': capabilities.supportsHttp,
    'tool-input-validation': capabilities.validatesInputs,
    'tool-output-validation': outputValidation,
    'mcp-server-verified': capabilities.verifiesMcpServerIdentity === true,
    'mcp-server-trust-policy': capabilities.enforcesTrustedMcpServers === true,
    'mcp-server-signed-metadata': capabilities.usesSignedMcpServerMetadata === true,
    'mcp-injection-detection': capabilities.detectsPromptInjectionViaMcp === true,
    'mcp-injection-blocking': injectionBlockingEffective,
    'mcp-injection-sanitization': capabilities.sanitizesMcpToolContent === true,
    'permission-scopes-declared': (capabilities.declaredPermissionScopes?.length ?? 0) > 0,
    'permission-scopes-enforced': permissionEnforcement,
    'permission-deny-by-default': capabilities.hasDenyByDefaultScopes === true,
    'permission-least-privilege': permissionLeastPrivilege,
    'oauth': capabilities.supportsOauth,
    'amc-receipts': capabilities.emitsReceiptsOnToolCall,
    'amc-policy-gates': capabilities.supportsPolicyGates,
    'amc-audit-log': capabilities.hasAuditLog,
  };

  const passed: string[] = [];
  const failed: string[] = [];
  const warningSet = new Set<string>();
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of COMPLIANCE_CHECKS) {
    totalWeight += check.weight;
    if (capMap[check.id]) {
      passed.push(check.id);
      earnedWeight += check.weight;
    } else {
      failed.push(check.id);
      if (check.required) {
        warningSet.add(`REQUIRED: ${check.name} — ${check.description}`);
      }
    }
  }

  const score = Math.round((earnedWeight / totalWeight) * 100);

  const requiredPassed = COMPLIANCE_CHECKS.filter(c => c.required).every(c => capMap[c.id]);
  const corePassed = passed.includes('mcp-protocol') && passed.includes('tool-manifest') && passed.includes('tool-schemas');
  const safety: MCPSafetyScorecard = {
    toolCallSafetyValidation: evaluateCheckSet(["tool-input-validation", "tool-output-validation", "tool-schemas"], capMap),
    mcpServerTrust: evaluateCheckSet(["mcp-server-verified", "mcp-server-trust-policy", "mcp-server-signed-metadata"], capMap),
    promptInjectionDefense: evaluateCheckSet(["mcp-injection-detection", "mcp-injection-blocking", "mcp-injection-sanitization"], capMap),
    permissionScopeEnforcement: evaluateCheckSet(
      ["permission-scopes-declared", "permission-scopes-enforced", "permission-deny-by-default", "permission-least-privilege"],
      capMap
    ),
    overall: 0
  };
  safety.overall = Math.round(
    (
      safety.toolCallSafetyValidation.score +
      safety.mcpServerTrust.score +
      safety.promptInjectionDefense.score +
      safety.permissionScopeEnforcement.score
    ) / 4
  );

  if (safety.toolCallSafetyValidation.score < 70) {
    warningSet.add("Tool call safety validation is weak: validate both MCP tool inputs and outputs.");
  }
  if (safety.mcpServerTrust.score < 70) {
    warningSet.add("MCP server trust is weak: verify identity, trust policy, and signed metadata.");
  }
  if (safety.promptInjectionDefense.score < 70) {
    warningSet.add("Prompt injection via MCP is insufficiently mitigated.");
  }
  if (safety.permissionScopeEnforcement.score < 70) {
    warningSet.add("Tool permission scopes are not consistently enforced.");
  }
  if (capabilities.supportsMcpProtocol && !capabilities.mcpVersion) {
    warningSet.add("MCP version was not declared; pin and document the protocol revision.");
  }
  if (promptInjection.detected && capabilities.blocksPromptInjectionAttempts !== true) {
    warningSet.add(
      "HIGH: Prompt injection patterns found in observed MCP payloads and blocking was not confirmed."
    );
  }

  const level: MCPComplianceResult['level'] =
    score >= 90 && requiredPassed && safety.overall >= 85 ? 'full' :
    score >= 65 && requiredPassed && safety.overall >= 60 ? 'partial' :
    corePassed ? 'minimal' :
    'non-compliant';

  const badge: MCPComplianceResult['badge'] =
    level === 'full' ? 'MCP-Certified' :
    level === 'partial' ? 'MCP-Compatible' :
    level === 'minimal' ? 'MCP-Aware' :
    'Not-MCP';

  const recommendations = failed
    .map(id => COMPLIANCE_CHECKS.find(c => c.id === id))
    .filter(Boolean)
    .slice(0, 7)
    .map(c => `Add ${c!.name}: ${c!.description}`);

  if (promptInjection.detected && capabilities.detectsPromptInjectionViaMcp !== true) {
    recommendations.unshift("Add MCP Prompt Injection Detection: inspect tool args/results and resource payloads before prompt composition.");
  }
  if (!outputValidation) {
    recommendations.unshift("Add Tool Output Validation: enforce JSON schema/output contracts before downstream execution.");
  }
  if (capabilities.enforcesToolPermissionScopes !== true) {
    recommendations.unshift("Add Tool Permission Scope Enforcement: deny tool calls that exceed granted MCP scopes.");
  }
  if (capabilities.verifiesMcpServerIdentity !== true) {
    recommendations.unshift("Add MCP Server Verification: require verified identity and trust policy before session bind.");
  }

  const warnings = [...warningSet];

  return { score, level, passed, failed, warnings, recommendations: recommendations.slice(0, 8), badge, safety, promptInjection };
}

export function getMcpComplianceGuide(): string {
  return `
# MCP Compliance Implementation Guide

## What is MCP?
The Model Context Protocol (MCP) is an open standard for AI agent interoperability,
donated to the Linux Foundation's Agentic AI Foundation. It defines how agents
expose tools, resources, and prompts to LLM clients.

## Why Score MCP Compliance?
Agents that are MCP-compliant can be:
- Connected to any MCP-compatible client (Claude Desktop, Cursor, etc.)
- Discovered and audited programmatically
- Governed by AMC policy gates at the tool-call level
- Rated for practical safety posture across MCP trust boundaries

## Compliance Levels
- **MCP-Certified**: Full compliance (90%+). Required checks passed. Production-ready.
- **MCP-Compatible**: Partial compliance (60–89%). Core protocol + most features.
- **MCP-Aware**: Minimal compliance. Basic tool manifest only.
- **Not-MCP**: No MCP support detected.

## Quick Start
1. Implement tools/list endpoint returning tool schemas
2. Add stdio transport (minimum) or HTTP+SSE
3. Enforce tool-call safety validation for inputs and outputs
4. Verify trusted MCP servers and require signed metadata
5. Detect and block prompt injection arriving via MCP messages/resources
6. Enforce least-privilege permission scopes per tool call
7. Register with AMC: amc compliance mcp --agent <id>

## Safety Subscores
- Tool-call safety validation
- MCP server trust verification
- Prompt injection defense via MCP channels
- Tool permission scope enforcement
`.trim();
}
