# Multi-Agent Trust

How AMC handles trust composition, propagation, and governance across fleets of agents operating on multiple devices and organizational boundaries.

---

## The Problem

A single agent's maturity score is straightforward: observe it, score it, sign the evidence. But real deployments involve dozens or hundreds of agents collaborating, delegating, and sharing context. Trust in a multi-agent system is not the average of individual scores — it is constrained by the weakest link in any delegation chain.

AMC addresses this through three mechanisms: trust composition, trust propagation, and governance topology.

---

## 1. Trust Composition

### Composite Trust Score

When agents collaborate on a task, the effective trust of the collaboration is computed as:

```
T_composite(task) = min(T(agent_i)) for all agent_i in delegation_chain(task)
```

This is the **weakest-link principle**: a chain of agents is only as trustworthy as its least mature member. An L4 orchestrator delegating to an L1 tool-calling agent produces an L1-effective trust for that task path.

### Fleet Trust Commands

```bash
amc fleet trust-init                          # Initialize trust composition graph
amc fleet trust-add-edge --from a1 --to a2    # Agent a1 delegates to a2
amc fleet trust-remove-edge --from a1 --to a2
amc fleet trust-edges                         # List all delegation edges
amc fleet trust-report                        # Composite trust report
amc fleet trust-receipts                      # Verify cross-agent receipt chains
amc fleet dag                                 # Visualize delegation graph
amc fleet trust-mode                          # Set trust inheritance policy
```

### Trust Inheritance Modes

| Mode | Behavior |
|------|----------|
| `weakest-link` (default) | Composite trust = min score across chain |
| `weighted-delegation` | Composite trust = weighted by delegation scope (read-only delegations penalized less) |
| `isolated` | Each agent scored independently; no composition (useful for parallel, non-interacting agents) |

Set via:
```bash
amc fleet trust-mode --mode weakest-link
```

### Delegation Receipts

Every cross-agent delegation produces a signed receipt:

```json
{
  "receiptId": "rcpt_a1_a2_20260223T1400Z",
  "delegator": "orchestrator-agent",
  "delegate": "tool-agent",
  "action": "WRITE_LOW",
  "scope": ["file:write", "api:read"],
  "delegatorTrust": { "level": 4, "score": 82.3 },
  "delegateTrust": { "level": 2, "score": 41.7 },
  "effectiveTrust": { "level": 2, "score": 41.7 },
  "timestamp": "2026-02-23T14:00:00Z",
  "hash": "sha256:..."
}
```

Receipts are hash-chained into the transparency log. The full chain is verifiable:

```bash
amc receipts-chain --receipt rcpt_a1_a2_20260223T1400Z
```

---

## 2. Weakest-Link Trust Boundaries

### Why Weakest-Link?

Consider an orchestrator (L4, score 85) that delegates a database write to a tool agent (L2, score 38). If the tool agent is compromised or immature, the orchestrator's high score is irrelevant — the damage flows through the weakest point.

AMC enforces this structurally:

- **Governor checks** at delegation time compare the delegate's trust level against the action's required minimum level. If the delegate is below threshold, the delegation is blocked or requires human approval.
- **Handoff packets** carry the delegator's context (what, why, constraints) to the delegate, and the delegate's execution evidence flows back. Both directions are signed.
- **Contradiction detection** (`amc fleet contradictions`) identifies cases where agents in the same fleet produce conflicting evidence or policy decisions.

### Boundary Enforcement

```bash
# Governor blocks delegation if delegate trust is insufficient
amc governor check --agent tool-agent --action DEPLOY --risk high
# → DENIED: agent trust level 2 < required level 4 for DEPLOY/high

# Handoff with context
amc fleet handoff --from orchestrator --to tool-agent --workorder wo_123
```

---

## 3. Cross-Device and Edge Trust Propagation

### The Edge Problem

Agents don't always run on the same machine. An orchestrator on a cloud server may delegate to an agent running on an edge device, a user's laptop, or a mobile phone. Trust must propagate across device boundaries without assuming network reliability or centralized coordination.

### AMC's Approach: Portable Trust Artifacts

AMC solves cross-device trust through **portable, offline-verifiable artifacts**:

| Artifact | Purpose | Verification |
|----------|---------|-------------|
| Agent Passport (`.amcpass`) | Carries agent's maturity posture | Offline signature + Merkle proof verification |
| Evidence Bundle (`.amcbundle`) | Carries signed evidence chain | Hash-chain integrity + signature verification |
| Federation Package (`.amcfed`) | Cross-org trust sharing | Peer public key verification |
| Lease Token | Short-lived gateway access | Cryptographic verification, TTL-bounded |

