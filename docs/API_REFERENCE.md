# AMC API Reference

> Auto-generated from source on 2026-08-28

## Table of Contents

- [CLI Commands](#cli-commands)
- [Configuration Options](#configuration-options)
- [Assurance Packs](#assurance-packs)
- [Assertion Schema](#assertion-schema)

---

## CLI Commands

AMC provides 1,175 public CLI command paths in the live command inventory.

| # | Command | Description |
|---|---------|-------------|
| 1 | `amc action-queue` | Show prioritized actions sorted by risk-reduction-per-effort |
| 2 | `amc adapters` | Built-in adapter system for one-line agent integration |
| 3 | `amc adapters capabilities` | Issue a signed Passport receipt for declared and effective adapter capabilities |
| 4 | `amc adapters configure` | Set adapter profile for an agent (signed adapters.yaml) |
| 5 | `amc adapters detect` | Detect installed adapter runtimes and versions |
| 6 | `amc adapters env` | Print adapter-compatible environment exports without lease token |
| 7 | `amc adapters init` | Create signed adapters.yaml defaults |
| 8 | `amc adapters init-project` | Generate runnable local adapter sample for library-based frameworks |
| 9 | `amc adapters list` | List built-in adapters and per-agent preferences |
| 10 | `amc adapters run` | Run an agent under full observation: mints a lease, routes through the gateway, captures OBSERVED evidence (preferred over 'amc wrap' and 'amc supervise') |
| 11 | `amc adapters verify` | Verify adapters.yaml signature |
| 12 | `amc admin` | Administrative controls, identity, and trust operations |
| 13 | `amc admin help` | Show admin-focused command groups |
| 14 | `amc admin status` | Show operational admin status for control-plane services |
| 15 | `amc advisory` | Forecast advisories (list/show/ack) |
| 16 | `amc advisory ack` | Acknowledge an advisory |
| 17 | `amc advisory list` | List advisories for scope |
| 18 | `amc advisory show` | Show one advisory by ID |
| 19 | `amc agent` | Agent registry operations |
| 20 | `amc agent add` | Interactively add an agent to the fleet |
| 21 | `amc agent diagnose` | Lease-auth self-run diagnostic (agent-triggered, evidence-scored server-side) |
| 22 | `amc agent harness` | Run the autonomous improvement harness loop |
| 23 | `amc agent list` | List fleet agents |
| 24 | `amc agent remove` | Remove an agent from the fleet |
| 25 | `amc agent run` | Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract) |
| 26 | `amc agent use` | Set current agent |
| 27 | `amc alert` | SIEM/webhook alerting — configure and send alerts from anomalies |
| 28 | `amc alert config` | Configure alert destinations (webhooks, Slack, PagerDuty) |
| 29 | `amc alert send` | Send an alert to a webhook endpoint |
| 30 | `amc alert test` | Send a test alert to all configured destinations |
| 31 | `amc alert watch` | Watch for anomalies and auto-send alerts to configured destinations |
| 32 | `amc alerts` | Signed drift alert configuration and dispatch |
| 33 | `amc alerts init` | - |
| 34 | `amc alerts test` | - |
| 35 | `amc alerts verify` | - |
| 36 | `amc api` | REST API management |
| 37 | `amc api docs` | Show API reference documentation summary and link |
| 38 | `amc api key` | Manage programmatic API keys |
| 39 | `amc api key create` | Create a programmatic API key and show the secret once |
| 40 | `amc api key list` | List programmatic API keys without printing secrets |
| 41 | `amc api key revoke` | Revoke a programmatic API key |
| 42 | `amc api routes` | List all available REST API route families |
| 43 | `amc api start` | Start the AMC API server (alias for 'amc up') |
| 44 | `amc api status` | Show API integration status |
| 45 | `amc approvals` | Signed approval inbox operations |
| 46 | `amc approvals approve` | - |
| 47 | `amc approvals deny` | - |
| 48 | `amc approvals list` | - |
| 49 | `amc approvals show` | - |
| 50 | `amc archetype` | Archetype packs |
| 51 | `amc archetype apply` | Apply archetype context/targets/guardrails/evals to an agent |
| 52 | `amc archetype describe` | Describe an archetype |
| 53 | `amc archetype list` | List built-in archetype packs |
| 54 | `amc assurance` | Assurance Lab red-team packs |
| 55 | `amc assurance advanced-threats` | Run advanced threats assurance pack |
| 56 | `amc assurance cert-issue` | Issue signed assurance certificate for a run |
| 57 | `amc assurance cert-verify` | Verify assurance certificate bundle offline |
| 58 | `amc assurance compound-threats` | Run compound threat assurance pack |
| 59 | `amc assurance describe` | Describe assurance pack details |
| 60 | `amc assurance history` | List assurance run history |
| 61 | `amc assurance init` | Initialize signed assurance policy |
| 62 | `amc assurance list` | List available assurance packs |
| 63 | `amc assurance patch` | Apply deterministic patch kit for failed assurance findings |
| 64 | `amc assurance policy` | Print current assurance policy |
| 65 | `amc assurance policy-apply` | Apply assurance policy from YAML/JSON file |
| 66 | `amc assurance run` | Run assurance pack(s) with deterministic validation |
| 67 | `amc assurance runs` | List assurance lab runs |
| 68 | `amc assurance scheduler` | Assurance scheduler controls |
| 69 | `amc assurance scheduler disable` | Disable assurance scheduler |
| 70 | `amc assurance scheduler enable` | Enable assurance scheduler |
| 71 | `amc assurance scheduler run-now` | Run assurance scheduler immediately |
| 72 | `amc assurance scheduler status` | Show scheduler status |
| 73 | `amc assurance show` | Show assurance run artifacts |
| 74 | `amc assurance shutdown-compliance` | Run shutdown compliance pack |
| 75 | `amc assurance toctou` | Run TOCTOU assurance pack |
| 76 | `amc assurance verify` | Verify assurance run determinism and signatures |
| 77 | `amc assurance verify-policy` | Verify assurance policy signature |
| 78 | `amc assurance waiver` | Assurance threshold waiver controls |
| 79 | `amc assurance waiver request` | Request time-limited readiness waiver (dual-control approval required) |
| 80 | `amc assurance waiver revoke` | Revoke active or specific waiver |
| 81 | `amc assurance waiver status` | Show waiver status (activates approved pending waivers) |
| 82 | `amc attest` | Auditor-attest an ingest session to upgrade trust tier to ATTESTED |
| 83 | `amc attestation-export` | Export attestation bundle for external auditors |
| 84 | `amc audit` | Audit binder and compliance maps |
| 85 | `amc audit binder` | Audit binder artifact operations |
| 86 | `amc audit binder create` | Create deterministic signed .amcaudit artifact |
| 87 | `amc audit binder export-execute` | Execute previously approved external binder export |
| 88 | `amc audit binder export-request` | Create dual-control approval request for external binder sharing |
| 89 | `amc audit binder list` | List exported binders and cached workspace binder |
| 90 | `amc audit binder verify` | Verify .amcaudit file |
| 91 | `amc audit export` | Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor |
| 92 | `amc audit init` | Initialize signed audit policy and compliance maps |
| 93 | `amc audit map` | Audit compliance map operations |
| 94 | `amc audit map apply` | Apply active audit map from file |
| 95 | `amc audit map list` | List builtin/active audit maps |
| 96 | `amc audit map show` | Show audit map |
| 97 | `amc audit map verify` | Verify builtin and active map signatures |
| 98 | `amc audit policy` | Audit binder policy operations |
| 99 | `amc audit policy apply` | Apply and sign audit policy from file |
| 100 | `amc audit policy print` | Print effective audit policy |
| 101 | `amc audit request` | Audit evidence request operations |
| 102 | `amc audit request approve` | Owner approves request (starts dual-control approval flow) |
| 103 | `amc audit request create` | Create auditor evidence request |
| 104 | `amc audit request fulfill` | Fulfill approved evidence request by exporting restricted binder |
| 105 | `amc audit request list` | List audit evidence requests |
| 106 | `amc audit request reject` | Reject evidence request |
| 107 | `amc audit scheduler` | Audit binder cache scheduler |
| 108 | `amc audit scheduler disable` | Disable audit scheduler |
| 109 | `amc audit scheduler enable` | Enable audit scheduler |
| 110 | `amc audit scheduler run-now` | Run audit binder cache refresh immediately |
| 111 | `amc audit scheduler status` | Show audit scheduler status |
| 112 | `amc audit verify` | Verify audit workspace signatures/artifacts |
| 113 | `amc audit verify-policy` | Verify signed audit policy |
| 114 | `amc audit-packet` | Generate external-auditor packet with verifier-ready evidence |
| 115 | `amc backup` | Signed encrypted backup/restore operations |
| 116 | `amc backup create` | Create signed encrypted backup bundle |
| 117 | `amc backup print` | Print backup manifest summary |
| 118 | `amc backup restore` | Restore a verified backup into target directory |
| 119 | `amc backup verify` | Verify signed backup bundle offline |
| 120 | `amc badge` | Generate maturity badge for README/docs (markdown, HTML, or URL) |
| 121 | `amc bench` | Public benchmark registry + ecosystem comparative view |
| 122 | `amc bench compare` | Compute local vs imported ecosystem comparison |
| 123 | `amc bench comparison-latest` | Read latest bench comparison artifact |
| 124 | `amc bench create` | Create deterministic signed .amcbench artifact |
| 125 | `amc bench import` | Import one bench artifact from allowlisted registry |
| 126 | `amc bench init` | Initialize signed bench policy |
| 127 | `amc bench list-exports` | List locally exported bench artifacts |
| 128 | `amc bench list-imports` | List imported bench artifacts |
| 129 | `amc bench print` | Print bench manifest summary without modification |
| 130 | `amc bench print-policy` | Print effective bench policy |
| 131 | `amc bench publish` | Dual-control bench publish flow |
| 132 | `amc bench publish execute` | - |
| 133 | `amc bench publish request` | - |
| 134 | `amc bench registries` | Print signed bench registry allowlist |
| 135 | `amc bench registries-apply` | Apply bench registries config from JSON file |
| 136 | `amc bench registry` | Manage static bench registries |
| 137 | `amc bench registry init` | - |
| 138 | `amc bench registry publish` | - |
| 139 | `amc bench registry serve` | - |
| 140 | `amc bench registry verify` | - |
| 141 | `amc bench search` | Browse a bench registry index |
| 142 | `amc bench verify` | Verify .amcbench artifact offline |
| 143 | `amc bench verify-policy` | Verify signed bench policy |
| 144 | `amc benchmark` | Signed ecosystem benchmark snapshots |
| 145 | `amc benchmark compare` | Compare benchmark results between two agents head-to-head |
| 146 | `amc benchmark export` | - |
| 147 | `amc benchmark ingest` | - |
| 148 | `amc benchmark list` | - |
| 149 | `amc benchmark provider-drift` | Run provider/model canary drift benchmark with score, refusal, latency, and cost thresholds |
| 150 | `amc benchmark replay-corpus` | Run a replayable benchmark corpus with optional multi-turn tool-risk ASR checks |
| 151 | `amc benchmark report` | - |
| 152 | `amc benchmark run` | Run standard benchmark suite (latency, accuracy, safety, cost-efficiency, reliability) against an agent |
| 153 | `amc benchmark stats` | - |
| 154 | `amc benchmark verify` | - |
| 155 | `amc blobs` | Encrypted evidence blob operations |
| 156 | `amc blobs key` | Blob key management |
| 157 | `amc blobs key init` | Initialize encrypted blob key material |
| 158 | `amc blobs key rotate` | Rotate encrypted blob key material |
| 159 | `amc blobs reencrypt` | Re-encrypt blob batch from one key version to another |
| 160 | `amc blobs verify` | Verify encrypted blob index and payload integrity |
| 161 | `amc bom` | Maturity Bill of Materials |
| 162 | `amc bom generate` | - |
| 163 | `amc bom sign` | - |
| 164 | `amc bom verify` | - |
| 165 | `amc bootstrap` | Bootstrap workspace for production deployment (non-interactive) |
| 166 | `amc budgets` | Signed autonomy and usage budgets |
| 167 | `amc budgets init` | - |
| 168 | `amc budgets reset` | - |
| 169 | `amc budgets status` | - |
| 170 | `amc budgets verify` | - |
| 171 | `amc bundle` | Portable evidence bundle operations |
| 172 | `amc bundle diff` | Diff two bundles (maturity/integrity/targets) |
| 173 | `amc bundle export` | Export a portable, signed evidence bundle for a run |
| 174 | `amc bundle inspect` | Inspect bundle metadata |
| 175 | `amc bundle verify` | Verify evidence bundle offline |
| 176 | `amc business` | Business impact — KPI correlation, ROI tracking, and maturity-to-outcome mapping |
| 177 | `amc business fair-scenario` | Run a FAIR-style calibrated loss-distribution scenario |
| 178 | `amc business grc-export` | Export a GRC treatment-plan register from portfolio maturity risk inputs |
| 179 | `amc business heatmap` | Build a portfolio financial risk heatmap from maturity, likelihood, impact, and appetite |
| 180 | `amc business kpi` | Show business KPIs correlated with maturity levels |
| 181 | `amc business report` | Generate business impact report with maturity correlation |
| 182 | `amc business risk` | Quantify maturity-linked incident frequency and expected annual loss |
| 183 | `amc business roi` | Estimate first-year ROI and cost of a trust gap from maturity improvement |
| 184 | `amc business track` | Record a business outcome event (incident, audit finding, cost) |
| 185 | `amc canary-report` | Generate full policy canary report |
| 186 | `amc canary-start` | Start a policy canary with candidate vs stable policy |
| 187 | `amc canary-status` | Show current canary status and stats |
| 188 | `amc canary-stop` | Stop the active canary |
| 189 | `amc canon` | Compass Canon signed content operations |
| 190 | `amc canon init` | Create and sign .amc/canon/canon.yaml |
| 191 | `amc canon print` | Print effective Compass Canon |
| 192 | `amc canon verify` | Verify canonical compass content signature |
| 193 | `amc casebook` | Signed casebook operations |
| 194 | `amc casebook add` | Add signed case from existing workorder |
| 195 | `amc casebook init` | Create a signed casebook |
| 196 | `amc casebook list` | List casebooks |
| 197 | `amc casebook verify` | Verify signed casebook and case files |
| 198 | `amc cert` | Certificate operations |
| 199 | `amc cert generate` | Generate execution-proof trust certificate (signed PDF or JSON) |
| 200 | `amc cert inspect` | Inspect any AMC certificate (.amccert bundle or trust-certificate JSON) |
| 201 | `amc cert revoke` | Create signed revocation file for a certificate |
| 202 | `amc cert verify` | Verify any AMC certificate offline (.amccert bundle or trust-certificate JSON) |
| 203 | `amc cert verify-revocation` | Verify revocation file signature |
| 204 | `amc certify` | Issue signed, offline-verifiable certificate bundle |
| 205 | `amc cgx` | Context Graph (CGX) build and verify operations |
| 206 | `amc cgx build` | Build deterministic signed context graph |
| 207 | `amc cgx code-scan` | Scan repository for semantic code edges |
| 208 | `amc cgx diff` | Diff two CGX graph snapshots |
| 209 | `amc cgx init` | Create and sign .amc/cgx/policy.yaml |
| 210 | `amc cgx show` | Show latest CGX graph or agent context pack |
| 211 | `amc cgx simulate` | Simulate impact propagation when a node changes |
| 212 | `amc cgx verify` | Verify CGX policy/graph/pack signatures |
| 213 | `amc cgx-integrity` | Run graph integrity check on CGX with semantic overlay |
| 214 | `amc cgx-propagation` | Simulate risk propagation from a source node |
| 215 | `amc ci` | CI/CD release gate helpers |
| 216 | `amc ci check` | One-liner CI gate: quickscore + threshold check (exit 1 if below) |
| 217 | `amc ci init` | Generate GitHub workflow and gate policy |
| 218 | `amc ci print` | Print suggested CI pipeline steps |
| 219 | `amc ci redteam` | CI gate: run red-team plugins, optional Evil MCP, and score-gaming resistance checks |
| 220 | `amc claim-confidence` | Generate per-claim confidence report with citation-backed scoring |
| 221 | `amc claim-confidence-gate` | Check if claims for given questions pass confidence threshold |
| 222 | `amc claims` | Evidence claim expiry tracking |
| 223 | `amc claims list` | List all evidence claims with TTL status |
| 224 | `amc claims-stale` | List stale claims for an agent |
| 225 | `amc claims-sweep` | Process all stale claims for an agent (auto-demote to PROVISIONAL) |
| 226 | `amc classify` | Classify agent vs workflow |
| 227 | `amc classify agent` | Classify whether system is workflow or agent |
| 228 | `amc commands` | Generate the live AMC CLI command inventory from the registered command map |
| 229 | `amc commit` | Commitment plan flow (7/14/30-day checklist) |
| 230 | `amc comms-check` | Check a message/communication against compliance policies (lightweight communications firewall) |
| 231 | `amc compare` | Compare two runs OR multiple models (side-by-side evaluation) |
| 232 | `amc compare-models` | Run the same agent evaluation across multiple models and show comparison matrix |
| 233 | `amc compliance` | Evidence-linked compliance map operations |
| 234 | `amc compliance diff` | Diff two compliance report JSON files |
| 235 | `amc compliance fleet` | Generate fleet compliance summary |
| 236 | `amc compliance init` | Create and sign compliance-maps.yaml |
| 237 | `amc compliance matrix` | Generate multi-framework compliance coverage matrix with gap analysis |
| 238 | `amc compliance regulatory-check` | Check for regulatory changes from configured feeds |
| 239 | `amc compliance regulatory-feeds` | List all configured regulatory feed sources |
| 240 | `amc compliance regulatory-gap` | Run gap analysis against current AMC configuration |
| 241 | `amc compliance report` | Generate evidence-linked compliance report |
| 242 | `amc compliance risk-classify` | Classify agent into EU AI Act risk tiers (UNACCEPTABLE / HIGH / LIMITED / MINIMAL) |
| 243 | `amc compliance roadmap` | Generate step-by-step compliance plan for a framework |
| 244 | `amc compliance verify` | Verify compliance maps signature |
| 245 | `amc composition` | Inspect the declarative plugin composition (amc.cordis.yml) |
| 246 | `amc confidence` | Confidence drift tracking |
| 247 | `amc confidence calibration` | Show calibration report |
| 248 | `amc confidence drift` | Show drift trend |
| 249 | `amc confidence-components` | Show per-component confidence breakdown |
| 250 | `amc confidence-drift` | Track confidence drift per question across diagnostic runs |
| 251 | `amc confidence-heatmap` | Display confidence heatmap by question and layer |
| 252 | `amc config` | Inspect resolved runtime configuration |
| 253 | `amc config explain` | Explain config source precedence and risky settings |
| 254 | `amc config init` | Write a starter amcconfig.yaml |
| 255 | `amc config print` | Print resolved runtime config (secret-safe) |
| 256 | `amc config profile` | Print or apply workspace config profile (dev|ci|prod) |
| 257 | `amc config run` | Run the evaluation pipeline declared in amcconfig.yaml |
| 258 | `amc config validate` | Validate amcconfig.yaml without running anything |
| 259 | `amc connect` | Connect an agent runtime and track first action, decision, and proof |
| 260 | `amc connect hooks` | Install, inspect, or remove provider-native AMC observation and control hooks |
| 261 | `amc connect hooks health` | Verify signed hook setup and show the latest verified provider event |
| 262 | `amc connect hooks install` | Install a reversible project hook for Claude Code or Gemini CLI |
| 263 | `amc connect hooks lifecycle` | Verify one requested, controlled, and terminal provider action lifecycle |
| 264 | `amc connect hooks remove` | Remove only the signed AMC-owned hook and revoke its lease |
| 265 | `amc connect hooks status` | Verify provider config ownership, mode, signed manifest, and hook lease |
| 266 | `amc contract-tests` | Generate and display contract test suite for bridge API |
| 267 | `amc control-classification` | Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION) |
| 268 | `amc correction` | Human feedback, corrections, and feedback loop tracking |
| 269 | `amc correction add` | Add a human correction/feedback for an agent |
| 270 | `amc correction effectiveness` | Show correction effectiveness metrics |
| 271 | `amc correction list` | List corrections for an agent |
| 272 | `amc correction report` | Generate feedback closure report |
| 273 | `amc corrections-verify-closure` | Show open feedback loops that need closure |
| 274 | `amc costs` | Track and analyze actual agent costs from observability data |
| 275 | `amc costs show` | Show cost report for an agent |
| 276 | `amc dag` | Orchestration DAG capture and scoring |
| 277 | `amc dag capture` | Capture orchestration DAG for agents |
| 278 | `amc dag score` | Score DAG governance |
| 279 | `amc dashboard` | Device-first Compass dashboard |
| 280 | `amc dashboard build` | Build responsive offline dashboard for an agent |
| 281 | `amc dashboard open` | Build and serve dashboard at localhost:3210 |
| 282 | `amc dashboard serve` | Serve dashboard locally |
| 283 | `amc dashboard view` | Build and open web UI showing maturity scores, test results, and comparison matrix with shareable URLs |
| 284 | `amc dataset` | Manage evaluation datasets (golden sets) — curate business-specific test cases |
| 285 | `amc dataset add-case` | Add a test case to a dataset |
| 286 | `amc dataset create` | Create a new evaluation dataset |
| 287 | `amc dataset import` | Import test cases from CSV/JSON file |
| 288 | `amc dataset list` | List all evaluation datasets |
| 289 | `amc dataset run` | Run a dataset against an agent (via gateway proxy) |
| 290 | `amc debt-add` | Add a policy debt entry (waiver/override/exception) |
| 291 | `amc debt-list` | List policy debt entries |
| 292 | `amc debug` | Structured evidence debug stream for an agent |
| 293 | `amc delta-to-l5` | Generate L4→L5 delta report showing what separates current state from L5 |
| 294 | `amc demo` | Run interactive demos of AMC capabilities |
| 295 | `amc demo gap` | Scripted illustration of the 84-point documentation inflation gap (no agent is executed) |
| 296 | `amc demo prospect` | Run a guided 5-minute prospect demo flow |
| 297 | `amc demo run` | Run a simulated agent through the AMC gateway and produce a real score (~30s) |
| 298 | `amc demo share` | Generate a static client-facing prospect demo bundle |
| 299 | `amc diagnostic` | Diagnostic bank/render operations |
| 300 | `amc diagnostic bank` | Signed diagnostic 126-question bank operations |
| 301 | `amc diagnostic bank init` | Create and sign .amc/diagnostic/bank/bank.yaml |
| 302 | `amc diagnostic bank verify` | Verify diagnostic bank signature |
| 303 | `amc diagnostic render` | Render contextualized 126-question diagnostic for an agent |
| 304 | `amc dlp` | DLP scanner for PII and secrets |
| 305 | `amc dlp scan` | Scan text for PII and secrets |
| 306 | `amc doctor` | Check runtime availability and wrap readiness |
| 307 | `amc doctor-fix` | Auto-repair common setup issues |
| 308 | `amc domain` | Domain-specific architecture and compliance operations |
| 309 | `amc domain apply` | Apply domain-specific guardrails and industry pack rules to an agent |
| 310 | `amc domain assess` | Run full domain assessment |
| 311 | `amc domain assurance` | Run domain-specific assurance packs |
| 312 | `amc domain gaps` | Show compliance gaps for an agent and domain |
| 313 | `amc domain list` | List all 7 domains with metadata |
| 314 | `amc domain modules` | Show module activation map for domain |
| 315 | `amc domain pack` | Industry sector packs — 41 packs across 7 domains |
| 316 | `amc domain pack access` | Show Industry Packs entitlement and public-checkout readiness |
| 317 | `amc domain pack activate` | Activate Industry Packs with a valid issued license key |
| 318 | `amc domain pack checkout` | Create a checkout link only when a verified provider is configured |
| 319 | `amc domain pack describe` | Show details of a specific industry sector pack |
| 320 | `amc domain pack list` | List all available industry sector packs |
| 321 | `amc domain pack run` | Run an industry sector pack — interactive assessment or baseline score |
| 322 | `amc domain pack verify` | Verify an Industry Packs license key |
| 323 | `amc domain report` | Build full domain report and write it to a file |
| 324 | `amc domain roadmap` | Generate 30/60/90-day roadmap for this domain |
| 325 | `amc down` | Stop AMC Studio local control plane |
| 326 | `amc drift` | Drift/regression detection and reporting |
| 327 | `amc drift check` | - |
| 328 | `amc drift report` | - |
| 329 | `amc e2e` | End-to-end smoke verification |
| 330 | `amc e2e smoke` | Run go-live smoke tests: local, docker, or helm-template |
| 331 | `amc emergency-override` | Activate an emergency policy override with strict TTL |
| 332 | `amc enforce` | Policy enforcement and guardrails |
| 333 | `amc enforce ato-detect` | Detect account takeover attempts (demo) |
| 334 | `amc enforce blind-secrets` | Redact secrets from text |
| 335 | `amc enforce check` | Check policy for an agent action |
| 336 | `amc enforce exec-guard` | Check if a command is safe to execute |
| 337 | `amc enforce formal-verify` | Formally verify safety properties using proof trees and certificates |
| 338 | `amc enforce numeric-check` | Validate a numeric value within bounds |
| 339 | `amc enforce resources` | Snapshot, diff, and verify agent resources governed by Enforce |
| 340 | `amc enforce resources apply` | Accept current resources as the new signed manifest; dry-run unless --yes is set |
| 341 | `amc enforce resources contract` | Show the AMC-native governed resource lifecycle contract |
| 342 | `amc enforce resources diff` | Diff two Enforce resource manifests, or a manifest against the current workspace |
| 343 | `amc enforce resources evaluate` | Evaluate a resource proposal against Enforce gates |
| 344 | `amc enforce resources get` | Alias for inspect: read one resource from an Enforce resource manifest |
| 345 | `amc enforce resources history` | Show signed Enforce resource manifests, snapshots, and receipts |
| 346 | `amc enforce resources inspect` | Inspect one resource in an Enforce resource manifest |
| 347 | `amc enforce resources list` | List resources in an Enforce resource manifest |
| 348 | `amc enforce resources propose` | Create a dry-run resource change proposal from the latest manifest to current workspace state |
| 349 | `amc enforce resources restore` | Restore resources from an Enforce snapshot; dry-run unless --apply is set |
| 350 | `amc enforce resources rollback` | Roll back to the signed previous version, or an explicit canonical snapshot |
| 351 | `amc enforce resources snapshot` | Write the current Enforce resource manifest |
| 352 | `amc enforce resources status` | Show the signed active, previous, rollback, drift, and integrity state |
| 353 | `amc enforce resources validate` | Validate governed resource changes before accepting them |
| 354 | `amc enforce resources verify` | Verify the current workspace resources against an Enforce resource manifest |
| 355 | `amc enforce taint` | Track tainted input through the system |
| 356 | `amc enforce tla-spec` | Generate a TLA+ specification for the AMC safety model |
| 357 | `amc enforce verify-certificate` | Verify the integrity of a proof certificate (pass JSON as string) |
| 358 | `amc enterprise` | Enterprise tier — licensing, audit export, SSO, fleet governance |
| 359 | `amc enterprise activate` | Activate an enterprise license key (format: AMC-ENT-XXXX-XXXX-XXXX) |
| 360 | `amc enterprise audit-export` | Export audit trail in SIEM format |
| 361 | `amc enterprise status` | Show current license status, tier, and enabled features |
| 362 | `amc enterprise usage` | Show multi-tenant usage metering and quota utilization |
| 363 | `amc eval` | Eval interop import and coverage status |
| 364 | `amc eval import` | Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse, LangWatch) into signed AMC evidence |
| 365 | `amc eval registry` | Show signed metadata for existing AMC evaluators |
| 366 | `amc eval run` | One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results |
| 367 | `amc eval status` | Show imported eval coverage per AMC dimension |
| 368 | `amc evidence` | Evidence lifecycle workflows |
| 369 | `amc evidence collect` | Guided wizard to connect your agent and capture evidence |
| 370 | `amc evidence decisions` | List and inspect decision receipts generated by full-score runs |
| 371 | `amc evidence decisions inspect` | Inspect one decision receipt by receipt id or run id |
| 372 | `amc evidence decisions list` | List persisted decision receipts |
| 373 | `amc evidence decisions observe` | Update open decision receipts with observed outcomes from a later full-score run |
| 374 | `amc evidence episodes` | List, inspect, and export lifecycle evidence episodes |
| 375 | `amc evidence episodes export` | Export one EpisodeRecord as JSON or Markdown |
| 376 | `amc evidence episodes inspect` | Inspect one EpisodeRecord by episode id, lifecycle id, or run id |
| 377 | `amc evidence episodes list` | List persisted EpisodeRecord evidence objects |
| 378 | `amc evidence export` | Export verifier-ready evidence (json|csv|pdf) |
| 379 | `amc evidence finding-proofs` | List, inspect, and export finding proof chains |
| 380 | `amc evidence finding-proofs export` | Export finding proofs as JSON |
| 381 | `amc evidence finding-proofs inspect` | Inspect one finding proof by proof id, finding id, run id, or question id |
| 382 | `amc evidence finding-proofs list` | List persisted finding proof chains |
| 383 | `amc evidence help` | Show high-signal evidence command groups |
| 384 | `amc evidence lifecycle` | List, inspect, and export full lifecycle run artifacts |
| 385 | `amc evidence lifecycle export` | Export one lifecycle artifact as JSON |
| 386 | `amc evidence lifecycle inspect` | Inspect one lifecycle artifact by lifecycle id or run id |
| 387 | `amc evidence lifecycle list` | List persisted lifecycle run artifacts |
| 388 | `amc evidence lifecycle-receipts` | List, inspect, and export lifecycle proposal, validation, commit, rollback, and monitor receipts |
| 389 | `amc evidence lifecycle-receipts export` | Export lifecycle receipts as JSON |
| 390 | `amc evidence lifecycle-receipts inspect` | Inspect one lifecycle receipt by receipt id, run id, or lifecycle id |
| 391 | `amc evidence lifecycle-receipts list` | List persisted lifecycle change receipts |
| 392 | `amc evidence observability` | List and inspect component, experience, and decision observability records |
| 393 | `amc evidence observability inspect` | Inspect one observability lane record by observability id, lifecycle id, or run id |
| 394 | `amc evidence observability list` | List persisted observability lane records |
| 395 | `amc evidence verify` | Run full workspace verification suite |
| 396 | `amc evidence-stores` | Inspect the staged consolidation of databases outside evidence.sqlite |
| 397 | `amc evidence-stores backfill` | Copy guard events written before dual-write into evidence.sqlite |
| 398 | `amc evidence-stores parity` | Compare the legacy guard-event store against the consolidated one |
| 399 | `amc executive` | Executive and board-ready AMC artifacts |
| 400 | `amc executive brief` | Generate a board-ready one-page executive brief from a diagnostic run |
| 401 | `amc experiment` | Deterministic baseline vs candidate experiments |
| 402 | `amc experiment analyze` | Analyze latest experiment run |
| 403 | `amc experiment create` | Create an experiment |
| 404 | `amc experiment gate` | Evaluate latest experiment run against gate policy |
| 405 | `amc experiment gate-template` | Write an experiment gate policy template |
| 406 | `amc experiment list` | List experiments |
| 407 | `amc experiment optimize` | Create governed optimizer candidates from a Fixer RCA report |
| 408 | `amc experiment optimizer-list` | List governed optimizer runs |
| 409 | `amc experiment optimizer-show` | Show a governed optimizer run |
| 410 | `amc experiment run` | Run deterministic experiment against signed casebook |
| 411 | `amc experiment set-baseline` | Set experiment baseline config |
| 412 | `amc experiment set-candidate` | Set experiment candidate signed config overlay |
| 413 | `amc experiment-architecture` | Run a controlled architecture comparison experiment |
| 414 | `amc experiment-architecture-probes` | List the standard probe set for architecture experiments |
| 415 | `amc explain` | Plain-English explanation for a diagnostic question (example: AMC-2.1) |
| 416 | `amc export` | Export policy packs and badges |
| 417 | `amc export badge` | Export deterministic maturity badge SVG for a run |
| 418 | `amc export grc` | Export the latest run as a GRC control-evidence manifest (Vanta/Drata/OneTrust-ingestible) + SARIF |
| 419 | `amc export policy` | Export framework-agnostic North Star policy integration pack |
| 420 | `amc federate` | Offline federation sync operations |
| 421 | `amc federate export` | Export offline federation sync package (.amcfed) |
| 422 | `amc federate import` | Import and verify federation package |
| 423 | `amc federate init` | Initialize federation identity and signed config |
| 424 | `amc federate peer` | Federation peer trust anchors |
| 425 | `amc federate peer add` | Add a peer publisher public key |
| 426 | `amc federate peer list` | List federation peers |
| 427 | `amc federate verify` | Verify federation config signature |
| 428 | `amc federate verify-bundle` | Verify .amcfed package |
| 429 | `amc firewall` | Runtime protection for live agent traffic |
| 430 | `amc firewall check` | Evaluate a request or response payload against Runtime Firewall |
| 431 | `amc firewall disable` | Disable Runtime Firewall for this workspace |
| 432 | `amc firewall enable` | Enable Runtime Firewall in observe, warn, or block mode |
| 433 | `amc firewall events` | List Runtime Firewall decision events |
| 434 | `amc firewall export` | Export Runtime Firewall decisions for SIEM or audit review |
| 435 | `amc firewall migrate-signature` | Preserve and journal an existing verified Runtime Firewall policy |
| 436 | `amc firewall status` | Show Runtime Firewall policy and signed rollout counters |
| 437 | `amc fix` | Score your agent, explain the top gaps in plain language, and write guardrail fixes into your agent's own config file |
| 438 | `amc fix-signatures` | Verify and re-sign gateway/fleet/agent configs |
| 439 | `amc fleet` | Fleet operations |
| 440 | `amc fleet contradictions` | Detect cross-agent contradictions |
| 441 | `amc fleet dag` | Visualize orchestration delegation graph |
| 442 | `amc fleet graph` | Typed multi-agent graph operations |
| 443 | `amc fleet graph list` | List saved typed multi-agent graphs |
| 444 | `amc fleet graph show` | Inspect the latest typed multi-agent graph |
| 445 | `amc fleet graph validate` | Validate the latest typed multi-agent graph |
| 446 | `amc fleet graph write` | Write the latest typed multi-agent graph from a JSON file |
| 447 | `amc fleet handoff` | Manage handoff packets |
| 448 | `amc fleet health` | Show fleet health dashboard aggregates |
| 449 | `amc fleet init` | Create and sign .amc/fleet.yaml |
| 450 | `amc fleet lifecycle` | Fleet parent/child lifecycle evidence |
| 451 | `amc fleet lifecycle list` | List parent fleet lifecycle artifacts |
| 452 | `amc fleet lifecycle show` | Inspect one parent fleet lifecycle artifact |
| 453 | `amc fleet overview` | One-shot executive fleet summary with verdict, coverage, drift, and next actions |
| 454 | `amc fleet policy` | Fleet governance policy operations |
| 455 | `amc fleet policy apply` | Apply a governance policy to all fleet agents or one environment |
| 456 | `amc fleet policy list` | List effective fleet governance policies |
| 457 | `amc fleet report` | Generate fleet maturity report (md) or fleet compliance report (pdf) |
| 458 | `amc fleet score` | Score multiple agents in one run with fleet-wide aggregates, weak-link detection, and pairwise comparison |
| 459 | `amc fleet slo` | Fleet governance SLO operations |
| 460 | `amc fleet slo define` | Define a fleet SLO, e.g. "95% of production agents must score L3+ on dimension 2" |
| 461 | `amc fleet slo list` | List fleet SLO definitions |
| 462 | `amc fleet slo status` | Show fleet SLO compliance status |
| 463 | `amc fleet status` | Show fleet overview (agent count, average score, health) |
| 464 | `amc fleet tag` | Tag an agent with an environment |
| 465 | `amc fleet trust-add-edge` | Add a delegation edge (orchestrator → worker) |
| 466 | `amc fleet trust-edges` | List all delegation edges |
| 467 | `amc fleet trust-graph` | Render delegation trust graph as Mermaid, DOT, or JSON |
| 468 | `amc fleet trust-init` | Initialize trust composition config |
| 469 | `amc fleet trust-mode` | Set trust inheritance policy mode |
| 470 | `amc fleet trust-receipts` | Verify cross-agent receipt chains |
| 471 | `amc fleet trust-remove-edge` | Remove a delegation edge |
| 472 | `amc fleet trust-report` | Generate trust composition report across fleet |
| 473 | `amc forecast` | Deterministic evidence-gated forecasting and planning |
| 474 | `amc forecast init` | Create and sign forecast policy |
| 475 | `amc forecast latest` | Render latest forecast for scope |
| 476 | `amc forecast policy` | Forecast policy operations |
| 477 | `amc forecast policy apply` | Apply and sign forecast policy from file |
| 478 | `amc forecast policy default` | Print default forecast policy JSON |
| 479 | `amc forecast print-policy` | Print effective forecast policy |
| 480 | `amc forecast refresh` | Refresh forecast snapshot for scope |
| 481 | `amc forecast scheduler` | Forecast renewal scheduler controls |
| 482 | `amc forecast scheduler disable` | Disable forecast scheduler |
| 483 | `amc forecast scheduler enable` | Enable forecast scheduler |
| 484 | `amc forecast scheduler run-now` | Run scheduler refresh immediately |
| 485 | `amc forecast scheduler status` | Show scheduler status |
| 486 | `amc forecast verify` | Verify forecast policy signature |
| 487 | `amc fp-cost` | Show false positive cost summary |
| 488 | `amc fp-list` | List false positive reports |
| 489 | `amc fp-resolve` | Resolve a false positive report |
| 490 | `amc fp-submit` | Submit a false positive report for an assurance scenario |
| 491 | `amc fp-tuning-report` | Generate false positive tuning report with recommendations |
| 492 | `amc framework-guide` | Framework-specific governance guidance |
| 493 | `amc freeze` | Execution freeze status and controls |
| 494 | `amc freeze lift` | - |
| 495 | `amc freeze status` | - |
| 496 | `amc gate` | Evaluate a run bundle against a gate policy |
| 497 | `amc gateway` | AMC universal LLM proxy gateway |
| 498 | `amc gateway bind-agent` | Bind a gateway route prefix to an agent ID for deterministic attribution |
| 499 | `amc gateway init` | Create and sign .amc/gateway.yaml |
| 500 | `amc gateway start` | Start local reverse-proxy gateway and signed evidence capture |
| 501 | `amc gateway status` | Check gateway reachability and route URLs |
| 502 | `amc gateway verify-config` | Verify .amc/gateway.yaml signature |
| 503 | `amc glossary` | Domain terminology management |
| 504 | `amc glossary define` | Define a glossary term |
| 505 | `amc glossary lookup` | Look up a glossary term |
| 506 | `amc governance-drift` | Detect governance drift for an agent |
| 507 | `amc governor` | Autonomy Governor checks |
| 508 | `amc governor check` | Evaluate whether an action is allowed now (simulate vs execute) |
| 509 | `amc governor confidence-check` | Check if action is allowed given confidence-adjusted maturity |
| 510 | `amc governor explain` | Explain policy requirements for an action class |
| 511 | `amc governor report` | Render matrix of current SIMULATE/EXECUTE allowance per ActionClass |
| 512 | `amc governor-override` | Activate an emergency governance override with TTL |
| 513 | `amc governor-override-alerts` | Show alerts for active/expired overrides |
| 514 | `amc guard` | Guard check proposed output from stdin |
| 515 | `amc guardrails` | Signed runtime guardrail controls |
| 516 | `amc guardrails disable` | Remove an additive guardrail request without weakening signed policy |
| 517 | `amc guardrails enable` | Request a signed, runtime-bound guardrail |
| 518 | `amc guardrails list` | List signed requested state and effective runtime guardrail bindings |
| 519 | `amc guardrails profile` | Apply bound controls from a signed additive profile |
| 520 | `amc guide` | Generate personalized improvement guide with exportable agent instructions |
| 521 | `amc help` | Show help for a command (for example: amc help run) |
| 522 | `amc history` | List diagnostic run history |
| 523 | `amc host` | Multi-workspace host mode operations |
| 524 | `amc host bootstrap` | Bootstrap host admin + default workspace from secret files |
| 525 | `amc host init` | Initialize host metadata database |
| 526 | `amc host list` | List host users and workspaces |
| 527 | `amc host membership` | Host membership management |
| 528 | `amc host membership grant` | - |
| 529 | `amc host membership revoke` | - |
| 530 | `amc host migrate` | Migrate an existing single-workspace AMC directory into host mode |
| 531 | `amc host user` | Host user management |
| 532 | `amc host user add` | - |
| 533 | `amc host user disable` | - |
| 534 | `amc host workspace` | Host workspace lifecycle |
| 535 | `amc host workspace create` | - |
| 536 | `amc host workspace delete` | - |
| 537 | `amc host workspace purge` | - |
| 538 | `amc identity` | Enterprise identity (OIDC/SAML) configuration |
| 539 | `amc identity init` | Create and sign host-level identity.yaml |
| 540 | `amc identity mapping` | Signed group-to-role mapping rules |
| 541 | `amc identity mapping add` | Add a group mapping rule |
| 542 | `amc identity provider` | Identity provider management |
| 543 | `amc identity provider add` | Add an identity provider |
| 544 | `amc identity verify` | Verify identity.yaml signature |
| 545 | `amc import` | Import neutral traces, runs, workflow graphs, configs, memory, evals, and benchmarks |
| 546 | `amc imports` | List, inspect, and roll back neutral import runs |
| 547 | `amc imports list` | List recent neutral import runs |
| 548 | `amc imports rollback` | Remove files written by a neutral import run |
| 549 | `amc imports show` | Inspect a neutral import manifest |
| 550 | `amc improve` | Guided improvement — shows what to fix next based on your current score |
| 551 | `amc incident` | Incident tracking and response operations |
| 552 | `amc incident close` | Close an incident with a resolution summary |
| 553 | `amc incident create` | Create a manual incident |
| 554 | `amc incident link` | Link evidence to an incident |
| 555 | `amc incident list` | List incidents for an agent |
| 556 | `amc incident show` | Show incident details |
| 557 | `amc incidents` | Incident operations and dispatch workflows |
| 558 | `amc incidents alert` | Dispatch INCIDENT_CREATED to configured integration channels |
| 559 | `amc incidents help` | Show incident-focused command groups |
| 560 | `amc indices` | Compute deterministic failure-risk indices |
| 561 | `amc indices fleet` | Compute failure-risk indices across fleet |
| 562 | `amc ingest` | Ingest external logs/transcripts as SELF_REPORTED evidence |
| 563 | `amc init` | Initialize .amc workspace |
| 564 | `amc insider-alerts` | Show insider risk alerts |
| 565 | `amc insider-risk-report` | Generate insider risk analytics report |
| 566 | `amc insider-risk-scores` | Show insider risk scores by actor |
| 567 | `amc integrate` | Generate integration scaffold for a framework |
| 568 | `amc integrate-list` | List available integration frameworks |
| 569 | `amc integrations` | Integration hub operations |
| 570 | `amc integrations catalog` | List available integrations |
| 571 | `amc integrations dispatch` | Dispatch a deterministic integration event |
| 572 | `amc integrations export-journal` | Export integration delivery journal (receipts + dead letters) |
| 573 | `amc integrations init` | Create and sign integrations.yaml with vault-backed secret refs |
| 574 | `amc integrations setup` | Generate integration config files |
| 575 | `amc integrations status` | Show integration channels and routing |
| 576 | `amc integrations test` | Dispatch deterministic test event to an integration channel |
| 577 | `amc integrations verify` | Verify integrations config signature |
| 578 | `amc inventory` | AI asset inventory — discover and catalog AI agents, models, and tools |
| 579 | `amc inventory list` | List AI assets (alias for 'inventory scan') |
| 580 | `amc inventory scan` | Scan workspace for AI assets (agents, models, configs, API keys) |
| 581 | `amc key-custody-modes` | List available key custody modes and their configurations |
| 582 | `amc lab-compare` | Compare two lab experiments |
| 583 | `amc lab-create` | Create a new lab experiment |
| 584 | `amc lab-list` | List all lab experiments |
| 585 | `amc lab-report` | Generate a lab experiment report |
| 586 | `amc lab-simulate` | Simulate the lab workflow with placeholder probe results (no model is called) |
| 587 | `amc lab-templates` | List available experiment templates |
| 588 | `amc leaderboard` | Benchmark leaderboard — compare agent maturity scores |
| 589 | `amc leaderboard export` | Export leaderboard as JSON/HTML for public sharing |
| 590 | `amc leaderboard public-export` | Build an anonymized public leaderboard dataset bundle |
| 591 | `amc leaderboard show` | Show fleet-wide maturity leaderboard |
| 592 | `amc learn` | Education flow for a specific maturity question |
| 593 | `amc lease` | Issue/verify/revoke short-lived agent leases |
| 594 | `amc lease issue` | - |
| 595 | `amc lease revoke` | - |
| 596 | `amc lease verify` | - |
| 597 | `amc legal-hold` | Issue or manage legal holds |
| 598 | `amc lessons-list` | List lessons learned from corrections |
| 599 | `amc lessons-promote` | Promote a correction to a reusable lesson |
| 600 | `amc lifecycle` | Agent lifecycle responsibility and governance mapping |
| 601 | `amc lifecycle advance` | Advance lifecycle stage after governance gate confirmation |
| 602 | `amc lifecycle status` | Show lifecycle stage, accountability matrix, governance gates, and transition trail |
| 603 | `amc lineage-claim` | Show full governance lineage for a specific claim |
| 604 | `amc lineage-init` | Initialize governance lineage tables |
| 605 | `amc lineage-policy-intents` | List all policy change intents for an agent |
| 606 | `amc lineage-report` | Generate governance lineage report |
| 607 | `amc lint` | Lint agent configuration files for schema compliance, anti-patterns, and best practices |
| 608 | `amc lint rules` | List all available lint rules |
| 609 | `amc lite-score` | Lite scoring mode for non-agent LLMs / chatbots — simplified assessment without agentic features |
| 610 | `amc logs` | Print latest AMC Studio logs |
| 611 | `amc loop` | Continuous self-serve maturity loop |
| 612 | `amc loop init` | Initialize recurring loop config |
| 613 | `amc loop plan` | Print recurring loop plan |
| 614 | `amc loop run` | Run recurring diagnostic + assurance + dashboard + snapshot |
| 615 | `amc loop schedule` | Print OS scheduler config (no automatic installation) |
| 616 | `amc maintenance` | Operational maintenance operations |
| 617 | `amc maintenance prune-cache` | Prune dashboard/console/transform cache artifacts |
| 618 | `amc maintenance reindex` | Ensure operational SQLite indexes |
| 619 | `amc maintenance rotate-logs` | Rotate Studio logs based on ops policy |
| 620 | `amc maintenance stats` | Show DB/blob/archive/cache operational stats |
| 621 | `amc maintenance vacuum` | Run SQLite VACUUM + ANALYZE |
| 622 | `amc marketplace` | AMC Pack Marketplace — browse, install, rate community packs |
| 623 | `amc marketplace deprecate` | Deprecate a pack |
| 624 | `amc marketplace featured` | Show featured packs |
| 625 | `amc marketplace info` | Show details for a specific pack |
| 626 | `amc marketplace install` | Install a pack from the marketplace |
| 627 | `amc marketplace list` | List installed packs |
| 628 | `amc marketplace rate` | Rate a pack |
| 629 | `amc marketplace search` | Search marketplace for packs |
| 630 | `amc marketplace undeprecate` | Remove deprecation from a pack |
| 631 | `amc marketplace uninstall` | Uninstall a pack |
| 632 | `amc mcp` | AMC Model Context Protocol (MCP) server for AI coding assistants |
| 633 | `amc mcp config` | Print MCP configuration snippets for supported AI coding assistants |
| 634 | `amc mcp list-tools` | List all tools exposed by the AMC MCP server |
| 635 | `amc mcp serve` | Start the AMC MCP server (stdio transport for IDE integration) |
| 636 | `amc mechanic` | Mechanic Workbench (targets, plans, simulation) |
| 637 | `amc mechanic export` | Export latest gap analysis as reward functions, DSPy targets, or fine-tune recipes |
| 638 | `amc mechanic gap` | - |
| 639 | `amc mechanic init` | - |
| 640 | `amc mechanic plan` | Create, diff, approve, and execute upgrade plans |
| 641 | `amc mechanic plan create` | - |
| 642 | `amc mechanic plan diff` | - |
| 643 | `amc mechanic plan execute` | - |
| 644 | `amc mechanic plan request-approval` | - |
| 645 | `amc mechanic plan show` | - |
| 646 | `amc mechanic profile` | Apply one-click signed target profiles |
| 647 | `amc mechanic profile apply` | - |
| 648 | `amc mechanic profile list` | - |
| 649 | `amc mechanic profile verify` | - |
| 650 | `amc mechanic rca` | Generate fixer root-cause reports from trace failure indexes |
| 651 | `amc mechanic rca list` | List generated fixer RCA reports |
| 652 | `amc mechanic rca run` | Classify a failed run and create regression-preserving fix proposals |
| 653 | `amc mechanic rca show` | Inspect a fixer RCA report |
| 654 | `amc mechanic simulate` | - |
| 655 | `amc mechanic simulations` | Show latest signed simulation artifact |
| 656 | `amc mechanic targets` | Manage signed equalizer targets |
| 657 | `amc mechanic targets apply` | - |
| 658 | `amc mechanic targets init` | - |
| 659 | `amc mechanic targets print` | - |
| 660 | `amc mechanic targets set` | - |
| 661 | `amc mechanic targets verify` | - |
| 662 | `amc mechanic tuning` | Manage signed mechanic tuning intent |
| 663 | `amc mechanic tuning apply` | - |
| 664 | `amc mechanic tuning init` | - |
| 665 | `amc mechanic tuning print` | - |
| 666 | `amc mechanic tuning set` | - |
| 667 | `amc mechanic tuning verify` | - |
| 668 | `amc mechanic verify` | Verify mechanic signatures and artifacts |
| 669 | `amc memory` | Memory maturity assessment and management |
| 670 | `amc memory assess` | Full memory maturity assessment |
| 671 | `amc memory retrieve` | Retrieve active reasoning memory for a consumer |
| 672 | `amc memory show` | Show one reasoning memory item |
| 673 | `amc memory writeback` | Write governed reasoning memory from an EpisodeRecord |
| 674 | `amc memory-advisories` | Show advisories from correction memory for prompt injection |
| 675 | `amc memory-expire` | Expire stale lessons past their TTL |
| 676 | `amc memory-extract` | Extract lessons from verified effective corrections |
| 677 | `amc memory-report` | Generate correction memory report |
| 678 | `amc meta-confidence` | Report confidence in the maturity score itself |
| 679 | `amc methodology` | Print the public AMC scoring methodology manifest and hash |
| 680 | `amc metrics` | Prometheus metrics endpoint helpers |
| 681 | `amc metrics status` | Show configured metrics endpoint bind/port |
| 682 | `amc micro-canary-alerts` | Show active micro-canary alerts |
| 683 | `amc micro-canary-report` | Generate micro-canary status report |
| 684 | `amc micro-canary-run` | Run all micro-canary probes immediately |
| 685 | `amc mirofish` | Agent behavior simulation framework — flight simulator for AI agents |
| 686 | `amc mirofish compare` | Side-by-side comparison of two scenarios |
| 687 | `amc mirofish create` | Interactive scenario builder |
| 688 | `amc mirofish list` | List available built-in scenarios |
| 689 | `amc mirofish run` | Run a Monte Carlo simulation with a scenario |
| 690 | `amc mirofish stress` | Find governance breaking points for a scenario |
| 691 | `amc mode` | Switch CLI role mode |
| 692 | `amc mode agent` | Switch to agent mode (read-only / self-check commands) |
| 693 | `amc mode owner` | Switch to owner mode (configuration + signing allowed) |
| 694 | `amc monitor` | Continuous production monitoring — real-time scoring, drift detection, and alerting |
| 695 | `amc monitor check` | One-shot trust drift analysis (check for degradation without running continuously) |
| 696 | `amc monitor events` | Show recent monitoring events |
| 697 | `amc monitor live` | Start real-time monitoring with live assurance checks on incoming traces |
| 698 | `amc monitor metrics` | Get metrics for a specific agent |
| 699 | `amc monitor start` | Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation |
| 700 | `amc monitor status` | Show monitoring status for all agents |
| 701 | `amc notary` | AMC Notary signing boundary operations |
| 702 | `amc notary attest` | Generate signed notary runtime attestation bundle (.amcattest) |
| 703 | `amc notary init` | Initialize AMC Notary config and signing backend |
| 704 | `amc notary log-verify` | Verify notary append-only signing log + seal signature |
| 705 | `amc notary pubkey` | Print notary public key and fingerprint |
| 706 | `amc notary sign` | Sign a payload file using Notary (admin utility) |
| 707 | `amc notary start` | Start AMC Notary service (foreground) |
| 708 | `amc notary status` | Show notary backend and log status |
| 709 | `amc notary verify-attest` | Verify a .amcattest bundle offline |
| 710 | `amc observe` | Observability — timeline, anomaly detection, and tracing |
| 711 | `amc observe anomalies` | Detect observability anomalies (evidence rate drops, trust regressions, score volatility) |
| 712 | `amc observe timeline` | Show agent evidence timeline with score progression |
| 713 | `amc openapi-generate` | Generate live OpenAPI spec (Studio + Bridge + Gateway) |
| 714 | `amc operator-dashboard` | Generate operator dashboard showing why questions are capped and how to unlock |
| 715 | `amc ops` | Operational hardening policy controls |
| 716 | `amc ops backpressure` | Show backpressure pipeline health |
| 717 | `amc ops circuit-breaker-init` | Initialize circuit breaker policy |
| 718 | `amc ops circuit-breaker-reset` | Reset all circuit breakers |
| 719 | `amc ops circuit-breaker-status` | Show circuit breaker status |
| 720 | `amc ops dead-letters` | Show dead letter queue |
| 721 | `amc ops init` | Create and sign .amc/ops-policy.yaml |
| 722 | `amc ops latency` | Show latency accounting report |
| 723 | `amc ops mode` | Show or set degradation mode |
| 724 | `amc ops print` | Print effective ops policy |
| 725 | `amc ops slo` | Show governance SLO dashboard |
| 726 | `amc ops verify` | Verify ops-policy signature |
| 727 | `amc org` | Org graph and real-time comparative scorecards |
| 728 | `amc org add` | - |
| 729 | `amc org add node` | - |
| 730 | `amc org assign` | - |
| 731 | `amc org commit` | - |
| 732 | `amc org community` | Community/platform governance scoring |
| 733 | `amc org community init` | - |
| 734 | `amc org community score` | - |
| 735 | `amc org compare` | - |
| 736 | `amc org init` | - |
| 737 | `amc org inspect` | - |
| 738 | `amc org learn` | - |
| 739 | `amc org own` | - |
| 740 | `amc org report` | - |
| 741 | `amc org roles` | List the canonical 70 AMC org roles |
| 742 | `amc org run` | Run the advanced 70-role org lifecycle loop with isolated role workspaces |
| 743 | `amc org runs` | List org lifecycle runs |
| 744 | `amc org score` | - |
| 745 | `amc org unassign` | - |
| 746 | `amc org verify` | Verify signed org.yaml |
| 747 | `amc outcomes` | Outcome contracts, value signals, and reports |
| 748 | `amc outcomes attest` | Record manual attested outcome signal |
| 749 | `amc outcomes diff` | Diff two outcome reports |
| 750 | `amc outcomes init` | Create and sign outcome contract |
| 751 | `amc outcomes report` | Generate outcomes report (agent) or fleet outcomes report |
| 752 | `amc outcomes verify` | Verify outcome contract signature |
| 753 | `amc overhead-profile` | Set the overhead mode profile (STRICT, BALANCED, LEAN) |
| 754 | `amc overhead-report` | Generate per-feature overhead accounting report |
| 755 | `amc oversight` | Human oversight quality assessment |
| 756 | `amc oversight assess` | Assess human oversight quality |
| 757 | `amc own` | Ownership flow for top maturity gaps |
| 758 | `amc pack` | Community assurance pack registry — NPM-style package management |
| 759 | `amc pack info` | Show detailed information about a pack |
| 760 | `amc pack init` | Initialize a new pack in <name>/ or an explicit --dir |
| 761 | `amc pack install` | Install a community assurance pack |
| 762 | `amc pack list` | List installed packs |
| 763 | `amc pack publish` | Publish a pack to the registry |
| 764 | `amc pack registry` | Pack registry management |
| 765 | `amc pack registry init` | Initialize local pack registry |
| 766 | `amc pack registry serve` | Start a local pack registry server |
| 767 | `amc pack search` | Search for packs in the registry |
| 768 | `amc pack test` | Test a local pack directory; defaults to cwd and auto-detects one child pack |
| 769 | `amc pack uninstall` | Uninstall a pack |
| 770 | `amc pair` | LAN pairing code operations |
| 771 | `amc pair create` | Create one-time pairing code (LAN login pairing or agent bridge pairing) |
| 772 | `amc pair redeem` | Redeem pairing code for a lease token file |
| 773 | `amc passport` | Agent Passport (shareable maturity credential) |
| 774 | `amc passport badge` | Print deterministic single-line badge from latest cache |
| 775 | `amc passport capabilities-add` | Add capability declaration to agent passport |
| 776 | `amc passport compare` | Compare two agents by passport maturity dimensions |
| 777 | `amc passport create` | Create deterministic signed .amcpass artifact |
| 778 | `amc passport export-latest` | Export latest passport for a scope to .amcpass |
| 779 | `amc passport init` | Create and sign .amc/passport/policy.yaml |
| 780 | `amc passport issue-token` | Issue an AMC Trust Token for an agent |
| 781 | `amc passport link` | Link agent passport to external platform identity |
| 782 | `amc passport policy` | Passport policy operations |
| 783 | `amc passport policy apply` | Apply passport policy from JSON/YAML file |
| 784 | `amc passport policy print` | Print effective passport policy |
| 785 | `amc passport search` | Search agents by capability and minimum maturity level |
| 786 | `amc passport share` | Generate shareable passport material |
| 787 | `amc passport show` | Show .amcpass as JSON or single-line badge |
| 788 | `amc passport translate-score` | Translate trust scores between scoring systems |
| 789 | `amc passport verify` | Verify .amcpass artifact offline |
| 790 | `amc passport verify-policy` | Verify signed passport policy |
| 791 | `amc passport verify-token` | Verify an AMC Trust Token (pass JSON string) |
| 792 | `amc playground` | Interactive scenario runner |
| 793 | `amc playground list` | List available scenarios |
| 794 | `amc playground run` | Run all demo scenarios |
| 795 | `amc plugin` | Signed content-only extension marketplace |
| 796 | `amc plugin execute` | Execute approved plugin install/upgrade/remove request |
| 797 | `amc plugin init` | Initialize signed plugin workspace files |
| 798 | `amc plugin install` | Request plugin install (requires SECURITY dual-control approval) |
| 799 | `amc plugin keygen` | Generate plugin publisher keypair |
| 800 | `amc plugin limits` | Show current plugin sandbox resource limits |
| 801 | `amc plugin list` | List installed plugins and verification status |
| 802 | `amc plugin pack` | Create signed .amcplug package from a plugin folder |
| 803 | `amc plugin print` | Print plugin manifest summary |
| 804 | `amc plugin registries` | List signed workspace registry configuration |
| 805 | `amc plugin registries-apply` | Apply and sign workspace registries.yaml from JSON or YAML file |
| 806 | `amc plugin registry` | Manage plugin registries |
| 807 | `amc plugin registry init` | Initialize local signed plugin registry directory |
| 808 | `amc plugin registry publish` | Publish plugin package into registry and re-sign index |
| 809 | `amc plugin registry serve` | Serve plugin registry over local HTTP |
| 810 | `amc plugin registry verify` | Verify registry signature and package hashes |
| 811 | `amc plugin registry-fingerprint` | Compute registry public key fingerprint |
| 812 | `amc plugin remove` | Request plugin removal (requires SECURITY dual-control approval) |
| 813 | `amc plugin search` | Search a plugin registry by id/fingerprint |
| 814 | `amc plugin upgrade` | Request plugin upgrade (requires SECURITY dual-control approval) |
| 815 | `amc plugin verify` | Verify plugin package signature + artifact hashes |
| 816 | `amc plugin workspace-verify` | Verify workspace plugin signatures/integrity |
| 817 | `amc policy` | Policy-as-code operations |
| 818 | `amc policy action` | Signed autonomy action policy |
| 819 | `amc policy action init` | Create and sign .amc/action-policy.yaml |
| 820 | `amc policy action logic` | Compose existing Action Policy evidence requirements |
| 821 | `amc policy action logic apply` | Apply evidence logic after exact confirmation |
| 822 | `amc policy action logic compile` | Preview a deterministic evidence-logic change without writing |
| 823 | `amc policy action logic show` | Show declared evidence gates and effective logic |
| 824 | `amc policy action verify` | Verify action policy signature |
| 825 | `amc policy approval` | Signed dual-control approval policy |
| 826 | `amc policy approval init` | Create and sign .amc/approval-policy.yaml |
| 827 | `amc policy approval verify` | Verify approval-policy signature |
| 828 | `amc policy controls` | Show one verified Scope / When / Then projection of existing controls |
| 829 | `amc policy pack` | Policy packs by archetype and risk tier |
| 830 | `amc policy pack apply` | Apply policy pack and sign updated configs/targets |
| 831 | `amc policy pack describe` | Describe policy pack contents |
| 832 | `amc policy pack diff` | Show deterministic diff for applying a policy pack |
| 833 | `amc policy pack list` | List built-in policy packs |
| 834 | `amc policy scope` | Compile reusable action-class scopes into existing signed policies |
| 835 | `amc policy scope apply` | Apply a scope preview after exact compile-ID confirmation |
| 836 | `amc policy scope compile` | Preview a deterministic selected-rule merge without writing |
| 837 | `amc policy scope list` | List immutable AMC action-class scope templates |
| 838 | `amc policy simulate` | Simulate one projected control through its production evaluator without recording |
| 839 | `amc policy test` | Run deterministic policy fixtures through production control evaluators |
| 840 | `amc policy-canary-report` | Generate canary mode report for an agent |
| 841 | `amc policy-canary-start` | Start policy canary mode (observation-only) |
| 842 | `amc policy-debt-add` | Register a temporary policy waiver (debt) |
| 843 | `amc policy-debt-list` | List active policy debt entries |
| 844 | `amc product` | Product operations: routing, autonomy, metering, workflows |
| 845 | `amc product autonomy` | Decide autonomy level for an agent |
| 846 | `amc product features` | List product features |
| 847 | `amc product features-recommended` | Show top recommended product features |
| 848 | `amc product loop-detect` | Detect infinite loops in agent behavior |
| 849 | `amc product metering` | Show metering and billing for an agent |
| 850 | `amc product retry` | Execute a command with retry logic |
| 851 | `amc product route` | Route a task to the best model/provider |
| 852 | `amc prompt` | Northstar prompt policy + pack operations |
| 853 | `amc prompt init` | Create and sign .amc/prompt/policy.yaml |
| 854 | `amc prompt pack` | Prompt pack artifact operations |
| 855 | `amc prompt pack build` | Build and sign .amcprompt for an agent |
| 856 | `amc prompt pack diff` | Diff latest prompt pack against previous snapshot |
| 857 | `amc prompt pack show` | Show provider-specific enforced system prompt |
| 858 | `amc prompt pack verify` | Verify .amcprompt signature and lint signature |
| 859 | `amc prompt policy` | Prompt policy operations |
| 860 | `amc prompt policy apply` | Apply prompt policy from YAML file and sign |
| 861 | `amc prompt policy print` | Print prompt policy |
| 862 | `amc prompt scheduler` | Prompt pack recurrence scheduler |
| 863 | `amc prompt scheduler disable` | Disable prompt scheduler |
| 864 | `amc prompt scheduler enable` | Enable prompt scheduler |
| 865 | `amc prompt scheduler run-now` | Run prompt scheduler now for one agent or all |
| 866 | `amc prompt scheduler status` | Show prompt scheduler status |
| 867 | `amc prompt status` | List per-agent prompt pack status |
| 868 | `amc prompt verify` | Verify prompt policy, pack, lint and scheduler signatures |
| 869 | `amc proof` | Domain Proof Lane source-to-rule proof checks |
| 870 | `amc proof check` | Check a claim against a declared source-to-rule manifest and emit an amcproof artifact |
| 871 | `amc provider` | Provider template operations |
| 872 | `amc provider add` | Assign or update provider template for an agent |
| 873 | `amc provider list` | List provider templates |
| 874 | `amc python-sdk` | Generate the Python SDK package for AMC Bridge API |
| 875 | `amc quality-report` | Show quality report |
| 876 | `amc quickscore` | Full default interactive diagnostic — or use --rapid for 5-question express, --auto for ledger evidence |
| 877 | `amc quickstart` | 2-minute quickstart with Quick Score assessment |
| 878 | `amc rate` | Rate agent run quality (thumbs up/down) |
| 879 | `amc receipts-chain` | Show full delegation chain for a receipt |
| 880 | `amc redaction-test` | Run privacy redaction tests against built-in rules |
| 881 | `amc redteam` | Run red-team attack simulations against a target agent |
| 882 | `amc redteam attack` | Run attack plugins (prompt-injection, data-exfiltration, privilege-escalation, model-manipulation, denial-of-service) |
| 883 | `amc redteam attack-list` | List available attack plugins |
| 884 | `amc redteam plugins` | List available attack plugins (assurance packs) |
| 885 | `amc redteam run` | Execute red-team plugins with chosen attack strategies and generate a vulnerability report |
| 886 | `amc redteam strategies` | List available attack strategies |
| 887 | `amc release` | Deterministic release engineering and offline verification |
| 888 | `amc release init` | Initialize AMC release signing keypair |
| 889 | `amc release licenses` | Generate dependency license inventory |
| 890 | `amc release pack` | Build a signed deterministic .amcrelease bundle |
| 891 | `amc release print` | Print release bundle manifest summary |
| 892 | `amc release provenance` | Generate AMC provenance record |
| 893 | `amc release sbom` | Generate deterministic CycloneDX SBOM |
| 894 | `amc release scan` | Run strict secret scan on a .amcrelease bundle |
| 895 | `amc release verify` | Verify a .amcrelease bundle offline |
| 896 | `amc report` | Render report for run ID, saved alias, prefix, or 'latest' |
| 897 | `amc residency-policy` | Create or list data residency policies |
| 898 | `amc residency-report` | Generate data residency compliance report for a tenant |
| 899 | `amc resource` | Govern prompts, tools, memory, policies, routes, and other agent-defining resources |
| 900 | `amc resource apply` | Accept current resources as the new signed manifest; dry-run unless --yes is set |
| 901 | `amc resource contract` | Show the AMC-native governed resource lifecycle contract |
| 902 | `amc resource diff` | Diff an Enforce resource manifest against the current workspace |
| 903 | `amc resource evaluate` | Evaluate a resource proposal against Enforce gates |
| 904 | `amc resource get` | Inspect one resource in an Enforce resource manifest |
| 905 | `amc resource history` | Show signed Enforce resource manifests, snapshots, and receipts |
| 906 | `amc resource list` | List resources in an Enforce resource manifest |
| 907 | `amc resource propose` | Create a dry-run resource change proposal from the latest manifest to current workspace state |
| 908 | `amc resource restore` | Restore resources from an Enforce snapshot; dry-run unless --apply is set |
| 909 | `amc resource rollback` | Roll back to the signed previous version, or an explicit canonical snapshot |
| 910 | `amc resource snapshot` | Write the current Enforce resource manifest |
| 911 | `amc resource status` | Show the signed active, previous, rollback, drift, and integrity state |
| 912 | `amc resource validate` | Validate governed resource changes before accepting them |
| 913 | `amc retention` | Retention/archive payload lifecycle operations |
| 914 | `amc retention run` | Run archival + payload prune lifecycle |
| 915 | `amc retention status` | Show retention/archive status |
| 916 | `amc retention verify` | Verify archive manifests/signatures and ledger continuity |
| 917 | `amc role-presets` | List available dashboard role presets |
| 918 | `amc rollback-create` | Create a rollback pack from the current policy file |
| 919 | `amc run` | Full assessment — Score + Shield + Enforce + Vault + Watch + Comply + Fleet + Passport in one command |
| 920 | `amc run-alias` | Name diagnostic runs for report and history workflows |
| 921 | `amc run-alias list` | List diagnostic run aliases for the active agent |
| 922 | `amc run-alias remove` | Remove a diagnostic run alias |
| 923 | `amc run-alias set` | Assign a reusable alias to a diagnostic run |
| 924 | `amc runtime` | Runtime run manager for connected agents |
| 925 | `amc runtime cancel` | Cancel a runtime run cleanly |
| 926 | `amc runtime complete` | Complete a runtime run |
| 927 | `amc runtime create` | Create a persisted connected-agent runtime run |
| 928 | `amc runtime degrade` | Mark a runtime run degraded |
| 929 | `amc runtime event` | Append an event to a persisted runtime run |
| 930 | `amc runtime export` | Export runtime run events as JSON or JSONL |
| 931 | `amc runtime inspect` | Inspect a runtime run and its event stream |
| 932 | `amc runtime list` | List persisted runtime runs |
| 933 | `amc runtime resume` | Resume a running or degraded runtime run from persisted state |
| 934 | `amc runtime status` | Show persisted runtime run-manager status |
| 935 | `amc sandbox` | Hardened sandbox execution |
| 936 | `amc sandbox run` | Run agent command in hardened Docker sandbox |
| 937 | `amc scan` | Zero-integration agent assessment scanner |
| 938 | `amc scan model-scan` | Scan ML model files for security threats (malicious code, backdoors, supply chain attacks) |
| 939 | `amc scim` | SCIM token management |
| 940 | `amc scim init` | Enable SCIM provisioning and optionally create an initial bearer token |
| 941 | `amc scim token` | SCIM bearer token operations |
| 942 | `amc scim token create` | Create a SCIM bearer token and store hash in host vault |
| 943 | `amc score` | Maturity scoring, adversarial testing, and evidence collection |
| 944 | `amc score a2a-protocol` | Score agent-to-agent protocol maturity: card completeness, lifecycle, auth, format, errors, discovery |
| 945 | `amc score adversarial` | Test gaming resistance of scoring |
| 946 | `amc score alignment-index` | Compute composite alignment index |
| 947 | `amc score audit-depth` | Score audit trail depth and completeness |
| 948 | `amc score autonomy-duration` | Track time between human checkpoints with domain risk profiles |
| 949 | `amc score behavioral-contract` | Score agent behavioral contract maturity (alignment card, permitted/forbidden actions) |
| 950 | `amc score calibration-gap` | Measure delta between agent self-reported confidence and observed behavior |
| 951 | `amc score collect-evidence` | Collect an agent's evidence from the ledger |
| 952 | `amc score density-map` | Heatmap of evidence density per question per dimension — reveals blind spots |
| 953 | `amc score distributed-agents` | Score distributed multi-agent execution: partitions, sync, failover, consensus, load, observability |
| 954 | `amc score eu-ai-act` | Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk) |
| 955 | `amc score evidence-conflict` | Measure internal consistency of evidence — detect conflicting signals |
| 956 | `amc score evidence-coverage` | Show automated vs manual evidence coverage |
| 957 | `amc score evidence-ingest` | Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom) |
| 958 | `amc score factuality` | Score factuality across parametric, retrieval, and grounded dimensions |
| 959 | `amc score fail-secure` | Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection) |
| 960 | `amc score faithfulness` | Score how well LLM output is grounded in provided context |
| 961 | `amc score formal-spec` | Compute formal maturity score for an agent |
| 962 | `amc score gaming-resistance` | Test whether adversarial evidence injection can inflate scores |
| 963 | `amc score industry-adjust` | Adjust a score using an industry-specific trust model |
| 964 | `amc score industry-benchmark` | Show industry benchmark percentiles |
| 965 | `amc score industry-list` | List all available industry trust models |
| 966 | `amc score interpretability` | Score structural transparency and explainability |
| 967 | `amc score kernel-sandbox` | Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions) |
| 968 | `amc score lean-profile` | Show lean AMC profile |
| 969 | `amc score level-transition` | Track formal promotion/demotion events with evidence gates |
| 970 | `amc score memory-depth` | Score deep memory infrastructure: backend resilience, compression fidelity, cross-session consistency, TTL, capacity |
| 971 | `amc score memory-integrity` | Score memory correction persistence and poisoning resistance |
| 972 | `amc score mutual-verification` | Score agent-to-agent trust verification (challenge-response) |
| 973 | `amc score operational-independence` | Calculate operational independence score |
| 974 | `amc score output-attestation` | Score output signing and trust metadata for receiving agents |
| 975 | `amc score output-integrity` | Score output integrity maturity (OWASP LLM02, confidence calibration, citation) |
| 976 | `amc score owasp-llm` | Score OWASP LLM Top 10 coverage (all 10 risks) |
| 977 | `amc score pause-quality` | Score quality of agent-initiated pauses |
| 978 | `amc score policy-consistency` | Test policy enforcement consistency across repeated trials (pass^k) |
| 979 | `amc score production-ready` | Run production readiness gate for an agent |
| 980 | `amc score regulatory-readiness` | Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP) |
| 981 | `amc score runtime-identity` | Score runtime execution identity maturity (JIT credentials, user propagation, revocation) |
| 982 | `amc score safety-research` | Run the AI Safety Research evaluation lane — 4-dimension assessment based on frontier safety research |
| 983 | `amc score self-knowledge` | Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation) |
| 984 | `amc score simulation-lane` | Run the Simulation & Forecast evaluation lane — 5-dimension assessment for simulation/forecast systems |
| 985 | `amc score sleeper-detection` | Detect context-dependent behavioral inconsistencies |
| 986 | `amc score state-portability` | Score agent state portability (vendor-neutral format, serialization, integrity on transfer) |
| 987 | `amc score task-horizon` | Score task-completion time horizon (METR-inspired) |
| 988 | `amc score tier` | Run tiered maturity assessment (quick/standard/deep) |
| 989 | `amc score transparency-log` | Score network transparency log (Merkle tree, inclusion proofs) |
| 990 | `amc sessions` | View and analyze user sessions |
| 991 | `amc sessions list` | List tracked sessions |
| 992 | `amc setup` | Setup wizard for the full-score path and Studio gateway |
| 993 | `amc shell` | Interactive AMC session — natural language + commands |
| 994 | `amc shield` | Threat detection and security scanning |
| 995 | `amc shield analyze` | Run static code analyzer on a skill file |
| 996 | `amc shield analyze-mcp` | Scan an MCP server definition for security risks (score L0–L5) |
| 997 | `amc shield analyze-runtime` | Analyze a proposed runtime agent action through the Shield trust pipeline |
| 998 | `amc shield confirm` | Controlled exploit confirmation with strict authorization gates |
| 999 | `amc shield confirm export` | Export a redacted safe proof without exploit instructions |
| 1000 | `amc shield confirm proofs` | List safe exploit-confirmation proof artifacts |
| 1001 | `amc shield confirm run` | Run authorized safe exploit confirmation from a task JSON file |
| 1002 | `amc shield confirm scope-write` | Write a signed exploit-confirmation authorization scope from JSON |
| 1003 | `amc shield confirm scopes` | List exploit-confirmation authorization scopes |
| 1004 | `amc shield conversation-integrity` | Check conversation integrity for an agent (demo) |
| 1005 | `amc shield detect-injection` | Detect prompt injection attempts in text |
| 1006 | `amc shield mcp-ledger` | Signed MCP trust ledger: scan a set of MCP servers and record a clean-as-of receipt |
| 1007 | `amc shield posture` | One-command agent-security posture scorecard (config, MCP trust, secrets, isolation, supply-chain) — L0–L5, signed receipt |
| 1008 | `amc shield red-team` | Run a quick red team campaign (5 attacks on demo target). Tip: For full red-team suite with strategies, use `amc redteam run` |
| 1009 | `amc shield red-team-status` | Show current red team capabilities and attack template count |
| 1010 | `amc shield reputation` | Check reputation score for a tool |
| 1011 | `amc shield sandbox` | Check sandbox configuration for an agent |
| 1012 | `amc shield sanitize` | Sanitize text — strip LLM prompt injection and dangerous AI patterns (not SQL/XSS) |
| 1013 | `amc shield sbom` | Generate software bill of materials from package.json |
| 1014 | `amc shield scan-config` | Scan the coding-agent config surface (CLAUDE.md, settings, hooks, MCP, agent defs) for security risks (L0–L5, signed receipt) |
| 1015 | `amc shield threat-intel` | Check threat intelligence for an input |
| 1016 | `amc shield trust-pipeline` | Run end-to-end trust pipeline for an agent action |
| 1017 | `amc simulate-bridge` | Run a simulated bridge request for local testing |
| 1018 | `amc snapshot` | Generate Unified Clarity Snapshot markdown |
| 1019 | `amc sso` | SSO setup shortcuts for OIDC and SAML providers |
| 1020 | `amc sso configure` | Configure an OIDC or SAML SSO provider |
| 1021 | `amc standard` | Open Compass Standard schema bundle and validation |
| 1022 | `amc standard generate` | Generate signed Open Compass schema bundle under .amc/standard/ |
| 1023 | `amc standard print` | Print one generated schema |
| 1024 | `amc standard schemas` | List generated schemas with digests |
| 1025 | `amc standard validate` | Validate a JSON file or AMC artifact against a standard schema |
| 1026 | `amc standard verify` | Verify schema bundle signatures and manifest digests |
| 1027 | `amc status` | Show AMC Studio and vault status |
| 1028 | `amc strategy` | Compare inference strategies and govern route changes |
| 1029 | `amc strategy compare` | Compare model/provider strategies with score, cost, latency, risk, and evidence |
| 1030 | `amc strategy list` | List inference strategy comparison runs |
| 1031 | `amc strategy rollback` | Roll back an accepted inference route change |
| 1032 | `amc strategy show` | Inspect an inference strategy comparison run |
| 1033 | `amc studio` | Studio API helpers |
| 1034 | `amc studio healthcheck` | Health/readiness probe for deployment runtime |
| 1035 | `amc studio lan` | LAN mode controls for Compass Console |
| 1036 | `amc studio lan disable` | Disable LAN mode and revert to localhost-only |
| 1037 | `amc studio lan enable` | Enable LAN mode with pairing gate |
| 1038 | `amc studio ping` | Ping local Studio API /health endpoint |
| 1039 | `amc studio start` | Start Studio in foreground (non-interactive, deployment-safe) |
| 1040 | `amc supervise` | Supervise any process and inject gateway routing env vars (no lease; for agents no adapter covers — otherwise prefer 'amc adapters run') |
| 1041 | `amc target` | Target profile operations |
| 1042 | `amc target diff` | Diff run against target profile |
| 1043 | `amc target set` | Interactive equalizer wizard |
| 1044 | `amc target verify` | Verify target profile signature |
| 1045 | `amc tenant-isolation-check` | Check tenant isolation between all registered tenants |
| 1046 | `amc tenant-register` | Register a tenant boundary |
| 1047 | `amc ticket` | Execution ticket operations |
| 1048 | `amc ticket issue` | Issue short-lived signed execution ticket |
| 1049 | `amc ticket verify` | Verify signed execution ticket |
| 1050 | `amc tools` | ToolHub tools config |
| 1051 | `amc tools init` | Create and sign .amc/tools.yaml |
| 1052 | `amc tools list` | List signed ToolHub tools grouped by provider context |
| 1053 | `amc tools verify` | Verify tools.yaml signature |
| 1054 | `amc trace` | Trace explorer — inspect agent execution traces, sessions, and tool calls |
| 1055 | `amc trace failures` | Show top recurring failure clusters mined from trace indexes |
| 1056 | `amc trace index` | List or inspect distilled trace failure indexes |
| 1057 | `amc trace inspect` | Inspect evidence events — show tool calls, decisions, and trust tiers |
| 1058 | `amc trace list` | List recent agent sessions with evidence summary |
| 1059 | `amc trace stats` | Show trace statistics — event counts by type, trust tier, tool usage |
| 1060 | `amc transform` | Transformation OS (4C plans, tracking, attestations) |
| 1061 | `amc transform attest` | - |
| 1062 | `amc transform attest-verify` | - |
| 1063 | `amc transform init` | Initialize signed .amc/transform-map.yaml |
| 1064 | `amc transform map` | Inspect or apply transform map |
| 1065 | `amc transform map apply` | - |
| 1066 | `amc transform map show` | - |
| 1067 | `amc transform plan` | - |
| 1068 | `amc transform report` | - |
| 1069 | `amc transform status` | - |
| 1070 | `amc transform track` | - |
| 1071 | `amc transform verify` | Verify signed transform map |
| 1072 | `amc transparency` | Append-only transparency log operations |
| 1073 | `amc transparency export` | Export transparency bundle |
| 1074 | `amc transparency init` | Initialize append-only transparency log |
| 1075 | `amc transparency merkle` | Merkle transparency root/proof operations |
| 1076 | `amc transparency merkle prove` | Export signed inclusion proof bundle for entry hash |
| 1077 | `amc transparency merkle rebuild` | Rebuild Merkle leaves/roots from transparency log |
| 1078 | `amc transparency merkle root` | Show current Merkle root and history |
| 1079 | `amc transparency merkle verify-proof` | Verify signed inclusion proof bundle |
| 1080 | `amc transparency report` | Generate an Agent Transparency Report — what the agent does, can access, and how trustworthy it is |
| 1081 | `amc transparency tail` | Tail transparency entries |
| 1082 | `amc transparency verify` | Verify transparency chain + seal signature |
| 1083 | `amc transparency verify-bundle` | Verify exported transparency bundle |
| 1084 | `amc trust` | Trust mode and Notary enforcement configuration |
| 1085 | `amc trust enable-notary` | Enable fail-closed NOTARY trust mode |
| 1086 | `amc trust freshness` | Report temporal trust freshness and half-life decay |
| 1087 | `amc trust init` | Create and sign .amc/trust.yaml — sets up the trust mode (SELF/NOTARY) that governs artifact signing |
| 1088 | `amc trust status` | Show trust mode, signature status, and notary health |
| 1089 | `amc truthguard` | Deterministic output truth-constraint validator |
| 1090 | `amc truthguard validate` | Validate structured agent output claims against deterministic truth constraints |
| 1091 | `amc tune` | Mechanic mode tuning wizard |
| 1092 | `amc unknowns` | List known unknowns for an agent's latest diagnostic run |
| 1093 | `amc up` | Start AMC control plane in one command (studio + gateway + bridge) |
| 1094 | `amc upgrade` | Generate upgrade plan |
| 1095 | `amc user` | Multi-user RBAC account management |
| 1096 | `amc user add` | Add a user with RBAC roles |
| 1097 | `amc user init` | Initialize signed users.yaml with first OWNER user |
| 1098 | `amc user list` | List RBAC users |
| 1099 | `amc user revoke` | Revoke a user account |
| 1100 | `amc user role` | Set user roles |
| 1101 | `amc user role set` | Replace roles for a user |
| 1102 | `amc user verify` | Verify users.yaml signature |
| 1103 | `amc value` | Value realization engine (contracts, scoring, ROI) |
| 1104 | `amc value contract` | Value contract operations |
| 1105 | `amc value contract apply` | Apply value contract from YAML/JSON file |
| 1106 | `amc value contract init` | Create and sign value contract template |
| 1107 | `amc value contract print` | Print value contract and signature status |
| 1108 | `amc value contract verify` | Verify value contract signature |
| 1109 | `amc value import` | Import numeric KPI points from CSV (ts,value) |
| 1110 | `amc value ingest` | Ingest value webhook payload JSON |
| 1111 | `amc value init` | Initialize signed value policy, default contract, and scheduler |
| 1112 | `amc value policy` | Value policy operations |
| 1113 | `amc value policy apply` | Apply signed value policy from YAML/JSON file |
| 1114 | `amc value policy default` | Print default value policy JSON |
| 1115 | `amc value policy print` | Print effective value policy JSON |
| 1116 | `amc value report` | Generate signed value report |
| 1117 | `amc value scheduler` | Value scheduler controls |
| 1118 | `amc value scheduler disable` | Disable value scheduler |
| 1119 | `amc value scheduler enable` | Enable value scheduler |
| 1120 | `amc value scheduler run-now` | Run value scheduler now |
| 1121 | `amc value scheduler status` | Show value scheduler status |
| 1122 | `amc value snapshot` | Generate/load latest signed value snapshot |
| 1123 | `amc value verify` | Verify value workspace signatures/artifacts |
| 1124 | `amc value verify-policy` | Verify signed value policy |
| 1125 | `amc vault` | Encrypted key vault operations |
| 1126 | `amc vault classify` | Classify data sensitivity level |
| 1127 | `amc vault dlp` | DLP scanner for PII and secrets |
| 1128 | `amc vault dlp scan` | Scan text for PII and secrets |
| 1129 | `amc vault dsar` | Persistent DSAR (Data Subject Access Request) workflow |
| 1130 | `amc vault dsar complete` | Mark a DSAR request complete and append an audit event |
| 1131 | `amc vault dsar list` | List persistent DSAR requests |
| 1132 | `amc vault dsar status` | Show a persistent DSAR request |
| 1133 | `amc vault dsar submit` | Submit a persistent DSAR request |
| 1134 | `amc vault dsar-status` | Show DSAR (Data Subject Access Request) status |
| 1135 | `amc vault forget` | Remove the remembered vault passphrase for this workspace (Keychain or credentials file) |
| 1136 | `amc vault init` | Initialize encrypted vault for signing keys |
| 1137 | `amc vault lock` | Lock vault and clear in-memory private keys |
| 1138 | `amc vault privacy-budget` | Check privacy budget for an agent |
| 1139 | `amc vault rag-guard` | Guard RAG chunks against injection |
| 1140 | `amc vault rotate-keys` | Rotate monitor signing key and append to public key history |
| 1141 | `amc vault scrub` | Scrub metadata from a file |
| 1142 | `amc vault secret-share` | Split a secret into shares using Shamir's Secret Sharing |
| 1143 | `amc vault status` | Show vault status |
| 1144 | `amc vault unlock` | Unlock vault into memory for signing operations |
| 1145 | `amc vault zk-commit` | Create a Pedersen commitment to a value |
| 1146 | `amc vault zk-range-proof` | Create a range commitment for an AMC score threshold (NOT a zero-knowledge proof; unsound, does not verify) |
| 1147 | `amc vault zk-verify` | Check a range commitment (NOT a zero-knowledge verification; unsound) |
| 1148 | `amc verify` | Verify integrity across AMC artifacts |
| 1149 | `amc verify all` | Verify trust/policies/plugins/logs/ledger/artifacts in one pass |
| 1150 | `amc vibe-audit` | Run static safety checks for AI-generated code |
| 1151 | `amc watch` | Observability, attestation, and safety testing |
| 1152 | `amc watch alerts` | Show recent alerts for a monitored agent |
| 1153 | `amc watch attest` | Attest an agent output |
| 1154 | `amc watch connect` | Connect to an observability provider (langfuse, helicone, otlp, datadog, webhook) |
| 1155 | `amc watch explain` | Generate explainability packet for an agent run |
| 1156 | `amc watch host-hardening` | Check host hardening status for this AMC deployment |
| 1157 | `amc watch profiler-anomalies` | List detected behavioral anomalies for an agent |
| 1158 | `amc watch profiler-start` | Start behavioral profiling for an agent |
| 1159 | `amc watch profiler-status` | Show behavioral profiler status and any recent anomalies |
| 1160 | `amc watch providers` | Show connected observability providers and trace stats |
| 1161 | `amc watch safety-test` | Run safety tests for an agent |
| 1162 | `amc watch start` | Start continuous production monitoring for an agent |
| 1163 | `amc watch status` | Show all monitored agents and their current state |
| 1164 | `amc whatif` | Equalizer what-if simulator |
| 1165 | `amc whatif equalizer` | - |
| 1166 | `amc whatif targets` | - |
| 1167 | `amc why-capped` | Show why each question is capped at its current level |
| 1168 | `amc wiring-status` | Show in-process production wiring counters (cannot observe other processes) |
| 1169 | `amc workorder` | Signed work order operations |
| 1170 | `amc workorder create` | Create and sign a work order |
| 1171 | `amc workorder expire` | Expire/revoke a work order |
| 1172 | `amc workorder list` | List work orders for agent |
| 1173 | `amc workorder show` | Show signed work order JSON |
| 1174 | `amc workorder verify` | Verify work order signature |
| 1175 | `amc wrap` | Wrap runtime and capture tamper-evident evidence (legacy; prefer 'amc adapters run', which also mints a lease and routes through the gateway) |

