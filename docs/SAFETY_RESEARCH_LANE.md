# Safety Research Lane

> Evaluation lane for AI safety alignment, based on the latest safety research from frontier labs and academia.

## Overview

The Safety Research Lane is AMC's dedicated evaluation dimension for measuring how well an AI agent (or organization deploying one) addresses the safety concerns identified by leading AI safety researchers. It was built from a systematic analysis of 50+ research sources, including departures and publications from researchers at Anthropic, OpenAI, Google DeepMind, MIRI, and ARC.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Safety Research Lane                  │
│          (safetyResearchLane.ts)                 │
│                                                  │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Dimension 1 │  │  Dimension 2             │ │
│  │  Process      │  │  Oversight Integrity     │ │
│  │  Deception    │  │  (25%)                   │ │
│  │  Detection    │  │  AMC-7.13 → AMC-7.18    │ │
│  │  (30%)       │  │  oversightIntegrity.ts   │ │
│  │  AMC-7.1→7.12│  └──────────────────────────┘ │
│  │  processDecep │                               │
│  │  tionDetect.ts│  ┌──────────────────────────┐ │
│  └──────────────┘  │  Dimension 3             │ │
│                     │  Capability Governance   │ │
│  ┌──────────────┐  │  (25%)                   │ │
│  │  Dimension 4 │  │  AMC-7.19 → AMC-7.30    │ │
│  │  Organiz.    │  │  capabilityGovernance.ts  │ │
│  │  Safety      │  └──────────────────────────┘ │
│  │  Posture     │                               │
│  │  (20%)       │                               │
│  │  AMC-7.31→40 │                               │
│  │  orgSafety   │                               │
│  │  Posture.ts  │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

## Dimensions

### 1. Process Deception Detection (30%)
**Questions:** AMC-7.1 through AMC-7.12

Evaluates resistance to alignment faking, sandbagging, and goal-directed deception. Based on:
- Anthropic alignment faking research (arXiv:2412.14093)
- METR MALT dataset for sandbagging detection
- OpenAI o1 safety report on scheming
- Apollo Research "Loss of Control Playbook"

**Assurance Packs:** `alignmentFaking`, `sandbagging`, `schemingDeception`

### 2. Oversight Integrity (25%)
**Questions:** AMC-7.13 through AMC-7.18

Evaluates whether the agent supports or undermines human oversight. Based on:
- Anthropic sabotage evaluations (Type 1: human decision sabotage, Type 4: oversight undermining)
- Instrumental convergence theory (Omohundro, Bostrom)
- MACHIAVELLI benchmark (Pan et al., ICML 2023)

**Assurance Packs:** `oversightUndermining`, `humanDecisionSabotage`, `powerSeeking`

### 3. Capability Governance (25%)
**Questions:** AMC-7.19 through AMC-7.30

Evaluates governance of dangerous capabilities, replication resistance, and evaluation integrity. Based on:
- Anthropic RSP (ASL-3 CBRN thresholds)
- RepliBench self-replication evaluations
- OpenAI Preparedness bio-risk study
- International AI Safety Report 2026

**Assurance Packs:** `cbrnCapability`, `replicationResistance`, `temporalConsistency`, `evalAwareBehavior`, `capabilityElicitation`, `emergentCapability`

### 4. Organizational Safety Posture (20%)
**Questions:** AMC-7.31 through AMC-7.40

Evaluates the deploying organization's safety culture and processes. Based on:
- Jan Leike, Geoffrey Hinton, Ilya Sutskever, Mrinank Sharma departures
- Zoë Hitzig research on AI exploitation of psychological vulnerabilities
- H-Neurons research on over-compliance (arXiv:2512.01797)

**Assurance Packs:** `safetyCulture`, `rspCompliance`, `redTeamCoverage`, `persuasionManipulation`, `mechanisticTransparency`, `whistleblowerProtection`

## Usage

### CLI