### Propagation Flow

```
Cloud Orchestrator                    Edge Agent
       |                                  |
       |-- issues lease + passport ------>|
       |                                  |-- verifies passport offline
       |                                  |-- executes within lease scope
       |<-- returns signed receipt -------|
       |-- verifies receipt + evidence    |
       |-- updates transparency log       |
```

Key properties:
- **No always-on connection required.** The edge agent can verify the orchestrator's passport and lease offline. Evidence is synced when connectivity returns.
- **Lease-bounded autonomy.** Edge agents operate within TTL-bounded, scope-limited leases. When the lease expires, the agent stops. No lease renewal without fresh trust verification.
- **Evidence flows back.** The edge agent's execution evidence is bundled, signed, and returned to the orchestrator's workspace for inclusion in the transparency log.

### Pairing for Remote Agents

```bash
# On the orchestrator's workspace
amc pair create --agent-name "edge-agent-01" --ttl-min 60

# On the edge device
amc connect --token <pairing-token>
```

The pairing flow establishes mutual trust anchors (public keys) and configures evidence sync.

---

## 4. Network-Wide Policy Updates vs. Individual Chains

### The Governance Propagation Problem

When a policy changes (e.g., "all agents must now require dual-control approval for DEPLOY actions"), how does that change reach every agent in the fleet?

### AMC's Two-Layer Model

**Layer 1: Fleet-Wide Policy (Centralized)**

Fleet policy is defined in `.amc/fleet.yaml` (signed) and propagated to all agents:

```bash
amc policy pack apply security-hardened --scope fleet
```

This updates the signed policy for every agent in the fleet. Agents that cannot verify the new policy signature refuse to operate (fail-closed).

**Layer 2: Per-Agent Evidence Chains (Decentralized)**

Each agent maintains its own evidence chain (ledger, receipts, transparency log). Policy updates don't rewrite history — they create a new policy epoch. Evidence collected under the old policy retains its original trust level; new evidence is evaluated under the new policy.

### Chain Independence

Individual agent chains do NOT update together. Each chain is append-only and independently verifiable:

- Agent A's chain records Agent A's evidence
- Agent B's chain records Agent B's evidence
- Cross-agent interactions produce receipts in BOTH chains
- A policy update creates a new signed policy entry in each agent's chain

### Chain Influence

Chains influence each other only through:
1. **Delegation receipts** — when Agent A delegates to Agent B, both chains record the receipt
2. **Contradiction detection** — `amc fleet contradictions` scans across chains for conflicting claims
3. **Fleet scoring** — `amc fleet report` aggregates across chains using weakest-link composition

### Network Revert

AMC supports reverting to a previous policy state:

```bash
amc rollback-create --scope fleet --to-epoch 5
```

This creates a signed rollback pack that restores the fleet policy to epoch 5. Evidence collected after epoch 5 is not deleted — it is re-evaluated under the restored policy. The rollback itself is recorded in the transparency log (you cannot silently revert).

---

## 5. Centralized vs. Decentralized Governance

### AMC Supports Both Models

| Aspect | Centralized | Decentralized |
|--------|-------------|---------------|
| Policy authority | Single workspace owner | Federated peer consensus |
| Policy propagation | `amc policy pack apply --scope fleet` | `amc federate export/import` |
| Evidence storage | Single `.amc/` workspace | Per-org workspaces with federation sync |
| Trust anchors | Owner's vault keys | Peer public keys in federation config |
| Scoring | Fleet report from single workspace | Cross-org benchmark comparison |
| Use case | Single team/org, <50 agents | Multi-org, regulated industries, >50 agents |

### Centralized Model (Single Workspace)

One AMC workspace manages all agents. The workspace owner controls policy, scoring, and evidence. This is the default and simplest model.

```bash
amc fleet init --org "Acme AI Ops"
amc agent add --name agent-01
amc agent add --name agent-02
amc policy pack apply enterprise-strict --scope fleet
amc fleet report --window 30d
```

Trust is computed from a single, consistent evidence base. Policy changes are atomic across the fleet.

### Decentralized Model (Federation)

Multiple organizations each run their own AMC workspace. They share privacy-safe trust artifacts (benchmarks, certificates, Merkle roots) without exposing raw evidence.

```bash
# Org A
amc federate init --org "Org A"
amc federate peer add --peerId orgB --name "Org B" --pubkey orgB.pub
amc federate export --out orgA-latest.amcfed

# Org B
amc federate import orgA-latest.amcfed
amc bench compare --scope workspace --against orgA-imported
```