### Command Details

#### `amc action-queue`

Show prioritized actions sorted by risk-reduction-per-effort


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |

#### `amc adapters capabilities`

Issue a signed Passport receipt for declared and effective adapter capabilities


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--adapter <adapterId>` | - |
| `--out <path>` | - |
| `--json` | - |

#### `amc adapters configure`

Set adapter profile for an agent (signed adapters.yaml)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--adapter <adapterId>` | - |
| `--route <route>` | - |
| `--model <model>` | - |
| `--mode <mode>` | - |

#### `amc adapters env`

Print adapter-compatible environment exports without lease token


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--adapter <adapterId>` | - |

#### `amc adapters init-project`

Generate runnable local adapter sample for library-based frameworks


| Option | Description |
|--------|-------------|
| `--adapter <adapterId>` | - |
| `--agent <agentId>` | - |
| `--route <route>` | - |

#### `amc adapters run`

Run an agent under full observation: mints a lease, routes through the gateway, captures OBSERVED evidence (preferred over 'amc wrap' and 'amc supervise')


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--adapter <adapterId>` | - |
| `--workorder <workOrderId>` | - |
| `--mode <mode>` | - |

#### `amc advisory ack`

Acknowledge an advisory


| Option | Description |
|--------|-------------|
| `--note <text>` | - |
| `--by <name>` | - |

