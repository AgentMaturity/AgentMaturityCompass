# AMC Master CLI Reference

Complete reference for every `amc` command organized by category.

## Setup & Health

| Command | Description |
|---------|-------------|
| `amc init` | Initialize `.amc` workspace |
| `amc setup [--demo]` | Deterministic go-live setup (use `--demo` for sample data) |
| `amc bootstrap` | Bootstrap workspace for production deployment (non-interactive) |
| `amc doctor` | Check runtime availability and workspace health |
| `amc doctor-fix` | Auto-repair common setup issues |
| `amc quickstart` | One-command setup wizard (legacy) |
| `amc fix-signatures` | Verify and re-sign gateway/fleet/agent configs |

## Studio & Control Plane

| Command | Description |
|---------|-------------|
| `amc up` | Start Studio local control plane (gateway, proxy, dashboard, API) |
| `amc down` | Stop Studio |
| `amc status` | Show Studio and vault status |
| `amc logs` | Print latest Studio logs |
| `amc studio ping` | Ping Studio API `/health` endpoint |
| `amc studio start` | Start Studio in foreground (deployment-safe) |
| `amc studio healthcheck` | Health/readiness probe for deployment |
| `amc studio lan enable` | Enable LAN mode with pairing gate |
| `amc studio lan disable` | Disable LAN mode, revert to localhost |

## Configuration

| Command | Description |
|---------|-------------|
| `amc config print` | Print resolved runtime config (secret-safe) |
| `amc config explain` | Explain config source precedence and risky settings |

## Adapters

| Command | Description |
|---------|-------------|
| `amc adapters init` | Create signed `adapters.yaml` defaults |
| `amc adapters verify` | Verify `adapters.yaml` signature |
| `amc adapters list` | List built-in adapters and per-agent preferences |
| `amc adapters detect` | Detect installed adapter runtimes |
| `amc adapters configure` | Set adapter profile for an agent |
| `amc adapters env` | Print adapter-compatible environment exports |
| `amc adapters init-project` | Generate runnable local adapter sample |
| `amc adapters run` | Run adapter with minted lease, gateway routing, evidence capture |

## Agent Wrapping & Evidence Capture

| Command | Description |
|---------|-------------|
| `amc wrap <claude\|gemini\|openclaw\|any> -- <args>` | Wrap and capture evidence |
| `amc supervise --route <route> -- <cmd>` | Supervise with gateway routing |
| `amc sandbox run --agent <id> -- <cmd>` | Run in hardened Docker sandbox |
| `amc monitor --stdin --runtime <name>` | Record stdin stream as evidence |
| `amc connect` | Connect wizard for any agent/provider |
| `amc ingest` | Ingest external logs as SELF_REPORTED evidence |
| `amc attest` | Auditor-attest ingest to upgrade trust to ATTESTED |

## Scoring & Diagnostics

| Command | Description |
|---------|-------------|
| `amc run --agent <id> --window <days>` | Run maturity diagnostic |
| `amc report --run <runId>` | Render report for a run |
| `amc history` | List diagnostic run history |
| `amc compare --run-a <id> --run-b <id>` | Compare two runs |
| `amc verify` | Verify integrity across AMC artifacts |
| `amc verify all --json` | Full verification in one pass |
| `amc snapshot --agent <id>` | Generate Unified Clarity Snapshot |
| `amc indices --agent <id> --run <runId>` | Compute failure-risk indices |
| `amc indices fleet --window <days>` | Fleet-wide failure-risk indices |

## Target & Equalizer

| Command | Description |
|---------|-------------|
| `amc target set` | Interactive equalizer wizard |
| `amc target verify` | Verify target profile signature |
| `amc target diff` | Diff run against target profile |
| `amc whatif targets` | What-if simulation on targets |
| `amc whatif equalizer` | What-if simulation on equalizer settings |

## Gateway & Proxy

| Command | Description |
|---------|-------------|
| `amc gateway init --provider <name>` | Initialize gateway config |
| `amc gateway start --config <file>` | Start the gateway |
| `amc gateway status` | Gateway status |
| `amc gateway verify-config` | Verify gateway config |
| `amc gateway bind-agent --agent <id> --route <prefix>` | Bind agent to route |

