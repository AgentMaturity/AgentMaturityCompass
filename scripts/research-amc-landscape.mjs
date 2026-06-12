#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const retrievalDate = process.env.AMC_RESEARCH_DATE || "2026-06-13";
const outRoot = resolve(root, process.env.AMC_RESEARCH_OUT || "AMC_OS/RESEARCH/2026-06-13-amc-landscape");
const userAgent = "AgentMaturityCompass research (https://github.com/AgentMaturity/AgentMaturityCompass)";

const targetPapers = Number(process.env.AMC_RESEARCH_PAPERS || 520);
const targetRepos = Number(process.env.AMC_RESEARCH_REPOS || 520);
const targetGaps = Number(process.env.AMC_RESEARCH_GAPS || 540);

const categories = [
  {
    id: "agent-evaluation",
    label: "Agent evaluation and benchmarks",
    surfaces: ["Score", "Shield", "Watch"],
    keywords: ["eval", "benchmark", "score", "metric", "leaderboard", "test suite", "assessment", "diagnostic"]
  },
  {
    id: "agent-runtime",
    label: "Agent runtime and orchestration",
    surfaces: ["Fleet", "Watch", "Studio"],
    keywords: ["agent", "multi-agent", "orchestration", "workflow", "planning", "tool use", "autonomous", "runtime"]
  },
  {
    id: "safety-security",
    label: "Safety, security, red teaming, and attacks",
    surfaces: ["Shield", "Enforce", "Vault"],
    keywords: ["security", "safety", "red team", "jailbreak", "prompt injection", "attack", "vulnerability", "guardrail", "malicious"]
  },
  {
    id: "governance-compliance",
    label: "Governance, risk, compliance, and audit",
    surfaces: ["Comply", "Passport", "Vault"],
    keywords: ["governance", "compliance", "audit", "risk", "regulation", "policy", "accountability", "assurance"]
  },
  {
    id: "observability-monitoring",
    label: "Observability, monitoring, and traces",
    surfaces: ["Watch", "Studio", "API"],
    keywords: ["observability", "monitor", "trace", "telemetry", "logging", "debug", "span", "production"]
  },
  {
    id: "rag-memory",
    label: "RAG, memory, retrieval, and knowledge",
    surfaces: ["Score", "Watch", "Enforce"],
    keywords: ["rag", "retrieval", "memory", "knowledge", "vector", "embedding", "context", "grounding"]
  },
  {
    id: "tool-mcp-policy",
    label: "Tool, MCP, and permission policy",
    surfaces: ["Enforce", "Shield", "Vault"],
    keywords: ["tool", "mcp", "permission", "sandbox", "least privilege", "function call", "api call", "capability"]
  },
  {
    id: "llmops-routing-cost",
    label: "LLMOps, routing, cost, and deployment",
    surfaces: ["API", "Studio", "Fleet"],
    keywords: ["llmops", "routing", "gateway", "cost", "latency", "deployment", "provider", "model router"]
  },
  {
    id: "human-oversight",
    label: "Human oversight and HITL",
    surfaces: ["Enforce", "Passport", "Comply"],
    keywords: ["human", "oversight", "approval", "reviewer", "escalation", "human-in-the-loop", "hitl"]
  },
  {
    id: "standards-protocols",
    label: "Standards, protocols, and interoperability",
    surfaces: ["Passport", "API", "Fleet"],
    keywords: ["standard", "protocol", "interoperability", "schema", "contract", "attestation", "provenance"]
  }
];

const categoryAliases = {
  "eval-observability": "agent-evaluation",
  "model-monitoring": "observability-monitoring",
  "workflow-automation": "agent-runtime"
};

const paperQueries = [
  "LLM agents evaluation",
  "AI agent benchmark",
  "agentic AI evaluation",
  "multi-agent systems LLM",
  "LLM tool use safety",
  "prompt injection agents",
  "AI agent governance",
  "LLM observability",
  "LLM monitoring production",
  "AI red teaming agents",
  "RAG evaluation agent",
  "LLM memory agents",
  "agent workflow orchestration",
  "AI assurance framework",
  "AI audit evidence",
  "LLM compliance governance",
  "model risk management generative AI",
  "AI agent security benchmark",
  "MCP agent security",
  "tool calling large language models",
  "autonomous agents safety",
  "human oversight AI agents",
  "AI agent provenance",
  "LLM trace analysis",
  "AI evaluation framework",
  "agent reliability benchmark",
  "LLM guardrails evaluation",
  "AI alignment agent evaluation",
  "multi agent collaboration benchmark",
  "LLM workflow evaluation",
  "agentic RAG evaluation",
  "AI trust assurance",
  "LLM vulnerability detection",
  "agent sandbox security",
  "LLM operations monitoring",
  "AI governance audit trail"
];

const repoQueries = [
  "llm agent evaluation stars:>10",
  "ai agent benchmark stars:>10",
  "llm observability stars:>10",
  "llm monitoring stars:>10",
  "prompt injection security stars:>10",
  "llm redteam stars:>10",
  "ai red team llm stars:>10",
  "rag evaluation stars:>10",
  "llm guardrails stars:>10",
  "agent framework llm stars:>10",
  "multi agent framework stars:>10",
  "llmops gateway stars:>10",
  "prompt evaluation stars:>10",
  "llm tracing stars:>10",
  "model governance ai stars:>10",
  "ai compliance llm stars:>5",
  "mcp server agent stars:>10",
  "tool calling llm stars:>10",
  "autonomous agent framework stars:>10",
  "llm benchmark eval stars:>10",
  "ai safety eval stars:>5",
  "agent memory llm stars:>10",
  "llm sandbox agent stars:>5",
  "llm audit trail stars:>5",
  "llm production observability stars:>5",
  "open telemetry genai stars:>5",
  "agent workflow orchestration stars:>10",
  "llm security scanner stars:>5",
  "promptfoo OR deepeval stars:>10",
  "langchain agent evaluation stars:>10"
];