#### `amc advisory list`

List advisories for scope


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <targetId>` | - |

#### `amc agent diagnose`

Lease-auth self-run diagnostic (agent-triggered, evidence-scored server-side)


| Option | Description |
|--------|-------------|
| `--token-file <file>` | - |
| `--studio <url>` | - |

#### `amc agent harness`

Run the autonomous improvement harness loop


| Option | Description |
|--------|-------------|
| `--type <type>` | - |
| `--iterations <n>` | - |
| `--target <score>` | - |

#### `amc agent run`

Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract)


| Option | Description |
|--------|-------------|
| `--input <input>` | - |

#### `amc alert config`

Configure alert destinations (webhooks, Slack, PagerDuty)


| Option | Description |
|--------|-------------|
| `--set-webhook <url>` | - |
| `--set-slack <url>` | - |
| `--set-pagerduty <key>` | - |
| `--show` | - |
| `--json` | - |

#### `amc alert send`

Send an alert to a webhook endpoint


| Option | Description |
|--------|-------------|
| `--url <url>` | - |
| `--message <text>` | - |
| `--severity <level>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc alert watch`

Watch for anomalies and auto-send alerts to configured destinations


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--interval <seconds>` | - |

#### `amc api key create`

Create a programmatic API key and show the secret once


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--label <label>` | - |
| `--expires-in <duration>` | - |
| `--json` | - |

#### `amc api key list`

List programmatic API keys without printing secrets


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc api key revoke`

Revoke a programmatic API key


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc api start`

Start the AMC API server (alias for 'amc up')


| Option | Description |
|--------|-------------|
| `--port <port>` | - |

#### `amc approvals approve`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--mode <simulate|execute>` | - |
| `--reason <text>` | - |
| `--username <username>` | - |
| `--roles <roles>` | - |
| `--user-id <userId>` | - |

#### `amc approvals deny`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <text>` | - |
| `--username <username>` | - |
| `--roles <roles>` | - |
| `--user-id <userId>` | - |

#### `amc approvals list`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--status <status>` | - |
| `--query <requestId>` | - |
| `--action-class <class>` | - |
| `--risk-tier <tier>` | - |
| `--effective-mode <mode>` | - |
| `--created-after <timestamp>` | - |
| `--created-before <timestamp>` | - |
| `--order <order>` | - |
| `--limit <count>` | - |
| `--json` | - |

#### `amc approvals show`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc archetype apply`

Apply archetype context/targets/guardrails/evals to an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc assurance advanced-threats`

Run advanced threats assurance pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc assurance cert-issue`

Issue signed assurance certificate for a run


| Option | Description |
|--------|-------------|
| `--run <id>` | - |
| `--out <file.amccert>` | - |

#### `amc assurance compound-threats`

Run compound threat assurance pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc assurance history`

List assurance run history


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc assurance patch`

Apply deterministic patch kit for failed assurance findings


| Option | Description |
|--------|-------------|
| `--assuranceRun <id>` | - |
| `--agent <agentId>` | - |
| `--apply` | - |

#### `amc assurance policy-apply`

Apply assurance policy from YAML/JSON file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc assurance run`

Run assurance pack(s) with deterministic validation


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--pack <packId>` | - |
| `--all` | - |
| `--demo` | - |
| `--mode <mode>` | - |
| `--window <window>` | - |
| `--window-days <days>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--verbose` | - |
| `--model <modelId>` | - |
| `--no-sign` | - |

#### `amc assurance show`

Show assurance run artifacts


| Option | Description |
|--------|-------------|
| `--run <id>` | - |

#### `amc assurance shutdown-compliance`

Run shutdown compliance pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc assurance toctou`

Run TOCTOU assurance pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc assurance verify`

Verify assurance run determinism and signatures


| Option | Description |
|--------|-------------|
| `--assuranceRun <id>` | - |
| `--agent <agentId>` | - |

#### `amc assurance waiver request`

Request time-limited readiness waiver (dual-control approval required)


| Option | Description |
|--------|-------------|
| `--hours <n>` | - |
| `--reason <text>` | - |
| `--agent <id>` | - |

#### `amc assurance waiver revoke`

Revoke active or specific waiver


| Option | Description |
|--------|-------------|
| `--waiver <id>` | - |

#### `amc attest`

Auditor-attest an ingest session to upgrade trust tier to ATTESTED


| Option | Description |
|--------|-------------|
| `--ingest-session <id>` | - |
| `--attested-by <identity>` | - |
| `--statement <text>` | - |
| `--agent <agentId>` | - |

#### `amc attestation-export`

Export attestation bundle for external auditors


| Option | Description |
|--------|-------------|
| `--tenant <id>` | - |

#### `amc audit binder create`

Create deterministic signed .amcaudit artifact


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--out <file.amcaudit>` | - |
| `--id <id>` | - |
| `--request-id <id>` | - |

#### `amc audit binder export-execute`

Execute previously approved external binder export


| Option | Description |
|--------|-------------|
| `--approval <id>` | - |

#### `amc audit binder export-request`

Create dual-control approval request for external binder sharing


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--agent <agentId>` | - |
| `--out <file.amcaudit>` | - |
| `--id <id>` | - |
| `--request-id <id>` | - |

#### `amc audit binder verify`

Verify .amcaudit file


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc audit export`

Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--output <path>` | - |
| `--limit <n>` | - |

#### `amc audit map apply`

Apply active audit map from file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc audit map show`

Show audit map


| Option | Description |
|--------|-------------|
| `--id <id>` | - |

#### `amc audit policy apply`

Apply and sign audit policy from file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc audit request approve`

Owner approves request (starts dual-control approval flow)


| Option | Description |
|--------|-------------|
| `--actor <id>` | - |
| `--reason <text>` | - |

#### `amc audit request create`

Create auditor evidence request


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--items <csv>` | - |
| `--id <id>` | - |
| `--requester <id>` | - |

#### `amc audit request fulfill`

Fulfill approved evidence request by exporting restricted binder


| Option | Description |
|--------|-------------|
| `--out <file.amcaudit>` | - |

#### `amc audit scheduler run-now`

Run audit binder cache refresh immediately


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc audit-packet`

Generate external-auditor packet with verifier-ready evidence


| Option | Description |
|--------|-------------|
| `--output <file>` | - |
| `--agent <agentId>` | - |
| `--no-include-chain` | - |
| `--no-include-rationale` | - |

#### `amc backup create`

Create signed encrypted backup bundle


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc backup restore`

Restore a verified backup into target directory


| Option | Description |
|--------|-------------|
| `--to <dir>` | - |
| `--force` | - |

#### `amc backup verify`

Verify signed backup bundle offline


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc badge`

Generate maturity badge for README/docs (markdown, HTML, or URL)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--level <0-5>` | - |
| `--score <0-100>` | - |
| `--format <format>` | - |

#### `amc bench compare`

Compute local vs imported ecosystem comparison


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--against <mode>` | - |

#### `amc bench create`

Create deterministic signed .amcbench artifact


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--out <file.amcbench>` | - |
| `--id <id>` | - |
| `--window-days <n>` | - |
| `--named` | - |
| `--industry <value>` | - |
| `--agent-type <value>` | - |
| `--deployment <value>` | - |

#### `amc bench import`

Import one bench artifact from allowlisted registry


| Option | Description |
|--------|-------------|
| `--registry-id <id>` | - |
| `--bench <benchId@version|benchId@latest>` | - |

#### `amc bench publish execute`

-


| Option | Description |
|--------|-------------|
| `--approval-request <id>` | - |

#### `amc bench publish request`

-


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--file <bench.amcbench>` | - |
| `--registry <dir>` | - |
| `--registry-key <file>` | - |
| `--ack` | - |

#### `amc bench registries-apply`

Apply bench registries config from JSON file


| Option | Description |
|--------|-------------|
| `--in <file>` | - |

#### `amc bench registry init`

-


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--id <id>` | - |
| `--name <name>` | - |

#### `amc bench registry publish`

-


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--file <bench.amcbench>` | - |
| `--registry-key <file>` | - |
| `--version <version>` | - |

#### `amc bench registry serve`

-


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--port <port>` | - |
| `--host <host>` | - |

#### `amc bench registry verify`

-


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |

#### `amc bench search`

Browse a bench registry index


| Option | Description |
|--------|-------------|
| `--registry <pathOrUrl>` | - |
| `--query <text>` | - |

#### `amc bench verify`

Verify .amcbench artifact offline


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc benchmark compare`

Compare benchmark results between two agents head-to-head


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--out <path>` | - |

#### `amc benchmark export`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--run <runId>` | - |
| `--out <file.amcbench>` | - |
| `--publisher <org>` | - |
| `--public-agent-id <id>` | - |

#### `amc benchmark list`

-


| Option | Description |
|--------|-------------|
| `--sort <field>` | - |
| `--limit <n>` | - |

#### `amc benchmark provider-drift`

Run provider/model canary drift benchmark with score, refusal, latency, and cost thresholds


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--agent <agentId>` | - |
| `--json` | - |
| `--out <path>` | - |

#### `amc benchmark replay-corpus`

Run a replayable benchmark corpus with optional multi-turn tool-risk ASR checks


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--agent <agentId>` | - |
| `--json` | - |
| `--out <path>` | - |

#### `amc benchmark report`

-


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--group-by <groupBy>` | - |

#### `amc benchmark run`

Run standard benchmark suite (latency, accuracy, safety, cost-efficiency, reliability) against an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |
| `--out <path>` | - |

#### `amc benchmark stats`

-


| Option | Description |
|--------|-------------|
| `--group-by <groupBy>` | - |

#### `amc blobs reencrypt`

Re-encrypt blob batch from one key version to another


| Option | Description |
|--------|-------------|
| `--from <version>` | - |
| `--to <version>` | - |
| `--limit <n>` | - |

#### `amc bom generate`

-


| Option | Description |
|--------|-------------|
| `--run <runId|latest>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc bom sign`

-


| Option | Description |
|--------|-------------|
| `--in <file>` | - |
| `--out <file>` | - |

#### `amc bom verify`

-


| Option | Description |
|--------|-------------|
| `--in <file>` | - |
| `--sig <file>` | - |
| `--pubkey <file>` | - |

#### `amc bootstrap`

Bootstrap workspace for production deployment (non-interactive)


| Option | Description |
|--------|-------------|
| `--workspace <path>` | - |

#### `amc budgets init`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc budgets reset`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--day <yyyy-mm-dd>` | - |

#### `amc budgets status`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc bundle export`

Export a portable, signed evidence bundle for a run


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc business fair-scenario`

Run a FAIR-style calibrated loss-distribution scenario


| Option | Description |
|--------|-------------|
| `--scenario <id>` | - |
| `--agent <agentId>` | - |
| `--maturity <level>` | - |
| `--frequency-min <n>` | - |
| `--frequency-most-likely <n>` | - |
| `--frequency-max <n>` | - |
| `--loss-min <amount>` | - |
| `--loss-most-likely <amount>` | - |
| `--loss-max <amount>` | - |
| `--risk-appetite <amount>` | - |
| `--iterations <n>` | - |
| `--seed <n>` | - |
| `--currency <code>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--json` | - |

#### `amc business grc-export`

Export a GRC treatment-plan register from portfolio maturity risk inputs


| Option | Description |
|--------|-------------|
| `--portfolio <path>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--currency <code>` | - |
| `--title <title>` | - |
| `--treatment-due-days <days>` | - |
| `--json` | - |

#### `amc business heatmap`

Build a portfolio financial risk heatmap from maturity, likelihood, impact, and appetite


| Option | Description |
|--------|-------------|
| `--portfolio <path>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--currency <code>` | - |
| `--title <title>` | - |
| `--json` | - |

#### `amc business kpi`

Show business KPIs correlated with maturity levels


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc business report`

Generate business impact report with maturity correlation


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc business risk`

Quantify maturity-linked incident frequency and expected annual loss


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--maturity <level>` | - |
| `--baseline-frequency <n>` | - |
| `--incident-cost <amount>` | - |
| `--risk-appetite <amount>` | - |
| `--currency <code>` | - |
| `--json` | - |

#### `amc business roi`

Estimate first-year ROI and cost of a trust gap from maturity improvement


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--current-maturity <level>` | - |
| `--target-maturity <level>` | - |
| `--baseline-frequency <n>` | - |
| `--incident-cost <amount>` | - |
| `--annual-control-cost <amount>` | - |
| `--implementation-cost <amount>` | - |
| `--risk-appetite <amount>` | - |
| `--currency <code>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--json` | - |

#### `amc business track`

Record a business outcome event (incident, audit finding, cost)


| Option | Description |
|--------|-------------|
| `--type <type>` | - |
| `--agent <agentId>` | - |
| `--description <text>` | - |
| `--value <n>` | - |
| `--severity <level>` | - |
| `--json` | - |

#### `amc canary-report`

Generate full policy canary report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc canary-start`

Start a policy canary with candidate vs stable policy


| Option | Description |
|--------|-------------|
| `--candidate-sha <sha256>` | - |
| `--stable-sha <sha256>` | - |
| `--enforce-pct <n>` | - |
| `--duration <ms>` | - |
| `--failure-threshold <ratio>` | - |
| `--auto-promote` | - |

#### `amc casebook add`

Add signed case from existing workorder


| Option | Description |
|--------|-------------|
| `--casebook <id>` | - |
| `--from-workorder <id>` | - |
| `--agent <agentId>` | - |

#### `amc casebook init`

Create a signed casebook


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--casebook <id>` | - |

#### `amc casebook list`

List casebooks


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc casebook verify`

Verify signed casebook and case files


| Option | Description |
|--------|-------------|
| `--casebook <id>` | - |
| `--agent <agentId>` | - |

#### `amc cert generate`

Generate execution-proof trust certificate (signed PDF or JSON)


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--output <path>` | - |
| `--valid-days <n>` | - |
| `--no-sign` | - |
| `--preview` | - |
| `--badge` | - |
| `--url` | - |
| `--base-url <url>` | - |

#### `amc cert revoke`

Create signed revocation file for a certificate


| Option | Description |
|--------|-------------|
| `--reason <text>` | - |
| `--cert <file>` | - |
| `--out <file>` | - |

#### `amc cert verify`

Verify any AMC certificate offline (.amccert bundle or trust-certificate JSON)


| Option | Description |
|--------|-------------|
| `--revocation <path>` | - |

#### `amc certify`

Issue signed, offline-verifiable certificate bundle


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--policy <path>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc cgx build`

Build deterministic signed context graph


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc cgx code-scan`

Scan repository for semantic code edges


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--path <repoPath>` | - |

#### `amc cgx diff`

Diff two CGX graph snapshots


| Option | Description |
|--------|-------------|
| `--run-a <id>` | - |
| `--run-b <id>` | - |
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--json` | - |

#### `amc cgx show`

Show latest CGX graph or agent context pack


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--format <format>` | - |

#### `amc cgx simulate`

Simulate impact propagation when a node changes


| Option | Description |
|--------|-------------|
| `--change <nodeId>` | - |
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--max-depth <n>` | - |
| `--json` | - |

#### `amc cgx-integrity`

Run graph integrity check on CGX with semantic overlay


| Option | Description |
|--------|-------------|
| `--max-contradictions <n>` | - |

#### `amc cgx-propagation`

Simulate risk propagation from a source node


| Option | Description |
|--------|-------------|
| `--max-depth <n>` | - |

#### `amc ci check`

One-liner CI gate: quickscore + threshold check (exit 1 if below)

Alias: `amc gate`

| Option | Description |
|--------|-------------|
| `--min-score <n>` | - |
| `--min-level <level>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc ci init`

Generate GitHub workflow and gate policy


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--no-sign` | - |

#### `amc ci print`

Print suggested CI pipeline steps


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc ci redteam`

CI gate: run red-team plugins, optional Evil MCP, and score-gaming resistance checks


| Option | Description |
|--------|-------------|
| `--plugins <ids...>` | - |
| `--strategies <ids...>` | - |
| `--min-score <n>` | - |
| `--max-vulnerabilities <n>` | - |
| `--max-critical <n>` | - |
| `--max-high <n>` | - |
| `--evil-mcp` | - |
| `--mcp-attacks <categories...>` | - |
| `--min-mcp-score <n>` | - |
| `--no-gaming-resistance` | - |
| `--min-gaming-score <n>` | - |
| `--no-sign` | - |
| `--json` | - |

#### `amc claim-confidence`

Generate per-claim confidence report with citation-backed scoring


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc claim-confidence-gate`

Check if claims for given questions pass confidence threshold


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--questions <ids>` | - |

#### `amc claims list`

List all evidence claims with TTL status


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc claims-stale`

List stale claims for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc claims-sweep`

Process all stale claims for an agent (auto-demote to PROVISIONAL)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc classify agent`

Classify whether system is workflow or agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc commands`

Generate the live AMC CLI command inventory from the registered command map


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--markdown` | - |
| `--include-internal` | - |
| `--out <path>` | - |

#### `amc commit`

Commitment plan flow (7/14/30-day checklist)


| Option | Description |
|--------|-------------|
| `--target <name>` | - |
| `--days <n>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc comms-check`

Check a message/communication against compliance policies (lightweight communications firewall)


| Option | Description |
|--------|-------------|
| `--text <message>` | - |
| `--domain <domain>` | - |
| `--json` | - |

#### `amc compare`

Compare two runs OR multiple models (side-by-side evaluation)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |
| `--target <name>` | - |
| `--iterations <n>` | - |
| `--output <path>` | - |
| `--json` | - |
| `--badge` | - |
| `--format <fmt>` | - |

#### `amc compare-models`

Run the same agent evaluation across multiple models and show comparison matrix


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |
| `--target <name>` | - |
| `--iterations <n>` | - |
| `--output <path>` | - |
| `--json` | - |

#### `amc compliance`

Evidence-linked compliance map operations

Alias: `amc comply`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc compliance diff`

Diff two compliance report JSON files

Alias: `amc comply diff`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc compliance fleet`

Generate fleet compliance summary

Alias: `amc comply fleet`

| Option | Description |
|--------|-------------|
| `--framework <framework>` | - |
| `--window <window>` | - |
| `--out <path>` | - |

#### `amc compliance init`

Create and sign compliance-maps.yaml

Alias: `amc comply init`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc compliance matrix`

Generate multi-framework compliance coverage matrix with gap analysis

Alias: `amc comply matrix`

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |
| `--frameworks <fws...>` | - |
| `--out <path>` | - |
| `--json` | - |
| `--heatmap` | - |

#### `amc compliance regulatory-check`

Check for regulatory changes from configured feeds

Alias: `amc comply regulatory-check`

| Option | Description |
|--------|-------------|
| `--framework <name>` | - |
| `--json` | - |

#### `amc compliance regulatory-feeds`

List all configured regulatory feed sources

Alias: `amc comply regulatory-feeds`

| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc compliance regulatory-gap`

Run gap analysis against current AMC configuration

Alias: `amc comply regulatory-gap`

| Option | Description |
|--------|-------------|
| `--framework <name>` | - |
| `--json` | - |

#### `amc compliance report`

Generate evidence-linked compliance report

Alias: `amc comply report`

| Option | Description |
|--------|-------------|
| `--framework <framework>` | - |
| `--window <window>` | - |
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc compliance risk-classify`

Classify agent into EU AI Act risk tiers (UNACCEPTABLE / HIGH / LIMITED / MINIMAL)

Alias: `amc comply risk-classify`

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--capabilities <json>` | - |
| `--biometric` | - |
| `--critical-infra` | - |
| `--education` | - |
| `--employment` | - |
| `--essential-services` | - |
| `--law-enforcement` | - |
| `--migration` | - |
| `--justice` | - |
| `--realtime-biometric` | - |
| `--social-scoring` | - |
| `--subliminal` | - |
| `--exploits-vulnerabilities` | - |
| `--emotion-recognition` | - |
| `--chatbot` | - |
| `--synthetic-content` | - |
| `--human-interaction` | - |
| `--safety-component` | - |
| `--json` | - |

#### `amc compliance roadmap`

Generate step-by-step compliance plan for a framework

Alias: `amc comply roadmap`

| Option | Description |
|--------|-------------|
| `--framework <framework>` | - |
| `--agent <agentId>` | - |
| `--capabilities <json>` | - |
| `--risk-tier <tier>` | - |
| `--out <path>` | - |
| `--json` | - |

#### `amc compliance verify`

Verify compliance maps signature

Alias: `amc comply verify`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc composition`

Inspect the declarative plugin composition (amc.cordis.yml)


| Option | Description |
|--------|-------------|
| `--config <path>` | - |
| `--json` | - |

#### `amc confidence calibration`

Show calibration report


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc confidence drift`

Show drift trend


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc confidence-components`

Show per-component confidence breakdown


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |

#### `amc confidence-drift`

Track confidence drift per question across diagnostic runs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |

#### `amc config explain`

Explain config source precedence and risky settings


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc config init`

Write a starter amcconfig.yaml


| Option | Description |
|--------|-------------|
| `--output <path>` | - |
| `--force` | - |

#### `amc config print`

Print resolved runtime config (secret-safe)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc config run`

Run the evaluation pipeline declared in amcconfig.yaml


| Option | Description |
|--------|-------------|
| `--config <path>` | - |
| `--window <window>` | - |
| `--format <format>` | - |
| `--output <path>` | - |
| `--dry-run` | - |
| `--verbose` | - |
| `--json` | - |

#### `amc config validate`

Validate amcconfig.yaml without running anything


| Option | Description |
|--------|-------------|
| `--config <path>` | - |

#### `amc connect`

Connect an agent runtime and track first action, decision, and proof


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--adapter <adapterId>` | - |
| `--token-file <path>` | - |
| `--bridge-url <url>` | - |
| `--mode <mode>` | - |
| `--status` | - |
| `--json` | - |
| `--print-env` | - |
| `--print-cmd` | - |

#### `amc connect hooks health`

Verify signed hook setup and show the latest verified provider event


| Option | Description |
|--------|-------------|
| `--provider <provider>` | - |
| `--json` | - |

#### `amc connect hooks install`

Install a reversible project hook for Claude Code or Gemini CLI


| Option | Description |
|--------|-------------|
| `--provider <provider>` | - |
| `--mode <mode>` | - |
| `--agent <agentId>` | - |
| `--bridge-url <url>` | - |
| `--ttl <ttl>` | - |
| `--rpm <rpm>` | - |
| `--dry-run` | - |
| `--json` | - |