## Leases

| Command | Description |
|---------|-------------|
| `amc lease issue --agent <id> --ttl <dur>` | Issue scoped lease |
| `amc lease verify <token>` | Verify a lease token |
| `amc lease revoke <leaseId>` | Revoke a lease |

## Fleet & Agents

| Command | Description |
|---------|-------------|
| `amc fleet init` | Create and sign `fleet.yaml` |
| `amc fleet report --window <days>` | Cross-agent fleet report |
| `amc fleet trust-init` | Initialize trust composition |
| `amc fleet trust-add-edge` | Add delegation edge |
| `amc fleet trust-remove-edge` | Remove delegation edge |
| `amc fleet trust-edges` | List delegation edges |
| `amc fleet trust-report` | Trust composition report |
| `amc fleet trust-receipts` | Verify cross-agent receipt chains |
| `amc fleet dag` | Visualize delegation graph |
| `amc fleet trust-mode` | Set trust inheritance policy |
| `amc fleet handoff` | Manage handoff packets |
| `amc fleet contradictions` | Detect cross-agent contradictions |
| `amc agent add` | Add agent to fleet |
| `amc agent list` | List fleet agents |
| `amc agent remove` | Remove agent |
| `amc agent use <id>` | Set current agent |
| `amc agent diagnose` | Lease-auth self-run diagnostic |

## Providers

| Command | Description |
|---------|-------------|
| `amc provider list` | List provider templates |
| `amc provider add` | Assign/update provider for an agent |

## Governor & Policy

| Command | Description |
|---------|-------------|
| `amc governor check --agent <id> --action <a>` | Check if action is allowed |
| `amc governor explain` | Explain enforcement classification |
| `amc governor report` | Generate governance report |
| `amc policy action init\|verify` | Signed autonomy action policy |
| `amc policy approval init\|verify` | Signed dual-control approval policy |
| `amc policy pack list\|describe\|diff\|apply` | Policy packs by archetype/risk |

## Approvals

| Command | Description |
|---------|-------------|
| `amc approvals list` | List pending approvals |
| `amc approvals show <id>` | Show approval details |
| `amc approvals approve <id>` | Approve execution intent |
| `amc approvals deny <id>` | Deny execution intent |

## Work Orders & Tickets

| Command | Description |
|---------|-------------|
| `amc workorder create\|list\|show\|verify\|expire` | Signed work order lifecycle |
| `amc ticket issue\|verify` | Execution ticket operations |

## Tools

| Command | Description |
|---------|-------------|
| `amc tools init\|verify\|list` | ToolHub tools config |

## Vault

| Command | Description |
|---------|-------------|
| `amc vault init` | Initialize encrypted key vault |
| `amc vault status` | Show vault status |
| `amc vault unlock\|lock` | Unlock/lock vault |
| `amc vault rotate-keys` | Rotate encryption keys |

## Notary & Trust

| Command | Description |
|---------|-------------|
| `amc notary init` | Initialize notary signing boundary |
| `amc notary start` | Start notary process |
| `amc notary attest --out <file>` | Generate attestation |
| `amc notary verify-attest <file>` | Verify attestation |
| `amc trust enable-notary` | Enable notary-backed trust |
| `amc trust status` | Show trust posture |

## Assurance Lab

| Command | Description |
|---------|-------------|
| `amc assurance init` | Initialize assurance policy |
| `amc assurance verify-policy` | Verify policy signature |
| `amc assurance policy print\|apply` | Print or apply policy |
| `amc assurance run --scope <s> --pack <p>` | Run assurance packs |
| `amc assurance runs` | List past runs |
| `amc assurance show <runId>` | Show run details |
| `amc assurance cert issue\|verify` | Assurance certificates |
| `amc assurance scheduler status\|run-now\|enable\|disable` | Scheduler controls |
| `amc assurance waiver request\|status\|revoke` | Temporary waivers |

## Budgets, Drift & Freeze

| Command | Description |
|---------|-------------|
| `amc budgets init\|verify\|status\|reset` | Usage budget management |
| `amc drift check\|report` | Drift/regression detection |
| `amc freeze status\|lift` | Execution freeze controls |
| `amc alerts init\|verify\|test` | Alert configuration |

