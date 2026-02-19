# Architecture Map (Code-Backed)

This map reflects current source structure and runtime boundaries in the repository.

## 1) Runtime Topology

```text
[CLI: amc]
   |
   | starts/supervises
   v
[Studio API + Console server] ----> [/healthz, /readyz, /console]
   |
   | emits evidence + signatures
   v
[Workspace state (.amc) + Ledger + Transparency/Merkle]
   |
   +--> [Bridge/Gateway provider routes + lease auth]
   +--> [Notary (optional external signing boundary)]
   +--> [Ops subsystems: retention, backup, maintenance, metrics]
   +--> [Feature engines: assurance/audit/compliance/value/forecast/etc]
```

## 2) Entry Points and Control Plane

- CLI entry: `src/cli.ts`
- Package/SDK entry: `src/index.ts`
- Studio supervisor lifecycle (`amc up/down/status`): `src/studio/studioSupervisor.ts`
- Studio HTTP server and endpoints: `src/studio/studioServer.ts`
- Console pages/assets: `src/console/`

## 3) Trust, Identity, and Auth Boundaries

- Vault/key operations: `src/vault/`, `src/crypto/`
- Notary server and attestations: `src/notary/`
- Trust mode config/enforcement: `src/trust/trustConfig.ts`
- Lease issuance/verification: `src/leases/`
- RBAC/user/session: `src/auth/`, `src/identity/`, `src/workspaces/hostAuth.ts`

## 4) Evidence and Verifiability Plane

- Append-only ledger + monitor wrapping: `src/ledger/`
- Receipts and receipt chain: `src/receipts/`
- Transparency log + Merkle proof system: `src/transparency/`
- Global verify gate (`amc verify all`): `src/verify/verifyAll.ts`

## 5) Agent Traffic and Integration Plane

- Universal gateway/proxy: `src/gateway/`
- Bridge auth/router/policy/telemetry: `src/bridge/`
- Adapters (one-liner runtime wrappers): `src/adapters/`
- Runtime wrappers + SDK middleware: `src/runtime/`, `src/sdk/`, `src/runtimes/`
- Pairing/connect flows: `src/pairing/`, `src/studio/connectWizard.ts`

## 6) Governance and Policy Plane

- Governor + action policy: `src/governor/`
- Approval policies and chains: `src/approvals/`
- Policy packs: `src/policyPacks/`
- Work orders + execution tickets: `src/workorders/`, `src/tickets/`
- Truth constraints: `src/truthguard/`

## 7) Assurance / Audit / Compliance Plane

- Assurance lab and certs: `src/assurance/`
- Audit binder + evidence requests: `src/audit/`
- Compliance mappings/reports: `src/compliance/`
- Benchmarks + registries: `src/bench/`, `src/benchmarks/`
- Org/portfolio views: `src/org/`, `src/federation/`

## 8) Operations and Reliability Plane

- Ops policy and controls: `src/ops/policy.ts`
- Retention lifecycle: `src/ops/retention/`
- Backup lifecycle: `src/ops/backup/`
- Maintenance tasks: `src/ops/maintenance/`
- Metrics endpoint/registry: `src/ops/metrics/`
- E2E smoke gates: `src/e2e/`

## 9) Data and State Layout

- Workspace resolver/paths and host/workspace routing: `src/workspaces/`
- Config loading/env schema: `src/config/`
- Blob key + encrypted blob storage: `src/storage/blobs/`
- Snapshot/export/bundle/release artifacts: `src/snapshot/`, `src/bundles/`, `src/release/`

## 10) Deployment Surface

- Container image: `Dockerfile`
- Compose stacks: `deploy/compose/`
- Helm chart: `deploy/helm/amc/`

---

If this map and runtime behavior diverge, treat the code paths above as source of truth and update this file during release prep.