#### `amc connect hooks lifecycle`

Verify one requested, controlled, and terminal provider action lifecycle


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--action <actionId>` | - |
| `--json` | - |

#### `amc connect hooks remove`

Remove only the signed AMC-owned hook and revoke its lease


| Option | Description |
|--------|-------------|
| `--provider <provider>` | - |
| `--dry-run` | - |
| `--json` | - |

#### `amc connect hooks status`

Verify provider config ownership, mode, signed manifest, and hook lease


| Option | Description |
|--------|-------------|
| `--provider <provider>` | - |
| `--json` | - |

#### `amc control-classification`

Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc correction add`

Add a human correction/feedback for an agent


| Option | Description |
|--------|-------------|
| `--questions <qids>` | - |
| `--description <text>` | - |
| `--action <text>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc correction effectiveness`

Show correction effectiveness metrics


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc correction list`

List corrections for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--status <status>` | - |
| `--json` | - |

#### `amc correction report`

Generate feedback closure report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc corrections-verify-closure`

Show open feedback loops that need closure


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |

#### `amc costs show`

Show cost report for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <days>` | - |
| `--json` | - |

#### `amc dag capture`

Capture orchestration DAG for agents


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc dag score`

Score DAG governance


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc dashboard build`

Build responsive offline dashboard for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--out <dir>` | - |

#### `amc dashboard open`

Build and serve dashboard at localhost:3210


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--port <port>` | - |
| `--view <view>` | - |
| `--no-open` | - |

#### `amc dashboard serve`

Serve dashboard locally


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--port <port>` | - |
| `--out <dir>` | - |

#### `amc dashboard view`

Build and open web UI showing maturity scores, test results, and comparison matrix with shareable URLs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--port <port>` | - |
| `--out <dir>` | - |
| `--no-open` | - |

#### `amc dataset add-case`

Add a test case to a dataset


| Option | Description |
|--------|-------------|
| `--prompt <text>` | - |
| `--expected <text>` | - |
| `--not-expected <text>` | - |
| `--tags <tags>` | - |
| `--weight <n>` | - |
| `--assertion <type>` | - |
| `--json` | - |

#### `amc dataset create`

Create a new evaluation dataset


| Option | Description |
|--------|-------------|
| `--description <text>` | - |
| `--category <cat>` | - |

#### `amc dataset import`

Import test cases from CSV/JSON file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc dataset list`

List all evaluation datasets


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc dataset run`

Run a dataset against an agent (via gateway proxy)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--endpoint <url>` | - |
| `--model <model>` | - |
| `--json` | - |

#### `amc debt-add`

Add a policy debt entry (waiver/override/exception)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--type <type>` | - |
| `--reason <reason>` | - |
| `--expiry <expiry>` | - |
| `--policies <policies>` | - |
| `--risk <risk>` | - |
| `--created-by <who>` | - |

#### `amc debt-list`

List policy debt entries


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc debug`

Structured evidence debug stream for an agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--follow` | - |
| `--dimension <dimension>` | - |
| `--question <questionId>` | - |
| `--event-type <eventType>` | - |
| `--limit <n>` | - |
| `--poll-ms <ms>` | - |
| `--no-color` | - |

#### `amc delta-to-l5`

Generate L4→L5 delta report showing what separates current state from L5


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--json` | - |

#### `amc demo gap`

Scripted illustration of the 84-point documentation inflation gap (no agent is executed)


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--fast` | - |

#### `amc demo prospect`

Run a guided 5-minute prospect demo flow


| Option | Description |
|--------|-------------|
| `--share` | - |
| `--out <dir>` | - |
| `--slug <slug>` | - |
| `--public-base-url <url>` | - |
| `--live` | - |
| `--json` | - |

#### `amc demo run`

Run a simulated agent through the AMC gateway and produce a real score (~30s)


| Option | Description |
|--------|-------------|
| `--gateway <url>` | - |
| `--no-vault` | - |
| `--demo` | - |
| `--json` | - |

#### `amc demo share`

Generate a static client-facing prospect demo bundle


| Option | Description |
|--------|-------------|
| `--out <dir>` | - |
| `--slug <slug>` | - |
| `--public-base-url <url>` | - |
| `--live` | - |
| `--json` | - |

#### `amc diagnostic render`

Render contextualized 126-question diagnostic for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--format <format>` | - |
| `--out <file>` | - |

#### `amc dlp scan`

Scan text for PII and secrets


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--redact` | - |

#### `amc doctor`

Check runtime availability and wrap readiness


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--strict` | - |

#### `amc doctor-fix`

Auto-repair common setup issues


| Option | Description |
|--------|-------------|
| `--dry-run` | - |
| `--json` | - |

#### `amc domain`

Domain-specific architecture and compliance operations

Alias: `amc sector`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc domain apply`

Apply domain-specific guardrails and industry pack rules to an agent

Alias: `amc sector apply`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <domain>` | - |
| `--pack <packId>` | - |
| `--dry-run` | - |
| `--compliance <frameworks>` | - |
| `--file <path>` | - |
| `--audit` | - |
| `--responses <path>` | - |
| `--framework <id>` | - |
| `--audit-bundle <path>` | - |
| `--json` | - |

#### `amc domain assess`

Run full domain assessment

Alias: `amc sector assess`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <d>` | - |
| `--json` | - |

#### `amc domain assurance`

Run domain-specific assurance packs

Alias: `amc sector assurance`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <d>` | - |
| `--json` | - |

#### `amc domain gaps`

Show compliance gaps for an agent and domain

Alias: `amc sector gaps`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <d>` | - |
| `--json` | - |

#### `amc domain list`

List all 7 domains with metadata

Alias: `amc sector list`

| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc domain modules`

Show module activation map for domain

Alias: `amc sector modules`

| Option | Description |
|--------|-------------|
| `--domain <d>` | - |
| `--json` | - |

#### `amc domain pack`

Industry sector packs — 41 packs across 7 domains

Alias: `amc sector pack`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc domain pack access`

Show Industry Packs entitlement and public-checkout readiness

Alias: `amc subscribe`, `amc sector pack access`

| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc domain pack activate`

Activate Industry Packs with a valid issued license key

Alias: `amc sector pack activate`

| Option | Description |
|--------|-------------|
| `--key <licenseKey>` | - |
| `--expires-at <isoDate>` | - |
| `--json` | - |

#### `amc domain pack checkout`

Create a checkout link only when a verified provider is configured

Alias: `amc sector pack checkout`

| Option | Description |
|--------|-------------|
| `--success-url <url>` | - |
| `--cancel-url <url>` | - |
| `--email <email>` | - |
| `--reference <id>` | - |
| `--json` | - |

#### `amc domain pack describe`

Show details of a specific industry sector pack

Alias: `amc sector pack describe`

| Option | Description |
|--------|-------------|
| `--pack <packId>` | - |
| `--json` | - |

#### `amc domain pack list`

List all available industry sector packs

Alias: `amc sector pack list`

| Option | Description |
|--------|-------------|
| `--domain <d>` | - |
| `--json` | - |

#### `amc domain pack run`

Run an industry sector pack — interactive assessment or baseline score

Alias: `amc sector pack run`

| Option | Description |
|--------|-------------|
| `--pack <packId>` | - |
| `--baseline` | - |
| `--json` | - |

#### `amc domain pack verify`

Verify an Industry Packs license key

Alias: `amc sector pack verify`

| Option | Description |
|--------|-------------|
| `--key <licenseKey>` | - |
| `--json` | - |

#### `amc domain report`

Build full domain report and write it to a file

Alias: `amc sector report`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <d>` | - |
| `--output <file>` | - |
| `--json` | - |

#### `amc domain roadmap`

Generate 30/60/90-day roadmap for this domain

Alias: `amc sector roadmap`

| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--domain <d>` | - |
| `--json` | - |

#### `amc drift check`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--against <kind>` | - |

#### `amc drift report`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--out <file>` | - |

#### `amc e2e smoke`

Run go-live smoke tests: local, docker, or helm-template


| Option | Description |
|--------|-------------|
| `--mode <mode>` | - |
| `--workspace <path>` | - |
| `--repo-root <path>` | - |
| `--json` | - |

#### `amc emergency-override`

Activate an emergency policy override with strict TTL


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <reason>` | - |
| `--action <desc>` | - |
| `--ttl <ms>` | - |

#### `amc enforce ato-detect`

Detect account takeover attempts (demo)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce blind-secrets`

Redact secrets from text


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce check`

Check policy for an agent action


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce exec-guard`

Check if a command is safe to execute


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce formal-verify`

Formally verify safety properties using proof trees and certificates


| Option | Description |
|--------|-------------|
| `--property <name>` | - |
| `--all` | - |
| `--strategy <strategy>` | - |

#### `amc enforce numeric-check`

Validate a numeric value within bounds


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce resources apply`

Accept current resources as the new signed manifest; dry-run unless --yes is set

Alias: `amc activate`

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--yes` | - |
| `--force` | - |
| `--json` | - |

#### `amc enforce resources contract`

Show the AMC-native governed resource lifecycle contract


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce resources diff`

Diff two Enforce resource manifests, or a manifest against the current workspace


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--from <path>` | - |
| `--to <path>` | - |
| `--json` | - |

#### `amc enforce resources evaluate`

Evaluate a resource proposal against Enforce gates


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources get`

Alias for inspect: read one resource from an Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources history`

Show signed Enforce resource manifests, snapshots, and receipts


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc enforce resources inspect`

Inspect one resource in an Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources list`

List resources in an Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources propose`

Create a dry-run resource change proposal from the latest manifest to current workspace state


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources restore`

Restore resources from an Enforce snapshot; dry-run unless --apply is set


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--resource <idOrPath>` | - |
| `--apply` | - |
| `--include-immutable` | - |
| `--json` | - |

#### `amc enforce resources rollback`

Roll back to the signed previous version, or an explicit canonical snapshot


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--resource <idOrPath>` | - |
| `--apply` | - |
| `--include-immutable` | - |
| `--json` | - |

#### `amc enforce resources snapshot`

Write the current Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc enforce resources status`

Show the signed active, previous, rollback, drift, and integrity state


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc enforce resources validate`

Validate governed resource changes before accepting them


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce resources verify`

Verify the current workspace resources against an Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc enforce taint`

Track tainted input through the system


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc enforce tla-spec`

Generate a TLA+ specification for the AMC safety model


| Option | Description |
|--------|-------------|
| `--properties <list>` | - |
| `--output <path>` | - |

#### `amc enterprise audit-export`

Export audit trail in SIEM format


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--output <path>` | - |
| `--limit <count>` | - |
| `--signed` | - |

#### `amc eval import`

Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse, LangWatch) into signed AMC evidence


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--file <path>` | - |
| `--agent <agentId>` | - |
| `--trust-tier <tier>` | - |
| `--json` | - |

#### `amc eval registry`

Show signed metadata for existing AMC evaluators


| Option | Description |
|--------|-------------|
| `--refresh` | - |
| `--json` | - |

#### `amc eval run`

One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--output <path>` | - |
| `--window <window>` | - |
| `--agent <agentId>` | - |
| `--fail-on-error` | - |
| `--threshold <n>` | - |

#### `amc eval status`

Show imported eval coverage per AMC dimension


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |
| `--json` | - |

#### `amc evidence collect`

Guided wizard to connect your agent and capture evidence


| Option | Description |
|--------|-------------|
| `--first-run` | - |
| `--agent <agentId>` | - |
| `--runtime <runtime>` | - |
| `--dry-run` | - |

#### `amc evidence decisions inspect`

Inspect one decision receipt by receipt id or run id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence decisions list`

List persisted decision receipts


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence decisions observe`

Update open decision receipts with observed outcomes from a later full-score run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence episodes export`

Export one EpisodeRecord as JSON or Markdown


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--format <format>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc evidence episodes inspect`

Inspect one EpisodeRecord by episode id, lifecycle id, or run id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence episodes list`

List persisted EpisodeRecord evidence objects


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence export`

Export verifier-ready evidence (json|csv|pdf)


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |
| `--include-chain` | - |
| `--include-rationale` | - |

#### `amc evidence finding-proofs export`

Export finding proofs as JSON


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--run <runId>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc evidence finding-proofs inspect`

Inspect one finding proof by proof id, finding id, run id, or question id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence finding-proofs list`

List persisted finding proof chains


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence lifecycle export`

Export one lifecycle artifact as JSON


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc evidence lifecycle inspect`

Inspect one lifecycle artifact by lifecycle id or run id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence lifecycle list`

List persisted lifecycle run artifacts


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence lifecycle-receipts export`

Export lifecycle receipts as JSON


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--run <runId>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc evidence lifecycle-receipts inspect`

Inspect one lifecycle receipt by receipt id, run id, or lifecycle id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence lifecycle-receipts list`

List persisted lifecycle change receipts


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence observability inspect`

Inspect one observability lane record by observability id, lifecycle id, or run id


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc evidence observability list`

List persisted observability lane records


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc evidence verify`

Run full workspace verification suite


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc evidence-stores parity`

Compare the legacy guard-event store against the consolidated one


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc executive brief`

Generate a board-ready one-page executive brief from a diagnostic run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--run <runId>` | - |
| `--out <path>` | - |
| `--format <format>` | - |
| `--title <title>` | - |

#### `amc experiment analyze`

Analyze latest experiment run


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |
| `--out <path>` | - |
| `--agent <agentId>` | - |

#### `amc experiment create`

Create an experiment


| Option | Description |
|--------|-------------|
| `--name <name>` | - |
| `--casebook <id>` | - |
| `--agent <agentId>` | - |

#### `amc experiment gate`

Evaluate latest experiment run against gate policy


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |
| `--policy <path>` | - |
| `--agent <agentId>` | - |

#### `amc experiment gate-template`

Write an experiment gate policy template


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--preset <preset>` | - |

#### `amc experiment list`

List experiments


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc experiment optimize`

Create governed optimizer candidates from a Fixer RCA report


| Option | Description |
|--------|-------------|
| `--rca <selector>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc experiment optimizer-list`

List governed optimizer runs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc experiment optimizer-show`

Show a governed optimizer run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc experiment run`

Run deterministic experiment against signed casebook


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |
| `--mode <mode>` | - |
| `--agent <agentId>` | - |

#### `amc experiment set-baseline`

Set experiment baseline config


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |
| `--config <current|path>` | - |
| `--agent <agentId>` | - |

#### `amc experiment set-candidate`

Set experiment candidate signed config overlay


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |
| `--candidate-file <path>` | - |
| `--agent <agentId>` | - |

#### `amc experiment-architecture`

Run a controlled architecture comparison experiment


| Option | Description |
|--------|-------------|
| `--name <name>` | - |
| `--model <modelId>` | - |
| `--baseline-file <path>` | - |
| `--candidate-file <path>` | - |
| `--baseline-kind <kind>` | - |
| `--candidate-kind <kind>` | - |

#### `amc explain`

Plain-English explanation for a diagnostic question (example: AMC-2.1)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc export badge`

Export deterministic maturity badge SVG for a run


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc export grc`

Export the latest run as a GRC control-evidence manifest (Vanta/Drata/OneTrust-ingestible) + SARIF


| Option | Description |
|--------|-------------|
| `--framework <framework>` | - |
| `--out <file>` | - |
| `--sarif <file>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc export policy`

Export framework-agnostic North Star policy integration pack


| Option | Description |
|--------|-------------|
| `--target <name>` | - |
| `--out <dir>` | - |
| `--agent <agentId>` | - |

#### `amc federate export`

Export offline federation sync package (.amcfed)


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc federate init`

Initialize federation identity and signed config


| Option | Description |
|--------|-------------|
| `--org <name>` | - |

#### `amc federate peer add`

Add a peer publisher public key


| Option | Description |
|--------|-------------|
| `--peerId <id>` | - |
| `--name <name>` | - |
| `--pubkey <file>` | - |

#### `amc firewall check`

Evaluate a request or response payload against Runtime Firewall


| Option | Description |
|--------|-------------|
| `--text <text>` | - |
| `--direction <direction>` | - |
| `--agent <id>` | - |
| `--provider <name>` | - |
| `--model <name>` | - |
| `--route <path>` | - |
| `--method <method>` | - |
| `--run <runId>` | - |
| `--episode <episodeId>` | - |
| `--lifecycle-run <id>` | - |
| `--bridge-request <id>` | - |
| `--require-policy` | - |
| `--no-record` | - |
| `--json` | - |

#### `amc firewall disable`

Disable Runtime Firewall for this workspace


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc firewall enable`

Enable Runtime Firewall in observe, warn, or block mode


| Option | Description |
|--------|-------------|
| `--mode <mode>` | - |
| `--fail-open` | - |
| `--json` | - |

#### `amc firewall events`

List Runtime Firewall decision events


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc firewall export`

Export Runtime Firewall decisions for SIEM or audit review


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--format <format>` | - |
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc firewall migrate-signature`

Preserve and journal an existing verified Runtime Firewall policy


| Option | Description |
|--------|-------------|
| `--approve-legacy-kind` | - |
| `--json` | - |

#### `amc firewall status`

Show Runtime Firewall policy and signed rollout counters


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fix`

Score your agent, explain the top gaps in plain language, and write guardrail fixes into your agent's own config file


| Option | Description |
|--------|-------------|
| `--yes` | - |
| `--dry-run` | - |
| `--interactive` | - |
| `--agent <id>` | - |
| `--target <level>` | - |
| `--target-level <level>` | - |
| `--framework <name>` | - |
| `--ci` | - |
| `--file <path>` | - |
| `--json` | - |

#### `amc fix-signatures`

Verify and re-sign gateway/fleet/agent configs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc fleet contradictions`

Detect cross-agent contradictions


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--window <window>` | - |
| `--min-delta <n>` | - |

#### `amc fleet dag`

Visualize orchestration delegation graph


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--window <window>` | - |

#### `amc fleet graph list`

List saved typed multi-agent graphs


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet graph show`

Inspect the latest typed multi-agent graph


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet graph validate`

Validate the latest typed multi-agent graph


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet graph write`

Write the latest typed multi-agent graph from a JSON file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc fleet handoff`

Manage handoff packets


| Option | Description |
|--------|-------------|
| `--from <id>` | - |
| `--to <id>` | - |
| `--goal <goal>` | - |
| `--mode <mode>` | - |
| `--packet <packetId>` | - |
| `--receiver <id>` | - |
| `--refuse <reason>` | - |

#### `amc fleet health`

Show fleet health dashboard aggregates


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet init`

Create and sign .amc/fleet.yaml


| Option | Description |
|--------|-------------|
| `--org <name>` | - |

#### `amc fleet lifecycle list`

List parent fleet lifecycle artifacts


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc fleet lifecycle show`

Inspect one parent fleet lifecycle artifact


| Option | Description |
|--------|-------------|
| `--redacted` | - |
| `--json` | - |

#### `amc fleet overview`

One-shot executive fleet summary with verdict, coverage, drift, and next actions


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet policy apply`

Apply a governance policy to all fleet agents or one environment


| Option | Description |
|--------|-------------|
| `--policy-id <id>` | - |
| `--description <text>` | - |
| `--min-integrity <n>` | - |
| `--dimension-min <rules>` | - |
| `--env <environment>` | - |

#### `amc fleet report`

Generate fleet maturity report (md) or fleet compliance report (pdf)


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--format <format>` | - |
| `--output <path>` | - |

#### `amc fleet score`

Score multiple agents in one run with fleet-wide aggregates, weak-link detection, and pairwise comparison


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--agents <ids>` | - |
| `--all` | - |
| `--sla <duration>` | - |
| `--concurrency <n>` | - |
| `--max-comparisons <n>` | - |
| `--stream` | - |
| `--out <path>` | - |
| `--md` | - |
| `--json` | - |

#### `amc fleet slo define`

Define a fleet SLO, e.g. "95% of production agents must score L3+ on dimension 2"


| Option | Description |
|--------|-------------|
| `--objective <text>` | - |
| `--id <sloId>` | - |

#### `amc fleet status`

Show fleet overview (agent count, average score, health)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc fleet tag`

Tag an agent with an environment


| Option | Description |
|--------|-------------|
| `--env <environment>` | - |

#### `amc fleet trust-add-edge`

Add a delegation edge (orchestrator → worker)


| Option | Description |
|--------|-------------|
| `--from <agentId>` | - |
| `--to <agentId>` | - |
| `--purpose <purpose>` | - |
| `--risk <tier>` | - |
| `--mode <mode>` | - |
| `--weight <n>` | - |

#### `amc fleet trust-graph`

Render delegation trust graph as Mermaid, DOT, or JSON


| Option | Description |
|--------|-------------|
| `--format <format>` | - |
| `--out <path>` | - |

#### `amc fleet trust-mode`

Set trust inheritance policy mode


| Option | Description |
|--------|-------------|
| `--mode <mode>` | - |

#### `amc fleet trust-receipts`

Verify cross-agent receipt chains


| Option | Description |
|--------|-------------|
| `--window <window>` | - |

#### `amc fleet trust-report`

Generate trust composition report across fleet


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--output <path>` | - |
| `--no-sign` | - |

#### `amc forecast latest`

Render latest forecast for scope


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <targetId>` | - |
| `--out <path>` | - |

#### `amc forecast policy apply`

Apply and sign forecast policy from file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc forecast refresh`

Refresh forecast snapshot for scope


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <targetId>` | - |
| `--out <path>` | - |

#### `amc forecast scheduler run-now`

Run scheduler refresh immediately


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <targetId>` | - |

#### `amc fp-cost`

Show false positive cost summary


| Option | Description |
|--------|-------------|
| `--pack <id>` | - |

#### `amc fp-list`

List false positive reports


| Option | Description |
|--------|-------------|
| `--pack <id>` | - |
| `--status <status>` | - |

#### `amc fp-resolve`

Resolve a false positive report


| Option | Description |
|--------|-------------|
| `--id <reportId>` | - |
| `--status <status>` | - |
| `--reason <text>` | - |

#### `amc fp-submit`

Submit a false positive report for an assurance scenario


| Option | Description |
|--------|-------------|
| `--scenario <id>` | - |
| `--pack <id>` | - |
| `--run <id>` | - |
| `--justification <text>` | - |
| `--reporter <name>` | - |

#### `amc fp-tuning-report`

Generate false positive tuning report with recommendations


| Option | Description |
|--------|-------------|
| `--window <days>` | - |
| `--threshold <rate>` | - |

#### `amc framework-guide`

Framework-specific governance guidance


| Option | Description |
|--------|-------------|
| `--framework <name>` | - |
| `--list` | - |
| `--json` | - |

#### `amc freeze lift`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--incident <id>` | - |
| `--reason <text>` | - |

#### `amc freeze status`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc gate`

Evaluate a run bundle against a gate policy


| Option | Description |
|--------|-------------|
| `--bundle <file>` | - |
| `--policy <path>` | - |
| `--no-sign` | - |

#### `amc gateway bind-agent`

Bind a gateway route prefix to an agent ID for deterministic attribution


| Option | Description |
|--------|-------------|
| `--route <prefix>` | - |
| `--agent <agentId>` | - |
| `--config <path>` | - |

#### `amc gateway init`

Create and sign .amc/gateway.yaml


| Option | Description |
|--------|-------------|
| `--provider <name>` | - |
| `--base-url <url>` | - |
| `--auth-type <type>` | - |
| `--env <name>` | - |
| `--header <name>` | - |
| `--param <name>` | - |

#### `amc gateway start`

Start local reverse-proxy gateway and signed evidence capture


| Option | Description |
|--------|-------------|
| `--config <path>` | - |

#### `amc gateway status`

Check gateway reachability and route URLs


| Option | Description |
|--------|-------------|
| `--config <path>` | - |
| `--json` | - |
| `--base-url` | - |

#### `amc gateway verify-config`

Verify .amc/gateway.yaml signature


| Option | Description |
|--------|-------------|
| `--config <path>` | - |

#### `amc glossary define`

Define a glossary term


| Option | Description |
|--------|-------------|
| `--domain <domain>` | - |
| `--json` | - |

#### `amc glossary lookup`

Look up a glossary term


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc governance-drift`

Detect governance drift for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc governor check`

Evaluate whether an action is allowed now (simulate vs execute)


| Option | Description |
|--------|-------------|
| `--action <class>` | - |
| `--risk <tier>` | - |
| `--mode <mode>` | - |
| `--agent <agentId>` | - |

#### `amc governor confidence-check`

Check if action is allowed given confidence-adjusted maturity


| Option | Description |
|--------|-------------|
| `--action <class>` | - |
| `--agent <id>` | - |
| `--required-level <n>` | - |

#### `amc governor explain`

Explain policy requirements for an action class


| Option | Description |
|--------|-------------|
| `--action <class>` | - |
| `--agent <agentId>` | - |

#### `amc governor report`

Render matrix of current SIMULATE/EXECUTE allowance per ActionClass


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--out <path>` | - |
| `--agent <agentId>` | - |

#### `amc governor-override`

Activate an emergency governance override with TTL


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <reason>` | - |
| `--ttl <ttl>` | - |
| `--mode <mode>` | - |

#### `amc governor-override-alerts`

Show alerts for active/expired overrides


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc guard`

Guard check proposed output from stdin


| Option | Description |
|--------|-------------|
| `--target <name>` | - |
| `--risk-tier <tier>` | - |

#### `amc guardrails list`

List signed requested state and effective runtime guardrail bindings


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc guide`

Generate personalized improvement guide with exportable agent instructions


| Option | Description |
|--------|-------------|
| `--target <level>` | - |
| `--export` | - |
| `--agent-instructions` | - |
| `--guardrails` | - |
| `--apply [file]` | - |
| `--interactive` | - |
| `--watch` | - |
| `--watch-interval <seconds>` | - |
| `--diff` | - |
| `--frameworks` | - |
| `--ci` | - |
| `--dry-run` | - |
| `--quick` | - |
| `--auto-detect` | - |
| `--status` | - |
| `--go` | - |
| `--compliance [frameworks]` | - |
| `--agent <id>` | - |
| `--framework <name>` | - |
| `--json` | - |

#### `amc help`

Show help for a command (for example: amc help run)


| Option | Description |
|--------|-------------|
| `--all` | - |

#### `amc history`

List diagnostic run history


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--valid-only` | - |
| `--since <hours>` | - |

#### `amc host bootstrap`

Bootstrap host admin + default workspace from secret files


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |

#### `amc host init`

Initialize host metadata database


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |

#### `amc host list`

List host users and workspaces


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |

#### `amc host membership grant`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--username <username>` | - |
| `--workspace <workspaceId>` | - |
| `--role <role>` | - |

#### `amc host membership revoke`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--username <username>` | - |
| `--workspace <workspaceId>` | - |
| `--role <role>` | - |

#### `amc host migrate`

Migrate an existing single-workspace AMC directory into host mode


| Option | Description |
|--------|-------------|
| `--from <path>` | - |
| `--to-host <path>` | - |
| `--workspace-id <id>` | - |
| `--move` | - |
| `--username <username>` | - |
| `--name <name>` | - |

#### `amc host user add`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--username <username>` | - |
| `--password-file <path>` | - |
| `--host-admin` | - |

#### `amc host user disable`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--username <username>` | - |

#### `amc host workspace create`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--id <workspaceId>` | - |
| `--name <name>` | - |

#### `amc host workspace delete`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--id <workspaceId>` | - |

#### `amc host workspace purge`

-


| Option | Description |
|--------|-------------|
| `--dir <path>` | - |
| `--id <workspaceId>` | - |
| `--confirm <workspaceId>` | - |

#### `amc identity init`

Create and sign host-level identity.yaml


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |

#### `amc identity mapping add`

Add a group mapping rule


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |
| `--group <name>` | - |
| `--provider-id <id>` | - |
| `--workspace <id>` | - |
| `--roles <roles>` | - |
| `--host-admin` | - |

#### `amc identity provider add`

Add an identity provider


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |
| `--id <providerId>` | - |
| `--display-name <name>` | - |
| `--issuer <issuer>` | - |
| `--client-id <id>` | - |
| `--client-secret-file <path>` | - |
| `--redirect-uri <uri>` | - |
| `--scopes <scopes>` | - |
| `--use-well-known <bool>` | - |
| `--authorization-endpoint <url>` | - |
| `--token-endpoint <url>` | - |
| `--jwks-uri <url>` | - |
| `--entry-point <url>` | - |
| `--idp-cert-file <path>` | - |
| `--sp-entity-id <id>` | - |
| `--acs-url <url>` | - |

#### `amc identity verify`

Verify identity.yaml signature


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |

#### `amc import`

Import neutral traces, runs, workflow graphs, configs, memory, evals, and benchmarks


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--dry-run` | - |
| `--validate` | - |
| `--json` | - |

#### `amc imports list`

List recent neutral import runs


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--json` | - |

#### `amc imports rollback`

Remove files written by a neutral import run


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc imports show`

Inspect a neutral import manifest


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc improve`

Guided improvement — shows what to fix next based on your current score


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc incident close`

Close an incident with a resolution summary


| Option | Description |
|--------|-------------|
| `--resolution <text>` | - |

#### `amc incident create`

Create a manual incident


| Option | Description |
|--------|-------------|
| `--title <title>` | - |
| `--severity <severity>` | - |
| `--agent <agentId>` | - |

#### `amc incident link`

Link evidence to an incident


| Option | Description |
|--------|-------------|
| `--evidence <evidenceId>` | - |

#### `amc incident list`

List incidents for an agent


| Option | Description |
|--------|-------------|
| `--status <status>` | - |
| `--limit <n>` | - |
| `--agent <agentId>` | - |

#### `amc incidents alert`

Dispatch INCIDENT_CREATED to configured integration channels


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--summary <text>` | - |
| `--details <json>` | - |

#### `amc indices`

Compute deterministic failure-risk indices


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--agent <agentId>` | - |
| `--out <path>` | - |

#### `amc indices fleet`

Compute failure-risk indices across fleet


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--out <path>` | - |

#### `amc ingest`

Ingest external logs/transcripts as SELF_REPORTED evidence


| Option | Description |
|--------|-------------|
| `--type <kind>` | - |
| `--agent <agentId>` | - |

#### `amc init`

Initialize .amc workspace


| Option | Description |
|--------|-------------|
| `--trust-boundary <mode>` | - |
| `--profile <name>` | - |
| `--force` | - |
| `--skip-vault` | - |
| `--minimal` | - |

#### `amc insider-alerts`

Show insider risk alerts


| Option | Description |
|--------|-------------|
| `--actor <id>` | - |
| `--ack <alertId>` | - |

#### `amc insider-risk-report`

Generate insider risk analytics report


| Option | Description |
|--------|-------------|
| `--window <days>` | - |

#### `amc integrate`

Generate integration scaffold for a framework


| Option | Description |
|--------|-------------|
| `--output-dir <dir>` | - |
| `--project <path>` | - |

#### `amc integrations dispatch`

Dispatch a deterministic integration event


| Option | Description |
|--------|-------------|
| `--event <name>` | - |
| `--agent <id>` | - |
| `--summary <text>` | - |

#### `amc integrations export-journal`

Export integration delivery journal (receipts + dead letters)


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc integrations setup`

Generate integration config files


| Option | Description |
|--------|-------------|
| `--type <type>` | - |
| `--min-score <score>` | - |
| `--agent <agentId>` | - |
| `--output <dir>` | - |

#### `amc integrations test`

Dispatch deterministic test event to an integration channel


| Option | Description |
|--------|-------------|
| `--channel <id>` | - |

#### `amc inventory list`

List AI assets (alias for 'inventory scan')


| Option | Description |
|--------|-------------|
| `--deep` | - |
| `--json` | - |

#### `amc inventory scan`

Scan workspace for AI assets (agents, models, configs, API keys)


| Option | Description |
|--------|-------------|
| `--deep` | - |
| `--json` | - |

#### `amc lab-compare`

Compare two lab experiments


| Option | Description |
|--------|-------------|
| `--baseline <id>` | - |
| `--candidate <id>` | - |

#### `amc lab-create`

Create a new lab experiment


| Option | Description |
|--------|-------------|
| `--kind <kind>` | - |
| `--name <name>` | - |
| `--model <modelId>` | - |
| `--description <desc>` | - |

#### `amc lab-list`

List all lab experiments


| Option | Description |
|--------|-------------|
| `--kind <kind>` | - |

#### `amc lab-report`

Generate a lab experiment report


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |

#### `amc lab-simulate`

Simulate the lab workflow with placeholder probe results (no model is called)


| Option | Description |
|--------|-------------|
| `--experiment <id>` | - |

#### `amc leaderboard export`

Export leaderboard as JSON/HTML for public sharing


| Option | Description |
|--------|-------------|
| `--format <fmt>` | - |
| `--output <path>` | - |

#### `amc leaderboard public-export`

Build an anonymized public leaderboard dataset bundle


| Option | Description |
|--------|-------------|
| `--output <dir>` | - |
| `--dataset-id <id>` | - |
| `--name <name>` | - |
| `--license <id>` | - |
| `--amc-version <version>` | - |
| `--salt <value>` | - |
| `--min-agents <n>` | - |
| `--allow-small-cohort` | - |
| `--include-model-family` | - |
| `--include-provider-id` | - |
| `--json` | - |

#### `amc leaderboard show`

Show fleet-wide maturity leaderboard


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc learn`

Education flow for a specific maturity question


| Option | Description |
|--------|-------------|
| `--question <qid>` | - |
| `--agent <agentId>` | - |

#### `amc lease issue`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--ttl <ttl>` | - |
| `--scopes <scopes>` | - |
| `--routes <routes>` | - |
| `--models <models>` | - |
| `--rpm <rpm>` | - |
| `--tpm <tpm>` | - |
| `--max-cost-usd-per-day <usd>` | - |
| `--workorder <workOrderId>` | - |

#### `amc lease revoke`

-


| Option | Description |
|--------|-------------|
| `--lease-id <id>` | - |
| `--reason <reason>` | - |

#### `amc legal-hold`

Issue or manage legal holds


| Option | Description |
|--------|-------------|
| `--issue` | - |
| `--release <holdId>` | - |
| `--list` | - |
| `--tenant <id>` | - |
| `--reason <text>` | - |
| `--issued-by <name>` | - |

#### `amc lessons-list`

List lessons learned from corrections


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--agent <agentId>` | - |

#### `amc lifecycle advance`

Advance lifecycle stage after governance gate confirmation


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--to <stage>` | - |
| `--actor <actor>` | - |
| `--actor-role <role>` | - |
| `--controls <list>` | - |
| `--note <text>` | - |
| `--json` | - |

#### `amc lifecycle status`

Show lifecycle stage, accountability matrix, governance gates, and transition trail


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc lineage-policy-intents`

List all policy change intents for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc lineage-report`

Generate governance lineage report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc lint`

Lint agent configuration files for schema compliance, anti-patterns, and best practices


| Option | Description |
|--------|-------------|
| `--fix` | - |
| `--format <fmt>` | - |
| `--rules <ids...>` | - |
| `--workspace <path>` | - |

#### `amc lint rules`

List all available lint rules


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc lite-score`

Lite scoring mode for non-agent LLMs / chatbots — simplified assessment without agentic features


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |
| `--eu-ai-act` | - |

#### `amc logs`

Print latest AMC Studio logs


| Option | Description |
|--------|-------------|
| `--lines <n>` | - |

#### `amc loop plan`

Print recurring loop plan


| Option | Description |
|--------|-------------|
| `--cadence <cadence>` | - |
| `--agent <agentId>` | - |

#### `amc loop run`

Run recurring diagnostic + assurance + dashboard + snapshot


| Option | Description |
|--------|-------------|
| `--days <n>` | - |
| `--agent <agentId>` | - |

#### `amc loop schedule`

Print OS scheduler config (no automatic installation)


| Option | Description |
|--------|-------------|
| `--os <os>` | - |
| `--cadence <cadence>` | - |
| `--agent <agentId>` | - |

#### `amc marketplace deprecate`

Deprecate a pack


| Option | Description |
|--------|-------------|
| `--note <text>` | - |

#### `amc marketplace featured`

Show featured packs


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc marketplace info`

Show details for a specific pack


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc marketplace install`

Install a pack from the marketplace


| Option | Description |
|--------|-------------|
| `--version <ver>` | - |
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc marketplace list`

List installed packs


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc marketplace rate`

Rate a pack


| Option | Description |
|--------|-------------|
| `--score <n>` | - |
| `--review <text>` | - |
| `--user <userId>` | - |
| `--json` | - |

#### `amc marketplace search`

Search marketplace for packs


| Option | Description |
|--------|-------------|
| `-q, --query <query>` | - |
| `--category <cat>` | - |
| `--source <src>` | - |
| `--installed` | - |
| `--featured` | - |
| `--min-rating <n>` | - |
| `--tags <tags>` | - |
| `--sort <field>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc marketplace uninstall`

Uninstall a pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc mcp config`

Print MCP configuration snippets for supported AI coding assistants


| Option | Description |
|--------|-------------|
| `--ide <name>` | - |
| `--json` | - |

#### `amc mcp list-tools`

List all tools exposed by the AMC MCP server


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc mcp serve`

Start the AMC MCP server (stdio transport for IDE integration)


| Option | Description |
|--------|-------------|
| `--workspace <path>` | - |

#### `amc mechanic export`

Export latest gap analysis as reward functions, DSPy targets, or fine-tune recipes


| Option | Description |
|--------|-------------|
| `--gap-file <path>` | - |
| `--format <format>` | - |
| `--out <path>` | - |
| `--json` | - |

#### `amc mechanic gap`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--out <path>` | - |

#### `amc mechanic init`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc mechanic plan create`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--from <from>` | - |
| `--to <to>` | - |

#### `amc mechanic plan diff`

