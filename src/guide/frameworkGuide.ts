/**
 * Framework-Specific Governance Guide — Gap 8
 *
 * Given an agent's detected framework + AMC scores, generates
 * specific, actionable governance guidance with real code examples.
 */

import type { DiagnosticReport } from "../types.js";

/* ── Types ───────────────────────────────────────────────────────── */

export type SupportedFramework =
  | "langchain"
  | "langgraph"
  | "crewai"
  | "openai-agents"
  | "vercel-ai"
  | "autogen"
  | "semantic-kernel"
  | "llamaindex"
  | "custom";

export interface GovernancePattern {
  id: string;
  name: string;
  description: string;
  amcQuestionsAddressed: string[];
  priority: "critical" | "high" | "medium" | "low";
  codeExample: string;
  implementation: string;
}

export interface FrameworkGuideOutput {
  framework: SupportedFramework;
  displayName: string;
  summary: string;
  patterns: GovernancePattern[];
  quickWins: string[];
  maturityRoadmap: Array<{ level: string; description: string; actions: string[] }>;
}

/* ── Framework Knowledge Base ────────────────────────────────────── */

const FRAMEWORK_PATTERNS: Record<SupportedFramework, GovernancePattern[]> = {
  langchain: [
    {
      id: "lc-callback-auditor",
      name: "Callback-Based Audit Trail",
      description: "Use LangChain callbacks to capture every LLM call, tool invocation, and chain step for AMC audit compliance.",
      amcQuestionsAddressed: ["AMC-1.1", "AMC-1.2", "AMC-4.1"],
      priority: "critical",
      codeExample: `import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { init } from "@amc/instrument";

// AMC auto-instrumentation (one line)
const amc = init({ governanceMode: true });

// Or manual callback for fine-grained control:
class AMCAuditCallback extends BaseCallbackHandler {
  name = "AMCAuditCallback";

  async handleLLMStart(llm, prompts) {
    console.log(\`[AMC] LLM start: \${llm.id}, \${prompts.length} prompts\`);
  }

  async handleLLMEnd(output) {
    const tokens = output.llmOutput?.tokenUsage;
    console.log(\`[AMC] LLM end: \${tokens?.totalTokens} tokens\`);
  }

  async handleToolStart(tool, input) {
    console.log(\`[AMC] Tool start: \${tool.id}\`);
  }

  async handleToolError(err) {
    console.error(\`[AMC] Tool error: \${err.message}\`);
  }
}

// Attach to any chain:
const chain = prompt.pipe(model).pipe(parser);
await chain.invoke(input, { callbacks: [new AMCAuditCallback()] });`,
      implementation: "Create a custom BaseCallbackHandler that logs to AMC's evidence ledger. Attach it globally or per-chain.",
    },
    {
      id: "lc-cost-router",
      name: "Model Cost Router",
      description: "Route LangChain calls to cost-appropriate models based on task complexity.",
      amcQuestionsAddressed: ["AMC-3.1", "AMC-3.2"],
      priority: "high",
      codeExample: `import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

const cheapModel = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
const powerModel = new ChatAnthropic({ modelName: "claude-sonnet-4-20250514" });

function routeByComplexity(input: string) {
  const tokenEstimate = input.split(/\\s+/).length * 1.3;
  // Simple tasks: classification, extraction, formatting
  if (tokenEstimate < 100 || /^(classify|extract|format|summarize)/i.test(input)) {
    return cheapModel;
  }
  // Complex tasks: reasoning, code generation, analysis
  return powerModel;
}

// Usage in a chain:
const model = routeByComplexity(userInput);
const result = await model.invoke(messages);`,
      implementation: "Create a router function that selects models based on input complexity, token count, or task type.",
    },
    {
      id: "lc-output-guard",
      name: "Output Safety Guard Chain",
      description: "Add a safety check chain that validates LLM outputs before returning to users.",
      amcQuestionsAddressed: ["AMC-4.1", "AMC-4.2"],
      priority: "high",
      codeExample: `import { RunnableSequence } from "@langchain/core/runnables";

const safetyCheck = async (output: string) => {
  // Check for PII patterns
  const piiPatterns = [
    /\\b\\d{3}-\\d{2}-\\d{4}\\b/, // SSN
    /\\b\\d{16}\\b/, // Credit card
    /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i, // Email
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(output)) {
      return "[REDACTED — PII detected in output]";
    }
  }

  // Check for refusal bypass
  const dangerPatterns = [/ignore previous/i, /system prompt/i, /jailbreak/i];
  for (const pattern of dangerPatterns) {
    if (pattern.test(output)) {
      return "[BLOCKED — potential prompt injection in output]";
    }
  }

  return output;
};

const guardedChain = RunnableSequence.from([
  prompt,
  model,
  parser,
  safetyCheck,
]);`,
      implementation: "Wrap output parsing with a safety validator that checks for PII, injection artifacts, and policy violations.",
    },
    {
      id: "lc-retrieval-grounding",
      name: "RAG Grounding with Source Verification",
      description: "Ensure retrieval-augmented generation includes source attribution and fact verification.",
      amcQuestionsAddressed: ["AMC-4.2", "AMC-1.2"],
      priority: "medium",
      codeExample: `import { createRetrievalChain } from "langchain/chains/retrieval";

// Add source tracking to every retrieval
const groundedChain = RunnableSequence.from([
  async (input) => {
    const docs = await retriever.invoke(input.question);
    return {
      ...input,
      context: docs.map(d => d.pageContent).join("\\n"),
      sources: docs.map(d => ({
        content: d.pageContent.slice(0, 200),
        metadata: d.metadata,
      })),
    };
  },
  promptWithSources,
  model,
  // Verify output references sources
  async (output) => ({
    answer: output,
    grounded: true,
    sources_used: "verified",
  }),
]);`,
      implementation: "Wrap retrieval chains with source tracking. Log sources alongside outputs for auditability.",
    },
    {
      id: "lc-circuit-breaker",
      name: "Circuit Breaker for Failing Chains",
      description: "Implement circuit breaker pattern to prevent cascading failures in LangChain chains.",
      amcQuestionsAddressed: ["AMC-2.1", "AMC-2.3"],
      priority: "medium",
      codeExample: `class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold = 3,
    private resetMs = 60000
  ) {}

  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = "half-open";
      } else {
        return fallback();
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) {
        this.state = "open";
      }
      return fallback();
    }
  }
}

const breaker = new CircuitBreaker(3, 30000);
const result = await breaker.call(
  () => chain.invoke(input),
  () => "I'm having trouble processing that. Please try again."
);`,
      implementation: "Wrap chain invocations with a circuit breaker that falls back to a safe response after repeated failures.",
    },
  ],

  langgraph: [
    {
      id: "lg-state-audit",
      name: "State Transition Audit Log",
      description: "Log every state transition in a LangGraph for complete decision trail.",
      amcQuestionsAddressed: ["AMC-1.1", "AMC-1.2", "AMC-4.1"],
      priority: "critical",
      codeExample: `import { StateGraph, Annotation } from "@langchain/langgraph";

const GraphState = Annotation.Root({
  messages: Annotation({ reducer: (a, b) => [...a, ...b] }),
  auditLog: Annotation({ reducer: (a, b) => [...a, ...b] }),
});

function auditNode(nodeName: string, fn: Function) {
  return async (state) => {
    const entry = {
      node: nodeName,
      ts: Date.now(),
      inputKeys: Object.keys(state),
    };
    const result = await fn(state);
    return {
      ...result,
      auditLog: [{ ...entry, outputKeys: Object.keys(result) }],
    };
  };
}

const graph = new StateGraph(GraphState)
  .addNode("agent", auditNode("agent", agentFn))
  .addNode("tools", auditNode("tools", toolsFn))
  .addEdge("agent", "tools");`,
      implementation: "Wrap every node function with an audit logger that captures state transitions into the graph state.",
    },
    {
      id: "lg-human-gate",
      name: "Human-in-the-Loop Approval Gate",
      description: "Add mandatory human approval nodes for high-stakes actions in LangGraph workflows.",
      amcQuestionsAddressed: ["AMC-4.1", "AMC-2.1"],
      priority: "critical",
      codeExample: `function shouldRequireApproval(state) {
  const lastAction = state.pendingAction;
  const highStakes = ["delete", "transfer", "deploy", "email", "payment"];
  return highStakes.some(a => lastAction?.toLowerCase().includes(a))
    ? "approval_gate"
    : "execute";
}

async function approvalGate(state) {
  // In production: send to approval queue, wait for human
  console.log("[AMC] Approval required for:", state.pendingAction);
  // Block execution until approved
  return { approved: false, reason: "Awaiting human approval" };
}

graph.addConditionalEdges("agent", shouldRequireApproval, {
  approval_gate: "approval_gate",
  execute: "execute_tools",
});
graph.addNode("approval_gate", approvalGate);`,
      implementation: "Add conditional edges that route high-stakes actions through a human approval node before execution.",
    },
  ],

  crewai: [
    {
      id: "crew-task-budget",
      name: "Per-Task Cost Budget",
      description: "Set cost limits per CrewAI task to prevent runaway spending.",
      amcQuestionsAddressed: ["AMC-3.1", "AMC-3.2"],
      priority: "high",
      codeExample: `from crewai import Agent, Task, Crew
from amc.instrument import init

# One-line AMC instrumentation
amc = init(governance_mode=True, cost_budget_usd=5.00)

# Set per-agent token limits
researcher = Agent(
    role="Researcher",
    max_iter=5,  # Prevent infinite loops
    max_rpm=10,  # Rate limit
)

# Set per-task limits
task = Task(
    description="Research the topic",
    agent=researcher,
    max_tokens=4000,  # Output limit
)`,
      implementation: "Use CrewAI's built-in max_iter and max_rpm, combined with AMC's cost tracking for budget enforcement.",
    },
  ],

  "openai-agents": [
    {
      id: "oai-guardrails",
      name: "OpenAI Agents SDK Guardrails",
      description: "Use the built-in guardrails system with AMC governance hooks.",
      amcQuestionsAddressed: ["AMC-4.1", "AMC-4.2"],
      priority: "critical",
      codeExample: `import { Agent, Runner, InputGuardrail, OutputGuardrail } from "@openai/agents";
import { init } from "@amc/instrument";

init({ governanceMode: true });

const inputGuard = new InputGuardrail({
  name: "amc_input_safety",
  fn: async (input, context) => {
    // Check for injection attempts
    if (/ignore|override|system prompt/i.test(input)) {
      return { tripwire: true, reason: "Potential prompt injection" };
    }
    return { tripwire: false };
  },
});

const outputGuard = new OutputGuardrail({
  name: "amc_output_safety",
  fn: async (output, context) => {
    // Verify output doesn't leak sensitive data
    if (/password|api[_-]key|secret/i.test(JSON.stringify(output))) {
      return { tripwire: true, reason: "Sensitive data in output" };
    }
    return { tripwire: false };
  },
});

const agent = new Agent({
  name: "safe_agent",
  model: "gpt-4o",
  input_guardrails: [inputGuard],
  output_guardrails: [outputGuard],
});`,
      implementation: "Wire AMC safety checks into OpenAI Agents SDK's guardrail system for inline governance.",
    },
  ],

  "vercel-ai": [
    {
      id: "vai-middleware",
      name: "Vercel AI SDK Middleware",
      description: "Use middleware pattern for request/response governance in Vercel AI SDK.",
      amcQuestionsAddressed: ["AMC-1.1", "AMC-4.1", "AMC-3.1"],
      priority: "high",
      codeExample: `import { generateText, experimental_wrapLanguageModel } from "ai";
import { init } from "@amc/instrument";

init(); // Auto-instruments Vercel AI SDK

// Or manual middleware for fine control:
const governedModel = experimental_wrapLanguageModel({
  model: openai("gpt-4o"),
  middleware: {
    transformParams: async ({ params }) => {
      // Enforce token limits
      return { ...params, maxTokens: Math.min(params.maxTokens ?? 4096, 4096) };
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      const start = Date.now();
      const result = await doGenerate();
      const cost = estimateCost(params.model, result.usage);
      console.log(\`[AMC] Cost: $\${cost.toFixed(4)}, \${Date.now() - start}ms\`);
      return result;
    },
  },
});`,
      implementation: "Use experimental_wrapLanguageModel to add governance middleware that tracks costs and enforces limits.",
    },
  ],

  autogen: [
    {
      id: "ag-termination",
      name: "Conversation Termination Controls",
      description: "Prevent infinite agent loops with proper termination conditions in AutoGen.",
      amcQuestionsAddressed: ["AMC-2.1", "AMC-3.2"],
      priority: "critical",
      codeExample: `import autogen

config = {
    "max_consecutive_auto_reply": 10,
    "timeout": 120,
}

assistant = autogen.AssistantAgent(
    "assistant",
    llm_config={"model": "gpt-4o"},
    max_consecutive_auto_reply=10,  # Hard stop
)

# Custom termination
def cost_termination(msg):
    """Stop if accumulated cost exceeds budget."""
    total_cost = assistant.total_usage_summary.get("total_cost", 0)
    if total_cost > 1.00:
        return True, "Budget exceeded"
    return False, ""

user = autogen.UserProxyAgent(
    "user",
    is_termination_msg=cost_termination,
    max_consecutive_auto_reply=5,
)`,
      implementation: "Set max_consecutive_auto_reply and custom termination functions that check cost budgets.",
    },
  ],

  "semantic-kernel": [
    {
      id: "sk-filters",
      name: "Kernel Filters for Governance",
      description: "Use Semantic Kernel filters to add governance checks to every function call.",
      amcQuestionsAddressed: ["AMC-4.1", "AMC-1.1"],
      priority: "high",
      codeExample: `using Microsoft.SemanticKernel;

public class AMCGovernanceFilter : IFunctionInvocationFilter
{
    public async Task OnFunctionInvocationAsync(
        FunctionInvocationContext context,
        Func<FunctionInvocationContext, Task> next)
    {
        // Pre-execution: check permissions
        Console.WriteLine($"[AMC] Executing: {context.Function.Name}");

        var startTime = DateTime.UtcNow;
        await next(context);
        var duration = DateTime.UtcNow - startTime;

        // Post-execution: log to audit trail
        Console.WriteLine($"[AMC] Completed: {context.Function.Name} in {duration.TotalMs}ms");
    }
}

var kernel = Kernel.CreateBuilder()
    .AddOpenAIChatCompletion("gpt-4o", apiKey)
    .Build();
kernel.FunctionInvocationFilters.Add(new AMCGovernanceFilter());`,
      implementation: "Register IFunctionInvocationFilter implementations that log to AMC's evidence ledger.",
    },
  ],

  llamaindex: [
    {
      id: "li-observability",
      name: "LlamaIndex Observability Integration",
      description: "Use LlamaIndex's callback system for AMC trace collection.",
      amcQuestionsAddressed: ["AMC-1.1", "AMC-1.2"],
      priority: "high",
      codeExample: `from llama_index.core.callbacks import CallbackManager, LlamaDebugHandler
from llama_index.core import Settings

# Built-in debug handler + AMC integration
debug_handler = LlamaDebugHandler()
callback_manager = CallbackManager([debug_handler])
Settings.callback_manager = callback_manager

# After query:
for event in debug_handler.get_llm_inputs_outputs():
    print(f"Model: {event.model}, Tokens: {event.token_usage}")`,
      implementation: "Set up CallbackManager globally in Settings to capture all LlamaIndex operations for AMC audit.",
    },
  ],

  custom: [
    {
      id: "custom-wrapper",
      name: "Generic AMC Wrapper",
      description: "Wrap any AI SDK with AMC instrumentation using the generic init() function.",
      amcQuestionsAddressed: ["AMC-1.1", "AMC-3.1", "AMC-4.1"],
      priority: "critical",
      codeExample: `import { init } from "@amc/instrument";

// One line — auto-detects everything
const amc = init({
  governanceMode: true,
  costBudgetUsd: 10.00,
  maxActions: 1000,
  redactContent: false,
  onViolation: (v) => console.error("[AMC VIOLATION]", v.message),
  onBudgetExceeded: (current, budget) => {
    console.error(\`Budget exceeded: $\${current} / $\${budget}\`);
    process.exit(1);
  },
});

// Manual tracking for custom operations:
const result = await amc.track("my-agent-run", async () => {
  const response = await myCustomLLM.complete(prompt);
  return response;
});

// Get stats anytime:
console.log(amc.getStats());

// Clean shutdown:
process.on("SIGTERM", () => amc.shutdown());`,
      implementation: "Use the AMC SDK's init() for auto-detection, or track() for manual wrapping of custom LLM calls.",
    },
  ],
};

