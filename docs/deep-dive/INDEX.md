# AMC Deep-Dive Series

This series walks subsystem-by-subsystem through AMC's current implementation.

Use it after [../ARCHITECTURE_BRIEF.md](../ARCHITECTURE_BRIEF.md) when you want the next layer of detail, or after [../IMPLEMENTATION_REALITY_MAP.md](../IMPLEMENTATION_REALITY_MAP.md) when you want to understand the runtime boundaries behind each bucket.

## Reading Order

1. [runtime-control-plane.md](runtime-control-plane.md)  
   How commands, services, workspaces, gateway routing, and operator entrypoints fit together.

2. [trust-evidence-plane.md](trust-evidence-plane.md)  
   How AMC records, signs, verifies, and proves what happened.

3. [governance-execution-plane.md](governance-execution-plane.md)  
   How approvals, policies, leases, plugins, and identity become runtime controls.

4. [evaluation-assurance-plane.md](evaluation-assurance-plane.md)  
   How diagnostic scoring, assurance packs, compliance mappings, and aggregation layers work.

5. [operations-ecosystem-plane.md](operations-ecosystem-plane.md)  
   How deployment, releases, adapters, MCP, SDKs, and outer operational surfaces connect back to the core runtime.

## What Stays Consistent Across The Series

Each part answers the same six questions:

- what this subsystem family is for
- what the real entrypoints and state boundaries are
- how the runtime flow works
- what looks mature versus thin or wrapper-like
- how it connects to adjacent planes
- what caveats or inconsistencies matter today

The goal is not to claim perfection. It is to make the current implementation legible.