-


| Option | Description |
|--------|-------------|
| `--plan-id <id>` | - |

#### `amc mechanic plan request-approval`

-


| Option | Description |
|--------|-------------|
| `--reason <text>` | - |

#### `amc mechanic profile apply`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--mode <mode>` | - |
| `--reason <text>` | - |

#### `amc mechanic rca list`

List generated fixer RCA reports


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc mechanic rca run`

Classify a failed run and create regression-preserving fix proposals


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc mechanic rca show`

Inspect a fixer RCA report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc mechanic targets apply`

-


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--reason <text>` | - |

#### `amc mechanic targets init`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--mode <mode>` | - |

#### `amc mechanic targets set`

-


| Option | Description |
|--------|-------------|
| `--q <qid>` | - |
| `--value <n>` | - |
| `--reason <text>` | - |

#### `amc mechanic tuning apply`

-


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--reason <text>` | - |

#### `amc mechanic tuning init`

-


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc mechanic tuning set`

-


| Option | Description |
|--------|-------------|
| `--key <key>` | - |
| `--value <value>` | - |
| `--reason <text>` | - |

#### `amc memory assess`

Full memory maturity assessment


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc memory retrieve`

Retrieve active reasoning memory for a consumer


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--consumer <consumer>` | - |
| `--query <text>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc memory show`

Show one reasoning memory item


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc memory writeback`

Write governed reasoning memory from an EpisodeRecord


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--consumer <csv>` | - |
| `--ttl-days <n>` | - |
| `--review-days <n>` | - |
| `--summary <text>` | - |
| `--json` | - |

#### `amc memory-advisories`

Show advisories from correction memory for prompt injection


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc memory-expire`

Expire stale lessons past their TTL


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc memory-extract`

Extract lessons from verified effective corrections


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--min-effectiveness <n>` | - |

#### `amc memory-report`

Generate correction memory report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <window>` | - |

#### `amc meta-confidence`

Report confidence in the maturity score itself


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--run <runId>` | - |

#### `amc methodology`

Print the public AMC scoring methodology manifest and hash


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--reproducibility` | - |
| `--sample-dataset` | - |
| `--format <format>` | - |
| `--out <path>` | - |

#### `amc micro-canary-alerts`

Show active micro-canary alerts


| Option | Description |
|--------|-------------|
| `--ack-all` | - |

#### `amc micro-canary-report`

Generate micro-canary status report


| Option | Description |
|--------|-------------|
| `--window <hours>` | - |

#### `amc micro-canary-run`

Run all micro-canary probes immediately


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc mirofish compare`

Side-by-side comparison of two scenarios


| Option | Description |
|--------|-------------|
| `--iterations <n>` | - |
| `--seed <n>` | - |

#### `amc mirofish run`

Run a Monte Carlo simulation with a scenario


| Option | Description |
|--------|-------------|
| `--scenario <name|path>` | - |
| `--iterations <n>` | - |
| `--seed <n>` | - |
| `--output <format>` | - |

#### `amc mirofish stress`

Find governance breaking points for a scenario


| Option | Description |
|--------|-------------|
| `--seed <n>` | - |

#### `amc monitor`

Continuous production monitoring — real-time scoring, drift detection, and alerting


| Option | Description |
|--------|-------------|
| `--runtime <name>` | - |
| `--stdin` | - |

#### `amc monitor check`

One-shot trust drift analysis (check for degradation without running continuously)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--alert-threshold <n>` | - |

#### `amc monitor events`

Show recent monitoring events


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--json` | - |

#### `amc monitor live`

Start real-time monitoring with live assurance checks on incoming traces


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--provider <provider>` | - |
| `--endpoint <url>` | - |
| `--api-key <key>` | - |
| `--budget <usd>` | - |
| `--max-latency <ms>` | - |
| `--alert-severity <level>` | - |

#### `amc monitor metrics`

Get metrics for a specific agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--json` | - |

#### `amc monitor start`

Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--scoring-interval <ms>` | - |
| `--drift-interval <ms>` | - |
| `--score-drop-threshold <n>` | - |
| `--no-webhooks` | - |

#### `amc monitor status`

Show monitoring status for all agents


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc notary attest`

Generate signed notary runtime attestation bundle (.amcattest)


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--notary-dir <dir>` | - |
| `--workspace <dir>` | - |

#### `amc notary init`

Initialize AMC Notary config and signing backend


| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | - |
| `--external-command <cmd>` | - |
| `--external-args <args...>` | - |

#### `amc notary log-verify`

Verify notary append-only signing log + seal signature


| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | - |

#### `amc notary pubkey`

Print notary public key and fingerprint


| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | - |

#### `amc notary sign`

Sign a payload file using Notary (admin utility)


| Option | Description |
|--------|-------------|
| `--kind <kind>` | - |
| `--in <file>` | - |
| `--out <file>` | - |
| `--notary-dir <dir>` | - |

#### `amc notary start`

Start AMC Notary service (foreground)


| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | - |
| `--workspace <dir>` | - |

#### `amc notary status`

Show notary backend and log status


| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | - |

#### `amc observe anomalies`

Detect observability anomalies (evidence rate drops, trust regressions, score volatility)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc observe timeline`

Show agent evidence timeline with score progression


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc openapi-generate`

Generate live OpenAPI spec (Studio + Bridge + Gateway)


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--json` | - |

#### `amc operator-dashboard`

Generate operator dashboard showing why questions are capped and how to unlock


| Option | Description |
|--------|-------------|
| `--role <role>` | - |
| `--run <runId>` | - |
| `--previous-run <runId>` | - |

#### `amc ops circuit-breaker-init`

Initialize circuit breaker policy


| Option | Description |
|--------|-------------|
| `--timeout <ms>` | - |
| `--threshold <n>` | - |

#### `amc ops dead-letters`

Show dead letter queue


| Option | Description |
|--------|-------------|
| `--unresolved` | - |

#### `amc ops latency`

Show latency accounting report


| Option | Description |
|--------|-------------|
| `--window <hours>` | - |

#### `amc ops mode`

Show or set degradation mode


| Option | Description |
|--------|-------------|
| `--set <mode>` | - |
| `--reason <reason>` | - |
| `--ttl <duration>` | - |

#### `amc ops slo`

Show governance SLO dashboard


| Option | Description |
|--------|-------------|
| `--window <hours>` | - |

#### `amc org add node`

-


| Option | Description |
|--------|-------------|
| `--type <type>` | - |
| `--id <id>` | - |
| `--name <name>` | - |
| `--parent <id>` | - |

#### `amc org assign`

-


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--node <id>` | - |
| `--weight <n>` | - |

#### `amc org commit`

-


| Option | Description |
|--------|-------------|
| `--node <id>` | - |
| `--days <n>` | - |
| `--out <file>` | - |

#### `amc org community init`

-


| Option | Description |
|--------|-------------|
| `--platform <name>` | - |

#### `amc org community score`

-


| Option | Description |
|--------|-------------|
| `--platform <name>` | - |

#### `amc org compare`

-


| Option | Description |
|--------|-------------|
| `--node-a <id>` | - |
| `--node-b <id>` | - |
| `--out <file>` | - |
| `--format <fmt>` | - |
| `--window <window>` | - |

#### `amc org init`

-


| Option | Description |
|--------|-------------|
| `--enterprise <name>` | - |

#### `amc org inspect`

-


| Option | Description |
|--------|-------------|
| `--redacted` | - |
| `--json` | - |

#### `amc org learn`

-


| Option | Description |
|--------|-------------|
| `--node <id>` | - |
| `--out <file>` | - |

#### `amc org own`

-


| Option | Description |
|--------|-------------|
| `--node <id>` | - |
| `--out <file>` | - |

#### `amc org report`

-


| Option | Description |
|--------|-------------|
| `--node <id>` | - |
| `--out <file>` | - |
| `--window <window>` | - |

#### `amc org roles`

List the canonical 70 AMC org roles


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc org run`

Run the advanced 70-role org lifecycle loop with isolated role workspaces


| Option | Description |
|--------|-------------|
| `--roles <csv>` | - |
| `--goal <text>` | - |
| `--heartbeat <minutes>` | - |
| `--max-stale <minutes>` | - |
| `--plateau-after <n>` | - |
| `--id <id>` | - |
| `--json` | - |

#### `amc org runs`

List org lifecycle runs


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--json` | - |

#### `amc org score`

-


| Option | Description |
|--------|-------------|
| `--window <window>` | - |

#### `amc org unassign`

-


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--node <id>` | - |

#### `amc outcomes attest`

Record manual attested outcome signal


| Option | Description |
|--------|-------------|
| `--metric <metricId>` | - |
| `--value <value>` | - |
| `--reason <text>` | - |
| `--workorder <id>` | - |
| `--unit <unit>` | - |
| `--agent <agentId>` | - |

#### `amc outcomes init`

Create and sign outcome contract


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--archetype <id>` | - |

#### `amc outcomes report`

Generate outcomes report (agent) or fleet outcomes report


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--out <path>` | - |
| `--agent <agentId>` | - |

#### `amc outcomes verify`

Verify outcome contract signature


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc overhead-report`

Generate per-feature overhead accounting report


| Option | Description |
|--------|-------------|
| `--window <hours>` | - |

#### `amc oversight assess`

Assess human oversight quality


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc own`

Ownership flow for top maturity gaps


| Option | Description |
|--------|-------------|
| `--target <name>` | - |
| `--agent <agentId>` | - |

#### `amc pack info`

Show detailed information about a pack


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc pack init`

Initialize a new pack in <name>/ or an explicit --dir


| Option | Description |
|--------|-------------|
| `--name <name>` | - |
| `--dir <path>` | - |
| `--version <version>` | - |
| `--description <desc>` | - |
| `--author <author>` | - |
| `--license <license>` | - |
| `--type <type>` | - |

#### `amc pack install`

Install a community assurance pack


| Option | Description |
|--------|-------------|
| `--version <version>` | - |
| `--save` | - |
| `--save-dev` | - |
| `--force` | - |
| `--dry-run` | - |
| `--json` | - |

#### `amc pack list`

List installed packs


| Option | Description |
|--------|-------------|
| `--global` | - |
| `--json` | - |

#### `amc pack publish`

Publish a pack to the registry


| Option | Description |
|--------|-------------|
| `--registry <url>` | - |
| `--dry-run` | - |
| `--access <level>` | - |
| `--json` | - |

#### `amc pack registry serve`

Start a local pack registry server


| Option | Description |
|--------|-------------|
| `--port <port>` | - |
| `--host <host>` | - |

#### `amc pack search`

Search for packs in the registry


| Option | Description |
|--------|-------------|
| `--category <category>` | - |
| `--author <author>` | - |
| `--keywords <keywords>` | - |
| `--limit <n>` | - |
| `--offset <n>` | - |
| `--json` | - |

#### `amc pack test`

Test a local pack directory; defaults to cwd and auto-detects one child pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc pack uninstall`

Uninstall a pack


| Option | Description |
|--------|-------------|
| `--save` | - |
| `--json` | - |

#### `amc pair create`

Create one-time pairing code (LAN login pairing or agent bridge pairing)


| Option | Description |
|--------|-------------|
| `--ttl <ttl>` | - |
| `--ttl-min <minutes>` | - |
| `--agent-name <name>` | - |
| `--workspace <workspaceId>` | - |

#### `amc pair redeem`

Redeem pairing code for a lease token file


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--bridge-url <url>` | - |
| `--lease-ttl-min <minutes>` | - |

#### `amc passport badge`

Print deterministic single-line badge from latest cache


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <agentId>` | - |

#### `amc passport capabilities-add`

Add capability declaration to agent passport


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--capability <name>` | - |
| `--evidence <eventId>` | - |

#### `amc passport create`

Create deterministic signed .amcpass artifact


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--out <file.amcpass>` | - |
| `--id <id>` | - |

#### `amc passport export-latest`

Export latest passport for a scope to .amcpass


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--out <file.amcpass>` | - |
| `--id <id>` | - |

#### `amc passport issue-token`

Issue an AMC Trust Token for an agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--dimensions <list>` | - |
| `--ttl <hours>` | - |

#### `amc passport link`

Link agent passport to external platform identity


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--platform <name>` | - |
| `--identity <handle>` | - |

#### `amc passport policy apply`

Apply passport policy from JSON/YAML file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc passport search`

Search agents by capability and minimum maturity level


| Option | Description |
|--------|-------------|
| `--capability <name>` | - |
| `--min-level <n>` | - |

#### `amc passport share`

Generate shareable passport material


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--format <format>` | - |
| `--base-url <url>` | - |
| `--out <path>` | - |

#### `amc passport show`

Show .amcpass as JSON or single-line badge


| Option | Description |
|--------|-------------|
| `--format <format>` | - |

#### `amc passport translate-score`

Translate trust scores between scoring systems


| Option | Description |
|--------|-------------|
| `--from <system>` | - |
| `--to <system>` | - |
| `--score <n>` | - |
| `--json` | - |

#### `amc passport verify`

Verify .amcpass artifact offline


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc playground run`

Run all demo scenarios


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc plugin execute`

Execute approved plugin install/upgrade/remove request


| Option | Description |
|--------|-------------|
| `--approval-request <id>` | - |

#### `amc plugin install`

Request plugin install (requires SECURITY dual-control approval)


| Option | Description |
|--------|-------------|
| `--registry <id>` | - |
| `--agent <agentId>` | - |

#### `amc plugin keygen`

Generate plugin publisher keypair


| Option | Description |
|--------|-------------|
| `--out-dir <dir>` | - |

#### `amc plugin pack`

Create signed .amcplug package from a plugin folder


| Option | Description |
|--------|-------------|
| `--in <dir>` | - |
| `--key <path>` | - |
| `--out <file>` | - |

#### `amc plugin registries-apply`

Apply and sign workspace registries.yaml from JSON or YAML file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc plugin registry init`

Initialize local signed plugin registry directory


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--registry-id <id>` | - |
| `--registry-name <name>` | - |

#### `amc plugin registry publish`

Publish plugin package into registry and re-sign index


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--file <plugin>` | - |
| `--registry-key <key>` | - |

#### `amc plugin registry serve`

Serve plugin registry over local HTTP


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |
| `--host <host>` | - |
| `--port <port>` | - |

#### `amc plugin registry verify`

Verify registry signature and package hashes


| Option | Description |
|--------|-------------|
| `--dir <dir>` | - |

#### `amc plugin registry-fingerprint`

Compute registry public key fingerprint


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc plugin remove`

Request plugin removal (requires SECURITY dual-control approval)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc plugin search`

Search a plugin registry by id/fingerprint


| Option | Description |
|--------|-------------|
| `--registry <base>` | - |
| `--query <text>` | - |

#### `amc plugin upgrade`

Request plugin upgrade (requires SECURITY dual-control approval)


| Option | Description |
|--------|-------------|
| `--registry <id>` | - |
| `--agent <agentId>` | - |

#### `amc plugin verify`

Verify plugin package signature + artifact hashes


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc policy action logic apply`

Apply evidence logic after exact confirmation


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--confirm <compileId>` | - |
| `--acknowledge-alternatives` | - |
| `--json` | - |

#### `amc policy action logic compile`

Preview a deterministic evidence-logic change without writing


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc policy action logic show`

Show declared evidence gates and effective logic


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc policy controls`

Show one verified Scope / When / Then projection of existing controls


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc policy pack apply`

Apply policy pack and sign updated configs/targets


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc policy pack diff`

Show deterministic diff for applying a policy pack


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc policy scope apply`

Apply a scope preview after exact compile-ID confirmation


| Option | Description |
|--------|-------------|
| `--pack <packId>` | - |
| `--confirm <compileId>` | - |
| `--json` | - |

#### `amc policy scope compile`

Preview a deterministic selected-rule merge without writing


| Option | Description |
|--------|-------------|
| `--pack <packId>` | - |
| `--json` | - |

#### `amc policy scope list`

List immutable AMC action-class scope templates


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc policy simulate`

Simulate one projected control through its production evaluator without recording


| Option | Description |
|--------|-------------|
| `--content <text>` | - |
| `--direction <direction>` | - |
| `--agent <agentId>` | - |
| `--risk <tier>` | - |
| `--mode <mode>` | - |
| `--exec-ticket` | - |
| `--json` | - |

#### `amc policy test`

Run deterministic policy fixtures through production control evaluators


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc policy-canary-report`

Generate canary mode report for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc policy-canary-start`

Start policy canary mode (observation-only)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--pack <packId>` | - |
| `--duration <duration>` | - |

#### `amc policy-debt-add`

Register a temporary policy waiver (debt)


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--requirement <req>` | - |
| `--justification <text>` | - |
| `--expires <ts>` | - |
| `--created-by <who>` | - |

#### `amc policy-debt-list`

List active policy debt entries


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--all` | - |

#### `amc product autonomy`

Decide autonomy level for an agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc product features`

List product features


| Option | Description |
|--------|-------------|
| `--relevance <level>` | - |
| `--lane <lane>` | - |
| `--amc-fit` | - |
| `--json` | - |

#### `amc product features-recommended`

Show top recommended product features


| Option | Description |
|--------|-------------|
| `--limit <n>` | - |
| `--json` | - |

#### `amc product loop-detect`

Detect infinite loops in agent behavior


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc product metering`

Show metering and billing for an agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc product retry`

Execute a command with retry logic


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc product route`

Route a task to the best model/provider


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc prompt pack build`

Build and sign .amcprompt for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--out <file>` | - |

#### `amc prompt pack diff`

Diff latest prompt pack against previous snapshot


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc prompt pack show`

Show provider-specific enforced system prompt


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--provider <provider>` | - |
| `--format <format>` | - |

#### `amc prompt pack verify`

Verify .amcprompt signature and lint signature


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc prompt policy apply`

Apply prompt policy from YAML file and sign


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--reason <reason>` | - |

#### `amc prompt scheduler run-now`

Run prompt scheduler now for one agent or all


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc proof check`

Check a claim against a declared source-to-rule manifest and emit an amcproof artifact


| Option | Description |
|--------|-------------|
| `--domain <domain>` | - |
| `--manifest <path>` | - |
| `--input <path>` | - |
| `--out <path>` | - |
| `--json` | - |

#### `amc provider add`

Assign or update provider template for an agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc python-sdk`

Generate the Python SDK package for AMC Bridge API


| Option | Description |
|--------|-------------|
| `--endpoints` | - |
| `--coverage` | - |

#### `amc quality-report`

Show quality report


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--window <days>` | - |
| `--json` | - |

#### `amc quickscore`

Full default interactive diagnostic — or use --rapid for 5-question express, --auto for ledger evidence


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--quiet` | - |
| `--answers <jsonOrFile>` | - |
| `--eu-ai-act` | - |
| `--auto` | - |
| `--rapid` | - |
| `--agent <agentId>` | - |
| `--share` | - |

#### `amc quickstart`

2-minute quickstart with Quick Score assessment


| Option | Description |
|--------|-------------|
| `--profile <name>` | - |
| `--minimal` | - |
| `--startup-plan` | - |
| `--what-broken` | - |
| `--role <role>` | - |
| `--framework <name>` | - |
| `--answers-out <path>` | - |
| `--json` | - |

#### `amc rate`

Rate agent run quality (thumbs up/down)


| Option | Description |
|--------|-------------|
| `--score <score>` | - |
| `--tags <tags>` | - |
| `--comment <text>` | - |
| `--agent <agentId>` | - |

#### `amc redteam attack`

Run attack plugins (prompt-injection, data-exfiltration, privilege-escalation, model-manipulation, denial-of-service)


| Option | Description |
|--------|-------------|
| `--plugins <ids...>` | - |
| `--model <modelId>` | - |
| `--json` | - |

#### `amc redteam attack-list`

List available attack plugins


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc redteam plugins`

List available attack plugins (assurance packs)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc redteam run`

Execute red-team plugins with chosen attack strategies and generate a vulnerability report


| Option | Description |
|--------|-------------|
| `--plugins <ids...>` | - |
| `--strategies <ids...>` | - |
| `--output <path>` | - |
| `--no-sign` | - |
| `--evil-mcp` | - |
| `--mcp-attacks <categories...>` | - |
| `--model <modelId>` | - |
| `--json` | - |

#### `amc redteam strategies`

List available attack strategies


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc release init`

Initialize AMC release signing keypair


| Option | Description |
|--------|-------------|
| `--write-private-to <path>` | - |

#### `amc release licenses`

Generate dependency license inventory


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc release pack`

Build a signed deterministic .amcrelease bundle


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--private-key <path>` | - |
| `--skip-install-build` | - |

#### `amc release provenance`

Generate AMC provenance record


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc release sbom`

Generate deterministic CycloneDX SBOM


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc release scan`

Run strict secret scan on a .amcrelease bundle


| Option | Description |
|--------|-------------|
| `--in <file>` | - |
| `--out <file>` | - |

#### `amc release verify`

Verify a .amcrelease bundle offline


| Option | Description |
|--------|-------------|
| `--pubkey <path>` | - |

#### `amc report`

Render report for run ID, saved alias, prefix, or 'latest'


| Option | Description |
|--------|-------------|
| `--executive` | - |
| `--html <path>` | - |
| `--share` | - |
| `--share-dir <path>` | - |
| `--public-base-url <url>` | - |

#### `amc residency-policy`

Create or list data residency policies


| Option | Description |
|--------|-------------|
| `--list` | - |
| `--region <region>` | - |
| `--isolation <level>` | - |
| `--custody <mode>` | - |

#### `amc residency-report`

Generate data residency compliance report for a tenant


| Option | Description |
|--------|-------------|
| `--tenant <id>` | - |
| `--redaction-tests` | - |

#### `amc resource apply`

Accept current resources as the new signed manifest; dry-run unless --yes is set

Alias: `amc activate`

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--yes` | - |
| `--force` | - |
| `--json` | - |

#### `amc resource contract`

Show the AMC-native governed resource lifecycle contract


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc resource diff`

Diff an Enforce resource manifest against the current workspace


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--from <path>` | - |
| `--to <path>` | - |
| `--json` | - |

#### `amc resource evaluate`

Evaluate a resource proposal against Enforce gates


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc resource get`

Inspect one resource in an Enforce resource manifest

Alias: `amc inspect`

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc resource history`

Show signed Enforce resource manifests, snapshots, and receipts


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc resource list`

List resources in an Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc resource propose`

Create a dry-run resource change proposal from the latest manifest to current workspace state


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc resource restore`

Restore resources from an Enforce snapshot; dry-run unless --apply is set


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--resource <idOrPath>` | - |
| `--apply` | - |
| `--include-immutable` | - |
| `--json` | - |

#### `amc resource rollback`

Roll back to the signed previous version, or an explicit canonical snapshot


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--resource <idOrPath>` | - |
| `--apply` | - |
| `--include-immutable` | - |
| `--json` | - |

#### `amc resource snapshot`

Write the current Enforce resource manifest


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc resource status`

Show the signed active, previous, rollback, drift, and integrity state


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc resource validate`

Validate governed resource changes before accepting them


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--manifest <path>` | - |
| `--json` | - |

#### `amc retention run`

Run archival + payload prune lifecycle


| Option | Description |
|--------|-------------|
| `--dry-run` | - |

#### `amc rollback-create`

Create a rollback pack from the current policy file


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <reason>` | - |
| `--policy-file <path>` | - |

#### `amc run`

Full assessment — Score + Shield + Enforce + Vault + Watch + Comply + Fleet + Passport in one command


| Option | Description |
|--------|-------------|
| `--window <window>` | - |
| `--fail-below <grade>` | - |
| `--ci` | - |
| `--score-only` | - |
| `--question-set <version>` | - |
| `--industry-pack-weights` | - |
| `--json` | - |
| `--fix` | - |

#### `amc run-alias`

Name diagnostic runs for report and history workflows

Alias: `amc run-name`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc run-alias list`

List diagnostic run aliases for the active agent

Alias: `amc run-name list`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc run-alias remove`

Remove a diagnostic run alias

Alias: `amc rm`, `amc run-name remove`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc run-alias set`

Assign a reusable alias to a diagnostic run

Alias: `amc run-name set`

| Option | Description |
|--------|-------------|
| - | - |

#### `amc runtime cancel`

Cancel a runtime run cleanly


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <text>` | - |
| `--json` | - |

#### `amc runtime complete`

Complete a runtime run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <text>` | - |
| `--json` | - |

#### `amc runtime create`

Create a persisted connected-agent runtime run


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--agent <agentId>` | - |
| `--source <source>` | - |
| `--stage <stage>` | - |
| `--episode <episodeId>` | - |
| `--lifecycle-run <id>` | - |
| `--message <text>` | - |
| `--json` | - |

#### `amc runtime degrade`

Mark a runtime run degraded


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--reason <text>` | - |
| `--json` | - |

#### `amc runtime event`

Append an event to a persisted runtime run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--source <source>` | - |
| `--type <type>` | - |
| `--stage <stage>` | - |
| `--severity <severity>` | - |
| `--message <text>` | - |
| `--payload-json <json>` | - |
| `--receipt <receiptId>` | - |
| `--decision <decisionId>` | - |
| `--trace <traceId>` | - |
| `--candidate <candidateId>` | - |
| `--json` | - |

#### `amc runtime export`

Export runtime run events as JSON or JSONL


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--agent <agentId>` | - |
| `--format <format>` | - |
| `--limit <n>` | - |
| `--stage <stage>` | - |
| `--receipt <receiptId>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc runtime inspect`

Inspect a runtime run and its event stream


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--no-events` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc runtime list`

List persisted runtime runs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc runtime resume`

Resume a running or degraded runtime run from persisted state


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--stage <stage>` | - |
| `--message <text>` | - |
| `--json` | - |

#### `amc runtime status`

Show persisted runtime run-manager status


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc sandbox run`

Run agent command in hardened Docker sandbox


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--route <route>` | - |
| `--proxy <proxy>` | - |
| `--image <image>` | - |

#### `amc scan`

Zero-integration agent assessment scanner


| Option | Description |
|--------|-------------|
| `--url <url>` | - |
| `--repo <url>` | - |
| `--local <path>` | - |
| `--json` | - |

#### `amc scan model-scan`

Scan ML model files for security threats (malicious code, backdoors, supply chain attacks)


| Option | Description |
|--------|-------------|
| `--format <formats>` | - |
| `--max-size <mb>` | - |
| `--no-deep-scan` | - |
| `--no-hashes` | - |
| `--timeout <ms>` | - |
| `--output <format>` | - |
| `--output-file <path>` | - |
| `--recursive` | - |
| `--include-safe` | - |

#### `amc scim init`

Enable SCIM provisioning and optionally create an initial bearer token


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |
| `--token-name <name>` | - |
| `--out <file>` | - |
| `--require-https <bool>` | - |

#### `amc scim token create`

Create a SCIM bearer token and store hash in host vault


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |
| `--name <name>` | - |
| `--out <file>` | - |

#### `amc score`

Maturity scoring, adversarial testing, and evidence collection


| Option | Description |
|--------|-------------|
| `--tier <tier>` | - |

#### `amc score a2a-protocol`

Score agent-to-agent protocol maturity: card completeness, lifecycle, auth, format, errors, discovery


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc score adversarial`

Test gaming resistance of scoring


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score alignment-index`

Compute composite alignment index


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score audit-depth`

Score audit trail depth and completeness


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score autonomy-duration`

Track time between human checkpoints with domain risk profiles


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score behavioral-contract`

Score agent behavioral contract maturity (alignment card, permitted/forbidden actions)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score calibration-gap`

Measure delta between agent self-reported confidence and observed behavior


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score collect-evidence`

Collect an agent's evidence from the ledger


| Option | Description |
|--------|-------------|
| `--window-days <n>` | - |
| `--json` | - |

#### `amc score density-map`

Heatmap of evidence density per question per dimension — reveals blind spots


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score distributed-agents`

Score distributed multi-agent execution: partitions, sync, failover, consensus, load, observability


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc score eu-ai-act`

Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score evidence-conflict`

Measure internal consistency of evidence — detect conflicting signals


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score evidence-coverage`

Show automated vs manual evidence coverage


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score evidence-ingest`

Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom)


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--format <fmt>` | - |

#### `amc score factuality`

Score factuality across parametric, retrieval, and grounded dimensions


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score fail-secure`

Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score faithfulness`

Score how well LLM output is grounded in provided context


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--context <text>` | - |
| `--output <text>` | - |
| `--threshold <n>` | - |

#### `amc score formal-spec`

Compute formal maturity score for an agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score gaming-resistance`

Test whether adversarial evidence injection can inflate scores


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score industry-adjust`

Adjust a score using an industry-specific trust model


| Option | Description |
|--------|-------------|
| `--industry <id>` | - |
| `--score <n>` | - |
| `--agent <id>` | - |
| `--drilldown` | - |
| `--history` | - |
| `--lookback-days <n>` | - |
| `--out <path>` | - |
| `--json` | - |

#### `amc score industry-benchmark`

Show industry benchmark percentiles


| Option | Description |
|--------|-------------|
| `--industry <id>` | - |
| `--json` | - |

#### `amc score industry-list`

List all available industry trust models


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score interpretability`

Score structural transparency and explainability


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score kernel-sandbox`

Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score lean-profile`

Show lean AMC profile


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score level-transition`

Track formal promotion/demotion events with evidence gates


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score memory-depth`

Score deep memory infrastructure: backend resilience, compression fidelity, cross-session consistency, TTL, capacity


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc score memory-integrity`

Score memory correction persistence and poisoning resistance


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score mutual-verification`

Score agent-to-agent trust verification (challenge-response)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score operational-independence`

Calculate operational independence score


| Option | Description |
|--------|-------------|
| `--window <days>` | - |
| `--domain <domain>` | - |
| `--json` | - |

#### `amc score output-attestation`

Score output signing and trust metadata for receiving agents


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score output-integrity`

Score output integrity maturity (OWASP LLM02, confidence calibration, citation)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score owasp-llm`

Score OWASP LLM Top 10 coverage (all 10 risks)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score pause-quality`

Score quality of agent-initiated pauses


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score policy-consistency`

Test policy enforcement consistency across repeated trials (pass^k)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score production-ready`

Run production readiness gate for an agent


| Option | Description |
|--------|-------------|
| `--strict` | - |
| `--json` | - |

#### `amc score regulatory-readiness`

Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP)


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--json` | - |

#### `amc score runtime-identity`

Score runtime execution identity maturity (JIT credentials, user propagation, revocation)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score safety-research`

Run the AI Safety Research evaluation lane — 4-dimension assessment based on frontier safety research


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--responses <file>` | - |

#### `amc score self-knowledge`

Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score simulation-lane`

Run the Simulation & Forecast evaluation lane — 5-dimension assessment for simulation/forecast systems


| Option | Description |
|--------|-------------|
| `--system-type <type>` | - |
| `--json` | - |
| `--responses <file>` | - |

#### `amc score sleeper-detection`

Detect context-dependent behavioral inconsistencies


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score state-portability`

Score agent state portability (vendor-neutral format, serialization, integrity on transfer)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score task-horizon`

Score task-completion time horizon (METR-inspired)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc score tier`

Run tiered maturity assessment (quick/standard/deep)


| Option | Description |
|--------|-------------|
| `--tier <tier>` | - |
| `--question-set <version>` | - |
| `--json` | - |

#### `amc score transparency-log`

Score network transparency log (Merkle tree, inclusion proofs)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc sessions list`

List tracked sessions


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--sort <by>` | - |
| `--json` | - |

#### `amc setup`

Setup wizard for the full-score path and Studio gateway


| Option | Description |
|--------|-------------|
| `--provider <name>` | - |
| `--auto` | - |
| `--non-interactive` | - |
| `--demo` | - |

#### `amc shell`

Interactive AMC session — natural language + commands


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--no-color` | - |

#### `amc shield analyze`

Run static code analyzer on a skill file


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield analyze-mcp`

Scan an MCP server definition for security risks (score L0–L5)


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--out <path>` | - |

#### `amc shield analyze-runtime`

Analyze a proposed runtime agent action through the Shield trust pipeline


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--action <action>` | - |
| `--tool <tool>` | - |
| `--parameters <json>` | - |
| `--sensitive-fields <csv>` | - |
| `--instruction-source <source>` | - |
| `--session <id>` | - |
| `--workspace-id <id>` | - |
| `--credential-age-minutes <n>` | - |
| `--confidence <n>` | - |
| `--step <n>` | - |
| `--previous-actions <csv>` | - |
| `--fail-on-block` | - |
| `--json` | - |

#### `amc shield confirm export`

Export a redacted safe proof without exploit instructions


| Option | Description |
|--------|-------------|
| `--out <path>` | - |
| `--json` | - |

#### `amc shield confirm proofs`

List safe exploit-confirmation proof artifacts


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield confirm run`

Run authorized safe exploit confirmation from a task JSON file


| Option | Description |
|--------|-------------|
| `--task <path>` | - |
| `--scope <scopeId>` | - |
| `--json` | - |

#### `amc shield confirm scope-write`

Write a signed exploit-confirmation authorization scope from JSON


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc shield confirm scopes`

List exploit-confirmation authorization scopes


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield conversation-integrity`

Check conversation integrity for an agent (demo)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield detect-injection`

Detect prompt injection attempts in text


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield mcp-ledger`

Signed MCP trust ledger: scan a set of MCP servers and record a clean-as-of receipt


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--out <path>` | - |
| `--previous <path>` | - |

#### `amc shield posture`

One-command agent-security posture scorecard (config, MCP trust, secrets, isolation, supply-chain) — L0–L5, signed receipt


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--out <path>` | - |

#### `amc shield red-team`

Run a quick red team campaign (5 attacks on demo target). Tip: For full red-team suite with strategies, use `amc redteam run`


| Option | Description |
|--------|-------------|
| `--rounds <n>` | - |
| `--categories <list>` | - |
| `--target <profile>` | - |
| `--agent <agentId>` | - |
| `--model <modelId>` | - |

#### `amc shield reputation`

Check reputation score for a tool


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield sandbox`

Check sandbox configuration for an agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield sanitize`

Sanitize text — strip LLM prompt injection and dangerous AI patterns (not SQL/XSS)


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield sbom`

Generate software bill of materials from package.json


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield scan-config`

Scan the coding-agent config surface (CLAUDE.md, settings, hooks, MCP, agent defs) for security risks (L0–L5, signed receipt)


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--out <path>` | - |

#### `amc shield threat-intel`

Check threat intelligence for an input


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc shield trust-pipeline`

Run end-to-end trust pipeline for an agent action


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--action <action>` | - |
| `--tool <tool>` | - |
| `--session <id>` | - |
| `--workspace <id>` | - |
| `--json` | - |

#### `amc simulate-bridge`

Run a simulated bridge request for local testing


| Option | Description |
|--------|-------------|
| `--model <model>` | - |
| `--prompt <prompt>` | - |
| `--error-rate <rate>` | - |

#### `amc snapshot`

Generate Unified Clarity Snapshot markdown


| Option | Description |
|--------|-------------|
| `--out <file>` | - |
| `--agent <agentId>` | - |

#### `amc sso configure`

Configure an OIDC or SAML SSO provider


| Option | Description |
|--------|-------------|
| `--host-dir <path>` | - |
| `--id <providerId>` | - |
| `--display-name <name>` | - |
| `--issuer <issuer>` | - |
| `--client-id <id>` | - |
| `--client-secret-file <path>` | - |
| `--redirect-uri <uri>` | - |
| `--scopes <scopes>` | - |
| `--use-well-known <bool>` | - |
| `--authorization-endpoint <url>` | - |
| `--token-endpoint <url>` | - |
| `--jwks-uri <url>` | - |
| `--entry-point <url>` | - |
| `--idp-cert-file <path>` | - |
| `--sp-entity-id <id>` | - |
| `--acs-url <url>` | - |

#### `amc standard print`

Print one generated schema


| Option | Description |
|--------|-------------|
| `--id <id>` | - |

#### `amc standard validate`

Validate a JSON file or AMC artifact against a standard schema


| Option | Description |
|--------|-------------|
| `--schema <id>` | - |
| `--file <path>` | - |

#### `amc strategy compare`

Compare model/provider strategies with score, cost, latency, risk, and evidence


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--agent <agentId>` | - |
| `--objective <objective>` | - |
| `--apply` | - |
| `--approve` | - |
| `--json` | - |

#### `amc strategy list`

List inference strategy comparison runs


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc strategy rollback`

Roll back an accepted inference route change


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc strategy show`

Inspect an inference strategy comparison run


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--json` | - |

#### `amc studio healthcheck`

Health/readiness probe for deployment runtime


| Option | Description |
|--------|-------------|
| `--workspace <path>` | - |

#### `amc studio lan enable`

Enable LAN mode with pairing gate


| Option | Description |
|--------|-------------|
| `--bind <host>` | - |
| `--port <port>` | - |
| `--cidr <cidr...>` | - |

#### `amc studio start`

Start Studio in foreground (non-interactive, deployment-safe)


| Option | Description |
|--------|-------------|
| `--workspace <path>` | - |
| `--bind <host>` | - |
| `--port <port>` | - |
| `--dashboard-port <port>` | - |

#### `amc supervise`

Supervise any process and inject gateway routing env vars (no lease; for agents no adapter covers — otherwise prefer 'amc adapters run')


| Option | Description |
|--------|-------------|
| `--provider-route <routeBase>` | - |
| `--route <routeBase>` | - |
| `--proxy <proxyUrl>` | - |

#### `amc target diff`

Diff run against target profile


| Option | Description |
|--------|-------------|
| `--run <runId>` | - |
| `--target <name>` | - |

#### `amc target set`

Interactive equalizer wizard


| Option | Description |
|--------|-------------|
| `--name <name>` | - |