## Mechanic Workbench

| Command | Description |
|---------|-------------|
| `amc mechanic init` | Initialize mechanic workspace |
| `amc mechanic targets init\|set\|apply\|print\|verify` | Manage equalizer targets |
| `amc mechanic profile list\|apply\|verify` | One-click target profiles |
| `amc mechanic tuning init\|set\|apply\|print\|verify` | Tuning intent management |
| `amc mechanic gap` | Show maturity gaps |
| `amc mechanic plan create\|show\|diff\|request-approval\|execute\|simulate\|simulations\|verify` | Upgrade plan lifecycle |

## Archetypes

| Command | Description |
|---------|-------------|
| `amc archetype list\|describe\|apply` | Built-in role packs |

## Education & Ownership

| Command | Description |
|---------|-------------|
| `amc learn --agent <id> --question <q>` | Education flow for a question |
| `amc own --agent <id>` | Ownership flow for top gaps |
| `amc commit --agent <id> --days <n>` | Commitment plan |
| `amc tune` | Mechanic tuning wizard |
| `amc upgrade` | Generate upgrade plan |
| `amc guard` | Guard check proposed output |

## Bundles & CI

| Command | Description |
|---------|-------------|
| `amc bundle export\|verify\|inspect\|diff` | Portable evidence bundles |
| `amc gate --bundle <file> --policy <file>` | Release gate check |
| `amc ci init\|print` | CI/CD release gate helpers |

## Certification

| Command | Description |
|---------|-------------|
| `amc certify` | Issue offline certificate |
| `amc cert verify\|inspect\|revoke\|verify-revocation` | Certificate operations |

## Export

| Command | Description |
|---------|-------------|
| `amc export policy` | Export policy pack |
| `amc export badge` | Export maturity badge SVG |

## Dashboard

| Command | Description |
|---------|-------------|
| `amc dashboard build\|serve` | Build/serve local dashboard |

## Continuous Loop

| Command | Description |
|---------|-------------|
| `amc loop init\|run\|plan\|schedule` | Continuous maturity loop |

## BOM

| Command | Description |
|---------|-------------|
| `amc bom generate\|sign\|verify` | Maturity Bill of Materials |

## Transparency

| Command | Description |
|---------|-------------|
| `amc transparency init\|verify\|tail\|export\|verify-bundle` | Transparency log |
| `amc transparency merkle rebuild\|root\|prove\|verify-proof` | Merkle proofs |

## Compliance

| Command | Description |
|---------|-------------|
| `amc compliance init\|verify\|report\|fleet\|diff` | Compliance mapping |

## Federation

| Command | Description |
|---------|-------------|
| `amc federate init\|verify\|peer add\|peer list\|export\|import\|verify-bundle` | Cross-org sync |

## Integrations Hub

| Command | Description |
|---------|-------------|
| `amc integrations init\|verify\|status\|test\|dispatch` | External integrations |

## Outcomes & Value

| Command | Description |
|---------|-------------|
| `amc outcomes init\|verify\|report\|diff\|attest` | Outcome contracts |
| `amc value init` | Initialize value realization |
| `amc value contract init` | Agent-specific value contract |
| `amc value ingest\|snapshot\|report` | Value evidence and reports |

## Audit

| Command | Description |
|---------|-------------|
| `amc audit init\|verify-policy` | Initialize audit binder |
| `amc audit policy print\|apply` | Audit policy management |
| `amc audit map list\|show\|apply\|verify` | Compliance map operations |
| `amc audit binder create\|verify\|list` | Binder artifact lifecycle |
| `amc audit binder export-request\|export-execute` | Controlled external sharing |
| `amc audit request create\|list\|approve\|reject\|fulfill` | Auditor evidence requests |
| `amc audit scheduler status\|run-now\|enable\|disable` | Binder cache scheduler |

## Passport & Standard

| Command | Description |
|---------|-------------|
| `amc passport init\|create\|verify` | Agent Passport credential |
| `amc standard generate\|verify\|validate` | Open Compass Standard |

## Forecasting & Advisory

