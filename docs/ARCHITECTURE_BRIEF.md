# AMC Architecture Brief

This is the readable, implementation-backed overview of how AMC is built today.

If you want the file-by-file appendix, start with [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md). If you want a status view of what is core, wrapper, experimental, or legacy, read [IMPLEMENTATION_REALITY_MAP.md](IMPLEMENTATION_REALITY_MAP.md). If you want a subsystem walk-through, continue into [deep-dive/INDEX.md](deep-dive/INDEX.md).

## The Short Version

AMC is a TypeScript-first control, evidence, and evaluation system for AI agents.

The implementation center of gravity is not spread evenly across every branded surface in the repo. It is concentrated in a small set of runtime entrypoints:

- `src/cli.ts`
- `src/workspace.ts`
- `src/studio/studioServer.ts`
- `src/gateway/server.ts`
- `src/ledger/ledger.ts`
- `src/diagnostic/runner.ts`

Around those entrypoints, the repo adds trust primitives, governance controls, assurance packs, compliance mappings, deployment assets, and ecosystem integrations. That breadth is real, but the runtime still resolves back to the same TypeScript core.

## What AMC Fundamentally Does

At runtime, AMC turns agent activity into evidence and then uses that evidence for operator decisions.

In practical terms, that means:

1. an operator starts with the CLI, Studio, or an integration surface
2. AMC creates or resolves workspace state under `.amc`
3. model traffic or workflow activity routes through the AMC control path
4. the ledger, receipts, transparency, and trust stack preserve what happened
5. diagnostic, assurance, compliance, and reporting layers interpret that evidence
6. governance and release surfaces decide what is allowed, blocked, attested, or published

That is the stable architectural story underneath the broader product family.

## The Major Planes

### Control and Runtime Plane

This is the operator-facing execution path.

- CLI orchestration lives in `src/cli.ts`
- workspace bootstrap and signed local state live in `src/workspace.ts` and `src/workspaces/`
- Studio API, console, and supervision live in `src/studio/`
- provider routing and request mediation live in `src/gateway/`

This plane is what users feel first. It is where commands are issued, workspaces are resolved, services are started, and traffic gets routed.

### Trust and Evidence Plane

This plane makes AMC's claims auditable.

- append-only evidence storage lives in `src/ledger/`
- receipt generation and chaining live in `src/receipts/`
- trust mode, signatures, and local or external trust boundaries live in `src/trust/`, `src/vault/`, and `src/notary/`
- transparency logging and Merkle proofs live in `src/transparency/`
- global verification lives in `src/verify/verifyAll.ts`

Without this plane, AMC would still be able to score or route, but it would lose the evidence-backed posture that makes the platform distinctive.

### Governance and Execution Plane

This plane converts policy into runtime control.

- approvals live in `src/approvals/`
- action governance lives in `src/governor/`
- leases live in `src/leases/`
- plugins and registry controls live in `src/plugins/`
- operator identity and authentication live in `src/auth/` and `src/identity/`
- execution coordination lives in `src/tickets/`, `src/workorders/`, and `src/budgets/`

This is where AMC stops being only a measurement system and becomes an enforcement system.

### Evaluation and Assurance Plane

This plane turns evidence into scores, findings, and maturity judgments.

- diagnostic execution and quickscore flows live in `src/diagnostic/`
- adversarial assurance and pack orchestration live in `src/assurance/`
- compliance mappings live in `src/compliance/`
- domain and industry overlays live in `src/domains/`
- benchmarks, org scoring, and fleet views live in `src/bench/`, `src/org/`, and `src/fleet/`

This is the broadest part of the repo because AMC's scoring, assurance, and reporting layers sit on top of the same evidence substrate.

### Deployment Plane

This is how the current system is packaged and operated outside a single local shell.

- Compose deployment lives in `deploy/compose/`
- Helm deployment lives in `deploy/helm/amc/`
- Kubernetes manifests live in `deploy/k8s/`
- release bundles, SBOMs, provenance, and verification live in `src/release/`

The important architectural point is that these are deployment forms of the same runtime, not independent product implementations.

### Ecosystem Plane

This plane lets external tools and operator environments attach to the TypeScript core.