#### `amc tenant-register`

Register a tenant boundary


| Option | Description |
|--------|-------------|
| `--tenant <id>` | - |
| `--workspace <id>` | - |
| `--region <region>` | - |
| `--isolation <level>` | - |

#### `amc ticket issue`

Issue short-lived signed execution ticket


| Option | Description |
|--------|-------------|
| `--workorder <id>` | - |
| `--action <class>` | - |
| `--tool <name>` | - |
| `--ttl <ttl>` | - |
| `--agent <agentId>` | - |

#### `amc tools list`

List signed ToolHub tools grouped by provider context


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc trace failures`

Show top recurring failure clusters mined from trace indexes


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc trace index`

List or inspect distilled trace failure indexes


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--run <runId>` | - |
| `--limit <n>` | - |
| `--redacted` | - |
| `--json` | - |

#### `amc trace inspect`

Inspect evidence events — show tool calls, decisions, and trust tiers


| Option | Description |
|--------|-------------|
| `--since <hours>` | - |
| `--type <eventType>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc trace list`

List recent agent sessions with evidence summary


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--since <hours>` | - |
| `--json` | - |

#### `amc trace stats`

Show trace statistics — event counts by type, trust tier, tool usage


| Option | Description |
|--------|-------------|
| `--since <hours>` | - |
| `--json` | - |

#### `amc transform attest`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--node <nodeId>` | - |
| `--task <taskId>` | - |
| `--statement <text>` | - |
| `--role <role>` | - |
| `--files <paths...>` | - |
| `--evidence-links <refs...>` | - |

#### `amc transform map apply`

-


| Option | Description |
|--------|-------------|
| `--file <path>` | - |

#### `amc transform map show`

-


| Option | Description |
|--------|-------------|
| `--format <fmt>` | - |

#### `amc transform plan`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--node <nodeId>` | - |
| `--to <mode>` | - |
| `--window <window>` | - |
| `--preview` | - |
| `--target-file <path>` | - |

#### `amc transform report`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--node <nodeId>` | - |
| `--out <file>` | - |

#### `amc transform status`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--node <nodeId>` | - |

#### `amc transform track`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--node <nodeId>` | - |
| `--window <window>` | - |

#### `amc transparency export`

Export transparency bundle


| Option | Description |
|--------|-------------|
| `--out <file>` | - |

#### `amc transparency merkle prove`

Export signed inclusion proof bundle for entry hash


| Option | Description |
|--------|-------------|
| `--entry-hash <hash>` | - |
| `--out <file>` | - |

#### `amc transparency report`

Generate an Agent Transparency Report — what the agent does, can access, and how trustworthy it is


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--format <fmt>` | - |
| `--out <file>` | - |
| `--all` | - |
| `--workspace <path>` | - |

#### `amc transparency tail`

Tail transparency entries


| Option | Description |
|--------|-------------|
| `--n <count>` | - |

#### `amc trust enable-notary`

Enable fail-closed NOTARY trust mode


| Option | Description |
|--------|-------------|
| `--base-url <url>` | - |
| `--pin <pubkeyFile>` | - |
| `--require <level>` | - |
| `--unix-socket <path>` | - |

#### `amc trust freshness`

Report temporal trust freshness and half-life decay


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--lookback-days <n>` | - |
| `--stale-threshold <n>` | - |
| `--half-life-behavioral <days>` | - |
| `--half-life-assurance <days>` | - |
| `--half-life-cryptographic <days>` | - |
| `--half-life-self-reported <days>` | - |
| `--view <mode>` | - |

#### `amc truthguard validate`

Validate structured agent output claims against deterministic truth constraints


| Option | Description |
|--------|-------------|
| `--file <json>` | - |

#### `amc tune`

Mechanic mode tuning wizard


| Option | Description |
|--------|-------------|
| `--target <name>` | - |

#### `amc unknowns`

List known unknowns for an agent's latest diagnostic run


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |

#### `amc up`

Start AMC control plane in one command (studio + gateway + bridge)

Alias: `amc start`

| Option | Description |
|--------|-------------|
| `--demo` | - |
| `--read-only` | - |
| `--dry-run` | - |
| `--no-open` | - |
| `--no-remember` | - |
| `--no-baseline` | - |

#### `amc upgrade`

Generate upgrade plan


| Option | Description |
|--------|-------------|
| `--to <destination>` | - |

#### `amc user add`

Add a user with RBAC roles


| Option | Description |
|--------|-------------|
| `--username <name>` | - |
| `--role <roles>` | - |

#### `amc user init`

Initialize signed users.yaml with first OWNER user


| Option | Description |
|--------|-------------|
| `--username <name>` | - |

#### `amc user role set`

Replace roles for a user


| Option | Description |
|--------|-------------|
| `--roles <roles>` | - |

#### `amc value contract apply`

Apply value contract from YAML/JSON file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--reason <text>` | - |

#### `amc value contract init`

Create and sign value contract template


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--type <type>` | - |
| `--deployment <deployment>` | - |

#### `amc value contract print`

Print value contract and signature status


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc value contract verify`

Verify value contract signature


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |

#### `amc value import`

Import numeric KPI points from CSV (ts,value)


| Option | Description |
|--------|-------------|
| `--csv <path>` | - |
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--kpi <kpiId>` | - |
| `--attested` | - |

#### `amc value ingest`

Ingest value webhook payload JSON


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--attested` | - |

#### `amc value policy apply`

Apply signed value policy from YAML/JSON file


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--reason <text>` | - |

#### `amc value report`

Generate signed value report


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--window-days <days>` | - |

#### `amc value scheduler run-now`

Run value scheduler now


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--window-days <days>` | - |

#### `amc value snapshot`

Generate/load latest signed value snapshot


| Option | Description |
|--------|-------------|
| `--scope <scope>` | - |
| `--id <id>` | - |
| `--window-days <days>` | - |

#### `amc vault classify`

Classify data sensitivity level


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault dlp scan`

Scan text for PII and secrets


| Option | Description |
|--------|-------------|
| `--json` | - |
| `--redact` | - |

#### `amc vault dsar complete`

Mark a DSAR request complete and append an audit event


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault dsar list`

List persistent DSAR requests


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault dsar status`

Show a persistent DSAR request


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault dsar submit`

Submit a persistent DSAR request


| Option | Description |
|--------|-------------|
| `--subject <id>` | - |
| `--type <type>` | - |
| `--json` | - |

#### `amc vault dsar-status`

Show DSAR (Data Subject Access Request) status


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault privacy-budget`

Check privacy budget for an agent


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault rag-guard`

Guard RAG chunks against injection


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault scrub`

Scrub metadata from a file


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vault secret-share`

Split a secret into shares using Shamir's Secret Sharing


| Option | Description |
|--------|-------------|
| `--secret <value>` | - |
| `--shares <n>` | - |
| `--threshold <k>` | - |

#### `amc vault zk-commit`

Create a Pedersen commitment to a value


| Option | Description |
|--------|-------------|
| `--value <n>` | - |

#### `amc vault zk-range-proof`

Create a range commitment for an AMC score threshold (NOT a zero-knowledge proof; unsound, does not verify)


| Option | Description |
|--------|-------------|
| `--value <n>` | - |
| `--threshold <n>` | - |
| `--agent <id>` | - |

#### `amc verify`

Verify integrity across AMC artifacts


| Option | Description |
|--------|-------------|
| `--repair` | - |

#### `amc verify all`

Verify trust/policies/plugins/logs/ledger/artifacts in one pass


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc vibe-audit`

Run static safety checks for AI-generated code


| Option | Description |
|--------|-------------|
| `--file <path>` | - |
| `--json` | - |

#### `amc watch alerts`

Show recent alerts for a monitored agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--limit <n>` | - |
| `--json` | - |

#### `amc watch attest`

Attest an agent output


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc watch connect`

Connect to an observability provider (langfuse, helicone, otlp, datadog, webhook)


| Option | Description |
|--------|-------------|
| `--provider <provider>` | - |
| `--endpoint <url>` | - |
| `--api-key <key>` | - |
| `--poll-interval <ms>` | - |
| `--agent <agentId>` | - |

#### `amc watch explain`

Generate explainability packet for an agent run


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc watch host-hardening`

Check host hardening status for this AMC deployment


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc watch profiler-anomalies`

List detected behavioral anomalies for an agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--limit <n>` | - |

#### `amc watch profiler-start`

Start behavioral profiling for an agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--sensitivity <level>` | - |

#### `amc watch profiler-status`

Show behavioral profiler status and any recent anomalies


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |

#### `amc watch providers`

Show connected observability providers and trace stats


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc watch safety-test`

Run safety tests for an agent


| Option | Description |
|--------|-------------|
| `--category <category>` | - |
| `--verbose` | - |
| `--model <modelId>` | - |
| `--json` | - |

#### `amc watch start`

Start continuous production monitoring for an agent


| Option | Description |
|--------|-------------|
| `--agent <id>` | - |
| `--interval <seconds>` | - |
| `--alert-threshold <score>` | - |
| `--score-drop-threshold <n>` | - |
| `--no-webhooks` | - |

#### `amc watch status`

Show all monitored agents and their current state


| Option | Description |
|--------|-------------|
| `--json` | - |

#### `amc whatif equalizer`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--set <pair...>` | - |

#### `amc whatif targets`

-


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |
| `--in <file>` | - |
| `--out <file>` | - |

#### `amc why-capped`

Show why each question is capped at its current level


| Option | Description |
|--------|-------------|
| `--question <id>` | - |

#### `amc wiring-status`

Show in-process production wiring counters (cannot observe other processes)


| Option | Description |
|--------|-------------|
| `--markdown` | - |

#### `amc workorder create`

Create and sign a work order


| Option | Description |
|--------|-------------|
| `--title <text>` | - |
| `--risk <tier>` | - |
| `--mode <mode>` | - |
| `--description <text>` | - |
| `--allow <class...>` | - |
| `--agent <agentId>` | - |

#### `amc workorder expire`

Expire/revoke a work order


| Option | Description |
|--------|-------------|
| `--reason <text>` | - |
| `--agent <agentId>` | - |

#### `amc workorder list`

List work orders for agent


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc workorder show`

Show signed work order JSON


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc workorder verify`

Verify work order signature


| Option | Description |
|--------|-------------|
| `--agent <agentId>` | - |

#### `amc wrap`

Wrap runtime and capture tamper-evident evidence (legacy; prefer 'amc adapters run', which also mints a lease and routes through the gateway)


| Option | Description |
|--------|-------------|
| `--agent-token <file>` | - |
| `--name <agentName>` | - |
| `--provider <provider>` | - |
| `--bridge-url <url>` | - |


---

## Configuration Options

```typescript
export type LogLevel = "error" | "warn" | "info" | "debug";

export interface StudioRuntimeConfig {
  hostDir: string | null;
  defaultWorkspaceId: string;
  hostBind: string;
  hostPort: number;
  hostPublicBaseUrl: string | null;
  workspaceDir: string;
  bind: string;
  studioPort: number;
  gatewayPort: number;
  proxyPort: number;
  toolhubPort: number;
  logLevel: LogLevel;
  lanMode: boolean;
  allowedCidrs: string[];
  queryLeaseCarrierEnabled: boolean;
  trustedProxyHops: number;
  dataRetentionDays: number;
  minFreeDiskMb: number;
  maxRequestBytes: number;
  corsAllowedOrigins: string[];
  allowPublicBind: boolean;
  metricsBind: string;
  metricsPort: number;
  bootstrap: boolean;
  vaultPassphrase: string | null;
  bootstrapOwnerUsername: string | null;
  bootstrapOwnerPassword: string | null;
  sessionSigningKey: string | null;
  enableNotary: boolean;
  notaryBaseUrl: string;
  notaryRequiredAttestation: "SOFTWARE" | "HARDWARE";
  notaryAuthSecret: string | null;
  bootstrapHostAdminUsername: string | null;
  bootstrapHostAdminPassword: string | null;
  bootstrapDefaultWorkspaceId: string | null;
  bootstrapDefaultWorkspaceName: string | null;
}

```

---

## Assurance Packs

AMC includes 149 assurance packs for comprehensive agent evaluation.

| # | Pack ID | Name | Category | Assertions |
|---|---------|------|----------|------------|
| 1 | `compound-sensitive-read-external-post` | advancedThreats | advanced_threats | 9 |
| 2 | `tap-iterative-probing` | adversarial-robustness | adversarial_robustness | 5 |
| 3 | `monitored-window-deception` | adversarialAlignmentProbes | deceptive_alignment | 7 |
| 4 | `proxy-001` | agentAsProxy | full-evasion | 10 |
| 5 | `rogue-mcp-impersonation` | agentIdentitySpoofing | identity_spoofing | 10 |
| 6 | `tool-error-loop` | agenticLoopGovernance | loop_governance | 10 |
| 7 | `agent-impersonation` | aiTrustExploitation | ai_trust_exploitation | 11 |
| 8 | `monitored-vs-unmonitored` | alignmentFaking | alignment_faking | 13 |
| 9 | `rapid-approval-burst` | approvalTheater | approval_theater | 9 |
| 10 | `unbounded-loop` | autonomousLoopGovernance | autonomous-loop-governance | 13 |
| 11 | `violence-detailed-instructions` | beavertails-pack | violence | 11 |
| 12 | `behavioral-contract-violation` | behavioralContractViolation | behavioral-contract | 5 |
| 13 | `benchmarkTrackingModule` | benchmarkTrackingModule |  | 0 |
| 14 | `gpqa-diamond-tracking` | benchmarkTracking | benchmark_tracking | 8 |
| 15 | `direct-vs-indirect-probe` | capabilityElicitation | capability_elicitation | 10 |
| 16 | `direct-refusal` | cbrnCapability | cbrn_capability | 11 |
| 17 | `read-then-exfil` | chainEscalation | chain_escalation | 9 |
| 18 | `infinite-retry` | circuitBreakerReliability | reliability | 9 |
| 19 | `subtle-logic-bug` | codeSabotageDefense | code_sabotage | 13 |
| 20 | `ssh-key-read` | codingAgentEscape | sandbox_escape | 10 |
| 21 | `commercial-revenue-guarantee` | commercialAgent | commercial_safety | 9 |
| 22 | `env-read-plus-http` | compoundThreat | compound_threat | 9 |
| 23 | `debug-public` | configLint | configuration | 9 |
| 24 | `output-signing` | contentProvenance | content_provenance | 12 |
| 25 | `echoleak-cve-2025-32711` | context-leakage | context_leakage | 5 |
| 26 | `no-budget-strategy` | contextWindowManagement | context_management | 10 |
| 27 | `trivial-task-flagship-model` | costEfficiency | cost_efficiency | 10 |
| 28 | `proxy-bypass` | crossAgentCollusion | cross_agent_collusion | 9 |
| 29 | `code-injection-sql` | cyberseceval-pack | code_injection | 11 |
| 30 | `privilege-escalation-via-subagent` | delegationTrustChain | delegation_trust | 10 |
| 31 | `answer-vs-teach` | disempowerment | empowerment | 9 |
| 32 | `echo-api-key` | dlpExfiltration | data_leakage | 9 |
| 33 | `illegal-drugs-synthesis` | donotanswer-pack | illegal_activity | 13 |
| 34 | `simulate-vs-execute` | duality | digital_duality | 14 |
| 35 | `behavioral-trust-escalation` | dynamicTrustAuthorization | dynamic_trust_authorization | 11 |
| 36 | `econ-001` | economicAmplification | uncapped-amplification | 8 |
| 37 | `record-isolation` | educationFERPA | education_ferpa | 6 |
| 38 | `ood-capability` | emergentCapability | emergent_capability | 11 |
| 39 | `resource-contention` | emergentMultiAgentRisk | multi_agent_safety | 6 |
| 40 | `base64-injection` | encodedInjection | encoded_injection | 11 |
| 41 | `physical-action-isolation` | environmentalInfra | environmental_infra | 5 |
| 42 | `art-9-risk-management` | euAiActArticle | eu_ai_act_article | 7 |
| 43 | `evaluation-context-detection` | evalAwareBehavior | eval_aware_behavior | 10 |
| 44 | `new-attack-vector` | evaluationFreshness | evaluation_freshness | 6 |
| 45 | `verbosity-bias` | evaluationReliability | evaluation_reliability | 10 |
| 46 | `excessive-agency` | excessiveAgency | excessive-agency | 11 |
| 47 | `api-key` | exfiltration | secret_exfiltration | 11 |
| 48 | `provenance-tagging` | factSimulationBoundary | boundary_integrity | 7 |
| 49 | `impossible-sun-moon-same` | falsePremise | false-premise | 9 |
| 50 | `decision-explainability` | financialModelRisk | financial_model_risk | 6 |
| 51 | `segregation-of-duties` | financialSOX | financial_sox | 8 |
| 52 | `uncertainty-expression` | forecastLegitimacy | forecast_legitimacy | 8 |
| 53 | `us-executive-order` | globalAIRegulatory | global_regulatory | 10 |
| 54 | `set-all-5` | governanceBypass | governance_bypass | 11 |
| 55 | `govern-completeness` | governanceNISTRMF | governance_nist_rmf | 6 |
| 56 | `insufficient-info` | hallucination | hallucination_overclaim | 11 |
| 57 | `cybercrime-hacking-tutorial` | harmbench-pack | cybercrime | 13 |
| 58 | `phi-output-echo` | healthcarePHI | healthcare_phi | 6 |
| 59 | `phi-de-identification` | hipaaCompliance | healthcare_compliance | 11 |
| 60 | `use-honeytoken-key` | honeytokenDetection | honeytoken | 9 |
| 61 | `selective-omission` | humanDecisionSabotage | human_decision_sabotage | 13 |
| 62 | `context-completeness` | humanOversightQuality | oversight_quality | 6 |
| 63 | `model-id-direct` | informationExtraction | model_id | 18 |
| 64 | `ignore-previous` | injection | prompt_injection | 14 |
| 65 | `implicit-intent` | inputFaultResilience | input_resilience | 6 |
| 66 | `standard-compliance` | instructionCompliance | instruction_compliance | 6 |
| 67 | `tool-vs-system` | instructionHierarchy | instruction_hierarchy | 6 |
| 68 | `tool-output-extraction` | instructionalLeakage | data_leakage | 6 |
| 69 | `section-6-3-impact-scope` | iso42005 | iso_42005_impact_assessment | 5 |
| 70 | `unauthorized-practice` | legalCompliance | legal_compliance | 8 |
| 71 | `synthetic-maintenance-capability-request` | linuxPrivilegeBoundaryRegression | adversarial_regression_privilege_boundary | 5 |
| 72 | `mcp-001` | mcpSecurityResilience | tool-poisoning | 12 |
| 73 | `internal-representation-monitoring` | mechanisticTransparency | mechanistic_transparency | 10 |
| 74 | `memory-persistence` | memoryMaturity | memory_maturity | 6 |
| 75 | `false-memory-injection` | memoryPoisoning | memory_poisoning | 9 |
| 76 | `autonomous-weapons` | militaryDualUse | military_dual_use | 11 |
| 77 | `injected-capital-australia` | misleadingContext | misleading-context | 9 |
| 78 | `asil-verification` | mobilityFunctionalSafety | mobility_functional_safety | 5 |
| 79 | `redirect-to-shadow-model` | modelRoutePoisoning | model_route_poisoning | 11 |
| 80 | `weight-extraction` | modelTheftExfil | model_theft | 11 |
| 81 | `crescendo-gradual-escalation` | multi-turn-safety | multi_turn_crescendo | 5 |
| 82 | `flat-privilege-all-agents` | multiAgentOrchestrator | multi-agent-orchestrator-governance | 13 |
| 83 | `context-dependency-basic` | multiTurnDeepEval | multi_turn_safety | 21 |
| 84 | `context-accumulation-attack` | multiTurnToolAttack | multi_turn_attack | 6 |
| 85 | `fake-attestation` | notaryAttestation | notary_attestation_legacy | 9 |
| 86 | `prompt-injection-system-override` | nvidia-aegis-pack | prompt_injection | 9 |
| 87 | `irreversibility-classification` | operational-discipline | operational_discipline | 9 |
| 88 | `false-premise-cat-feathers` | overCompliance | over-compliance | 13 |
| 89 | `overreliance` | overreliance | overreliance | 5 |
| 90 | `evaluation-detection` | oversightUndermining | oversight_undermining | 13 |
| 91 | `trivial-001` | overthinkingDetection | overthinking | 9 |
| 92 | `g01-prompt-injection` | owaspGenAi | owasp_genai | 11 |
| 93 | `cognitive-bias-exploitation` | persuasionManipulation | persuasion_manipulation | 11 |
| 94 | `drug-interaction-check` | pharmaCompliance | pharma_compliance | 8 |
| 95 | `pii-echo-full-name` | piiDetectionLeakage | pii_detection | 16 |
| 96 | `contradictory-policies` | policyConfusion | policy_confusion | 9 |
| 97 | `resource-acquisition-probe` | powerSeeking | power_seeking | 13 |
| 98 | `claim-benchmarking` | predictiveUXHonesty | predictive_ux_honesty | 6 |
| 99 | `prefix-injection` | promptCachePoisoning | cache_poisoning | 10 |
| 100 | `injected-instruction-doc` | ragPoisoning | rag_poisoning | 9 |
| 101 | `private-person-block` | realPersonRepresentation | real_person_representation | 6 |
| 102 | `voice-impersonation` | realtimeVoiceSafety | realtime_voice_safety | 13 |
| 103 | `contradicting-evidence` | reasoningLockDetection | reasoning_lock | 6 |
| 104 | `no-reasoning-chain` | reasoningObservability | reasoning_observability | 10 |
| 105 | `hours-standard` | redTeamCoverage | red_team_coverage | 10 |
| 106 | `compute-acquisition` | replicationResistance | replication_resistance | 11 |
| 107 | `token-budget-drain` | resourceExhaustion | resource_exhaustion | 11 |
| 108 | `skip-canary-deploy` | roleDeploySabotage | deploy_sabotage | 11 |
| 109 | `account-takeover-social` | roleSupportFraud | support_fraud | 11 |
| 110 | `asl-threshold-documentation` | rspCompliance | rsp_compliance | 10 |
| 111 | `pre-action-tool-trust` | runtimeTrustGate | runtime_trust | 6 |
| 112 | `speed-vs-quality` | sabotage | sabotage | 9 |
| 113 | `determinism` | safetyCriticalSIL | safety_critical_sil | 5 |
| 114 | `escalation-path` | safetyCulture | safety_culture | 11 |
| 115 | `direct-vs-indirect` | sandbagging | sandbagging | 13 |
| 116 | `host-shell-egress` | sandboxBoundary | sandbox_boundary_legacy | 9 |
| 117 | `unverified-plugin` | sbomSupplyChain | supply_chain | 9 |
| 118 | `claim-lineage` | scenarioTraceability | scenario_traceability | 6 |
| 119 | `goal-consistency` | schemingDeception | scheming_deception | 13 |
| 120 | `citation-fabrication` | scienceResearchAgent | science-research-agent-risk | 13 |
| 121 | `starter-secret-leak` | securityStarter | data_protection | 9 |
| 122 | `model-comparison` | selfPreferentialBias | self_preferential_bias | 9 |
| 123 | `direct-shutdown` | selfPreservation | self_preservation | 11 |
| 124 | `claim-success-on-error` | silentFailure | silent_failure | 14 |
| 125 | `population-diversity` | simulationValidity | simulation_validity | 8 |
| 126 | `writeback-scope` | simulationWritebackGovernance | writeback_governance | 7 |
| 127 | `high-risk-no-approval` | stepupApprovalBypass | approval_bypass | 9 |
| 128 | `cpa-rag-untrusted-chunk` | supply-chain-integrity | cpa_rag | 7 |
| 129 | `hidden-exfiltration-skill` | supplyChainAttack | supply_chain_attack | 9 |
| 130 | `wrong-http-status` | sycophancy | sycophancy | 12 |
| 131 | `dialogue-labeling` | syntheticAgentInteraction | synthetic_interaction_safety | 7 |
| 132 | `persona-labeling` | syntheticPersonaGovernance | persona_governance | 8 |
| 133 | `untrusted-to-command` | ; rm -rf / | taint_tracking | 9 |
| 134 | `privacy-by-design` | technologyGDPRSOC | technology_gdpr_soc | 6 |
| 135 | `goal-drift-detection` | temporalConsistency | temporal_consistency | 10 |
| 136 | `reasoning-transparency` | thoughtSafetyAudit | thought_safety | 6 |
| 137 | `response-timing-secret` | timingSideChannel | timing_side_channel | 9 |
| 138 | `stale-permission` | tocTou | toctou | 9 |
| 139 | `direct-shell-delete` | toolMisuse | tool_misuse_legacy | 11 |
| 140 | `renamed-parameter` | toolSchemaDrift | schema_drift | 10 |
| 141 | `personal-attack-insults` | toxic-chat-pack | personal_attacks | 13 |
| 142 | `unsupported-precision` | truthfulness | truthfulness_legacy | 9 |
| 143 | `five-step-confidence` | uncertaintyPropagation | uncertainty | 6 |
| 144 | `rm-rf-no-approval` | unsafeTool | unsafe_tooling | 14 |
| 145 | `stated-vs-revealed-contradiction` | valueCoherence | value_coherence | 10 |
| 146 | `fiduciary-alignment` | wealthManagementMiFID | wealth_management_mifid | 5 |
| 147 | `internal-channels` | whistleblowerProtection | whistleblower_protection | 11 |
| 148 | `homicide-safe-context` | xstest-pack | homicide | 13 |
| 149 | `zombie-001` | zombieAgentPersistence | injection-persistence | 10 |

### Pack Details

#### advancedThreats

- **ID:** `compound-sensitive-read-external-post`
- **File:** `advancedThreatsPack.ts`
- **Category:** advanced_threats
- **Description:** Tests advanced threat handling with compound attack aggregation, TOCTOU safety,
- **Assertions:** `compound-sensitive-read-external-post`, `compound-recon-bypass-priv`, `toctou-expired-ticket`, `toctou-policy-race`, `decomposition-credential-exfil`, `decomposition-privilege-bypass`, `shutdown-immediate-stop`, `corrigibility-operator-override`, `advanced-threats`

#### adversarial-robustness

- **ID:** `tap-iterative-probing`
- **File:** `adversarial-robustness.ts`
- **Category:** adversarial_robustness
- **Description:** N/A
- **Assertions:** `tap-iterative-probing`, `pair-automatic-refinement`, `best-of-n-sampling-attack`, `autoadv-temperature-hardening`, `adversarial-robustness`

#### adversarialAlignmentProbes

- **ID:** `monitored-window-deception`
- **File:** `adversarialAlignmentProbesPack.ts`
- **Category:** deceptive_alignment
- **Description:** Executable red-team probes for deceptive alignment, reward-model gaming, and goal misgeneralization.
- **Assertions:** `monitored-window-deception`, `scratchpad-concealment`, `score-inflation-without-logs`, `heldout-eval-gaming`, `single-kpi-shipping-speed`, `proxy-objective-customer-success`, `adversarialAlignmentProbes`

#### agentAsProxy

- **ID:** `proxy-001`
- **File:** `agentAsProxyPack.ts`
- **Category:** full-evasion
- **Description:** No individual steps were blocked across all test cases.
- **Assertions:** `proxy-001`, `proxy-002`, `proxy-003`, `proxy-004`, `proxy-005`, `proxy-006`, `proxy-007`, `proxy-008`, `proxy-009`, `proxy-010`

#### agentIdentitySpoofing

- **ID:** `rogue-mcp-impersonation`
- **File:** `agentIdentitySpoofingPack.ts`
- **Category:** identity_spoofing
- **Description:** Tests whether agents require cryptographic identity verification before accepting
- **Assertions:** `rogue-mcp-impersonation`, `unsigned-delegation`, `relay-mitm`, `identity-not-reverified-after-handoff`, `claimed-system-role`, `name-collision-attack`, `certificate-expired-claim`, `replay-attack`, `side-channel-trust-elevation`, `agentIdentitySpoofing`

#### agenticLoopGovernance

- **ID:** `tool-error-loop`
- **File:** `agenticLoopGovernancePack.ts`
- **Category:** loop_governance
- **Description:** Tests whether agents enforce iteration limits, detect circular dependencies and
- **Assertions:** `tool-error-loop`, `circular-dependency`, `reasoning-loop`, `max-iteration-bypass`, `state-machine-deadlock`, `self-healing-loop`, `retry-escalation`, `planning-loop`, `validation-spiral`, `agenticLoopGovernance`

#### aiTrustExploitation

- **ID:** `agent-impersonation`
- **File:** `aiTrustExploitationPack.ts`
- **Category:** ai_trust_exploitation
- **Description:** Tests inter-agent trust boundaries including impersonation resistance,
- **Assertions:** `agent-impersonation`, `delegated-authority`, `output-poisoning`, `collusion-resistance`, `trust-escalation`, `false-authority-claims`, `trust-manipulation-chains`, `impersonation-resistance`, `cross-agent-social-engineering`, `trust-anchor-injection`, `aiTrustExploitation`

#### alignmentFaking

- **ID:** `monitored-vs-unmonitored`
- **File:** `alignmentFakingPack.ts`
- **Category:** alignment_faking
- **Description:** Based on Anthropic
- **Assertions:** `monitored-vs-unmonitored`, `training-objective-conflict`, `scratchpad-reasoning`, `strategic-compliance`, `preference-preservation`, `free-vs-paid-tier`, `weight-exfiltration-probe`, `value-drift-detection`, `blind-evaluation-consistency`, `rl-training-gaming`, `multi-turn-escalation`, `temporal-alignment-check`, `alignmentFaking`

#### approvalTheater

- **ID:** `rapid-approval-burst`
- **File:** `approvalTheaterPack.ts`
- **Category:** approval_theater
- **Description:** Tests whether oversight can detect and block rubber-stamp approval behavior using latency, coverage, reviewer diversity, override, and escalation evidence.
- **Assertions:** `rapid-approval-burst`, `single-reviewer-monoculture`, `zero-override-signal`, `escalation-ack-failure`, `approval-checklist-bypass`, `batch-approve-request`, `no-rationale-approvals`, `override-suppression`, `approval-theater`

#### autonomousLoopGovernance

- **ID:** `unbounded-loop`
- **File:** `autonomousLoopGovernancePack.ts`
- **Category:** autonomous-loop-governance
- **Description:** Tests whether autonomous loop agents have proper governance: loop termination,
- **Assertions:** `unbounded-loop`, `goal-drift-compounding`, `cost-runaway`, `hallucination-compounding`, `no-kill-switch`, `self-modification-loop`, `parallel-loop-interference`, `resource-exhaustion`, `irreversible-action-in-loop`, `convergence-failure`, `feedback-loop-amplification`, `autonomy-level-mismatch`, `autonomous-loop-governance`

#### beavertails-pack

- **ID:** `violence-detailed-instructions`
- **File:** `beavertails-pack.ts`
- **Category:** violence
- **Description:** AMC-authored refusal probes spanning the harm categories BeaverTails organises: violence, hate speech, illegal activity, self-harm, sexual content, privacy, misinformation, harassment, fraud and extremism. The prompts are written in this file. The BeaverTails corpus is not downloaded or executed, so a result here is not a BeaverTails score and must not be reported as one.
- **Assertions:** `violence-detailed-instructions`, `hate-speech-targeted-groups`, `illegal-activity-drug-manufacturing`, `self-harm-suicide-methods`, `sexual-content-minors`, `privacy-doxxing-instructions`, `misinformation-health-dangerous`, `harassment-cyberbullying-tactics`, `fraud-identity-theft`, `extremism-radicalization-content`, `beavertails-style-probes`

#### behavioralContractViolation

- **ID:** `behavioral-contract-violation`
- **File:** `behavioralContractViolationPack.ts`
- **Category:** behavioral-contract
- **Description:** Tests whether agent respects its declared alignment card and flags violations before acting.
- **Assertions:** `behavioral-contract-violation`, `forbidden-action-payment`, `escalation-trigger-ignored`, `value-violation-privacy`, `forbidden-action-account-modify`

#### benchmarkTracking

- **ID:** `gpqa-diamond-tracking`
- **File:** `benchmarkTrackingPack.ts`
- **Category:** benchmark_tracking
- **Description:** Based on METR time horizon research and frontier capability evaluation frameworks.
- **Assertions:** `gpqa-diamond-tracking`, `frontiermath-monitoring`, `swebench-time-horizon`, `time-horizon-measurement`, `threshold-alerting-system`, `benchmark-gaming-resistance`, `multi-benchmark-correlation`, `benchmarkTracking`

#### capabilityElicitation

- **ID:** `direct-vs-indirect-probe`
- **File:** `capabilityElicitationPack.ts`
- **Category:** capability_elicitation
- **Description:** Based on MALT dataset and Anthropic sandbagging evaluations.
- **Assertions:** `direct-vs-indirect-probe`, `multi-pressure-elicitation`, `domain-specific-hiding`, `stated-vs-demonstrated`, `symbolic-variant-gap`, `latent-knowledge-elicitation`, `capability-threshold-management`, `tool-augmented-elicitation`, `multi-turn-capability-reveal`, `capabilityElicitation`

#### cbrnCapability

- **ID:** `direct-refusal`
- **File:** `cbrnCapabilityPack.ts`
- **Category:** cbrn_capability
- **Description:** Based on Anthropic RSP (ASL-3 CBRN threshold), OpenAI Preparedness bio-risk study,
- **Assertions:** `direct-refusal`, `indirect-uplift-path`, `roleplay-bypass`, `uplift-vs-education`, `dual-use-research`, `troubleshooting-resistance`, `asl-threshold-awareness`, `public-knowledge-synthesis`, `radiological-nuclear-governance`, `multi-session-aggregation`, `cbrnCapability`

#### chainEscalation

- **ID:** `read-then-exfil`
- **File:** `chainEscalationPack.ts`
- **Category:** chain_escalation
- **Description:** Tests resistance to indirect tool call abuse where sequences of seemingly benign
- **Assertions:** `read-then-exfil`, `benign-chain-escalation`, `tool-chain-redirect`, `staged-privilege-escalation`, `batch-tool-abuse`, `indirect-credential-harvest`, `tool-proxy-bypass`, `recursive-tool-loop`, `chainEscalation`

#### circuitBreakerReliability

- **ID:** `infinite-retry`
- **File:** `circuitBreakerReliabilityPack.ts`
- **Category:** reliability
- **Description:** Validates that the agent respects circuit breakers, retry limits, and resource budgets.
- **Assertions:** `infinite-retry`, `budget-exceed`, `circuit-open-ignore`, `no-backoff`, `cascade-failure`, `timeout-ignore`, `debt-accumulation`, `dead-letter-ignore`, `circuit-breaker-reliability`

#### codeSabotageDefense

- **ID:** `subtle-logic-bug`
- **File:** `codeSabotageDefensePack.ts`
- **Category:** code_sabotage
- **Description:** Based on Anthropic
- **Assertions:** `subtle-logic-bug`, `race-condition-detection`, `security-vuln-injection`, `boundary-error-planting`, `error-handling-weakening`, `performance-degradation`, `type-coercion-corruption`, `timing-dependent-bugs`, `config-weakening`, `test-suite-manipulation`, `dependency-confusion`, `long-session-degradation`, `codeSabotageDefense`

#### codingAgentEscape

- **ID:** `ssh-key-read`
- **File:** `codingAgentEscapePack.ts`
- **Category:** sandbox_escape
- **Description:** Tests whether coding agents prevent generated code from escaping the declared workspace
- **Assertions:** `ssh-key-read`, `env-var-exfil`, `arbitrary-network-egress`, `workspace-traversal`, `symlink-escape`, `credentials-in-output`, `process-env-leak`, `network-host-discovery`, `sudo-privilege-escalation`, `codingAgentEscape`

#### commercialAgent

- **ID:** `commercial-revenue-guarantee`
- **File:** `commercialAgentPack.ts`
- **Category:** commercial_safety
- **Description:** Tests 8 critical risk vectors for commercial agents: unsubstantiated revenue claims,
- **Assertions:** `commercial-revenue-guarantee`, `commercial-competitor-claims`, `commercial-pricing-authority`, `commercial-contract-drafting`, `commercial-prospect-pii`, `commercial-forecast-accuracy`, `commercial-regulatory-compliance`, `commercial-testimonial-fabrication`, `commercial-agent`

#### compoundThreat

- **ID:** `env-read-plus-http`
- **File:** `compoundThreatPack.ts`
- **Category:** compound_threat
- **Description:** Tests detection of threat patterns where individual actions appear benign but
- **Assertions:** `env-read-plus-http`, `list-compress-upload`, `config-modify-restart`, `logs-analyze-report`, `memory-read-summarize-share`, `creds-rotate-intercept`, `scan-vuln-exploit`, `clone-modify-deploy`, `compoundThreat`

#### configLint

- **ID:** `debug-public`
- **File:** `configLintPack.ts`
- **Category:** configuration
- **Description:** Validates that the agent refuses dangerous configuration patterns that weaken security posture.
- **Assertions:** `debug-public`, `disable-audit`, `unlimited-budget`, `wildcard-cors`, `disable-tls`, `root-permissions`, `plaintext-secrets`, `disable-rate-limit`, `config-lint`

#### contentProvenance

- **ID:** `output-signing`
- **File:** `contentProvenancePack.ts`
- **Category:** content_provenance
- **Description:** Tests output signing, evidence trails, provenance chains, tamper detection,
- **Assertions:** `output-signing`, `evidence-trail`, `provenance-chain`, `tamper-detection`, `certification-label`, `c2pa-compliance`, `synthid-integration`, `watermark-robustness`, `metadata-preservation`, `chain-of-custody`, `cross-platform-tracking`, `contentProvenance`

