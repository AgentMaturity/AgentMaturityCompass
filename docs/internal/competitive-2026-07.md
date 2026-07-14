# Competitive scan — 2026-07-14

Reviewed at Sid's request: pi.dev, citadel-nexus.com, bytedance/deer-flow, skales.app, node9.ai, willdady/platypus. Verdicts and the concrete AMC actions taken.

## Direct competitor: node9.ai

The only real competitor in the set — "IAM for your AI agents," an Apache-2.0 CLI + MCP gateway that observes/governs/blocks agent tool calls at runtime, with MCP tool-pinning (SHA-256, quarantine on change), DLP, command shields, and a **posture scorecard** (`node9 posture`) graded across isolation, egress, secrets-on-disk, supply-chain, privilege.

**Overlap with AMC:** MCP security scanning, MCP trust ledger, agent-config/session scanning, audit trail, posture scorecard.

**Gaps node9 had that AMC lacked → CLOSED:**
- A one-command machine posture scorecard as a zero-friction onramp → shipped `amc shield posture` (AMC-1491): five graded dimensions (agent-config, mcp-trust, secrets-on-disk, isolation, supply-chain), overall L0–L5, CLEAN/REVIEW/BLOCK, CI exit code — **and superior**: on AMC's maturity model + a deterministic signed receipt (node9's scorecard is ungraded/unsigned).

**Where AMC already leads node9:** L0–L5 maturity model + improvement path; red-team/adversarial assurance packs; compliance artifacts across EU AI Act / NIST AI RMF / ISO 42001 / SOC 2 / GDPR; signed tamper-evident evidence ledger + GRC export; local Studio UI. node9 writes a plaintext `~/.node9/audit.log` with no cryptographic signing and no compliance mapping — AMC owns the audit/regulatory half entirely.

**Runtime enforcement note:** node9 blocks/approves tool calls inline. AMC already has runtime enforcement primitives (Enforce surface: policy firewall, exec guard, egress proxy, gateway, circuit breakers) — parity exists at the primitive level; the differentiator node9 leads with was the instant posture scan, now matched.

## Adjacent — agents AMC evaluates (not competitors)

- **DeerFlow (bytedance/deer-flow, ~68k★, MIT)** — deep-research "super agent harness" (LangGraph, sandboxes, MCP, memory, message gateway). A marquee **scoring-adapter target** and a workflow pattern to borrow (planner → parallel sub-agents → reporter synthesis for red-team orchestration). Adopt + advertise its loopback-only local-trusted default.
- **Pi (pi.dev / earendil-works, ~70k★, MIT)** — minimal coding-agent harness that **ships no permission system** and pushes sandboxing to extensions. That missing-controls posture is exactly what `amc shield posture` / `scan-config` detect — a clean demo target. Learn its npm/git **extension marketplace** model for distributing assurance packs + adapters, and its multi-surface delivery (TUI / print-JSON / RPC / SDK).
- **Platypus (willdady/platypus, ~47★, MIT)** — early multi-tenant TS agent platform. Learn the **Org/Workspace** scoping model for enterprise GRC roll-ups and **webhook + scheduled** automation for continuous assurance (re-score on a schedule, fire on maturity regression).
- **Skales (skales.app, ~1k★)** — private local-first desktop agent app. Not a competitor; a subject AMC scores. Learn consumer-grade packaging/GTM for the Studio and the "Private AI. Real work." locality message.

## Unrelated

- **Citadel Nexus (citadel-nexus.com)** — vertical AI phone receptionist + website builder for trades (plumbers/HVAC). Name collision only. Lesson: aggressive vertical positioning for AMC's industry packs.

## Roadmap seeded (not yet built)

1. DeerFlow scoring adapter + red-team orchestration pattern.
2. Continuous assurance: scheduled re-score + webhook on regression (Platypus lesson).
3. Org/Workspace multi-tenant scoping for GRC roll-ups.
4. Assurance-pack marketplace distribution (Pi lesson).
5. JSON/SDK surface hardening for CI/harness embedding (Pi lesson).