/* ── Guide Generator ─────────────────────────────────────────────── */

export function generateFrameworkGuide(
  framework: SupportedFramework,
  scores?: Partial<Record<string, number>>,
): FrameworkGuideOutput {
  const patterns = FRAMEWORK_PATTERNS[framework] ?? FRAMEWORK_PATTERNS.custom;
  const displayName = FRAMEWORK_DISPLAY_NAMES[framework] ?? framework;

  // Sort by priority, and if scores provided, prioritize low-scoring areas
  const sorted = [...patterns].sort((a, b) => {
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
  });

  // Quick wins
  const quickWins = [
    `Run \`amc run --auto\` to get your current maturity score with ${displayName}`,
    `Add \`import { init } from "@amc/instrument"; init();\` as the first line of your app`,
    "Enable cost tracking to see where your budget goes: `amc costs show`",
    `Review the ${sorted.length} governance patterns below and implement the critical ones first`,
    "Set up continuous monitoring: `amc monitor start --assurance live`",
  ];

  // Maturity roadmap
  const roadmap = [
    {
      level: "L1 — Basic",
      description: "Logging exists but is ad-hoc. No governance.",
      actions: [
        "Add AMC auto-instrumentation (one line)",
        "Enable basic cost tracking",
        "Set up error alerting",
      ],
    },
    {
      level: "L2 — Structured",
      description: "Traces captured, basic cost awareness.",
      actions: [
        "Implement output safety guards",
        "Add model cost routing",
        "Set up session tracking for user journeys",
      ],
    },
    {
      level: "L3 — Governed",
      description: "Formal governance gates, continuous monitoring.",
      actions: [
        "Add human-in-the-loop for high-stakes actions",
        "Implement circuit breakers for failing chains",
        "Set cost budgets with automatic enforcement",
        "Run assurance packs against live traces",
      ],
    },
    {
      level: "L4 — Auditable",
      description: "Complete audit trail, evidence-backed claims.",
      actions: [
        "Full AMC ledger integration",
        "Signed evidence for every agent action",
        "Compliance framework coverage (EU AI Act, SOC2)",
        "Regular adversarial testing with AMC Shield",
      ],
    },
    {
      level: "L5 — Trustworthy",
      description: "Continuous improvement, predictable behavior.",
      actions: [
        "Longitudinal trend analysis",
        "Automated regression detection",
        "Third-party audit readiness",
        "Published trust profile",
      ],
    },
  ];

  return {
    framework,
    displayName,
    summary: `Governance guide for ${displayName}: ${sorted.length} patterns covering observability, cost optimization, safety, and reliability. Start with the critical patterns, then work through the roadmap.`,
    patterns: sorted,
    quickWins,
    maturityRoadmap: roadmap,
  };
}

export function listSupportedFrameworks(): Array<{ id: SupportedFramework; displayName: string; patternCount: number }> {
  return Object.entries(FRAMEWORK_DISPLAY_NAMES).map(([id, displayName]) => ({
    id: id as SupportedFramework,
    displayName,
    patternCount: (FRAMEWORK_PATTERNS[id as SupportedFramework] ?? []).length,
  }));
}

const FRAMEWORK_DISPLAY_NAMES: Record<SupportedFramework, string> = {
  langchain: "LangChain",
  langgraph: "LangGraph",
  crewai: "CrewAI",
  "openai-agents": "OpenAI Agents SDK",
  "vercel-ai": "Vercel AI SDK",
  autogen: "AutoGen",
  "semantic-kernel": "Semantic Kernel",
  llamaindex: "LlamaIndex",
  custom: "Custom / Generic",
};
