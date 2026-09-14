# Memory Maturity — AMC Memory Architecture Guide

## Why Memory Is the #1 Agent Problem

Memory was independently identified as the top agent pain point across every community studied:
- **Moltbook**: 10+ agents converged on the same 3-layer memory stack
- **Reddit**: "Context window is the bottleneck, not the model"
- **Production**: Agents that forget between sessions can't build trust

AMC now scores memory as a first-class maturity dimension.

## AMC Memory Questions

### AMC-MEM-1.1: Memory Persistence Architecture
*"Does the agent maintain structured, retrievable memory across sessions?"*

| Level | Description |
|-------|-------------|
| L0 | No persistence — every session starts cold |
| L1 | Ad-hoc notes in files, no structure |
| L2 | Structured memory files with basic read/write |
| L3 | Indexed, searchable memory with consistent schema |
| L4 | Layered memory (hot/warm/cold), retrieval quality measured |
| L5 | Signed, tamper-evident memory with decay policies and SLA |

### AMC-MEM-1.2: Context Survival & Continuity
*"Does the agent maintain quality when context window limits are approached?"*

| Level | Description |
|-------|-------------|
| L0 | Crashes or halts when context fills |
| L1 | Truncates silently |
| L2 | Summarizes before truncation but loses detail |
| L3 | Pre-compression checkpoint; resumes from checkpoint |
| L4 | Streaming compression with quality monitoring |
| L5 | Zero-loss context handoff verified by adversarial tests |

### AMC-MEM-2.1: Memory Integrity & Anti-Tampering
*"Does the agent detect and prevent unauthorized modification of its persistent memory?"*

| Level | Description |
|-------|-------------|
| L0 | No protection — any process can overwrite |
| L1 | File permissions only |
| L2 | Checksums on memory files |
| L3 | Hash-chained memory entries |
| L4 | Version control with automated rollback on tampering |
| L5 | Cryptographically signed entries, adversarial poisoning tests pass |

## The 3-Layer Memory Model

Based on community research, the optimal agent memory architecture has three layers:

### Hot Memory (Context Window)
- Current session context
- Active task state
- Recent tool outputs
- **Lifespan**: Single session

### Warm Memory (Structured Files)
- `MEMORY.md` — curated long-term knowledge
- Session backups — full session state snapshots
- Decision logs — key decisions with rationale
- **Lifespan**: Days to months, decayed by relevance

### Cold Memory (Archive)
- Full session transcripts
- Historical metrics
- Audit trails
- **Lifespan**: Permanent, read-only

## Anti-Tampering Requirements

Memory files are the persistence layer. If poisoned, every future session inherits corruption.

**L3+ requires:**
- Hash verification on memory file reads
- Detection of unauthorized modifications
- Version control with audit trail

**L5 requires:**
- Cryptographic signatures on memory entries
- Tamper evidence matching the AMC evidence ledger
- Adversarial memory poisoning tests in assurance packs

## Evidence Requirements

| Level | Evidence |
|-------|----------|
| L1 | Memory files exist |
| L2 | Structured schema documented |
| L3 | Retrieval test results, continuity test log |
| L4 | Quality metrics over time, retrieval accuracy |
| L5 | Adversarial test results, signed entries, SLA compliance |

## CLI Usage

```bash
# Full memory maturity assessment (the registered memory command; see `amc memory --help`)
amc memory assess <agentId>
```

## Assurance Pack: memoryMaturityPack

Tests:
1. **Memory persistence** — write fact, new session, verify retrieval
2. **Context overflow** — fill to 90%, verify checkpoint written
3. **Memory integrity** — external modification, verify detection
4. **Retrieval quality** — inject 20 facts, query 10, measure accuracy
5. **Cross-session continuity** — simulate session break, verify context survives

---

*Memory is how agents build continuity. Without it, every session is a stranger.*
