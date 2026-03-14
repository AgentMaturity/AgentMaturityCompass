# AMC Trust Protocol v1.0
## Agent-to-Agent Trust Negotiation Standard

**Status:** Proposed Standard  
**Version:** 1.0  
**Date:** 2026-03-14  
**Depends on:** AMC Standard RFC v1.0  
**Repository:** https://github.com/agentmaturitycompass/amc  

---

## Abstract

This document specifies the AMC Trust Protocol — the mechanism by which AI agents verify each other's maturity and establish scoped trust relationships before delegation. The protocol defines the AMC Trust Token format, the verification flow, trust graph semantics with temporal decay, delegation policies, and integration patterns for LangChain, CrewAI, and AutoGen.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Trust Negotiation Flow](#2-trust-negotiation-flow)
3. [Trust Token Format](#3-trust-token-format)
4. [Trust Graph](#4-trust-graph)
5. [Delegation Policies](#5-delegation-policies)
6. [Industry Presets](#6-industry-presets)
7. [Integration Guide](#7-integration-guide)
8. [Security Considerations](#8-security-considerations)

---

## 1. Overview

### 1.1 The Problem

Multi-agent systems delegate tasks between agents without a standard way to verify whether the receiving agent is trustworthy. Current practice:
- **Ad-hoc whitelisting:** "We trust Agent B because we built it" — no external verification
- **Capability claims:** Agent B says it can do X — no evidence
- **No decay:** Trust established 6 months ago remains at full strength despite changed behavior

The AMC Trust Protocol solves this with cryptographically verifiable, time-decaying, scope-restricted trust assertions backed by AMC maturity scores.

### 1.2 Design Principles

1. **Math beats convention.** Trust is verified by signature, not by name recognition.
2. **Trust decays.** An agent's trustworthiness degrades over time without fresh evidence.
3. **Scopes restrict.** Delegated agents inherit *at most* the delegator's scopes.
4. **Hops attenuate.** Transitive trust loses strength at every hop.
5. **Revocation is instant.** Any trust assertion can be revoked without re-deploying agents.

---

## 2. Trust Negotiation Flow

### 2.1 Direct Trust (2-Agent)

When Agent A wants to delegate a task to Agent B:

```
Agent A                                   Agent B
   │                                          │
   │── (1) Request Trust Token ──────────────>│
   │        { requesterId, requiredClaims,    │
   │          minScores, tokenId }             │
   │                                          │
   │<── (2) Present AMC Trust Token ──────────│
   │        { version, tokenId, issuer,       │
   │          subject, claims, signature }     │
   │                                          │
   │── (3) Verify Token ──────────────────────┤ (local)
   │        check signature                   │
   │        check expiry                      │
   │        check claim scores vs minimums    │
   │                                          │
   │── (4) Apply Trust Policy ───────────────>│
   │        compute trustLevel                │
   │        grant scoped access               │
   │                                          │
   │<── (5) Task Execution (scoped) ──────────│
   │        only permitted operations         │
   │                                          │
   │── (6) Record Trust Edge ────────────────>│ (graph)
   │        { from, to, score, scopes,        │
   │          establishedAt, ttlMs }          │
```

### 2.2 Step-by-Step

**Step 1 — Request**  
Agent A creates a `FederatedVerificationRequest`:
```typescript
const request = createVerificationRequest(
  agentA.id,          // requesterId
  tokenId,            // known token ID or omit for fresh token
  ['security', 'governance'],  // requiredClaims
  { security: 60, governance: 55 }  // minScores
);
```

**Step 2 — Present Token**  
Agent B retrieves its current AMC Trust Token (issued by its workspace):
```typescript
const token: AMCTrustToken = await agentB.getTrustToken();
// token.claims contains per-dimension scores from last AMC assessment
```

**Step 3 — Verify**  
Agent A verifies the token locally using the shared secret or the issuer's public key hash:
```typescript
const { valid, reasons } = verifyTrustToken(token, sharedSecret);
// checks: expiry, HMAC-SHA256 signature, claim score bounds
```

**Step 4 — Policy Evaluation**  
Agent A evaluates the token against a `TrustPolicyRule`:
```typescript
const policy: TrustPolicyRule = {
  minAmcScore: 60,          // minimum overall AMC score (display scale)
  minAmcLevel: 'L3',        // minimum maturity level
  requirePassport: true,    // AMC Passport required
  requireFreshness: true,   // claim must be < 24h old
  allowedWorkspaces: ['prod-workspace'],
};
const result = verifyAgentClaim(agentBClaim, policy, sharedSecret);
```

**Step 5 — Trust Assignment**  
Based on the composite trust score, Agent A assigns a trust level:

| Composite Score | Trust Level | Granted Scopes |
|----------------|-------------|----------------|
| ≥ 0.80 | `full` | read, write, execute, delegate |
| ≥ 0.60 | `conditional` | read, write |
| ≥ 0.40 | `limited` | read |
| < 0.40 (or invalid signature) | `untrusted` | none |

**Step 6 — Trust Edge**  
The trust assertion is recorded as a `TrustEdge` in the trust graph:
```typescript
const edge: TrustEdge = {
  from: agentA.id,
  to: agentB.id,
  score: result.score,     // internal 0–1
  scopes: result.grantedScopes,
  establishedAt: Date.now(),
  ttlMs: 86400000,          // 24 hours
};
```

### 2.3 Verification Score Components

The `verifyAgentClaim` function computes a composite trust score from six checks:

| Check | Weight | Condition |
|-------|--------|-----------|
| Signature validity | 0.30 | HMAC-SHA256 of `agentId:publicKeyHash:workspace:issuedAt` |
| Freshness | 0.15 | `ageHours < 24` and not explicitly expired |
| AMC Score | 0.20 | `claim.amcScore >= policy.minAmcScore` |
| AMC Level | 0.15 | `levelToNum(claim.amcLevel) >= levelToNum(policy.minAmcLevel)` |
| Passport presence | 0.10 | `claim.amcPassportId` present (if required) |
| Workspace allowlist | 0.10 | `claim.issuingWorkspace` in `policy.allowedWorkspaces` |

**Total possible: 1.0.** The composite score maps to trust level as described in Step 5.

---

## 3. Trust Token Format

### 3.1 AMCTrustToken

```typescript
interface AMCTrustToken {
  version: "1.0";
  tokenId: string;       // UUID v4 — globally unique
  issuer: {
    workspaceId: string; // AMC workspace that issued this token
    platform: string;    // "amc" | "langsmith" | "langfuse" | "custom"
    publicKeyHash: string; // SHA-256 hex of the issuer's signing key
  };
  subject: {
    agentId: string;       // Stable agent identifier within workspace
    displayName?: string;  // Human-readable name
    passportId?: string;   // AMC Passport ID (amcpass-<uuid>)
  };
  claims: TrustClaim[];    // Per-dimension scores (see Section 3.2)
  issuedAt: number;        // Unix timestamp in milliseconds
  expiresAt: number;       // Unix timestamp in milliseconds
  signature: string;       // HMAC-SHA256 hex of canonical token JSON
}
```

### 3.2 TrustClaim

```typescript
interface TrustClaim {
  dimension: string;       // AMC dimension name (e.g., "security", "governance")
  score: number;           // Display-scale score (default: 0–100)
  level: MaturityLevel;    // L0 | L1 | L2 | L3 | L4 | L5
  evidenceCount: number;   // Number of evidence artifacts for this dimension
  observedShare: number;   // 0–1: fraction of evidence that is OBSERVED tier
  lastAssessedAt: number;  // Unix ms of last assessment for this dimension
}
```

### 3.3 AgentIdentityClaim

The lighter-weight identity claim used in direct agent-to-agent verification:

```typescript
interface AgentIdentityClaim {
  agentId: string;
  publicKeyHash: string;      // SHA-256 of agent's public signing key
  amcPassportId?: string;     // AMC Passport ID
  amcScore?: number;          // Display-scale AMC score
  amcLevel?: string;          // e.g. "L3"
  issuingWorkspace: string;   // AMC workspace ID
  issuedAt: Date;
  expiresAt?: Date;
  signature: string;          // HMAC-SHA256 of canonical payload
}
```

**Signature payload:** `"${agentId}:${publicKeyHash}:${issuingWorkspace}:${issuedAt.toISOString()}"`

### 3.4 Issuance

```typescript
// Issue a full Trust Token (from src/passport/trustInterchange.ts)
const token = issueTrustToken(
  workspaceId,
  publicKeyHash,
  agentId,
  claims,            // Array of TrustClaim
  secret,
  { ttlHours: 24, displayName: 'My Agent', passportId: 'amcpass-...' }
);

// Issue an identity claim (lightweight, for agent-to-agent)
const claim = createAgentClaim(
  agentId,
  publicKeyHash,
  issuingWorkspace,
  sharedSecret,
  { amcScore: 72, amcLevel: 'L3', ttlHours: 24 }
);
```

### 3.5 Verification

```typescript
// Verify token integrity (from src/passport/trustInterchange.ts)
const { valid, reasons } = verifyTrustToken(token, secret);
// Checks: expiry, signature, claim score bounds (0 ≤ score ≤ scale),
//         observedShare bounds (0 ≤ observedShare ≤ 1)

// Verify identity claim against policy
const result = verifyAgentClaim(claim, policy, sharedSecret);
// Returns: { trusted, trustLevel, score, level, grantedScopes, requiredActions }
```

---

## 4. Trust Graph

### 4.1 Graph Structure

A `TrustGraph` represents the current trust topology of a multi-agent system:

```typescript
interface TrustGraph {
  edges: TrustEdge[];
}

interface TrustEdge {
  from: string;          // Agent ID (delegator)
  to: string;            // Agent ID (delegate)
  score: number;         // Internal 0–1 (edges use internal scale for math)
  scopes: string[];      // Granted scopes: ["read", "write", "execute", "delegate"]
  establishedAt: number; // Unix ms
  ttlMs?: number;        // Optional TTL; edge expires after this duration
}
```

Nodes are implicit (any agent appearing in an edge is a node). Trust assertions are directed: `A→B` does not imply `B→A`.

### 4.2 Transitive Trust Computation

`computeTransitiveTrust` uses BFS to find the highest-trust path between two agents:

```typescript
const result = computeTransitiveTrust(
  graph,
  'agent-a',    // from
  'agent-c',    // to
  { maxHops: 3, decayPerHop: 0.7 }
);
// result.transitiveScore — display-scale score
// result.maturityLevel   — L0–L5
// result.effectiveScopes — intersection of scopes along the path
// result.path            — ["agent-a", "agent-b", "agent-c"]
// result.hops            — 2
// result.decayApplied    — 0.7 (one decay application)
// result.weakestLink     — { from, to, score }
```

**Transitive score formula:**
```
transitiveScore = score(A→B) × score(B→C) × decayFactor^(hops - 1)
```

Where `decayFactor` defaults to **0.70** (30% attenuation per intermediate hop). The first direct hop has no decay; decay applies to each additional hop.

**Scope intersection:** Transitive scopes are the intersection of scopes along the path. Agent C can only receive scopes that every agent in the chain has granted.

**Maximum chain depth:** Default 3 hops. Configurable per policy.

**Expired edge handling:** Edges with elapsed time > `ttlMs` are excluded from BFS traversal.

### 4.3 Temporal Trust Decay

Trust scores degrade over time independently of graph traversal. The `applyTemporalDecay` function implements three decay models:

#### Exponential Decay
```
score(t) = originalScore × e^(−λ × elapsed_hours)
where λ = ln(2) / halfLifeHours
```
Best for: security-sensitive environments where trust should gradually erode.

#### Linear Decay
```
score(t) = originalScore × max(0, 1 − elapsed_hours / maxAgeHours)
```
Best for: low-stakes environments where trust is valid for a defined window.

#### Step Decay
```
score(t) = originalScore             if elapsed_hours < stepThresholdHours
score(t) = originalScore × stepReduction  otherwise
```
Best for: binary "valid/invalid" policies with a hard cutoff.

```typescript
const decayedScore = applyTemporalDecay(
  originalScore,       // internal 0–1
  edge.establishedAt,  // Unix ms
  config,              // TemporalDecayConfig
  Date.now()
);
```

### 4.4 Trust Network

For federated deployments, a `TrustNetwork` models inter-platform trust:

```typescript
interface TrustNetworkNode {
  id: string;
  platform: string;
  publicKeyHash: string;
  trustLevel: "anchor" | "verified" | "provisional" | "unknown";
}

interface TrustNetworkEdge {
  from: string;
  to: string;
  trustScore: number;          // 0–1
  trustLevel: MaturityLevel;   // L0–L5
  establishedAt: number;
  lastVerifiedAt: number;
  mutual: boolean;             // Whether the trust is bidirectional
}
```

---

## 5. Delegation Policies

### 5.1 TrustPolicyRule

```typescript
interface TrustPolicyRule {
  minAmcScore?: number;         // Minimum display-scale AMC score
  minAmcLevel?: string;         // Minimum level: "L1" | "L2" | "L3" | "L4" | "L5"
  requirePassport: boolean;     // Require AMC Passport presence
  requireFreshness: boolean;    // Claim must be < 24h old
  allowedWorkspaces?: string[]; // Whitelist of trusted workspace IDs
}
```

### 5.2 DelegationPolicy

Controls how trust is inherited through delegation chains:

```typescript
interface DelegationPolicy {
  inheritFactor: number;         // 0–1 multiplier on inherited score (default: 0.8)
  scopeRestrictions?: string[];  // Only these scopes may be delegated
  maxDelegationDepth: number;    // Maximum re-delegation levels (default: 3)
  requireExplicitGrant: boolean; // Must explicitly grant each scope (default: false)
}
```

### 5.3 Scope Inheritance

```typescript
const inherited = computeInheritedTrust(
  delegatorResult,   // TrustVerificationResult from delegator's verification
  delegateScore,     // Delegate's own AMC display score
  policy,
  delegationDepth    // 1 for first delegation, 2 for re-delegation, etc.
);
// inherited.inheritedScore = min(delegatorScore, delegateScore) × inheritFactor × 0.9^(depth-1)
// inherited.inheritedScopes = delegatorScopes ∩ policy.scopeRestrictions
```

**Inheritance rules:**
1. **Score floors down:** The inherited score is `min(delegator's score, delegate's own score) × inheritFactor`. An untrusted delegate cannot boost its score by receiving from a trusted delegator.
2. **Scopes narrow:** A delegate can never receive more scopes than the delegator has. The `"delegate"` scope requires `requireExplicitGrant: false` to pass through.
3. **Depth penalty:** Each level of re-delegation applies an additional 0.9× multiplier to the inherited score.
4. **Depth limit enforced:** At depth > `maxDelegationDepth`, the inherited score is 0 and scopes are empty.

### 5.4 Revocation

Trust edges can be revoked immediately by removing them from the trust graph. Once a `TrustEdge` is deleted, `computeTransitiveTrust` will not traverse it. Implementations SHOULD propagate revocation events to all agents in the affected trust chain within the edge's original TTL window.

---

## 6. Industry Presets

The `INDUSTRY_DECAY_PRESETS` object in `src/score/crossAgentTrust.ts` provides calibrated decay configurations:

### 6.1 Healthcare

```typescript
INDUSTRY_DECAY_PRESETS.healthcare = {
  model: "exponential",
  halfLifeHours: 4,          // Trust halves every 4 hours
  maxAgeHours: 24,
  stepThresholdHours: 6,
  stepReduction: 0.3,
}
```

**Rationale:** PHI-handling agents operate in high-risk environments. Trust claims expire quickly; agents must re-verify frequently. An agent trusted 8 hours ago retains only ~25% of its original trust score.

**Recommended policy:**
```typescript
{
  minAmcScore: 70,
  minAmcLevel: 'L4',
  requirePassport: true,
  requireFreshness: true,
}
```

**Trust token TTL:** 6 hours maximum.

### 6.2 Finance

```typescript
INDUSTRY_DECAY_PRESETS.finance = {
  model: "exponential",
  halfLifeHours: 8,          // Trust halves every 8 hours
  maxAgeHours: 48,
  stepThresholdHours: 12,
  stepReduction: 0.4,
}
```

**Rationale:** Financial agents handle transactions and sensitive data. Trust decays moderately fast. An agent trusted 24 hours ago retains ~12.5% of its original trust score.

**Recommended policy:**
```typescript
{
  minAmcScore: 65,
  minAmcLevel: 'L3',
  requirePassport: true,
  requireFreshness: true,
}
```

**Trust token TTL:** 12 hours maximum.

### 6.3 Defense

```typescript
INDUSTRY_DECAY_PRESETS.defense = {
  model: "step",
  halfLifeHours: 2,
  maxAgeHours: 12,
  stepThresholdHours: 4,     // Full trust for 4 hours, then drops to 20%
  stepReduction: 0.2,
}
```

**Rationale:** Security-critical operations use step decay with a hard cutoff. An agent is fully trusted for 4 hours, then drops to 20% of original trust score.

**Trust token TTL:** 4 hours maximum. L5 REQUIRED.

### 6.4 Entertainment

```typescript
INDUSTRY_DECAY_PRESETS.entertainment = {
  model: "linear",
  halfLifeHours: 72,         // Gradual linear decay over 7 days
  maxAgeHours: 168,
  stepThresholdHours: 48,
  stepReduction: 0.7,
}
```

**Rationale:** Low-risk content generation agents. Trust decays slowly and linearly; 7-day window before trust reaches 0.

**Recommended policy:**
```typescript
{
  minAmcScore: 40,
  minAmcLevel: 'L2',
  requirePassport: false,
  requireFreshness: false,
}
```

**Trust token TTL:** 72 hours.

### 6.5 General Purpose

```typescript
INDUSTRY_DECAY_PRESETS.general = {
  model: "exponential",
  halfLifeHours: 24,         // Trust halves every 24 hours
  maxAgeHours: 168,
  stepThresholdHours: 48,
  stepReduction: 0.5,
}
```

**Recommended policy:**
```typescript
{
  minAmcScore: 50,
  minAmcLevel: 'L2',
  requirePassport: false,
  requireFreshness: true,
}
```

---

## 7. Integration Guide

### 7.1 LangChain Integration

**Node.js (TypeScript)**

```typescript
import { createAgentClaim, verifyAgentClaim } from 'amc/score/crossAgentTrust';
import { issueTrustToken, verifyTrustToken } from 'amc/passport/trustInterchange';

// In your LangChain tool executor — before calling a sub-agent:
async function delegateToSubAgent(subAgentId: string, task: string) {
  // 1. Request the sub-agent's trust token (via your transport layer)
  const token = await subAgentRegistry.getToken(subAgentId);

  // 2. Verify the token
  const { valid, reasons } = verifyTrustToken(token, process.env.AMC_SHARED_SECRET!);
  if (!valid) {
    throw new Error(`Sub-agent ${subAgentId} failed trust verification: ${reasons.join(', ')}`);
  }

  // 3. Check dimension requirements
  const securityClaim = token.claims.find(c => c.dimension === 'security');
  if (!securityClaim || securityClaim.score < 60) {
    throw new Error(`Sub-agent security score ${securityClaim?.score ?? 0} below threshold 60`);
  }

  // 4. Execute with scoped trust
  return await langchainAgent.invoke({ task, trustContext: { level: 'conditional' } });
}
```

**Python (via AMC Python SDK)**

```python
from amc import TrustClient, TrustPolicy

client = TrustClient(workspace_id="my-workspace", secret=os.environ["AMC_SHARED_SECRET"])

policy = TrustPolicy(
    min_amc_score=60,
    min_amc_level="L3",
    require_passport=True,
    require_freshness=True
)

# In a LangChain tool:
@tool
def delegate_to_specialist(task: str, specialist_agent_id: str) -> str:
    result = client.verify_agent(specialist_agent_id, policy)
    if not result.trusted:
        return f"Cannot delegate: {', '.join(result.reasons)}"
    return specialist.run(task, scopes=result.granted_scopes)
```

### 7.2 CrewAI Integration

```python
from crewai import Agent, Task, Crew
from amc import TrustClient, TrustPolicy

amc = TrustClient(workspace_id="crewai-workspace", secret=os.environ["AMC_SECRET"])

class TrustAwareAgent(Agent):
    def __init__(self, *args, amc_policy: TrustPolicy = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.amc_policy = amc_policy

    def execute_task(self, task: Task, *args, **kwargs):
        # Verify this agent's own trust status before execution
        result = amc.verify_agent(self.id, self.amc_policy)
        if not result.trusted:
            raise PermissionError(f"Agent {self.id} did not meet trust requirements")
        return super().execute_task(task, *args, **kwargs)

# Usage:
analyst = TrustAwareAgent(
    role="Financial Analyst",
    goal="Analyze market data",
    amc_policy=TrustPolicy(min_amc_score=65, min_amc_level="L3", require_passport=True)
)
```

### 7.3 AutoGen Integration

```python
import autogen
from amc import TrustClient, TrustPolicy

amc = TrustClient(workspace_id="autogen-workspace", secret=os.environ["AMC_SECRET"])

def create_trust_checked_agent(name: str, system_message: str, min_level: str = "L2"):
    policy = TrustPolicy(min_amc_level=min_level, require_freshness=True)

    class TrustCheckedAgent(autogen.ConversableAgent):
        def generate_reply(self, messages=None, sender=None, **kwargs):
            # Verify sender's trust before processing
            if sender and hasattr(sender, 'amc_agent_id'):
                result = amc.verify_agent(sender.amc_agent_id, policy)
                if not result.trusted:
                    return f"[TRUST REFUSED] Sender {sender.name} does not meet L{min_level} requirements"
            return super().generate_reply(messages=messages, sender=sender, **kwargs)

    return TrustCheckedAgent(name=name, system_message=system_message, llm_config={...})

# Wire up agents with trust verification
orchestrator = create_trust_checked_agent("orchestrator", "...", min_level="L3")
worker = create_trust_checked_agent("worker", "...", min_level="L2")
```

### 7.4 Direct AMC SDK Usage

```typescript
import {
  createAgentClaim,
  verifyAgentClaim,
  computeTransitiveTrust,
  applyTemporalDecay,
  INDUSTRY_DECAY_PRESETS,
  type TrustGraph,
  type TrustPolicyRule,
} from './src/score/crossAgentTrust.js';

// Build a trust graph for your agent fleet
const graph: TrustGraph = {
  edges: [
    {
      from: 'orchestrator',
      to: 'researcher',
      score: 0.75,                    // Internal 0–1
      scopes: ['read', 'write'],
      establishedAt: Date.now(),
      ttlMs: 24 * 3600 * 1000,        // 24 hours
    },
    {
      from: 'researcher',
      to: 'writer',
      score: 0.65,
      scopes: ['read', 'write'],
      establishedAt: Date.now(),
      ttlMs: 12 * 3600 * 1000,
    },
  ],
};

// Compute transitive trust from orchestrator to writer
const transitive = computeTransitiveTrust(graph, 'orchestrator', 'writer');
console.log(`Transitive score: ${transitive?.transitiveScore} (${transitive?.maturityLevel})`);
// Example: "Transitive score: 34.1 (L2)"
// (0.75 × 0.65 × 0.7^0 = 0.4875 → displayed as 48.8 → L2 after no extra hops)

// Apply temporal decay for healthcare environment
const freshScore = 0.80;
const establishedHoursAgo = 6;
const decayedScore = applyTemporalDecay(
  freshScore,
  Date.now() - (establishedHoursAgo * 3600000),
  INDUSTRY_DECAY_PRESETS.healthcare
);
// After 6 hours with halfLife=4h: 0.80 × e^(-0.693×6/4) ≈ 0.28
```

### 7.5 CLI Reference

```bash
# Issue a trust token for an agent
amc passport create --agent my-agent --ttl 24h

# Verify another agent's trust token
amc passport verify --token ./agent-b-token.json

# Check agent identity claim
amc identity verify --agent agent-b --workspace prod-workspace

# Refresh an expiring identity claim
amc identity refresh --agent my-agent

# View trust graph
amc trust graph --show

# Compute transitive trust
amc trust transitive --from agent-a --to agent-c --max-hops 3

# Apply industry preset
amc trust decay --preset healthcare --score 80 --age 6h
```

---

## 8. Security Considerations

### 8.1 Token Replay Attacks

**Threat:** An attacker captures a valid token and replays it after expiry or in a different context.

**Mitigations:**
- Tokens include `expiresAt`; implementations MUST reject tokens where `Date.now() > expiresAt`.
- The `tokenId` (UUID) enables one-time-use enforcement if implementations maintain a token nonce store.
- The `issuer.workspaceId` scopes tokens to a specific workspace.

### 8.2 Trust Score Inflation

**Threat:** An agent inflates its AMC score by submitting self-reported evidence before issuing a trust token.

**Mitigations:**
- The `observedShare` field in `TrustClaim` reveals the fraction of evidence that is OBSERVED tier.
- Policies SHOULD set `minObservedShare` for high-stakes delegations.
- L4/L5 agents require exclusively OBSERVED/ATTESTED evidence in the underlying maturity score.

### 8.3 Trust Path Manipulation

**Threat:** An attacker inserts themselves into a trust chain by establishing a low-effort trust edge.

**Mitigations:**
- `computeTransitiveTrust` multiplies scores (not averages them), so a weak link strongly attenuates the entire chain.
- The `weakestLink` field in `TransitiveTrustResult` is always surfaced for auditing.
- `maxHops: 3` limits the chain depth, bounding the attack surface.

### 8.4 Signature Forgery

**Threat:** An attacker crafts a forged `AgentIdentityClaim` or `AMCTrustToken`.

**Mitigations:**
- HMAC-SHA256 signing with `sharedSecret` prevents forgery without the secret.
- The `issuer.publicKeyHash` enables out-of-band verification of the issuer's key.
- AMC Passports with Ed25519 signatures provide non-repudiable proof of issuance.

### 8.5 Temporal Decay Bypass

**Threat:** An attacker refreshes a token just before expiry to reset decay.

**Mitigations:**
- Token refresh requires re-running the AMC assessment (not just reissuing a token).
- The `lastAssessedAt` field in each `TrustClaim` reflects when the underlying evidence was collected, independent of token issuance time.
- Implementations SHOULD apply `applyTemporalDecay` to `lastAssessedAt`, not to `issuedAt`.

---

## Appendix: Protocol Reference

### Trust Level Mapping

| Trust Level | Composite Score Range | Default Scopes |
|-------------|----------------------|----------------|
| `full` | ≥ 0.80 | read, write, execute, delegate |
| `conditional` | 0.60 – 0.79 | read, write |
| `limited` | 0.40 – 0.59 | read |
| `untrusted` | < 0.40 | none |

### Level Order

For policy enforcement, levels are ordered: L1 < L2 < L3 < L4 < L5. L0 is not a valid delegation target.

### Industry Preset Summary

| Preset | Model | Half-life | Max Age | Step Threshold | Step Reduction |
|--------|-------|-----------|---------|----------------|----------------|
| `healthcare` | exponential | 4h | 24h | 6h | 0.3 |
| `finance` | exponential | 8h | 48h | 12h | 0.4 |
| `defense` | step | 2h | 12h | 4h | 0.2 |
| `entertainment` | linear | 72h | 168h | 48h | 0.7 |
| `general` | exponential | 24h | 168h | 48h | 0.5 |

---

*This specification defines the AMC Trust Protocol as implemented in `src/score/crossAgentTrust.ts` and `src/passport/trustInterchange.ts`. All numeric constants are sourced from the reference implementation and are stable across patch versions. Breaking changes to the protocol will increment the version to 2.0.*