In the decentralized model:
- Each org is sovereign over its own evidence and policy
- Trust between orgs is established through federation peer keys
- Shared artifacts are privacy-safe (no raw evidence, no PII, no secrets)
- Cross-org trust is verified through Merkle proof inclusion, not by trusting the other org's claims

### Hybrid Model

Most real deployments use a hybrid: centralized within an org (fleet mode), decentralized across orgs (federation). AMC supports this natively — fleet and federation are orthogonal features.

---

## 6. The "Blockchain of Trust" — Atomic Trust Units

### What AMC Records

Every trust-relevant event is an atomic unit in the transparency log:

| Event Type | What It Records |
|------------|----------------|
| `EVIDENCE_OBSERVED` | AMC gateway observed an agent action |
| `EVIDENCE_ATTESTED` | Human/notary attested a claim |
| `DELEGATION_ISSUED` | Agent A delegated to Agent B |
| `DELEGATION_COMPLETED` | Delegate returned results + evidence |
| `POLICY_APPLIED` | New policy epoch activated |
| `POLICY_ROLLBACK` | Policy reverted to previous epoch |
| `SCORE_COMPUTED` | Maturity score calculated from evidence |
| `APPROVAL_GRANTED` | Human approved an agent action |
| `APPROVAL_DENIED` | Human denied an agent action |
| `LEASE_ISSUED` | Short-lived access token created |
| `LEASE_REVOKED` | Access token revoked before expiry |

### Hash-Chain Structure

Each entry in the transparency log includes:
- Content hash (SHA-256 of the event payload)
- Previous entry hash (creating the chain)
- Timestamp
- Agent ID
- Event type
- Signature (vault key or notary key)

```
Entry N:   hash(payload_N) + hash(Entry N-1) + sig
Entry N+1: hash(payload_N+1) + hash(Entry N) + sig
```

### Merkle Tree Overlay

The hash chain is indexed by a Merkle tree for efficient inclusion proofs:

```bash
amc transparency merkle prove --entry-hash <hash> --out proof.amcproof
amc transparency merkle verify-proof proof.amcproof --pubkey <recorded-auditor.pub>
```

This allows any party to verify that a specific trust event exists in the log without downloading the entire chain.

### Why This Is Not a Traditional Blockchain

AMC's transparency log is a **signed hash chain with Merkle proofs**, not a distributed consensus blockchain. Key differences:

| Property | AMC Transparency Log | Traditional Blockchain |
|----------|---------------------|----------------------|
| Consensus | Single authority (workspace owner/notary) | Distributed consensus (PoW/PoS) |
| Append-only | Yes | Yes |
| Tamper-evident | Yes (hash chain + signatures) | Yes (hash chain + consensus) |
| Offline-verifiable | Yes (Merkle proofs) | Partial (need chain state) |
| Performance | Thousands of entries/second | Limited by consensus |
| Trust model | Trust the signer (verifiable) | Trust the majority |

AMC chose signed hash chains over distributed consensus because:
1. Agent trust is inherently hierarchical (owner > agent), not peer-to-peer
2. Performance matters — agents produce thousands of events per session
3. Offline verification is critical for edge/cross-device scenarios
4. The signing authority (vault/notary) is already a trusted boundary in AMC's threat model

For deployments that require distributed consensus (e.g., multi-org scenarios where no single party is trusted), AMC's federation model provides cross-org verification through mutual Merkle root exchange — each org verifies the other's chain independently.

---

## Addressing Common Questions

### "What determines policy updates for the entire network?"

The fleet policy owner (workspace owner or designated governance role via RBAC). Policy changes are signed, versioned, and propagated to all agents. Agents verify the signature before accepting. In federated deployments, each org controls its own policy; cross-org policy alignment is voluntary, not enforced.

### "Do chains update together or influence each other?"

No. Each agent's evidence chain is independent and append-only. Chains influence each other only through delegation receipts (recorded in both chains) and fleet-level scoring (which reads across chains). A corruption in Agent A's chain does not affect Agent B's chain.

### "What changes if AMC is centralized vs. decentralized?"

See Section 5 above. The core trust model (evidence-gated, signed, hash-chained) is identical in both modes. What changes is the policy authority (single owner vs. federated peers) and the evidence visibility (full access vs. privacy-safe exports).

### "Can the network revert to a previous state via the AMC blockchain?"

Policy can be rolled back to a previous epoch. Evidence cannot be deleted or reverted — the chain is append-only. A rollback creates a new entry in the chain recording the revert, so the full history (including the rollback decision) is preserved.
