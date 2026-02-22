# SYSTEM CAPABILITIES MATRIX

This is the go-live contract for AMC integration state.

## CLI Capability Matrix

| Capability Area | Primary Commands | Expected Output |
|---|---|---|
| Guided setup + lifecycle | `amc setup`, `amc up`, `amc down`, `amc status` | Signed bootstrap, running control plane, readiness report |
| Bootstrap + config trust | `amc bootstrap`, `amc config print`, `amc config explain` | Deterministic config with source attribution and risk warnings |
| Studio + runtime checks | `amc doctor --json`, `amc verify all --json` | Pass/fail matrix for runtime, signatures, integrity, readiness |
| Gateway + lease controls | `amc gateway *`, `amc lease issue|verify|revoke` | Zero-key, lease-scoped routing with receipts |
| ToolHub governance | `amc tools *`, `amc workorder *`, `amc ticket *`, `amc approvals *` | Intent/execute boundaries, dual-control, signed approvals |
| Adapters (SimpleClaw-style) | `amc adapters detect|configure|run|env|init-project` | One-liner agent execution with lease-as-api-key compatibility |
| Org Compass + commitments | `amc org *` | Signed comparative scorecards and node-level E/O/C artifacts |
| Transformation OS | `amc transform *`, `amc advisory *` | Evidence-checkpointed plans, tracker updates, attestations |
| Forecasting | `amc forecast *` | Signed deterministic forecast artifacts + advisories |
| Benchmarks + ecosystem compare | `amc bench *` | Signed `.amcbench` artifacts, registry import/publish, percentile compare |
| Plugin marketplace | `amc plugin *` | Signed content-only plugin lifecycle with dual-control install |
| Ops hardening | `amc ops *`, `amc retention *`, `amc backup *`, `amc maintenance *`, `amc metrics status` | Retention, encrypted storage, backup/restore, maintenance, metrics |
| Release engineering | `amc release *` | Deterministic `.amcrelease` bundles + offline verification |
| Trust boundary / Notary | `amc trust *`, `amc notary *` | Fail-closed signing boundary and runtime attestations |
| Multi-workspace host mode | `amc host *`, `amc workspace *` | Tenant isolation, host portfolio, workspace-scoped ops |
| Enterprise identity | `amc identity *`, `amc scim *` | Signed IdP config, OIDC/SAML login, SCIM provisioning |
| End-to-end smoke | `amc e2e smoke --mode local|docker|helm-template --json` | Full-system go-live validation summary |

## Console Capability Matrix

| Page | URL | Scope | What it shows |
|---|---|---|---|
| Host Portfolio | `/host/console` | Host | Workspace list, readiness, access links |
| Main Console | `/w/:id/console` or `/console` | Workspace | RBAC app shell and live status |
| Org | `/w/:id/console/org.html` | Workspace | Org tree, trust labels, scorecards |
| Compare | `/w/:id/console/compare.html` | Workspace | Node-vs-node deltas and gap/win lists |
| Systemic | `/w/:id/console/systemic.html` | Workspace | 5 strategy-failure risks + contributors |
| Transform | `/w/:id/console/transform.html` | Workspace | 4C progress + kanban tasks |
| Mechanic Mode | `/w/:id/console/mechanic.html` | Workspace | 67-question equalizer + what-if + target apply |
| Forecast | `/w/:id/console/forecast*.html` | Workspace | Trend bands, drift/anomaly warnings, ETA |
| Advisories | `/w/:id/console/advisories.html` | Workspace | Evidence-bound warnings and acknowledgements |
| Benchmarks | `/w/:id/console/bench*.html` | Workspace + Host | Exports/imports, registry browse, percentiles, portfolio compare |
| Plugins | `/w/:id/console/plugins.html` | Workspace | Registries, install/upgrade/remove, approval progress |
| Trust | `/w/:id/console/trust.html` | Workspace | Trust mode, notary health, attestation details |

## Security Boundary Matrix

| Boundary | Enforced By | Result |
|---|---|---|
| OWNER/OPERATOR/AUDITOR/VIEWER vs AGENT | RBAC + lease-only paths | Agents cannot perform owner/admin/ops actions |
| Host vs Workspace | URL routing + membership + workspace contexts | Strict multi-tenant isolation |
| Lease workspace binding | Lease claim `workspaceId` | Agent traffic cannot cross workspace boundaries |
| Vault vs Notary signing | `trust.yaml` enforcement | Fail-closed signing in NOTARY mode |
| Registry trust | Pinned fingerprints + signature verification | Plugin/bench imports blocked on trust mismatch |
| Config tamper detection | Signed YAML + readiness checks | Untrusted configs force warnings and 503 readiness |
| Evidence integrity | Hash-chain ledger + transparency + merkle | Tamper-evident event history |

## Signing Matrix (Who Signs What)

| Artifact/Record | Signer Type |
|---|---|
| Configs (`action-policy`, `tools`, `budgets`, `approval-policy`, `ops-policy`, `org`, `transform-map`, `bench policy`, `identity`, `registries`) | VAULT or NOTARY (per trust enforcement) |
| Transparency roots + Merkle roots | VAULT or NOTARY (required kinds fail-closed in NOTARY mode) |
| Plugin installed lock + plugin actions | VAULT or NOTARY (if required by trust policy) |
| Transform plans + transform attestations | VAULT or NOTARY |
| Org scorecards + commitments | VAULT or NOTARY |
| Release manifest (`.amcrelease`) | Release keypair (separate from workspace vault keys) or NOTARY when required by trust enforcement |
| Backup manifest (`.amcbackup`) | VAULT or NOTARY |
| Benchmark artifact signatures (`.amcbench`) | VAULT or NOTARY |

## Go-Live Validation Commands

```bash
npm ci
npm test
npm run build
amc setup --demo
amc up
amc e2e smoke --mode local --json
amc verify all --json
```
