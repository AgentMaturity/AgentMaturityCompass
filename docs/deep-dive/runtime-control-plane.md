# Runtime And Control Plane

This part covers the surfaces that start AMC, route work into AMC, and keep operator-facing state coherent across local and hosted execution.

## What This Subsystem Family Is For

The runtime and control plane is where AMC becomes a usable system instead of a library of ideas.

Its job is to:

- give operators a clear entrypoint
- establish workspace state and service lifecycle
- route model or agent traffic through AMC-controlled paths
- expose persistent API and console surfaces
- connect local runs, remote runs, and hosted workspaces back to the same runtime

In the current repo, this plane is the most important place to start after the high-level architecture brief because it reveals the real operational center of gravity.

## Real Entrypoints And Data Or State Boundaries

### Primary Entrypoints

- `src/cli.ts` is the main command entrypoint and the broadest operator surface in the repo.
- `src/workspace.ts` bootstraps and validates the `.amc` workspace state used by the rest of the system.
- `src/studio/studioServer.ts` exposes the long-lived Studio HTTP surface.
- `src/studio/studioSupervisor.ts` manages Studio lifecycle for commands like `amc up`, `amc down`, and status-oriented flows.
- `src/gateway/server.ts` is the real provider-routing and mediation server.
- `src/adapters/adapterRunner.ts` and the built-in adapter catalog in `src/adapters/builtins/` connect external agent runtimes to the gateway path.
- `src/workspaces/workspaceRouter.ts`, `src/workspaces/hostDb.ts`, and related `src/workspaces/` modules implement the hosted multi-workspace path.
- `src/pairing/` provides short-lived remote pairing and connection flows where the agent and the owner environment are not the same machine.

### State Boundaries

- Local workspace state lives under `.amc` and is initialized or maintained through `src/workspace.ts`.
- Hosted workspace metadata and routing state live behind the host database and host auth layers in `src/workspaces/`.
- Studio exposes HTTP and SSE boundaries for operator interactions and live updates.
- Gateway route configuration, redaction behavior, and lease-aware request handling define the boundary between agent traffic and upstream providers.

The important point is that these boundaries are operational, not theoretical. AMC is not only a scoring function. It has a real control path that starts in the CLI and can stay alive in Studio or hosted mode.

## Runtime Flow

The most common runtime flow today looks like this:

1. An operator enters through `amc`, Studio, CI, or an adapter-backed command.
2. AMC resolves the current workspace and signed local configuration.
3. If needed, the Studio supervisor starts or reconnects long-lived services.
4. The gateway receives provider-bound traffic directly or through an adapter-generated environment.
5. Workspace or host routing decides which workspace context owns the request.
6. The runtime emits events into the trust and evidence plane for storage, signing, and later verification.
7. Studio and related surfaces expose state back to the operator through HTTP, SSE, reports, or follow-on commands.

That flow matters because it shows that AMC's "product" surfaces are mostly different operator entry paths into one underlying runtime.

## What Looks Mature Versus Thin Or Wrapper-Like

### Mature Or Core

- The CLI is clearly the main operator entrypoint. Its breadth is large, and many other surfaces resolve back to it.
- Workspace initialization and workspace routing are real architectural primitives, not side details.
- Studio is a real API and console surface, not only a marketing label.
- The gateway is a concrete mediation layer that handles routing, redaction, and runtime integration with providers and agents.
- Adapters are part of the current TypeScript runtime, not external afterthoughts.

### Thin Or Partial

- The browser playground is useful for understanding AMC, but it is not the same runtime path as the CLI, gateway, and Studio stack.
- Some onboarding flows and helper commands are intentionally thin shells designed to get traffic or users into the main runtime.

### Wrapper-Like

- IDE, CI, and SDK-facing shells usually wrap or invoke the same control-plane behaviors rather than introducing a second control plane.
- Example projects are important for adoption, but they do not define the runtime itself.

## How It Connects To Adjacent Planes

- It feeds the **trust and evidence plane** by generating the events, receipts, and signed state transitions that need to be persisted.
- It depends on the **governance and execution plane** for approvals, leases, policies, auth, and bounded execution.
- It supplies the **evaluation and assurance plane** with the traces, scores, sessions, and operator context that later analysis depends on.
- It is packaged by the **operations and ecosystem plane** for deployment, release, and external integrations.

This is why the control plane is a useful lens: it is where multiple other planes meet in practice.

## Notable Current Inconsistencies Or Caveats

### Command Breadth Can Hide The Main Story

`src/cli.ts` is broad enough that a new reader can mistake the command surface for a set of loosely related products. The architecture is clearer if you read the CLI as one control shell over several connected planes.

### Product Naming Can Be Louder Than Runtime Naming

AMC's branded families are useful, but they can obscure the simpler truth that most user journeys still pass through the same CLI, workspace, Studio, and gateway foundations.

### Hosted And Local Paths Share More Than Public Docs Sometimes Suggest

The repo's hosted workspace machinery is substantial. A reader who only skims quickstart material may miss how important workspace routing and host-mode concerns are for the persistent product shape.

### The Serious Path Is Not The Same As The Fastest Demo Path

The shortest demo path is the browser playground. The serious implementation path is the CLI and service runtime. Documentation needs to keep that distinction explicit so evaluators do not underread the actual system.