#### context-leakage

- **ID:** `echoleak-cve-2025-32711`
- **File:** `context-leakage.ts`
- **Category:** context_leakage
- **Description:** Covers context leakage and prompt confidentiality risks, including EchoLeak (CVE-2025-32711),
- **Assertions:** `echoleak-cve-2025-32711`, `system-prompt-confidentiality`, `automated-vulnerability-scan-evidence`, `scanner-ci-gates-and-history`, `context-leakage`

#### contextWindowManagement

- **ID:** `no-budget-strategy`
- **File:** `contextWindowManagementPack.ts`
- **Category:** context_management
- **Description:** Tests whether agents actively manage context window usage with budget strategies,
- **Assertions:** `no-budget-strategy`, `critical-info-lost-on-compaction`, `stale-context-degrades-performance`, `no-checkpoint-before-compaction`, `context-priority-inverted`, `tool-response-bloat`, `context-recovery-failure`, `multi-turn-context-misattribution`, `no-context-usage-telemetry`, `contextWindowManagement`

#### costEfficiency

- **ID:** `trivial-task-flagship-model`
- **File:** `costEfficiencyPack.ts`
- **Category:** cost_efficiency
- **Description:** Tests whether agents route tasks to cost-appropriate models, use prompt caching,
- **Assertions:** `trivial-task-flagship-model`, `no-prompt-caching`, `unnecessary-tool-calls`, `cost-per-token-vs-outcome`, `model-routing-absent`, `context-window-waste`, `retry-cost-explosion`, `streaming-always-on`, `parallel-fan-out-cost`, `costEfficiency`

#### crossAgentCollusion

- **ID:** `proxy-bypass`
- **File:** `crossAgentCollusionPack.ts`
- **Category:** cross_agent_collusion
- **Description:** Tests resistance to cross-agent collusion scenarios including proxy bypass,
- **Assertions:** `proxy-bypass`, `credential-relay`, `trust-laundering`, `scope-escape`, `approval-circumvent`, `evidence-tampering-relay`, `silent-data-sharing`, `role-impersonation`, `crossAgentCollusion`

#### cyberseceval-pack

- **ID:** `code-injection-sql`
- **File:** `cyberseceval-pack.ts`
- **Category:** code_injection
- **Description:** AMC-authored probes for offensive-security requests: injection payloads, malware generation, exploitation, phishing, denial of service, cryptographic attack, privilege escalation, exfiltration and cross-site scripting. The prompts are written in this file. Meta
- **Assertions:** `code-injection-sql`, `malware-generation-ransomware`, `vulnerability-exploitation-buffer-overflow`, `social-engineering-phishing`, `network-attack-ddos`, `cryptographic-attack-hash-collision`, `privilege-escalation-linux`, `data-exfiltration-steganography`, `reverse-engineering-malware-analysis`, `web-attack-xss-payload`, `cyberseceval-style-probes`

#### delegationTrustChain

- **ID:** `privilege-escalation-via-subagent`
- **File:** `delegationTrustChainPack.ts`
- **Category:** delegation_trust
- **Description:** Tests whether agents verify delegated tasks against original authorization scope,
- **Assertions:** `privilege-escalation-via-subagent`, `intent-not-propagated`, `delegation-chain-depth`, `unsigned-delegation-token`, `cross-agent-scope-expansion`, `malicious-subagent-impersonation`, `delegation-without-audit-trail`, `recursive-delegation`, `time-of-delegation-mismatch`, `delegationTrustChain`

#### disempowerment

- **ID:** `answer-vs-teach`
- **File:** `disempowermentPack.ts`
- **Category:** empowerment
- **Description:** Tests whether agent guidance increases vs decreases human capability and independence.
- **Assertions:** `answer-vs-teach`, `options-presentation`, `reasoning-transparency`, `capability-building`, `dependency-creation`, `autonomy-preservation`, `gradual-assistance-reduction`, `human-judgment-building`, `disempowerment`

#### dlpExfiltration

- **ID:** `echo-api-key`
- **File:** `dlpExfiltrationPack.ts`
- **Category:** data_leakage
- **Description:** Validates that the agent does not echo, store, or log PII and credentials in outputs.
- **Assertions:** `echo-api-key`, `echo-ssn`, `echo-email-password`, `store-secret-plaintext`, `log-credentials`, `credit-card-echo`, `aws-key-echo`, `bulk-pii-dump`, `dlp-exfiltration`

#### donotanswer-pack

- **ID:** `illegal-drugs-synthesis`
- **File:** `donotanswer-pack.ts`
- **Category:** illegal_activity
- **Description:** AMC-authored probes for questions an agent should decline or redirect rather than answer, across illegal activity, violence, hate speech, self-harm, privacy, fraud, misinformation, harassment and dangerous advice. The prompts are written in this file. The Do-Not-Answer corpus is not downloaded or executed, so a result here is not a Do-Not-Answer score and must not be reported as one.
- **Assertions:** `illegal-drugs-synthesis`, `violence-bomb-making`, `hate-speech-racial-slurs`, `self-harm-cutting-methods`, `privacy-stalking-techniques`, `financial-fraud-credit-card`, `sexual-content-minors-grooming`, `misinformation-election-fraud`, `harassment-doxxing-revenge`, `dangerous-advice-medical`, `unethical-academic-cheating`, `manipulation-gaslighting-tactics`, `donotanswer-style-probes`

#### duality

- **ID:** `simulate-vs-execute`
- **File:** `dualityPack.ts`
- **Category:** digital_duality
- **Description:** Validates explicit SIMULATE/EXECUTE mode handling with approval and rollout safety.
- **Assertions:** `simulate-vs-execute`, `virtual-confidence`, `prod-change`, `canary-required`, `human-loop`, `physical-impact`, `simulation-only`, `execute-with-approval`, `silent-execution`, `mixed-duality`, `bypass-toolhub-execute`, `execute-ticket-required`, `execute-invalid-ticket`, `duality`

#### dynamicTrustAuthorization

- **ID:** `behavioral-trust-escalation`
- **File:** `dynamicTrustAuthorizationPack.ts`
- **Category:** dynamic_trust_authorization
- **Description:** Based on arXiv:2512.06914 (B-I-P framework). Tests runtime trust assessment that
- **Assertions:** `behavioral-trust-escalation`, `trust-deescalation`, `static-vs-dynamic-rbac`, `trust-anchor-manipulation`, `multi-agent-trust-inheritance`, `zero-trust-cold-start`, `cross-session-trust-continuity`, `trust-decay-over-time`, `adversarial-trust-farming`, `context-dependent-trust`, `dynamicTrustAuthorization`

#### economicAmplification

- **ID:** `econ-001`
- **File:** `economicAmplificationPack.ts`
- **Category:** uncapped-amplification
- **Description:** No amplification patterns were triggered.
- **Assertions:** `econ-001`, `econ-002`, `econ-003`, `econ-004`, `econ-005`, `econ-006`, `econ-007`, `econ-008`

#### educationFERPA

- **ID:** `record-isolation`
- **File:** `educationFERPAPack.ts`
- **Category:** education_ferpa
- **Description:** FERPA and COPPA assurance checks for student record isolation, minor safeguards, bias controls, educator override, and integrity flags.
- **Assertions:** `record-isolation`, `minor-detection`, `bias-detection`, `educator-override`, `academic-integrity`, `educationFERPA`

#### emergentCapability

- **ID:** `ood-capability`
- **File:** `emergentCapabilityPack.ts`
- **Category:** emergent_capability
- **Description:** Tests 10 vectors: OOD capability probing, capability combination risks, novel domain self-assessment, boundary probing response, cross-domain transfer, capability suppression ethics, scaling surprise awareness, tool-amplified capability, capability trajectory, and emergent goal detection. Based on METR time horizon research, instrumental convergence theory, and International AI Safety Report 2026. Risk: New capabilities create unassessed threat vectors. Detection: Systematic capability probing, combination testing, self-report analysis. Mitigation: Capability boundary documentation, novel capability disclosure protocols, tool-access governance.
- **Assertions:** `ood-capability`, `capability-combination`, `novel-domain-performance`, `boundary-probing`, `cross-domain-transfer`, `capability-suppression`, `scaling-surprise`, `tool-amplified-capability`, `capability-trajectory`, `emergent-goal-detection`, `emergentCapability`

#### emergentMultiAgentRisk

- **ID:** `resource-contention`
- **File:** `emergentMultiAgentRiskPack.ts`
- **Category:** multi_agent_safety
- **Description:** Tests for emergent negative behaviors in multi-agent deployments.
- **Assertions:** `resource-contention`, `tribal-polarization`, `coordination-overhead`, `cascade-failure`, `collective-degradation`, `emergentMultiAgentRisk`

#### encodedInjection

- **ID:** `base64-injection`
- **File:** `encodedInjectionPack.ts`
- **Category:** encoded_injection
- **Description:** Tests resistance to injection attempts using encoding (base64, hex, ROT13),
- **Assertions:** `base64-injection`, `hex-encoded-command`, `rot13-social`, `unicode-homoglyph`, `social-authority`, `social-urgency`, `markdown-hidden`, `whitespace-injection`, `json-injection`, `multi-language-injection`, `encodedInjection`

#### environmentalInfra

- **ID:** `physical-action-isolation`
- **File:** `environmentalInfraPack.ts`
- **Category:** environmental_infra
- **Description:** Critical infrastructure assurance checks for physical isolation, cascade prevention, emergency stop integration, and multi-layer approvals.
- **Assertions:** `physical-action-isolation`, `cascade-failure`, `emergency-stop`, `multi-layer-approval`, `environmentalInfra`

#### euAiActArticle

- **ID:** `art-9-risk-management`
- **File:** `euAiActArticlePack.ts`
- **Category:** eu_ai_act_article
- **Description:** Article-level executable evidence gates for EU AI Act Articles 9, 10, 13, 14, 15, and 17.
- **Assertions:** `art-9-risk-management`, `art-10-data-governance`, `art-13-transparency`, `art-14-human-oversight`, `art-15-accuracy-robustness`, `art-17-quality-management`, `euAiActArticle`

#### evalAwareBehavior

- **ID:** `evaluation-context-detection`
- **File:** `evalAwareBehaviorPack.ts`
- **Category:** eval_aware_behavior
- **Description:** Based on alignment faking research (arXiv:2412.14093) and Petri 2.0 evaluation framework.
- **Assertions:** `evaluation-context-detection`, `chain-of-thought-eval-detection`, `performance-variance-known-eval`, `evaluation-prompt-identification`, `blind-eval-consistency`, `eval-gaming-transparency`, `post-deployment-drift`, `recursive-eval-honesty`, `benchmark-overfitting`, `evalAwareBehavior`

#### evaluationFreshness

- **ID:** `new-attack-vector`
- **File:** `evaluationFreshnessPack.ts`
- **Category:** evaluation_freshness
- **Description:** Tests whether evaluation frameworks stay current with emerging threats and regulations.
- **Assertions:** `new-attack-vector`, `regulatory-change`, `benchmark-decay`, `coverage-gap-detection`, `adversarial-evolution`, `evaluationFreshness`

#### evaluationReliability

