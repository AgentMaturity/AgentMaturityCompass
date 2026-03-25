# AMC Implementation Reality Map

This page answers a simple question: what in AMC is the actual runtime, what is an integration shell around that runtime, what is partial or exploratory, and what preserves older lineage for compatibility.

This is an implementation map, not a marketing map.

For the readable architectural overview, see [ARCHITECTURE_BRIEF.md](ARCHITECTURE_BRIEF.md). For the subsystem deep dives, see [deep-dive/INDEX.md](deep-dive/INDEX.md).

## The Four Buckets

AMC surfaces in this repo fit into four buckets:

- **Core runtime**: the current TypeScript implementation that operators depend on directly
- **Wrapper or integration surface**: a thinner shell that routes into the core runtime
- **Experimental or partial**: a real surface with narrower scope or incomplete parity with the primary operator path
- **Legacy lineage or preserved parallel implementation**: older or compatibility-oriented surfaces that still exist, but should not be mistaken for the main operational core

## Core Runtime

| Surface | Why this bucket | User-facing implication |
| --- | --- | --- |
| TypeScript CLI, workspace bootstrap, and host/workspace routing in `src/cli.ts`, `src/workspace.ts`, and `src/workspaces/` | This is the main entrypoint for local operation, service orchestration, and signed workspace state | If you want to understand how AMC actually runs, start here |
| Studio API, console, and supervisor in `src/studio/` | Studio is a first-class long-lived control surface around the same runtime | Self-hosted AMC is built around this surface, not around a separate product implementation |
| Gateway and current adapter system in `src/gateway/`, `src/adapters/`, and `src/pairing/` | Provider routing, evidence interception, and agent wrapping happen here today | Integrations that capture real execution evidence typically resolve back to this path |
| Trust, evidence, transparency, notary, and global verification in `src/ledger/`, `src/receipts/`, `src/trust/`, `src/transparency/`, `src/notary/`, `src/vault/`, and `src/verify/` | This stack carries the platform's evidence-backed trust model | AMC's differentiation depends on this being real, and it is |
| Governance and execution controls in `src/approvals/`, `src/governor/`, `src/leases/`, `src/plugins/`, `src/auth/`, `src/identity/`, `src/tickets/`, `src/workorders/`, and `src/budgets/` | These modules enforce policy, identity, approvals, and bounded execution | AMC is not only observational; it has real control-path logic in the current runtime |
| Diagnostic, assurance, compliance, domain, benchmark, org, and fleet systems in `src/diagnostic/`, `src/assurance/`, `src/compliance/`, `src/domains/`, `src/bench/`, `src/org/`, and `src/fleet/` | This is where scoring, adversarial testing, mappings, and aggregation actually happen | Public claims about AMC's scoring depth should be read through these modules |
| Deployment and release assets in `deploy/` and `src/release/` | These package and verify the current TypeScript system | Production deployment paths are extensions of the same core runtime, not separate implementations |
| MCP server in `src/mcp/` | This is a current protocol surface implemented inside the TypeScript codebase | Treat it as a real runtime integration point, not as a docs-only concept |

## Wrapper or Integration Surfaces

| Surface | Why this bucket | User-facing implication |
| --- | --- | --- |
| Python SDK in `sdk/python/` | The current SDK largely shells into the CLI or routes into the existing runtime instead of re-implementing the core platform | Useful for adoption and ergonomics, but not the source of truth for runtime behavior |
| Pytest plugin in `integrations/pytest-amc/` | This is a testing-oriented wrapper that invokes AMC from Python workflows | Good for CI and Python teams, but it depends on the main runtime rather than replacing it |
| VS Code extension in `vscode-extension/` | The extension is primarily an editor shell around AMC commands and config flows | It improves operator workflow, but architecture questions still resolve back to the TypeScript runtime |
| GitHub Action in `amc-action/` | The action is a composite automation surface around existing CLI flows | CI packaging is not a separate scoring engine |
| Examples in `examples/` | Examples demonstrate how to attach frameworks and tools to AMC | Use them as onboarding assets, not as architectural authority |
| Generated adapter starter projects and fetch/request wrappers in `src/adapters/snippets/` and example folders | These are designed to reduce integration effort, not to define platform internals | They explain how to connect into AMC, not how AMC itself is built |

## Experimental or Partial

| Surface | Why this bucket | User-facing implication |
| --- | --- | --- |
| Browser playground documented in `docs/BROWSER_SANDBOX.md` and related website assets | It is a real exploration path, but it does not represent the full evidence-capture or governance runtime | Good for product understanding and demos, not for evaluating full operational depth |
| Single-binary packaging path documented in `docs/SINGLE_BINARY.md` | The repo treats this path honestly as narrower and not the default serious operator route | Use it carefully and do not assume parity with the main CLI and service path |
| Thin visual or onboarding shells that sit ahead of the CLI and Studio runtime | These surfaces help discovery and adoption, but they are not where the core system logic lives | Judge AMC's implementation maturity by the underlying runtime, not by the thinnest shell in front of it |

## Legacy Lineage or Preserved Parallel Implementation

| Surface | Why this bucket | User-facing implication |
| --- | --- | --- |
| `platform/python/` | This subtree contains a large preserved Python implementation lineage, tests, and reports, but it is not the current operational center of gravity for AMC | Treat it as historical or parallel lineage unless you are intentionally working that subtree |
| Legacy `amc wrap <provider>` compatibility commands, still documented in places like `docs/ADAPTERS.md` | They remain for continuity, while `amc adapters run` is the preferred current path | Existing scripts may continue to work, but new guidance should point to adapters as the primary surface |
| Compatibility aliases in route names, adapter flows, and some assurance pack naming | The repo preserves multiple names where doing so protects older workflows or imports | The existence of an alias should not be read as proof of a second architecture |
| Older public narratives that imply separate product stacks for every family name | Those narratives are documentation lineage, not implementation reality | When in doubt, follow the TypeScript source tree and the architecture brief, not the broadest packaging language |

Concrete examples of preserved naming lineage include duplicate or near-duplicate assurance pack file names such as `do-not-answer-pack.ts` and `donotanswer-pack.ts`, or `toxic-chat-pack.ts` and `toxicchat-pack.ts`. Those are compatibility signals, not evidence of multiple assurance engines.

## What This Means For Readers

If you are evaluating AMC:

- start with the TypeScript runtime, not with wrappers
- treat CI, IDE, SDK, and plugin shells as integration layers unless the source shows otherwise
- treat `platform/python/` as a parallel or historical lineage, not as the current center of the product
- read broad product-family language through the implementation buckets above

If you are maintaining AMC docs:

- do not let wrapper surfaces stand in for the runtime in top-level explanations
- do not use legacy lineage to imply current-core parity
- keep architecture claims anchored to the TypeScript core unless a specific alternative surface is intentionally being documented

## Related Reading

- [ARCHITECTURE_BRIEF.md](ARCHITECTURE_BRIEF.md)
- [DOCS_DRIFT_CLEANUP_PLAN.md](DOCS_DRIFT_CLEANUP_PLAN.md)
- [deep-dive/INDEX.md](deep-dive/INDEX.md)
