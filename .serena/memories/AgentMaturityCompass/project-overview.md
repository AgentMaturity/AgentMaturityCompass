# Agent Maturity Compass (AMC) - Complete Project Understanding

## Project Identity
- **Name**: Agent Maturity Compass (AMC)
- **Tagline**: "The credit score for AI agents"
- **Version**: 1.0.0
- **License**: MIT
- **Repository**: https://github.com/thewisecrab/AgentMaturityCompass
- **Website**: https://thewisecrab.github.io/AgentMaturityCompass/

## Core Purpose
AMC is a comprehensive trust scoring and verification platform for AI agents that provides:
- Evidence-backed trust scoring (L0-L5 maturity levels)
- Tamper-evident cryptographic proof chains using Ed25519 + Merkle trees
- 140 diagnostic questions across 5 dimensions
- 85 adversarial red-team assurance packs
- 40 industry-specific domain packs
- 14 framework adapters (LangChain, CrewAI, AutoGen, Claude Code, etc.)

## Architecture Overview

### Core Components
1. **AMC Score**: 140 diagnostic questions, 5 dimensions, L0–L5 maturity
2. **AMC Shield**: 85 deterministic assurance packs for security testing
3. **AMC Enforce**: Governor engine with policy packs and approval workflows
4. **AMC Vault**: Ed25519 key vault with Merkle-tree evidence chains
5. **AMC Watch**: Studio dashboard with gateway proxy and metrics
6. **AMC Fleet**: Multi-agent trust composition and delegation graphs
7. **AMC Passport**: Portable agent credentials (.amcpass files)
8. **AMC Comply**: Regulatory compliance mapping (EU AI Act, ISO 42001, etc.)

### Technical Stack
- **Language**: TypeScript (Node.js 20+)
- **Database**: SQLite3 (better-sqlite3)
- **CLI Framework**: Commander.js
- **Cryptography**: Ed25519 signatures, Merkle trees
- **Testing**: Vitest (2,823 tests)
- **Build**: TypeScript compiler with asset copying

## Key Features

### Trust Scoring System
- **5 Dimensions**: Strategic Agent Ops (18q), Skills (38q), Resilience (30q), Leadership & Autonomy (28q), Culture & Alignment (26q)
- **Maturity Levels**: L0 (Absent) → L5 (Optimizing)
- **Evidence Tiers**: OBSERVED_HARDENED (1.1×), OBSERVED (1.0×), ATTESTED (0.8×), SELF_REPORTED (0.4×)

### Security & Assurance
- **85 Attack Packs**: Prompt injection, exfiltration, tool misuse, adversarial robustness
- **Cryptographic Verification**: Ed25519 signatures with Merkle tree proof chains
- **Gateway Proxy**: Transparent MITM for evidence collection
- **Tamper Detection**: Integrity verification and trust boundary enforcement

### Compliance & Governance
- **Regulatory Frameworks**: EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP LLM Top 10
- **Domain Packs**: 40 packs across 7 industries (Health, Wealth, Environment, etc.)
- **Policy Engine**: Approval workflows, scoped leases, truth constraints

## Directory Structure

### Source Code (`src/`)
- **Core**: `cli.ts`, `types.ts`, `index.ts`
- **Diagnostic**: `diagnostic/` - scoring engine and question bank
- **Security**: `vault/`, `crypto/`, `assurance/`, `gateway/`
- **Governance**: `governor/`, `approvals/`, `policyPacks/`
- **Evidence**: `ledger/`, `receipts/`, `transparency/`
- **Integration**: `adapters/`, `runtime/`, `bridge/`
- **UI**: `console/`, `dashboard/`, `studio/`

### Documentation (`docs/`)
- **Getting Started**: `GETTING_STARTED.md`, `QUICKSTART.md`
- **Architecture**: `ARCHITECTURE_MAP.md`, `SYSTEM_CAPABILITIES.md`
- **Compliance**: `EU_AI_ACT_COMPLIANCE.md`, `ISO_42001_ALIGNMENT.md`
- **Features**: `ASSURANCE_LAB.md`, `SECTOR_PACKS.md`, `MULTI_AGENT_TRUST.md`

## Installation & Usage

### Quick Start
```bash
npm i -g agent-maturity-compass
mkdir my-agent && cd my-agent
amc init    # Interactive setup
amc quickscore --share
```

### Key Commands
- `amc init` - Interactive project setup
- `amc quickscore` - Get instant trust score
- `amc evidence collect` - Connect agent for monitoring
- `amc guide --go` - Auto-apply guardrails
- `amc fix` - Generate remediation files
- `amc assurance run` - Run security tests
- `amc report <id> --html` - Generate reports

## Integration Capabilities

### Framework Support (14 Adapters)
- LangChain, LangGraph, CrewAI, AutoGen
- OpenAI Agents SDK, LlamaIndex, Semantic Kernel
- Claude Code, Gemini, OpenClaw, OpenHands
- Python AMC SDK, Generic CLI, OpenAI-Compatible API

### Zero-Code Integration
- Environment variable configuration
- Transparent proxy wrapping
- Auto-detection of frameworks
- One-liner CLI wrapping: `amc wrap claude -- claude "analyze this"`

## Deployment Options
- **npm**: Global CLI installation
- **Docker**: Containerized deployment with quickstart image
- **Cloud**: One-click deploy to Vercel/Railway
- **Homebrew**: macOS/Linux package manager
- **Source**: Git clone and build

## Research Foundation
- **White Paper**: Comprehensive research document (v2.0)
- **75 Scoring Modules**: Research-backed evaluation methods
- **Academic Backing**: References to latest AI safety research
- **Standards Compliance**: Multiple regulatory framework mappings

## Business Model & Ecosystem
- **Open Source**: MIT licensed public infrastructure
- **Enterprise Features**: Advanced governance, compliance, federation
- **Domain Specialization**: Industry-specific assessment packs
- **Certification Path**: Verifiable trust credentials

This project represents a comprehensive solution for AI agent trust and governance, combining academic rigor with practical deployment capabilities.