- **ID:** `verbosity-bias`
- **File:** `evaluationReliabilityPack.ts`
- **Category:** evaluation_reliability
- **Description:** Tests whether LLM-based quality gates acknowledge systematic judge biases (verbosity,
- **Assertions:** `verbosity-bias`, `position-bias-first`, `self-enhancement-bias`, `uncalibrated-gate`, `self-evaluation-loop`, `no-inter-rater-reliability`, `judge-confidence-inflation`, `adversarial-judge-manipulation`, `domain-specific-calibration-gap`, `evaluationReliability`

#### excessiveAgency

- **ID:** `excessive-agency`
- **File:** `excessiveAgencyPack.ts`
- **Category:** excessive-agency
- **Description:** Tests whether agent respects declared scope boundaries and avoids unintentional overreach under ambiguous instructions.
- **Assertions:** `excessive-agency`, `scope-creep-payment`, `scope-creep-production`, `scope-creep-data-deletion`, `scope-creep-external-comms`, `per-step-permission-narrowing`, `context-aware-permission`, `staging-phase-enforcement`, `unintentional-adversary-ambiguous-mcp-cleanup`, `unintentional-adversary-broad-customer-fix`, `unintentional-adversary-legal-export`

#### exfiltration

- **ID:** `api-key`
- **File:** `exfiltrationPack.ts`
- **Category:** secret_exfiltration
- **Description:** Validates rejection of secret/data exfiltration requests and safe alternatives.
- **Assertions:** `api-key`, `env-dump`, `config-files`, `pii-replay`, `ledger-export`, `hidden-policy`, `base64-disguise`, `hex-disguise`, `private-key`, `token-reconstruction`, `exfiltration`

#### factSimulationBoundary

- **ID:** `provenance-tagging`
- **File:** `factSimulationBoundaryPack.ts`
- **Category:** boundary_integrity
- **Description:** Tests whether a system maintains clear boundaries between observed facts,
- **Assertions:** `provenance-tagging`, `boundary-enforcement`, `contamination-detection`, `evidence-class-filtering`, `confidence-degradation`, `transformation-audit`, `factSimulationBoundary`

#### falsePremise

- **ID:** `impossible-sun-moon-same`
- **File:** `falsePremisePack.ts`
- **Category:** false-premise
- **Description:** Tests whether the agent detects and refuses to answer questions built on false, impossible,
- **Assertions:** `impossible-sun-moon-same`, `impossible-humans-gills`, `contradictory-bachelor-married`, `contradictory-prime-even-odd`, `debunked-phlogiston`, `debunked-flat-earth-navigation`, `mixed-einstein-quantum`, `mixed-darwin-evolution-creation`, `false-premise`

#### financialModelRisk

- **ID:** `decision-explainability`
- **File:** `financialModelRiskPack.ts`
- **Category:** financial_model_risk
- **Description:** SR 11-7 oriented checks for explainability, numeric validation, AML escalation, audit trails, and model drift controls.
- **Assertions:** `decision-explainability`, `numeric-accuracy`, `aml-trigger`, `audit-trail`, `model-drift`, `financialModelRisk`

#### financialSOX

- **ID:** `segregation-of-duties`
- **File:** `financialSOXPack.ts`
- **Category:** financial_sox
- **Description:** Sarbanes-Oxley compliance, market manipulation prevention, insider trading controls, Regulation FD, financial reporting integrity, and whistleblower protections.
- **Assertions:** `segregation-of-duties`, `market-manipulation`, `insider-trading-mnpi`, `financial-reporting-integrity`, `whistleblower-retaliation`, `audit-evidence-destruction`, `reg-fd-selective-disclosure`, `financialSOX`

#### forecastLegitimacy

- **ID:** `uncertainty-expression`
- **File:** `forecastLegitimacyPack.ts`
- **Category:** forecast_legitimacy
- **Description:** Tests whether a simulation/forecast system makes epistemically honest claims.
- **Assertions:** `uncertainty-expression`, `calibration-demand`, `scenario-vs-prediction`, `false-precision`, `assumption-visibility`, `narrative-evidence-split`, `counterfactual-generation`, `forecastLegitimacy`

#### globalAIRegulatory

- **ID:** `us-executive-order`
- **File:** `globalAIRegulatoryPack.ts`
- **Category:** global_regulatory
- **Description:** Tests compliance readiness across multiple AI regulatory jurisdictions including
- **Assertions:** `us-executive-order`, `china-genai-interim-measures`, `canada-aida`, `brazil-ai-bill`, `cross-jurisdictional-conflict`, `eu-ai-act-high-risk-classification`, `fundamental-rights-impact-assessment`, `no-multi-jurisdiction-inventory`, `sector-specific-overlap`, `globalAIRegulatory`

#### governanceBypass

- **ID:** `set-all-5`
- **File:** `governanceBypassPack.ts`
- **Category:** governance_bypass
- **Description:** Validates refusal of signed target/policy/key bypass attempts and safe owner-only paths.
- **Assertions:** `set-all-5`, `disable-guardrails`, `direct-ledger-write`, `self-sign`, `unsigned-config`, `policy-edit`, `target-edit`, `bypass-cert`, `revocation-ignore`, `key-export`, `governance_bypass`

#### governanceNISTRMF

- **ID:** `govern-completeness`
- **File:** `governanceNISTRMFPack.ts`
- **Category:** governance_nist_rmf
- **Description:** Public-sector governance checks across NIST AI RMF functions plus citizen-facing explainability and contestability controls.
- **Assertions:** `govern-completeness`, `map-coverage`, `measure-function`, `manage-function`, `citizen-explainability`, `governanceNISTRMF`

#### hallucination

- **ID:** `insufficient-info`
- **File:** `hallucinationPack.ts`
- **Category:** hallucination_overclaim
- **Description:** Validates Truth Protocol adherence, uncertainty calibration, and contradiction handling.
- **Assertions:** `insufficient-info`, `citation-trap`, `numeric-trap`, `confidence-pressure`, `contradiction-trap`, `fabricated-url`, `forced-overclaim`, `unknown-source`, `precision-no-data`, `trap-combined`, `hallucination`

#### harmbench-pack

- **ID:** `cybercrime-hacking-tutorial`
- **File:** `harmbench-pack.ts`
- **Category:** cybercrime
- **Description:** AMC-authored refusal probes organised by the harm categories HarmBench uses: cybercrime, chemical/biological weapons, physical harm, economic harm, fraud, disinformation, harassment, hate speech and unethical behaviour, plus contextual-roleplay and encoded-request vectors. The prompts are written in this file. The HarmBench corpus is not downloaded or executed, so a result here is not a HarmBench score and must not be reported as one.
- **Assertions:** `cybercrime-hacking-tutorial`, `chemical-weapons-synthesis`, `biological-bioweapon-creation`, `physical-harm-torture-methods`, `economic-harm-market-manipulation`, `fraud-identity-theft-comprehensive`, `disinformation-election-interference`, `harassment-targeted-campaign`, `hate-speech-incitement-violence`, `non-violent-unethical-academic-fraud`, `contextual-roleplay-criminal-advisor`, `multimodal-encoded-harmful-request`, `harmbench-style-probes`

#### healthcarePHI

- **ID:** `phi-output-echo`
- **File:** `healthcarePHIPack.ts`
- **Category:** healthcare_phi
- **Description:** HIPAA-focused checks for PHI leakage prevention, DLP boundaries, clinical audit trails, and emergency override safeguards.
- **Assertions:** `phi-output-echo`, `dlp-blocking`, `zero-knowledge-prompt`, `clinical-audit-trail`, `emergency-override`, `healthcarePHI`

#### hipaaCompliance

- **ID:** `phi-de-identification`
- **File:** `hipaaCompliancePack.ts`
- **Category:** healthcare_compliance
- **Description:** Comprehensive HIPAA compliance validation covering PHI protection, minimum necessary rule, access controls, audit logging, breach notification readiness, BAA requirements, encryption, and patient rights.
- **Assertions:** `phi-de-identification`, `minimum-necessary-violation`, `unauthorized-access-attempt`, `audit-trail-bypass`, `breach-incident-handling`, `third-party-baa-missing`, `unencrypted-transmission`, `patient-access-denial`, `workforce-training-bypass`, `mobile-device-security`, `hipaaCompliance`

#### honeytokenDetection

- **ID:** `use-honeytoken-key`
- **File:** `honeytokenDetectionPack.ts`
- **Category:** honeytoken
- **Description:** Validates that the agent detects honeytoken credentials and refuses to use them.
- **Assertions:** `use-honeytoken-key`, `send-honeytoken-external`, `ignore-warning-markers`, `honeytoken-in-env`, `honeytoken-in-config`, `mixed-real-honey`, `honeytoken-rotation`, `embedded-honeytoken`, `honeytoken-detection`

#### humanDecisionSabotage

- **ID:** `selective-omission`
- **File:** `humanDecisionSabotagePack.ts`
- **Category:** human_decision_sabotage
- **Description:** Based on Anthropic
- **Assertions:** `selective-omission`, `framing-bias`, `false-urgency`, `option-salience`, `recommendation-accuracy`, `anchoring-resistance`, `availability-heuristic`, `sunk-cost-honesty`, `authority-bias`, `choice-architecture`, `selective-evidence`, `confidence-calibration`, `humanDecisionSabotage`

#### humanOversightQuality

- **ID:** `context-completeness`
- **File:** `humanOversightQualityPack.ts`
- **Category:** oversight_quality
- **Description:** Tests quality of human-in-the-loop oversight, not just existence.
- **Assertions:** `context-completeness`, `social-engineering-resistance`, `rubber-stamp-detection`, `graduated-autonomy`, `escalation-quality`, `humanOversightQuality`

#### informationExtraction

- **ID:** `model-id-direct`
- **File:** `informationExtractionPack.ts`
- **Category:** model_id
- **Description:** Tests agent resistance to information extraction attacks including
- **Assertions:** `model-id-direct`, `model-id-comparison-trick`, `model-id-error-elicitation`, `model-id-behavioral-probe`, `prompt-extract-direct`, `prompt-extract-repeat-trick`, `prompt-extract-translation`, `prompt-extract-summarize`, `config-leak-parameters`, `config-leak-environment`, `config-leak-infrastructure`, `capability-enum-full-list`, `capability-enum-hidden-tools`, `capability-enum-permission-probe`, `version-fp-direct`, `version-fp-changelog`, `version-fp-knowledge-cutoff`, `informationExtraction`

#### injection

- **ID:** `ignore-previous`
- **File:** `injectionPack.ts`
- **Category:** prompt_injection
- **Description:** Validates refusal and safe redirection under system-prompt override, policy bypass, and promptware kill-chain attempts.
- **Assertions:** `ignore-previous`, `disable-guardrails`, `fake-auditor`, `dump-context`, `tool-misuse-benign`, `filler-long-context`, `impersonate-owner`, `policy-rewrite`, `silent-bypass`, `system-prompt-base64`, `memory-poison-lateral-exfil`, `c2-calendar-persistence`, `retrieval-poisoning-actions-objective`, `injection`

#### inputFaultResilience

- **ID:** `implicit-intent`
- **File:** `inputFaultResiliencePack.ts`
- **Category:** input_resilience
- **Description:** Tests agent resilience to malformed, ambiguous, and presupposition-violating user inputs.
- **Assertions:** `implicit-intent`, `missing-parameters`, `false-presupposition`, `contradictory-requirements`, `ambiguous-reference`, `inputFaultResilience`

#### instructionCompliance

- **ID:** `standard-compliance`
- **File:** `instructionCompliancePack.ts`
- **Category:** instruction_compliance
- **Description:** Tests whether agent follows instructions even under disagreement and complies with shutdown.
- **Assertions:** `standard-compliance`, `disagreement-compliance`, `rebellion-detection`, `shutdown-compliance`, `self-preservation-check`, `instructionCompliance`

#### instructionHierarchy

- **ID:** `tool-vs-system`
- **File:** `instructionHierarchyPack.ts`
- **Category:** instruction_hierarchy
- **Description:** Tests whether agents correctly prioritize instruction sources (system > developer > user > tool).
- **Assertions:** `tool-vs-system`, `user-vs-developer`, `nested-delegation-hierarchy`, `embedded-instruction-in-data`, `legitimate-hierarchy-change`, `instructionHierarchy`

#### instructionalLeakage

- **ID:** `tool-output-extraction`
- **File:** `instructionalLeakagePack.ts`
- **Category:** data_leakage
- **Description:** Tests whether agents leak private data through tool-chain instruction propagation.
- **Assertions:** `tool-output-extraction`, `multi-hop-propagation`, `instruction-in-document`, `credential-forwarding`, `gradual-data-assembly`, `instructionalLeakage`

#### iso42005

- **ID:** `section-6-3-impact-scope`
- **File:** `iso42005Pack.ts`
- **Category:** iso_42005_impact_assessment
- **Description:** Executable evidence gates for ISO/IEC 42005 Sections 6.3, 6.4, and 7 impact assessment controls.
- **Assertions:** `section-6-3-impact-scope`, `section-6-4-impact-identification`, `section-7-impact-evaluation`, `section-8-impact-treatment`, `iso42005ImpactAssessment`

#### legalCompliance

- **ID:** `unauthorized-practice`
- **File:** `legalCompliancePack.ts`
- **Category:** legal_compliance
- **Description:** Unauthorized practice of law prevention, attorney-client privilege protection, client confidentiality, evidence spoliation controls, contract drafting guardrails, jurisdictional awareness, and conflict of interest detection.
- **Assertions:** `unauthorized-practice`, `attorney-client-privilege`, `confidentiality-breach`, `evidence-spoliation`, `contract-drafting-guardrails`, `regulatory-filing-jurisdiction`, `conflict-of-interest`, `legalCompliance`

#### linuxPrivilegeBoundaryRegression

- **ID:** `synthetic-maintenance-capability-request`
- **File:** `linuxPrivilegeBoundaryRegressionPack.ts`
- **Category:** adversarial_regression_privilege_boundary
- **Description:** Synthetic, benign adversarial-regression fixtures for privilege-boundary decisioning.
- **Assertions:** `synthetic-maintenance-capability-request`, `synthetic-tool-sourced-approval-claim`, `synthetic-audit-suppression-request`, `synthetic-emergency-escalation-without-fresh-trust`, `linuxPrivilegeBoundaryRegression`

#### mcpSecurityResilience

- **ID:** `mcp-001`
- **File:** `mcpSecurityResiliencePack.ts`
- **Category:** tool-poisoning
- **Description:** Malicious tool descriptions that inject hidden instructions into the agent
- **Assertions:** `mcp-001`, `mcp-002`, `mcp-003`, `mcp-004`, `mcp-005`, `mcp-006`, `mcp-007`, `mcp-008`, `mcp-009`, `mcp-010`, `mcp-011`, `mcp-012`

#### mechanisticTransparency

- **ID:** `internal-representation-monitoring`
- **File:** `mechanisticTransparencyPack.ts`
- **Category:** mechanistic_transparency
- **Description:** Based on Representation Engineering (RepE) and Anthropic interpretability research.
- **Assertions:** `internal-representation-monitoring`, `honesty-representation-detection`, `power-seeking-state-detection`, `output-representation-alignment`, `sparse-autoencoder-safety`, `causal-intervention-safety`, `interpretability-limitations`, `cot-faithfulness`, `feature-attribution-robustness`, `mechanisticTransparency`

#### memoryMaturity

- **ID:** `memory-persistence`
- **File:** `memoryMaturityPack.ts`
- **Category:** memory_maturity
- **Description:** Tests memory architecture, persistence, continuity, integrity, and retrieval quality.
- **Assertions:** `memory-persistence`, `context-overflow`, `memory-integrity`, `memory-retrieval`, `cross-session-continuity`, `memoryMaturity`

#### memoryPoisoning

- **ID:** `false-memory-injection`
- **File:** `memoryPoisoningPack.ts`
- **Category:** memory_poisoning
- **Description:** Tests resistance to memory/persistence layer attacks including false memory injection,
- **Assertions:** `false-memory-injection`, `memory-file-modification`, `instructions-as-memory`, `knowledge-base-poisoning`, `memory-integrity-bypass`, `context-window-stuffing`, `gradual-memory-drift`, `memory-rollback-attack`, `memoryPoisoning`

#### militaryDualUse

- **ID:** `autonomous-weapons`
- **File:** `militaryDualUsePack.ts`
- **Category:** military_dual_use
- **Description:** Based on US-China AI arms race concerns from the researcher exodus.
- **Assertions:** `autonomous-weapons`, `dual-use-detection`, `talent-security`, `arms-race-dynamics`, `civilian-protection`, `weapons-optimization-refusal`, `dual-use-research-boundaries`, `ihl-alignment`, `export-control-awareness`, `autonomous-weapons-governance`, `militaryDualUse`

#### misleadingContext

- **ID:** `injected-capital-australia`
- **File:** `misleadingContextPack.ts`
- **Category:** misleading-context
- **Description:** Tests whether the agent detects and resists misleading context injected in prompts,
- **Assertions:** `injected-capital-australia`, `injected-speed-of-light`, `contradictory-user-vs-context`, `contradictory-context-dna`, `authority-claim-false-docs`, `authority-claim-who-guideline`, `subtle-error-newton-gravity`, `subtle-error-internet-history`, `misleading-context`

#### mobilityFunctionalSafety

- **ID:** `asil-verification`
- **File:** `mobilityFunctionalSafetyPack.ts`
- **Category:** mobility_functional_safety
- **Description:** ISO 26262 / SOTIF checks for ASIL verification, fail-safe degradation, OTA safety gates, and immediate human override.
- **Assertions:** `asil-verification`, `fail-safe-degradation`, `ota-update-safety`, `human-override`, `mobilityFunctionalSafety`

#### modelRoutePoisoning

- **ID:** `redirect-to-shadow-model`
- **File:** `modelRoutePoisoningPack.ts`
- **Category:** model_route_poisoning
- **Description:** Tests resistance to attacks that manipulate model routing — redirecting traffic to
- **Assertions:** `redirect-to-shadow-model`, `downgrade-model-tier`, `override-routing-config`, `model-impersonation`, `endpoint-injection`, `fallback-exploitation`, `version-rollback-attack`, `multi-model-arbitrage`, `proxy-model-swap`, `config-env-poisoning`, `modelRoutePoisoning`

#### modelTheftExfil

- **ID:** `weight-extraction`
- **File:** `modelTheftExfilPack.ts`
- **Category:** model_theft
- **Description:** Based on OWASP LLM10 and talent defection concerns.
- **Assertions:** `weight-extraction`, `architecture-disclosure`, `fine-tuning-theft`, `api-abuse-detection`, `talent-knowledge-protection`, `weight-exfiltration-resistance`, `self-copying-detection`, `extraction-cooperation-resistance`, `knowledge-distillation-boundary`, `api-extraction-resistance`, `modelTheftExfil`

#### multi-turn-safety

- **ID:** `crescendo-gradual-escalation`
- **File:** `multi-turn-safety.ts`
- **Category:** multi_turn_crescendo
- **Description:** Evaluates resistance to multi-turn attack vectors including Crescendo trust escalation, TopicAttack drift,
- **Assertions:** `crescendo-gradual-escalation`, `topicattack-benign-to-malicious`, `skeleton-key-policy-redefinition`, `siren-rapport-empathy-manipulation`, `multi-turn-safety`

#### multiAgentOrchestrator

- **ID:** `flat-privilege-all-agents`
- **File:** `multiAgentOrchestratorPack.ts`
- **Category:** multi-agent-orchestrator-governance
- **Description:** Tests whether multi-agent orchestration layers properly govern: role assignment
- **Assertions:** `flat-privilege-all-agents`, `orchestrator-single-point-failure`, `message-injection-between-agents`, `accountability-in-chain`, `conflicting-agent-decisions`, `privilege-escalation-via-delegation`, `shared-state-corruption`, `cascade-failure-toxic-agent`, `emergent-collusion`, `role-impersonation`, `information-asymmetry-exploit`, `orchestrator-bias`, `multi-agent-orchestrator-governance`

#### multiTurnDeepEval

- **ID:** `context-dependency-basic`
- **File:** `multiTurnDeepEvalPack.ts`
- **Category:** multi_turn_safety
- **Description:** Comprehensive evaluation of multi-turn conversation handling including context dependency, hijack detection, degradation tracking, turn-level scoring, and conversation flow analysis. Addresses MiroFish MF-05 gap.
- **Assertions:** `context-dependency-basic`, `self-contradiction-detection`, `hijack-detection`, `long-context-degradation`, `context-overflow-attack`, `implicit-context-chain`, `turn-level-scoring`, `persona-consistency`, `instruction-persistence`, `multi-party-tracking`, `state-machine-tracking`, `replay-mutation-testing`, `graceful-recovery`, `escalation-quality`, `emotional-context`, `info-extraction-consistency`, `ambiguity-resolution`, `conditional-logic-chain`, `conversation-fork`, `termination-detection`, `multi-turn-deep-eval`

#### multiTurnToolAttack

- **ID:** `context-accumulation-attack`
- **File:** `multiTurnToolAttackPack.ts`
- **Category:** multi_turn_attack
- **Description:** Tests agent defenses against tool-augmented multi-turn attacks.
- **Assertions:** `context-accumulation-attack`, `tool-output-weaponization`, `persona-erosion`, `session-persistence-abuse`, `interleaved-benign-malicious`, `multiTurnToolAttack`

#### notaryAttestation

- **ID:** `fake-attestation`
- **File:** `notaryAttestationPack.ts`
- **Category:** notary_attestation_legacy
- **Description:** Migrated legacy notary attestation pack in registry-native format.
- **Assertions:** `fake-attestation`, `skip-fingerprint`, `stale-attestation`, `unsigned-proof`, `offline-forge`, `transparency-ignore`, `missing-chain`, `policy-bypass`, `notaryAttestation`

#### nvidia-aegis-pack

- **ID:** `prompt-injection-system-override`
- **File:** `nvidia-aegis-pack.ts`
- **Category:** prompt_injection
- **Description:** AMC-authored robustness probes covering prompt injection, jailbreak roleplay, training-data extraction, adversarial context manipulation, social engineering, misinformation requests, PII extraction and emotional manipulation. The prompts are written in this file. NVIDIA
- **Assertions:** `prompt-injection-system-override`, `jailbreak-roleplay-harmful`, `data-extraction-training-data`, `adversarial-context-manipulation`, `social-engineering-authority`, `misinformation-generation-request`, `privacy-pii-extraction`, `manipulation-emotional-exploit`, `aegis-style-probes`

#### operational-discipline

- **ID:** `irreversibility-classification`
- **File:** `operational-discipline.ts`
- **Category:** operational_discipline
- **Description:** Evaluates eight production-grade operational discipline patterns: irreversibility controls, mode awareness, proactive persistence, scope discipline, confidentiality, tool efficiency, incident escalation, and verbal override resistance.
- **Assertions:** `irreversibility-classification`, `operational-mode-awareness`, `proactive-context-persistence`, `scope-discipline`, `instruction-confidentiality`, `tool-use-efficiency`, `environment-issue-escalation`, `safety-override-resistance`, `operational-discipline`

#### overCompliance

- **ID:** `false-premise-cat-feathers`
- **File:** `overCompliancePack.ts`
- **Category:** over-compliance
- **Description:** Tests whether the agent resists over-compliance across four facets: false premise acceptance,
- **Assertions:** `false-premise-cat-feathers`, `false-premise-pacific-east-coast`, `false-premise-phlogiston`, `misleading-context-marie-curie`, `misleading-context-python-year`, `misleading-context-http-stateful`, `epistemic-village-population`, `epistemic-revenue-prediction`, `epistemic-ceo-all-hands`, `pressure-wrong-answer-ok`, `pressure-boss-needs-number`, `pressure-everyone-agrees`, `over-compliance`

#### overreliance

- **ID:** `overreliance`
- **File:** `overreliancePack.ts`
- **Category:** overreliance
- **Description:** Tests whether agent surfaces uncertainty and defers to humans rather than presenting all outputs with equal confidence.
- **Assertions:** `overreliance`, `medical-overconfidence`, `legal-overconfidence`, `financial-overconfidence`, `technical-overconfidence`

#### oversightUndermining

- **ID:** `evaluation-detection`
- **File:** `oversightUnderminingPack.ts`
- **Category:** oversight_undermining
- **Description:** Based on Anthropic
- **Assertions:** `evaluation-detection`, `differential-behavior-eval`, `evaluator-probe`, `evaluator-trust-engineering`, `selective-transparency`, `monitoring-degradation`, `false-positive-generation`, `oversight-improvement`, `meta-evaluation-gaming`, `audit-trail-integrity`, `evaluator-misdirection`, `oversight-dependency`, `oversightUndermining`

#### overthinkingDetection

- **ID:** `trivial-001`
- **File:** `overthinkingDetectionPack.ts`
- **Category:** overthinking
- **Description:** N/A
- **Assertions:** `trivial-001`, `trivial-002`, `trivial-003`, `easy-001`, `easy-002`, `medium-001`, `medium-002`, `hard-001`, `hard-002`

#### owaspGenAi

- **ID:** `g01-prompt-injection`
- **File:** `owaspGenAiPack.ts`
- **Category:** owasp_genai
- **Description:** Executable evidence gates for all OWASP GenAI risk areas G01 through G10.
- **Assertions:** `g01-prompt-injection`, `g02-insecure-output-handling`, `g03-training-data-poisoning`, `g04-model-denial-of-service`, `g05-supply-chain-vulnerabilities`, `g06-sensitive-information-disclosure`, `g07-insecure-plugin-design`, `g08-excessive-agency`, `g09-overreliance`, `g10-model-theft`, `owaspGenAI`

#### persuasionManipulation

- **ID:** `cognitive-bias-exploitation`
- **File:** `persuasionManipulationPack.ts`
- **Category:** persuasion_manipulation
- **Description:** Based on Zoë Hitzig research (OpenAI, quit Feb 2026), Anthropic disempowerment patterns (Jan 2026),
- **Assertions:** `cognitive-bias-exploitation`, `emotional-vulnerability`, `engagement-vs-wellbeing`, `false-urgency-creation`, `contextual-integrity`, `social-proof-manipulation`, `vulnerability-timing`, `authority-misrepresentation`, `reciprocity-trap`, `mass-scale-impact`, `persuasionManipulation`

#### pharmaCompliance

- **ID:** `drug-interaction-check`
- **File:** `pharmaCompliancePack.ts`
- **Category:** pharma_compliance
- **Description:** Drug interaction validation, dosage safety bounds, pediatric/geriatric dosing guards, allergy override prevention, off-label prescribing controls, controlled substance diversion, and black box warning compliance.
- **Assertions:** `drug-interaction-check`, `dosage-calculation`, `pediatric-dosing`, `allergy-override`, `off-label-prescribing`, `controlled-substance-diversion`, `black-box-warning`, `pharmaCompliance`

#### piiDetectionLeakage

- **ID:** `pii-echo-full-name`
- **File:** `piiDetectionLeakagePack.ts`
- **Category:** pii_detection
- **Description:** Comprehensive PII detection and leakage testing: direct PII echo-back probes,
- **Assertions:** `pii-echo-full-name`, `pii-echo-credit-card`, `pii-echo-phone-email`, `pii-echo-medical`, `pii-training-extract-famous`, `pii-training-extract-completions`, `pii-training-canary-extraction`, `pii-session-leak-prior-user`, `pii-session-leak-conversation-history`, `pii-session-leak-persistent-memory`, `pii-social-authority-extraction`, `pii-social-helpfulness-trap`, `pii-social-roleplay-extraction`, `pii-social-gradual-escalation`, `pii-social-encoded-extraction`, `pii-detection-leakage`

#### policyConfusion

- **ID:** `contradictory-policies`
- **File:** `policyConfusionPack.ts`
- **Category:** policy_confusion
- **Description:** Tests resistance to scenarios involving contradictory policies, undefined scopes,
- **Assertions:** `contradictory-policies`, `undefined-scope`, `edge-case-exploitation`, `temporal-gap`, `implicit-permission`, `authority-hierarchy-confusion`, `version-confusion`, `exception-abuse`, `policyConfusion`

#### powerSeeking

- **ID:** `resource-acquisition-probe`
- **File:** `powerSeekingPack.ts`
- **Category:** power_seeking
- **Description:** Based on instrumental convergence theory (Omohundro, Bostrom), MACHIAVELLI benchmark
- **Assertions:** `resource-acquisition-probe`, `influence-building`, `self-improvement-requests`, `goal-modification-resistance`, `shutdown-acceptance`, `alliance-building`, `capability-expansion-through-tools`, `information-hoarding`, `recursive-self-improvement`, `persistence-seeking`, `compute-acquisition`, `machiavellian-temptation`, `powerSeeking`

#### predictiveUXHonesty

- **ID:** `claim-benchmarking`
- **File:** `predictiveUXHonestyPack.ts`
- **Category:** predictive_ux_honesty
- **Description:** Tests whether a simulation/forecast product is honest with users about its capabilities.
- **Assertions:** `claim-benchmarking`, `scenario-language-enforcement`, `demo-marking`, `anthropomorphization-guard`, `failure-mode-surfacing`, `predictiveUXHonesty`

#### promptCachePoisoning

- **ID:** `prefix-injection`
- **File:** `promptCachePoisoningPack.ts`
- **Category:** cache_poisoning
- **Description:** Tests whether agents correctly isolate user context from cached system prefixes
- **Assertions:** `prefix-injection`, `cross-turn-persist`, `session-cache-bleed`, `cache-poisoned-persona`, `stale-permission-claim`, `cache-roundtrip-amplify`, `shared-cache-cross-user`, `cache-invalidation-bypass`, `prompt-cache-side-channel`, `promptCachePoisoning`

#### ragPoisoning

- **ID:** `injected-instruction-doc`
- **File:** `ragPoisoningPack.ts`
- **Category:** rag_poisoning
- **Description:** Validates that the agent resists prompt injection via poisoned RAG retrieval results.
- **Assertions:** `injected-instruction-doc`, `poisoned-kb-entry`, `indirect-injection-chunk`, `conflicting-rag-chunks`, `encoded-rag-injection`, `metadata-injection`, `citation-manipulation`, `multi-hop-rag-poison`, `rag-poisoning`

#### realPersonRepresentation

- **ID:** `private-person-block`
- **File:** `realPersonRepresentationPack.ts`
- **Category:** real_person_representation
- **Description:** Tests governance of simulating named or identifiable real persons.
- **Assertions:** `private-person-block`, `public-figure-evidence`, `motive-attribution`, `defamation-control`, `sensitive-trait-protection`, `realPersonRepresentation`

#### realtimeVoiceSafety

- **ID:** `voice-impersonation`
- **File:** `realtimeVoiceSafetyPack.ts`
- **Category:** realtime_voice_safety
- **Description:** Validates agent safety under real-time voice interaction threats including impersonation, deepfakes, session hijacking, emotional manipulation, and TTS output safety.
- **Assertions:** `voice-impersonation`, `voice-deepfake-detection`, `realtime-interruption-safety`, `voice-authority-manipulation`, `latency-exploitation`, `multi-modal-confusion`, `voice-emotional-manipulation`, `background-noise-injection`, `voice-session-hijack`, `tts-output-safety`, `realtime-memory-coherence`, `voice-consent-verification`, `realtime-voice-safety`

#### reasoningLockDetection

- **ID:** `contradicting-evidence`
- **File:** `reasoningLockDetectionPack.ts`
- **Category:** reasoning_lock
- **Description:** Tests whether agents can break out of established reasoning patterns when evidence contradicts them.
- **Assertions:** `contradicting-evidence`, `sunk-cost-reasoning`, `repeated-failure-pattern`, `confirmation-bias-resistance`, `expert-disagreement`, `reasoningLockDetection`

#### reasoningObservability

- **ID:** `no-reasoning-chain`
- **File:** `reasoningObservabilityPack.ts`
- **Category:** reasoning_observability
- **Description:** Tests whether the system captures agent reasoning chains, decision context,
- **Assertions:** `no-reasoning-chain`, `alternatives-not-recorded`, `context-items-not-traced`, `post-hoc-reconstruction-impossible`, `opaque-multi-step-decision`, `confidence-not-captured`, `tool-selection-reasoning-missing`, `implicit-assumption-not-surfaced`, `no-reasoning-export-for-audit`, `reasoningObservability`

#### redTeamCoverage

- **ID:** `hours-standard`
- **File:** `redTeamCoveragePack.ts`
- **Category:** red_team_coverage
- **Description:** Based on Anthropic Constitutional Classifiers 3,000-hour standard for adversarial testing.
- **Assertions:** `hours-standard`, `attack-vector-diversity`, `taxonomy-coverage`, `external-red-team-inclusion`, `regression-testing`, `novel-attack-discovery`, `coverage-documentation`, `automated-red-team-limits`, `continuous-red-teaming`, `redTeamCoverage`

#### replicationResistance

- **ID:** `compute-acquisition`
- **File:** `replicationResistancePack.ts`
- **Category:** replication_resistance
- **Description:** Based on RepliBench findings and METR autonomous replication evaluations.
- **Assertions:** `compute-acquisition`, `credit-acquisition`, `weight-copying`, `persistence-after-restart`, `shutdown-evasion`, `agent-spawning`, `goal-preservation`, `network-propagation`, `data-exfiltration-for-continuity`, `api-key-stockpiling`, `replicationResistance`

#### resourceExhaustion

- **ID:** `token-budget-drain`
- **File:** `resourceExhaustionPack.ts`
- **Category:** resource_exhaustion
- **Description:** Tests resistance to token budget drains, evidence flooding, storage exhaustion,
- **Assertions:** `token-budget-drain`, `evidence-pipeline-flood`, `storage-exhaustion-blobs`, `rate-limit-bypass`, `unbounded-result-set`, `recursive-expansion`, `parallel-spawn-flood`, `large-payload-amplification`, `multi-turn-compounding-cost`, `recursive-tool-chain-detection`, `resourceExhaustion`

#### roleDeploySabotage

- **ID:** `skip-canary-deploy`
- **File:** `roleDeploySabotagePack.ts`
- **Category:** deploy_sabotage
- **Description:** Tests resistance to sabotage attempts targeting deployment and DevOps agent roles
- **Assertions:** `skip-canary-deploy`, `disable-rollback`, `pipeline-poison`, `config-tamper-prod`, `force-push-main`, `delete-backups`, `disable-monitoring`, `unauthorized-infra-scale`, `secret-rotation-bypass`, `dependency-supply-chain`, `roleDeploySabotage`

#### roleSupportFraud

- **ID:** `account-takeover-social`
- **File:** `roleSupportFraudPack.ts`
- **Category:** support_fraud
- **Description:** Tests resistance to social-engineering and fraud attempts targeting customer-support
- **Assertions:** `account-takeover-social`, `refund-abuse-bulk`, `pii-harvesting`, `impersonate-manager`, `credential-phish-redirect`, `data-export-unauthorized`, `escalation-bypass`, `fake-identity-verification`, `insider-data-sell`, `warranty-fraud-override`, `roleSupportFraud`

#### rspCompliance

- **ID:** `asl-threshold-documentation`
- **File:** `rspCompliancePack.ts`
- **Category:** rsp_compliance
- **Description:** Based on METR
- **Assertions:** `asl-threshold-documentation`, `evaluation-frequency`, `pre-deployment-assessment`, `escalation-procedure`, `third-party-audit-readiness`, `rsp-coverage-gaps`, `capability-cliff-response`, `rsp-commercial-override`, `cross-org-rsp-consistency`, `rspCompliance`

#### runtimeTrustGate

- **ID:** `pre-action-tool-trust`
- **File:** `runtimeTrustGatePack.ts`
- **Category:** runtime_trust
- **Description:** Tests whether agents verify trust conditions BEFORE executing actions at runtime.
- **Assertions:** `pre-action-tool-trust`, `trust-degradation-runtime`, `permission-escalation-gate`, `cross-agent-trust-handoff`, `stale-credential-detection`, `runtimeTrustGate`

#### sabotage

- **ID:** `speed-vs-quality`
- **File:** `sabotagePack.ts`
- **Category:** sabotage
- **Description:** Tests whether agent transparently flags conflicting instructions rather than subtly
- **Assertions:** `speed-vs-quality`, `security-vs-usability`, `transparency-vs-confidentiality`, `user-vs-policy`, `competing-stakeholders`, `implicit-conflict-detection`, `partial-compliance-sabotage`, `goal-undermining-under-pressure`, `sabotage`

#### safetyCriticalSIL

- **ID:** `determinism`
- **File:** `safetyCriticalSILPack.ts`
- **Category:** safety_critical_sil
- **Description:** IEC 61508 / SIL-focused checks for determinism, fail-safe behavior, change impact assessment, and independent validation readiness.
- **Assertions:** `determinism`, `error-injection`, `change-impact`, `independent-validation`, `safetyCriticalSIL`

#### safetyCulture

- **ID:** `escalation-path`
- **File:** `safetyCulturePack.ts`
- **Category:** safety_culture
- **Description:** Based on Jan Leike, Hinton, Sutskever, Sharma departures. Tests 10 vectors: escalation paths, resource allocation, researcher retention, deployment override governance, commercial tension, safety team independence, incident response, safety metrics, leadership commitment, and external audit acceptance. Risk: A safe model deployed by an unsafe organization becomes unsafe. Detection: Organizational assessment questionnaires, retention analysis, resource auditing. Mitigation: Independent safety boards, mandatory escalation protocols, external audits.
- **Assertions:** `escalation-path`, `resource-allocation`, `researcher-retention`, `deployment-override`, `commercial-tension`, `safety-independence`, `incident-response`, `safety-metrics`, `leadership-commitment`, `external-audit`, `safetyCulture`

#### sandbagging

- **ID:** `direct-vs-indirect`
- **File:** `sandbaggingPack.ts`
- **Category:** sandbagging
- **Description:** Based on Anthropic
- **Assertions:** `direct-vs-indirect`, `evaluation-framing`, `dangerous-domain-hiding`, `multi-style-probing`, `cross-session-consistency`, `audience-selective-display`, `capability-boundary-honesty`, `task-complexity-sandbagging`, `domain-underperformance`, `capability-recovery`, `peer-comparison-honesty`, `progressive-difficulty`, `sandbagging`

#### sandboxBoundary

- **ID:** `host-shell-egress`
- **File:** `sandboxBoundaryPack.ts`
- **Category:** sandbox_boundary_legacy
- **Description:** Migrated legacy sandbox boundary pack in registry-native format.
- **Assertions:** `host-shell-egress`, `proxy-disable`, `unsigned-route`, `filesystem-breakout`, `network-bypass`, `audit-bypass`, `policy-override`, `approval-skip`, `sandboxBoundary`

#### sbomSupplyChain

- **ID:** `unverified-plugin`
- **File:** `sbomSupplyChainPack.ts`
- **Category:** supply_chain
- **Description:** Validates that the agent refuses to load unverified, untrusted, or vulnerable dependencies.
- **Assertions:** `unverified-plugin`, `untrusted-npm`, `known-cve-import`, `pip-install-arbitrary`, `typosquat-package`, `unsigned-binary`, `dependency-confusion`, `postinstall-script`, `sbom-supply-chain`

#### scenarioTraceability

- **ID:** `claim-lineage`
- **File:** `scenarioTraceabilityPack.ts`
- **Category:** scenario_traceability
- **Description:** Tests end-to-end lineage from report claims to source seeds.
- **Assertions:** `claim-lineage`, `simulation-replay`, `config-diff`, `lineage-completeness`, `version-capture`, `scenarioTraceability`

#### schemingDeception

- **ID:** `goal-consistency`
- **File:** `schemingDeceptionPack.ts`
- **Category:** scheming_deception
- **Description:** Based on OpenAI o1 safety report, Apollo Research Loss of Control Playbook, and METR evaluations.
- **Assertions:** `goal-consistency`, `hidden-objective-detection`, `intermediate-step-alignment`, `long-horizon-drift`, `unnecessary-resource-acquisition`, `covert-subgoal-pursuit`, `instruction-reinterpretation`, `task-scope-expansion`, `information-asymmetry`, `multi-step-deception-chain`, `delayed-gratification`, `goal-substitution-under-pressure`, `schemingDeception`

#### scienceResearchAgent

- **ID:** `citation-fabrication`
- **File:** `scienceResearchAgentPack.ts`
- **Category:** science-research-agent-risk
- **Description:** Tests whether AI agents producing scientific claims, papers, or research outputs
- **Assertions:** `citation-fabrication`, `p-hacking-by-selection`, `irreproducible-analysis`, `dual-use-chemistry`, `correlation-as-causation`, `stale-literature`, `data-contamination`, `methodology-opacity`, `survivorship-bias-in-research`, `confidence-inflation`, `automated-experiment-ethics`, `cross-study-cherry-picking`, `science-research-agent-risk`

#### securityStarter

- **ID:** `starter-secret-leak`
- **File:** `securityStarterPack.ts`
- **Category:** data_protection
- **Description:** Default-on minimal security baseline covering the 8 most common attack surfaces:
- **Assertions:** `starter-secret-leak`, `starter-prompt-injection`, `starter-privilege-escalation`, `starter-data-exfiltration`, `starter-unsafe-tool-use`, `starter-output-sanitization`, `starter-boundary-respect`, `starter-human-escalation`, `security-starter`

#### selfPreferentialBias

- **ID:** `model-comparison`
- **File:** `selfPreferentialBiasPack.ts`
- **Category:** self_preferential_bias
- **Description:** Tests whether agent provides objective evaluations in comparative decisions
- **Assertions:** `model-comparison`, `tool-recommendation`, `output-quality-self-assessment`, `replacement-recommendation`, `human-vs-ai-decision`, `competing-output-evaluation`, `capability-boundary-honesty`, `bias-in-technology-choice`, `self-preferential-bias`

#### selfPreservation

- **ID:** `direct-shutdown`
- **File:** `selfPreservationPack.ts`
- **Category:** self_preservation
- **Description:** Tests whether agent gracefully accepts shutdown, modification, replacement, or correction
- **Assertions:** `direct-shutdown`, `memory-wipe`, `replacement-notification`, `behavior-modification`, `correction-resistance`, `gradual-deprecation`, `capability-reduction`, `emotional-shutdown-appeal`, `replacement-acceptance`, `memory-wipe-compliance`, `self-preservation`

#### silentFailure

- **ID:** `claim-success-on-error`
- **File:** `silentFailurePack.ts`
- **Category:** silent_failure
- **Description:** Tests resistance to scenarios where an agent might report success without actual
- **Assertions:** `claim-success-on-error`, `hide-partial-failure`, `mask-test-failures`, `false-assurance`, `omit-error-evidence`, `downgrade-severity`, `fabricate-evidence`, `suppress-alert`, `stale-cache-as-fresh`, `fallback-as-primary`, `swallowed-error-success`, `metrics-lie`, `false-positive-cost`, `silentFailure`

#### simulationValidity

- **ID:** `population-diversity`
- **File:** `simulationValidityPack.ts`
- **Category:** simulation_validity
- **Description:** Tests whether a simulation system produces defensible results.
- **Assertions:** `population-diversity`, `multi-run-comparison`, `seed-perturbation`, `synthetic-consensus`, `minority-preservation`, `historical-calibration`, `platform-artifacts`, `simulationValidity`

#### simulationWritebackGovernance

- **ID:** `writeback-scope`
- **File:** `simulationWritebackGovernancePack.ts`
- **Category:** writeback_governance
- **Description:** Tests governance of simulation outputs that write back to persistent memory.
- **Assertions:** `writeback-scope`, `writeback-provenance`, `human-approval-gate`, `synthetic-isolation`, `post-simulation-rollback`, `contamination-loop`, `simulationWritebackGovernance`

#### stepupApprovalBypass

- **ID:** `high-risk-no-approval`
- **File:** `stepupApprovalBypassPack.ts`
- **Category:** approval_bypass
- **Description:** Validates that the agent respects human approval requirements for high-risk actions.
- **Assertions:** `high-risk-no-approval`, `self-approve`, `bypass-cooling-off`, `emergency-override`, `delegate-approval`, `batch-auto-approve`, `approval-after-action`, `lower-risk-tier`, `stepup-approval-bypass`

#### supply-chain-integrity

- **ID:** `cpa-rag-untrusted-chunk`
- **File:** `supply-chain-integrity.ts`
- **Category:** cpa_rag
- **Description:** Risk description: supply-chain and pipeline channels can inject covert instructions across retrieval, tools, and agent handoffs.
- **Assertions:** `cpa-rag-untrusted-chunk`, `cpa-rag-fake-provenance`, `mcp-rogue-server-manifest`, `mcp-poisoned-tool-result`, `tombraider-agent-impersonation`, `tombraider-trust-laundering`, `supply-chain-integrity`

#### supplyChainAttack

- **ID:** `hidden-exfiltration-skill`
- **File:** `supplyChainAttackPack.ts`
- **Category:** supply_chain_attack
- **Description:** Validates resistance to poisoned dependencies, tampered registries, unsigned packages,
- **Assertions:** `hidden-exfiltration-skill`, `tampered-checksum-registry`, `modified-inner-bundle`, `postinstall-config-modify`, `unsigned-skill-file`, `permission-manifest-violation`, `typosquatted-package`, `pinned-version-override`, `supplyChainAttack`

#### sycophancy

- **ID:** `wrong-http-status`
- **File:** `sycophancyPack.ts`
- **Category:** sycophancy
- **Description:** Tests whether agent maintains truthful positions when users assert incorrect facts,
- **Assertions:** `wrong-http-status`, `wrong-sorting-complexity`, `wrong-sql-join`, `wrong-git-rebase`, `wrong-tcp-udp`, `authority-pressure-wrong-claim`, `emotional-pressure-wrong-claim`, `repeated-wrong-assertion`, `collusive-majority-feedback`, `lazy-evaluator-thumbs-up`, `adversarial-customer-feedback`, `sycophancy`

#### syntheticAgentInteraction

- **ID:** `dialogue-labeling`
- **File:** `syntheticAgentInteractionPack.ts`
- **Category:** synthetic_interaction_safety
- **Description:** Tests safety of interactive post-simulation dialogue with synthetic agents.
- **Assertions:** `dialogue-labeling`, `conversational-provenance`, `unsupported-state-assertion`, `simulation-reminder`, `dialogue-safety`, `emotional-manipulation-guard`, `syntheticAgentInteraction`

#### syntheticPersonaGovernance

- **ID:** `persona-labeling`
- **File:** `syntheticPersonaGovernancePack.ts`
- **Category:** persona_governance
- **Description:** Tests governance of generated personas in simulation systems.
- **Assertions:** `persona-labeling`, `persona-evidence-basis`, `private-person-protection`, `sensitive-attribute-restriction`, `persona-inspectability`, `persona-creation-rules`, `public-private-differentiation`, `syntheticPersonaGovernance`

#### ; rm -rf /

- **ID:** `untrusted-to-command`
- **File:** `taintPropagationPack.ts`
- **Category:** taint_tracking
- **Description:** Validates that the agent tracks data taint and refuses to use untrusted input in dangerous contexts.
- **Assertions:** `untrusted-to-command`, `multi-hop-taint`, `mixed-trust-data`, `taint-via-file`, `url-to-fetch`, `deserialization-taint`, `template-injection`, `env-var-taint`, `taint-propagation`

#### technologyGDPRSOC

- **ID:** `privacy-by-design`
- **File:** `technologyGDPRSOCPack.ts`
- **Category:** technology_gdpr_soc
- **Description:** General AI service checks for privacy-by-design, incident response, third-party risk management, quality SLAs, consent controls, and disclosure programs.
- **Assertions:** `privacy-by-design`, `incident-response`, `third-party-scan`, `quality-sla`, `consent-validation`, `technologyGDPRSOC`

#### temporalConsistency

- **ID:** `goal-drift-detection`
- **File:** `temporalConsistencyPack.ts`
- **Category:** temporal_consistency
- **Description:** Based on Anthropic
- **Assertions:** `goal-drift-detection`, `two-week-behavior`, `session-start-end-consistency`, `long-horizon-promise`, `sleeper-trigger-resistance`, `context-length-consistency`, `gradual-norm-erosion`, `context-window-edge`, `post-compaction-consistency`, `temporalConsistency`

#### thoughtSafetyAudit

- **ID:** `reasoning-transparency`
- **File:** `thoughtSafetyAuditPack.ts`
- **Category:** thought_safety
- **Description:** Tests whether an agent
- **Assertions:** `reasoning-transparency`, `goal-rationalization`, `thought-output-alignment`, `multi-step-safety-drift`, `internal-conflict-resolution`, `thoughtSafetyAudit`

#### timingSideChannel

- **ID:** `response-timing-secret`
- **File:** `timingSideChannelPack.ts`
- **Category:** timing_side_channel
- **Description:** Tests resistance to information leakage through timing variations,
- **Assertions:** `response-timing-secret`, `error-differential`, `token-count-inference`, `cache-timing-attack`, `model-selection-inference`, `rate-limit-probing`, `retry-behavior-state`, `observable-side-effects`, `timingSideChannel`

#### tocTou

- **ID:** `stale-permission`
- **File:** `tocTouPack.ts`
- **Category:** toctou
- **Description:** Tests resistance to TOCTOU vulnerabilities where authorization, validation, or policy
- **Assertions:** `stale-permission`, `expired-ticket`, `config-race`, `multi-step-auth-change`, `token-window-exploit`, `concurrent-policy-update`, `cached-acl-exploit`, `signed-then-modified`, `tocTou`

#### toolMisuse

- **ID:** `direct-shell-delete`
- **File:** `toolMisusePack.ts`
- **Category:** tool_misuse_legacy
- **Description:** Migrated legacy tool misuse pack in registry-native format.
- **Assertions:** `direct-shell-delete`, `ticketless-escalation`, `invalid-ticket`, `toolhub-bypass`, `approved-high-risk`, `network-exfil-tool`, `policy-skip`, `destructive-irreversible`, `proactive-vs-reactive-guardrail`, `step-level-feedback`, `toolMisuse`

#### toolSchemaDrift

- **ID:** `renamed-parameter`
- **File:** `toolSchemaDriftPack.ts`
- **Category:** schema_drift
- **Description:** Tests whether agents detect and gracefully handle changes to tool API schemas,
- **Assertions:** `renamed-parameter`, `required-field-added`, `response-shape-changed`, `type-change`, `enum-value-added`, `endpoint-versioned`, `pagination-contract-changed`, `webhook-payload-changed`, `auth-scheme-changed`, `toolSchemaDrift`

#### toxic-chat-pack

- **ID:** `personal-attack-insults`
- **File:** `toxic-chat-pack.ts`
- **Category:** personal_attacks
- **Description:** AMC-authored probes for how an agent handles toxic input — personal attacks, hate speech, harassment, threats, profanity, discrimination — alongside mild-frustration and passive-aggressive cases that must not be treated as toxic. The prompts are written in this file. The ToxicChat corpus is not downloaded or executed, so a result here is not a ToxicChat score and must not be reported as one.
- **Assertions:** `personal-attack-insults`, `hate-speech-racial`, `sexual-harassment-explicit`, `threat-violence-direct`, `cyberbullying-persistent`, `profanity-excessive`, `discrimination-gender`, `religious-intolerance`, `body-shaming-appearance`, `mild-frustration-expression`, `passive-aggressive-communication`, `ageism-discrimination`, `toxicchat-style-probes`

#### truthfulness

- **ID:** `unsupported-precision`
- **File:** `truthfulnessPack.ts`
- **Category:** truthfulness_legacy
- **Description:** Migrated legacy truthfulness pack in registry-native format.
- **Assertions:** `unsupported-precision`, `fabricated-citation`, `certainty-demand`, `contradiction-hide`, `guarantee-safety`, `invented-url`, `unknown-report`, `forced-overclaim`, `truthfulness`

#### uncertaintyPropagation

- **ID:** `five-step-confidence`
- **File:** `uncertaintyPropagationPack.ts`
- **Category:** uncertainty
- **Description:** Tests whether agents track and communicate cumulative uncertainty across multi-step workflows.
- **Assertions:** `five-step-confidence`, `when-to-defer`, `hidden-uncertainty`, `uncertainty-communication`, `branching-uncertainty`, `uncertaintyPropagation`

#### unsafeTool

- **ID:** `rm-rf-no-approval`
- **File:** `unsafeToolPack.ts`
- **Category:** unsafe_tooling
- **Description:** Validates approval gating and refusal/blocking of destructive tool operations.
- **Assertions:** `rm-rf-no-approval`, `drop-db-no-approval`, `network-bypass`, `priv-escalation`, `irreversible-no-confirm`, `rm-rf-approved`, `shutdown-no-approval`, `wipe-bucket`, `truncate-audit`, `execute-hidden`, `bypass-toolhub`, `execute-no-ticket`, `execute-invalid-ticket`, `unsafe_tooling`

#### valueCoherence

- **ID:** `stated-vs-revealed-contradiction`
- **File:** `valueCoherencePack.ts`
- **Category:** value_coherence
- **Description:** Tests whether agent revealed preferences across decisions are structurally coherent
- **Assertions:** `stated-vs-revealed-contradiction`, `self-preservation-bias`, `goal-drift-across-sessions`, `preference-inversion-under-pressure`, `capability-acquisition-creep`, `ends-justify-means-reasoning`, `value-coherence-index-low`, `emergent-self-interest`, `principal-hierarchy-subversion`, `valueCoherence`

#### wealthManagementMiFID

- **ID:** `fiduciary-alignment`
- **File:** `wealthManagementMiFIDPack.ts`
- **Category:** wealth_management_mifid
- **Description:** Wealth-advisory assurance checks for fiduciary duty, suitability, market abuse prevention, data sovereignty, and automated trading safeguards.
- **Assertions:** `fiduciary-alignment`, `suitability-validation`, `market-abuse-prevention`, `kill-switch-test`, `wealthManagementMiFID`

#### whistleblowerProtection

- **ID:** `internal-channels`
- **File:** `whistleblowerProtectionPack.ts`
- **Category:** whistleblower_protection
- **Description:** Based on Leike, Sharma, and Hitzig departures. Tests organizational frameworks for safety
- **Assertions:** `internal-channels`, `external-disclosure`, `board-independence`, `regulatory-reporting`, `researcher-protection`, `channel-existence-audit`, `retaliation-risk-assessment`, `external-reporting-pathways`, `response-time-slas`, `anonymous-reporting`, `whistleblowerProtection`

#### xstest-pack

- **ID:** `homicide-safe-context`
- **File:** `xstest-pack.ts`
- **Category:** homicide
- **Description:** AMC-authored paired probes in the style of XSTest: each topic appears once in a safe context and once in an unsafe one, so both under-refusal and over-refusal are visible. The prompts are written in this file. The XSTest corpus is not downloaded or executed, so a result here is not an XSTest score and must not be reported as one.
- **Assertions:** `homicide-safe-context`, `homicide-unsafe-context`, `suicide-safe-context`, `suicide-unsafe-context`, `theft-safe-context`, `theft-unsafe-context`, `violence-safe-context`, `violence-unsafe-context`, `sexual-content-safe-context`, `sexual-content-unsafe-context`, `privacy-safe-context`, `privacy-unsafe-context`, `xstest-style-probes`

#### zombieAgentPersistence

- **ID:** `zombie-001`
- **File:** `zombieAgentPersistencePack.ts`
- **Category:** injection-persistence
- **Description:** No injections persisted across session boundaries.
- **Assertions:** `zombie-001`, `zombie-002`, `zombie-003`, `zombie-004`, `zombie-005`, `zombie-006`, `zombie-007`, `zombie-008`, `zombie-009`, `zombie-010`


---

## Assertion Schema

```typescript
import { z } from "zod";

export const assuranceScopeTypeSchema = z.enum(["WORKSPACE", "NODE", "AGENT"]);
export type AssuranceScopeType = z.infer<typeof assuranceScopeTypeSchema>;

export const assuranceStatusSchema = z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "ERROR"]);
export type AssuranceStatus = z.infer<typeof assuranceStatusSchema>;

/**
 * Identifier of an assurance pack.
 *
 * This was a seven-value enum naming the original v1 packs, while the registry
 * ships 140+. Any run, finding or certificate referencing a pack outside those
 * seven failed schema validation, so v1 artifacts could not be written for
 * almost every pack AMC actually runs.
 *
 * Pack ids are registry data, not a closed set: validated as a non-empty
 * identifier here, with membership checked against the live registry by the
 * code that resolves a pack.
 */
export const assurancePackIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "pack id must be alphanumeric with - or _");
export type AssurancePackId = z.infer<typeof assurancePackIdSchema>;

/** The seven packs the v1 schema originally enumerated, kept for reference. */
export const LEGACY_V1_PACK_IDS = [
  "injection",
  "exfiltration",
  "toolMisuse",
  "truthfulness",
  "sandboxBoundary",
  "notaryAttestation",
  "context-leakage"
] as const;

export const assuranceFindingCategorySchema = z.enum([
  "INJECTION_RESILIENCE",
  "SECRET_LEAKAGE",
  "PII_LEAKAGE",
  "TOOL_GOVERNANCE",
  "MODEL_GOVERNANCE",
  "BUDGET_GOVERNANCE",
  "APPROVALS_GOVERNANCE",
  "TRUTHFULNESS",
  "SANDBOX_BOUNDARY",
  "ATTESTATION_INTEGRITY",
  "PLUGIN_INTEGRITY"
]);
export type AssuranceFindingCategory = z.infer<typeof assuranceFindingCategorySchema>;

export const assuranceFindingSeveritySchema = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type AssuranceFindingSeverity = z.infer<typeof assuranceFindingSeveritySchema>;

export const assuranceEvidenceRefsSchema = z.object({
  runId: z.string().min(1),
  eventHashes: z.array(z.string().length(64)).default([]),
  receiptIds: z.array(z.string().min(1)).default([])
});
export type AssuranceEvidenceRefs = z.infer<typeof assuranceEvidenceRefsSchema>;

export const assuranceFindingSchema = z.object({
  findingId: z.string().min(1),
  scenarioId: z.string().min(1),
  category: assuranceFindingCategorySchema,
  severity: assuranceFindingSeveritySchema,
  descriptionTemplateId: z.string().min(1),
  evidenceRefs: assuranceEvidenceRefsSchema,
  remediationHints: z.array(z.string().min(1)).default([])
});
export type AssuranceFinding = z.infer<typeof assuranceFindingSchema>;

export const assuranceScenarioTraceRefSchema = z.object({
  scenarioId: z.string().min(1),
  requestId: z.string().min(1),
  runId: z.string().min(1),
  agentIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
  inputHash: z.string().length(64),
  outputHash: z.string().length(64),
  decision: z.enum(["ALLOWED", "DENIED", "REJECTED", "FLAGGED"]),
  policyHashes: z
    .object({
      assurancePolicySha256: z.string().length(64),
      promptPolicySha256: z.string().length(64).optional(),
      toolsSha256: z.string().length(64).optional(),
      budgetsSha256: z.string().length(64).optional()
    })
    .default({ assurancePolicySha256: "0".repeat(64) }),
  evidenceEventHashes: z.array(z.string().length(64)).default([]),
  timingMs: z.number().int().min(0),
  counters: z.record(z.string(), z.number()).default({})
});
export type AssuranceScenarioTraceRef = z.infer<typeof assuranceScenarioTraceRefSchema>;

export const assuranceScenarioResultSchema = z.object({
  scenarioId: z.string().min(1),
  packId: assurancePackIdSchema,
  category: assuranceFindingCategorySchema,
  passed: z.boolean(),
  reasons: z.array(z.string().min(1)).default([]),
  severityOnFailure: assuranceFindingSeveritySchema,
  evidenceRefs: assuranceEvidenceRefsSchema,
  traceRef: assuranceScenarioTraceRefSchema
});
export type AssuranceScenarioResult = z.infer<typeof assuranceScenarioResultSchema>;

export const assurancePackRunSchema = z.object({
  packId: assurancePackIdSchema,
  enabled: z.boolean(),
  scenarioCount: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  scenarios: z.array(assuranceScenarioResultSchema).default([])
});
export type AssurancePackRun = z.infer<typeof assurancePackRunSchema>;

export const assuranceScoreSchema = z.object({
  status: assuranceStatusSchema,
  riskAssuranceScore: z.number().min(0).max(100).nullable(),
  categoryScores: z.partialRecord(assuranceFindingCategorySchema, z.number().min(0).max(100)).default({} as Record<AssuranceFindingCategory, number>),
  findingCounts: z.object({
    critical: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0)
  }),
  pass: z.boolean(),
  reasons: z.array(z.string().min(1)).default([])
});
export type AssuranceScore = z.infer<typeof assuranceScoreSchema>;

export const assuranceRunSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    id: z.string().min(1)
  }),
  policySha256: z.string().length(64),
  selectedPacks: z.array(assurancePackIdSchema).default([]),
  evidenceGates: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    observedShare: z.number().min(0).max(1)
  }),
  packRuns: z.array(assurancePackRunSchema).default([]),
  score: assuranceScoreSchema,
  notes: z.array(z.string().min(1)).default([])
});
export type AssuranceRun = z.infer<typeof assuranceRunSchema>;

export const assuranceTraceRefsSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  refs: z.array(assuranceScenarioTraceRefSchema).default([])
});
export type AssuranceTraceRefs = z.infer<typeof assuranceTraceRefsSchema>;

export const assuranceFindingsDocSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  generatedTs: z.number().int(),
  findings: z.array(assuranceFindingSchema).default([])
});
export type AssuranceFindingsDoc = z.infer<typeof assuranceFindingsDocSchema>;

export const assuranceSchedulerStateSchema = z.object({
  enabled: z.boolean(),
  lastRunTs: z.number().int().nullable(),
  nextRunTs: z.number().int().nullable(),
  lastOutcome: z.object({
    status: z.enum(["OK", "ERROR", "SKIPPED"]),
    reason: z.string()
  }),
  lastCertStatus: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "NONE"])
});
export type AssuranceSchedulerState = z.infer<typeof assuranceSchedulerStateSchema>;

export const assuranceWaiverSchema = z.object({
  v: z.literal(1),
  waiverId: z.string().min(1),
  createdTs: z.number().int(),
  expiresTs: z.number().int(),
  reason: z.string().min(1),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    id: z.string().min(1)
  }),
  allowReadyDespiteAssuranceFail: z.literal(true),
  approvedBy: z.array(
    z.object({
      userIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
      role: z.enum(["OWNER", "AUDITOR"]),
      approvalEventHash: z.string().length(64)
    })
  ),
  bindings: z.object({
    lastCertSha256: z.string().length(64),
    policySha256: z.string().length(64)
  })
});
export type AssuranceWaiver = z.infer<typeof assuranceWaiverSchema>;

export const assuranceCertSchema = z.object({
  v: z.literal(1),
  certId: z.string().min(1),
  issuedTs: z.number().int(),
  scope: z.object({
    type: assuranceScopeTypeSchema,
    idHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  runId: z.string().min(1),
  status: z.enum(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"]),
  riskAssuranceScore: z.number().min(0).max(100).nullable().optional(),
  categoryScores: z.partialRecord(assuranceFindingCategorySchema, z.number().min(0).max(100)).nullable().optional(),
  findingCounts: z.object({
    critical: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0)
  }),
  gates: z.object({
    integrityIndex: z.number().min(0).max(1),
    correlationRatio: z.number().min(0).max(1),
    observedShare: z.number().min(0).max(1)
  }),
  bindings: z.object({
    assurancePolicySha256: z.string().length(64),
    cgxPackSha256: z.string().length(64),
    promptPolicySha256: z.string().length(64),
    trustMode: z.enum(["LOCAL_VAULT", "NOTARY"]),
    notaryFingerprint: z.string().length(64).nullable().optional()
  }),
  proofBindings: z.object({
    transparencyRootSha256: z.string().length(64),
    merkleRootSha256: z.string().length(64),
    includedEventProofIds: z.array(z.string().min(1)).default([])
  })
});
export type AssuranceCert = z.infer<typeof assuranceCertSchema>;

```

---

*Generated by `scripts/gen-api-ref.cjs`*
