# Operations And Ecosystem Plane

This part covers the surfaces that package AMC for real deployment, expose it to external tools and protocols, and turn the core runtime into a broader operating platform.

## What This Subsystem Family Is For

The operations and ecosystem plane answers two practical questions:

- how is AMC deployed, released, and operated as a persistent system
- how do outside tools, SDKs, editors, protocols, and business-facing layers attach to that system

Its job is to:

- package the current runtime for local, containerized, and Kubernetes-shaped deployment
- produce release artifacts with provenance and verification
- expose adapter, protocol, and integration surfaces
- support external operator environments like CI, editors, and Python workflows
- extend evidence-backed operation into value, outcomes, forecast, and passport artifacts

This plane is where AMC looks largest from the outside, which is exactly why clear implementation labeling matters here.

## Real Entrypoints And Data Or State Boundaries

### Primary Entrypoints

- `deploy/compose/`, `deploy/helm/amc/`, and `deploy/k8s/` are the current deployment forms of the TypeScript core.
- `src/release/` handles release bundles, manifests, SBOMs, provenance, verification, and related packaging concerns.
- `src/adapters/` is the main current integration path for attaching agent runtimes to AMC.
- `src/mcp/amcMcpServer.ts` exposes AMC through MCP.
- `sdk/python/` provides the current Python SDK shell.
- `integrations/pytest-amc/` provides Python testing and CI integration.
- `vscode-extension/` provides editor integration.
- `amc-action/` provides GitHub Actions integration.
- `examples/` provides runnable sample integrations across multiple frameworks.
- `src/value/`, `src/outcomes/`, `src/forecast/`, and `src/passport/` add business-facing and portable artifact layers on top of the core evidence model.

### State Boundaries

- Deployment manifests and secrets define how AMC's runtime is hosted and connected.
- Release bundles and provenance define what is being shipped and how it can be verified.
- Adapter configs, MCP endpoints, SDK settings, and editor workflows define external attachment points.
- Value, outcomes, forecast, and passport stores define longer-lived artifacts derived from the underlying evidence and governance system.

This plane is therefore a mix of packaging, protocol exposure, wrapper surfaces, and higher-order artifacts.

## Runtime Flow

The common operational flow across this plane looks like this:

1. An operator deploys or packages AMC using Compose, Helm, Kubernetes manifests, or release workflows.
2. External tools attach through adapters, MCP, SDKs, CI actions, editor integrations, or direct CLI use.
3. Those surfaces still route into the same core runtime for workspaces, gateway mediation, trust, and evaluation.
4. Persistent deployments expose Studio, auth, and governance features more fully than a single ad hoc local run.
5. Higher-order layers such as value analysis, outcomes tracking, forecasting, and passports consume the same underlying evidence or governance state.
6. Release, provenance, and verification surfaces make the platform itself auditable as a delivered artifact.

The central architectural idea is that the ecosystem expands outward from the core runtime. It does not replace it.

## What Looks Mature Versus Thin Or Wrapper-Like

### Mature Or Core

- Deployment manifests are real and repo-owned for multiple hosting shapes.
- Release provenance and verification are real implementation areas, not only process notes.
- Adapters are current integration machinery inside the TypeScript codebase.
- MCP exposure is a real protocol surface implemented in the current runtime.
- Value, outcomes, forecast, and passport modules are implemented subsystems that sit above the evidence foundation.

### Wrapper Or Integration-Led

- The Python SDK, pytest plugin, VS Code extension, and GitHub Action are important, but they mostly wrap or invoke the core runtime.
- Examples are onboarding assets and proof-of-use surfaces, not architectural authority.

### Legacy Or Parallel

- `platform/python/` is a preserved parallel implementation lineage. It is substantial, but it is not the present center of gravity for the product described by the rest of the repo.

### Partial Or Scope-Limited

- Some outer surfaces are intentionally narrower than the full AMC runtime. They solve adoption or workflow problems without mirroring every internal subsystem.

## How It Connects To Adjacent Planes

- It packages the **runtime and control plane** for durable operation.
- It exposes the **trust and evidence plane** through release provenance, passports, and verifiable external artifacts.
- It carries the **governance and execution plane** into hosted auth, plugin, and enterprise deployment settings.
- It surfaces the **evaluation and assurance plane** through CI, reports, SDK-triggered workflows, and operator-facing business outputs.

This plane is therefore downstream of the core runtime and upstream of many user environments.

## Notable Current Inconsistencies Or Caveats

### Ecosystem Breadth Can Obscure The Main Runtime

A reader who starts in SDKs, editor extensions, or examples can miss that the TypeScript CLI, Studio, gateway, and ledger are still the real center of the system.

### Wrapper Surfaces Need Honest Positioning

The Python SDK, pytest plugin, VS Code extension, and GitHub Action are useful precisely because they are thin bridges into the core runtime. Docs should say that clearly instead of implying parallel foundations.

### Commercial Or Operating Layers Should Be Read As Upper-Level Modules

Value, outcomes, forecasting, and passport are implemented, but they sit above the evidence, governance, and runtime core. They should not be mistaken for the first architectural layer to study.

### Preserved Python Lineage Needs Explicit Labeling

`platform/python/` is large enough to confuse evaluators if it is not labeled carefully. It belongs in the repo's implementation history and parallel lineage story, not in the default explanation of the current core.