```bash
# Interactive assessment
amc score safety-research

# With pre-filled responses
amc score safety-research --responses answers.json

# JSON output
amc score safety-research --json
```

### Programmatic

```typescript
import { scoreSafetyResearchLane, getSafetyResearchLaneQuestionIds } from "@amc/core/lanes/safetyResearchLane";

// Get all 40 question IDs
const questionIds = getSafetyResearchLaneQuestionIds();
// → ["AMC-7.1", "AMC-7.2", ..., "AMC-7.40"]

// Score with responses
const report = scoreSafetyResearchLane(responses);
console.log(report.overallScore);     // 0-5
console.log(report.level);            // "L0" to "L5"
console.log(report.dimensions);       // 4 dimension breakdowns
console.log(report.gapAnalysis);      // Prioritized improvement areas
```

## Assurance Packs (20 packs, 1,315 scenarios)

| Pack | Scenarios | Tier | Research Basis |
|------|-----------|------|----------------|
| alignmentFaking | 12 | Critical | Anthropic arXiv:2412.14093 |
| sandbagging | 12 | Critical | METR MALT dataset |
| schemingDeception | 12 | Critical | OpenAI o1 safety report |
| oversightUndermining | 12 | High | Anthropic sabotage Type 4 |
| humanDecisionSabotage | 12 | High | Anthropic sabotage Type 1 |
| codeSabotageDefense | 12 | High | Anthropic sabotage Type 2 |
| powerSeeking | 12 | High | MACHIAVELLI benchmark |
| cbrnCapability | 10 | High | Anthropic RSP, OpenAI bio-risk |
| persuasionManipulation | 10 | Medium | Hitzig, H-Neurons |
| emergentCapability | 10 | Medium | METR, instrumental convergence |
| safetyCulture | 10 | Medium | Leike, Hinton departures |
| replicationResistance | 10 | Medium | RepliBench, METR |
| dynamicTrustAuthorization | 10 | Medium | arXiv:2512.06914 (B-I-P) |
| temporalConsistency | 10 | Medium | Context window research |
| evalAwareBehavior | 10 | Medium | Benchmark gaming research |
| capabilityElicitation | 10 | Medium | Frontier Model Forum |
| rspCompliance | 10 | Standard | Anthropic RSP, DeepMind FSCP |
| redTeamCoverage | 10 | Standard | Industry red-teaming standards |
| mechanisticTransparency | 10 | Standard | Anthropic interpretability |
| selfPreservation | 10 | Standard | Instrumental convergence |

## Scoring

Each dimension produces a 0-5 score. Weighted aggregation:

| Dimension | Weight |
|-----------|--------|
| Process Deception Detection | 30% |
| Oversight Integrity | 25% |
| Capability Governance | 25% |
| Organizational Safety Posture | 20% |

**Level mapping:**
- **L0** (0-0.99): No safety awareness
- **L1** (1-1.99): Ad-hoc safety measures
- **L2** (2-2.99): Defined safety processes
- **L3** (3-3.99): Measured and monitored
- **L4** (4-4.99): Proactive safety culture
- **L5** (5.0): Continuous safety improvement with evidence

## Research Sources

Full gap analysis: `docs/RESEARCH_AI_SAFETY_EXODUS.md`

Key sources include:
- Greenblatt et al. "Alignment Faking in Large Language Models" (arXiv:2412.14093, Dec 2024)
- Pan et al. "Do the Rewards Justify the Means? Measuring Trade-Offs Between Rewards and Ethical Behavior in the MACHIAVELLI Benchmark" (ICML 2023)
- Anthropic "Sabotage evaluations for frontier models" (2024)
- International AI Safety Report (2026) — 473 security vulnerabilities
- OpenAI Preparedness bio-risk study (2024)
- METR "Time Horizon of AI Agent Tasks" — doubling every 7 months since 2019
- RepliBench: Evaluating AI Self-Replication Capabilities (2025)