- adapters live in `src/adapters/`
- MCP exposure lives in `src/mcp/`
- the Python SDK lives in `sdk/python/`
- the pytest plugin lives in `integrations/pytest-amc/`
- the VS Code extension lives in `vscode-extension/`
- the GitHub Action lives in `amc-action/`
- runnable samples live in `examples/`

Some of these are deep runtime extensions. Others are intentionally thin shells over the CLI and gateway. That distinction matters, and it is documented in [IMPLEMENTATION_REALITY_MAP.md](IMPLEMENTATION_REALITY_MAP.md).

## Real Operator Paths

AMC presents several operator entry paths, but they converge on the same core runtime.

### Browser Playground

The browser playground is the shortest way to understand AMC's scoring model and user experience. It is useful for exploration, not as the canonical execution-evidence path.

### Local CLI

This is the main serious operator path. The CLI bootstraps workspaces, runs diagnostics, drives governance actions, launches Studio, executes assurance, and coordinates most of the trust surface.

### CI

CI is not a separate architecture. It is the same CLI-driven system exercised non-interactively through workflow templates and the GitHub Action.

### Self-Hosted Studio

Studio is the long-lived API and console surface around the same workspace, ledger, and gateway foundations. In operational terms, it is the most complete persistent control-plane experience in the repo.

### Enterprise Deployment

Enterprise deployment packages the same system with stronger hosting, auth, trust-boundary, and operational assumptions. It does not replace the TypeScript core with a different foundation.

## Product Family Naming vs Runtime Reality

AMC's product-family names are useful capability labels, but they are not the primary architectural boundary.

| Product family | Runtime reality |
| --- | --- |
| Score | Diagnostic banks, runner flows, calibration, and scoring logic in `src/diagnostic/` |
| Shield | Assurance runners, pack catalogs, findings, and reports in `src/assurance/` |
| Enforce | Approvals, governor, leases, budgets, and policy-driven execution in `src/approvals/`, `src/governor/`, `src/leases/`, and related modules |
| Vault | Trust config, key handling, vault operations, signatures, and verification in `src/trust/`, `src/vault/`, `src/notary/`, and `src/verify/` |
| Watch | Gateway-mediated evidence capture, receipts, ledger append, transparency, and monitoring/reporting layers |
| Fleet | Multi-agent, org, and portfolio aggregation in `src/fleet/` and `src/org/` |
| Passport | Portable trust artifacts and proofs in `src/passport/` |
| Comply | Compliance mappings, reports, and framework overlays in `src/compliance/` |

Readers should treat those names as lenses over the same system, not as proof of separate runtime stacks.

## A Typical End-to-End Flow

1. An operator starts with `amc`, Studio, CI, or an adapter-driven agent workflow.
2. AMC resolves workspace state and signed configuration.
3. The gateway, adapters, or runtime commands route activity into AMC-controlled paths.
4. The ledger, receipts, transparency, and trust stack record what happened.
5. Diagnostics, assurance, benchmarks, compliance, and reports read that evidence.
6. Governance layers decide what can proceed, what needs approval, and what becomes an auditable artifact.
7. Studio, reports, passports, release artifacts, and ecosystem tools expose the result to humans and downstream systems.

That flow explains why the repo feels broad while still having a clear architectural center.

## What This Brief Intentionally Does Not Claim

- It does not claim that every branded capability is equally mature.
- It does not treat wrappers or extensions as separate cores.
- It does not treat legacy lineage as the same thing as the current operational foundation.
- It does not hard-code volatile top-level counts when the underlying catalogs are still changing.

Those distinctions are deliberate because honest architecture docs are more useful than maximalist ones.

## Where To Go Next

- Read [IMPLEMENTATION_REALITY_MAP.md](IMPLEMENTATION_REALITY_MAP.md) for core-versus-wrapper clarity.
- Read [DOCS_DRIFT_CLEANUP_PLAN.md](DOCS_DRIFT_CLEANUP_PLAN.md) for the public remediation policy behind future doc updates.
- Read [deep-dive/INDEX.md](deep-dive/INDEX.md) for subsystem-by-subsystem implementation detail.
- Use [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md) as the appendix when you want source-path orientation.
