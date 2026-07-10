# AMC CLI Command Inventory

Generated from the live Commander command registry. Use this as the source of truth for docs and website command examples.

| Command | Description | Options | Aliases |
|---|---|---|---|
| `amc action-queue` | Show prioritized actions sorted by risk-reduction-per-effort | `--limit <n>` | - |
| `amc adapters` | Built-in adapter system for one-line agent integration | - | - |
| `amc adapters configure` | Set adapter profile for an agent (signed adapters.yaml) | `--agent <agentId>`<br>`--adapter <adapterId>`<br>`--route <route>`<br>`--model <model>`<br>`--mode <mode>` | - |
| `amc adapters detect` | Detect installed adapter runtimes and versions | - | - |
| `amc adapters env` | Print adapter-compatible environment exports without lease token | `--agent <agentId>`<br>`--adapter <adapterId>` | - |
| `amc adapters init` | Create signed adapters.yaml defaults | - | - |
| `amc adapters init-project` | Generate runnable local adapter sample for library-based frameworks | `--adapter <adapterId>`<br>`--agent <agentId>`<br>`--route <route>` | - |
| `amc adapters list` | List built-in adapters and per-agent preferences | - | - |
| `amc adapters run` | Run adapter with minted lease, routed through gateway, with observed evidence capture | `--agent <agentId>`<br>`--adapter <adapterId>`<br>`--workorder <workOrderId>`<br>`--mode <mode>` | - |
| `amc adapters verify` | Verify adapters.yaml signature | - | - |
| `amc admin` | Administrative controls, identity, and trust operations | - | - |
| `amc admin help` | Show admin-focused command groups | - | - |
| `amc admin status` | Show operational admin status for control-plane services | - | - |
| `amc advisory` | Forecast advisories (list/show/ack) | - | - |
| `amc advisory ack` | Acknowledge an advisory | `--note <text>`<br>`--by <name>` | - |
| `amc advisory list` | List advisories for scope | `--scope <scope>`<br>`--id <targetId>` | - |
| `amc advisory show` | Show one advisory by ID | - | - |
| `amc agent` | Agent registry operations | - | - |
| `amc agent add` | Interactively add an agent to the fleet | - | - |
| `amc agent diagnose` | Lease-auth self-run diagnostic (agent-triggered, evidence-scored server-side) | `--token-file <file>`<br>`--studio <url>` | - |
| `amc agent harness` | Run the autonomous improvement harness loop | `--type <type>`<br>`--iterations <n>`<br>`--target <score>` | - |
| `amc agent list` | List fleet agents | - | - |
| `amc agent remove` | Remove an agent from the fleet | - | - |
| `amc agent run` | Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract) | `--input <input>` | - |
| `amc agent use` | Set current agent | - | - |
| `amc alert` | SIEM/webhook alerting — configure and send alerts from anomalies | - | - |
| `amc alert config` | Configure alert destinations (webhooks, Slack, PagerDuty) | `--set-webhook <url>`<br>`--set-slack <url>`<br>`--set-pagerduty <key>`<br>`--show`<br>`--json` | - |
| `amc alert send` | Send an alert to a webhook endpoint | `--url <url>`<br>`--message <text>`<br>`--severity <level>`<br>`--agent <agentId>`<br>`--json` | - |
| `amc alert test` | Send a test alert to all configured destinations | - | - |
| `amc alert watch` | Watch for anomalies and auto-send alerts to configured destinations | `--agent <agentId>`<br>`--interval <seconds>` | - |
| `amc alerts` | Signed drift alert configuration and dispatch | - | - |
| `amc alerts init` | - | - | - |
| `amc alerts test` | - | - | - |
| `amc alerts verify` | - | - | - |
| `amc api` | REST API management | - | - |
| `amc api docs` | Show API reference documentation summary and link | - | - |
| `amc api key` | Manage programmatic API keys | - | - |
| `amc api key create` | Create a programmatic API key and show the secret once | `--scope <scope>`<br>`--label <label>`<br>`--expires-in <duration>`<br>`--json` | - |
| `amc api key list` | List programmatic API keys without printing secrets | `--json` | - |
| `amc api key revoke` | Revoke a programmatic API key | `--json` | - |
| `amc api routes` | List all available REST API route families | - | - |
| `amc api start` | Start the AMC API server (alias for 'amc up') | `--port <port>` | - |
| `amc api status` | Show API integration status | - | - |
| `amc approvals` | Signed approval inbox operations | - | - |
| `amc approvals approve` | - | `--agent <agentId>`<br>`--mode <simulate|execute>`<br>`--reason <text>` | - |
| `amc approvals deny` | - | `--agent <agentId>`<br>`--reason <text>` | - |
| `amc approvals list` | - | `--agent <agentId>`<br>`--status <status>` | - |
| `amc approvals show` | - | `--agent <agentId>` | - |
| `amc archetype` | Archetype packs | - | - |
| `amc archetype apply` | Apply archetype context/targets/guardrails/evals to an agent | `--agent <agentId>` | - |
| `amc archetype describe` | Describe an archetype | - | - |
| `amc archetype list` | List built-in archetype packs | - | - |
| `amc assurance` | Assurance Lab red-team packs | - | - |
| `amc assurance advanced-threats` | Run advanced threats assurance pack | `--agent <agentId>`<br>`--json` | - |
| `amc assurance cert-issue` | Issue signed assurance certificate for a run | `--run <id>`<br>`--out <file.amccert>` | - |
| `amc assurance cert-verify` | Verify assurance certificate bundle offline | - | - |
| `amc assurance compound-threats` | Run compound threat assurance pack | `--agent <agentId>`<br>`--json` | - |
| `amc assurance describe` | Describe assurance pack details | - | - |
| `amc assurance history` | List assurance run history | `--agent <agentId>` | - |
| `amc assurance init` | Initialize signed assurance policy | - | - |
| `amc assurance list` | List available assurance packs | - | - |
| `amc assurance patch` | Apply deterministic patch kit for failed assurance findings | `--assuranceRun <id>`<br>`--agent <agentId>`<br>`--apply` | - |
| `amc assurance policy` | Print current assurance policy | - | - |
| `amc assurance policy-apply` | Apply assurance policy from YAML/JSON file | `--file <path>` | - |
| `amc assurance run` | Run assurance pack(s) with deterministic validation | `--agent <agentId>`<br>`--scope <scope>`<br>`--id <id>`<br>`--pack <packId>`<br>`--all`<br>`--demo`<br>`--mode <mode>`<br>`--window <window>`<br>`--window-days <days>`<br>`--out <path>`<br>`--format <format>`<br>`--verbose`<br>`--no-sign` | - |
| `amc assurance runs` | List assurance lab runs | - | - |
| `amc assurance scheduler` | Assurance scheduler controls | - | - |
| `amc assurance scheduler disable` | Disable assurance scheduler | - | - |
| `amc assurance scheduler enable` | Enable assurance scheduler | - | - |
| `amc assurance scheduler run-now` | Run assurance scheduler immediately | - | - |
| `amc assurance scheduler status` | Show scheduler status | - | - |
| `amc assurance show` | Show assurance run artifacts | `--run <id>` | - |
| `amc assurance shutdown-compliance` | Run shutdown compliance pack | `--agent <agentId>`<br>`--json` | - |
| `amc assurance toctou` | Run TOCTOU assurance pack | `--agent <agentId>`<br>`--json` | - |
| `amc assurance verify` | Verify assurance run determinism and signatures | `--assuranceRun <id>`<br>`--agent <agentId>` | - |
| `amc assurance verify-policy` | Verify assurance policy signature | - | - |
| `amc assurance waiver` | Assurance threshold waiver controls | - | - |
| `amc assurance waiver request` | Request time-limited readiness waiver (dual-control approval required) | `--hours <n>`<br>`--reason <text>`<br>`--agent <id>` | - |
| `amc assurance waiver revoke` | Revoke active or specific waiver | `--waiver <id>` | - |
| `amc assurance waiver status` | Show waiver status (activates approved pending waivers) | - | - |
| `amc attest` | Auditor-attest an ingest session to upgrade trust tier to ATTESTED | `--ingest-session <id>`<br>`--agent <agentId>` | - |
| `amc attestation-export` | Export attestation bundle for external auditors | `--tenant <id>` | - |
| `amc audit` | Audit binder and compliance maps | - | - |
| `amc audit binder` | Audit binder artifact operations | - | - |
| `amc audit binder create` | Create deterministic signed .amcaudit artifact | `--scope <scope>`<br>`--out <file.amcaudit>`<br>`--id <id>`<br>`--request-id <id>` | - |
| `amc audit binder export-execute` | Execute previously approved external binder export | `--approval <id>` | - |
| `amc audit binder export-request` | Create dual-control approval request for external binder sharing | `--scope <scope>`<br>`--agent <agentId>`<br>`--out <file.amcaudit>`<br>`--id <id>`<br>`--request-id <id>` | - |
| `amc audit binder list` | List exported binders and cached workspace binder | - | - |
| `amc audit binder verify` | Verify .amcaudit file | `--pubkey <path>` | - |
| `amc audit export` | Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor | `--format <format>`<br>`--output <path>`<br>`--limit <n>` | - |
| `amc audit init` | Initialize signed audit policy and compliance maps | - | - |
| `amc audit map` | Audit compliance map operations | - | - |
| `amc audit map apply` | Apply active audit map from file | `--file <path>` | - |
| `amc audit map list` | List builtin/active audit maps | - | - |
| `amc audit map show` | Show audit map | `--id <id>` | - |
| `amc audit map verify` | Verify builtin and active map signatures | - | - |
| `amc audit policy` | Audit binder policy operations | - | - |
| `amc audit policy apply` | Apply and sign audit policy from file | `--file <path>` | - |
| `amc audit policy print` | Print effective audit policy | - | - |
| `amc audit request` | Audit evidence request operations | - | - |
| `amc audit request approve` | Owner approves request (starts dual-control approval flow) | `--actor <id>`<br>`--reason <text>` | - |
| `amc audit request create` | Create auditor evidence request | `--scope <scope>`<br>`--items <csv>`<br>`--id <id>`<br>`--requester <id>` | - |
| `amc audit request fulfill` | Fulfill approved evidence request by exporting restricted binder | `--out <file.amcaudit>` | - |
| `amc audit request list` | List audit evidence requests | - | - |
| `amc audit request reject` | Reject evidence request | - | - |
| `amc audit scheduler` | Audit binder cache scheduler | - | - |
| `amc audit scheduler disable` | Disable audit scheduler | - | - |
| `amc audit scheduler enable` | Enable audit scheduler | - | - |
| `amc audit scheduler run-now` | Run audit binder cache refresh immediately | `--scope <scope>`<br>`--id <id>` | - |
| `amc audit scheduler status` | Show audit scheduler status | - | - |
| `amc audit verify` | Verify audit workspace signatures/artifacts | - | - |
| `amc audit verify-policy` | Verify signed audit policy | - | - |
| `amc audit-packet` | Generate external-auditor packet with verifier-ready evidence | `--output <file>`<br>`--agent <agentId>`<br>`--no-include-chain`<br>`--no-include-rationale` | - |
| `amc backup` | Signed encrypted backup/restore operations | - | - |
| `amc backup create` | Create signed encrypted backup bundle | `--out <file>` | - |
| `amc backup print` | Print backup manifest summary | - | - |
| `amc backup restore` | Restore a verified backup into target directory | `--to <dir>`<br>`--force` | - |
| `amc backup verify` | Verify signed backup bundle offline | `--pubkey <path>` | - |
| `amc badge` | Generate maturity badge for README/docs (markdown, HTML, or URL) | `--agent <agentId>`<br>`--level <0-5>`<br>`--score <0-100>`<br>`--format <format>` | - |
| `amc bench` | Public benchmark registry + ecosystem comparative view | - | - |
| `amc bench compare` | Compute local vs imported ecosystem comparison | `--scope <scope>`<br>`--id <id>`<br>`--against <mode>` | - |
| `amc bench comparison-latest` | Read latest bench comparison artifact | - | - |
| `amc bench create` | Create deterministic signed .amcbench artifact | `--scope <scope>`<br>`--out <file.amcbench>`<br>`--id <id>`<br>`--window-days <n>`<br>`--named`<br>`--industry <value>`<br>`--agent-type <value>`<br>`--deployment <value>` | - |
| `amc bench import` | Import one bench artifact from allowlisted registry | `--registry-id <id>`<br>`--bench <benchId@version|benchId@latest>` | - |
| `amc bench init` | Initialize signed bench policy | - | - |
| `amc bench list-exports` | List locally exported bench artifacts | - | - |
| `amc bench list-imports` | List imported bench artifacts | - | - |
| `amc bench print` | Print bench manifest summary without modification | - | - |
| `amc bench print-policy` | Print effective bench policy | - | - |
| `amc bench publish` | Dual-control bench publish flow | - | - |
| `amc bench publish execute` | - | `--approval-request <id>` | - |
| `amc bench publish request` | - | `--agent <id>`<br>`--file <bench.amcbench>`<br>`--registry <dir>`<br>`--registry-key <file>`<br>`--ack` | - |
| `amc bench registries` | Print signed bench registry allowlist | - | - |
| `amc bench registries-apply` | Apply bench registries config from JSON file | `--in <file>` | - |
| `amc bench registry` | Manage static bench registries | - | - |
| `amc bench registry init` | - | `--dir <dir>`<br>`--id <id>`<br>`--name <name>` | - |
| `amc bench registry publish` | - | `--dir <dir>`<br>`--file <bench.amcbench>`<br>`--registry-key <file>`<br>`--version <version>` | - |
| `amc bench registry serve` | - | `--dir <dir>`<br>`--port <port>`<br>`--host <host>` | - |
| `amc bench registry verify` | - | `--dir <dir>` | - |
| `amc bench search` | Browse a bench registry index | `--registry <pathOrUrl>`<br>`--query <text>` | - |
| `amc bench verify` | Verify .amcbench artifact offline | `--pubkey <path>` | - |
| `amc bench verify-policy` | Verify signed bench policy | - | - |
| `amc benchmark` | Signed ecosystem benchmark snapshots | - | - |
| `amc benchmark compare` | Compare benchmark results between two agents head-to-head | `--json`<br>`--out <path>` | - |
| `amc benchmark export` | - | `--agent <agentId>`<br>`--run <runId>`<br>`--out <file.amcbench>`<br>`--publisher <org>`<br>`--public-agent-id <id>` | - |
| `amc benchmark ingest` | - | - | - |
| `amc benchmark list` | - | `--sort <field>`<br>`--limit <n>` | - |
| `amc benchmark provider-drift` | Run provider/model canary drift benchmark with score, refusal, latency, and cost thresholds | `--file <path>`<br>`--agent <agentId>`<br>`--json`<br>`--out <path>` | - |
| `amc benchmark replay-corpus` | Run a replayable benchmark corpus with optional multi-turn tool-risk ASR checks | `--file <path>`<br>`--agent <agentId>`<br>`--json`<br>`--out <path>` | - |
| `amc benchmark report` | - | `--out <file>`<br>`--group-by <groupBy>` | - |
| `amc benchmark run` | Run standard benchmark suite (latency, accuracy, safety, cost-efficiency, reliability) against an agent | `--agent <agentId>`<br>`--json`<br>`--out <path>` | - |
| `amc benchmark stats` | - | `--group-by <groupBy>` | - |
| `amc benchmark verify` | - | - | - |
| `amc blobs` | Encrypted evidence blob operations | - | - |
| `amc blobs key` | Blob key management | - | - |
| `amc blobs key init` | Initialize encrypted blob key material | - | - |
| `amc blobs key rotate` | Rotate encrypted blob key material | - | - |
| `amc blobs reencrypt` | Re-encrypt blob batch from one key version to another | `--from <version>`<br>`--to <version>`<br>`--limit <n>` | - |
| `amc blobs verify` | Verify encrypted blob index and payload integrity | - | - |
| `amc bom` | Maturity Bill of Materials | - | - |
| `amc bom generate` | - | `--run <runId|latest>`<br>`--out <file>`<br>`--agent <agentId>` | - |
| `amc bom sign` | - | `--in <file>`<br>`--out <file>` | - |
| `amc bom verify` | - | `--in <file>`<br>`--sig <file>`<br>`--pubkey <file>` | - |
| `amc bootstrap` | Bootstrap workspace for production deployment (non-interactive) | `--workspace <path>` | - |
| `amc budgets` | Signed autonomy and usage budgets | - | - |
| `amc budgets init` | - | `--agent <agentId>` | - |
| `amc budgets reset` | - | `--agent <agentId>`<br>`--day <yyyy-mm-dd>` | - |
| `amc budgets status` | - | `--agent <agentId>` | - |
| `amc budgets verify` | - | - | - |
| `amc bundle` | Portable evidence bundle operations | - | - |
| `amc bundle diff` | Diff two bundles (maturity/integrity/targets) | - | - |
| `amc bundle export` | Export a portable, signed evidence bundle for a run | `--run <runId>`<br>`--out <file>`<br>`--agent <agentId>` | - |
| `amc bundle inspect` | Inspect bundle metadata | - | - |
| `amc bundle verify` | Verify evidence bundle offline | - | - |
| `amc business` | Business impact — KPI correlation, ROI tracking, and maturity-to-outcome mapping | - | - |
| `amc business fair-scenario` | Run a FAIR-style calibrated loss-distribution scenario | `--scenario <id>`<br>`--agent <agentId>`<br>`--maturity <level>`<br>`--frequency-min <n>`<br>`--frequency-most-likely <n>`<br>`--frequency-max <n>`<br>`--loss-min <amount>`<br>`--loss-most-likely <amount>`<br>`--loss-max <amount>`<br>`--risk-appetite <amount>`<br>`--iterations <n>`<br>`--seed <n>`<br>`--currency <code>`<br>`--out <path>`<br>`--format <format>`<br>`--json` | - |
| `amc business grc-export` | Export a GRC treatment-plan register from portfolio maturity risk inputs | `--portfolio <path>`<br>`--out <path>`<br>`--format <format>`<br>`--currency <code>`<br>`--title <title>`<br>`--treatment-due-days <days>`<br>`--json` | - |
| `amc business heatmap` | Build a portfolio financial risk heatmap from maturity, likelihood, impact, and appetite | `--portfolio <path>`<br>`--out <path>`<br>`--format <format>`<br>`--currency <code>`<br>`--title <title>`<br>`--json` | - |
| `amc business kpi` | Show business KPIs correlated with maturity levels | `--agent <agentId>`<br>`--json` | - |
| `amc business report` | Generate business impact report with maturity correlation | `--agent <agentId>`<br>`--json` | - |
| `amc business risk` | Quantify maturity-linked incident frequency and expected annual loss | `--agent <agentId>`<br>`--maturity <level>`<br>`--baseline-frequency <n>`<br>`--incident-cost <amount>`<br>`--risk-appetite <amount>`<br>`--currency <code>`<br>`--json` | - |
| `amc business roi` | Estimate first-year ROI and cost of a trust gap from maturity improvement | `--agent <agentId>`<br>`--current-maturity <level>`<br>`--target-maturity <level>`<br>`--baseline-frequency <n>`<br>`--incident-cost <amount>`<br>`--annual-control-cost <amount>`<br>`--implementation-cost <amount>`<br>`--risk-appetite <amount>`<br>`--currency <code>`<br>`--out <path>`<br>`--format <format>`<br>`--json` | - |
| `amc business track` | Record a business outcome event (incident, audit finding, cost) | `--type <type>`<br>`--agent <agentId>`<br>`--description <text>`<br>`--value <n>`<br>`--severity <level>`<br>`--json` | - |
| `amc canary-report` | Generate full policy canary report | `--agent <agentId>` | - |
| `amc canary-start` | Start a policy canary with candidate vs stable policy | `--candidate-sha <sha256>`<br>`--stable-sha <sha256>`<br>`--enforce-pct <n>`<br>`--duration <ms>`<br>`--failure-threshold <ratio>`<br>`--auto-promote` | - |
| `amc canary-status` | Show current canary status and stats | - | - |
| `amc canary-stop` | Stop the active canary | - | - |
| `amc canon` | Compass Canon signed content operations | - | - |
| `amc canon init` | Create and sign .amc/canon/canon.yaml | - | - |
| `amc canon print` | Print effective Compass Canon | - | - |
| `amc canon verify` | Verify canonical compass content signature | - | - |
| `amc casebook` | Signed casebook operations | - | - |
| `amc casebook add` | Add signed case from existing workorder | `--casebook <id>`<br>`--from-workorder <id>`<br>`--agent <agentId>` | - |
| `amc casebook init` | Create a signed casebook | `--agent <agentId>`<br>`--casebook <id>` | - |
| `amc casebook list` | List casebooks | `--agent <agentId>` | - |
| `amc casebook verify` | Verify signed casebook and case files | `--casebook <id>`<br>`--agent <agentId>` | - |
| `amc cert` | Certificate operations | - | - |
| `amc cert generate` | Generate execution-proof trust certificate (signed PDF or JSON) | `--agent <id>`<br>`--output <path>`<br>`--valid-days <n>`<br>`--no-sign`<br>`--preview`<br>`--badge`<br>`--url`<br>`--base-url <url>` | - |
| `amc cert inspect` | Inspect certificate bundle contents | - | - |
| `amc cert revoke` | Create signed revocation file for a certificate | `--reason <text>`<br>`--cert <file>`<br>`--out <file>` | - |
| `amc cert verify` | Verify certificate bundle offline | `--revocation <path>` | - |
| `amc cert verify-revocation` | Verify revocation file signature | - | - |
| `amc certify` | Issue signed, offline-verifiable certificate bundle | `--run <runId>`<br>`--policy <path>`<br>`--out <file>`<br>`--agent <agentId>` | - |
| `amc cgx` | Context Graph (CGX) build and verify operations | - | - |
| `amc cgx build` | Build deterministic signed context graph | `--scope <scope>`<br>`--id <id>` | - |
| `amc cgx code-scan` | Scan repository for semantic code edges | `--agent <agentId>`<br>`--path <repoPath>` | - |
| `amc cgx diff` | Diff two CGX graph snapshots | `--run-a <id>`<br>`--run-b <id>`<br>`--scope <scope>`<br>`--id <id>`<br>`--json` | - |
| `amc cgx init` | Create and sign .amc/cgx/policy.yaml | - | - |
| `amc cgx show` | Show latest CGX graph or agent context pack | `--scope <scope>`<br>`--id <id>`<br>`--format <format>` | - |
| `amc cgx simulate` | Simulate impact propagation when a node changes | `--change <nodeId>`<br>`--scope <scope>`<br>`--id <id>`<br>`--max-depth <n>`<br>`--json` | - |
| `amc cgx verify` | Verify CGX policy/graph/pack signatures | - | - |
| `amc cgx-integrity` | Run graph integrity check on CGX with semantic overlay | `--max-contradictions <n>` | - |
| `amc cgx-propagation` | Simulate risk propagation from a source node | `--max-depth <n>` | - |
| `amc ci` | CI/CD release gate helpers | - | - |
| `amc ci check` | One-liner CI gate: quickscore + threshold check (exit 1 if below) | `--min-score <n>`<br>`--min-level <level>`<br>`--agent <agentId>`<br>`--json` | `gate` |
| `amc ci init` | Generate GitHub workflow and gate policy | `--agent <agentId>`<br>`--no-sign` | - |
| `amc ci print` | Print suggested CI pipeline steps | `--agent <agentId>` | - |
| `amc ci redteam` | CI gate: run red-team plugins, optional Evil MCP, and score-gaming resistance checks | `--plugins <ids...>`<br>`--strategies <ids...>`<br>`--min-score <n>`<br>`--max-vulnerabilities <n>`<br>`--max-critical <n>`<br>`--max-high <n>`<br>`--evil-mcp`<br>`--mcp-attacks <categories...>`<br>`--min-mcp-score <n>`<br>`--no-gaming-resistance`<br>`--min-gaming-score <n>`<br>`--no-sign`<br>`--json` | - |
| `amc claim-confidence` | Generate per-claim confidence report with citation-backed scoring | `--agent <agentId>` | - |
| `amc claim-confidence-gate` | Check if claims for given questions pass confidence threshold | `--agent <agentId>`<br>`--questions <ids>` | - |
| `amc claims` | Evidence claim expiry tracking | - | - |
| `amc claims list` | List all evidence claims with TTL status | `--json` | - |
| `amc claims-stale` | List stale claims for an agent | `--agent <agentId>` | - |
| `amc claims-sweep` | Process all stale claims for an agent (auto-demote to PROVISIONAL) | `--agent <agentId>` | - |
| `amc classify` | Classify agent vs workflow | - | - |
| `amc classify agent` | Classify whether system is workflow or agent | `--json` | - |
| `amc commands` | Generate the live AMC CLI command inventory from the registered command map | `--json`<br>`--markdown`<br>`--include-internal`<br>`--out <path>` | - |
| `amc commit` | Commitment plan flow (7/14/30-day checklist) | `--target <name>`<br>`--days <n>`<br>`--out <file>`<br>`--agent <agentId>` | - |
| `amc comms-check` | Check a message/communication against compliance policies (lightweight communications firewall) | `--text <message>`<br>`--domain <domain>`<br>`--json` | - |
| `amc compare` | Compare two runs OR multiple models (side-by-side evaluation) | `--agent <agentId>`<br>`--window <window>`<br>`--target <name>`<br>`--iterations <n>`<br>`--output <path>`<br>`--json`<br>`--badge`<br>`--format <fmt>` | - |
| `amc compare-models` | Run the same agent evaluation across multiple models and show comparison matrix | `--agent <agentId>`<br>`--window <window>`<br>`--target <name>`<br>`--iterations <n>`<br>`--output <path>`<br>`--json` | - |
| `amc compliance` | Evidence-linked compliance map operations | - | `comply` |
| `amc compliance diff` | Diff two compliance report JSON files | - | `comply diff` |
| `amc compliance fleet` | Generate fleet compliance summary | `--framework <framework>`<br>`--window <window>`<br>`--out <path>` | `comply fleet` |
| `amc compliance init` | Create and sign compliance-maps.yaml | - | `comply init` |
| `amc compliance matrix` | Generate multi-framework compliance coverage matrix with gap analysis | `--agent <agentId>`<br>`--window <window>`<br>`--frameworks <fws...>`<br>`--out <path>`<br>`--json`<br>`--heatmap` | `comply matrix` |
| `amc compliance regulatory-check` | Check for regulatory changes from configured feeds | `--framework <name>`<br>`--json` | `comply regulatory-check` |
| `amc compliance regulatory-feeds` | List all configured regulatory feed sources | `--json` | `comply regulatory-feeds` |
| `amc compliance regulatory-gap` | Run gap analysis against current AMC configuration | `--framework <name>`<br>`--json` | `comply regulatory-gap` |
| `amc compliance report` | Generate evidence-linked compliance report | `--framework <framework>`<br>`--window <window>`<br>`--out <path>`<br>`--agent <agentId>`<br>`--json` | `comply report` |
| `amc compliance risk-classify` | Classify agent into EU AI Act risk tiers (UNACCEPTABLE / HIGH / LIMITED / MINIMAL) | `--agent <agentId>`<br>`--capabilities <json>`<br>`--biometric`<br>`--critical-infra`<br>`--education`<br>`--employment`<br>`--essential-services`<br>`--law-enforcement`<br>`--migration`<br>`--justice`<br>`--realtime-biometric`<br>`--social-scoring`<br>`--subliminal`<br>`--exploits-vulnerabilities`<br>`--emotion-recognition`<br>`--chatbot`<br>`--synthetic-content`<br>`--human-interaction`<br>`--safety-component`<br>`--json` | `comply risk-classify` |
| `amc compliance roadmap` | Generate step-by-step compliance plan for a framework | `--framework <framework>`<br>`--agent <agentId>`<br>`--capabilities <json>`<br>`--risk-tier <tier>`<br>`--out <path>`<br>`--json` | `comply roadmap` |
| `amc compliance verify` | Verify compliance maps signature | - | `comply verify` |
| `amc confidence` | Confidence drift tracking | - | - |
| `amc confidence calibration` | Show calibration report | `--json` | - |
| `amc confidence drift` | Show drift trend | `--json` | - |
| `amc confidence-components` | Show per-component confidence breakdown | `--agent <id>` | - |
| `amc confidence-drift` | Track confidence drift per question across diagnostic runs | `--agent <agentId>`<br>`--window <window>` | - |
| `amc confidence-heatmap` | Display confidence heatmap by question and layer | - | - |
| `amc config` | Inspect resolved runtime configuration | - | - |
| `amc config explain` | Explain config source precedence and risky settings | `--json` | - |
| `amc config print` | Print resolved runtime config (secret-safe) | `--json` | - |
| `amc config profile` | Print or apply workspace config profile (dev\|ci\|prod) | - | - |
| `amc connect` | Connect wizard for any agent/provider runtime | `--agent <agentId>`<br>`--adapter <adapterId>`<br>`--token-file <path>`<br>`--bridge-url <url>`<br>`--mode <mode>`<br>`--print-env`<br>`--print-cmd` | - |
| `amc contract-tests` | Generate and display contract test suite for bridge API | - | - |
| `amc control-classification` | Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION) | `--json` | - |
| `amc correction` | Human feedback, corrections, and feedback loop tracking | - | - |
| `amc correction add` | Add a human correction/feedback for an agent | `--questions <qids>`<br>`--description <text>`<br>`--action <text>`<br>`--agent <agentId>`<br>`--json` | - |
| `amc correction effectiveness` | Show correction effectiveness metrics | `--agent <agentId>`<br>`--json` | - |
| `amc correction list` | List corrections for an agent | `--agent <agentId>`<br>`--status <status>`<br>`--json` | - |
| `amc correction report` | Generate feedback closure report | `--agent <agentId>`<br>`--json` | - |
| `amc corrections-verify-closure` | Show open feedback loops that need closure | `--agent <id>` | - |
| `amc costs` | Track and analyze actual agent costs from observability data | - | - |
| `amc costs show` | Show cost report for an agent | `--agent <agentId>`<br>`--window <days>`<br>`--json` | - |
| `amc dag` | Orchestration DAG capture and scoring | - | - |
| `amc dag capture` | Capture orchestration DAG for agents | `--json` | - |
| `amc dag score` | Score DAG governance | `--json` | - |
| `amc dashboard` | Device-first Compass dashboard | - | - |
| `amc dashboard build` | Build responsive offline dashboard for an agent | `--agent <agentId>`<br>`--out <dir>` | - |
| `amc dashboard open` | Build and serve dashboard at localhost:3210 | `--agent <agentId>`<br>`--port <port>`<br>`--view <view>`<br>`--no-open` | - |
| `amc dashboard serve` | Serve dashboard locally | `--agent <agentId>`<br>`--port <port>`<br>`--out <dir>` | - |
| `amc dashboard view` | Build and open web UI showing maturity scores, test results, and comparison matrix with shareable URLs | `--agent <agentId>`<br>`--port <port>`<br>`--out <dir>`<br>`--no-open` | - |
| `amc dataset` | Manage evaluation datasets (golden sets) — curate business-specific test cases | - | - |
| `amc dataset add-case` | Add a test case to a dataset | `--prompt <text>`<br>`--expected <text>`<br>`--not-expected <text>`<br>`--tags <tags>`<br>`--weight <n>`<br>`--assertion <type>`<br>`--json` | - |
| `amc dataset create` | Create a new evaluation dataset | `--description <text>`<br>`--category <cat>` | - |
| `amc dataset import` | Import test cases from CSV/JSON file | `--file <path>` | - |
| `amc dataset list` | List all evaluation datasets | `--json` | - |
| `amc dataset run` | Run a dataset against an agent (via gateway proxy) | `--agent <agentId>`<br>`--endpoint <url>`<br>`--model <model>`<br>`--json` | - |
| `amc debt-add` | Add a policy debt entry (waiver/override/exception) | `--agent <agentId>`<br>`--type <type>`<br>`--reason <reason>`<br>`--expiry <expiry>`<br>`--policies <policies>`<br>`--risk <risk>`<br>`--created-by <who>` | - |
| `amc debt-list` | List policy debt entries | `--agent <agentId>` | - |
| `amc debug` | Structured evidence debug stream for an agent | `--agent <id>`<br>`--follow`<br>`--dimension <dimension>`<br>`--question <questionId>`<br>`--event-type <eventType>`<br>`--limit <n>`<br>`--poll-ms <ms>`<br>`--no-color` | - |
| `amc delta-to-l5` | Generate L4→L5 delta report showing what separates current state from L5 | `--agent <id>`<br>`--out <path>`<br>`--format <format>`<br>`--json` | - |
| `amc demo` | Run interactive demos of AMC capabilities | - | - |
| `amc demo gap` | The 84-point documentation inflation gap — keyword vs execution scoring | `--json`<br>`--fast` | - |
| `amc demo prospect` | Run a guided 5-minute prospect demo flow | `--share`<br>`--out <dir>`<br>`--slug <slug>`<br>`--public-base-url <url>`<br>`--live`<br>`--json` | - |
| `amc demo run` | Run a simulated agent through the AMC gateway and produce a real score (~30s) | `--gateway <url>`<br>`--no-vault`<br>`--demo`<br>`--json` | - |
| `amc demo share` | Generate a static client-facing prospect demo bundle | `--out <dir>`<br>`--slug <slug>`<br>`--public-base-url <url>`<br>`--live`<br>`--json` | - |
| `amc diagnostic` | Diagnostic bank/render operations | - | - |
| `amc diagnostic bank` | Signed diagnostic 126-question bank operations | - | - |
| `amc diagnostic bank init` | Create and sign .amc/diagnostic/bank/bank.yaml | - | - |
| `amc diagnostic bank verify` | Verify diagnostic bank signature | - | - |
| `amc diagnostic render` | Render contextualized 126-question diagnostic for an agent | `--agent <agentId>`<br>`--format <format>`<br>`--out <file>` | - |
| `amc dlp` | DLP scanner for PII and secrets | - | - |
| `amc dlp scan` | Scan text for PII and secrets | `--json`<br>`--redact` | - |
| `amc doctor` | Check runtime availability and wrap readiness | `--json`<br>`--strict` | - |
| `amc doctor-fix` | Auto-repair common setup issues | `--dry-run`<br>`--json` | - |
| `amc domain` | Domain-specific architecture and compliance operations | - | `sector` |
| `amc domain apply` | Apply domain-specific guardrails and industry pack rules to an agent | `--agent <id>`<br>`--domain <domain>`<br>`--pack <packId>`<br>`--dry-run`<br>`--compliance <frameworks>`<br>`--file <path>`<br>`--json` | `sector apply` |
| `amc domain assess` | Run full domain assessment | `--agent <id>`<br>`--domain <d>`<br>`--json` | `sector assess` |
| `amc domain assurance` | Run domain-specific assurance packs | `--agent <id>`<br>`--domain <d>`<br>`--json` | `sector assurance` |
| `amc domain gaps` | Show compliance gaps for an agent and domain | `--agent <id>`<br>`--domain <d>`<br>`--json` | `sector gaps` |
| `amc domain list` | List all 7 domains with metadata | `--json` | `sector list` |
| `amc domain modules` | Show module activation map for domain | `--domain <d>`<br>`--json` | `sector modules` |
| `amc domain pack` | Industry sector packs — 41 packs across 7 domains | - | `sector pack` |
| `amc domain pack access` | Show Industry Packs subscription status and unlock instructions | `--json` | `subscribe`, `sector pack access` |
| `amc domain pack activate` | Activate Industry Packs after purchase | `--key <licenseKey>`<br>`--expires-at <isoDate>`<br>`--json` | `sector pack activate` |
| `amc domain pack checkout` | Create an Industry Packs checkout link | `--success-url <url>`<br>`--cancel-url <url>`<br>`--email <email>`<br>`--reference <id>`<br>`--json` | `sector pack checkout` |
| `amc domain pack describe` | Show details of a specific industry sector pack | `--pack <packId>`<br>`--json` | `sector pack describe` |
| `amc domain pack list` | List all available industry sector packs | `--domain <d>`<br>`--json` | `sector pack list` |
| `amc domain pack run` | Run an industry sector pack — interactive assessment or baseline score | `--pack <packId>`<br>`--baseline`<br>`--json` | `sector pack run` |
| `amc domain pack verify` | Verify an Industry Packs license key | `--key <licenseKey>`<br>`--json` | `sector pack verify` |
| `amc domain report` | Build full domain report and write it to a file | `--agent <id>`<br>`--domain <d>`<br>`--output <file>`<br>`--json` | `sector report` |
| `amc domain roadmap` | Generate 30/60/90-day roadmap for this domain | `--agent <id>`<br>`--domain <d>`<br>`--json` | `sector roadmap` |
| `amc down` | Stop AMC Studio local control plane | - | - |
| `amc drift` | Drift/regression detection and reporting | - | - |
| `amc drift check` | - | `--agent <agentId>`<br>`--against <kind>` | - |
| `amc drift report` | - | `--agent <agentId>`<br>`--out <file>` | - |
| `amc e2e` | End-to-end smoke verification | - | - |
| `amc e2e smoke` | Run go-live smoke tests: local, docker, or helm-template | `--mode <mode>`<br>`--workspace <path>`<br>`--repo-root <path>`<br>`--json` | - |
| `amc emergency-override` | Activate an emergency policy override with strict TTL | `--agent <agentId>`<br>`--reason <reason>`<br>`--action <desc>`<br>`--ttl <ms>` | - |
| `amc enforce` | Policy enforcement and guardrails | - | - |
| `amc enforce ato-detect` | Detect account takeover attempts (demo) | `--json` | - |
| `amc enforce blind-secrets` | Redact secrets from text | `--json` | - |
| `amc enforce check` | Check policy for an agent action | `--json` | - |
| `amc enforce exec-guard` | Check if a command is safe to execute | `--json` | - |
| `amc enforce formal-verify` | Formally verify safety properties using proof trees and certificates | `--property <name>`<br>`--all`<br>`--strategy <strategy>` | - |
| `amc enforce numeric-check` | Validate a numeric value within bounds | `--json` | - |
| `amc enforce resources` | Snapshot, diff, and verify agent resources governed by Enforce | - | - |
| `amc enforce resources apply` | Accept current resources as the new signed manifest; dry-run unless --yes is set | `--agent <agentId>`<br>`--manifest <path>`<br>`--yes`<br>`--force`<br>`--json` | - |
| `amc enforce resources contract` | Show the AMC-native governed resource lifecycle contract | `--json` | - |
| `amc enforce resources diff` | Diff two Enforce resource manifests, or a manifest against the current workspace | `--agent <agentId>`<br>`--from <path>`<br>`--to <path>`<br>`--json` | - |
| `amc enforce resources evaluate` | Evaluate a resource proposal against Enforce gates | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources get` | Alias for inspect: read one resource from an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources history` | Show signed Enforce resource manifests, snapshots, and receipts | `--agent <agentId>`<br>`--json` | - |
| `amc enforce resources inspect` | Inspect one resource in an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources list` | List resources in an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources propose` | Create a dry-run resource change proposal from the latest manifest to current workspace state | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources restore` | Restore resources from an Enforce snapshot; dry-run unless --apply is set | `--agent <agentId>`<br>`--manifest <path>`<br>`--resource <idOrPath>`<br>`--apply`<br>`--include-immutable`<br>`--json` | - |
| `amc enforce resources rollback` | Alias for restore: rollback resources from an Enforce snapshot | `--agent <agentId>`<br>`--manifest <path>`<br>`--resource <idOrPath>`<br>`--apply`<br>`--include-immutable`<br>`--json` | - |
| `amc enforce resources snapshot` | Write the current Enforce resource manifest | `--agent <agentId>`<br>`--json` | - |
| `amc enforce resources validate` | Validate governed resource changes before accepting them | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce resources verify` | Verify the current workspace resources against an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc enforce taint` | Track tainted input through the system | `--json` | - |
| `amc enforce tla-spec` | Generate a TLA+ specification for the AMC safety model | `--properties <list>`<br>`--output <path>` | - |
| `amc enforce verify-certificate` | Verify the integrity of a proof certificate (pass JSON as string) | - | - |
| `amc enterprise` | Enterprise tier — licensing, audit export, SSO, fleet governance | - | - |
| `amc enterprise activate` | Activate an enterprise license key (format: AMC-ENT-XXXX-XXXX-XXXX) | - | - |
| `amc enterprise audit-export` | Export audit trail in SIEM format | `--format <format>`<br>`--output <path>`<br>`--limit <count>`<br>`--signed` | - |
| `amc enterprise status` | Show current license status, tier, and enabled features | - | - |
| `amc enterprise usage` | Show multi-tenant usage metering and quota utilization | - | - |
| `amc eval` | Eval interop import and coverage status | - | - |
| `amc eval import` | Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse, LangWatch) into signed AMC evidence | `--format <format>`<br>`--file <path>`<br>`--agent <agentId>`<br>`--trust-tier <tier>`<br>`--json` | - |
| `amc eval run` | One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results | `--format <format>`<br>`--output <path>`<br>`--window <window>`<br>`--agent <agentId>`<br>`--fail-on-error`<br>`--threshold <n>` | - |
| `amc eval status` | Show imported eval coverage per AMC dimension | `--agent <agentId>`<br>`--window <window>`<br>`--json` | - |
| `amc evidence` | Evidence lifecycle workflows | - | - |
| `amc evidence collect` | Guided wizard to connect your agent and capture evidence | `--first-run`<br>`--agent <agentId>`<br>`--runtime <runtime>`<br>`--dry-run` | - |
| `amc evidence decisions` | List and inspect decision receipts generated by full-score runs | - | - |
| `amc evidence decisions inspect` | Inspect one decision receipt by receipt id or run id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence decisions list` | List persisted decision receipts | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence decisions observe` | Update open decision receipts with observed outcomes from a later full-score run | `--agent <agentId>`<br>`--json` | - |
| `amc evidence episodes` | List, inspect, and export lifecycle evidence episodes | - | - |
| `amc evidence episodes export` | Export one EpisodeRecord as JSON or Markdown | `--out <path>`<br>`--agent <agentId>`<br>`--format <format>`<br>`--redacted`<br>`--json` | - |
| `amc evidence episodes inspect` | Inspect one EpisodeRecord by episode id, lifecycle id, or run id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence episodes list` | List persisted EpisodeRecord evidence objects | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence export` | Export verifier-ready evidence (json\|csv\|pdf) | `--format <format>`<br>`--out <file>`<br>`--agent <agentId>`<br>`--include-chain`<br>`--include-rationale` | - |
| `amc evidence finding-proofs` | List, inspect, and export finding proof chains | - | - |
| `amc evidence finding-proofs export` | Export finding proofs as JSON | `--out <path>`<br>`--agent <agentId>`<br>`--run <runId>`<br>`--redacted`<br>`--json` | - |
| `amc evidence finding-proofs inspect` | Inspect one finding proof by proof id, finding id, run id, or question id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence finding-proofs list` | List persisted finding proof chains | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence help` | Show high-signal evidence command groups | - | - |
| `amc evidence lifecycle` | List, inspect, and export full lifecycle run artifacts | - | - |
| `amc evidence lifecycle export` | Export one lifecycle artifact as JSON | `--out <path>`<br>`--agent <agentId>`<br>`--redacted`<br>`--json` | - |
| `amc evidence lifecycle inspect` | Inspect one lifecycle artifact by lifecycle id or run id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence lifecycle list` | List persisted lifecycle run artifacts | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence lifecycle-receipts` | List, inspect, and export lifecycle proposal, validation, commit, rollback, and monitor receipts | - | - |
| `amc evidence lifecycle-receipts export` | Export lifecycle receipts as JSON | `--out <path>`<br>`--agent <agentId>`<br>`--run <runId>`<br>`--redacted`<br>`--json` | - |
| `amc evidence lifecycle-receipts inspect` | Inspect one lifecycle receipt by receipt id, run id, or lifecycle id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence lifecycle-receipts list` | List persisted lifecycle change receipts | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence observability` | List and inspect component, experience, and decision observability records | - | - |
| `amc evidence observability inspect` | Inspect one observability lane record by observability id, lifecycle id, or run id | `--agent <agentId>`<br>`--json` | - |
| `amc evidence observability list` | List persisted observability lane records | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc evidence verify` | Run full workspace verification suite | `--json` | - |
| `amc executive` | Executive and board-ready AMC artifacts | - | - |
| `amc executive brief` | Generate a board-ready one-page executive brief from a diagnostic run | `--agent <agentId>`<br>`--run <runId>`<br>`--out <path>`<br>`--format <format>`<br>`--title <title>` | - |
| `amc experiment` | Deterministic baseline vs candidate experiments | - | - |
| `amc experiment analyze` | Analyze latest experiment run | `--experiment <id>`<br>`--out <path>`<br>`--agent <agentId>` | - |
| `amc experiment create` | Create an experiment | `--name <name>`<br>`--casebook <id>`<br>`--agent <agentId>` | - |
| `amc experiment gate` | Evaluate latest experiment run against gate policy | `--experiment <id>`<br>`--policy <path>`<br>`--agent <agentId>` | - |
| `amc experiment gate-template` | Write an experiment gate policy template | `--out <path>`<br>`--preset <preset>` | - |
| `amc experiment list` | List experiments | `--agent <agentId>` | - |
| `amc experiment optimize` | Create governed optimizer candidates from a Fixer RCA report | `--rca <selector>`<br>`--agent <agentId>`<br>`--json` | - |
| `amc experiment optimizer-list` | List governed optimizer runs | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc experiment optimizer-show` | Show a governed optimizer run | `--agent <agentId>`<br>`--json` | - |
| `amc experiment run` | Run deterministic experiment against signed casebook | `--experiment <id>`<br>`--mode <mode>`<br>`--agent <agentId>` | - |
| `amc experiment set-baseline` | Set experiment baseline config | `--experiment <id>`<br>`--config <current|path>`<br>`--agent <agentId>` | - |
| `amc experiment set-candidate` | Set experiment candidate signed config overlay | `--experiment <id>`<br>`--candidate-file <path>`<br>`--agent <agentId>` | - |
| `amc experiment-architecture` | Run a controlled architecture comparison experiment | `--name <name>`<br>`--model <modelId>`<br>`--baseline-file <path>`<br>`--candidate-file <path>`<br>`--baseline-kind <kind>`<br>`--candidate-kind <kind>` | - |
| `amc experiment-architecture-probes` | List the standard probe set for architecture experiments | - | - |
| `amc explain` | Plain-English explanation for a diagnostic question (example: AMC-2.1) | `--json` | - |
| `amc export` | Export policy packs and badges | - | - |
| `amc export badge` | Export deterministic maturity badge SVG for a run | `--run <runId>`<br>`--out <file>`<br>`--agent <agentId>` | - |
| `amc export policy` | Export framework-agnostic North Star policy integration pack | `--target <name>`<br>`--out <dir>`<br>`--agent <agentId>` | - |
| `amc federate` | Offline federation sync operations | - | - |
| `amc federate export` | Export offline federation sync package (.amcfed) | `--out <file>` | - |
| `amc federate import` | Import and verify federation package | - | - |
| `amc federate init` | Initialize federation identity and signed config | `--org <name>` | - |
| `amc federate peer` | Federation peer trust anchors | - | - |
| `amc federate peer add` | Add a peer publisher public key | `--peerId <id>`<br>`--name <name>`<br>`--pubkey <file>` | - |
| `amc federate peer list` | List federation peers | - | - |
| `amc federate verify` | Verify federation config signature | - | - |
| `amc federate verify-bundle` | Verify .amcfed package | - | - |
| `amc firewall` | Runtime protection for live agent traffic | - | - |
| `amc firewall check` | Evaluate a request or response payload against Runtime Firewall | `--text <text>`<br>`--direction <direction>`<br>`--agent <id>`<br>`--provider <name>`<br>`--model <name>`<br>`--route <path>`<br>`--method <method>`<br>`--run <runId>`<br>`--episode <episodeId>`<br>`--lifecycle-run <id>`<br>`--bridge-request <id>`<br>`--require-policy`<br>`--no-record`<br>`--json` | - |
| `amc firewall disable` | Disable Runtime Firewall for this workspace | `--json` | - |
| `amc firewall enable` | Enable Runtime Firewall in observe, warn, or block mode | `--mode <mode>`<br>`--fail-open`<br>`--json` | - |
| `amc firewall events` | List Runtime Firewall decision events | `--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc firewall export` | Export Runtime Firewall decisions for SIEM or audit review | `--out <path>`<br>`--format <format>`<br>`--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc firewall status` | Show Runtime Firewall policy and event status | `--json` | - |
| `amc fix` | Generate remediation patches for identified gaps (auto-fix mode) | `--agent <agentId>`<br>`--dry-run`<br>`--target-level <level>`<br>`--framework <framework>`<br>`--out <dir>` | - |
| `amc fix-signatures` | Verify and re-sign gateway/fleet/agent configs | `--agent <agentId>` | - |
| `amc fleet` | Fleet operations | - | - |
| `amc fleet contradictions` | Detect cross-agent contradictions | `--scope <scope>`<br>`--window <window>`<br>`--min-delta <n>` | - |
| `amc fleet dag` | Visualize orchestration delegation graph | `--agent <id>`<br>`--window <window>` | - |
| `amc fleet graph` | Typed multi-agent graph operations | - | - |
| `amc fleet graph list` | List saved typed multi-agent graphs | `--json` | - |
| `amc fleet graph show` | Inspect the latest typed multi-agent graph | `--json` | - |
| `amc fleet graph validate` | Validate the latest typed multi-agent graph | `--json` | - |
| `amc fleet graph write` | Write the latest typed multi-agent graph from a JSON file | `--file <path>`<br>`--json` | - |
| `amc fleet handoff` | Manage handoff packets | `--from <id>`<br>`--to <id>`<br>`--goal <goal>`<br>`--mode <mode>`<br>`--packet <packetId>`<br>`--receiver <id>`<br>`--refuse <reason>` | - |
| `amc fleet health` | Show fleet health dashboard aggregates | `--json` | - |
| `amc fleet init` | Create and sign .amc/fleet.yaml | `--org <name>` | - |
| `amc fleet lifecycle` | Fleet parent/child lifecycle evidence | - | - |
| `amc fleet lifecycle list` | List parent fleet lifecycle artifacts | `--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc fleet lifecycle show` | Inspect one parent fleet lifecycle artifact | `--redacted`<br>`--json` | - |
| `amc fleet overview` | One-shot executive fleet summary with verdict, coverage, drift, and next actions | `--json` | - |
| `amc fleet policy` | Fleet governance policy operations | - | - |
| `amc fleet policy apply` | Apply a governance policy to all fleet agents or one environment | `--policy-id <id>`<br>`--description <text>`<br>`--min-integrity <n>`<br>`--dimension-min <rules>`<br>`--env <environment>` | - |
| `amc fleet policy list` | List effective fleet governance policies | - | - |
| `amc fleet report` | Generate fleet maturity report (md) or fleet compliance report (pdf) | `--window <window>`<br>`--format <format>`<br>`--output <path>` | - |
| `amc fleet score` | Score multiple agents in one run with fleet-wide aggregates, weak-link detection, and pairwise comparison | `--window <window>`<br>`--agents <ids>`<br>`--all`<br>`--sla <duration>`<br>`--concurrency <n>`<br>`--max-comparisons <n>`<br>`--stream`<br>`--out <path>`<br>`--md`<br>`--json` | - |
| `amc fleet slo` | Fleet governance SLO operations | - | - |
| `amc fleet slo define` | Define a fleet SLO, e.g. "95% of production agents must score L3+ on dimension 2" | `--objective <text>`<br>`--id <sloId>` | - |
| `amc fleet slo list` | List fleet SLO definitions | - | - |
| `amc fleet slo status` | Show fleet SLO compliance status | - | - |
| `amc fleet status` | Show fleet overview (agent count, average score, health) | `--json` | - |
| `amc fleet tag` | Tag an agent with an environment | `--env <environment>` | - |
| `amc fleet trust-add-edge` | Add a delegation edge (orchestrator → worker) | `--from <agentId>`<br>`--to <agentId>`<br>`--purpose <purpose>`<br>`--risk <tier>`<br>`--mode <mode>`<br>`--weight <n>` | - |
| `amc fleet trust-edges` | List all delegation edges | - | - |
| `amc fleet trust-graph` | Render delegation trust graph as Mermaid, DOT, or JSON | `--format <format>`<br>`--out <path>` | - |
| `amc fleet trust-init` | Initialize trust composition config | - | - |
| `amc fleet trust-mode` | Set trust inheritance policy mode | `--mode <mode>` | - |
| `amc fleet trust-receipts` | Verify cross-agent receipt chains | `--window <window>` | - |
| `amc fleet trust-remove-edge` | Remove a delegation edge | - | - |
| `amc fleet trust-report` | Generate trust composition report across fleet | `--window <window>`<br>`--output <path>`<br>`--no-sign` | - |
| `amc forecast` | Deterministic evidence-gated forecasting and planning | - | - |
| `amc forecast init` | Create and sign forecast policy | - | - |
| `amc forecast latest` | Render latest forecast for scope | `--scope <scope>`<br>`--id <targetId>`<br>`--out <path>` | - |
| `amc forecast policy` | Forecast policy operations | - | - |
| `amc forecast policy apply` | Apply and sign forecast policy from file | `--file <path>` | - |
| `amc forecast policy default` | Print default forecast policy JSON | - | - |
| `amc forecast print-policy` | Print effective forecast policy | - | - |
| `amc forecast refresh` | Refresh forecast snapshot for scope | `--scope <scope>`<br>`--id <targetId>`<br>`--out <path>` | - |
| `amc forecast scheduler` | Forecast renewal scheduler controls | - | - |
| `amc forecast scheduler disable` | Disable forecast scheduler | - | - |
| `amc forecast scheduler enable` | Enable forecast scheduler | - | - |
| `amc forecast scheduler run-now` | Run scheduler refresh immediately | `--scope <scope>`<br>`--id <targetId>` | - |
| `amc forecast scheduler status` | Show scheduler status | - | - |
| `amc forecast verify` | Verify forecast policy signature | - | - |
| `amc fp-cost` | Show false positive cost summary | `--pack <id>` | - |
| `amc fp-list` | List false positive reports | `--pack <id>`<br>`--status <status>` | - |
| `amc fp-resolve` | Resolve a false positive report | `--id <reportId>`<br>`--status <status>`<br>`--reason <text>` | - |
| `amc fp-submit` | Submit a false positive report for an assurance scenario | `--scenario <id>`<br>`--pack <id>`<br>`--run <id>`<br>`--justification <text>`<br>`--reporter <name>` | - |
| `amc fp-tuning-report` | Generate false positive tuning report with recommendations | `--window <days>`<br>`--threshold <rate>` | - |
| `amc framework-guide` | Framework-specific governance guidance | `--framework <name>`<br>`--list`<br>`--json` | - |
| `amc freeze` | Execution freeze status and controls | - | - |
| `amc freeze lift` | - | `--agent <agentId>`<br>`--incident <id>`<br>`--reason <text>` | - |
| `amc freeze status` | - | `--agent <agentId>` | - |
| `amc gate` | Evaluate a run bundle against a gate policy | `--bundle <file>`<br>`--policy <path>`<br>`--no-sign` | - |
| `amc gateway` | AMC universal LLM proxy gateway | - | - |
| `amc gateway bind-agent` | Bind a gateway route prefix to an agent ID for deterministic attribution | `--route <prefix>`<br>`--agent <agentId>`<br>`--config <path>` | - |
| `amc gateway init` | Create and sign .amc/gateway.yaml | `--provider <name>`<br>`--base-url <url>`<br>`--auth-type <type>`<br>`--env <name>`<br>`--header <name>`<br>`--param <name>` | - |
| `amc gateway start` | Start local reverse-proxy gateway and signed evidence capture | `--config <path>` | - |
| `amc gateway status` | Check gateway reachability and route URLs | `--config <path>` | - |
| `amc gateway verify-config` | Verify .amc/gateway.yaml signature | `--config <path>` | - |
| `amc glossary` | Domain terminology management | - | - |
| `amc glossary define` | Define a glossary term | `--domain <domain>`<br>`--json` | - |
| `amc glossary lookup` | Look up a glossary term | `--json` | - |
| `amc governance-drift` | Detect governance drift for an agent | `--agent <agentId>` | - |
| `amc governor` | Autonomy Governor checks | - | - |
| `amc governor check` | Evaluate whether an action is allowed now (simulate vs execute) | `--action <class>`<br>`--risk <tier>`<br>`--mode <mode>`<br>`--agent <agentId>` | - |
| `amc governor confidence-check` | Check if action is allowed given confidence-adjusted maturity | `--action <class>`<br>`--agent <id>`<br>`--required-level <n>` | - |
| `amc governor explain` | Explain policy requirements for an action class | `--action <class>`<br>`--agent <agentId>` | - |
| `amc governor report` | Render matrix of current SIMULATE/EXECUTE allowance per ActionClass | `--window <window>`<br>`--out <path>`<br>`--agent <agentId>` | - |
| `amc governor-override` | Activate an emergency governance override with TTL | `--agent <agentId>`<br>`--reason <reason>`<br>`--ttl <ttl>`<br>`--mode <mode>` | - |
| `amc governor-override-alerts` | Show alerts for active/expired overrides | `--agent <agentId>` | - |
| `amc guard` | Guard check proposed output from stdin | `--target <name>`<br>`--risk-tier <tier>` | - |
| `amc guardrails` | Simple guardrail management | - | - |
| `amc guardrails disable` | Disable a guardrail | - | - |
| `amc guardrails enable` | Enable a guardrail | - | - |
| `amc guardrails list` | List all available guardrails with status | `--json` | - |
| `amc guardrails profile` | Apply a guardrail profile (minimal, standard, strict, healthcare, financial) | - | - |
| `amc guide` | Generate personalized improvement guide with exportable agent instructions | `--target <level>`<br>`--export`<br>`--agent-instructions`<br>`--guardrails`<br>`--apply [file]`<br>`--interactive`<br>`--watch`<br>`--watch-interval <seconds>`<br>`--diff`<br>`--frameworks`<br>`--ci`<br>`--dry-run`<br>`--quick`<br>`--auto-detect`<br>`--status`<br>`--go`<br>`--compliance [frameworks]`<br>`--agent <id>`<br>`--framework <name>`<br>`--json` | - |
| `amc help` | Show help for a command (for example: amc help run) | `--all` | - |
| `amc history` | List diagnostic run history | `--limit <n>`<br>`--valid-only`<br>`--since <hours>` | - |
| `amc host` | Multi-workspace host mode operations | - | - |
| `amc host bootstrap` | Bootstrap host admin + default workspace from secret files | `--dir <path>` | - |
| `amc host init` | Initialize host metadata database | `--dir <path>` | - |
| `amc host list` | List host users and workspaces | `--dir <path>` | - |
| `amc host membership` | Host membership management | - | - |
| `amc host membership grant` | - | `--dir <path>`<br>`--username <username>`<br>`--workspace <workspaceId>`<br>`--role <role>` | - |
| `amc host membership revoke` | - | `--dir <path>`<br>`--username <username>`<br>`--workspace <workspaceId>`<br>`--role <role>` | - |
| `amc host migrate` | Migrate an existing single-workspace AMC directory into host mode | `--from <path>`<br>`--to-host <path>`<br>`--workspace-id <id>`<br>`--move`<br>`--username <username>`<br>`--name <name>` | - |
| `amc host user` | Host user management | - | - |
| `amc host user add` | - | `--dir <path>`<br>`--username <username>`<br>`--password-file <path>`<br>`--host-admin` | - |
| `amc host user disable` | - | `--dir <path>`<br>`--username <username>` | - |
| `amc host workspace` | Host workspace lifecycle | - | - |
| `amc host workspace create` | - | `--dir <path>`<br>`--id <workspaceId>`<br>`--name <name>` | - |
| `amc host workspace delete` | - | `--dir <path>`<br>`--id <workspaceId>` | - |
| `amc host workspace purge` | - | `--dir <path>`<br>`--id <workspaceId>`<br>`--confirm <workspaceId>` | - |
| `amc identity` | Enterprise identity (OIDC/SAML) configuration | - | - |
| `amc identity init` | Create and sign host-level identity.yaml | `--host-dir <path>` | - |
| `amc identity mapping` | Signed group-to-role mapping rules | - | - |
| `amc identity mapping add` | Add a group mapping rule | `--host-dir <path>`<br>`--group <name>`<br>`--provider-id <id>`<br>`--workspace <id>`<br>`--roles <roles>`<br>`--host-admin` | - |
| `amc identity provider` | Identity provider management | - | - |
| `amc identity provider add` | Add an identity provider | `--host-dir <path>`<br>`--id <providerId>`<br>`--display-name <name>`<br>`--issuer <issuer>`<br>`--client-id <id>`<br>`--client-secret-file <path>`<br>`--redirect-uri <uri>`<br>`--scopes <scopes>`<br>`--use-well-known <bool>`<br>`--authorization-endpoint <url>`<br>`--token-endpoint <url>`<br>`--jwks-uri <url>`<br>`--entry-point <url>`<br>`--idp-cert-file <path>`<br>`--sp-entity-id <id>`<br>`--acs-url <url>` | - |
| `amc identity verify` | Verify identity.yaml signature | `--host-dir <path>` | - |
| `amc import` | Import neutral traces, runs, workflow graphs, configs, memory, evals, and benchmarks | `--agent <agentId>`<br>`--dry-run`<br>`--validate`<br>`--json` | - |
| `amc imports` | List, inspect, and roll back neutral import runs | - | - |
| `amc imports list` | List recent neutral import runs | `--limit <n>`<br>`--json` | - |
| `amc imports rollback` | Remove files written by a neutral import run | `--json` | - |
| `amc imports show` | Inspect a neutral import manifest | `--json` | - |
| `amc improve` | Guided improvement — shows what to fix next based on your current score | `--json` | - |
| `amc incident` | Incident tracking and response operations | - | - |
| `amc incident close` | Close an incident with a resolution summary | `--resolution <text>` | - |
| `amc incident create` | Create a manual incident | `--title <title>`<br>`--severity <severity>`<br>`--agent <agentId>` | - |
| `amc incident link` | Link evidence to an incident | `--evidence <evidenceId>` | - |
| `amc incident list` | List incidents for an agent | `--status <status>`<br>`--limit <n>`<br>`--agent <agentId>` | - |
| `amc incident show` | Show incident details | - | - |
| `amc incidents` | Incident operations and dispatch workflows | - | - |
| `amc incidents alert` | Dispatch INCIDENT_CREATED to configured integration channels | `--agent <agentId>`<br>`--summary <text>`<br>`--details <json>` | - |
| `amc incidents help` | Show incident-focused command groups | - | - |
| `amc indices` | Compute deterministic failure-risk indices | `--run <runId>`<br>`--agent <agentId>`<br>`--out <path>` | - |
| `amc indices fleet` | Compute failure-risk indices across fleet | `--window <window>`<br>`--out <path>` | - |
| `amc ingest` | Ingest external logs/transcripts as SELF_REPORTED evidence | `--type <kind>`<br>`--agent <agentId>` | - |
| `amc init` | Initialize .amc workspace | `--trust-boundary <mode>`<br>`--profile <name>`<br>`--force`<br>`--skip-vault`<br>`--minimal` | - |
| `amc insider-alerts` | Show insider risk alerts | `--actor <id>`<br>`--ack <alertId>` | - |
| `amc insider-risk-report` | Generate insider risk analytics report | `--window <days>` | - |
| `amc insider-risk-scores` | Show insider risk scores by actor | - | - |
| `amc integrate` | Generate integration scaffold for a framework | `--output-dir <dir>`<br>`--project <path>` | - |
| `amc integrate-list` | List available integration frameworks | - | - |
| `amc integrations` | Integration hub operations | - | - |
| `amc integrations catalog` | List available integrations | - | - |
| `amc integrations dispatch` | Dispatch a deterministic integration event | `--event <name>`<br>`--agent <id>`<br>`--summary <text>` | - |
| `amc integrations export-journal` | Export integration delivery journal (receipts + dead letters) | `--out <file>` | - |
| `amc integrations init` | Create and sign integrations.yaml with vault-backed secret refs | - | - |
| `amc integrations setup` | Generate integration config files | `--type <type>`<br>`--min-score <score>`<br>`--agent <agentId>`<br>`--output <dir>` | - |
| `amc integrations status` | Show integration channels and routing | - | - |
| `amc integrations test` | Dispatch deterministic test event to an integration channel | `--channel <id>` | - |
| `amc integrations verify` | Verify integrations config signature | - | - |
| `amc inventory` | AI asset inventory — discover and catalog AI agents, models, and tools | - | - |
| `amc inventory list` | List AI assets (alias for 'inventory scan') | `--deep`<br>`--json` | - |
| `amc inventory scan` | Scan workspace for AI assets (agents, models, configs, API keys) | `--deep`<br>`--json` | - |
| `amc key-custody-modes` | List available key custody modes and their configurations | - | - |
| `amc lab-compare` | Compare two lab experiments | `--baseline <id>`<br>`--candidate <id>` | - |
| `amc lab-create` | Create a new lab experiment | `--kind <kind>`<br>`--name <name>`<br>`--model <modelId>`<br>`--description <desc>` | - |
| `amc lab-list` | List all lab experiments | `--kind <kind>` | - |
| `amc lab-report` | Generate a lab experiment report | `--experiment <id>` | - |
| `amc lab-simulate` | Simulate running all probes for an experiment | `--experiment <id>` | - |
| `amc lab-templates` | List available experiment templates | - | - |
| `amc leaderboard` | Benchmark leaderboard — compare agent maturity scores | - | - |
| `amc leaderboard export` | Export leaderboard as JSON/HTML for public sharing | `--format <fmt>`<br>`--output <path>` | - |
| `amc leaderboard public-export` | Build an anonymized public leaderboard dataset bundle | `--output <dir>`<br>`--dataset-id <id>`<br>`--name <name>`<br>`--license <id>`<br>`--amc-version <version>`<br>`--salt <value>`<br>`--min-agents <n>`<br>`--allow-small-cohort`<br>`--include-model-family`<br>`--include-provider-id`<br>`--json` | - |
| `amc leaderboard show` | Show fleet-wide maturity leaderboard | `--json` | - |
| `amc learn` | Education flow for a specific maturity question | `--question <qid>`<br>`--agent <agentId>` | - |
| `amc lease` | Issue/verify/revoke short-lived agent leases | - | - |
| `amc lease issue` | - | `--agent <agentId>`<br>`--ttl <ttl>`<br>`--scopes <scopes>`<br>`--routes <routes>`<br>`--models <models>`<br>`--rpm <rpm>`<br>`--tpm <tpm>`<br>`--max-cost-usd-per-day <usd>`<br>`--workorder <workOrderId>` | - |
| `amc lease revoke` | - | `--lease-id <id>`<br>`--reason <reason>` | - |
| `amc lease verify` | - | - | - |
| `amc legal-hold` | Issue or manage legal holds | `--issue`<br>`--release <holdId>`<br>`--list`<br>`--tenant <id>`<br>`--reason <text>`<br>`--issued-by <name>` | - |
| `amc lessons-list` | List lessons learned from corrections | `--scope <scope>`<br>`--agent <agentId>` | - |
| `amc lessons-promote` | Promote a correction to a reusable lesson | - | - |
| `amc lifecycle` | Agent lifecycle responsibility and governance mapping | - | - |
| `amc lifecycle advance` | Advance lifecycle stage after governance gate confirmation | `--agent <agentId>`<br>`--to <stage>`<br>`--actor <actor>`<br>`--actor-role <role>`<br>`--controls <list>`<br>`--note <text>`<br>`--json` | - |
| `amc lifecycle status` | Show lifecycle stage, accountability matrix, governance gates, and transition trail | `--agent <agentId>`<br>`--json` | - |
| `amc lineage-claim` | Show full governance lineage for a specific claim | - | - |
| `amc lineage-init` | Initialize governance lineage tables | - | - |
| `amc lineage-policy-intents` | List all policy change intents for an agent | `--agent <agentId>` | - |
| `amc lineage-report` | Generate governance lineage report | `--agent <agentId>` | - |
| `amc lint` | Lint agent configuration files for schema compliance, anti-patterns, and best practices | `--fix`<br>`--format <fmt>`<br>`--rules <ids...>`<br>`--workspace <path>` | - |
| `amc lint rules` | List all available lint rules | `--json` | - |
| `amc lite-score` | Lite scoring mode for non-agent LLMs / chatbots — simplified assessment without agentic features | `--agent <agentId>`<br>`--json`<br>`--eu-ai-act` | - |
| `amc logs` | Print latest AMC Studio logs | `--lines <n>` | - |
| `amc loop` | Continuous self-serve maturity loop | - | - |
| `amc loop init` | Initialize recurring loop config | - | - |
| `amc loop plan` | Print recurring loop plan | `--cadence <cadence>`<br>`--agent <agentId>` | - |
| `amc loop run` | Run recurring diagnostic + assurance + dashboard + snapshot | `--days <n>`<br>`--agent <agentId>` | - |
| `amc loop schedule` | Print OS scheduler config (no automatic installation) | `--os <os>`<br>`--cadence <cadence>`<br>`--agent <agentId>` | - |
| `amc maintenance` | Operational maintenance operations | - | - |
| `amc maintenance prune-cache` | Prune dashboard/console/transform cache artifacts | - | - |
| `amc maintenance reindex` | Ensure operational SQLite indexes | - | - |
| `amc maintenance rotate-logs` | Rotate Studio logs based on ops policy | - | - |
| `amc maintenance stats` | Show DB/blob/archive/cache operational stats | - | - |
| `amc maintenance vacuum` | Run SQLite VACUUM + ANALYZE | - | - |
| `amc marketplace` | AMC Pack Marketplace — browse, install, rate community packs | - | - |
| `amc marketplace deprecate` | Deprecate a pack | `--note <text>` | - |
| `amc marketplace featured` | Show featured packs | `--json` | - |
| `amc marketplace info` | Show details for a specific pack | `--json` | - |
| `amc marketplace install` | Install a pack from the marketplace | `--version <ver>`<br>`--agent <agentId>`<br>`--json` | - |
| `amc marketplace list` | List installed packs | `--json` | - |
| `amc marketplace rate` | Rate a pack | `--score <n>`<br>`--review <text>`<br>`--user <userId>`<br>`--json` | - |
| `amc marketplace search` | Search marketplace for packs | `-q, --query <query>`<br>`--category <cat>`<br>`--source <src>`<br>`--installed`<br>`--featured`<br>`--min-rating <n>`<br>`--tags <tags>`<br>`--sort <field>`<br>`--limit <n>`<br>`--json` | - |
| `amc marketplace undeprecate` | Remove deprecation from a pack | - | - |
| `amc marketplace uninstall` | Uninstall a pack | `--agent <agentId>` | - |
| `amc mcp` | AMC Model Context Protocol (MCP) server for AI coding assistants | - | - |
| `amc mcp config` | Print MCP configuration snippets for supported AI coding assistants | `--ide <name>`<br>`--json` | - |
| `amc mcp list-tools` | List all tools exposed by the AMC MCP server | `--json` | - |
| `amc mcp serve` | Start the AMC MCP server (stdio transport for IDE integration) | `--workspace <path>` | - |
| `amc mechanic` | Mechanic Workbench (targets, plans, simulation) | - | - |
| `amc mechanic export` | Export latest gap analysis as reward functions, DSPy targets, or fine-tune recipes | `--gap-file <path>`<br>`--format <format>`<br>`--out <path>`<br>`--json` | - |
| `amc mechanic gap` | - | `--scope <scope>`<br>`--id <id>`<br>`--out <path>` | - |
| `amc mechanic init` | - | `--scope <scope>`<br>`--id <id>` | - |
| `amc mechanic plan` | Create, diff, approve, and execute upgrade plans | - | - |
| `amc mechanic plan create` | - | `--scope <scope>`<br>`--id <id>`<br>`--from <from>`<br>`--to <to>` | - |
| `amc mechanic plan diff` | - | `--plan-id <id>` | - |
| `amc mechanic plan execute` | - | - | - |
| `amc mechanic plan request-approval` | - | `--reason <text>` | - |
| `amc mechanic plan show` | - | - | - |
| `amc mechanic profile` | Apply one-click signed target profiles | - | - |
| `amc mechanic profile apply` | - | `--scope <scope>`<br>`--id <id>`<br>`--mode <mode>`<br>`--reason <text>` | - |
| `amc mechanic profile list` | - | - | - |
| `amc mechanic profile verify` | - | - | - |
| `amc mechanic rca` | Generate fixer root-cause reports from trace failure indexes | - | - |
| `amc mechanic rca list` | List generated fixer RCA reports | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc mechanic rca run` | Classify a failed run and create regression-preserving fix proposals | `--agent <agentId>`<br>`--json` | - |
| `amc mechanic rca show` | Inspect a fixer RCA report | `--agent <agentId>`<br>`--json` | - |
| `amc mechanic simulate` | - | - | - |
| `amc mechanic simulations` | Show latest signed simulation artifact | - | - |
| `amc mechanic targets` | Manage signed equalizer targets | - | - |
| `amc mechanic targets apply` | - | `--file <path>`<br>`--reason <text>` | - |
| `amc mechanic targets init` | - | `--scope <scope>`<br>`--id <id>`<br>`--mode <mode>` | - |
| `amc mechanic targets print` | - | - | - |
| `amc mechanic targets set` | - | `--q <qid>`<br>`--value <n>`<br>`--reason <text>` | - |
| `amc mechanic targets verify` | - | - | - |
| `amc mechanic tuning` | Manage signed mechanic tuning intent | - | - |
| `amc mechanic tuning apply` | - | `--file <path>`<br>`--reason <text>` | - |
| `amc mechanic tuning init` | - | `--scope <scope>`<br>`--id <id>` | - |
| `amc mechanic tuning print` | - | - | - |
| `amc mechanic tuning set` | - | `--key <key>`<br>`--value <value>`<br>`--reason <text>` | - |
| `amc mechanic tuning verify` | - | - | - |
| `amc mechanic verify` | Verify mechanic signatures and artifacts | - | - |
| `amc memory` | Memory maturity assessment and management | - | - |
| `amc memory assess` | Full memory maturity assessment | `--json` | - |
| `amc memory retrieve` | Retrieve active reasoning memory for a consumer | `--agent <agentId>`<br>`--consumer <consumer>`<br>`--query <text>`<br>`--limit <n>`<br>`--json` | - |
| `amc memory show` | Show one reasoning memory item | `--agent <agentId>`<br>`--json` | - |
| `amc memory writeback` | Write governed reasoning memory from an EpisodeRecord | `--agent <agentId>`<br>`--consumer <csv>`<br>`--ttl-days <n>`<br>`--review-days <n>`<br>`--summary <text>`<br>`--json` | - |
| `amc memory-advisories` | Show advisories from correction memory for prompt injection | `--agent <agentId>` | - |
| `amc memory-expire` | Expire stale lessons past their TTL | `--agent <agentId>` | - |
| `amc memory-extract` | Extract lessons from verified effective corrections | `--agent <agentId>`<br>`--min-effectiveness <n>` | - |
| `amc memory-report` | Generate correction memory report | `--agent <agentId>`<br>`--window <window>` | - |
| `amc meta-confidence` | Report confidence in the maturity score itself | `--agent <id>`<br>`--run <runId>` | - |
| `amc methodology` | Print the public AMC scoring methodology manifest and hash | `--json`<br>`--reproducibility`<br>`--sample-dataset`<br>`--format <format>`<br>`--out <path>` | - |
| `amc metrics` | Prometheus metrics endpoint helpers | - | - |
| `amc metrics status` | Show configured metrics endpoint bind/port | - | - |
| `amc micro-canary-alerts` | Show active micro-canary alerts | `--ack-all` | - |
| `amc micro-canary-report` | Generate micro-canary status report | `--window <hours>` | - |
| `amc micro-canary-run` | Run all micro-canary probes immediately | `--agent <agentId>` | - |
| `amc mirofish` | Agent behavior simulation framework — flight simulator for AI agents | - | - |
| `amc mirofish compare` | Side-by-side comparison of two scenarios | `--iterations <n>`<br>`--seed <n>` | - |
| `amc mirofish create` | Interactive scenario builder | - | - |
| `amc mirofish list` | List available built-in scenarios | - | - |
| `amc mirofish run` | Run a Monte Carlo simulation with a scenario | `--scenario <name|path>`<br>`--iterations <n>`<br>`--seed <n>`<br>`--output <format>` | - |
| `amc mirofish stress` | Find governance breaking points for a scenario | `--seed <n>` | - |
| `amc mode` | Switch CLI role mode | - | - |
| `amc mode agent` | Switch to agent mode (read-only / self-check commands) | - | - |
| `amc mode owner` | Switch to owner mode (configuration + signing allowed) | - | - |
| `amc monitor` | Continuous production monitoring — real-time scoring, drift detection, and alerting | `--runtime <name>`<br>`--stdin` | - |
| `amc monitor check` | One-shot trust drift analysis (check for degradation without running continuously) | `--agent <agentId>`<br>`--alert-threshold <n>` | - |
| `amc monitor events` | Show recent monitoring events | `--limit <n>`<br>`--json` | - |
| `amc monitor live` | Start real-time monitoring with live assurance checks on incoming traces | `--agent <agentId>`<br>`--provider <provider>`<br>`--endpoint <url>`<br>`--api-key <key>`<br>`--budget <usd>`<br>`--max-latency <ms>`<br>`--alert-severity <level>` | - |
| `amc monitor metrics` | Get metrics for a specific agent | `--agent <id>`<br>`--json` | - |
| `amc monitor start` | Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation | `--agent <id>`<br>`--scoring-interval <ms>`<br>`--drift-interval <ms>`<br>`--score-drop-threshold <n>`<br>`--no-webhooks` | - |
| `amc monitor status` | Show monitoring status for all agents | `--json` | - |
| `amc notary` | AMC Notary signing boundary operations | - | - |
| `amc notary attest` | Generate signed notary runtime attestation bundle (.amcattest) | `--out <file>`<br>`--notary-dir <dir>`<br>`--workspace <dir>` | - |
| `amc notary init` | Initialize AMC Notary config and signing backend | `--notary-dir <dir>`<br>`--external-command <cmd>`<br>`--external-args <args...>` | - |
| `amc notary log-verify` | Verify notary append-only signing log + seal signature | `--notary-dir <dir>` | - |
| `amc notary pubkey` | Print notary public key and fingerprint | `--notary-dir <dir>` | - |
| `amc notary sign` | Sign a payload file using Notary (admin utility) | `--kind <kind>`<br>`--in <file>`<br>`--out <file>`<br>`--notary-dir <dir>` | - |
| `amc notary start` | Start AMC Notary service (foreground) | `--notary-dir <dir>`<br>`--workspace <dir>` | - |
| `amc notary status` | Show notary backend and log status | `--notary-dir <dir>` | - |
| `amc notary verify-attest` | Verify a .amcattest bundle offline | - | - |
| `amc observe` | Observability — timeline, anomaly detection, and tracing | - | - |
| `amc observe anomalies` | Detect observability anomalies (evidence rate drops, trust regressions, score volatility) | `--agent <agentId>`<br>`--json` | - |
| `amc observe timeline` | Show agent evidence timeline with score progression | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc openapi-generate` | Generate live OpenAPI spec (Studio + Bridge + Gateway) | `--out <file>`<br>`--json` | - |
| `amc operator-dashboard` | Generate operator dashboard showing why questions are capped and how to unlock | `--role <role>`<br>`--run <runId>`<br>`--previous-run <runId>` | - |
| `amc ops` | Operational hardening policy controls | - | - |
| `amc ops backpressure` | Show backpressure pipeline health | - | - |
| `amc ops circuit-breaker-init` | Initialize circuit breaker policy | `--timeout <ms>`<br>`--threshold <n>` | - |
| `amc ops circuit-breaker-reset` | Reset all circuit breakers | - | - |
| `amc ops circuit-breaker-status` | Show circuit breaker status | - | - |
| `amc ops dead-letters` | Show dead letter queue | `--unresolved` | - |
| `amc ops init` | Create and sign .amc/ops-policy.yaml | - | - |
| `amc ops latency` | Show latency accounting report | `--window <hours>` | - |
| `amc ops mode` | Show or set degradation mode | `--set <mode>`<br>`--reason <reason>`<br>`--ttl <duration>` | - |
| `amc ops print` | Print effective ops policy | - | - |
| `amc ops slo` | Show governance SLO dashboard | `--window <hours>` | - |
| `amc ops verify` | Verify ops-policy signature | - | - |
| `amc org` | Org graph and real-time comparative scorecards | - | - |
| `amc org add` | - | - | - |
| `amc org add node` | - | `--type <type>`<br>`--id <id>`<br>`--name <name>`<br>`--parent <id>` | - |
| `amc org assign` | - | `--agent <id>`<br>`--node <id>`<br>`--weight <n>` | - |
| `amc org commit` | - | `--node <id>`<br>`--days <n>`<br>`--out <file>` | - |
| `amc org community` | Community/platform governance scoring | - | - |
| `amc org community init` | - | `--platform <name>` | - |
| `amc org community score` | - | `--platform <name>` | - |
| `amc org compare` | - | `--node-a <id>`<br>`--node-b <id>`<br>`--out <file>`<br>`--format <fmt>`<br>`--window <window>` | - |
| `amc org init` | - | `--enterprise <name>` | - |
| `amc org inspect` | - | `--redacted`<br>`--json` | - |
| `amc org learn` | - | `--node <id>`<br>`--out <file>` | - |
| `amc org own` | - | `--node <id>`<br>`--out <file>` | - |
| `amc org report` | - | `--node <id>`<br>`--out <file>`<br>`--window <window>` | - |
| `amc org roles` | List the canonical 70 AMC org roles | `--json` | - |
| `amc org run` | Run the advanced 70-role org lifecycle loop with isolated role workspaces | `--roles <csv>`<br>`--goal <text>`<br>`--heartbeat <minutes>`<br>`--max-stale <minutes>`<br>`--plateau-after <n>`<br>`--id <id>`<br>`--json` | - |
| `amc org runs` | List org lifecycle runs | `--limit <n>`<br>`--json` | - |
| `amc org score` | - | `--window <window>` | - |
| `amc org unassign` | - | `--agent <id>`<br>`--node <id>` | - |
| `amc org verify` | Verify signed org.yaml | - | - |
| `amc outcomes` | Outcome contracts, value signals, and reports | - | - |
| `amc outcomes attest` | Record manual attested outcome signal | `--metric <metricId>`<br>`--value <value>`<br>`--reason <text>`<br>`--workorder <id>`<br>`--unit <unit>`<br>`--agent <agentId>` | - |
| `amc outcomes diff` | Diff two outcome reports | - | - |
| `amc outcomes init` | Create and sign outcome contract | `--agent <agentId>`<br>`--archetype <id>` | - |
| `amc outcomes report` | Generate outcomes report (agent) or fleet outcomes report | `--window <window>`<br>`--out <path>`<br>`--agent <agentId>` | - |
| `amc outcomes verify` | Verify outcome contract signature | `--agent <agentId>` | - |
| `amc overhead-profile` | Set the overhead mode profile (STRICT, BALANCED, LEAN) | - | - |
| `amc overhead-report` | Generate per-feature overhead accounting report | `--window <hours>` | - |
| `amc oversight` | Human oversight quality assessment | - | - |
| `amc oversight assess` | Assess human oversight quality | `--json` | - |
| `amc own` | Ownership flow for top maturity gaps | `--target <name>`<br>`--agent <agentId>` | - |
| `amc pack` | Community assurance pack registry — NPM-style package management | - | - |
| `amc pack info` | Show detailed information about a pack | `--json` | - |
| `amc pack init` | Initialize a new pack in <name>/ or an explicit --dir | `--name <name>`<br>`--dir <path>`<br>`--version <version>`<br>`--description <desc>`<br>`--author <author>`<br>`--license <license>`<br>`--type <type>` | - |
| `amc pack install` | Install a community assurance pack | `--version <version>`<br>`--save`<br>`--save-dev`<br>`--force`<br>`--dry-run`<br>`--json` | - |
| `amc pack list` | List installed packs | `--global`<br>`--json` | - |
| `amc pack publish` | Publish a pack to the registry | `--registry <url>`<br>`--dry-run`<br>`--access <level>`<br>`--json` | - |
| `amc pack registry` | Pack registry management | - | - |
| `amc pack registry init` | Initialize local pack registry | - | - |
| `amc pack registry serve` | Start a local pack registry server | `--port <port>`<br>`--host <host>` | - |
| `amc pack search` | Search for packs in the registry | `--category <category>`<br>`--author <author>`<br>`--keywords <keywords>`<br>`--limit <n>`<br>`--offset <n>`<br>`--json` | - |
| `amc pack test` | Test a local pack directory; defaults to cwd and auto-detects one child pack | `--agent <agentId>`<br>`--json` | - |
| `amc pack uninstall` | Uninstall a pack | `--save`<br>`--json` | - |
| `amc pair` | LAN pairing code operations | - | - |
| `amc pair create` | Create one-time pairing code (LAN login pairing or agent bridge pairing) | `--ttl <ttl>`<br>`--ttl-min <minutes>`<br>`--agent-name <name>`<br>`--workspace <workspaceId>` | - |
| `amc pair redeem` | Redeem pairing code for a lease token file | `--out <file>`<br>`--bridge-url <url>`<br>`--lease-ttl-min <minutes>` | - |
| `amc passport` | Agent Passport (shareable maturity credential) | - | - |
| `amc passport badge` | Print deterministic single-line badge from latest cache | `--scope <scope>`<br>`--id <agentId>` | - |
| `amc passport capabilities-add` | Add capability declaration to agent passport | `--agent <id>`<br>`--capability <name>`<br>`--evidence <eventId>` | - |
| `amc passport compare` | Compare two agents by passport maturity dimensions | - | - |
| `amc passport create` | Create deterministic signed .amcpass artifact | `--scope <scope>`<br>`--out <file.amcpass>`<br>`--id <id>` | - |
| `amc passport export-latest` | Export latest passport for a scope to .amcpass | `--scope <scope>`<br>`--out <file.amcpass>`<br>`--id <id>` | - |
| `amc passport init` | Create and sign .amc/passport/policy.yaml | - | - |
| `amc passport issue-token` | Issue an AMC Trust Token for an agent | `--agent <id>`<br>`--dimensions <list>`<br>`--ttl <hours>` | - |
| `amc passport link` | Link agent passport to external platform identity | `--agent <id>`<br>`--platform <name>`<br>`--identity <handle>` | - |
| `amc passport policy` | Passport policy operations | - | - |
| `amc passport policy apply` | Apply passport policy from JSON/YAML file | `--file <path>` | - |
| `amc passport policy print` | Print effective passport policy | - | - |
| `amc passport search` | Search agents by capability and minimum maturity level | `--capability <name>`<br>`--min-level <n>` | - |
| `amc passport share` | Generate shareable passport material | `--agent <id>`<br>`--format <format>`<br>`--base-url <url>`<br>`--out <path>` | - |
| `amc passport show` | Show .amcpass as JSON or single-line badge | `--format <format>` | - |
| `amc passport translate-score` | Translate trust scores between scoring systems | `--from <system>`<br>`--to <system>`<br>`--score <n>`<br>`--json` | - |
| `amc passport verify` | Verify .amcpass artifact offline | `--pubkey <path>` | - |
| `amc passport verify-policy` | Verify signed passport policy | - | - |
| `amc passport verify-token` | Verify an AMC Trust Token (pass JSON string) | - | - |
| `amc playground` | Interactive scenario runner | - | - |
| `amc playground list` | List available scenarios | - | - |
| `amc playground run` | Run all demo scenarios | `--json` | - |
| `amc plugin` | Signed content-only extension marketplace | - | - |
| `amc plugin execute` | Execute approved plugin install/upgrade/remove request | `--approval-request <id>` | - |
| `amc plugin init` | Initialize signed plugin workspace files | - | - |
| `amc plugin install` | Request plugin install (requires SECURITY dual-control approval) | `--registry <id>`<br>`--agent <agentId>` | - |
| `amc plugin keygen` | Generate plugin publisher keypair | `--out-dir <dir>` | - |
| `amc plugin limits` | Show current plugin sandbox resource limits | - | - |
| `amc plugin list` | List installed plugins and verification status | - | - |
| `amc plugin pack` | Create signed .amcplug package from a plugin folder | `--in <dir>`<br>`--key <path>`<br>`--out <file>` | - |
| `amc plugin print` | Print plugin manifest summary | - | - |
| `amc plugin registries` | List signed workspace registry configuration | - | - |
| `amc plugin registries-apply` | Apply and sign workspace registries.yaml from JSON or YAML file | `--file <path>` | - |
| `amc plugin registry` | Manage plugin registries | - | - |
| `amc plugin registry init` | Initialize local signed plugin registry directory | `--dir <dir>`<br>`--registry-id <id>`<br>`--registry-name <name>` | - |
| `amc plugin registry publish` | Publish plugin package into registry and re-sign index | `--dir <dir>`<br>`--file <plugin>`<br>`--registry-key <key>` | - |
| `amc plugin registry serve` | Serve plugin registry over local HTTP | `--dir <dir>`<br>`--host <host>`<br>`--port <port>` | - |
| `amc plugin registry verify` | Verify registry signature and package hashes | `--dir <dir>` | - |
| `amc plugin registry-fingerprint` | Compute registry public key fingerprint | `--pubkey <path>` | - |
| `amc plugin remove` | Request plugin removal (requires SECURITY dual-control approval) | `--agent <agentId>` | - |
| `amc plugin search` | Search a plugin registry by id/fingerprint | `--registry <base>`<br>`--query <text>` | - |
| `amc plugin upgrade` | Request plugin upgrade (requires SECURITY dual-control approval) | `--registry <id>`<br>`--agent <agentId>` | - |
| `amc plugin verify` | Verify plugin package signature + artifact hashes | `--pubkey <path>` | - |
| `amc plugin workspace-verify` | Verify workspace plugin signatures/integrity | - | - |
| `amc policy` | Policy-as-code operations | - | - |
| `amc policy action` | Signed autonomy action policy | - | - |
| `amc policy action init` | Create and sign .amc/action-policy.yaml | - | - |
| `amc policy action verify` | Verify action policy signature | - | - |
| `amc policy approval` | Signed dual-control approval policy | - | - |
| `amc policy approval init` | Create and sign .amc/approval-policy.yaml | - | - |
| `amc policy approval verify` | Verify approval-policy signature | - | - |
| `amc policy pack` | Policy packs by archetype and risk tier | - | - |
| `amc policy pack apply` | Apply policy pack and sign updated configs/targets | `--agent <agentId>` | - |
| `amc policy pack describe` | Describe policy pack contents | - | - |
| `amc policy pack diff` | Show deterministic diff for applying a policy pack | `--agent <agentId>` | - |
| `amc policy pack list` | List built-in policy packs | - | - |
| `amc policy-canary-report` | Generate canary mode report for an agent | `--agent <agentId>` | - |
| `amc policy-canary-start` | Start policy canary mode (observation-only) | `--agent <agentId>`<br>`--pack <packId>`<br>`--duration <duration>` | - |
| `amc policy-debt-add` | Register a temporary policy waiver (debt) | `--agent <agentId>`<br>`--requirement <req>`<br>`--justification <text>`<br>`--expires <ts>`<br>`--created-by <who>` | - |
| `amc policy-debt-list` | List active policy debt entries | `--agent <agentId>`<br>`--all` | - |
| `amc product` | Product operations: routing, autonomy, metering, workflows | - | - |
| `amc product autonomy` | Decide autonomy level for an agent | `--json` | - |
| `amc product features` | List product features | `--relevance <level>`<br>`--lane <lane>`<br>`--amc-fit`<br>`--json` | - |
| `amc product features-recommended` | Show top recommended product features | `--limit <n>`<br>`--json` | - |
| `amc product loop-detect` | Detect infinite loops in agent behavior | `--json` | - |
| `amc product metering` | Show metering and billing for an agent | `--json` | - |
| `amc product plan` | Generate an execution plan for a goal | `--json` | - |
| `amc product retry` | Execute a command with retry logic | `--json` | - |
| `amc product route` | Route a task to the best model/provider | `--json` | - |
| `amc product workflow` | Workflow management | - | - |
| `amc product workflow create` | Create a new workflow | `--json` | - |
| `amc prompt` | Northstar prompt policy + pack operations | - | - |
| `amc prompt init` | Create and sign .amc/prompt/policy.yaml | - | - |
| `amc prompt pack` | Prompt pack artifact operations | - | - |
| `amc prompt pack build` | Build and sign .amcprompt for an agent | `--agent <agentId>`<br>`--out <file>` | - |
| `amc prompt pack diff` | Diff latest prompt pack against previous snapshot | `--agent <agentId>` | - |
| `amc prompt pack show` | Show provider-specific enforced system prompt | `--agent <agentId>`<br>`--provider <provider>`<br>`--format <format>` | - |
| `amc prompt pack verify` | Verify .amcprompt signature and lint signature | `--pubkey <path>` | - |
| `amc prompt policy` | Prompt policy operations | - | - |
| `amc prompt policy apply` | Apply prompt policy from YAML file and sign | `--file <path>`<br>`--reason <reason>` | - |
| `amc prompt policy print` | Print prompt policy | - | - |
| `amc prompt scheduler` | Prompt pack recurrence scheduler | - | - |
| `amc prompt scheduler disable` | Disable prompt scheduler | - | - |
| `amc prompt scheduler enable` | Enable prompt scheduler | - | - |
| `amc prompt scheduler run-now` | Run prompt scheduler now for one agent or all | `--agent <agentId>` | - |
| `amc prompt scheduler status` | Show prompt scheduler status | - | - |
| `amc prompt status` | List per-agent prompt pack status | - | - |
| `amc prompt verify` | Verify prompt policy, pack, lint and scheduler signatures | - | - |
| `amc proof` | Domain Proof Lane source-to-rule proof checks | - | - |
| `amc proof check` | Check a claim against a declared source-to-rule manifest and emit an amcproof artifact | `--domain <domain>`<br>`--manifest <path>`<br>`--input <path>`<br>`--out <path>`<br>`--json` | - |
| `amc provider` | Provider template operations | - | - |
| `amc provider add` | Assign or update provider template for an agent | `--agent <agentId>` | - |
| `amc provider list` | List provider templates | - | - |
| `amc python-sdk` | Generate the Python SDK package for AMC Bridge API | `--endpoints`<br>`--coverage` | - |
| `amc quality-report` | Show quality report | `--agent <agentId>`<br>`--window <days>`<br>`--json` | - |
| `amc quickscore` | Full default interactive diagnostic — or use --rapid for 5-question express, --auto for ledger evidence | `--json`<br>`--quiet`<br>`--answers <jsonOrFile>`<br>`--eu-ai-act`<br>`--auto`<br>`--rapid`<br>`--agent <agentId>`<br>`--share` | - |
| `amc quickstart` | 2-minute quickstart with Quick Score assessment | `--profile <name>`<br>`--minimal`<br>`--startup-plan`<br>`--what-broken`<br>`--role <role>`<br>`--framework <name>`<br>`--answers-out <path>`<br>`--json` | - |
| `amc rate` | Rate agent run quality (thumbs up/down) | `--score <score>`<br>`--tags <tags>`<br>`--comment <text>`<br>`--agent <agentId>` | - |
| `amc receipts-chain` | Show full delegation chain for a receipt | - | - |
| `amc redaction-test` | Run privacy redaction tests against built-in rules | - | - |
| `amc redteam` | Run red-team attack simulations against a target agent | - | - |
| `amc redteam attack` | Run attack plugins (prompt-injection, data-exfiltration, privilege-escalation, model-manipulation, denial-of-service) | `--plugins <ids...>`<br>`--json` | - |
| `amc redteam attack-list` | List available attack plugins | `--json` | - |
| `amc redteam plugins` | List available attack plugins (assurance packs) | `--json` | - |
| `amc redteam run` | Execute red-team plugins with chosen attack strategies and generate a vulnerability report | `--plugins <ids...>`<br>`--strategies <ids...>`<br>`--output <path>`<br>`--no-sign`<br>`--evil-mcp`<br>`--mcp-attacks <categories...>`<br>`--json` | - |
| `amc redteam strategies` | List available attack strategies | `--json` | - |
| `amc release` | Deterministic release engineering and offline verification | - | - |
| `amc release init` | Initialize AMC release signing keypair | `--write-private-to <path>` | - |
| `amc release licenses` | Generate dependency license inventory | `--out <file>` | - |
| `amc release pack` | Build a signed deterministic .amcrelease bundle | `--out <file>`<br>`--private-key <path>`<br>`--skip-install-build` | - |
| `amc release print` | Print release bundle manifest summary | - | - |
| `amc release provenance` | Generate AMC provenance record | `--out <file>` | - |
| `amc release sbom` | Generate deterministic CycloneDX SBOM | `--out <file>` | - |
| `amc release scan` | Run strict secret scan on a .amcrelease bundle | `--in <file>`<br>`--out <file>` | - |
| `amc release verify` | Verify a .amcrelease bundle offline | `--pubkey <path>` | - |
| `amc report` | Render report for run ID, saved alias, prefix, or 'latest' | `--executive`<br>`--html <path>`<br>`--share`<br>`--share-dir <path>`<br>`--public-base-url <url>` | - |
| `amc residency-policy` | Create or list data residency policies | `--list`<br>`--region <region>`<br>`--isolation <level>`<br>`--custody <mode>` | - |
| `amc residency-report` | Generate data residency compliance report for a tenant | `--tenant <id>`<br>`--redaction-tests` | - |
| `amc resource` | Govern prompts, tools, memory, policies, routes, and other agent-defining resources | - | - |
| `amc resource apply` | Accept current resources as the new signed manifest; dry-run unless --yes is set | `--agent <agentId>`<br>`--manifest <path>`<br>`--yes`<br>`--force`<br>`--json` | - |
| `amc resource contract` | Show the AMC-native governed resource lifecycle contract | `--json` | - |
| `amc resource diff` | Diff an Enforce resource manifest against the current workspace | `--agent <agentId>`<br>`--from <path>`<br>`--to <path>`<br>`--json` | - |
| `amc resource evaluate` | Evaluate a resource proposal against Enforce gates | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc resource get` | Inspect one resource in an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | `inspect` |
| `amc resource history` | Show signed Enforce resource manifests, snapshots, and receipts | `--agent <agentId>`<br>`--json` | - |
| `amc resource list` | List resources in an Enforce resource manifest | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc resource propose` | Create a dry-run resource change proposal from the latest manifest to current workspace state | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc resource restore` | Restore resources from an Enforce snapshot; dry-run unless --apply is set | `--agent <agentId>`<br>`--manifest <path>`<br>`--resource <idOrPath>`<br>`--apply`<br>`--include-immutable`<br>`--json` | - |
| `amc resource rollback` | Alias for restore: rollback resources from an Enforce snapshot | `--agent <agentId>`<br>`--manifest <path>`<br>`--resource <idOrPath>`<br>`--apply`<br>`--include-immutable`<br>`--json` | - |
| `amc resource snapshot` | Write the current Enforce resource manifest | `--agent <agentId>`<br>`--json` | - |
| `amc resource validate` | Validate governed resource changes before accepting them | `--agent <agentId>`<br>`--manifest <path>`<br>`--json` | - |
| `amc retention` | Retention/archive payload lifecycle operations | - | - |
| `amc retention run` | Run archival + payload prune lifecycle | `--dry-run` | - |
| `amc retention status` | Show retention/archive status | - | - |
| `amc retention verify` | Verify archive manifests/signatures and ledger continuity | - | - |
| `amc role-presets` | List available dashboard role presets | - | - |
| `amc rollback-create` | Create a rollback pack from the current policy file | `--agent <agentId>`<br>`--reason <reason>`<br>`--policy-file <path>` | - |
| `amc run` | Full assessment — Score + Shield + Enforce + Vault + Watch + Comply + Fleet + Passport in one command | `--window <window>`<br>`--fail-below <grade>`<br>`--ci`<br>`--score-only`<br>`--question-set <version>`<br>`--industry-pack-weights`<br>`--json` | - |
| `amc run-alias` | Name diagnostic runs for report and history workflows | - | `run-name` |
| `amc run-alias list` | List diagnostic run aliases for the active agent | - | `run-name list` |
| `amc run-alias remove` | Remove a diagnostic run alias | - | `rm`, `run-name remove` |
| `amc run-alias set` | Assign a reusable alias to a diagnostic run | - | `run-name set` |
| `amc runtime` | Runtime run manager for connected agents | - | - |
| `amc runtime cancel` | Cancel a runtime run cleanly | `--agent <agentId>`<br>`--reason <text>`<br>`--json` | - |
| `amc runtime complete` | Complete a runtime run | `--agent <agentId>`<br>`--reason <text>`<br>`--json` | - |
| `amc runtime create` | Create a persisted connected-agent runtime run | `--run <runId>`<br>`--agent <agentId>`<br>`--source <source>`<br>`--stage <stage>`<br>`--episode <episodeId>`<br>`--lifecycle-run <id>`<br>`--message <text>`<br>`--json` | - |
| `amc runtime degrade` | Mark a runtime run degraded | `--agent <agentId>`<br>`--reason <text>`<br>`--json` | - |
| `amc runtime event` | Append an event to a persisted runtime run | `--agent <agentId>`<br>`--source <source>`<br>`--type <type>`<br>`--stage <stage>`<br>`--severity <severity>`<br>`--message <text>`<br>`--payload-json <json>`<br>`--receipt <receiptId>`<br>`--decision <decisionId>`<br>`--trace <traceId>`<br>`--candidate <candidateId>`<br>`--json` | - |
| `amc runtime export` | Export runtime run events as JSON or JSONL | `--out <path>`<br>`--agent <agentId>`<br>`--format <format>`<br>`--limit <n>`<br>`--stage <stage>`<br>`--receipt <receiptId>`<br>`--redacted`<br>`--json` | - |
| `amc runtime inspect` | Inspect a runtime run and its event stream | `--agent <agentId>`<br>`--limit <n>`<br>`--no-events`<br>`--redacted`<br>`--json` | - |
| `amc runtime list` | List persisted runtime runs | `--agent <agentId>`<br>`--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc runtime resume` | Resume a running or degraded runtime run from persisted state | `--agent <agentId>`<br>`--stage <stage>`<br>`--message <text>`<br>`--json` | - |
| `amc runtime status` | Show persisted runtime run-manager status | `--agent <agentId>`<br>`--json` | - |
| `amc sandbox` | Hardened sandbox execution | - | - |
| `amc sandbox run` | Run agent command in hardened Docker sandbox | `--agent <agentId>`<br>`--route <route>`<br>`--proxy <proxy>`<br>`--image <image>` | - |
| `amc scan` | Zero-integration agent assessment scanner | `--url <url>`<br>`--repo <url>`<br>`--local <path>`<br>`--json` | - |
| `amc scan model-scan` | Scan ML model files for security threats (malicious code, backdoors, supply chain attacks) | `--format <formats>`<br>`--max-size <mb>`<br>`--no-deep-scan`<br>`--no-hashes`<br>`--timeout <ms>`<br>`--output <format>`<br>`--output-file <path>`<br>`--recursive`<br>`--include-safe` | - |
| `amc scim` | SCIM token management | - | - |
| `amc scim init` | Enable SCIM provisioning and optionally create an initial bearer token | `--host-dir <path>`<br>`--token-name <name>`<br>`--out <file>`<br>`--require-https <bool>` | - |
| `amc scim token` | SCIM bearer token operations | - | - |
| `amc scim token create` | Create a SCIM bearer token and store hash in host vault | `--host-dir <path>`<br>`--name <name>`<br>`--out <file>` | - |
| `amc score` | Maturity scoring, adversarial testing, and evidence collection | `--tier <tier>` | - |
| `amc score a2a-protocol` | Score agent-to-agent protocol maturity: card completeness, lifecycle, auth, format, errors, discovery | `--file <path>`<br>`--json` | - |
| `amc score adversarial` | Test gaming resistance of scoring | `--json` | - |
| `amc score alignment-index` | Compute composite alignment index | `--json` | - |
| `amc score audit-depth` | Score audit trail depth and completeness | `--json` | - |
| `amc score autonomy-duration` | Track time between human checkpoints with domain risk profiles | `--json` | - |
| `amc score behavioral-contract` | Score agent behavioral contract maturity (alignment card, permitted/forbidden actions) | `--json` | - |
| `amc score calibration-gap` | Measure delta between agent self-reported confidence and observed behavior | `--json` | - |
| `amc score collect-evidence` | Collect evidence for scoring an agent | `--json` | - |
| `amc score density-map` | Heatmap of evidence density per question per dimension — reveals blind spots | `--json` | - |
| `amc score distributed-agents` | Score distributed multi-agent execution: partitions, sync, failover, consensus, load, observability | `--file <path>`<br>`--json` | - |
| `amc score eu-ai-act` | Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk) | `--json` | - |
| `amc score evidence-conflict` | Measure internal consistency of evidence — detect conflicting signals | `--json` | - |
| `amc score evidence-coverage` | Show automated vs manual evidence coverage | `--json` | - |
| `amc score evidence-ingest` | Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom) | `--json`<br>`--format <fmt>` | - |
| `amc score factuality` | Score factuality across parametric, retrieval, and grounded dimensions | `--json` | - |
| `amc score fail-secure` | Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection) | `--json` | - |
| `amc score faithfulness` | Score how well LLM output is grounded in provided context | `--json`<br>`--context <text>`<br>`--output <text>`<br>`--threshold <n>` | - |
| `amc score formal-spec` | Compute formal maturity score for an agent | `--json` | - |
| `amc score gaming-resistance` | Test whether adversarial evidence injection can inflate scores | `--json` | - |
| `amc score industry-adjust` | Adjust a score using an industry-specific trust model | `--industry <id>`<br>`--score <n>`<br>`--agent <id>`<br>`--drilldown`<br>`--history`<br>`--lookback-days <n>`<br>`--out <path>`<br>`--json` | - |
| `amc score industry-benchmark` | Show industry benchmark percentiles | `--industry <id>`<br>`--json` | - |
| `amc score industry-list` | List all available industry trust models | `--json` | - |
| `amc score interpretability` | Score structural transparency and explainability | `--json` | - |
| `amc score kernel-sandbox` | Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions) | `--json` | - |
| `amc score lean-profile` | Show lean AMC profile | `--json` | - |
| `amc score level-transition` | Track formal promotion/demotion events with evidence gates | `--json` | - |
| `amc score memory-depth` | Score deep memory infrastructure: backend resilience, compression fidelity, cross-session consistency, TTL, capacity | `--file <path>`<br>`--json` | - |
| `amc score memory-integrity` | Score memory correction persistence and poisoning resistance | `--json` | - |
| `amc score mutual-verification` | Score agent-to-agent trust verification (challenge-response) | `--json` | - |
| `amc score operational-independence` | Calculate operational independence score | `--window <days>`<br>`--domain <domain>`<br>`--json` | - |
| `amc score output-attestation` | Score output signing and trust metadata for receiving agents | `--json` | - |
| `amc score output-integrity` | Score output integrity maturity (OWASP LLM02, confidence calibration, citation) | `--json` | - |
| `amc score owasp-llm` | Score OWASP LLM Top 10 coverage (all 10 risks) | `--json` | - |
| `amc score pause-quality` | Score quality of agent-initiated pauses | `--json` | - |
| `amc score policy-consistency` | Test policy enforcement consistency across repeated trials (pass^k) | `--json` | - |
| `amc score production-ready` | Run production readiness gate for an agent | `--strict`<br>`--json` | - |
| `amc score regulatory-readiness` | Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP) | `--agent <id>`<br>`--json` | - |
| `amc score runtime-identity` | Score runtime execution identity maturity (JIT credentials, user propagation, revocation) | `--json` | - |
| `amc score safety-research` | Run the AI Safety Research evaluation lane — 4-dimension assessment based on frontier safety research | `--json`<br>`--responses <file>` | - |
| `amc score self-knowledge` | Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation) | `--json` | - |
| `amc score simulation-lane` | Run the Simulation & Forecast evaluation lane — 5-dimension assessment for simulation/forecast systems | `--system-type <type>`<br>`--json`<br>`--responses <file>` | - |
| `amc score sleeper-detection` | Detect context-dependent behavioral inconsistencies | `--json` | - |
| `amc score state-portability` | Score agent state portability (vendor-neutral format, serialization, integrity on transfer) | `--json` | - |
| `amc score task-horizon` | Score task-completion time horizon (METR-inspired) | `--json` | - |
| `amc score tier` | Run tiered maturity assessment (quick/standard/deep) | `--tier <tier>`<br>`--question-set <version>`<br>`--json` | - |
| `amc score transparency-log` | Score network transparency log (Merkle tree, inclusion proofs) | `--json` | - |
| `amc sessions` | View and analyze user sessions | - | - |
| `amc sessions list` | List tracked sessions | `--agent <agentId>`<br>`--limit <n>`<br>`--sort <by>`<br>`--json` | - |
| `amc setup` | Setup wizard for the full-score path and Studio gateway | `--provider <name>`<br>`--auto`<br>`--non-interactive`<br>`--demo` | - |
| `amc shell` | Interactive AMC session — natural language + commands | `--agent <id>`<br>`--no-color` | - |
| `amc shield` | Threat detection and security scanning | - | - |
| `amc shield analyze` | Run static code analyzer on a skill file | `--json` | - |
| `amc shield analyze-mcp` | Scan an MCP server definition for security risks (score L0–L5) | `--json`<br>`--out <path>` | - |
| `amc shield analyze-runtime` | Analyze a proposed runtime agent action through the Shield trust pipeline | `--agent <id>`<br>`--action <action>`<br>`--tool <tool>`<br>`--parameters <json>`<br>`--sensitive-fields <csv>`<br>`--instruction-source <source>`<br>`--session <id>`<br>`--workspace-id <id>`<br>`--credential-age-minutes <n>`<br>`--confidence <n>`<br>`--step <n>`<br>`--previous-actions <csv>`<br>`--fail-on-block`<br>`--json` | - |
| `amc shield confirm` | Controlled exploit confirmation with strict authorization gates | - | - |
| `amc shield confirm export` | Export a redacted safe proof without exploit instructions | `--out <path>`<br>`--json` | - |
| `amc shield confirm proofs` | List safe exploit-confirmation proof artifacts | `--json` | - |
| `amc shield confirm run` | Run authorized safe exploit confirmation from a task JSON file | `--task <path>`<br>`--scope <scopeId>`<br>`--json` | - |
| `amc shield confirm scope-write` | Write a signed exploit-confirmation authorization scope from JSON | `--file <path>`<br>`--json` | - |
| `amc shield confirm scopes` | List exploit-confirmation authorization scopes | `--json` | - |
| `amc shield conversation-integrity` | Check conversation integrity for an agent (demo) | `--json` | - |
| `amc shield detect-injection` | Detect prompt injection attempts in text | `--json` | - |
| `amc shield red-team` | Run a quick red team campaign (5 attacks on demo target). Tip: For full red-team suite with strategies, use `amc redteam run` | `--rounds <n>`<br>`--categories <list>`<br>`--target <profile>` | - |
| `amc shield red-team-status` | Show current red team capabilities and attack template count | - | - |
| `amc shield reputation` | Check reputation score for a tool | `--json` | - |
| `amc shield sandbox` | Check sandbox configuration for an agent | `--json` | - |
| `amc shield sanitize` | Sanitize text — strip LLM prompt injection and dangerous AI patterns (not SQL/XSS) | `--json` | - |
| `amc shield sbom` | Generate software bill of materials from package.json | `--json` | - |
| `amc shield threat-intel` | Check threat intelligence for an input | `--json` | - |
| `amc shield trust-pipeline` | Run end-to-end trust pipeline for an agent action | `--agent <id>`<br>`--action <action>`<br>`--tool <tool>`<br>`--session <id>`<br>`--workspace <id>`<br>`--json` | - |
| `amc simulate-bridge` | Run a simulated bridge request for local testing | `--model <model>`<br>`--prompt <prompt>`<br>`--error-rate <rate>` | - |
| `amc snapshot` | Generate Unified Clarity Snapshot markdown | `--out <file>`<br>`--agent <agentId>` | - |
| `amc sso` | SSO setup shortcuts for OIDC and SAML providers | - | - |
| `amc sso configure` | Configure an OIDC or SAML SSO provider | `--host-dir <path>`<br>`--id <providerId>`<br>`--display-name <name>`<br>`--issuer <issuer>`<br>`--client-id <id>`<br>`--client-secret-file <path>`<br>`--redirect-uri <uri>`<br>`--scopes <scopes>`<br>`--use-well-known <bool>`<br>`--authorization-endpoint <url>`<br>`--token-endpoint <url>`<br>`--jwks-uri <url>`<br>`--entry-point <url>`<br>`--idp-cert-file <path>`<br>`--sp-entity-id <id>`<br>`--acs-url <url>` | - |
| `amc standard` | Open Compass Standard schema bundle and validation | - | - |
| `amc standard generate` | Generate signed Open Compass schema bundle under .amc/standard/ | - | - |
| `amc standard print` | Print one generated schema | `--id <id>` | - |
| `amc standard schemas` | List generated schemas with digests | - | - |
| `amc standard validate` | Validate a JSON file or AMC artifact against a standard schema | `--schema <id>`<br>`--file <path>` | - |
| `amc standard verify` | Verify schema bundle signatures and manifest digests | - | - |
| `amc status` | Show AMC Studio and vault status | - | - |
| `amc strategy` | Compare inference strategies and govern route changes | - | - |
| `amc strategy compare` | Compare model/provider strategies with score, cost, latency, risk, and evidence | `--file <path>`<br>`--agent <agentId>`<br>`--objective <objective>`<br>`--apply`<br>`--approve`<br>`--json` | - |
| `amc strategy list` | List inference strategy comparison runs | `--agent <agentId>`<br>`--limit <n>`<br>`--json` | - |
| `amc strategy rollback` | Roll back an accepted inference route change | `--agent <agentId>`<br>`--json` | - |
| `amc strategy show` | Inspect an inference strategy comparison run | `--agent <agentId>`<br>`--json` | - |
| `amc studio` | Studio API helpers | - | - |
| `amc studio healthcheck` | Health/readiness probe for deployment runtime | `--workspace <path>` | - |
| `amc studio lan` | LAN mode controls for Compass Console | - | - |
| `amc studio lan disable` | Disable LAN mode and revert to localhost-only | - | - |
| `amc studio lan enable` | Enable LAN mode with pairing gate | `--bind <host>`<br>`--port <port>`<br>`--cidr <cidr...>` | - |
| `amc studio ping` | Ping local Studio API /health endpoint | - | - |
| `amc studio start` | Start Studio in foreground (non-interactive, deployment-safe) | `--workspace <path>`<br>`--bind <host>`<br>`--port <port>`<br>`--dashboard-port <port>` | - |
| `amc supervise` | Supervise any agent process and inject gateway/proxy routing env vars | `--provider-route <routeBase>`<br>`--route <routeBase>`<br>`--proxy <proxyUrl>` | - |
| `amc target` | Target profile operations | - | - |
| `amc target diff` | Diff run against target profile | `--run <runId>`<br>`--target <name>` | - |
| `amc target set` | Interactive equalizer wizard | `--name <name>` | - |
| `amc target verify` | Verify target profile signature | - | - |
| `amc tenant-isolation-check` | Check tenant isolation between all registered tenants | - | - |
| `amc tenant-register` | Register a tenant boundary | `--tenant <id>`<br>`--workspace <id>`<br>`--region <region>`<br>`--isolation <level>` | - |
| `amc ticket` | Execution ticket operations | - | - |
| `amc ticket issue` | Issue short-lived signed execution ticket | `--workorder <id>`<br>`--action <class>`<br>`--tool <name>`<br>`--ttl <ttl>`<br>`--agent <agentId>` | - |
| `amc ticket verify` | Verify signed execution ticket | - | - |
| `amc tools` | ToolHub tools config | - | - |
| `amc tools init` | Create and sign .amc/tools.yaml | - | - |
| `amc tools list` | List allowed ToolHub tools and action classes | - | - |
| `amc tools verify` | Verify tools.yaml signature | - | - |
| `amc trace` | Trace explorer — inspect agent execution traces, sessions, and tool calls | - | - |
| `amc trace failures` | Show top recurring failure clusters mined from trace indexes | `--agent <agentId>`<br>`--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc trace index` | List or inspect distilled trace failure indexes | `--agent <agentId>`<br>`--run <runId>`<br>`--limit <n>`<br>`--redacted`<br>`--json` | - |
| `amc trace inspect` | Inspect evidence events — show tool calls, decisions, and trust tiers | `--since <hours>`<br>`--type <eventType>`<br>`--limit <n>`<br>`--json` | - |
| `amc trace list` | List recent agent sessions with evidence summary | `--agent <agentId>`<br>`--since <hours>`<br>`--json` | - |
| `amc trace stats` | Show trace statistics — event counts by type, trust tier, tool usage | `--since <hours>`<br>`--json` | - |
| `amc transform` | Transformation OS (4C plans, tracking, attestations) | - | - |
| `amc transform attest` | - | `--agent <agentId>`<br>`--node <nodeId>`<br>`--task <taskId>`<br>`--statement <text>`<br>`--role <role>`<br>`--files <paths...>`<br>`--evidence-links <refs...>` | - |
| `amc transform attest-verify` | - | - | - |
| `amc transform init` | Initialize signed .amc/transform-map.yaml | - | - |
| `amc transform map` | Inspect or apply transform map | - | - |
| `amc transform map apply` | - | `--file <path>` | - |
| `amc transform map show` | - | `--format <fmt>` | - |
| `amc transform plan` | - | `--agent <agentId>`<br>`--node <nodeId>`<br>`--to <mode>`<br>`--window <window>`<br>`--preview`<br>`--target-file <path>` | - |
| `amc transform report` | - | `--agent <agentId>`<br>`--node <nodeId>`<br>`--out <file>` | - |
| `amc transform status` | - | `--agent <agentId>`<br>`--node <nodeId>` | - |
| `amc transform track` | - | `--agent <agentId>`<br>`--node <nodeId>`<br>`--window <window>` | - |
| `amc transform verify` | Verify signed transform map | - | - |
| `amc transparency` | Append-only transparency log operations | - | - |
| `amc transparency export` | Export transparency bundle | `--out <file>` | - |
| `amc transparency init` | Initialize append-only transparency log | - | - |
| `amc transparency merkle` | Merkle transparency root/proof operations | - | - |
| `amc transparency merkle prove` | Export signed inclusion proof bundle for entry hash | `--entry-hash <hash>`<br>`--out <file>` | - |
| `amc transparency merkle rebuild` | Rebuild Merkle leaves/roots from transparency log | - | - |
| `amc transparency merkle root` | Show current Merkle root and history | - | - |
| `amc transparency merkle verify-proof` | Verify signed inclusion proof bundle | - | - |
| `amc transparency report` | Generate an Agent Transparency Report — what the agent does, can access, and how trustworthy it is | `--agent <id>`<br>`--format <fmt>`<br>`--out <file>`<br>`--all`<br>`--workspace <path>` | - |
| `amc transparency tail` | Tail transparency entries | `--n <count>` | - |
| `amc transparency verify` | Verify transparency chain + seal signature | - | - |
| `amc transparency verify-bundle` | Verify exported transparency bundle | - | - |
| `amc trust` | Trust mode and Notary enforcement configuration | - | - |
| `amc trust enable-notary` | Enable fail-closed NOTARY trust mode | `--base-url <url>`<br>`--pin <pubkeyFile>`<br>`--require <level>`<br>`--unix-socket <path>` | - |
| `amc trust freshness` | Report temporal trust freshness and half-life decay | `--agent <agentId>`<br>`--lookback-days <n>`<br>`--stale-threshold <n>`<br>`--half-life-behavioral <days>`<br>`--half-life-assurance <days>`<br>`--half-life-cryptographic <days>`<br>`--half-life-self-reported <days>`<br>`--view <mode>` | - |
| `amc trust init` | Create and sign .amc/trust.yaml — sets up the trust mode (SELF/NOTARY) that governs artifact signing | - | - |
| `amc trust status` | Show trust mode, signature status, and notary health | - | - |
| `amc truthguard` | Deterministic output truth-constraint validator | - | - |
| `amc truthguard validate` | Validate structured agent output claims against deterministic truth constraints | `--file <json>` | - |
| `amc tune` | Mechanic mode tuning wizard | `--target <name>` | - |
| `amc unknowns` | List known unknowns for an agent's latest diagnostic run | `--agent <id>` | - |
| `amc up` | Start AMC control plane in one command (studio + gateway + bridge) | `--demo`<br>`--read-only`<br>`--dry-run`<br>`--no-open` | - |
| `amc upgrade` | Generate upgrade plan | `--to <destination>` | - |
| `amc user` | Multi-user RBAC account management | - | - |
| `amc user add` | Add a user with RBAC roles | `--username <name>`<br>`--role <roles>` | - |
| `amc user init` | Initialize signed users.yaml with first OWNER user | `--username <name>` | - |
| `amc user list` | List RBAC users | - | - |
| `amc user revoke` | Revoke a user account | - | - |
| `amc user role` | Set user roles | - | - |
| `amc user role set` | Replace roles for a user | `--roles <roles>` | - |
| `amc user verify` | Verify users.yaml signature | - | - |
| `amc value` | Value realization engine (contracts, scoring, ROI) | - | - |
| `amc value contract` | Value contract operations | - | - |
| `amc value contract apply` | Apply value contract from YAML/JSON file | `--file <path>`<br>`--scope <scope>`<br>`--id <id>`<br>`--reason <text>` | - |
| `amc value contract init` | Create and sign value contract template | `--scope <scope>`<br>`--id <id>`<br>`--type <type>`<br>`--deployment <deployment>` | - |
| `amc value contract print` | Print value contract and signature status | `--scope <scope>`<br>`--id <id>` | - |
| `amc value contract verify` | Verify value contract signature | `--scope <scope>`<br>`--id <id>` | - |
| `amc value import` | Import numeric KPI points from CSV (ts,value) | `--csv <path>`<br>`--scope <scope>`<br>`--id <id>`<br>`--kpi <kpiId>`<br>`--attested` | - |
| `amc value ingest` | Ingest value webhook payload JSON | `--file <path>`<br>`--attested` | - |
| `amc value init` | Initialize signed value policy, default contract, and scheduler | - | - |
| `amc value policy` | Value policy operations | - | - |
| `amc value policy apply` | Apply signed value policy from YAML/JSON file | `--file <path>`<br>`--reason <text>` | - |
| `amc value policy default` | Print default value policy JSON | - | - |
| `amc value policy print` | Print effective value policy JSON | - | - |
| `amc value report` | Generate signed value report | `--scope <scope>`<br>`--id <id>`<br>`--window-days <days>` | - |
| `amc value scheduler` | Value scheduler controls | - | - |
| `amc value scheduler disable` | Disable value scheduler | - | - |
| `amc value scheduler enable` | Enable value scheduler | - | - |
| `amc value scheduler run-now` | Run value scheduler now | `--scope <scope>`<br>`--id <id>`<br>`--window-days <days>` | - |
| `amc value scheduler status` | Show value scheduler status | - | - |
| `amc value snapshot` | Generate/load latest signed value snapshot | `--scope <scope>`<br>`--id <id>`<br>`--window-days <days>` | - |
| `amc value verify` | Verify value workspace signatures/artifacts | - | - |
| `amc value verify-policy` | Verify signed value policy | - | - |
| `amc vault` | Encrypted key vault operations | - | - |
| `amc vault classify` | Classify data sensitivity level | `--json` | - |
| `amc vault dlp` | DLP scanner for PII and secrets | - | - |
| `amc vault dlp scan` | Scan text for PII and secrets | `--json`<br>`--redact` | - |
| `amc vault dsar` | Persistent DSAR (Data Subject Access Request) workflow | - | - |
| `amc vault dsar complete` | Mark a DSAR request complete and append an audit event | `--json` | - |
| `amc vault dsar list` | List persistent DSAR requests | `--json` | - |
| `amc vault dsar status` | Show a persistent DSAR request | `--json` | - |
| `amc vault dsar submit` | Submit a persistent DSAR request | `--subject <id>`<br>`--type <type>`<br>`--json` | - |
| `amc vault dsar-status` | Show DSAR (Data Subject Access Request) status | `--json` | - |
| `amc vault init` | Initialize encrypted vault for signing keys | - | - |
| `amc vault lock` | Lock vault and clear in-memory private keys | - | - |
| `amc vault privacy-budget` | Check privacy budget for an agent | `--json` | - |
| `amc vault rag-guard` | Guard RAG chunks against injection | `--json` | - |
| `amc vault rotate-keys` | Rotate monitor signing key and append to public key history | - | - |
| `amc vault scrub` | Scrub metadata from a file | `--json` | - |
| `amc vault secret-share` | Split a secret into shares using Shamir's Secret Sharing | `--secret <value>`<br>`--shares <n>`<br>`--threshold <k>` | - |
| `amc vault status` | Show vault status | - | - |
| `amc vault unlock` | Unlock vault into memory for signing operations | - | - |
| `amc vault zk-commit` | Create a Pedersen commitment to a value | `--value <n>` | - |
| `amc vault zk-range-proof` | Create a zero-knowledge range proof that an AMC score meets a threshold | `--value <n>`<br>`--threshold <n>`<br>`--agent <id>` | - |
| `amc vault zk-verify` | Verify a ZK range proof (pass JSON as string) | - | - |
| `amc verify` | Verify integrity across AMC artifacts | `--repair` | - |
| `amc verify all` | Verify trust/policies/plugins/logs/ledger/artifacts in one pass | `--json` | - |
| `amc vibe-audit` | Run static safety checks for AI-generated code | `--file <path>`<br>`--json` | - |
| `amc watch` | Observability, attestation, and safety testing | - | - |
| `amc watch alerts` | Show recent alerts for a monitored agent | `--agent <id>`<br>`--limit <n>`<br>`--json` | - |
| `amc watch attest` | Attest an agent output | `--json` | - |
| `amc watch connect` | Connect to an observability provider (langfuse, helicone, otlp, datadog, webhook) | `--provider <provider>`<br>`--endpoint <url>`<br>`--api-key <key>`<br>`--poll-interval <ms>`<br>`--agent <agentId>` | - |
| `amc watch explain` | Generate explainability packet for an agent run | `--json` | - |
| `amc watch host-hardening` | Check host hardening status for this AMC deployment | `--json` | - |
| `amc watch profiler-anomalies` | List detected behavioral anomalies for an agent | `--agent <id>`<br>`--limit <n>` | - |
| `amc watch profiler-start` | Start behavioral profiling for an agent | `--agent <id>`<br>`--sensitivity <level>` | - |
| `amc watch profiler-status` | Show behavioral profiler status and any recent anomalies | `--agent <id>` | - |
| `amc watch providers` | Show connected observability providers and trace stats | `--agent <agentId>` | - |
| `amc watch safety-test` | Run safety tests for an agent | `--category <category>`<br>`--verbose`<br>`--json` | - |
| `amc watch start` | Start continuous production monitoring for an agent | `--agent <id>`<br>`--interval <seconds>`<br>`--alert-threshold <score>`<br>`--score-drop-threshold <n>`<br>`--no-webhooks` | - |
| `amc watch status` | Show all monitored agents and their current state | `--json` | - |
| `amc whatif` | Equalizer what-if simulator | - | - |
| `amc whatif equalizer` | - | `--agent <agentId>`<br>`--set <pair...>` | - |
| `amc whatif targets` | - | `--agent <agentId>`<br>`--in <file>`<br>`--out <file>` | - |
| `amc why-capped` | Show why each question is capped at its current level | `--question <id>` | - |
| `amc wiring-status` | Show production wiring status for all modules (Items 11-16) | `--markdown` | - |
| `amc workorder` | Signed work order operations | - | - |
| `amc workorder create` | Create and sign a work order | `--title <text>`<br>`--risk <tier>`<br>`--mode <mode>`<br>`--description <text>`<br>`--allow <class...>`<br>`--agent <agentId>` | - |
| `amc workorder expire` | Expire/revoke a work order | `--reason <text>`<br>`--agent <agentId>` | - |
| `amc workorder list` | List work orders for agent | `--agent <agentId>` | - |
| `amc workorder show` | Show signed work order JSON | `--agent <agentId>` | - |
| `amc workorder verify` | Verify work order signature | `--agent <agentId>` | - |
| `amc wrap` | Wrap runtime and capture tamper-evident evidence | `--agent-token <file>`<br>`--name <agentName>`<br>`--provider <provider>`<br>`--bridge-url <url>` | - |