| Command | Description |
|---------|-------------|
| `amc forecast init\|refresh\|verify` | Evidence-gated forecasting |
| `amc forecast scheduler status\|run-now\|enable\|disable` | Forecast scheduler |
| `amc forecast policy apply\|default` | Forecast policy |
| `amc advisory list\|show\|ack` | Forecast advisories |

## Casebooks & Experiments

| Command | Description |
|---------|-------------|
| `amc casebook init\|add\|list\|verify` | Signed casebook operations |
| `amc experiment create\|set-baseline\|set-candidate\|run\|analyze\|gate\|gate-template\|list` | Experiment lifecycle |

## Canon & Context Graph

| Command | Description |
|---------|-------------|
| `amc canon init\|verify` | Compass Canon signed content |
| `amc cgx init\|build` | Context Graph build/verify |
| `amc diagnostic render` | Contextualized 67-question view |
| `amc truthguard` | Deterministic output truth validator |

## Prompt Engine

| Command | Description |
|---------|-------------|
| `amc prompt init\|verify\|policy print\|policy apply\|status` | Northstar prompt policy |
| `amc prompt pack build\|verify\|show\|diff` | Signed prompt packs |
| `amc prompt scheduler status\|run-now\|enable\|disable` | Prompt scheduler |

## RBAC & Users

| Command | Description |
|---------|-------------|
| `amc user init\|add\|list\|revoke\|role set\|verify` | Multi-user accounts |
| `amc pair create` | Create LAN pairing code |

## Identity (Enterprise SSO)

| Command | Description |
|---------|-------------|
| `amc identity init` | Initialize identity config |
| `amc identity provider add oidc\|saml` | Add SSO provider |
| `amc identity mapping add` | Group-to-role mapping |
| `amc scim token create` | Create SCIM provisioning token |

## Host Mode (Multi-Workspace)

| Command | Description |
|---------|-------------|
| `amc host init` | Initialize host metadata DB |
| `amc host bootstrap` | Bootstrap admin + default workspace |
| `amc host user` | Host user management |
| `amc host workspace` | Host workspace lifecycle |
| `amc host migrate` | Migrate single-workspace to host mode |
| `amc host membership` | Host membership management |
| `amc host list` | List host users and workspaces |

## Release Engineering

| Command | Description |
|---------|-------------|
| `amc release init` | Initialize release signing keypair |
| `amc release pack` | Build signed `.amcrelease` bundle |
| `amc release verify` | Verify release bundle offline |
| `amc release sbom` | Generate CycloneDX SBOM |
| `amc release licenses` | Dependency license inventory |
| `amc release provenance` | AMC provenance record |
| `amc release scan` | Secret scan on release bundle |
| `amc release print` | Print release manifest |

## Operations

| Command | Description |
|---------|-------------|
| `amc ops init\|verify` | Signed ops policy controls |
| `amc retention run\|verify` | Retention/archive lifecycle |
| `amc backup create\|verify\|restore` | Encrypted backup/restore |
| `amc maintenance stats\|vacuum` | Operational maintenance |
| `amc metrics status` | Prometheus metrics endpoint |
| `amc mode owner\|agent` | Switch CLI role mode |

## Org Graph

| Command | Description |
|---------|-------------|
| `amc org init\|verify` | Initialize org graph |
| `amc org add node` | Add team/function node |
| `amc org assign\|unassign` | Assign agents to nodes |
| `amc org score\|report\|compare` | Comparative scorecards |
| `amc org learn\|own\|commit` | Org-level education/ownership |
| `amc org community init\|score` | Community governance scoring |

## Bench & Ecosystem

| Command | Description |
|---------|-------------|
| `amc bench init\|verify-policy\|print-policy\|create\|verify\|print` | Bench artifacts |
| `amc bench registry init\|publish\|verify\|serve\|search` | Registry management |
| `amc bench import\|list-imports\|list-exports\|compare\|comparison-latest` | Import/compare |
| `amc bench registries\|registries-apply` | Registry config |
| `amc bench publish request\|execute` | Dual-control publish flow |
| `amc benchmark export\|verify\|ingest\|list\|report\|stats` | Ecosystem benchmarks |

## Plugins