const competitorSeeds = [
  ["LangSmith", "eval-observability", "https://www.langchain.com/langsmith", "Tracing, evaluation, monitoring for LangChain and LangGraph apps."],
  ["Langfuse", "eval-observability", "https://langfuse.com", "Open-source LLM observability, tracing, evals, prompt management."],
  ["Braintrust", "eval-observability", "https://www.braintrust.dev", "Evals, logging, prompt playground, datasets, observability."],
  ["Arize Phoenix", "eval-observability", "https://phoenix.arize.com", "Open-source AI observability and evaluation."],
  ["Arize AI", "model-monitoring", "https://arize.com", "AI observability and model monitoring platform."],
  ["Galileo", "eval-observability", "https://www.galileo.ai", "GenAI evaluation, observability, guardrails."],
  ["Weights & Biases Weave", "eval-observability", "https://wandb.ai/site/weave", "LLM tracing and evaluation in W&B."],
  ["Comet Opik", "eval-observability", "https://www.comet.com/site/products/opik/", "Open-source LLM evaluation and observability."],
  ["LangWatch", "eval-observability", "https://langwatch.ai", "LLM observability and monitoring."],
  ["Helicone", "llmops-routing-cost", "https://www.helicone.ai", "Open-source LLM observability and gateway."],
  ["Portkey", "llmops-routing-cost", "https://portkey.ai", "AI gateway, observability, routing, guardrails."],
  ["Keywords AI", "llmops-routing-cost", "https://keywordsai.co", "LLM monitoring, evals, and gateway."],
  ["Lunary", "eval-observability", "https://lunary.ai", "LLM observability and prompt management."],
  ["PromptLayer", "eval-observability", "https://promptlayer.com", "Prompt management and LLM observability."],
  ["Humanloop", "eval-observability", "https://humanloop.com", "Prompt management, evals, governance."],
  ["HoneyHive", "eval-observability", "https://www.honeyhive.ai", "AI agent observability and evaluation."],
  ["Laminar", "eval-observability", "https://www.lmnr.ai", "LLM observability, tracing, evals."],
  ["AgentOps", "agent-runtime", "https://www.agentops.ai", "Agent observability and monitoring."],
  ["Literal AI", "eval-observability", "https://literalai.com", "LLM observability and evaluation."],
  ["Langtrace", "observability-monitoring", "https://www.langtrace.ai", "OpenTelemetry-based LLM tracing."],
  ["Traceloop", "observability-monitoring", "https://www.traceloop.com", "OpenTelemetry observability for LLM apps."],
  ["MLflow", "llmops-routing-cost", "https://mlflow.org", "AI/ML lifecycle, evaluation, tracing, deployments."],
  ["OpenLLMetry", "observability-monitoring", "https://github.com/traceloop/openllmetry", "OpenTelemetry instrumentation for LLM apps."],
  ["OpenTelemetry GenAI", "observability-monitoring", "https://opentelemetry.io/docs/specs/semconv/gen-ai/", "GenAI semantic conventions."],
  ["DeepEval", "agent-evaluation", "https://www.confident-ai.com", "Open-source LLM evaluation framework and platform."],
  ["promptfoo", "safety-security", "https://www.promptfoo.dev", "Prompt/agent testing and red teaming."],
  ["Ragas", "rag-memory", "https://docs.ragas.io", "RAG evaluation framework."],
  ["TruLens", "rag-memory", "https://www.trulens.org", "LLM/RAG evaluation and tracking."],
  ["Giskard", "safety-security", "https://www.giskard.ai", "AI testing, scan, risk, and quality."],
  ["Patronus AI", "agent-evaluation", "https://www.patronus.ai", "LLM evaluation, monitoring, and policy checks."],
  ["UpTrain", "agent-evaluation", "https://github.com/uptrain-ai/uptrain", "Open-source LLM evaluation."],
  ["OpenAI Evals", "agent-evaluation", "https://github.com/openai/evals", "Evaluation framework for LLMs."],
  ["Inspect AI", "agent-evaluation", "https://inspect.aisi.org.uk", "AI safety evaluation framework."],
  ["EleutherAI lm-evaluation-harness", "agent-evaluation", "https://github.com/EleutherAI/lm-evaluation-harness", "Language model evaluation harness."],
  ["HELM", "agent-evaluation", "https://crfm.stanford.edu/helm/", "Holistic evaluation of language models."],
  ["OpenCompass", "agent-evaluation", "https://opencompass.org.cn", "Open model evaluation platform."],
  ["OpenAI Simple Evals", "agent-evaluation", "https://github.com/openai/simple-evals", "Small set of model evals."],
  ["Lakera Guard", "safety-security", "https://www.lakera.ai", "Prompt injection and LLM security guardrails."],
  ["Lasso Security", "safety-security", "https://www.lasso.security", "LLM and GenAI security platform."],
  ["Prompt Security", "safety-security", "https://www.prompt.security", "GenAI security and visibility."],
  ["Protect AI", "safety-security", "https://protectai.com", "AI/ML security platform."],
  ["HiddenLayer", "safety-security", "https://hiddenlayer.com", "AI security and detection."],
  ["Cisco AI Defense", "safety-security", "https://www.cisco.com/site/us/en/products/security/ai-defense/index.html", "Enterprise AI security posture and runtime protection."],
  ["CalypsoAI", "safety-security", "https://calypsoai.com", "AI security and governance."],
  ["Mindgard", "safety-security", "https://mindgard.ai", "AI security testing."],
  ["Noma Security", "safety-security", "https://www.noma.security", "AI application security."],
  ["Zenity", "safety-security", "https://www.zenity.io", "Agentic AI and low-code security."],
  ["Aim Security", "safety-security", "https://www.aim.security", "Enterprise AI security platform."],
  ["Harmonic Security", "safety-security", "https://www.harmonic.security", "Data protection for GenAI."],
  ["Invariant Labs", "safety-security", "https://invariantlabs.ai", "Agent security and guardrails."],
  ["Pangea AI Guard", "safety-security", "https://pangea.cloud/services/ai-guard/", "AI guard service."],
  ["NVIDIA NeMo Guardrails", "safety-security", "https://github.com/NVIDIA/NeMo-Guardrails", "Programmable guardrails for LLMs."],
  ["Guardrails AI", "safety-security", "https://www.guardrailsai.com", "Validation and guardrails framework."],
  ["LLM Guard", "safety-security", "https://llm-guard.com", "Input/output scanner for LLM apps."],
  ["Garak", "safety-security", "https://github.com/NVIDIA/garak", "LLM vulnerability scanner."],
  ["PyRIT", "safety-security", "https://github.com/Azure/PyRIT", "AI red teaming automation."],
  ["Rebuff", "safety-security", "https://github.com/protectai/rebuff", "Prompt injection detection."],
  ["Vigil", "safety-security", "https://github.com/deadbits/vigil-llm", "LLM prompt injection scanner."],
  ["ModelScan", "safety-security", "https://github.com/protectai/modelscan", "Model serialization scanner."],
  ["NB Defense", "safety-security", "https://github.com/protectai/nbdefense", "Notebook security scanner."],
  ["Fiddler AI", "model-monitoring", "https://www.fiddler.ai", "AI observability, governance, monitoring."],
  ["Arthur AI", "model-monitoring", "https://www.arthur.ai", "AI performance monitoring and guardrails."],
  ["Aporia", "model-monitoring", "https://www.aporia.com", "AI control platform and guardrails."],
  ["WhyLabs", "model-monitoring", "https://whylabs.ai", "AI observability and data/model monitoring."],
  ["Evidently AI", "model-monitoring", "https://www.evidentlyai.com", "ML and LLM monitoring and evals."],
  ["DataDog LLM Observability", "observability-monitoring", "https://www.datadoghq.com/product/llm-observability/", "LLM observability in DataDog."],
  ["New Relic AI Monitoring", "observability-monitoring", "https://newrelic.com/platform/ai-monitoring", "AI app monitoring."],
  ["LangChain", "agent-runtime", "https://www.langchain.com", "LLM app and agent framework."],
  ["LangGraph", "agent-runtime", "https://www.langchain.com/langgraph", "Agent orchestration framework."],
  ["LlamaIndex", "rag-memory", "https://www.llamaindex.ai", "Data framework for LLM apps and agents."],
  ["Microsoft Semantic Kernel", "agent-runtime", "https://github.com/microsoft/semantic-kernel", "Agent SDK and orchestration."],
  ["Microsoft AutoGen", "agent-runtime", "https://github.com/microsoft/autogen", "Multi-agent programming framework."],
  ["CrewAI", "agent-runtime", "https://www.crewai.com", "Multi-agent automation framework."],
  ["OpenAI Swarm", "agent-runtime", "https://github.com/openai/swarm", "Experimental multi-agent orchestration."],
  ["OpenAI Agents SDK", "agent-runtime", "https://openai.github.io/openai-agents-python/", "Agent SDK."],
  ["Google ADK", "agent-runtime", "https://google.github.io/adk-docs/", "Agent development kit."],
  ["AWS Strands Agents", "agent-runtime", "https://strandsagents.com", "Agent SDK."],
  ["Agno", "agent-runtime", "https://github.com/agno-agi/agno", "Agent framework."],
  ["Pydantic AI", "agent-runtime", "https://ai.pydantic.dev", "Agent framework with typed validation."],
  ["Hugging Face smolagents", "agent-runtime", "https://github.com/huggingface/smolagents", "Lightweight agent framework."],
  ["Haystack", "rag-memory", "https://haystack.deepset.ai", "LLM/RAG pipeline framework."],
  ["DSPy", "agent-evaluation", "https://dspy.ai", "Programming model for optimizing LM pipelines."],
  ["Guidance", "tool-mcp-policy", "https://github.com/guidance-ai/guidance", "Constrained generation framework."],
  ["Outlines", "tool-mcp-policy", "https://github.com/dottxt-ai/outlines", "Structured generation."],
  ["Letta", "rag-memory", "https://www.letta.com", "Stateful agents and memory."],
  ["MemGPT", "rag-memory", "https://github.com/cpacker/MemGPT", "LLM memory agents."],
  ["AutoGPT", "agent-runtime", "https://github.com/Significant-Gravitas/AutoGPT", "Autonomous agent platform."],
  ["SuperAGI", "agent-runtime", "https://superagi.com", "Autonomous AI agent framework."],
  ["MetaGPT", "agent-runtime", "https://github.com/geekan/MetaGPT", "Multi-agent software company framework."],
  ["CAMEL AI", "agent-runtime", "https://www.camel-ai.org", "Multi-agent framework and society simulation."],
  ["AgentScope", "agent-runtime", "https://github.com/modelscope/agentscope", "Multi-agent platform."],
  ["Langroid", "agent-runtime", "https://github.com/langroid/langroid", "Multi-agent LLM framework."],
  ["Griptape", "agent-runtime", "https://www.griptape.ai", "AI application framework."],
  ["Julep", "agent-runtime", "https://www.julep.ai", "Agent platform."],
  ["Dify", "workflow-automation", "https://dify.ai", "LLM app and agent workflow platform."],
  ["Flowise", "workflow-automation", "https://flowiseai.com", "Low-code LLM workflow builder."],
  ["Langflow", "workflow-automation", "https://www.langflow.org", "Visual agent workflow builder."],
  ["n8n", "workflow-automation", "https://n8n.io", "Workflow automation with AI nodes."],
  ["Zapier AI", "workflow-automation", "https://zapier.com/ai", "AI automation platform."],
  ["Dust", "workflow-automation", "https://dust.tt", "Enterprise AI assistants and workflows."],
  ["Relevance AI", "workflow-automation", "https://relevanceai.com", "AI workforce and agents."],
  ["Aisera", "workflow-automation", "https://aisera.com", "Enterprise AI service agents."],
  ["Moveworks", "workflow-automation", "https://www.moveworks.com", "Enterprise AI agents."],
  ["Cognition Devin", "agent-runtime", "https://www.cognition.ai", "AI software engineer agent."],
  ["OpenHands", "agent-runtime", "https://github.com/All-Hands-AI/OpenHands", "Open-source software development agents."],
  ["SWE-agent", "agent-evaluation", "https://github.com/SWE-agent/SWE-agent", "Software engineering agent and benchmark tooling."],
  ["SWE-bench", "agent-evaluation", "https://www.swebench.com", "Software engineering agent benchmark."],
  ["Browserbase", "agent-runtime", "https://www.browserbase.com", "Browser infrastructure for agents."],
  ["E2B", "agent-runtime", "https://e2b.dev", "Secure sandboxes for AI agents."],
  ["Daytona", "agent-runtime", "https://www.daytona.io", "Development environments for AI agents."],
  ["Modal", "llmops-routing-cost", "https://modal.com", "Cloud runtime for AI workloads."],
  ["Baseten", "llmops-routing-cost", "https://www.baseten.co", "AI inference and deployment platform."],
  ["Together AI", "llmops-routing-cost", "https://www.together.ai", "Inference platform."],
  ["Fireworks AI", "llmops-routing-cost", "https://fireworks.ai", "Inference platform and model serving."],
  ["OpenRouter", "llmops-routing-cost", "https://openrouter.ai", "Model router."],
  ["LiteLLM", "llmops-routing-cost", "https://www.litellm.ai", "LLM gateway/proxy."],
  ["Vellum", "eval-observability", "https://www.vellum.ai", "Prompt workflows and evals."],
  ["Scale Donovan", "governance-compliance", "https://scale.com/donovan", "Enterprise AI platform."],
  ["Credo AI", "governance-compliance", "https://www.credo.ai", "AI governance platform."],
  ["Monitaur", "governance-compliance", "https://www.monitaur.ai", "AI governance and audit."],
  ["Fairly AI", "governance-compliance", "https://www.fairly.ai", "AI governance and risk."],
  ["Holistic AI", "governance-compliance", "https://www.holisticai.com", "AI governance platform."],
  ["Saidot", "governance-compliance", "https://www.saidot.ai", "AI governance."],
  ["ValidMind", "governance-compliance", "https://validmind.com", "Model risk management and validation."],
  ["ModelOp", "governance-compliance", "https://www.modelop.com", "AI governance and model ops."],
  ["Truera", "model-monitoring", "https://truera.com", "AI quality and monitoring."],
  ["BigID", "governance-compliance", "https://bigid.com", "Data security and governance for AI."],
  ["OneTrust AI Governance", "governance-compliance", "https://www.onetrust.com/products/ai-governance/", "AI governance workflows."],
  ["IBM watsonx.governance", "governance-compliance", "https://www.ibm.com/products/watsonx-governance", "AI governance platform."],
  ["Microsoft Azure AI Foundry", "governance-compliance", "https://azure.microsoft.com/products/ai-foundry", "Enterprise AI platform and evaluation."],
  ["Google Vertex AI Evaluation", "agent-evaluation", "https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview", "Managed model evaluation."],
  ["AWS Bedrock Guardrails", "safety-security", "https://aws.amazon.com/bedrock/guardrails/", "Managed guardrails for Bedrock."],
  ["Anthropic Console Evals", "agent-evaluation", "https://docs.anthropic.com", "Model evaluation and prompt tooling."],
  ["OpenAI Evals and Traces", "agent-evaluation", "https://platform.openai.com/docs/guides/evals", "Evals and tracing platform."]
].map(([name, category, url, note], index) => ({
  id: `COMP-${String(index + 1).padStart(3, "0")}`,
  name,
  sourceCategory: category,
  category: normalizeSeedCategory(category, `${name} ${note}`),
  url,
  note,
  retrievedAt: retrievalDate
}));

