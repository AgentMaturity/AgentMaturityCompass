# Agent Transparency Report

**What does this AI agent do? What can it access? What decisions can it make autonomously? How trustworthy is it?**

The AMC Agent Transparency Report answers these questions in a structured, shareable format. It's the behavioral equivalent of a Software Bill of Materials (SBOM) — not for software dependencies, but for **agent behavior and trust evidence**.

---

## Quick Start

```bash
# Generate a markdown report for the default agent
amc transparency report

# Generate for a specific agent
amc transparency report my-agent

# JSON format (for programmatic use)
amc transparency report my-agent --format json

# Save to file
amc transparency report my-agent --out report.md

# Generate for all registered agents
amc transparency report --all --out transparency-{agentId}.md
```

---

## What's in the Report

### Identity
Who/what is this agent — framework, risk tier, current maturity level (L1-L5), trust score (0-100), and certification status.

### Capabilities
What the agent can **do**:
- Tool/task list
- Autonomy level: Supervised / Semi-Autonomous / Autonomous
- Whether it can take irreversible actions (delete, write, execute, network calls)
- Action classes from the freeze engine
- Budget limits if configured

### Data Access
What the agent can **see and use**:
- Input and output data types
- PII retention status
- Data retention period
- Cross-border data transfer status

### Trust Evidence
Cryptographic proof of the assessment:
- Run ID and report SHA-256 hash
- Integrity index (0–1)
- Assurance packs covered and passed
- Merkle root hash (if transparency log enabled)

### Dimension Scores
L1–L5 maturity per AMC dimension with confidence-weighted scores:
- Tool Use Safety
- Instruction Following
- Evidence & Auditability
- Context & Memory Management
- Evaluation & Growth
- Security & Isolation

### Compliance
Regulatory framework gap summary (EU AI Act, ISO 42001, NIST AI RMF, SOC2, ISO 27001). Use `amc guide --compliance` for full gap details.

### Risks
Top identified risks with severity (🔴 critical / 🟡 high / 🔵 medium) — unsupported claims, contradictions, trust boundary violations, integrity index failures.

### Top Improvement Priorities
3 highest-impact actions to improve trust score, with specific `amc` CLI commands to run.

---

## How It Differs From SBOM

| | Software SBOM | AMC Transparency Report |
|---|---|---|
| **Answers** | What packages does this software use? | What can this agent do? |
| **Layer** | Build-time components | Runtime behavior |
| **Evidence** | Dependency manifest | Cryptographic execution proof |
| **Trust signal** | CVE counts | L1-L5 maturity + integrity index |
| **Use case** | Supply chain security | AI governance and compliance |

---

## API Usage

```typescript
import {
  generateTransparencyReport,
  renderTransparencyReportMarkdown,
  renderTransparencyReportJson,
  type AgentTransparencyReport,
} from "agent-maturity-compass";

// Generate
const report: AgentTransparencyReport = generateTransparencyReport(
  "my-agent",
  "/path/to/workspace"
);

// Render as markdown
const markdown = renderTransparencyReportMarkdown(report);

// Render as JSON
const json = renderTransparencyReportJson(report);

// Access fields directly
console.log(report.identity.maturityLabel);       // "L3 — Defined"
console.log(report.identity.trustScore);           // 62
console.log(report.capabilities.autonomyLevel);    // "semi-autonomous"
console.log(report.trustEvidence.integrityIndex);  // 0.87
console.log(report.risks);                         // [{severity, description, dimension}]
console.log(report.topPriorities);                 // [{action, impact, command}]
```

---

## Report Schema

```typescript
interface AgentTransparencyReport {
  version: "1.0";
  generatedAt: string;         // ISO timestamp
  agentId: string;
  agentName: string;
  role: string;
  domain: string;

  identity: {
    framework: string;
    riskTier: "low" | "med" | "high" | "critical";
    maturityLevel: number;     // 1.0 - 5.0
    maturityLabel: string;     // "L3 — Defined"
    trustScore: number;        // 0-100
    certificationStatus: "certified" | "not-certified" | "pending";
    lastAssessed: string;      // ISO timestamp
  };

  capabilities: {
    tools: string[];
    autonomyLevel: "supervised" | "semi-autonomous" | "autonomous";
    canTakeIrreversibleActions: boolean;
    actionClasses: string[];
    maxBudgetUsd: number | null;
  };

  dataAccess: {
    inputTypes: string[];
    outputTypes: string[];
    retainsPII: boolean | null;
    dataRetentionDays: number | null;
    crossesBorder: boolean | null;
  };

  trustEvidence: {
    latestRunId: string;
    reportSha256: string;
    integrityIndex: number;    // 0-1
    assurancePacksCovered: number;
    assurancePacksPassed: number;
    merkleRootHash: string | null;
  };

  dimensions: Array<{
    name: string;
    level: number;
    label: string;
    confidenceWeighted: number;
  }>;

  compliance: {
    frameworks: string[];
    criticalGaps: number;
    highGaps: number;
  };

  risks: Array<{
    severity: "critical" | "high" | "medium";
    description: string;
    dimension: string;
  }>;

  topPriorities: Array<{
    action: string;
    impact: string;
    command: string;
  }>;
}
```

---

## Certification Status Logic

| Status | Condition |
|---|---|
| **certified** | integrityIndex ≥ 0.9 AND maturityLevel ≥ 4 |
| **pending** | integrityIndex ≥ 0.6 OR maturityLevel ≥ 2 |
| **not-certified** | Below pending thresholds |

---

## Use Cases

**AI Governance Reviews** — Share with your AI governance committee before deploying an agent to production.

**Regulatory Compliance** — Demonstrate EU AI Act Article 13 transparency obligations with a structured, evidence-backed report.

**Vendor Due Diligence** — Require transparency reports from third-party AI agent providers before integration.

**CI/CD Gating** — Generate and diff reports in CI to catch trust regressions before deployment.

**Incident Response** — When an agent behaves unexpectedly, the transparency report provides the baseline against which to investigate.