| Command | Description |
|---------|-------------|
| `amc plugin keygen\|pack\|verify\|print\|init\|workspace-verify\|list` | Plugin development |
| `amc plugin registry init\|publish\|verify\|serve` | Plugin registry |
| `amc plugin search\|registries\|registries-apply` | Discovery |
| `amc plugin install\|upgrade\|remove\|execute` | Lifecycle (dual-control) |

## Transform

| Command | Description |
|---------|-------------|
| `amc transform init\|verify` | Transformation OS |
| `amc transform map show\|apply` | Transform map |
| `amc transform plan\|status\|track\|report\|attest\|attest-verify` | 4C plan lifecycle |

## E2E Testing

| Command | Description |
|---------|-------------|
| `amc e2e smoke --mode <local\|docker\|helm-template>` | Go-live smoke tests |

## Advanced

| Command | Description |
|---------|-------------|
| `amc operator-dashboard` | Operator dashboard (capped questions, unlock actions) |
| `amc why-capped` | Show why questions are capped |
| `amc action-queue` | Prioritized risk-reduction actions |
| `amc confidence-heatmap` | Confidence heatmap by question |
| `amc role-presets` | Dashboard role presets |
| `amc wiring-status` | Production wiring status |
| `amc python-sdk` | Generate Python SDK package |
| `amc openapi-spec` | Generate OpenAPI spec for bridge API |
| `amc openapi-generate` | Full OpenAPI spec (Studio + Bridge + Gateway) |
| `amc integrate --framework <name>` | Integration scaffold |
| `amc integrate-list` | Available integration frameworks |
| `amc contract-tests` | Contract test suite for bridge API |
| `amc simulate-bridge` | Simulated bridge request |
| `amc code-scan` | Semantic code edge scanning |
| `amc claims-stale\|claims-sweep` | Stale claim management |
| `amc confidence-drift` | Confidence drift tracking |
| `amc lessons-list\|lessons-promote` | Correction lessons |
| `amc corrections-verify-closure` | Open feedback loops |
| `amc receipts-chain` | Full delegation chain for a receipt |
| `amc unknowns` | Known unknowns for latest diagnostic |
| `amc meta-confidence` | Confidence in the score itself |
| `amc confidence-check` | Action allowed given confidence |
| `amc confidence\|confidence-components` | Per-component confidence |
| `amc insider-risk-report\|insider-alerts\|insider-risk-scores` | Insider risk analytics |
| `amc lab-templates\|lab-create\|lab-simulate\|lab-report\|lab-compare\|lab-list` | Lab experiments |
| `amc attestation-export` | Export attestation bundle |
| `amc fp-submit\|fp-resolve\|fp-list\|fp-cost\|fp-tuning-report` | False positive management |
| `amc residency-policy\|tenant-register\|tenant-isolation-check\|residency-report` | Data residency |
| `amc legal-hold` | Legal hold management |
| `amc redaction-test` | Privacy redaction tests |
| `amc key-custody-modes` | Key custody mode config |
| `amc lineage-init\|lineage-report\|lineage-claim\|lineage-policy-intents` | Governance lineage |
| `amc claim-confidence\|claim-confidence-gate` | Claim confidence scoring |
| `amc overhead-report\|overhead-profile` | Overhead accounting |
| `amc micro-canary-run\|micro-canary-report\|micro-canary-alerts` | Micro-canary probes |
| `amc experiment-architecture\|experiment-architecture-probes` | Architecture experiments |
| `amc canary-start\|canary-status\|canary-stop\|canary-report` | Policy canary |
| `amc rollback-create` | Policy rollback pack |
| `amc emergency-override` | Emergency policy override |
| `amc policy-debt-add\|policy-debt-list` | Policy debt/waivers |
| `amc governance-drift` | Governance drift detection |
| `amc cgx-integrity\|cgx-propagation` | Graph integrity/propagation |
| `amc memory-extract\|memory-advisories\|memory-report\|memory-expire` | Correction memory |
| `amc passport capabilities-add\|search\|link` | Passport capabilities |
| `amc policy-canary-start\|policy-canary-report` | Policy canary (observation) |
| `amc debt-add\|debt-list` | Policy debt entries |
| `amc governor-override\|governor-override-alerts` | Emergency governance |
| `amc blobs` | Encrypted evidence blobs |
| `amc limits` | Plugin sandbox resource limits |