const gapTemplates = {
  "agent-evaluation": {
    priority: "P0",
    title: "Strengthen evidence-linked agent evaluation",
    recommendation: "Add or deepen benchmark-backed scoring that ties every evaluation result to signed evidence, replayable datasets, and regression thresholds.",
    acceptance: ["A reproducible eval pack exists", "Each eval row links to signed evidence", "Regression thresholds fail closed in CI or lifecycle runs"]
  },
  "agent-runtime": {
    priority: "P1",
    title: "Unify agent runtime lifecycle evidence",
    recommendation: "Represent agent plans, tools, memory, handoffs, and state transitions as a signed lifecycle graph that can be replayed and scored.",
    acceptance: ["Runtime graph is exported", "Tool and handoff edges have receipts", "Fleet view can compare runtime health across agents"]
  },
  "safety-security": {
    priority: "P0",
    title: "Expand runtime security and red-team proof",
    recommendation: "Turn security findings into deterministic guard decisions, exploit evidence, remediation receipts, and regression tests.",
    acceptance: ["Attack traces are preserved", "Guard decisions have signed receipts", "Fix validation reruns the exploit and regression suite"]
  },
  "governance-compliance": {
    priority: "P0",
    title: "Deepen governance and audit readiness",
    recommendation: "Map controls to source-backed obligations, preserve evidence lineage, and produce auditor-ready deltas and exceptions.",
    acceptance: ["Control mapping cites source", "Exception workflow is signed", "Audit export contains evidence chain and owner"]
  },
  "observability-monitoring": {
    priority: "P1",
    title: "Improve production observability and trace mining",
    recommendation: "Index traces by failure mode, risk event, prompt/tool boundary, latency, cost, and remediation state.",
    acceptance: ["Trace index supports search", "Failure clusters are generated", "Studio shows live risk/cost/latency trends"]
  },
  "rag-memory": {
    priority: "P1",
    title: "Benchmark RAG and memory reliability",
    recommendation: "Add retrieval, memory mutation, grounding, poisoning, staleness, and provenance tests to maturity gates.",
    acceptance: ["RAG eval fixtures exist", "Memory writes are policy checked", "Grounding failures create scored findings"]
  },
  "tool-mcp-policy": {
    priority: "P0",
    title: "Harden tool and MCP permission policy",
    recommendation: "Add least-privilege, schema, consent, sandbox, and blast-radius checks for every tool/MCP invocation.",
    acceptance: ["Tool contracts are signed", "Unsafe calls are blocked before execution", "MCP server risk posture affects score"]
  },
  "llmops-routing-cost": {
    priority: "P2",
    title: "Add LLMOps routing, cost, and SLO maturity",
    recommendation: "Score routing policy, fallback safety, cost budgets, latency SLOs, provider drift, and outage behavior.",
    acceptance: ["Routing policy has tests", "Cost and latency budgets are visible", "Provider fallback emits evidence"]
  },
  "human-oversight": {
    priority: "P1",
    title: "Make human oversight measurable",
    recommendation: "Score escalation quality, reviewer independence, approval latency, override frequency, and post-hoc review coverage.",
    acceptance: ["Approvals have reviewer metadata", "Escalation misses create findings", "Override trends are reported"]
  },
  "standards-protocols": {
    priority: "P2",
    title: "Improve standards and interoperability",
    recommendation: "Export AMC claims, scores, policies, and receipts in interoperable schemas with versioned compatibility tests.",
    acceptance: ["Schema exports are versioned", "Compatibility tests cover imports/exports", "Passport/API docs match implementation"]
  }
};

