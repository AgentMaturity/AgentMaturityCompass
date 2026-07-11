# Agent Control and AgentApprove Competitive Review

Reviewed: 2026-07-10

## Scope and retrieval

This review used only public, first-party material:

- [Agent Control site](https://agentcontrol.dev), [documentation inventory](https://docs.agentcontrol.dev/llms.txt), [control model](https://docs.agentcontrol.dev/concepts/controls), and [repository](https://github.com/agentcontrol/agent-control).
- [AgentApprove site](https://www.agentapprove.com), [agents](https://www.agentapprove.com/agents), [changelog](https://www.agentapprove.com/changelog), and [AEP overview](https://www.agentapprove.com/standards/agent-event-protocol).
- [Agent Event Protocol repository](https://github.com/agentapprove/agent-event-protocol), [specification](https://github.com/agentapprove/agent-event-protocol/blob/main/spec.md), and [integration guide](https://github.com/agentapprove/agent-event-protocol/blob/main/integration-guide.md).

The Agent Control docs crawl fetched all 45 URLs listed by its `llms.txt`; the AgentApprove crawl fetched all 29 URLs in its sitemap. Both public sites were rendered at desktop and mobile widths. Repositories were reviewed at these immutable commits:

- Agent Control: `83188b62c63e2b4ff9ada87048fd99605184ee5a` (`v8.2.0`, 2026-06-25).
- Agent Event Protocol: `2583cff9380f8f0a459d52c7112b6105c46496ed` (public draft 0.1, 2026-05-11).

No competitor code, prose, examples, mappings, prompts, screenshots, configuration, or UI assets are copied into AMC.

## Executive decision

AMC should not become another policy editor or approval inbox. Its defensible position is a compact trust control plane:

1. Easy provider connection and understandable controls.
2. Signed enforcement and approval decisions.
3. Execution-observed Score, Shield, Watch, and Fleet evidence.
4. Portable Passport and audit-ready Comply proof.

Agent Control is currently easier to understand as a policy engine. AgentApprove is currently easier to adopt as an approval companion. AMC is stronger in evidence integrity, maturity scoring, assurance depth, fleet governance, and compliance proof, but those advantages are harder to reach because provider hooks and control status are fragmented.

AMC-1461 closes the first P0: Guardrails state now persists, verifies, distinguishes requested from effective, and binds only real Runtime Firewall rules.

AMC-1462 closes the second P0: Bridge now accepts a least-privilege, quota-safe, pinned provider-neutral action subset and turns it into encrypted Watch evidence plus idempotently recoverable signed receipts without retaining raw hook payloads or claiming AEP conformance.

AMC-1463 closes the third P0: one reversible command now installs, verifies, or removes primary-source-pinned Claude Code and Gemini CLI project hooks. A signed ownership manifest binds the exact handler, provider source, agent, Bridge origin, ignore protection, and dedicated `hook:observe` lease; the hidden forwarder cannot read arbitrary workspace secrets or deliver to unsigned destinations. Tool inputs and raw session identifiers remain outside the Watch receipt path.

AMC-1471 closes the approval-delivery P0: every operator surface now projects the canonical signed quorum chain, ToolHub and decision routes dispatch metadata-only lifecycle events through the existing Vault-backed integration queue, Studio refreshes over privacy-safe SSE, and notifications remain non-authoritative pointers to authenticated review.

AMC-1472 closes the outcome-onboarding P0: CLI and Studio now share one read-only activation projection over signed connection state and existing runtime receipts. Configuration can become ready, but only a verified action, control decision, and signed proof for the selected agent can complete onboarding.

AMC-1473 closes the first operator-speed P1: existing Enforce resource manifests now project one signed active, previous, rollback, drift, and integrity state across CLI, API, Studio, and OpenAPI. Activation and rollback are dry-run first, exact-manifest-confirmed on remote surfaces, serialized, canonical-path-bound, digest-verified, post-verified, and signed-receipt-backed; hard integrity failures cannot be forced through.

## What each competitor does well

### Agent Control

Its strongest idea is one composable control model:

- scope selects the runtime location;
- condition combines selectors and evaluators, including nested `and`, `or`, and `not` trees;
- action chooses observe, deny, or steer behavior;
- bindings, versions, and templates make controls reusable;
- Python and TypeScript SDKs plus framework plugins reduce integration work;
- the UI lets operators author and inspect controls without reading policy files.

The product is narrower than AMC, but the mental model is compact and teachable.

### AgentApprove

Its strongest idea is operator convenience:

- one-command setup and agent-specific hooks/plugins;
- a shared approval policy across supported coding agents;
- desktop, mobile, and watch approval surfaces;
- push notifications, follow-up text/voice context, an activity feed, and search;
- grouped MCP activity and compound-command review;
- visible privacy, encryption, and retention choices.

This turns a high-risk interruption into a routine workflow instead of a governance project.

### Agent Event Protocol

AEP provides a useful provider-neutral vocabulary:

- immutable lifecycle and action events;
- action correlation through stable IDs;
- tool, MCP server, skill, subagent, model, prompt, session, question, and notification context;
- a compact hook response with `allow`, `deny`, `ask`, `defer`, `block`, `continue`, `stop`, and `abstain` behaviors.

The protocol explicitly leaves signing, authentication, replay protection, encryption, and retention to consumers. Those are AMC strengths, not reasons to fork the event vocabulary.

## AEP adoption boundary

AEP is an early draft and says breaking changes are expected before 1.0. It does not yet publish the promised 1.0 reference JSON Schema or conformance fixtures.

Local strict parsing of the six mapping drafts found:

| Mapping | Dotted `content.0.*` keys | Strict YAML parse |
| --- | ---: | --- |
| Claude | 4 | Fail: duplicate map key |
| Codex | 2 | Pass |
| Cursor | 3 | Pass |
| Gemini | 4 | Fail: duplicate map key |
| GitHub | 3 | Pass |
| OpenCode | 3 | Pass |

AMC must not import these files as executable policy. A future AEP lane should:

- pin exact draft version and source commit;
- use AMC-owned JSON Schema and conformance fixtures for the pinned subset;
- reject duplicate keys, unknown required fields, invalid IDs, and ambiguous mappings;
- preserve the raw event hash while storing a redacted normalized projection;
- sign normalized events and decisions;
- deduplicate and reject replayed action IDs;
- keep provider-native payloads out of public proof bundles by default;
- expose adapter capability and lossiness receipts;
- fail closed for control hooks and degrade honestly for observation-only hooks.

## Capability comparison

| Capability | Agent Control | AgentApprove | AMC current | AMC decision |
| --- | --- | --- | --- | --- |
| First-use mental model | Strong | Strong | Broad, fragmented | One Connect, Control, Prove journey |
| Policy authoring | Strong recursive model and UI | Shared approval policy | Multiple mature policy modules, weak unified authoring | Build one projection over existing policies |
| Provider hooks | Framework SDK/plugins | Broad coding-agent hooks | Gateway/wrap plus uneven adapters | Add signed hook ingress and installer |
| Human approvals | Basic action outcome | Core product, mobile first | Strong signed quorum, leases, blast radius | Preserve rigor; improve delivery UX |
| Mobile operations | Limited | Strong | Fetch SDK, no approval companion | PWA/mobile notification lane after hook ingress |
| Signed controls | Not the primary differentiator | Not in AEP core | Strong AMC primitive | Make every effective status signature-backed |
| Replay protection | Product-specific | Excluded from AEP | Strong approval/receipt primitives | Apply to normalized hook events |
| Maturity scoring | No | No | L0-L5 Score | Keep as differentiator |
| Red-team assurance | Evaluator focused | No | Shield packs and exploit proof | Keep as differentiator |
| Continuous trust drift | Observability | Activity feed | Watch and signed drift evidence | Simplify operator view |
| Fleet governance | Limited | Cross-agent inbox | Fleet graph, lifecycle, inheritance | Connect provider events to Fleet IDs |
| Portable trust proof | No | No | Passport | Export adapter/control provenance |
| Compliance evidence | Limited | Privacy policy | Comply mappings and binders | Bind approvals and controls to framework evidence |
| Truthful effective status | Clear control results | Clear approval state | Fixed by AMC-1461 for Guardrails | Extend same contract to every control surface |

## Prioritized AMC backlog

### P0: adoption and trust boundary

| # | Action | Existing AMC primitive | Acceptance boundary |
| ---: | --- | --- | --- |
| 1 | Persist signed Guardrails intent and effective status | Runtime Firewall, artifact signatures | Shipped in AMC-1461; restart, concurrency, API, Dashboard, runtime, and tamper tests pass |
| 2 | Add a pinned provider-neutral hook ingress | Bridge, Watch events, receipts | Shipped in AMC-1462; four AEP 0.1 action types, exact source pin, least-privilege lease, transactional quota, raw-body non-retention, recoverable signed receipts, conflicting-replay rejection, and no conformance claim |
| 3 | Add `amc connect hooks` install/status/remove | Adapter registry, Studio supervisor | Shipped in AMC-1463; idempotent, reversible, dry-run, exact files shown, signed ownership, managed credential ignore rule, no shell-profile surprises |
| 4 | Return provider-native signed control responses | Approval policy, action policy, ToolHub | Shipped in AMC-1464; observe remains default, control is explicit and loopback-only, allow/deny/ask mappings are receipt-bound and replay protected, Gemini ask fails closed, and multi-user quorum is never weakened |
| 5 | Publish adapter capability receipts | Adapter registry, Passport | Shipped in AMC-1465; every built-in declares events, controls, lossiness, version source, activation conditions, and verification evidence in the authoritative registry, while signed receipts separate declared from effective state and plugins fail closed |
| 6 | Correlate hook action lifecycle end to end | Runtime runs, episodes, lifecycle graph | Shipped in AMC-1466; requested, signed decision, and completed or failed receipts share one stable action ID, terminal ambiguity and impossible lifecycles fail closed, and no second event store was added |
| 7 | Build one control projection | Existing policies, Runtime Firewall, approvals | Shipped in AMC-1469; one read-only Scope / When / Then / Status projection verifies existing signed modules, exposes catalog-only gaps, and fails closed without a second policy engine |
| 8 | Add control simulation with explanation | Policy decision receipts | Shipped in AMC-1470; Runtime Firewall, Action Policy, and Approval Policy simulations use their production evaluators, expose exact matched rules and structured conditions, fail closed on untrusted state, and create no receipt or proof |
| 9 | Add approval delivery service | Approval store, leases, quorum | Shipped in AMC-1471; canonical quorum projection, metadata-only signed delivery, ordered retry/dead-letter evidence, SSE refresh, terminal replay denial, session revalidation, and no notification authority |
| 10 | Make onboarding outcome based | Quickstart, connect wizard | Shipped in AMC-1472; signed configuration is READY only, while verified agent-bound action, decision, and proof receipts complete the four-milestone projection |

### P1: operator speed without weaker governance

| # | Action | AMC surface | No-bloat boundary |
| ---: | --- | --- | --- |
| 11 | Version, diff, activate, and roll back controls | Enforce | Shipped in AMC-1473; reuses signed resource manifests and lifecycle receipts, exposes one bounded status projection, rejects noncanonical selectors and stale confirmations, and writes no success receipt on integrity failure |
| 12 | Add reusable scope templates | Enforce/Fleet | Shipped in AMC-1474; four immutable action-class groups compile selected built-in Policy Pack rules into the existing signed Action and Approval Policy schemas with read-only preview, exact confirmation, transaction rollback, and an explicit fleet-wide boundary |
| 13 | Add nested condition authoring | Enforce | Use one AST, no source-specific rule languages |
| 14 | Add steer outcome where provider supports it | Enforce | Capability-gated; never report steer when mapped to warn |
| 15 | Add observe-only rollout and counters | Watch | Same policy with mode, not duplicate controls |
| 16 | Add evaluator registry metadata | Score/Shield | Registry points to existing evaluators and signed versions |
| 17 | Add policy test fixtures in CI | Enforce | Deterministic AMC-owned fixtures only |
| 18 | Add hook health and last-event diagnostics | Watch | No background daemon unless Studio already runs |
| 19 | Add approval activity search and filters | Enforce/Watch | Query existing receipts, no new activity database |
| 20 | Group MCP server and tool context | Enforce/Fleet | Normalize into ToolHub identities and trust graph |
| 21 | Show compound-command blast radius | Enforce | Reuse command parser and blast-radius consent |
| 22 | Add deny-with-feedback round trip | Enforce | Feedback signed and redacted before provider return |
| 23 | Add notification privacy tiers | Vault | Metadata-only default; explicit opt-in for previews |
| 24 | Add retention controls for hook payloads | Vault/Comply | Reuse retention and deletion receipts |
| 25 | Add local PWA approval inbox | Enforce | No native mobile apps until delivery and security evals pass |
| 26 | Add offline/expired approval behavior | Enforce | Timeout denies; no silent local allow |
| 27 | Add multi-device decision race handling | Enforce | First valid lease consumption wins; later responses are replay evidence |
| 28 | Add control impact timeline | Watch | Project existing decision events, no parallel telemetry store |
| 29 | Add provider hook setup in Studio | Studio | Calls the same installer library as CLI |
| 30 | Add first-decision sample task | Score/Enforce | AMC-owned fixture, low token use, removable after onboarding |

### P2: differentiation and ecosystem

| # | Action | AMC surface | Gate before shipping |
| ---: | --- | --- | --- |
| 31 | Export signed AEP-compatible observer bundles | Passport | Explicit draft version and non-conformance label |
| 32 | Add partner adapter certification | Passport/Comply | Public fixture suite and signed receipt |
| 33 | Add control coverage to L0-L5 scoring | Score | Execution evidence only; config presence cannot raise maturity |
| 34 | Add approval latency and interruption metrics | Watch | Privacy-safe aggregates with minimum sample threshold |
| 35 | Add fleet policy inheritance explanation | Fleet | Existing trust graph remains authority |
| 36 | Add cross-agent approval policy comparison | Fleet | Read-only diff before any bulk apply |
| 37 | Add control-to-framework evidence crosswalk | Comply | Only verified effective decisions count |
| 38 | Add safe community control templates | Enforce | Signed package, provenance, tests, and no auto-activation |
| 39 | Add mobile platform wrappers | Enforce | Only after PWA task completion and threat model review |
| 40 | Add voice context capture | Enforce/Vault | Optional, locally redacted, retention-bound, never needed to approve |

## What AMC should not build

- A source-specific Agent Control compatibility engine.
- A second approval store for provider hooks.
- A verbatim AEP mapping importer.
- A mobile app before secure notification delivery and lease semantics work in the web surface.
- A new event database when the ledger, runtime events, episodes, and lifecycle graph already own evidence.
- A generic policy language that bypasses signed ToolHub, action policy, approval policy, Vault, or Runtime Firewall controls.
- Feature-count copy that labels catalog entries as protection.

## Success measure

AMC is better when a new user can run one connection command, observe one real action, understand one control decision, approve or deny it securely, and export one signed proof bundle without learning the internal module map. Breadth only matters after that path is reliable.