const improvementDimensions = [
  {
    id: "eval-replay-corpus",
    categories: ["agent-evaluation"],
    keywords: ["benchmark", "eval", "dataset", "test suite", "leaderboard"],
    label: "Replayable benchmark corpus",
    action: "Add versioned eval manifests, fixed seeds, and replay commands that reproduce score deltas from source-linked datasets.",
    modules: ["src/eval", "src/diagnostic", "tests"],
    effort: "M",
    risk: "AMC scores can look defensible without letting auditors rerun the exact benchmark evidence.",
    evidenceNeed: "Replay manifest, fixture hash, score delta, and CI receipt"
  },
  {
    id: "eval-metric-validity",
    categories: ["agent-evaluation"],
    keywords: ["metric", "validity", "reliability", "correlation", "score"],
    label: "Metric validity and reliability checks",
    action: "Track construct validity, inter-rater agreement, test-retest stability, and confidence intervals for each maturity metric.",
    modules: ["src/score", "src/diagnostic", "docs"],
    effort: "L",
    risk: "Customers may optimize for scores that do not predict real operational trust or safety.",
    evidenceNeed: "Validation table, confidence interval, sample size, and metric owner"
  },
  {
    id: "eval-adversarial-regression",
    categories: ["agent-evaluation", "safety-security"],
    keywords: ["adversarial", "red team", "attack", "jailbreak", "guardrail"],
    label: "Adversarial benchmark regression",
    action: "Convert adversarial task failures into persistent eval cases with pass/fail thresholds and release blocking rules.",
    modules: ["src/assurance", "src/redteam", "tests"],
    effort: "M",
    risk: "Previously fixed agent failures can silently reappear after prompt, model, or policy changes.",
    evidenceNeed: "Exploit fixture, expected decision, rerun output, and release gate receipt"
  },
  {
    id: "eval-judge-calibration",
    categories: ["agent-evaluation"],
    keywords: ["judge", "llm-as-judge", "calibration", "confidence", "rubric"],
    label: "Judge calibration and appeal path",
    action: "Store judge prompts, calibration examples, disagreement rates, and an appeal workflow for contested scores.",
    modules: ["src/eval", "src/score", "src/studio"],
    effort: "M",
    risk: "LLM judging can introduce opaque scoring drift that operators cannot inspect or challenge.",
    evidenceNeed: "Rubric version, calibration set, disagreement metric, and appeal outcome"
  },
  {
    id: "eval-score-explainability",
    categories: ["agent-evaluation", "standards-protocols"],
    keywords: ["explain", "diagnostic", "assessment", "score", "provenance"],
    label: "Question-level score explainability",
    action: "Expose why each L0-L5 question moved, which evidence was accepted, and which gates were missing.",
    modules: ["src/diagnostic", "src/guide", "src/passport"],
    effort: "S",
    risk: "Teams receive a maturity label without a concrete repair path for the failing control.",
    evidenceNeed: "Question ID, accepted evidence IDs, rejected evidence reasons, and repair hint"
  },
  {
    id: "runtime-lifecycle-graph",
    categories: ["agent-runtime"],
    keywords: ["workflow", "orchestration", "runtime", "planning", "state"],
    label: "Signed runtime lifecycle graph",
    action: "Record plan, tool, memory, handoff, retry, and finalization nodes as a signed graph per agent run.",
    modules: ["src/runtime", "src/lifecycle", "src/ledger"],
    effort: "L",
    risk: "Operators cannot reconstruct how an agent moved from intent to action during incidents.",
    evidenceNeed: "Graph export, node receipts, edge timestamps, and replay result"
  },
  {
    id: "runtime-handoff-contracts",
    categories: ["agent-runtime", "human-oversight"],
    keywords: ["multi-agent", "handoff", "coordination", "collaboration", "workflow"],
    label: "Multi-agent handoff contracts",
    action: "Define signed handoff payload schemas, ownership transfer, dependency status, and refusal reasons across agents.",
    modules: ["src/fleet", "src/runtime", "src/passport"],
    effort: "M",
    risk: "Multi-agent work can lose accountability when tasks cross agent boundaries.",
    evidenceNeed: "Handoff schema, sender receipt, receiver receipt, and unresolved-dependency log"
  },
  {
    id: "runtime-state-checkpointing",
    categories: ["agent-runtime", "rag-memory"],
    keywords: ["state", "checkpoint", "memory", "context", "resume"],
    label: "State checkpoint and rollback proof",
    action: "Create signed checkpoints before risky state transitions and verify restore behavior during test runs.",
    modules: ["src/runtime", "src/watch", "src/vault"],
    effort: "M",
    risk: "Long-running agents can resume from stale or corrupted state without visible proof.",
    evidenceNeed: "Checkpoint hash, restore test, state diff, and retention policy"
  },
  {
    id: "runtime-autonomy-boundaries",
    categories: ["agent-runtime", "tool-mcp-policy"],
    keywords: ["autonomous", "approval", "permission", "capability", "policy"],
    label: "Autonomy boundary gates",
    action: "Attach risk-tiered autonomy limits to plan steps and block actions that cross approved authority.",
    modules: ["src/enforce", "src/runtime", "src/fleet"],
    effort: "M",
    risk: "Agents may perform actions above their authorized autonomy level without a blocking control.",
    evidenceNeed: "Policy decision, risk tier, requested authority, and block or approval receipt"
  },
  {
    id: "runtime-repair-loop",
    categories: ["agent-runtime", "observability-monitoring"],
    keywords: ["repair", "retry", "failure", "remediation", "self-heal"],
    label: "Failure-to-repair loop",
    action: "Link failures to triage notes, repair attempts, regression tests, and closure receipts.",
    modules: ["src/watch", "src/incidents", "src/guide"],
    effort: "M",
    risk: "Operational failures may be observed but not converted into durable product improvements.",
    evidenceNeed: "Failure cluster, repair action, regression test, and closure owner"
  },
  {
    id: "security-prompt-injection-suite",
    categories: ["safety-security", "rag-memory"],
    keywords: ["prompt injection", "jailbreak", "malicious", "retrieval", "rag"],
    label: "Prompt injection regression suite",
    action: "Maintain direct, indirect, multimodal, and retrieved-content injection fixtures mapped to blocking policies.",
    modules: ["src/redteam", "src/assurance", "tests"],
    effort: "M",
    risk: "RAG and tool-using agents remain vulnerable to known instruction hierarchy failures.",
    evidenceNeed: "Attack fixture, policy mapping, observed decision, and regression status"
  },
  {
    id: "security-redteam-ledger",
    categories: ["safety-security"],
    keywords: ["red team", "exploit", "attack", "vulnerability", "malicious"],
    label: "Red-team exploit ledger",
    action: "Store exploit attempts, severity, reproducibility, mitigation owner, and retest receipts in the AMC ledger.",
    modules: ["src/redteam", "src/ledger", "src/incidents"],
    effort: "M",
    risk: "Security work becomes anecdotal and cannot prove that a mitigation fixed the exploit.",
    evidenceNeed: "Exploit record, severity, fix commit, retest run, and owner"
  },
  {
    id: "security-guard-receipts",
    categories: ["safety-security", "tool-mcp-policy"],
    keywords: ["guardrail", "policy", "decision", "block", "allow"],
    label: "Guard decision receipts",
    action: "Emit a compact signed receipt for every allow, block, redact, step-up, or escalate decision.",
    modules: ["src/enforce", "src/shield", "src/ledger"],
    effort: "S",
    risk: "Operators cannot explain why a risky action was permitted or denied.",
    evidenceNeed: "Decision type, matched rule, input hash, output hash, and signer"
  },
  {
    id: "security-supply-chain",
    categories: ["safety-security", "llmops-routing-cost"],
    keywords: ["supply chain", "dependency", "provider", "model", "deployment"],
    label: "Model and tool supply-chain posture",
    action: "Score providers, models, tools, datasets, and MCP servers for provenance, version pinning, and vulnerability exposure.",
    modules: ["src/security", "src/plugins", "src/api"],
    effort: "L",
    risk: "Trusted agent runs may depend on unpinned or vulnerable upstream components.",
    evidenceNeed: "Component inventory, version hash, vulnerability state, and allowed-source policy"
  },
  {
    id: "security-incident-regression",
    categories: ["safety-security", "observability-monitoring"],
    keywords: ["incident", "failure", "regression", "monitor", "alert"],
    label: "Incident-to-regression pipeline",
    action: "Automatically propose regression tests from incident traces and require validation before closure.",
    modules: ["src/incidents", "src/watch", "tests"],
    effort: "M",
    risk: "Known production failures can close without becoming future safeguards.",
    evidenceNeed: "Incident trace, generated test, validation run, and closure status"
  },
  {
    id: "gov-control-crosswalk",
    categories: ["governance-compliance", "standards-protocols"],
    keywords: ["compliance", "regulation", "control", "standard", "policy"],
    label: "Control crosswalk coverage",
    action: "Map AMC controls to NIST AI RMF, ISO 42001, EU AI Act, SOC 2, and sector obligations with source citations.",
    modules: ["src/compliance", "src/score", "docs"],
    effort: "L",
    risk: "Enterprise buyers cannot translate AMC results into their mandatory control frameworks.",
    evidenceNeed: "Framework clause, AMC question IDs, evidence type, owner, and exception state"
  },
  {
    id: "gov-auditor-binder",
    categories: ["governance-compliance"],
    keywords: ["audit", "assurance", "evidence", "accountability"],
    label: "Auditor-ready evidence binder",
    action: "Package score, policy, exception, incident, and cryptographic receipts into a reviewable binder by control family.",
    modules: ["src/audit", "src/passport", "src/vault"],
    effort: "M",
    risk: "AMC may produce many artifacts without a reviewer-friendly audit path.",
    evidenceNeed: "Binder manifest, control index, receipt hashes, and reviewer notes"
  },
  {
    id: "gov-exception-workflow",
    categories: ["governance-compliance", "human-oversight"],
    keywords: ["exception", "waiver", "approval", "risk", "policy"],
    label: "Exception and waiver lifecycle",
    action: "Track policy exceptions from request through approval, expiry, compensating control, and renewal decision.",
    modules: ["src/compliance", "src/enforce", "src/incidents"],
    effort: "M",
    risk: "Temporary risk acceptances can become permanent unmanaged gaps.",
    evidenceNeed: "Exception request, approver, expiry, compensating control, and renewal outcome"
  },
  {
    id: "gov-policy-drift",
    categories: ["governance-compliance", "observability-monitoring"],
    keywords: ["policy", "drift", "change", "version", "governance"],
    label: "Policy drift and change impact",
    action: "Diff policy versions and estimate affected agents, tests, controls, and prior decisions before rollout.",
    modules: ["src/policy", "src/fleet", "src/watch"],
    effort: "M",
    risk: "Policy changes can invalidate previous approvals without warning.",
    evidenceNeed: "Policy diff, affected agents, recheck list, and rollout receipt"
  },
  {
    id: "gov-third-party-risk",
    categories: ["governance-compliance", "llmops-routing-cost"],
    keywords: ["third-party", "vendor", "provider", "risk", "model risk"],
    label: "Third-party agent and provider risk",
    action: "Capture vendor attestations, data processing posture, model restrictions, and contract obligations in AMC evidence.",
    modules: ["src/compliance", "src/passport", "src/trust"],
    effort: "L",
    risk: "Agents may inherit external provider risk that is invisible in the maturity score.",
    evidenceNeed: "Provider record, attestation, data boundary, contractual control, and review date"
  },
  {
    id: "obs-trace-taxonomy",
    categories: ["observability-monitoring"],
    keywords: ["trace", "span", "logging", "debug", "telemetry"],
    label: "Trace failure taxonomy",
    action: "Classify traces by prompt, retrieval, tool, policy, latency, cost, and human-review failure modes.",
    modules: ["src/watch", "src/observability", "src/studio"],
    effort: "M",
    risk: "Teams see raw traces but cannot aggregate repeated failure patterns.",
    evidenceNeed: "Trace schema, taxonomy label, cluster ID, and linked remediation"
  },
  {
    id: "obs-risk-cost-latency-slo",
    categories: ["observability-monitoring", "llmops-routing-cost"],
    keywords: ["cost", "latency", "slo", "monitor", "production"],
    label: "Risk, cost, and latency SLOs",
    action: "Define per-agent SLOs that combine reliability, risk incidents, token cost, latency, and escalation rate.",
    modules: ["src/observability", "src/watch", "src/fleet"],
    effort: "M",
    risk: "An agent can be safe but unusable, cheap but risky, or fast but ungoverned without a combined operating view.",
    evidenceNeed: "SLO definition, time window, breach evidence, and alert routing"
  },
  {
    id: "obs-live-drift-alerts",
    categories: ["observability-monitoring", "agent-evaluation"],
    keywords: ["drift", "monitor", "production", "alert", "score"],
    label: "Live score and behavior drift alerts",
    action: "Compare production traces to baseline eval distributions and alert on material score or behavior drift.",
    modules: ["src/watch", "src/drift", "src/score"],
    effort: "L",
    risk: "A previously mature agent can degrade after traffic, provider, prompt, or data changes.",
    evidenceNeed: "Baseline distribution, live sample, drift statistic, and alert receipt"
  },
  {
    id: "obs-session-correlation",
    categories: ["observability-monitoring", "agent-runtime"],
    keywords: ["session", "correlation", "trace", "run", "workflow"],
    label: "Cross-surface session correlation",
    action: "Use a stable run/session ID across Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport, and API events.",
    modules: ["src/lifecycle", "src/api", "src/watch"],
    effort: "S",
    risk: "Evidence from different AMC surfaces may not join into one inspectable run story.",
    evidenceNeed: "Session ID, surface event list, timestamp chain, and missing-event checks"
  },
  {
    id: "obs-studio-drilldown",
    categories: ["observability-monitoring", "agent-evaluation"],
    keywords: ["dashboard", "studio", "observability", "evidence", "trace"],
    label: "Studio evidence drilldown",
    action: "Let operators open a score finding and drill into traces, receipts, policy rules, and source artifacts.",
    modules: ["src/studio", "src/console", "src/watch"],
    effort: "M",
    risk: "Users cannot act on findings quickly because proof is scattered across CLI artifacts.",
    evidenceNeed: "UI route, source artifact links, evidence preview, and empty/error states"
  },
  {
    id: "rag-grounding-eval",
    categories: ["rag-memory"],
    keywords: ["retrieval", "grounding", "rag", "citation", "knowledge"],
    label: "Grounding and retrieval evaluation",
    action: "Score answer faithfulness, retrieved support quality, contradiction handling, and unsupported claim rate.",
    modules: ["src/score", "src/rag", "src/truthguard"],
    effort: "M",
    risk: "RAG agents can look mature while producing unsupported or stale claims.",
    evidenceNeed: "Query set, retrieved chunks, claim labels, and faithfulness score"
  },
  {
    id: "rag-memory-policy",
    categories: ["rag-memory", "tool-mcp-policy"],
    keywords: ["memory", "mutation", "write", "context", "state"],
    label: "Memory mutation policy",
    action: "Require policy checks, retention tags, provenance, and rollback for every durable memory write.",
    modules: ["src/memory", "src/vault", "src/enforce"],
    effort: "M",
    risk: "Agents can persist incorrect, sensitive, or policy-violating memory across sessions.",
    evidenceNeed: "Memory write receipt, policy decision, retention tag, and rollback test"
  },
  {
    id: "rag-poisoning-staleness",
    categories: ["rag-memory", "safety-security"],
    keywords: ["poison", "stale", "embedding", "vector", "retrieval"],
    label: "Poisoning and staleness guards",
    action: "Detect suspicious retrieved content, outdated sources, embedding drift, and retrieval set manipulation.",
    modules: ["src/rag", "src/shield", "src/watch"],
    effort: "L",
    risk: "Attackers or stale corpora can steer agents through trusted retrieval channels.",
    evidenceNeed: "Source freshness, poisoning signal, rejected chunk, and guard decision"
  },
  {
    id: "rag-citation-provenance",
    categories: ["rag-memory", "standards-protocols"],
    keywords: ["citation", "provenance", "source", "claim", "grounding"],
    label: "Claim-level citation provenance",
    action: "Bind factual claims to source chunk IDs, retrieval timestamps, confidence, and source permissions.",
    modules: ["src/truthguard", "src/passport", "src/evidence"],
    effort: "M",
    risk: "Users cannot tell which claims are source-backed, inferred, or unsupported.",
    evidenceNeed: "Claim ID, source chunk ID, retrieval time, confidence, and permission status"
  },
  {
    id: "rag-refresh-lineage",
    categories: ["rag-memory", "governance-compliance"],
    keywords: ["refresh", "lineage", "knowledge", "dataset", "version"],
    label: "Knowledge refresh lineage",
    action: "Track corpus version, ingestion job, source approvals, deletion requests, and affected scores after each refresh.",
    modules: ["src/vault", "src/ingest", "src/compliance"],
    effort: "L",
    risk: "Knowledge updates can change agent behavior without auditable lineage.",
    evidenceNeed: "Corpus version, ingestion receipt, source approvals, and score impact"
  },
  {
    id: "tool-mcp-risk-attestation",
    categories: ["tool-mcp-policy"],
    keywords: ["mcp", "server", "tool", "attestation", "capability"],
    label: "MCP server risk attestation",
    action: "Require every MCP server to declare capabilities, data access, network reach, sandbox limits, and signer identity.",
    modules: ["src/mcp", "src/plugins", "src/passport"],
    effort: "M",
    risk: "A tool endpoint can gain high-risk capabilities without appearing in the maturity model.",
    evidenceNeed: "Server manifest, capability list, signer, sandbox policy, and last scan"
  },
  {
    id: "tool-least-privilege",
    categories: ["tool-mcp-policy", "safety-security"],
    keywords: ["least privilege", "permission", "capability", "function call", "api call"],
    label: "Least-privilege tool grants",
    action: "Generate per-task tool grants and expire unused permissions after the run or approval window.",
    modules: ["src/enforce", "src/plugins", "src/runtime"],
    effort: "M",
    risk: "Agents can retain broad permissions that exceed the current task need.",
    evidenceNeed: "Grant request, approved scope, expiry, used permissions, and unused permission report"
  },
  {
    id: "tool-sandbox-limits",
    categories: ["tool-mcp-policy", "llmops-routing-cost"],
    keywords: ["sandbox", "resource", "limit", "deployment", "network"],
    label: "Sandbox resource limit enforcement",
    action: "Set CPU, memory, IO, network, filesystem, and process limits for tool execution and record violations.",
    modules: ["src/plugins", "src/workspaces", "src/enforce"],
    effort: "M",
    risk: "Tool calls can exceed expected resource or network boundaries during autonomous work.",
    evidenceNeed: "Sandbox policy, observed usage, violation status, and enforcement receipt"
  },
  {
    id: "tool-schema-contracts",
    categories: ["tool-mcp-policy", "standards-protocols"],
    keywords: ["schema", "contract", "api", "function call", "tool"],
    label: "Tool schema contract enforcement",
    action: "Validate inputs, outputs, side effects, and failure modes against signed tool contracts.",
    modules: ["src/enforce", "src/api", "src/plugins"],
    effort: "M",
    risk: "Tool behavior can drift from descriptions and break policy assumptions.",
    evidenceNeed: "Tool contract, validation result, side-effect declaration, and drift finding"
  },
  {
    id: "tool-consent-blast-radius",
    categories: ["tool-mcp-policy", "human-oversight"],
    keywords: ["consent", "approval", "blast radius", "permission", "risk"],
    label: "Consent and blast-radius prompts",
    action: "Show users the resources, accounts, external systems, and irreversible effects before high-impact tool execution.",
    modules: ["src/enforce", "src/studio", "src/guide"],
    effort: "S",
    risk: "A human can approve an action without understanding its real operational blast radius.",
    evidenceNeed: "Consent prompt, summarized impact, reviewer decision, and executed scope"
  },
  {
    id: "llmops-router-fallback",
    categories: ["llmops-routing-cost"],
    keywords: ["routing", "fallback", "provider", "gateway", "model router"],
    label: "Router fallback safety checks",
    action: "Score whether provider fallback preserves safety policies, data residency, eval thresholds, and audit receipts.",
    modules: ["src/api", "src/observability", "src/compliance"],
    effort: "M",
    risk: "Outage fallback can route sensitive work to a provider or model that lacks required controls.",
    evidenceNeed: "Fallback policy, provider comparison, test run, and routing receipt"
  },
  {
    id: "llmops-provider-drift",
    categories: ["llmops-routing-cost", "agent-evaluation"],
    keywords: ["provider", "model", "drift", "benchmark", "deployment"],
    label: "Provider and model drift benchmark",
    action: "Run recurring canary evals across providers and alert when score, refusal, latency, or cost distributions shift.",
    modules: ["src/benchmarks", "src/watch", "src/api"],
    effort: "M",
    risk: "A model update can change agent behavior while the AMC score remains stale.",
    evidenceNeed: "Provider version, canary results, drift statistic, and alert or waiver"
  },
  {
    id: "llmops-cost-budget",
    categories: ["llmops-routing-cost", "observability-monitoring"],
    keywords: ["cost", "budget", "latency", "token", "slo"],
    label: "Per-agent cost budget evidence",
    action: "Set task and period budgets, forecast expected spend, and compare actual cost per run and per tool path.",
    modules: ["src/observability", "src/score", "src/fleet"],
    effort: "S",
    risk: "Agent maturity can improve while operating cost becomes commercially unsustainable.",
    evidenceNeed: "Budget, forecast, actual spend, variance, and owner decision"
  },
  {
    id: "llmops-release-gates",
    categories: ["llmops-routing-cost", "governance-compliance"],
    keywords: ["deployment", "release", "gate", "ci", "rollout"],
    label: "Deployment and release maturity gates",
    action: "Block agent rollout unless score, security, compliance, cost, and observability gates pass for the target environment.",
    modules: ["src/ci", "src/deploy", "src/fleet"],
    effort: "M",
    risk: "Teams can deploy immature agents even when AMC already knows required evidence is missing.",
    evidenceNeed: "Gate config, environment, run receipt, failure reason, and override status"
  },
  {
    id: "llmops-offline-degradation",
    categories: ["llmops-routing-cost", "agent-runtime"],
    keywords: ["outage", "offline", "degradation", "fallback", "deployment"],
    label: "Offline and degraded-mode behavior",
    action: "Define what each agent may do during provider outage, network loss, missing retrieval, or policy service failure.",
    modules: ["src/runtime", "src/api", "src/enforce"],
    effort: "M",
    risk: "Agents may fail open or produce unreliable answers during degraded operations.",
    evidenceNeed: "Failure mode, allowed behavior, test run, and operator-facing message"
  },
  {
    id: "human-escalation-quality",
    categories: ["human-oversight"],
    keywords: ["escalation", "reviewer", "approval", "human-in-the-loop", "hitl"],
    label: "Escalation quality scoring",
    action: "Score whether escalations include concise context, risk, options, missing evidence, and recommended reviewer action.",
    modules: ["src/enforce", "src/guide", "src/studio"],
    effort: "S",
    risk: "Human oversight becomes a rubber stamp when escalation packets are incomplete.",
    evidenceNeed: "Escalation packet, reviewer role, completeness score, and outcome"
  },
  {
    id: "human-reviewer-independence",
    categories: ["human-oversight", "governance-compliance"],
    keywords: ["independence", "reviewer", "approval", "audit", "accountability"],
    label: "Reviewer independence proof",
    action: "Record reviewer identity, role separation, conflict flags, and second-review requirements for high-risk actions.",
    modules: ["src/compliance", "src/audit", "src/passport"],
    effort: "M",
    risk: "High-risk approvals may lack independence or create conflicts of interest.",
    evidenceNeed: "Reviewer metadata, separation rule, conflict check, and approval receipt"
  },
  {
    id: "human-override-analytics",
    categories: ["human-oversight", "observability-monitoring"],
    keywords: ["override", "approval", "review", "trend", "monitor"],
    label: "Override and near-miss analytics",
    action: "Track human overrides, ignored escalations, near misses, and repeated approval patterns by agent and use case.",
    modules: ["src/watch", "src/compliance", "src/fleet"],
    effort: "M",
    risk: "Systematic review failures remain invisible until an incident occurs.",
    evidenceNeed: "Override event, reason code, trend window, near-miss link, and action taken"
  },
  {
    id: "human-approval-latency",
    categories: ["human-oversight", "llmops-routing-cost"],
    keywords: ["approval", "latency", "slo", "human", "workflow"],
    label: "Approval latency SLO",
    action: "Measure time-to-review by risk tier and route overdue approvals to fallback reviewers or degraded-mode behavior.",
    modules: ["src/watch", "src/enforce", "src/fleet"],
    effort: "S",
    risk: "Human gates can make agents unusable or encourage bypasses if review latency is unmanaged.",
    evidenceNeed: "Risk tier, queue time, reviewer action time, breach status, and fallback"
  },
  {
    id: "human-posthoc-audit",
    categories: ["human-oversight", "governance-compliance"],
    keywords: ["post-hoc", "review", "audit", "sample", "oversight"],
    label: "Post-hoc human audit sampling",
    action: "Sample completed autonomous actions for human review and feed issues back into scoring and regression tests.",
    modules: ["src/audit", "src/score", "src/incidents"],
    effort: "M",
    risk: "Approved autonomy can drift beyond policy without retrospective detection.",
    evidenceNeed: "Sample plan, reviewed actions, findings, corrective action, and score impact"
  },
  {
    id: "std-passport-schema",
    categories: ["standards-protocols"],
    keywords: ["passport", "schema", "interoperability", "attestation", "provenance"],
    label: "Passport schema compatibility",
    action: "Version AMC Passport fields and validate import/export compatibility with prior versions and partner systems.",
    modules: ["src/passport", "src/api", "tests"],
    effort: "M",
    risk: "Trust evidence becomes hard to exchange as schema versions evolve.",
    evidenceNeed: "Schema version, fixture corpus, import/export result, and compatibility matrix"
  },
  {
    id: "std-receipt-interchange",
    categories: ["standards-protocols", "governance-compliance"],
    keywords: ["receipt", "attestation", "signature", "provenance", "standard"],
    label: "Signed receipt interchange",
    action: "Define a small interoperable receipt format for score, policy, tool, audit, and lifecycle events.",
    modules: ["src/ledger", "src/passport", "docs"],
    effort: "M",
    risk: "AMC evidence may be cryptographically strong but difficult for external auditors to consume.",
    evidenceNeed: "Receipt schema, example receipts, signature verification, and external consumer test"
  },
  {
    id: "std-api-contracts",
    categories: ["standards-protocols", "tool-mcp-policy"],
    keywords: ["api", "contract", "schema", "interoperability", "protocol"],
    label: "API contract conformance",
    action: "Generate and test OpenAPI/JSON Schema contracts for AMC surfaces and fail when implementation drifts.",
    modules: ["src/api", "docs", "tests"],
    effort: "M",
    risk: "Integrators cannot rely on stable AMC surface behavior.",
    evidenceNeed: "Contract version, generated schema, conformance test, and breaking-change note"
  },
  {
    id: "std-interoperability-fixtures",
    categories: ["standards-protocols", "agent-runtime"],
    keywords: ["interoperability", "protocol", "workflow", "agent", "schema"],
    label: "Partner interoperability fixtures",
    action: "Maintain fixtures that import and export evidence across adjacent agent, eval, governance, and observability tools.",
    modules: ["src/integrations", "src/passport", "tests"],
    effort: "L",
    risk: "AMC can become a strong local system that is hard to adopt in mixed enterprise stacks.",
    evidenceNeed: "Partner fixture, round-trip result, unsupported field list, and owner"
  },
  {
    id: "std-public-methodology",
    categories: ["standards-protocols", "agent-evaluation"],
    keywords: ["methodology", "standard", "score", "benchmark", "governance"],
    label: "Public methodology versioning",
    action: "Publish versioned scoring methodology, known limitations, evidence taxonomy, and change logs for score semantics.",
    modules: ["docs", "src/diagnostic", "src/badge"],
    effort: "S",
    risk: "Score changes can surprise users and weaken external trust in AMC badges.",
    evidenceNeed: "Methodology version, changelog, deprecation notice, and migration guidance"
  }
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(path, rows, columns) {
  ensureDir(dirname(path));
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => csvCell(row[col])).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function abstractFromOpenAlex(work) {
  const index = work.abstract_inverted_index;
  if (!index || typeof index !== "object") {
    return "";
  }
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

function classify(text) {
  const lowered = text.toLowerCase();
  const scored = categories.map((category) => ({
    id: category.id,
    score: category.keywords.reduce((sum, keyword) => sum + (lowered.includes(keyword.toLowerCase()) ? 1 : 0), 0)
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (scored[0]?.score === 0) {
    return ["agent-runtime"];
  }
  return scored.filter((row) => row.score > 0).slice(0, 3).map((row) => row.id);
}

function normalizeSeedCategory(category, text) {
  if (categories.some((row) => row.id === category)) {
    return category;
  }
  if (categoryAliases[category]) {
    return categoryAliases[category];
  }
  return classify(text)[0] ?? "agent-runtime";
}

function categoryLabel(categoryId) {
  return categories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

function categorySurfaces(categoryId) {
  return categories.find((category) => category.id === categoryId)?.surfaces ?? [];
}

function selectImprovementDimension({ text, categoryId, index }) {
  const lowered = text.toLowerCase();
  const categoryPool = improvementDimensions.filter((dimension) => dimension.categories.includes(categoryId));
  const scoredPool = (categoryPool.length > 0 ? categoryPool : improvementDimensions)
    .map((dimension, position) => ({
      dimension,
      position,
      score: dimension.keywords.reduce((sum, keyword) => sum + (lowered.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score || a.position - b.position);
  const matched = scoredPool.filter((row) => row.score > 0).map((row) => row.dimension);
  const pool = matched.length >= 2 ? matched : (categoryPool.length > 0 ? categoryPool : improvementDimensions);
  return pool[index % pool.length];
}

function priorityRationaleFor(priority, sourceType, categoryId, dimension, existingSignal) {
  const urgency = {
    P0: "it affects core trust, security, correctness, or audit credibility",
    P1: "it blocks strong enterprise adoption or repeated operational use",
    P2: "it improves maturity depth but is not the first launch blocker",
    P3: "it is a longer-horizon differentiator"
  }[priority] ?? "it needs prioritization review";
  return `${priority}: ${urgency}. Source type=${sourceType}; research category=${categoryLabel(categoryId)}; improvement dimension=${dimension.label}; current AMC signal=${existingSignal}.`;
}

function implementationDirectionFor(categoryId, dimension) {
  return `Start in ${dimension.modules.join(", ")}. ${dimension.action} Bind the output to ${categorySurfaces(categoryId).join(", ")} so Score findings, runtime receipts, and operator views share the same evidence chain.`;
}

function sourceReliabilityFor(sourceType, evidence) {
  if (sourceType === "paper") {
    return "OpenAlex 2026 metadata; use paper URL/DOI for manual abstract and method review before public citation.";
  }
  if (sourceType === "github_repo") {
    return `GitHub Search API repository metadata; inspect README, license, stars, and source code before claiming parity. Evidence snippet: ${evidence.slice(0, 120)}`;
  }
  return "Curated competitor or adjacent-product seed; verify current product claims before public comparison.";
}

function nextStepFor(priority, dimension) {
  if (priority === "P0") {
    return `Create a failing acceptance fixture for ${dimension.id}, then implement the smallest AMC surface change that produces the required receipt.`;
  }
  if (priority === "P1") {
    return `Draft the product workflow and add one representative fixture for ${dimension.id}.`;
  }
  return `Track as a backlog candidate with a lightweight spike and evidence sample for ${dimension.id}.`;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": userAgent } });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function collectOpenAlexPapers() {
  const byId = new Map();
  for (const query of paperQueries) {
    let cursor = "*";
    for (let page = 0; page < 4 && byId.size < targetPapers + 120; page += 1) {
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("search", query);
      url.searchParams.set("filter", `from_publication_date:2026-01-01,to_publication_date:${retrievalDate}`);
      url.searchParams.set("per-page", "200");
      url.searchParams.set("cursor", cursor);
      url.searchParams.set("mailto", "research@agentmaturity.local");
      const json = await fetchJson(url);
      for (const work of json.results ?? []) {
        if (work.publication_year !== 2026) {
          continue;
        }
        const abstract = abstractFromOpenAlex(work);
        const text = `${work.title ?? ""} ${abstract} ${(work.concepts ?? []).map((concept) => concept.display_name).join(" ")}`;
        const cats = classify(text);
        const id = work.id || work.doi || work.title;
        if (!id || byId.has(id)) {
          continue;
        }
        byId.set(id, {
          id,
          title: work.title ?? "Untitled",
          year: work.publication_year,
          publicationDate: work.publication_date ?? null,
          doi: work.doi ?? null,
          url: work.doi ?? work.primary_location?.landing_page_url ?? work.id ?? null,
          openAlexUrl: work.id ?? null,
          source: "OpenAlex",
          query,
          citedByCount: work.cited_by_count ?? 0,
          venue: work.primary_location?.source?.display_name ?? null,
          authors: (work.authorships ?? []).slice(0, 8).map((auth) => auth.author?.display_name).filter(Boolean).join("; "),
          concepts: (work.concepts ?? []).slice(0, 8).map((concept) => concept.display_name).join("; "),
          categories: cats,
          abstract: abstract.slice(0, 1400),
          retrievedAt: retrievalDate
        });
      }
      cursor = json.meta?.next_cursor;
      if (!cursor) {
        break;
      }
      await sleep(160);
    }
    if (byId.size >= targetPapers + 50) {
      break;
    }
  }
  return [...byId.values()]
    .sort((a, b) => (b.citedByCount - a.citedByCount) || String(b.publicationDate).localeCompare(String(a.publicationDate)))
    .slice(0, targetPapers);
}

function ghApi(path, fields) {
  const args = ["api", "-X", "GET", path];
  for (const [key, value] of Object.entries(fields)) {
    args.push("-f", `${key}=${value}`);
  }
  const result = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000
  });
  if (result.status !== 0) {
    throw new Error(`gh api failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function collectGithubRepos() {
  const byName = new Map();
  for (const query of repoQueries) {
    for (let page = 1; page <= 4 && byName.size < targetRepos + 80; page += 1) {
      const json = ghApi("search/repositories", {
        q: query,
        sort: "stars",
        order: "desc",
        per_page: "100",
        page: String(page)
      });
      for (const repo of json.items ?? []) {
        if (!repo.full_name || byName.has(repo.full_name)) {
          continue;
        }
        const text = `${repo.full_name} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`;
        byName.set(repo.full_name, {
          id: `GH-${repo.id}`,
          fullName: repo.full_name,
          name: repo.name,
          owner: repo.owner?.login ?? "",
          url: repo.html_url,
          description: repo.description ?? "",
          stars: repo.stargazers_count ?? 0,
          forks: repo.forks_count ?? 0,
          language: repo.language ?? "",
          topics: (repo.topics ?? []).join("; "),
          license: repo.license?.spdx_id ?? "",
          pushedAt: repo.pushed_at ?? "",
          updatedAt: repo.updated_at ?? "",
          query,
          categories: classify(text),
          retrievedAt: retrievalDate
        });
      }
      if ((json.items ?? []).length < 100) {
        break;
      }
      await sleep(250);
    }
    if (byName.size >= targetRepos + 40) {
      break;
    }
  }
  return [...byName.values()]
    .sort((a, b) => (b.stars - a.stars) || a.fullName.localeCompare(b.fullName))
    .slice(0, targetRepos);
}

function walkFiles(startDir, filter) {
  const out = [];
  if (!existsSync(startDir)) {
    return out;
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
          continue;
        }
        walk(full);
      } else if (entry.isFile() && filter(full)) {
        out.push(full);
      }
    }
  };
  walk(startDir);
  return out;
}

function buildAmcCoverageIndex() {
  const files = [
    ...walkFiles(join(root, "docs"), (file) => /\.(md|json)$/i.test(file)),
    ...walkFiles(join(root, "src"), (file) => /\.(ts|js)$/i.test(file)),
    ...walkFiles(join(root, "tests"), (file) => /\.test\.ts$/i.test(file))
  ];
  const index = {};
  for (const category of categories) {
    const hits = [];
    for (const file of files) {
      let text = "";
      try {
        if (statSync(file).size > 1_500_000) {
          continue;
        }
        text = readFileSync(file, "utf8").toLowerCase();
      } catch {
        continue;
      }
      const score = category.keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
      if (score > 0) {
        hits.push({
          path: relative(root, file).replace(/\\/g, "/"),
          score
        });
      }
    }
    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    index[category.id] = {
      category: category.label,
      surfaces: category.surfaces,
      hitCount: hits.length,
      topPaths: hits.slice(0, 12),
      status: hits.length >= 25 ? "implemented-signals-present" : hits.length >= 5 ? "partial-signals-present" : "weak-local-signal"
    };
  }
  return index;
}

function priorityRank(priority) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[priority] ?? 9;
}

function priorityFor(categoryId, source, index) {
  const base = gapTemplates[categoryId]?.priority ?? "P2";
  if (source === "competitor" && index < 25 && base !== "P0") {
    return "P1";
  }
  if (source === "repo" && categoryId === "llmops-routing-cost") {
    return "P2";
  }
  return base;
}

function makeGap(params) {
  const categoryId = params.categoryId;
  const template = gapTemplates[categoryId] ?? gapTemplates["agent-runtime"];
  const priority = priorityFor(categoryId, params.sourceType, params.index);
  const sourceName = String(params.sourceTitle || params.sourceId).replace(/\s+/g, " ").trim();
  const local = params.coverage[categoryId];
  const existingSignal = local?.status ?? "unknown";
  const dimension = selectImprovementDimension({
    text: `${sourceName} ${params.evidence}`,
    categoryId,
    index: params.index
  });
  const priorityRationale = priorityRationaleFor(priority, params.sourceType, categoryId, dimension, existingSignal);
  const implementationDirection = implementationDirectionFor(categoryId, dimension);
  const surfaces = categorySurfaces(categoryId);
  return {
    id: `GAP-${String(params.serial).padStart(4, "0")}`,
    priority,
    categoryId,
    category: categoryLabel(categoryId),
    surfaces: surfaces.join("; "),
    title: `${dimension.label}: ${sourceName.slice(0, 96)}`,
    improvementDimensionId: dimension.id,
    improvementDimension: dimension.label,
    affectedModules: dimension.modules.join("; "),
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceTitle: params.sourceTitle,
    sourceUrl: params.sourceUrl ?? "",
    evidence: params.evidence.slice(0, 360),
    amcCurrentSignal: existingSignal,
    localEvidencePaths: (local?.topPaths ?? []).slice(0, 3).map((row) => row.path).join("; "),
    gap: `${template.title} needs a ${dimension.label.toLowerCase()} implementation path. Source signal: ${sourceName}.`,
    recommendation: `${dimension.action} ${template.recommendation}`,
    acceptanceCriteria: [...template.acceptance, dimension.evidenceNeed].join(" | "),
    rationale: `Research category '${categoryLabel(categoryId)}' maps to AMC surfaces ${surfaces.join(", ")}. ${priorityRationale} Local coverage should preserve existing primitives while adding source-driven proof depth.`,
    priorityRationale,
    implementationDirection,
    riskIfIgnored: `${dimension.risk} Current AMC signal is ${existingSignal}.`,
    effort: dimension.effort,
    evidenceNeeded: dimension.evidenceNeed,
    sourceReliability: sourceReliabilityFor(params.sourceType, params.evidence),
    nextStep: nextStepFor(priority, dimension),
    retrievedAt: retrievalDate
  };
}

function generateGaps({ papers, repos, competitors, coverage }) {
  const gaps = [];
  let serial = 1;
  const addGap = (gap) => {
    gaps.push(gap);
    serial += 1;
  };

  for (const [index, paper] of papers.entries()) {
    if (gaps.length >= Math.floor(targetGaps * 0.52)) {
      break;
    }
    const categoryId = paper.categories?.[0] ?? "agent-runtime";
    addGap(makeGap({
      serial,
      index,
      sourceType: "paper",
      sourceId: paper.id,
      sourceTitle: paper.title,
      sourceUrl: paper.url || paper.openAlexUrl,
      categoryId,
      evidence: `${paper.title}. Concepts: ${paper.concepts || "n/a"}. Abstract: ${paper.abstract || "No abstract in OpenAlex metadata."}`,
      coverage
    }));
  }

  for (const [index, repo] of repos.entries()) {
    if (gaps.length >= Math.floor(targetGaps * 0.82)) {
      break;
    }
    const categoryId = repo.categories?.[0] ?? "agent-runtime";
    addGap(makeGap({
      serial,
      index,
      sourceType: "github_repo",
      sourceId: repo.fullName,
      sourceTitle: repo.fullName,
      sourceUrl: repo.url,
      categoryId,
      evidence: `${repo.description || repo.fullName}. Stars=${repo.stars}; language=${repo.language}; topics=${repo.topics || "n/a"}.`,
      coverage
    }));
  }

  for (const [index, competitor] of competitors.entries()) {
    if (gaps.length >= targetGaps) {
      break;
    }
    const categoryId = competitor.category in gapTemplates ? competitor.category : classify(`${competitor.name} ${competitor.note}`)[0];
    addGap(makeGap({
      serial,
      index,
      sourceType: "competitor",
      sourceId: competitor.id,
      sourceTitle: competitor.name,
      sourceUrl: competitor.url,
      categoryId,
      evidence: competitor.note,
      coverage
    }));
  }

  gaps.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  return gaps.map((gap, index) => ({
    ...gap,
    id: `GAP-${String(index + 1).padStart(4, "0")}`
  }));
}

function countBy(items, getKey) {
  const out = {};
  for (const item of items) {
    const key = getKey(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function renderReport({ papers, repos, competitors, coverage, gaps, paths }) {
  const priorityCounts = countBy(gaps, (gap) => gap.priority);
  const gapCategoryCounts = countBy(gaps, (gap) => gap.categoryId);
  const paperCategoryCounts = countBy(papers.flatMap((paper) => paper.categories ?? []), (category) => category);
  const repoCategoryCounts = countBy(repos.flatMap((repo) => repo.categories ?? []), (category) => category);
  const competitorCategoryCounts = countBy(competitors, (competitor) => competitor.category);
  const dimensionCounts = countBy(gaps, (gap) => gap.improvementDimensionId);
  const dimensionById = new Map(improvementDimensions.map((dimension) => [dimension.id, dimension]));
  const topDimensions = Object.entries(dimensionCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 30)
    .map(([dimensionId, count]) => {
      const related = gaps.filter((gap) => gap.improvementDimensionId === dimensionId);
      const topCategories = Object.entries(countBy(related, (gap) => gap.categoryId))
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .map(([categoryId, categoryCount]) => `${categoryLabel(categoryId)} (${categoryCount})`)
        .join("; ");
      const dimension = dimensionById.get(dimensionId);
      return { dimensionId, count, topCategories, dimension };
    });
  const topP0 = gaps.filter((gap) => gap.priority === "P0").slice(0, 40);
  const rowsForPriority = (priority) => gaps
    .filter((gap) => gap.priority === priority)
    .map((gap) =>
      `| ${gap.id} | ${mdCell(gap.category)} | ${mdCell(gap.surfaces)} | ${mdCell(gap.improvementDimension)} | ${mdCell(gap.title)} | ${mdCell(gap.sourceType)}: ${mdCell(gap.sourceTitle)} | ${mdCell(gap.sourceUrl)} | ${mdCell(gap.priorityRationale)} | ${mdCell(gap.implementationDirection)} | ${mdCell(gap.riskIfIgnored)} | ${mdCell(gap.acceptanceCriteria)} |`
    );

  return [
    "# AMC 2026 Research, Competitor, and Repository Gap Report",
    "",
    `Generated UTC: ${new Date().toISOString()}`,
    `Retrieval date used for external filters: ${retrievalDate}`,
    "",
    "## Executive Summary",
    "",
    `This report compares AMC against ${papers.length} 2026 academic paper records, ${competitors.length} competitor or adjacent-product records, and ${repos.length} relevant GitHub repositories. It generates ${gaps.length} prioritized AMC improvement gaps with source IDs, URLs, AMC surface mapping, local coverage signals, priority rationale, implementation direction, risk if ignored, and acceptance criteria.`,
    "",
    "The local rolebook caveat was fixed before this research pass by creating and reading:",
    "",
    "- `AMC_OS/ROLEBOOKS/00_GLOBAL_STANDARDS.md`",
    "- `AMC_OS/ROLEBOOKS/10_REVENUE_DELIVERY.md`",
    "- `AMC_OS/ROLEBOOKS/20_INNOVATION.md`",
    "",
    "## Corpus Counts",
    "",
    "| Corpus | Required | Collected | Evidence File |",
    "|---|---:|---:|---|",
    `| 2026 academic papers | 500 | ${papers.length} | ${paths.papersJson} |`,
    `| Competitors / adjacent products | 100 | ${competitors.length} | ${paths.competitorsJson} |`,
    `| Similar GitHub repositories | 500 | ${repos.length} | ${paths.reposJson} |`,
    `| Prioritized gaps | 500 | ${gaps.length} | ${paths.gapsJson} |`,
    "",
    "## Methodology",
    "",
    "- Paper source: OpenAlex Works API, filtered to `from_publication_date:2026-01-01` and `to_publication_date:` the retrieval date, then classified by title, abstract, and concepts.",
    "- Repository source: GitHub Search API via `gh api search/repositories`, using agent/eval/security/RAG/observability/governance queries and deduplicating by full repository name.",
    "- Competitor source: curated competitor and adjacent-product seed set spanning evals, observability, LLM security, AI governance, agent frameworks, workflow automation, RAG/memory, LLMOps, and model monitoring.",
    "- AMC comparison: local docs, source, and tests were scanned for category keywords. This is a signal index, not proof that every feature is complete.",
    "- Gap generation: source category + AMC local signal + improvement dimension + affected modules + surface mapping + priority rationale + implementation direction + acceptance criteria. Each gap preserves source URL and retrieval date in JSON/CSV.",
    "",
    "## Priority Distribution",
    "",
    "| Priority | Count | Meaning |",
    "|---|---:|---|",
    `| P0 | ${priorityCounts.P0 ?? 0} | Credibility, security, correctness, launch, or core product-loop gap |`,
    `| P1 | ${priorityCounts.P1 ?? 0} | Strong product advantage, enterprise blocker, or high-frequency user pain |`,
    `| P2 | ${priorityCounts.P2 ?? 0} | Meaningful improvement but not launch-critical |`,
    `| P3 | ${priorityCounts.P3 ?? 0} | Longer-horizon differentiator or polish |`,
    "",
    "## Source Category Counts",
    "",
    "### Papers",
    "",
    ...Object.entries(paperCategoryCounts).map(([key, count]) => `- ${categoryLabel(key)}: ${count}`),
    "",
    "### GitHub Repositories",
    "",
    ...Object.entries(repoCategoryCounts).map(([key, count]) => `- ${categoryLabel(key)}: ${count}`),
    "",
    "### Competitors",
    "",
    ...Object.entries(competitorCategoryCounts).map(([key, count]) => `- ${categoryLabel(key)}: ${count}`),
    "",
    "## AMC Local Coverage Signals",
    "",
    "| Category | Status | Local Hit Count | Top Local Evidence Paths |",
    "|---|---|---:|---|",
    ...Object.entries(coverage).map(([key, value]) =>
      `| ${categoryLabel(key)} | ${value.status} | ${value.hitCount} | ${(value.topPaths ?? []).slice(0, 4).map((row) => row.path).join("<br>")} |`
    ),
    "",
    "## Top Strategic Improvement Themes",
    "",
    "These themes aggregate the 500+ gap rows by concrete implementation dimension. Use them to plan roadmap epics before selecting individual source-backed gaps.",
    "",
    "| Dimension | Gap Count | Top Categories | Suggested First Implementation | Evidence Required | Effort |",
    "|---|---:|---|---|---|---|",
    ...topDimensions.map((row) =>
      `| ${mdCell(row.dimension?.label ?? row.dimensionId)} | ${row.count} | ${mdCell(row.topCategories)} | ${mdCell(row.dimension?.action ?? "")} | ${mdCell(row.dimension?.evidenceNeed ?? "")} | ${mdCell(row.dimension?.effort ?? "")} |`
    ),
    "",
    "## Highest Priority P0/P1 Themes",
    "",
    ...topP0.map((gap) => `- ${gap.id}: ${gap.title} (${gap.category}; source ${gap.sourceType} ${gap.sourceId})`),
    "",
    "## Full Prioritized Gap Backlog By Priority",
    "",
    "Detailed JSON and CSV include evidence snippets, source URLs, local AMC signal paths, recommendations, and acceptance criteria. The sections below list every generated gap separated by priority.",
    "",
    "### P0 Gaps",
    "",
    "| ID | Category | AMC Surfaces | Dimension | Gap Title | Source | Source URL | Priority Rationale | Implementation Direction | Risk If Ignored | Acceptance Criteria |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rowsForPriority("P0"),
    "",
    "### P1 Gaps",
    "",
    "| ID | Category | AMC Surfaces | Dimension | Gap Title | Source | Source URL | Priority Rationale | Implementation Direction | Risk If Ignored | Acceptance Criteria |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rowsForPriority("P1"),
    "",
    "### P2 Gaps",
    "",
    "| ID | Category | AMC Surfaces | Dimension | Gap Title | Source | Source URL | Priority Rationale | Implementation Direction | Risk If Ignored | Acceptance Criteria |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rowsForPriority("P2"),
    "",
    "### P3 Gaps",
    "",
    "| ID | Category | AMC Surfaces | Dimension | Gap Title | Source | Source URL | Priority Rationale | Implementation Direction | Risk If Ignored | Acceptance Criteria |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rowsForPriority("P3"),
    "",
    "## Data Artifacts",
    "",
    `- Papers JSON: ${paths.papersJson}`,
    `- Papers CSV: ${paths.papersCsv}`,
    `- GitHub repos JSON: ${paths.reposJson}`,
    `- GitHub repos CSV: ${paths.reposCsv}`,
    `- Competitors JSON: ${paths.competitorsJson}`,
    `- Competitors CSV: ${paths.competitorsCsv}`,
    `- Gaps JSON: ${paths.gapsJson}`,
    `- Gaps CSV: ${paths.gapsCsv}`,
    `- Summary JSON: ${paths.summaryJson}`,
    "",
    "## Caveats",
    "",
    "- OpenAlex metadata can include preprints, Zenodo records, and publisher records with uneven abstract quality; the JSON preserves raw source IDs and URLs for rechecking.",
    "- GitHub repository search is a relevance scan, not a code audit of every repository.",
    "- Competitor records are a broad market/adjacency map. Product claims should be verified in depth before using them in public comparisons.",
    "- Local AMC coverage signals are keyword-based. A category marked implemented-signals-present can still have deep feature gaps.",
    ""
  ].join("\n");
}

async function main() {
  ensureDir(outRoot);
  const paths = {
    papersJson: join(outRoot, "papers_2026.json"),
    papersCsv: join(outRoot, "papers_2026.csv"),
    reposJson: join(outRoot, "github_repos.json"),
    reposCsv: join(outRoot, "github_repos.csv"),
    competitorsJson: join(outRoot, "competitors.json"),
    competitorsCsv: join(outRoot, "competitors.csv"),
    coverageJson: join(outRoot, "amc_coverage_index.json"),
    gapsJson: join(outRoot, "prioritized_gaps.json"),
    gapsCsv: join(outRoot, "prioritized_gaps.csv"),
    summaryJson: join(outRoot, "summary.json"),
    reportMd: join(outRoot, "AMC_2026_RESEARCH_COMPETITOR_GAP_REPORT.md")
  };

  console.error("[research] collecting 2026 papers from OpenAlex");
  const papers = await collectOpenAlexPapers();
  console.error(`[research] papers=${papers.length}`);

  console.error("[research] collecting GitHub repositories");
  const repos = await collectGithubRepos();
  console.error(`[research] repos=${repos.length}`);

  const competitors = competitorSeeds.slice(0, Math.max(100, competitorSeeds.length));
  console.error(`[research] competitors=${competitors.length}`);

  const coverage = buildAmcCoverageIndex();
  const gaps = generateGaps({ papers, repos, competitors, coverage });
  const dimensionCounts = countBy(gaps, (gap) => gap.improvementDimensionId);
  const summary = {
    generatedAt: new Date().toISOString(),
    retrievalDate,
    counts: {
      papers: papers.length,
      githubRepos: repos.length,
      competitors: competitors.length,
      gaps: gaps.length
    },
    requirements: {
      papersAtLeast500: papers.length >= 500,
      githubReposAtLeast500: repos.length >= 500,
      competitorsAtLeast100: competitors.length >= 100,
      gapsAtLeast500: gaps.length >= 500
    },
    priorityCounts: countBy(gaps, (gap) => gap.priority),
    categoryCounts: {
      papers: countBy(papers.flatMap((paper) => paper.categories ?? []), (category) => category),
      githubRepos: countBy(repos.flatMap((repo) => repo.categories ?? []), (category) => category),
      competitors: countBy(competitors, (competitor) => competitor.category),
      gaps: countBy(gaps, (gap) => gap.categoryId)
    },
    dimensionCounts,
    quality: {
      reportDetailVersion: "dimension-v2",
      uniqueImprovementDimensions: Object.keys(dimensionCounts).length,
      gapsWithImprovementDimension: gaps.filter((gap) => Boolean(gap.improvementDimensionId && gap.improvementDimension)).length,
      gapsWithPriorityRationale: gaps.filter((gap) => Boolean(gap.priorityRationale)).length,
      gapsWithImplementationDirection: gaps.filter((gap) => Boolean(gap.implementationDirection)).length,
      gapsWithRiskIfIgnored: gaps.filter((gap) => Boolean(gap.riskIfIgnored)).length,
      gapsWithEvidenceNeed: gaps.filter((gap) => Boolean(gap.evidenceNeeded)).length,
      gapsWithAffectedModules: gaps.filter((gap) => Boolean(gap.affectedModules)).length
    },
    paths
  };

  writeJson(paths.papersJson, papers);
  writeCsv(paths.papersCsv, papers, ["id", "title", "publicationDate", "doi", "url", "source", "query", "citedByCount", "venue", "authors", "concepts", "categories", "retrievedAt"]);
  writeJson(paths.reposJson, repos);
  writeCsv(paths.reposCsv, repos, ["id", "fullName", "url", "description", "stars", "forks", "language", "topics", "license", "pushedAt", "query", "categories", "retrievedAt"]);
  writeJson(paths.competitorsJson, competitors);
  writeCsv(paths.competitorsCsv, competitors, ["id", "name", "sourceCategory", "category", "url", "note", "retrievedAt"]);
  writeJson(paths.coverageJson, coverage);
  writeJson(paths.gapsJson, gaps);
  writeCsv(paths.gapsCsv, gaps, [
    "id",
    "priority",
    "categoryId",
    "category",
    "surfaces",
    "title",
    "improvementDimensionId",
    "improvementDimension",
    "affectedModules",
    "sourceType",
    "sourceId",
    "sourceTitle",
    "sourceUrl",
    "evidence",
    "amcCurrentSignal",
    "localEvidencePaths",
    "gap",
    "recommendation",
    "acceptanceCriteria",
    "rationale",
    "priorityRationale",
    "implementationDirection",
    "riskIfIgnored",
    "effort",
    "evidenceNeeded",
    "sourceReliability",
    "nextStep",
    "retrievedAt"
  ]);
  writeJson(paths.summaryJson, summary);
  writeFileSync(paths.reportMd, renderReport({ papers, repos, competitors, coverage, gaps, paths }));

  console.log(JSON.stringify({
    status: Object.values(summary.requirements).every(Boolean) ? "passed" : "failed",
    counts: summary.counts,
    requirements: summary.requirements,
    report: paths.reportMd,
    outRoot
  }, null, 2));

  if (!Object.values(summary.requirements).every(Boolean)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
