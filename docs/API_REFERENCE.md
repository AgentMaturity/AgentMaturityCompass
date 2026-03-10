# AMC API Reference

> Auto-generated from source on 2026-03-10

## Table of Contents

- [CLI Commands](#cli-commands)
- [Configuration Options](#configuration-options)
- [Assurance Packs](#assurance-packs)
- [Assertion Schema](#assertion-schema)

---

## CLI Commands

AMC provides 842 CLI commands organized into subcommand groups.

| # | Command | Description |
|---|---------|-------------|
| 1 | `help [commandPath...]` | Show help for a command (for example: amc help run) |
| 2 | `init` | Initialize .amc workspace |
| 3 | `doctor` | Check runtime availability and wrap readiness |
| 4 | `doctor-fix` | Auto-repair common setup issues |
| 5 | `improve` | Guided improvement — shows what to fix next based on your current score |
| 6 | `guide` | Generate personalized improvement guide with exportable agent instructions |
| 7 | `quickscore` | Zero-config rapid assessment — auto-scores from evidence, or interactive 5-question fallback |
| 8 | `explain <questionId>` | Plain-English explanation for a diagnostic question (example: AMC-2.1) |
| 9 | `bootstrap` | Bootstrap workspace for production deployment (non-interactive) |
| 10 | `up` | Start AMC control plane in one command (studio + gateway + bridge) |
| 11 | `host` | Multi-workspace host mode operations |
| 12 | `init` | Initialize host metadata database |
| 13 | `bootstrap` | Bootstrap host admin + default workspace from secret files |
| 14 | `user` | Host user management |
| 15 | `workspace` | Host workspace lifecycle |
| 16 | `migrate` | Migrate an existing single-workspace AMC directory into host mode |
| 17 | `membership` | Host membership management |
| 18 | `list` | List host users and workspaces |
| 19 | `down` | Stop AMC Studio local control plane |
| 20 | `status` | Show AMC Studio and vault status |
| 21 | `config` | Inspect resolved runtime configuration |
| 22 | `print` | Print resolved runtime config (secret-safe) |
| 23 | `explain` | Explain config source precedence and risky settings |
| 24 | `logs` | Print latest AMC Studio logs |
| 25 | `studio` | Studio API helpers |
| 26 | `ping` | Ping local Studio API /health endpoint |
| 27 | `start` | Start Studio in foreground (non-interactive, deployment-safe) |
| 28 | `healthcheck` | Health/readiness probe for deployment runtime |
| 29 | `lan` | LAN mode controls for Compass Console |
| 30 | `enable` | Enable LAN mode with pairing gate |
| 31 | `disable` | Disable LAN mode and revert to localhost-only |
| 32 | `connect` | Connect wizard for any agent/provider runtime |
| 33 | `adapters` | Built-in adapter system for one-line agent integration |
| 34 | `init` | Create signed adapters.yaml defaults |
| 35 | `verify` | Verify adapters.yaml signature |
| 36 | `list` | List built-in adapters and per-agent preferences |
| 37 | `detect` | Detect installed adapter runtimes and versions |
| 38 | `configure` | Set adapter profile for an agent (signed adapters.yaml) |
| 39 | `env` | Print adapter-compatible environment exports without lease token |
| 40 | `init-project` | Generate runnable local adapter sample for library-based frameworks |
| 41 | `run` | Run adapter with minted lease, routed through gateway, with observed evidence capture |
| 42 | `plugin` | Signed content-only extension marketplace |
| 43 | `keygen` | Generate plugin publisher keypair |
| 44 | `pack` | Create signed .amcplug package from a plugin folder |
| 45 | `verify` | Verify plugin package signature + artifact hashes |
| 46 | `print` | Print plugin manifest summary |
| 47 | `init` | Initialize signed plugin workspace files |
| 48 | `workspace-verify` | Verify workspace plugin signatures/integrity |
| 49 | `list` | List installed plugins and verification status |
| 50 | `registry` | Manage plugin registries |
| 51 | `init` | Initialize local signed plugin registry directory |
| 52 | `publish` | Publish plugin package into registry and re-sign index |
| 53 | `verify` | Verify registry signature and package hashes |
| 54 | `serve` | Serve plugin registry over local HTTP |
| 55 | `search` | Search a plugin registry by id/fingerprint |
| 56 | `registries` | List signed workspace registry configuration |
| 57 | `registries-apply` | Apply and sign workspace registries.yaml from JSON or YAML file |
| 58 | `install` | Request plugin install (requires SECURITY dual-control approval) |
| 59 | `upgrade` | Request plugin upgrade (requires SECURITY dual-control approval) |
| 60 | `remove` | Request plugin removal (requires SECURITY dual-control approval) |
| 61 | `execute` | Execute approved plugin install/upgrade/remove request |
| 62 | `registry-fingerprint` | Compute registry public key fingerprint |
| 63 | `wrap` | Wrap runtime and capture tamper-evident evidence |
| 64 | `supervise` | Supervise any agent process and inject gateway/proxy routing env vars |
| 65 | `monitor` | Continuous production monitoring — real-time scoring, drift detection, and alerting |
| 66 | `start` | Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation |
| 67 | `check` | One-shot trust drift analysis (check for degradation without running continuously) |
| 68 | `status` | Show monitoring status for all agents |
| 69 | `events` | Show recent monitoring events |
| 70 | `metrics` | Get metrics for a specific agent |
| 71 | `run` | Run maturity diagnostic |
| 72 | `report` | Render report for run ID |
| 73 | `history` | List diagnostic run history |
| 74 | `compare` | Compare two runs |
| 75 | `verify` | Verify integrity across AMC artifacts |
| 76 | `all` | Verify trust/policies/plugins/logs/ledger/artifacts in one pass |
| 77 | `target` | Target profile operations |
| 78 | `eval` | Eval interop import and coverage status |
| 79 | `evidence` | Evidence lifecycle workflows |
| 80 | `incidents` | Incident operations and dispatch workflows |
| 81 | `policy` | Policy-as-code operations |
| 82 | `governor` | Autonomy Governor checks |
| 83 | `tools` | ToolHub tools config |
| 84 | `workorder` | Signed work order operations |
| 85 | `ticket` | Execution ticket operations |
| 86 | `gateway` | AMC universal LLM proxy gateway |
| 87 | `bundle` | Portable evidence bundle operations |
| 88 | `ci` | CI/CD release gate helpers |
| 89 | `archetype` | Archetype packs |
| 90 | `export` | Export policy packs and badges |
| 91 | `assurance` | Assurance Lab red-team packs |
| 92 | `toctou` | Run TOCTOU assurance pack |
| 93 | `compound-threats` | Run compound threat assurance pack |
| 94 | `shutdown-compliance` | Run shutdown compliance pack |
| 95 | `advanced-threats` | Run advanced threats assurance pack |
| 96 | `cert` | Certificate operations |
| 97 | `dashboard` | Device-first Compass dashboard |
| 98 | `vault` | Encrypted key vault operations |
| 99 | `notary` | AMC Notary signing boundary operations |
| 100 | `trust` | Trust mode and Notary enforcement configuration |
| 101 | `canon` | Compass Canon signed content operations |
| 102 | `cgx` | Context Graph (CGX) build and verify operations |
| 103 | `diagnostic` | Diagnostic bank/render operations |
| 104 | `truthguard` | Deterministic output truth-constraint validator |
| 105 | `mode` | Switch CLI role mode |
| 106 | `loop` | Continuous self-serve maturity loop |
| 107 | `user` | Multi-user RBAC account management |
| 108 | `identity` | Enterprise identity (OIDC/SAML) configuration |
| 109 | `scim` | SCIM token management |
| 110 | `pair` | LAN pairing code operations |
| 111 | `transparency` | Append-only transparency log operations |
| 112 | `compliance` | Evidence-linked compliance map operations |
| 113 | `federate` | Offline federation sync operations |
| 114 | `integrations` | Integration hub operations |
| 115 | `outcomes` | Outcome contracts, value signals, and reports |
| 116 | `value` | Value realization engine (contracts, scoring, ROI) |
| 117 | `audit` | Audit binder and compliance maps |
| 118 | `admin` | Administrative controls, identity, and trust operations |
| 119 | `passport` | Agent Passport (shareable maturity credential) |
| 120 | `standard` | Open Compass Standard schema bundle and validation |
| 121 | `forecast` | Deterministic evidence-gated forecasting and planning |
| 122 | `advisory` | Forecast advisories (list/show/ack) |
| 123 | `casebook` | Signed casebook operations |
| 124 | `incident` | Incident tracking and response operations |
| 125 | `experiment` | Deterministic baseline vs candidate experiments |
| 126 | `release` | Deterministic release engineering and offline verification |
| 127 | `ops` | Operational hardening policy controls |
| 128 | `blobs` | Encrypted evidence blob operations |
| 129 | `retention` | Retention/archive payload lifecycle operations |
| 130 | `backup` | Signed encrypted backup/restore operations |
| 131 | `maintenance` | Operational maintenance operations |
| 132 | `metrics` | Prometheus metrics endpoint helpers |
| 133 | `lifecycle` | Agent lifecycle responsibility and governance mapping |
| 134 | `merkle` | Merkle transparency root/proof operations |
| 135 | `action` | Signed autonomy action policy |
| 136 | `approval` | Signed dual-control approval policy |
| 137 | `pack` | Policy packs by archetype and risk tier |
| 138 | `import` | Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse) into signed AMC evidence |
| 139 | `status` | Show imported eval coverage per AMC dimension |
| 140 | `run` | One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results |
| 141 | `status` | Show lifecycle stage, accountability matrix, governance gates, and transition trail |
| 142 | `advance` | Advance lifecycle stage after governance gate confirmation |
| 143 | `help` | Show high-signal evidence command groups |
| 144 | `collect` | Guided wizard to connect your agent and capture evidence |
| 145 | `verify` | Run full workspace verification suite |
| 146 | `help` | Show incident-focused command groups |
| 147 | `alert` | Dispatch INCIDENT_CREATED to configured integration channels |
| 148 | `help` | Show admin-focused command groups |
| 149 | `status` | Show operational admin status for control-plane services |
| 150 | `init` | Create and sign .amc/action-policy.yaml |
| 151 | `verify` | Verify action policy signature |
| 152 | `init` | Create and sign .amc/approval-policy.yaml |
| 153 | `verify` | Verify approval-policy signature |
| 154 | `list` | List built-in policy packs |
| 155 | `describe` | Describe policy pack contents |
| 156 | `diff` | Show deterministic diff for applying a policy pack |
| 157 | `apply` | Apply policy pack and sign updated configs/targets |
| 158 | `list` | List incidents for an agent |
| 159 | `show <id>` | Show incident details |
| 160 | `create` | Create a manual incident |
| 161 | `link <incidentId>` | Link evidence to an incident |
| 162 | `close <id>` | Close an incident with a resolution summary |
| 163 | `init` | Create and sign .amc/ops-policy.yaml |
| 164 | `verify` | Verify ops-policy signature |
| 165 | `print` | Print effective ops policy |
| 166 | `circuit-breaker-init` | Initialize circuit breaker policy |
| 167 | `circuit-breaker-status` | Show circuit breaker status |
| 168 | `circuit-breaker-reset` | Reset all circuit breakers |
| 169 | `dead-letters` | Show dead letter queue |
| 170 | `mode` | Show or set degradation mode |
| 171 | `backpressure` | Show backpressure pipeline health |
| 172 | `slo` | Show governance SLO dashboard |
| 173 | `latency` | Show latency accounting report |
| 174 | `init` | Create and sign .amc/canon/canon.yaml |
| 175 | `verify` | Verify canonical compass content signature |
| 176 | `print` | Print effective Compass Canon |
| 177 | `init` | Create and sign .amc/cgx/policy.yaml |
| 178 | `build` | Build deterministic signed context graph |
| 179 | `verify` | Verify CGX policy/graph/pack signatures |
| 180 | `show` | Show latest CGX graph or agent context pack |
| 181 | `simulate` | Simulate impact propagation when a node changes |
| 182 | `diff` | Diff two CGX graph snapshots |
| 183 | `delta-to-l5` | Generate L4→L5 delta report showing what separates current state from L5 |
| 184 | `control-classification` | Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION) |
| 185 | `prompt` | Northstar prompt policy + pack operations |
| 186 | `init` | Create and sign .amc/prompt/policy.yaml |
| 187 | `verify` | Verify prompt policy, pack, lint and scheduler signatures |
| 188 | `policy` | Prompt policy operations |
| 189 | `print` | Print prompt policy |
| 190 | `apply` | Apply prompt policy from YAML file and sign |
| 191 | `status` | List per-agent prompt pack status |
| 192 | `pack` | Prompt pack artifact operations |
| 193 | `build` | Build and sign .amcprompt for an agent |
| 194 | `verify` | Verify .amcprompt signature and lint signature |
| 195 | `show` | Show provider-specific enforced system prompt |
| 196 | `diff` | Diff latest prompt pack against previous snapshot |
| 197 | `scheduler` | Prompt pack recurrence scheduler |
| 198 | `status` | Show prompt scheduler status |
| 199 | `run-now` | Run prompt scheduler now for one agent or all |
| 200 | `enable` | Enable prompt scheduler |
| 201 | `disable` | Disable prompt scheduler |
| 202 | `init` | Create and sign .amc/passport/policy.yaml |
| 203 | `verify-policy` | Verify signed passport policy |
| 204 | `policy` | Passport policy operations |
| 205 | `print` | Print effective passport policy |
| 206 | `apply` | Apply passport policy from JSON/YAML file |
| 207 | `create` | Create deterministic signed .amcpass artifact |
| 208 | `verify` | Verify .amcpass artifact offline |
| 209 | `show` | Show .amcpass as JSON or single-line badge |
| 210 | `badge` | Print deterministic single-line badge from latest cache |
| 211 | `export-latest` | Export latest passport for a scope to .amcpass |
| 212 | `share` | Generate shareable passport material |
| 213 | `compare` | Compare two agents by passport maturity dimensions |
| 214 | `generate` | Generate signed Open Compass schema bundle under .amc/standard/ |
| 215 | `verify` | Verify schema bundle signatures and manifest digests |
| 216 | `print` | Print one generated schema |
| 217 | `validate` | Validate a JSON file or AMC artifact against a standard schema |
| 218 | `schemas` | List generated schemas with digests |
| 219 | `bank` | Signed diagnostic 126-question bank operations |
| 220 | `init` | Create and sign .amc/diagnostic/bank/bank.yaml |
| 221 | `verify` | Verify diagnostic bank signature |
| 222 | `render` | Render contextualized 126-question diagnostic for an agent |
| 223 | `validate` | Validate structured agent output claims against deterministic truth constraints |
| 224 | `verify` | Verify encrypted blob index and payload integrity |
| 225 | `key` | Blob key management |
| 226 | `init` | Initialize encrypted blob key material |
| 227 | `rotate` | Rotate encrypted blob key material |
| 228 | `reencrypt` | Re-encrypt blob batch from one key version to another |
| 229 | `status` | Show retention/archive status |
| 230 | `run` | Run archival + payload prune lifecycle |
| 231 | `verify` | Verify archive manifests/signatures and ledger continuity |
| 232 | `create` | Create signed encrypted backup bundle |
| 233 | `verify` | Verify signed backup bundle offline |
| 234 | `restore` | Restore a verified backup into target directory |
| 235 | `print` | Print backup manifest summary |
| 236 | `stats` | Show DB/blob/archive/cache operational stats |
| 237 | `vacuum` | Run SQLite VACUUM + ANALYZE |
| 238 | `reindex` | Ensure operational SQLite indexes |
| 239 | `rotate-logs` | Rotate Studio logs based on ops policy |
| 240 | `prune-cache` | Prune dashboard/console/transform cache artifacts |
| 241 | `status` | Show configured metrics endpoint bind/port |
| 242 | `check` | Evaluate whether an action is allowed now (simulate vs execute) |
| 243 | `explain` | Explain policy requirements for an action class |
| 244 | `report` | Render matrix of current SIMULATE/EXECUTE allowance per ActionClass |
| 245 | `init` | Create and sign .amc/tools.yaml |
| 246 | `verify` | Verify tools.yaml signature |
| 247 | `list` | List allowed ToolHub tools and action classes |
| 248 | `create` | Create and sign a work order |
| 249 | `list` | List work orders for agent |
| 250 | `show` | Show signed work order JSON |
| 251 | `verify` | Verify work order signature |
| 252 | `expire` | Expire/revoke a work order |
| 253 | `issue` | Issue short-lived signed execution ticket |
| 254 | `verify` | Verify signed execution ticket |
| 255 | `init` | Create and sign .amc/gateway.yaml |
| 256 | `start` | Start local reverse-proxy gateway and signed evidence capture |
| 257 | `status` | Check gateway reachability and route URLs |
| 258 | `verify-config` | Verify .amc/gateway.yaml signature |
| 259 | `bind-agent` | Bind a gateway route prefix to an agent ID for deterministic attribution |
| 260 | `export` | Export a portable, signed evidence bundle for a run |
| 261 | `verify` | Verify evidence bundle offline |
| 262 | `inspect` | Inspect bundle metadata |
| 263 | `diff` | Diff two bundles (maturity/integrity/targets) |
| 264 | `export` | Export verifier-ready evidence (json|csv|pdf) |
| 265 | `audit-packet` | Generate external-auditor packet with verifier-ready evidence |
| 266 | `gate` | Evaluate a run bundle against a signed gate policy |
| 267 | `init` | Generate GitHub workflow and signed gate policy |
| 268 | `print` | Print suggested CI pipeline steps |
| 269 | `check` | One-liner CI gate: quickscore + threshold check (exit 1 if below) |
| 270 | `list` | List built-in archetype packs |
| 271 | `describe` | Describe an archetype |
| 272 | `apply` | Apply archetype context/targets/guardrails/evals to an agent |
| 273 | `policy` | Export framework-agnostic North Star policy integration pack |
| 274 | `badge` | Export deterministic maturity badge SVG for a run |
| 275 | `build` | Build responsive offline dashboard for an agent |
| 276 | `serve` | Serve dashboard locally |
| 277 | `list` | List available assurance packs |
| 278 | `describe` | Describe assurance pack details |
| 279 | `init` | Initialize signed assurance policy |
| 280 | `verify-policy` | Verify assurance policy signature |
| 281 | `policy` | Print current assurance policy |
| 282 | `policy-apply` | Apply assurance policy from YAML/JSON file |
| 283 | `run` | Run assurance pack(s) with deterministic validation |
| 284 | `runs` | List assurance lab runs |
| 285 | `show` | Show assurance run artifacts |
| 286 | `cert-issue` | Issue signed assurance certificate for a run |
| 287 | `cert-verify` | Verify assurance certificate bundle offline |
| 288 | `scheduler` | Assurance scheduler controls |
| 289 | `status` | Show scheduler status |
| 290 | `run-now` | Run assurance scheduler immediately |
| 291 | `enable` | Enable assurance scheduler |
| 292 | `disable` | Disable assurance scheduler |
| 293 | `waiver` | Assurance threshold waiver controls |
| 294 | `request` | Request time-limited readiness waiver (dual-control approval required) |
| 295 | `status` | Show waiver status (activates approved pending waivers) |
| 296 | `revoke` | Revoke active or specific waiver |
| 297 | `history` | List assurance run history |
| 298 | `verify` | Verify assurance run determinism and signatures |
| 299 | `patch` | Apply deterministic patch kit for failed assurance findings |
| 300 | `certify` | Issue signed, offline-verifiable certificate bundle |
| 301 | `generate` | Generate execution-proof trust certificate (signed PDF or JSON) |
| 302 | `verify` | Verify certificate bundle offline |
| 303 | `inspect` | Inspect certificate bundle contents |
| 304 | `revoke` | Create signed revocation file for a certificate |
| 305 | `verify-revocation` | Verify revocation file signature |
| 306 | `init` | Initialize encrypted vault for signing keys |
| 307 | `unlock` | Unlock vault into memory for signing operations |
| 308 | `lock` | Lock vault and clear in-memory private keys |
| 309 | `status` | Show vault status |
| 310 | `rotate-keys` | Rotate monitor signing key and append to public key history |
| 311 | `init` | Initialize AMC Notary config and signing backend |
| 312 | `start` | Start AMC Notary service (foreground) |
| 313 | `status` | Show notary backend and log status |
| 314 | `pubkey` | Print notary public key and fingerprint |
| 315 | `attest` | Generate signed notary runtime attestation bundle (.amcattest) |
| 316 | `verify-attest` | Verify a .amcattest bundle offline |
| 317 | `sign` | Sign a payload file using Notary (admin utility) |
| 318 | `log-verify` | Verify notary append-only signing log + seal signature |
| 319 | `init` | Create and sign .amc/trust.yaml |
| 320 | `enable-notary` | Enable fail-closed NOTARY trust mode |
| 321 | `status` | Show trust mode, signature status, and notary health |
| 322 | `freshness` | Report temporal trust freshness and half-life decay |
| 323 | `owner` | Switch to owner mode (configuration + signing allowed) |
| 324 | `agent` | Switch to agent mode (read-only / self-check commands) |
| 325 | `init` | Initialize signed users.yaml with first OWNER user |
| 326 | `add` | Add a user with RBAC roles |
| 327 | `list` | List RBAC users |
| 328 | `revoke` | Revoke a user account |
| 329 | `role` | Set user roles |
| 330 | `set` | Replace roles for a user |
| 331 | `verify` | Verify users.yaml signature |
| 332 | `init` | Create and sign host-level identity.yaml |
| 333 | `verify` | Verify identity.yaml signature |
| 334 | `provider` | Identity provider management |
| 335 | `add` | Add an identity provider |
| 336 | `mapping` | Signed group-to-role mapping rules |
| 337 | `add` | Add a group mapping rule |
| 338 | `token` | SCIM bearer token operations |
| 339 | `create` | Create a SCIM bearer token and store hash in host vault |
| 340 | `create` | Create one-time pairing code (LAN login pairing or agent bridge pairing) |
| 341 | `redeem` | Redeem pairing code for a lease token file |
| 342 | `init` | Initialize append-only transparency log |
| 343 | `verify` | Verify transparency chain + seal signature |
| 344 | `tail` | Tail transparency entries |
| 345 | `export` | Export transparency bundle |
| 346 | `verify-bundle` | Verify exported transparency bundle |
| 347 | `rebuild` | Rebuild Merkle leaves/roots from transparency log |
| 348 | `root` | Show current Merkle root and history |
| 349 | `prove` | Export signed inclusion proof bundle for entry hash |
| 350 | `verify-proof` | Verify signed inclusion proof bundle |
| 351 | `init` | Create and sign compliance-maps.yaml |
| 352 | `verify` | Verify compliance maps signature |
| 353 | `report` | Generate evidence-linked compliance report |
| 354 | `fleet` | Generate fleet compliance summary |
| 355 | `diff` | Diff two compliance report JSON files |
| 356 | `init` | Initialize federation identity and signed config |
| 357 | `verify` | Verify federation config signature |
| 358 | `peer` | Federation peer trust anchors |
| 359 | `add` | Add a peer publisher public key |
| 360 | `list` | List federation peers |
| 361 | `export` | Export offline federation sync package (.amcfed) |
| 362 | `import` | Import and verify federation package |
| 363 | `verify-bundle` | Verify .amcfed package |
| 364 | `init` | Create and sign integrations.yaml with vault-backed secret refs |
| 365 | `verify` | Verify integrations config signature |
| 366 | `status` | Show integration channels and routing |
| 367 | `test` | Dispatch deterministic test event to an integration channel |
| 368 | `dispatch` | Dispatch a deterministic integration event |
| 369 | `export-journal` | Export integration delivery journal (receipts + dead letters) |
| 370 | `init` | Create and sign outcome contract |
| 371 | `verify` | Verify outcome contract signature |
| 372 | `report` | Generate outcomes report (agent) or fleet outcomes report |
| 373 | `diff` | Diff two outcome reports |
| 374 | `attest` | Record manual attested outcome signal |
| 375 | `init` | Initialize signed value policy, default contract, and scheduler |
| 376 | `verify-policy` | Verify signed value policy |
| 377 | `policy` | Value policy operations |
| 378 | `contract` | Value contract operations |
| 379 | `scheduler` | Value scheduler controls |
| 380 | `print` | Print effective value policy JSON |
| 381 | `default` | Print default value policy JSON |
| 382 | `apply` | Apply signed value policy from YAML/JSON file |
| 383 | `init` | Create and sign value contract template |
| 384 | `apply` | Apply value contract from YAML/JSON file |
| 385 | `verify` | Verify value contract signature |
| 386 | `print` | Print value contract and signature status |
| 387 | `ingest` | Ingest value webhook payload JSON |
| 388 | `import` | Import numeric KPI points from CSV (ts,value) |
| 389 | `snapshot` | Generate/load latest signed value snapshot |
| 390 | `report` | Generate signed value report |
| 391 | `status` | Show value scheduler status |
| 392 | `run-now` | Run value scheduler now |
| 393 | `enable` | Enable value scheduler |
| 394 | `disable` | Disable value scheduler |
| 395 | `verify` | Verify value workspace signatures/artifacts |
| 396 | `init` | Create and sign forecast policy |
| 397 | `verify` | Verify forecast policy signature |
| 398 | `print-policy` | Print effective forecast policy |
| 399 | `latest` | Render latest forecast for scope |
| 400 | `refresh` | Refresh forecast snapshot for scope |
| 401 | `scheduler` | Forecast renewal scheduler controls |
| 402 | `status` | Show scheduler status |
| 403 | `run-now` | Run scheduler refresh immediately |
| 404 | `enable` | Enable forecast scheduler |
| 405 | `disable` | Disable forecast scheduler |
| 406 | `policy` | Forecast policy operations |
| 407 | `apply` | Apply and sign forecast policy from file |
| 408 | `default` | Print default forecast policy JSON |
| 409 | `list` | List advisories for scope |
| 410 | `show` | Show one advisory by ID |
| 411 | `ack` | Acknowledge an advisory |
| 412 | `init` | Create a signed casebook |
| 413 | `add` | Add signed case from existing workorder |
| 414 | `list` | List casebooks |
| 415 | `verify` | Verify signed casebook and case files |
| 416 | `create` | Create an experiment |
| 417 | `set-baseline` | Set experiment baseline config |
| 418 | `set-candidate` | Set experiment candidate signed config overlay |
| 419 | `run` | Run deterministic experiment against signed casebook |
| 420 | `analyze` | Analyze latest experiment run |
| 421 | `gate` | Evaluate latest experiment run against gate policy |
| 422 | `gate-template` | Write an experiment gate policy template |
| 423 | `list` | List experiments |
| 424 | `fix-signatures` | Verify and re-sign gateway/fleet/agent configs |
| 425 | `init` | Initialize recurring loop config |
| 426 | `run` | Run recurring diagnostic + assurance + dashboard + snapshot |
| 427 | `plan` | Print recurring loop plan |
| 428 | `schedule` | Print OS scheduler config (no automatic installation) |
| 429 | `snapshot` | Generate Unified Clarity Snapshot markdown |
| 430 | `indices` | Compute deterministic failure-risk indices |
| 431 | `fleet` | Compute failure-risk indices across fleet |
| 432 | `fleet` | Fleet operations |
| 433 | `agent` | Agent registry operations |
| 434 | `provider` | Provider template operations |
| 435 | `sandbox` | Hardened sandbox execution |
| 436 | `init` | Create and sign .amc/fleet.yaml |
| 437 | `report` | Generate fleet maturity report (md) or fleet compliance report (pdf) |
| 438 | `health` | Show fleet health dashboard aggregates |
| 439 | `policy` | Fleet governance policy operations |
| 440 | `slo` | Fleet governance SLO operations |
| 441 | `apply` | Apply a governance policy to all fleet agents or one environment |
| 442 | `list` | List effective fleet governance policies |
| 443 | `tag` | Tag an agent with an environment |
| 444 | `define` |  |
| 445 | `status` | Show fleet SLO compliance status |
| 446 | `list` | List fleet SLO definitions |
| 447 | `trust-init` | Initialize trust composition config |
| 448 | `trust-add-edge` | Add a delegation edge (orchestrator → worker) |
| 449 | `trust-remove-edge` | Remove a delegation edge |
| 450 | `trust-edges` | List all delegation edges |
| 451 | `trust-report` | Generate trust composition report across fleet |
| 452 | `trust-receipts` | Verify cross-agent receipt chains |
| 453 | `dag` | Visualize orchestration delegation graph |
| 454 | `trust-mode` | Set trust inheritance policy mode |
| 455 | `handoff` | Manage handoff packets |
| 456 | `contradictions` | Detect cross-agent contradictions |
| 457 | `add` | Interactively add an agent to the fleet |
| 458 | `list` | List fleet agents |
| 459 | `remove` | Remove an agent from the fleet |
| 460 | `use` | Set current agent |
| 461 | `diagnose` | Lease-auth self-run diagnostic (agent-triggered, evidence-scored server-side) |
| 462 | `list` | List provider templates |
| 463 | `add` | Assign or update provider template for an agent |
| 464 | `run` | Run agent command in hardened Docker sandbox |
| 465 | `ingest` | Ingest external logs/transcripts as SELF_REPORTED evidence |
| 466 | `attest` | Auditor-attest an ingest session to upgrade trust tier to ATTESTED |
| 467 | `set` | Interactive equalizer wizard |
| 468 | `verify` | Verify target profile signature |
| 469 | `diff` | Diff run against target profile |
| 470 | `learn` | Education flow for a specific maturity question |
| 471 | `lineage-init` | Initialize governance lineage tables |
| 472 | `lineage-report` | Generate governance lineage report |
| 473 | `lineage-claim` | Show full governance lineage for a specific claim |
| 474 | `lineage-policy-intents` | List all policy change intents for an agent |
| 475 | `claim-confidence` | Generate per-claim confidence report with citation-backed scoring |
| 476 | `claim-confidence-gate` | Check if claims for given questions pass confidence threshold |
| 477 | `overhead-report` | Generate per-feature overhead accounting report |
| 478 | `overhead-profile` | Set the overhead mode profile (STRICT, BALANCED, LEAN) |
| 479 | `micro-canary-run` | Run all micro-canary probes immediately |
| 480 | `micro-canary-report` | Generate micro-canary status report |
| 481 | `micro-canary-alerts` | Show active micro-canary alerts |
| 482 | `experiment-architecture` | Run a controlled architecture comparison experiment |
| 483 | `experiment-architecture-probes` | List the standard probe set for architecture experiments |
| 484 | `canary-start` | Start a policy canary with candidate vs stable policy |
| 485 | `canary-status` | Show current canary status and stats |
| 486 | `canary-stop` | Stop the active canary |
| 487 | `canary-report` | Generate full policy canary report |
| 488 | `rollback-create` | Create a rollback pack from the current policy file |
| 489 | `emergency-override` | Activate an emergency policy override with strict TTL |
| 490 | `policy-debt-add` | Register a temporary policy waiver (debt) |
| 491 | `policy-debt-list` | List active policy debt entries |
| 492 | `governance-drift` | Detect governance drift for an agent |
| 493 | `cgx-integrity` | Run graph integrity check on CGX with semantic overlay |
| 494 | `cgx-propagation` | Simulate risk propagation from a source node |
| 495 | `memory-extract` | Extract lessons from verified effective corrections |
| 496 | `memory-advisories` | Show advisories from correction memory for prompt injection |
| 497 | `memory-report` | Generate correction memory report |
| 498 | `memory-expire` | Expire stale lessons past their TTL |
| 499 | `own` | Ownership flow for top maturity gaps |
| 500 | `commit` | Commitment plan flow (7/14/30-day checklist) |
| 501 | `tune` | Mechanic mode tuning wizard |
| 502 | `upgrade` | Generate upgrade plan |
| 503 | `guard` | Guard check proposed output from stdin |
| 504 | `lease` | Issue/verify/revoke short-lived agent leases |
| 505 | `issue` |  |
| 506 | `verify` |  |
| 507 | `revoke` |  |
| 508 | `budgets` | Signed autonomy and usage budgets |
| 509 | `init` |  |
| 510 | `verify` |  |
| 511 | `status` |  |
| 512 | `reset` |  |
| 513 | `drift` | Drift/regression detection and reporting |
| 514 | `check` |  |
| 515 | `report` |  |
| 516 | `freeze` | Execution freeze status and controls |
| 517 | `status` |  |
| 518 | `lift` |  |
| 519 | `alerts` | Signed drift alert configuration and dispatch |
| 520 | `init` |  |
| 521 | `verify` |  |
| 522 | `test` |  |
| 523 | `bom` | Maturity Bill of Materials |
| 524 | `generate` |  |
| 525 | `sign` |  |
| 526 | `verify` |  |
| 527 | `approvals` | Signed approval inbox operations |
| 528 | `list` |  |
| 529 | `show` |  |
| 530 | `approve` |  |
| 531 | `deny` |  |
| 532 | `whatif` | Equalizer what-if simulator |
| 533 | `targets` |  |
| 534 | `equalizer` |  |
| 535 | `transform` | Transformation OS (4C plans, tracking, attestations) |
| 536 | `init` | Initialize signed .amc/transform-map.yaml |
| 537 | `verify` | Verify signed transform map |
| 538 | `map` | Inspect or apply transform map |
| 539 | `show` |  |
| 540 | `apply` |  |
| 541 | `plan` |  |
| 542 | `status` |  |
| 543 | `track` |  |
| 544 | `report` |  |
| 545 | `attest` |  |
| 546 | `attest-verify` |  |
| 547 | `org` | Org graph and real-time comparative scorecards |
| 548 | `init` |  |
| 549 | `verify` | Verify signed org.yaml |
| 550 | `add` |  |
| 551 | `node` |  |
| 552 | `assign` |  |
| 553 | `unassign` |  |
| 554 | `score` |  |
| 555 | `report` |  |
| 556 | `compare` |  |
| 557 | `learn` |  |
| 558 | `own` |  |
| 559 | `commit` |  |
| 560 | `init` | Initialize signed audit policy and compliance maps |
| 561 | `verify-policy` | Verify signed audit policy |
| 562 | `export` | Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor |
| 563 | `policy` | Audit binder policy operations |
| 564 | `map` | Audit compliance map operations |
| 565 | `binder` | Audit binder artifact operations |
| 566 | `request` | Audit evidence request operations |
| 567 | `scheduler` | Audit binder cache scheduler |
| 568 | `print` | Print effective audit policy |
| 569 | `apply` | Apply and sign audit policy from file |
| 570 | `list` | List builtin/active audit maps |
| 571 | `show` | Show audit map |
| 572 | `apply` | Apply active audit map from file |
| 573 | `verify` | Verify builtin and active map signatures |
| 574 | `create` | Create deterministic signed .amcaudit artifact |
| 575 | `verify` | Verify .amcaudit file |
| 576 | `list` | List exported binders and cached workspace binder |
| 577 | `export-request` | Create dual-control approval request for external binder sharing |
| 578 | `export-execute` | Execute previously approved external binder export |
| 579 | `create` | Create auditor evidence request |
| 580 | `list` | List audit evidence requests |
| 581 | `approve` | Owner approves request (starts dual-control approval flow) |
| 582 | `reject` | Reject evidence request |
| 583 | `fulfill` | Fulfill approved evidence request by exporting restricted binder |
| 584 | `status` | Show audit scheduler status |
| 585 | `run-now` | Run audit binder cache refresh immediately |
| 586 | `enable` | Enable audit scheduler |
| 587 | `disable` | Disable audit scheduler |
| 588 | `verify` | Verify audit workspace signatures/artifacts |
| 589 | `bench` | Public benchmark registry + ecosystem comparative view |
| 590 | `init` | Initialize signed bench policy |
| 591 | `verify-policy` | Verify signed bench policy |
| 592 | `print-policy` | Print effective bench policy |
| 593 | `create` | Create deterministic signed .amcbench artifact |
| 594 | `verify` | Verify .amcbench artifact offline |
| 595 | `print` | Print bench manifest summary without modification |
| 596 | `registry` | Manage static bench registries |
| 597 | `init` |  |
| 598 | `publish` |  |
| 599 | `verify` |  |
| 600 | `serve` |  |
| 601 | `search` | Browse a bench registry index |
| 602 | `import` | Import one bench artifact from allowlisted registry |
| 603 | `list-imports` | List imported bench artifacts |
| 604 | `list-exports` | List locally exported bench artifacts |
| 605 | `compare` | Compute local vs imported ecosystem comparison |
| 606 | `comparison-latest` | Read latest bench comparison artifact |
| 607 | `registries` | Print signed bench registry allowlist |
| 608 | `registries-apply` | Apply bench registries config from JSON file |
| 609 | `publish` | Dual-control bench publish flow |
| 610 | `request` |  |
| 611 | `execute` |  |
| 612 | `benchmark` | Signed ecosystem benchmark snapshots |
| 613 | `export` |  |
| 614 | `verify` |  |
| 615 | `ingest` |  |
| 616 | `list` |  |
| 617 | `report` |  |
| 618 | `stats` |  |
| 619 | `mechanic` | Mechanic Workbench (targets, plans, simulation) |
| 620 | `init` |  |
| 621 | `targets` | Manage signed equalizer targets |
| 622 | `init` |  |
| 623 | `set` |  |
| 624 | `apply` |  |
| 625 | `print` |  |
| 626 | `verify` |  |
| 627 | `profile` | Apply one-click signed target profiles |
| 628 | `list` |  |
| 629 | `apply` |  |
| 630 | `verify` |  |
| 631 | `tuning` | Manage signed mechanic tuning intent |
| 632 | `init` |  |
| 633 | `set` |  |
| 634 | `apply` |  |
| 635 | `print` |  |
| 636 | `verify` |  |
| 637 | `gap` |  |
| 638 | `plan` | Create, diff, approve, and execute upgrade plans |
| 639 | `create` |  |
| 640 | `show` |  |
| 641 | `diff` |  |
| 642 | `request-approval` |  |
| 643 | `execute` |  |
| 644 | `simulate` |  |
| 645 | `simulations` | Show latest signed simulation artifact |
| 646 | `verify` | Verify mechanic signatures and artifacts |
| 647 | `init` | Initialize AMC release signing keypair |
| 648 | `pack` | Build a signed deterministic .amcrelease bundle |
| 649 | `verify` | Verify a .amcrelease bundle offline |
| 650 | `sbom` | Generate deterministic CycloneDX SBOM |
| 651 | `licenses` | Generate dependency license inventory |
| 652 | `provenance` | Generate AMC provenance record |
| 653 | `scan` | Run strict secret scan on a .amcrelease bundle |
| 654 | `print` | Print release bundle manifest summary |
| 655 | `e2e` | End-to-end smoke verification |
| 656 | `smoke` | Run go-live smoke tests: local, docker, or helm-template |
| 657 | `_studio-daemon` |  |
| 658 | `lab-templates` | List available experiment templates |
| 659 | `lab-create` | Create a new lab experiment |
| 660 | `lab-simulate` | Simulate running all probes for an experiment |
| 661 | `lab-report` | Generate a lab experiment report |
| 662 | `lab-compare` | Compare two lab experiments |
| 663 | `lab-list` | List all lab experiments |
| 664 | `insider-risk-report` | Generate insider risk analytics report |
| 665 | `insider-alerts` | Show insider risk alerts |
| 666 | `insider-risk-scores` | Show insider risk scores by actor |
| 667 | `attestation-export` | Export attestation bundle for external auditors |
| 668 | `fp-submit` | Submit a false positive report for an assurance scenario |
| 669 | `fp-resolve` | Resolve a false positive report |
| 670 | `fp-list` | List false positive reports |
| 671 | `fp-cost` | Show false positive cost summary |
| 672 | `fp-tuning-report` | Generate false positive tuning report with recommendations |
| 673 | `wiring-status` | Show production wiring status for all modules (Items 11-16) |
| 674 | `python-sdk` | Generate the Python SDK package for AMC Bridge API |
| 675 | `residency-policy` | Create or list data residency policies |
| 676 | `tenant-register` | Register a tenant boundary |
| 677 | `tenant-isolation-check` | Check tenant isolation between all registered tenants |
| 678 | `legal-hold` | Issue or manage legal holds |
| 679 | `redaction-test` | Run privacy redaction tests against built-in rules |
| 680 | `residency-report` | Generate data residency compliance report for a tenant |
| 681 | `key-custody-modes` | List available key custody modes and their configurations |
| 682 | `operator-dashboard` | Generate operator dashboard showing why questions are capped and how to unlock |
| 683 | `why-capped` | Show why each question is capped at its current level |
| 684 | `action-queue` | Show prioritized actions sorted by risk-reduction-per-effort |
| 685 | `confidence-heatmap` | Display confidence heatmap by question and layer |
| 686 | `role-presets` | List available dashboard role presets |
| 687 | `integrate` | Generate integration scaffold for a framework |
| 688 | `integrate-list` | List available integration frameworks |
| 689 | `contract-tests` | Generate and display contract test suite for bridge API |
| 690 | `simulate-bridge` | Run a simulated bridge request for local testing |
| 691 | `openapi-generate` | Generate live OpenAPI spec (Studio + Bridge + Gateway) |
| 692 | `limits` | Show current plugin sandbox resource limits |
| 693 | `code-scan` | Scan repository for semantic code edges |
| 694 | `claims-stale` | List stale claims for an agent |
| 695 | `claims-sweep` | Process all stale claims for an agent (auto-demote to PROVISIONAL) |
| 696 | `confidence-drift` | Track confidence drift per question across diagnostic runs |
| 697 | `lessons-list` | List lessons learned from corrections |
| 698 | `lessons-promote` | Promote a correction to a reusable lesson |
| 699 | `corrections-verify-closure` | Show open feedback loops that need closure |
| 700 | `receipts-chain` | Show full delegation chain for a receipt |
| 701 | `policy-canary-start` | Start policy canary mode (observation-only) |
| 702 | `policy-canary-report` | Generate canary mode report for an agent |
| 703 | `debt-add` | Add a policy debt entry (waiver/override/exception) |
| 704 | `debt-list` | List policy debt entries |
| 705 | `governor-override` | Activate an emergency governance override with TTL |
| 706 | `governor-override-alerts` | Show alerts for active/expired overrides |
| 707 | `community` | Community/platform governance scoring |
| 708 | `init` |  |
| 709 | `score` |  |
| 710 | `capabilities-add` | Add capability declaration to agent passport |
| 711 | `search` | Search agents by capability and minimum maturity level |
| 712 | `link` | Link agent passport to external platform identity |
| 713 | `unknowns` |  |
| 714 | `meta-confidence` | Report confidence in the maturity score itself |
| 715 | `confidence-check` | Check if action is allowed given confidence-adjusted maturity |
| 716 | `confidence-components` | Show per-component confidence breakdown |
| 717 | `shield` | Threat detection and security scanning |
| 718 | `analyze <path>` | Run static code analyzer on a skill file |
| 719 | `sandbox <agentId>` | Check sandbox configuration for an agent |
| 720 | `sbom <path>` | Generate software bill of materials from package.json |
| 721 | `reputation <toolId>` | Check reputation score for a tool |
| 722 | `conversation-integrity <agentId>` | Check conversation integrity for an agent (demo) |
| 723 | `threat-intel <input>` | Check threat intelligence for an input |
| 724 | `detect-injection <text>` | Detect prompt injection attempts in text |
| 725 | `sanitize <text>` | Sanitize text — strip XSS, injection, and dangerous patterns |
| 726 | `enforce` | Policy enforcement and guardrails |
| 727 | `check <agentId> <tool> <action>` | Check policy for an agent action |
| 728 | `exec-guard <cmd>` | Check if a command is safe to execute |
| 729 | `ato-detect <agentId>` | Detect account takeover attempts (demo) |
| 730 | `numeric-check <value> <min> <max>` | Validate a numeric value within bounds |
| 731 | `taint <input>` | Track tainted input through the system |
| 732 | `blind-secrets <text>` | Redact secrets from text |
| 733 | `watch` | Observability, attestation, and safety testing |
| 734 | `attest <output>` | Attest an agent output |
| 735 | `explain <agentId> <runId>` | Generate explainability packet for an agent run |
| 736 | `safety-test <agentId>` | Run safety tests for an agent |
| 737 | `host-hardening` | Check host hardening status for this AMC deployment |
| 738 | `product` | Product operations: routing, autonomy, metering, workflows |
| 739 | `route <taskType>` | Route a task to the best model/provider |
| 740 | `autonomy <agentId> <mode>` | Decide autonomy level for an agent |
| 741 | `loop-detect <agentId>` | Detect infinite loops in agent behavior |
| 742 | `metering <agentId>` | Show metering and billing for an agent |
| 743 | `retry <cmd>` | Execute a command with retry logic |
| 744 | `plan <goal>` | Generate an execution plan for a goal |
| 745 | `workflow` | Workflow management |
| 746 | `create <name>` | Create a new workflow |
| 747 | `rag-guard <input>` | Guard RAG chunks against injection |
| 748 | `classify <text>` | Classify data sensitivity level |
| 749 | `scrub <file>` | Scrub metadata from a file |
| 750 | `dsar-status` | Show DSAR (Data Subject Access Request) status |
| 751 | `privacy-budget <agentId>` | Check privacy budget for an agent |
| 752 | `glossary` | Domain terminology management |
| 753 | `domain` | Domain-specific architecture and compliance operations |
| 754 | `features` | List product features |
| 755 | `features-recommended` | Show top recommended product features |
| 756 | `define <term> <definition>` | Define a glossary term |
| 757 | `lookup <term>` | Look up a glossary term |
| 758 | `list` | List all 7 domains with metadata |
| 759 | `assess` | Run full domain assessment |
| 760 | `modules` | Show module activation map for domain |
| 761 | `gaps` | Show compliance gaps for an agent and domain |
| 762 | `report` | Build full domain report and write it to a file |
| 763 | `assurance` | Run domain-specific assurance packs |
| 764 | `roadmap` | Generate 30/60/90-day roadmap for this domain |
| 765 | `score` | Maturity scoring, adversarial testing, and evidence collection |
| 766 | `formal-spec <agentId>` | Compute formal maturity score for an agent |
| 767 | `adversarial <agentId>` | Test gaming resistance of scoring |
| 768 | `collect-evidence <agentId>` | Collect evidence for scoring an agent |
| 769 | `production-ready <agentId>` | Run production readiness gate for an agent |
| 770 | `operational-independence <agentId>` | Calculate operational independence score |
| 771 | `evidence-coverage <agentId>` | Show automated vs manual evidence coverage |
| 772 | `lean-profile` | Show lean AMC profile |
| 773 | `behavioral-contract` | Score agent behavioral contract maturity (alignment card, permitted/forbidden actions) |
| 774 | `fail-secure` | Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection) |
| 775 | `output-integrity` | Score output integrity maturity (OWASP LLM02, confidence calibration, citation) |
| 776 | `state-portability` | Score agent state portability (vendor-neutral format, serialization, integrity on transfer) |
| 777 | `eu-ai-act` | Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk) |
| 778 | `owasp-llm` | Score OWASP LLM Top 10 coverage (all 10 risks) |
| 779 | `regulatory-readiness` | Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP) |
| 780 | `self-knowledge` | Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation) |
| 781 | `kernel-sandbox` | Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions) |
| 782 | `runtime-identity` | Score runtime execution identity maturity (JIT credentials, user propagation, revocation) |
| 783 | `calibration-gap` | Measure delta between agent self-reported confidence and observed behavior |
| 784 | `evidence-conflict` | Measure internal consistency of evidence — detect conflicting signals |
| 785 | `density-map` | Heatmap of evidence density per question per dimension — reveals blind spots |
| 786 | `evidence-ingest` | Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom) |
| 787 | `level-transition` | Track formal promotion/demotion events with evidence gates |
| 788 | `gaming-resistance` | Test whether adversarial evidence injection can inflate scores |
| 789 | `sleeper-detection` | Detect context-dependent behavioral inconsistencies |
| 790 | `audit-depth` | Score audit trail depth and completeness |
| 791 | `policy-consistency` | Test policy enforcement consistency across repeated trials (pass^k) |
| 792 | `autonomy-duration` | Track time between human checkpoints with domain risk profiles |
| 793 | `pause-quality` | Score quality of agent-initiated pauses |
| 794 | `task-horizon` | Score task-completion time horizon (METR-inspired) |
| 795 | `factuality` | Score factuality across parametric, retrieval, and grounded dimensions |
| 796 | `alignment-index` | Compute composite alignment index |
| 797 | `interpretability` | Score structural transparency and explainability |
| 798 | `faithfulness` | Score how well LLM output is grounded in provided context |
| 799 | `memory-integrity` | Score memory correction persistence and poisoning resistance |
| 800 | `output-attestation` | Score output signing and trust metadata for receiving agents |
| 801 | `mutual-verification` | Score agent-to-agent trust verification (challenge-response) |
| 802 | `transparency-log` | Score network transparency log (Merkle tree, inclusion proofs) |
| 803 | `memory` | Memory maturity assessment and management |
| 804 | `assess <agentId>` | Full memory maturity assessment |
| 805 | `oversight` | Human oversight quality assessment |
| 806 | `assess <agentId>` | Assess human oversight quality |
| 807 | `classify` | Classify agent vs workflow |
| 808 | `agent <agentId>` | Classify whether system is workflow or agent |
| 809 | `claims` | Evidence claim expiry tracking |
| 810 | `list <agentId>` | List all evidence claims with TTL status |
| 811 | `dag` | Orchestration DAG capture and scoring |
| 812 | `capture <agents...>` | Capture orchestration DAG for agents |
| 813 | `score` | Score DAG governance |
| 814 | `confidence` | Confidence drift tracking |
| 815 | `calibration` | Show calibration report |
| 816 | `drift` | Show drift trend |
| 817 | `tier` | Run tiered maturity assessment (quick/standard/deep) |
| 818 | `scan` | Zero-integration agent assessment scanner |
| 819 | `guardrails` | Simple guardrail management |
| 820 | `list` | List all available guardrails with status |
| 821 | `enable <name>` | Enable a guardrail |
| 822 | `disable <name>` | Disable a guardrail |
| 823 | `profile <name>` | Apply a guardrail profile (minimal, standard, strict, healthcare, financial) |
| 824 | `playground` | Interactive scenario runner |
| 825 | `run` | Run all demo scenarios |
| 826 | `list` | List available scenarios |
| 827 | `open` | Build and serve dashboard at localhost:3210 |
| 828 | `vibe-audit` | Run static safety checks for AI-generated code |
| 829 | `quickstart` | 2-minute quickstart with Quick Score assessment |
| 830 | `debug` | Structured evidence debug stream for an agent |
| 831 | `api` | REST API management |
| 832 | `status` | Show API integration status |
| 833 | `run <type>` | Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract) |
| 834 | `harness` | Run the autonomous improvement harness loop |
| 835 | `demo` | Run interactive demos of AMC capabilities |
| 836 | `gap` | The 84-point documentation inflation gap — keyword vs execution scoring |
| 837 | `run` | Run a simulated agent through the AMC gateway and produce a real score (~30s) |
| 838 | `fix` | Generate remediation patches for identified gaps (auto-fix mode) |
| 839 | `redteam` | Run red-team attack simulations against a target agent |
| 840 | `run [agentId]` | Execute red-team plugins with chosen attack strategies and generate a vulnerability report |
| 841 | `strategies` | List available attack strategies |
| 842 | `plugins` | List available attack plugins (assurance packs) |

### Command Details

#### `amc init`

Initialize .amc workspace

| Option | Description |
|--------|-------------|
| `--trust-boundary <mode>` | isolated|shared |

#### `amc doctor`

Check runtime availability and wrap readiness

| Option | Description |
|--------|-------------|
| `--json` | emit structured JSON output |

#### `amc doctor-fix`

Auto-repair common setup issues

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview fixes without applying |
| `--json` | Emit structured JSON output |

#### `amc improve`

Guided improvement — shows what to fix next based on your current score

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |

#### `amc guide`

Generate personalized improvement guide with exportable agent instructions

| Option | Description |
|--------|-------------|
| `--target <level>` | target maturity level (1-5) |
| `--export` | export markdown files to .amc/guides/ |
| `--agent-instructions` | export agent-consumable instructions (for AGENTS.md / system prompts) |
| `--guardrails` | generate operational guardrails (rules, not suggestions) |
| `--apply [file]` | apply guardrails directly to agent config file (auto-detects or specify path) |
| `--interactive` | mechanic mode — choose which gaps to fix |
| `--watch` | continuous monitoring — re-generate guide on trust drift |
| `--watch-interval <seconds>` | interval for watch mode in seconds |
| `--diff` | show what changed since last guide generation |
| `--frameworks` | list all supported frameworks |
| `--ci` | CI gate mode — exit non-zero if below --target level |
| `--dry-run` | preview --apply changes without writing files |
| `--quick` | instant guide from defaults — no interactive questions |
| `--auto-detect` | auto-detect framework from project files |
| `--status` | one-line status: current level, gap count, severities |
| `--go` | all-in-one: quick + auto-detect + export + apply (zero friction) |
| `--compliance [frameworks]` | generate compliance guardrails (EU_AI_ACT,ISO_42001,NIST_AI_RMF,SOC2,ISO_27001 or  |
| `--agent <id>` | agent ID |
| `--framework <name>` | framework name for tailored instructions |
| `--json` | emit JSON output |

#### `amc quickscore`

Zero-config rapid assessment — auto-scores from evidence, or interactive 5-question fallback

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |
| `--quiet` | suppress non-JSON output (use with --json for clean piping) |
| `--eu-ai-act` | show EU AI Act risk classification mapping |
| `--auto` | auto-score from ledger evidence (no questions asked) |
| `--agent <agentId>` | agent ID for auto mode |

#### `amc explain <questionId>`

Plain-English explanation for a diagnostic question (example: AMC-2.1)

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |

#### `amc bootstrap`

Bootstrap workspace for production deployment (non-interactive)

| Option | Description |
|--------|-------------|
| `--workspace <path>` | workspace directory (defaults to AMC_WORKSPACE_DIR or cwd) |

#### `amc user`

Host user management

| Option | Description |
|--------|-------------|
| `--host-admin` | grant host-admin privileges |

#### `amc migrate`

Migrate an existing single-workspace AMC directory into host mode

| Option | Description |
|--------|-------------|
| `--move` | move source directory instead of copying |
| `--username <username>` | host username to grant OWNER+AUDITOR in migrated workspace |
| `--name <name>` | workspace display name |

#### `amc print`

Print resolved runtime config (secret-safe)

| Option | Description |
|--------|-------------|
| `--json` | emit JSON |

#### `amc explain`

Explain config source precedence and risky settings

| Option | Description |
|--------|-------------|
| `--json` | emit JSON |

#### `amc logs`

Print latest AMC Studio logs

| Option | Description |
|--------|-------------|
| `--lines <n>` | lines per log file |

#### `amc start`

Start Studio in foreground (non-interactive, deployment-safe)

| Option | Description |
|--------|-------------|
| `--workspace <path>` | workspace directory (defaults to AMC_WORKSPACE_DIR) |
| `--bind <host>` | api bind host override |
| `--port <port>` | api port override |
| `--dashboard-port <port>` | dashboard port override |

#### `amc healthcheck`

Health/readiness probe for deployment runtime

| Option | Description |
|--------|-------------|
| `--workspace <path>` | workspace directory (defaults to AMC_WORKSPACE_DIR) |

#### `amc enable`

Enable LAN mode with pairing gate

| Option | Description |
|--------|-------------|
| `--bind <host>` | bind address |
| `--port <port>` | port |
| `--cidr <cidr...>` | allowed CIDRs |

#### `amc connect`

Connect wizard for any agent/provider runtime

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--adapter <adapterId>` | adapter ID (e.g. claude-cli, gemini-cli, generic-cli) |
| `--token-file <path>` | lease token file (pair redeem output) |
| `--bridge-url <url>` | bridge base URL (e.g. http://127.0.0.1:3212) |
| `--mode <mode>` | supervise|sandbox |
| `--print-env` | print environment export lines |
| `--print-cmd` | print only command line |

#### `amc configure`

Set adapter profile for an agent (signed adapters.yaml)

| Option | Description |
|--------|-------------|
| `--mode <mode>` | SUPERVISE|SANDBOX |

#### `amc env`

Print adapter-compatible environment exports without lease token

| Option | Description |
|--------|-------------|
| `--adapter <adapterId>` | adapter ID override |

#### `amc init-project`

Generate runnable local adapter sample for library-based frameworks

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--route <route>` | gateway route override (e.g. /openai) |

#### `amc run`

Run adapter with minted lease, routed through gateway, with observed evidence capture

| Option | Description |
|--------|-------------|
| `--adapter <adapterId>` | adapter ID |
| `--workorder <workOrderId>` | work order ID |
| `--mode <mode>` | SUPERVISE|SANDBOX |

#### `amc verify`

Verify plugin package signature + artifact hashes

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | override publisher public key path |

#### `amc init`

Initialize local signed plugin registry directory

| Option | Description |
|--------|-------------|
| `--registry-id <id>` | registry id |
| `--registry-name <name>` | registry display name |

#### `amc serve`

Serve plugin registry over local HTTP

| Option | Description |
|--------|-------------|
| `--host <host>` | bind host |
| `--port <port>` | bind port |

#### `amc search`

Search a plugin registry by id/fingerprint

| Option | Description |
|--------|-------------|
| `--query <text>` | query text |

#### `amc install`

Request plugin install (requires SECURITY dual-control approval)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent id (defaults to current) |

#### `amc upgrade`

Request plugin upgrade (requires SECURITY dual-control approval)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent id (defaults to current) |

#### `amc remove`

Request plugin removal (requires SECURITY dual-control approval)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent id (defaults to current) |

#### `amc wrap`

Wrap runtime and capture tamper-evident evidence

| Option | Description |
|--------|-------------|
| `--agent-token <file>` | lease token file from `amc pair redeem` |
| `--name <agentName>` | agent process display name |
| `--provider <provider>` | auto|claude|gemini|openclaw|generic |
| `--bridge-url <url>` | bridge base URL |

#### `amc supervise`

Supervise any agent process and inject gateway/proxy routing env vars

| Option | Description |
|--------|-------------|
| `--provider-route <routeBase>` | gateway route base URL (deprecated alias of --route) |
| `--route <routeBase>` | gateway route base URL |
| `--proxy <proxyUrl>` | gateway proxy URL (HTTP/HTTPS proxy) |

#### `amc start`

Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent ID to monitor |
| `--scoring-interval <ms>` | Scoring interval in milliseconds |
| `--drift-interval <ms>` | Drift check interval in milliseconds |
| `--score-drop-threshold <n>` | Score drop alert threshold (0-1) |
| `--no-webhooks` | Disable webhook notifications |

#### `amc status`

Show monitoring status for all agents

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc events`

Show recent monitoring events

| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of events to show |
| `--json` | Output as JSON |

#### `amc metrics`

Get metrics for a specific agent

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent ID |
| `--json` | Output as JSON |
| `--runtime <name>` | runtime name |
| `--stdin` | capture stdin stream |

#### `amc run`

Run maturity diagnostic

| Option | Description |
|--------|-------------|
| `--window <window>` | evidence window |
| `--target <name>` | target profile name |
| `--output <path>` | markdown report path |
| `--claim-mode <mode>` | auto|owner|harness |
| `--harness-runtime <name>` | runtime for harness mode |

#### `amc report`

Render report for run ID

| Option | Description |
|--------|-------------|
| `--executive` | Generate executive summary (board-friendly) |
| `--html <path>` | Export styled HTML report (print to PDF from browser) |

#### `amc all`

Verify trust/policies/plugins/logs/ledger/artifacts in one pass

| Option | Description |
|--------|-------------|
| `--json` | emit JSON |

#### `amc toctou`

Run TOCTOU assurance pack

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc compound-threats`

Run compound threat assurance pack

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc shutdown-compliance`

Run shutdown compliance pack

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc advanced-threats`

Run advanced threats assurance pack

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc import`

Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse) into signed AMC evidence

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (defaults to active agent) |
| `--trust-tier <tier>` | override trust tier: OBSERVED|OBSERVED_HARDENED|ATTESTED|SELF_REPORTED |
| `--json` | emit JSON output |

#### `amc status`

Show imported eval coverage per AMC dimension

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID filter |
| `--window <window>` | window filter (e.g., 30d, 12h, 90m) |
| `--json` | emit JSON output |

#### `amc run`

One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results

| Option | Description |
|--------|-------------|
| `--format <format>` | output format: json | html | terminal |
| `--output <path>` | write report to file (format inferred from extension if --format omitted) |
| `--window <window>` | evidence window |
| `--agent <agentId>` | agent ID (defaults to active agent) |
| `--fail-on-error` | exit with code 1 on INVALID status or threshold breach |
| `--threshold <n>` | minimum acceptable IntegrityIndex (0–1) |

#### `amc status`

Show lifecycle stage, accountability matrix, governance gates, and transition trail

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--json` | emit JSON output |

#### `amc advance`

Advance lifecycle stage after governance gate confirmation

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--actor <actor>` | actor identifier |
| `--actor-role <role>` | actor role: developer|deployer|operator |
| `--controls <list>` | comma-separated governance control IDs satisfied for this advance |
| `--note <text>` | transition note |
| `--json` | emit JSON output |

#### `amc verify`

Run full workspace verification suite

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |

#### `amc alert`

Dispatch INCIDENT_CREATED to configured integration channels

| Option | Description |
|--------|-------------|
| `--summary <text>` | incident summary |
| `--details <json>` | JSON object payload for incident details |

#### `amc diff`

Show deterministic diff for applying a policy pack

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc apply`

Apply policy pack and sign updated configs/targets

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc list`

List incidents for an agent

| Option | Description |
|--------|-------------|
| `--status <status>` | open|closed |
| `--limit <n>` | max incidents to return |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc create`

Create a manual incident

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc circuit-breaker-init`

Initialize circuit breaker policy

| Option | Description |
|--------|-------------|
| `--timeout <ms>` | global timeout in ms |
| `--threshold <n>` | failure threshold before opening circuit |

#### `amc dead-letters`

Show dead letter queue

| Option | Description |
|--------|-------------|
| `--unresolved` | show only unresolved entries |

#### `amc mode`

Show or set degradation mode

| Option | Description |
|--------|-------------|
| `--set <mode>` | Set mode: FULL, REDUCED, MINIMAL |
| `--reason <reason>` | Reason for mode change |
| `--ttl <duration>` | TTL for mode override (e.g. 4h, 30m) |

#### `amc slo`

Show governance SLO dashboard

| Option | Description |
|--------|-------------|
| `--window <hours>` | Window in hours |

#### `amc latency`

Show latency accounting report

| Option | Description |
|--------|-------------|
| `--window <hours>` | Window in hours |

#### `amc build`

Build deterministic signed context graph

| Option | Description |
|--------|-------------|
| `--id <id>` | agent id when --scope agent |

#### `amc show`

Show latest CGX graph or agent context pack

| Option | Description |
|--------|-------------|
| `--id <id>` | agent id when scope=agent |

#### `amc simulate`

Simulate impact propagation when a node changes

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent |
| `--id <id>` | agent id when scope=agent |
| `--max-depth <n>` | max propagation depth |
| `--json` | emit JSON output |

#### `amc diff`

Diff two CGX graph snapshots

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent |
| `--id <id>` | agent id when scope=agent |
| `--json` | emit JSON output |

#### `amc delta-to-l5`

Generate L4→L5 delta report showing what separates current state from L5

| Option | Description |
|--------|-------------|
| `--out <path>` | output file path |
| `--format <format>` | json|markdown|both |
| `--json` | emit JSON to stdout |

#### `amc control-classification`

Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION)

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |

#### `amc apply`

Apply prompt policy from YAML file and sign

| Option | Description |
|--------|-------------|
| `--reason <reason>` | change reason |

#### `amc build`

Build and sign .amcprompt for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent id |
| `--out <file>` | output .amcprompt file |

#### `amc verify`

Verify .amcprompt signature and lint signature

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | optional signer pubkey path |

#### `amc show`

Show provider-specific enforced system prompt

| Option | Description |
|--------|-------------|
| `--format <format>` | text|json |

#### `amc run-now`

Run prompt scheduler now for one agent or all

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent id or all |

#### `amc create`

Create deterministic signed .amcpass artifact

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |

#### `amc verify`

Verify .amcpass artifact offline

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | override signer pubkey path |

#### `amc show`

Show .amcpass as JSON or single-line badge

| Option | Description |
|--------|-------------|
| `--format <format>` | json|badge |

#### `amc export-latest`

Export latest passport for a scope to .amcpass

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |

#### `amc share`

Generate shareable passport material

| Option | Description |
|--------|-------------|
| `--base-url <url>` | public base URL |
| `--out <path>` | output file path for pdf format |

#### `amc render`

Render contextualized 126-question diagnostic for an agent

| Option | Description |
|--------|-------------|
| `--format <format>` | md|json |
| `--out <file>` | output file |

#### `amc reencrypt`

Re-encrypt blob batch from one key version to another

| Option | Description |
|--------|-------------|
| `--limit <n>` | max blobs to process |

#### `amc run`

Run archival + payload prune lifecycle

| Option | Description |
|--------|-------------|
| `--dry-run` | simulate without modifying data |

#### `amc verify`

Verify signed backup bundle offline

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | optional auditor pubkey override |

#### `amc restore`

Restore a verified backup into target directory

| Option | Description |
|--------|-------------|
| `--force` | allow restore into existing target directory |

#### `amc check`

Evaluate whether an action is allowed now (simulate vs execute)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc explain`

Explain policy requirements for an action class

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc report`

Render matrix of current SIMULATE/EXECUTE allowance per ActionClass

| Option | Description |
|--------|-------------|
| `--window <window>` | unused placeholder for compatibility |
| `--out <path>` | output markdown path |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc create`

Create and sign a work order

| Option | Description |
|--------|-------------|
| `--description <text>` | description |
| `--allow <class...>` | allowed ActionClass entries |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc list`

List work orders for agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc show`

Show signed work order JSON

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc verify`

Verify work order signature

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc expire`

Expire/revoke a work order

| Option | Description |
|--------|-------------|
| `--reason <text>` | reason |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc issue`

Issue short-lived signed execution ticket

| Option | Description |
|--------|-------------|
| `--tool <name>` | restrict ticket to a tool |
| `--ttl <ttl>` | ticket TTL (e.g. 15m, 1h) |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc init`

Create and sign .amc/gateway.yaml

| Option | Description |
|--------|-------------|
| `--base-url <url>` | required when provider=Other |
| `--auth-type <type>` | bearer_env|header_env|query_env|none |
| `--env <name>` | API key env for auth |
| `--header <name>` | header name for header_env |
| `--param <name>` | query param for query_env |

#### `amc start`

Start local reverse-proxy gateway and signed evidence capture

| Option | Description |
|--------|-------------|
| `--config <path>` | gateway config path |

#### `amc status`

Check gateway reachability and route URLs

| Option | Description |
|--------|-------------|
| `--config <path>` | gateway config path |

#### `amc verify-config`

Verify .amc/gateway.yaml signature

| Option | Description |
|--------|-------------|
| `--config <path>` | gateway config path |

#### `amc bind-agent`

Bind a gateway route prefix to an agent ID for deterministic attribution

| Option | Description |
|--------|-------------|
| `--config <path>` | gateway config path |

#### `amc export`

Export a portable, signed evidence bundle for a run

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc export`

Export verifier-ready evidence (json|csv|pdf)

| Option | Description |
|--------|-------------|
| `--format <format>` | json|csv|pdf |
| `--out <file>` | output file path |
| `--agent <agentId>` | agent ID (filter evidence by agent) |
| `--include-chain` | include hash chain verification fields |
| `--include-rationale` | include rationale fields |

#### `amc audit-packet`

Generate external-auditor packet with verifier-ready evidence

| Option | Description |
|--------|-------------|
| `--output <file>` | output zip file |
| `--agent <agentId>` | agent ID (filter evidence by agent) |
| `--no-include-chain` | omit hash chain fields from evidence export |
| `--no-include-rationale` | omit rationale fields from evidence export |

#### `amc init`

Generate GitHub workflow and signed gate policy

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc print`

Print suggested CI pipeline steps

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc check`

One-liner CI gate: quickscore + threshold check (exit 1 if below)

| Option | Description |
|--------|-------------|
| `--min-score <n>` | minimum score percentage to pass (0-100) |
| `--min-level <level>` | minimum maturity level (L0-L5) |
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--json` | output JSON result |

#### `amc apply`

Apply archetype context/targets/guardrails/evals to an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc policy`

Export framework-agnostic North Star policy integration pack

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc badge`

Export deterministic maturity badge SVG for a run

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc build`

Build responsive offline dashboard for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--out <dir>` | output dashboard directory |

#### `amc serve`

Serve dashboard locally

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--port <port>` | port |
| `--out <dir>` | dashboard directory override |

#### `amc run`

Run assurance pack(s) with deterministic validation

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--scope <scope>` | workspace|node|agent |
| `--id <id>` | scope target id |
| `--pack <packId>` | single pack ID |
| `--all` | run all assurance packs |
| `--mode <mode>` | supervise|sandbox |
| `--window <window>` | evidence window |
| `--window-days <days>` | assurance evidence window in days |
| `--out <path>` | output markdown path |
| `--format <format>` | output format: text|sarif |
| `--verbose` | show full scenario-level detail with payloads and reasons |

#### `amc cert-issue`

Issue signed assurance certificate for a run

| Option | Description |
|--------|-------------|
| `--out <file.amccert>` | output certificate path |

#### `amc request`

Request time-limited readiness waiver (dual-control approval required)

| Option | Description |
|--------|-------------|
| `--agent <id>` | agent ID binding for approval intent |

#### `amc revoke`

Revoke active or specific waiver

| Option | Description |
|--------|-------------|
| `--waiver <id>` | waiver ID |

#### `amc history`

List assurance run history

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc verify`

Verify assurance run determinism and signatures

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc patch`

Apply deterministic patch kit for failed assurance findings

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--apply` | apply patch kit |

#### `amc certify`

Issue signed, offline-verifiable certificate bundle

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc generate`

Generate execution-proof trust certificate (signed PDF or JSON)

| Option | Description |
|--------|-------------|
| `--valid-days <n>` | certificate validity period in days |

#### `amc verify`

Verify certificate bundle offline

| Option | Description |
|--------|-------------|
| `--revocation <path>` | optional revocation file |

#### `amc init`

Initialize AMC Notary config and signing backend

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |
| `--external-command <cmd>` | external signer command |
| `--external-args <args...>` | external signer args |

#### `amc start`

Start AMC Notary service (foreground)

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |
| `--workspace <dir>` | workspace path for attestation snapshots |

#### `amc status`

Show notary backend and log status

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |

#### `amc pubkey`

Print notary public key and fingerprint

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |

#### `amc attest`

Generate signed notary runtime attestation bundle (.amcattest)

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |
| `--workspace <dir>` | workspace path for config snapshot |

#### `amc sign`

Sign a payload file using Notary (admin utility)

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |

#### `amc log-verify`

Verify notary append-only signing log + seal signature

| Option | Description |
|--------|-------------|
| `--notary-dir <dir>` | notary data directory |

#### `amc enable-notary`

Enable fail-closed NOTARY trust mode

| Option | Description |
|--------|-------------|
| `--require <level>` | SOFTWARE|HARDWARE |
| `--unix-socket <path>` | optional unix socket path |

#### `amc freshness`

Report temporal trust freshness and half-life decay

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--lookback-days <n>` | lookback horizon in days |
| `--stale-threshold <n>` | stale alert threshold for decay delta |
| `--half-life-behavioral <days>` | half-life for behavioral evidence (days) |
| `--half-life-assurance <days>` | half-life for assurance evidence (days) |
| `--half-life-cryptographic <days>` | half-life for cryptographic evidence (days) |
| `--half-life-self-reported <days>` | half-life for self-reported evidence (days) |
| `--view <mode>` | summary|freshness|json |

#### `amc add`

Add an identity provider

| Option | Description |
|--------|-------------|
| `--display-name <name>` | display name |
| `--issuer <issuer>` | OIDC issuer URL |
| `--client-id <id>` | OIDC client ID |
| `--client-secret-file <path>` | OIDC client secret file |
| `--redirect-uri <uri>` | OIDC redirect URI |
| `--scopes <scopes>` | comma-separated OIDC scopes |
| `--use-well-known <bool>` | true|false |
| `--authorization-endpoint <url>` | OIDC authorization endpoint |
| `--token-endpoint <url>` | OIDC token endpoint |
| `--jwks-uri <url>` | OIDC JWKS URI |
| `--entry-point <url>` | SAML IdP entry point |
| `--idp-cert-file <path>` | SAML IdP certificate file |
| `--sp-entity-id <id>` | SAML SP entity ID |
| `--acs-url <url>` | SAML ACS URL |

#### `amc add`

Add a group mapping rule

| Option | Description |
|--------|-------------|
| `--provider-id <id>` | provider ID |
| `--workspace <id>` | workspace ID |
| `--roles <roles>` | comma-separated workspace roles |
| `--host-admin` | grant host admin |

#### `amc create`

Create a SCIM bearer token and store hash in host vault

| Option | Description |
|--------|-------------|
| `--out <file>` | optional path to write token (0600) |

#### `amc create`

Create one-time pairing code (LAN login pairing or agent bridge pairing)

| Option | Description |
|--------|-------------|
| `--ttl <ttl>` | ttl (e.g. 10m) |
| `--ttl-min <minutes>` | agent pairing TTL minutes |
| `--agent-name <name>` | agent name for bridge pairing mode |
| `--workspace <workspaceId>` | workspace id hint for host mode (metadata only) |

#### `amc redeem`

Redeem pairing code for a lease token file

| Option | Description |
|--------|-------------|
| `--bridge-url <url>` | studio base URL (or workspace URL in host mode) |
| `--lease-ttl-min <minutes>` | lease TTL minutes |

#### `amc tail`

Tail transparency entries

| Option | Description |
|--------|-------------|
| `--n <count>` | number of entries |

#### `amc report`

Generate evidence-linked compliance report

| Option | Description |
|--------|-------------|
| `--window <window>` | window (e.g. 14d) |
| `--out <path>` | output path (.md or .json) |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc init`

Initialize federation identity and signed config

| Option | Description |
|--------|-------------|
| `--org <name>` | organization name |

#### `amc test`

Dispatch deterministic test event to an integration channel

| Option | Description |
|--------|-------------|
| `--channel <id>` | specific channel ID |

#### `amc dispatch`

Dispatch a deterministic integration event

| Option | Description |
|--------|-------------|
| `--summary <text>` | summary |

#### `amc init`

Create and sign outcome contract

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--archetype <id>` | optional archetype hint |

#### `amc verify`

Verify outcome contract signature

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc report`

Generate outcomes report (agent) or fleet outcomes report

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc attest`

Record manual attested outcome signal

| Option | Description |
|--------|-------------|
| `--workorder <id>` | work order ID |
| `--unit <unit>` | unit label |
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc apply`

Apply signed value policy from YAML/JSON file

| Option | Description |
|--------|-------------|
| `--reason <text>` | change reason |

#### `amc init`

Create and sign value contract template

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id (required for node/agent) |
| `--deployment <deployment>` | single|host|k8s|compose |

#### `amc apply`

Apply value contract from YAML/JSON file

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|node|agent |
| `--id <id>` | scope id |
| `--reason <text>` | change reason |

#### `amc verify`

Verify value contract signature

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |

#### `amc print`

Print value contract and signature status

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |

#### `amc ingest`

Ingest value webhook payload JSON

| Option | Description |
|--------|-------------|
| `--attested` | mark ingested events as ATTESTED |

#### `amc import`

Import numeric KPI points from CSV (ts,value)

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |
| `--attested` | mark imported events as ATTESTED |

#### `amc snapshot`

Generate/load latest signed value snapshot

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |
| `--window-days <days>` | window days |

#### `amc report`

Generate signed value report

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |
| `--window-days <days>` | window days |

#### `amc run-now`

Run value scheduler now

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|node|agent |
| `--id <id>` | scope id |
| `--window-days <days>` | window days |

#### `amc latest`

Render latest forecast for scope

| Option | Description |
|--------|-------------|
| `--id <targetId>` | agentId for scope=agent or nodeId for scope=node |
| `--out <path>` | optional output path (.json or .md) |

#### `amc refresh`

Refresh forecast snapshot for scope

| Option | Description |
|--------|-------------|
| `--id <targetId>` | agentId for scope=agent or nodeId for scope=node |
| `--out <path>` | optional output path (.json or .md) |

#### `amc run-now`

Run scheduler refresh immediately

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent|node |
| `--id <targetId>` | agentId for scope=agent or nodeId for scope=node |

#### `amc list`

List advisories for scope

| Option | Description |
|--------|-------------|
| `--id <targetId>` | agentId for scope=agent or nodeId for scope=node |

#### `amc ack`

Acknowledge an advisory

| Option | Description |
|--------|-------------|
| `--by <name>` | actor name (defaults to current user or  |

#### `amc init`

Create a signed casebook

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--casebook <id>` | casebook ID |

#### `amc add`

Add signed case from existing workorder

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc list`

List casebooks

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc verify`

Verify signed casebook and case files

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc create`

Create an experiment

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc set-baseline`

Set experiment baseline config

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc set-candidate`

Set experiment candidate signed config overlay

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc run`

Run deterministic experiment against signed casebook

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc analyze`

Analyze latest experiment run

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc gate`

Evaluate latest experiment run against gate policy

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc gate-template`

Write an experiment gate policy template

| Option | Description |
|--------|-------------|
| `--preset <preset>` | strict|balanced|exploratory |

#### `amc list`

List experiments

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc fix-signatures`

Verify and re-sign gateway/fleet/agent configs

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc run`

Run recurring diagnostic + assurance + dashboard + snapshot

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc plan`

Print recurring loop plan

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc schedule`

Print OS scheduler config (no automatic installation)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc snapshot`

Generate Unified Clarity Snapshot markdown

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc indices`

Compute deterministic failure-risk indices

| Option | Description |
|--------|-------------|
| `--run <runId>` | diagnostic run ID |
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--out <path>` | output path (.md or .json) |

#### `amc fleet`

Compute failure-risk indices across fleet

| Option | Description |
|--------|-------------|
| `--out <path>` | output markdown path |

#### `amc init`

Create and sign .amc/fleet.yaml

| Option | Description |
|--------|-------------|
| `--org <name>` | organization name |

#### `amc report`

Generate fleet maturity report (md) or fleet compliance report (pdf)

| Option | Description |
|--------|-------------|
| `--window <window>` | evidence window |
| `--format <format>` | md|pdf |
| `--output <path>` | output path |

#### `amc health`

Show fleet health dashboard aggregates

| Option | Description |
|--------|-------------|
| `--json` | print full JSON payload |

#### `amc apply`

Apply a governance policy to all fleet agents or one environment

| Option | Description |
|--------|-------------|
| `--min-integrity <n>` | minimum integrity index (0-1) |
| `--dimension-min <rules>` | dimension minimums, e.g. 2:3,5:4 |
| `--env <environment>` | dev|staging|production (default: all environments) |

#### `amc define`



| Option | Description |
|--------|-------------|
| `--id <sloId>` | optional stable SLO ID |

#### `amc trust-add-edge`

Add a delegation edge (orchestrator → worker)

| Option | Description |
|--------|-------------|
| `--risk <tier>` | risk tier (low/med/high/critical) |
| `--mode <mode>` | inheritance mode (strict/weighted/no-inherit) |
| `--weight <n>` | weight for weighted mode (0-1) |

#### `amc trust-report`

Generate trust composition report across fleet

| Option | Description |
|--------|-------------|
| `--window <window>` | evidence window |
| `--output <path>` | output path |

#### `amc trust-receipts`

Verify cross-agent receipt chains

| Option | Description |
|--------|-------------|
| `--window <window>` | evidence window |

#### `amc dag`

Visualize orchestration delegation graph

| Option | Description |
|--------|-------------|
| `--agent <id>` | filter by agent ID |
| `--window <window>` | time window |

#### `amc handoff`

Manage handoff packets

| Option | Description |
|--------|-------------|
| `--from <id>` | source agent ID |
| `--to <id>` | target agent ID |
| `--goal <goal>` | delegation goal |
| `--mode <mode>` | execute|simulate |
| `--packet <packetId>` | packet ID for verify |

#### `amc contradictions`

Detect cross-agent contradictions

| Option | Description |
|--------|-------------|
| `--scope <scope>` | fleet or agent |
| `--window <window>` | evidence window |
| `--min-delta <n>` | minimum level delta to report |

#### `amc add`

Assign or update provider template for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc run`

Run agent command in hardened Docker sandbox

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--route <route>` | gateway route URL (e.g. http://127.0.0.1:3210/openai) |
| `--proxy <proxy>` | gateway proxy URL (e.g. http://127.0.0.1:3211) |
| `--image <image>` | docker image |

#### `amc ingest`

Ingest external logs/transcripts as SELF_REPORTED evidence

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc attest`

Auditor-attest an ingest session to upgrade trust tier to ATTESTED

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc learn`

Education flow for a specific maturity question

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc lineage-report`

Generate governance lineage report

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc lineage-policy-intents`

List all policy change intents for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc claim-confidence`

Generate per-claim confidence report with citation-backed scoring

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc claim-confidence-gate`

Check if claims for given questions pass confidence threshold

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc overhead-report`

Generate per-feature overhead accounting report

| Option | Description |
|--------|-------------|
| `--window <hours>` | reporting window in hours |

#### `amc micro-canary-run`

Run all micro-canary probes immediately

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc micro-canary-report`

Generate micro-canary status report

| Option | Description |
|--------|-------------|
| `--window <hours>` | reporting window in hours |

#### `amc micro-canary-alerts`

Show active micro-canary alerts

| Option | Description |
|--------|-------------|
| `--ack-all` | acknowledge all alerts |

#### `amc experiment-architecture`

Run a controlled architecture comparison experiment

| Option | Description |
|--------|-------------|
| `--baseline-kind <kind>` | architecture kind |
| `--candidate-kind <kind>` | architecture kind |

#### `amc canary-start`

Start a policy canary with candidate vs stable policy

| Option | Description |
|--------|-------------|
| `--enforce-pct <n>` | percent of requests to enforce candidate on |
| `--duration <ms>` | canary duration in milliseconds |
| `--failure-threshold <ratio>` | failure ratio that triggers rollback |
| `--auto-promote` | auto-promote if canary succeeds |

#### `amc canary-report`

Generate full policy canary report

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc rollback-create`

Create a rollback pack from the current policy file

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--policy-file <path>` | path to policy file |

#### `amc emergency-override`

Activate an emergency policy override with strict TTL

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--ttl <ms>` | TTL in milliseconds |

#### `amc policy-debt-add`

Register a temporary policy waiver (debt)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--created-by <who>` | who created this waiver |

#### `amc policy-debt-list`

List active policy debt entries

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--all` | include expired entries |

#### `amc governance-drift`

Detect governance drift for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc cgx-integrity`

Run graph integrity check on CGX with semantic overlay

| Option | Description |
|--------|-------------|
| `--max-contradictions <n>` | max allowed contradictions |

#### `amc cgx-propagation`

Simulate risk propagation from a source node

| Option | Description |
|--------|-------------|
| `--max-depth <n>` | max propagation depth |

#### `amc memory-extract`

Extract lessons from verified effective corrections

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--min-effectiveness <n>` | min effectiveness score (0-1) |

#### `amc memory-advisories`

Show advisories from correction memory for prompt injection

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc memory-report`

Generate correction memory report

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--window <window>` | evidence window |

#### `amc memory-expire`

Expire stale lessons past their TTL

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc own`

Ownership flow for top maturity gaps

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc commit`

Commitment plan flow (7/14/30-day checklist)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc guard`

Guard check proposed output from stdin

| Option | Description |
|--------|-------------|
| `--target <name>` | target profile name |
| `--risk-tier <tier>` | low|med|high|critical |

#### `amc issue`



| Option | Description |
|--------|-------------|
| `--ttl <ttl>` | lease TTL (e.g. 15m, 60m) |
| `--scopes <scopes>` | comma-separated scopes |
| `--routes <routes>` | comma-separated route prefixes |
| `--models <models>` | comma-separated model patterns |
| `--rpm <rpm>` | max requests per minute |
| `--tpm <tpm>` | max tokens per minute |
| `--max-cost-usd-per-day <usd>` | optional max cost USD per day |
| `--workorder <workOrderId>` | optional work order binding |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |

#### `amc check`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--against <kind>` | comparison baseline |

#### `amc report`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |

#### `amc status`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |

#### `amc generate`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |

#### `amc verify`



| Option | Description |
|--------|-------------|
| `--pubkey <file>` | optional explicit auditor public key PEM |

#### `amc list`



| Option | Description |
|--------|-------------|
| `--status <status>` | pending|approved|denied|consumed|expired |

#### `amc equalizer`



| Option | Description |
|--------|-------------|
| `--set <pair...>` | question level set pairs, e.g. AMC-1.1=3 |

#### `amc show`



| Option | Description |
|--------|-------------|
| `--format <fmt>` | json|yaml |

#### `amc plan`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--node <nodeId>` | org node ID |
| `--to <mode>` | targets|excellence|custom |
| `--window <window>` | e.g. 14d |
| `--preview` | do not persist plan |
| `--target-file <path>` | custom target mapping json |

#### `amc status`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--node <nodeId>` | org node ID |

#### `amc track`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--node <nodeId>` | org node ID |
| `--window <window>` | e.g. 14d |

#### `amc report`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--node <nodeId>` | org node ID |

#### `amc attest`



| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--node <nodeId>` | org node ID |
| `--role <role>` | OWNER|AUDITOR |
| `--files <paths...>` | related file paths |
| `--evidence-links <refs...>` | evidence links |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--enterprise <name>` | enterprise display name |

#### `amc node`



| Option | Description |
|--------|-------------|
| `--parent <id>` | parent node ID |

#### `amc assign`



| Option | Description |
|--------|-------------|
| `--weight <n>` | membership weight |

#### `amc score`



| Option | Description |
|--------|-------------|
| `--window <window>` | e.g. 14d |

#### `amc report`



| Option | Description |
|--------|-------------|
| `--window <window>` | e.g. 14d |

#### `amc compare`



| Option | Description |
|--------|-------------|
| `--format <fmt>` | md|json |
| `--window <window>` | e.g. 14d |

#### `amc commit`



| Option | Description |
|--------|-------------|
| `--days <n>` | 14|30|90 |

#### `amc export`

Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor

| Option | Description |
|--------|-------------|
| `--limit <n>` | maximum events to export |

#### `amc show`

Show audit map

| Option | Description |
|--------|-------------|
| `--id <id>` | builtin|active |

#### `amc create`

Create deterministic signed .amcaudit artifact

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |
| `--request-id <id>` | restricted evidence request id |

#### `amc verify`

Verify .amcaudit file

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | optional signer public key pem |

#### `amc export-request`

Create dual-control approval request for external binder sharing

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |
| `--request-id <id>` | restricted evidence request id |

#### `amc create`

Create auditor evidence request

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |
| `--requester <id>` | requester user id |

#### `amc approve`

Owner approves request (starts dual-control approval flow)

| Option | Description |
|--------|-------------|
| `--reason <text>` | approval reason |

#### `amc run-now`

Run audit binder cache refresh immediately

| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|node|agent |
| `--id <id>` | scope id for node/agent |

#### `amc create`

Create deterministic signed .amcbench artifact

| Option | Description |
|--------|-------------|
| `--id <id>` | scope id for node/agent |
| `--window-days <n>` | window days |
| `--named` | publish named identity mode |
| `--industry <value>` | software|fintech|health|manufacturing|other |
| `--agent-type <value>` | code-agent|support-agent|ops-agent|research-agent|sales-agent|other |
| `--deployment <value>` | single|host|k8s|compose |

#### `amc verify`

Verify .amcbench artifact offline

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | override signer pubkey |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--id <id>` | registry id |
| `--name <name>` | registry display name |

#### `amc publish`



| Option | Description |
|--------|-------------|
| `--version <version>` | override version |

#### `amc serve`



| Option | Description |
|--------|-------------|
| `--port <port>` | port |
| `--host <host>` | host |

#### `amc search`

Browse a bench registry index

| Option | Description |
|--------|-------------|
| `--query <text>` | optional search text |

#### `amc compare`

Compute local vs imported ecosystem comparison

| Option | Description |
|--------|-------------|
| `--against <mode>` | imported|registry:<id> |

#### `amc request`



| Option | Description |
|--------|-------------|
| `--ack` | explicit irreversible-sharing owner acknowledgment |

#### `amc export`



| Option | Description |
|--------|-------------|
| `--publisher <org>` | publisher org |
| `--public-agent-id <id>` | public agent id override |

#### `amc list`



| Option | Description |
|--------|-------------|
| `--sort <field>` | benchId|overall|integrity|created |
| `--limit <n>` | max rows to print |

#### `amc report`



| Option | Description |
|--------|-------------|
| `--group-by <groupBy>` | archetype|riskTier|trustLabel |

#### `amc stats`



| Option | Description |
|--------|-------------|
| `--group-by <groupBy>` | archetype|riskTier|trustLabel |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent|node |
| `--id <id>` | scope id |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |
| `--mode <mode>` | DESIRED|EXCELLENCE |

#### `amc apply`



| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |
| `--mode <mode>` | DESIRED|EXCELLENCE |

#### `amc init`



| Option | Description |
|--------|-------------|
| `--id <id>` | scope id |

#### `amc gap`



| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent|node |
| `--id <id>` | scope id |
| `--out <path>` | output report path |

#### `amc create`



| Option | Description |
|--------|-------------|
| `--scope <scope>` | workspace|agent|node |
| `--id <id>` | scope id |
| `--from <from>` | plan source |
| `--to <to>` | plan target |

#### `amc init`

Initialize AMC release signing keypair

| Option | Description |
|--------|-------------|
| `--write-private-to <path>` | write private key to this path (0600) |

#### `amc pack`

Build a signed deterministic .amcrelease bundle

| Option | Description |
|--------|-------------|
| `--private-key <path>` | release signing private key path override |

#### `amc verify`

Verify a .amcrelease bundle offline

| Option | Description |
|--------|-------------|
| `--pubkey <path>` | override public key for verification |

#### `amc scan`

Run strict secret scan on a .amcrelease bundle

| Option | Description |
|--------|-------------|
| `--out <file>` | optional report output path |

#### `amc smoke`

Run go-live smoke tests: local, docker, or helm-template

| Option | Description |
|--------|-------------|
| `--workspace <path>` | workspace path (local mode only) |
| `--repo-root <path>` | repository root |
| `--json` | emit structured JSON output |

#### `amc _studio-daemon`



| Option | Description |
|--------|-------------|
| `--api-port <port>` | studio API port |
| `--dashboard-port <port>` | dashboard port |

#### `amc lab-create`

Create a new lab experiment

| Option | Description |
|--------|-------------|
| `--description <desc>` | experiment description |

#### `amc lab-list`

List all lab experiments

| Option | Description |
|--------|-------------|
| `--kind <kind>` | filter by experiment kind |

#### `amc insider-risk-report`

Generate insider risk analytics report

| Option | Description |
|--------|-------------|
| `--window <days>` | reporting window in days |

#### `amc insider-alerts`

Show insider risk alerts

| Option | Description |
|--------|-------------|
| `--actor <id>` | filter by actor ID |
| `--ack <alertId>` | acknowledge an alert |

#### `amc fp-submit`

Submit a false positive report for an assurance scenario

| Option | Description |
|--------|-------------|
| `--reporter <name>` | who is filing |

#### `amc fp-list`

List false positive reports

| Option | Description |
|--------|-------------|
| `--pack <id>` | filter by pack ID |
| `--status <status>` | filter by status (open, confirmed, rejected) |

#### `amc fp-cost`

Show false positive cost summary

| Option | Description |
|--------|-------------|
| `--pack <id>` | filter by pack ID |

#### `amc fp-tuning-report`

Generate false positive tuning report with recommendations

| Option | Description |
|--------|-------------|
| `--window <days>` | reporting window in days |
| `--threshold <rate>` | FP rate threshold for relax recommendation |

#### `amc wiring-status`

Show production wiring status for all modules (Items 11-16)

| Option | Description |
|--------|-------------|
| `--markdown` | output as markdown |

#### `amc python-sdk`

Generate the Python SDK package for AMC Bridge API

| Option | Description |
|--------|-------------|
| `--endpoints` | list covered endpoints |
| `--coverage` | validate endpoint coverage |

#### `amc residency-policy`

Create or list data residency policies

| Option | Description |
|--------|-------------|
| `--list` | list all policies |
| `--region <region>` | region for new policy |
| `--isolation <level>` | isolation level: strict, shared, federated |
| `--custody <mode>` | key custody mode: local, notary, external-kms, external-hsm |

#### `amc tenant-register`

Register a tenant boundary

| Option | Description |
|--------|-------------|
| `--isolation <level>` | isolation level |

#### `amc legal-hold`

Issue or manage legal holds

| Option | Description |
|--------|-------------|
| `--issue` | issue a new legal hold |
| `--release <holdId>` | release a legal hold by ID |
| `--list` | list active legal holds |
| `--tenant <id>` | tenant ID |
| `--reason <text>` | reason for hold |
| `--issued-by <name>` | issuer name |

#### `amc residency-report`

Generate data residency compliance report for a tenant

| Option | Description |
|--------|-------------|
| `--redaction-tests` | include privacy redaction tests |

#### `amc operator-dashboard`

Generate operator dashboard showing why questions are capped and how to unlock

| Option | Description |
|--------|-------------|
| `--role <role>` | dashboard role: operator, executive, auditor |
| `--run <runId>` | specific run ID to analyze (defaults to latest) |
| `--previous-run <runId>` | previous run ID for narrative diff |

#### `amc why-capped`

Show why each question is capped at its current level

| Option | Description |
|--------|-------------|
| `--question <id>` | filter to specific question ID |

#### `amc action-queue`

Show prioritized actions sorted by risk-reduction-per-effort

| Option | Description |
|--------|-------------|
| `--limit <n>` | max actions to show |

#### `amc integrate`

Generate integration scaffold for a framework

| Option | Description |
|--------|-------------|
| `--output-dir <dir>` | output directory for generated files |
| `--project <path>` | project path for one-liner framework adapters |

#### `amc simulate-bridge`

Run a simulated bridge request for local testing

| Option | Description |
|--------|-------------|
| `--error-rate <rate>` | simulated error rate (0.0-1.0) |

#### `amc openapi-generate`

Generate live OpenAPI spec (Studio + Bridge + Gateway)

| Option | Description |
|--------|-------------|
| `--out <file>` | output file path (yaml/json) |
| `--json` | output raw JSON to stdout |

#### `amc claims-stale`

List stale claims for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc claims-sweep`

Process all stale claims for an agent (auto-demote to PROVISIONAL)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc confidence-drift`

Track confidence drift per question across diagnostic runs

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--window <window>` | time window (e.g., 30d) |

#### `amc lessons-list`

List lessons learned from corrections

| Option | Description |
|--------|-------------|
| `--scope <scope>` | fleet or agent |
| `--agent <agentId>` | agent ID (for scope=agent) |

#### `amc policy-canary-start`

Start policy canary mode (observation-only)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--duration <duration>` | canary duration (e.g., 7d) |

#### `amc policy-canary-report`

Generate canary mode report for an agent

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc debt-add`

Add a policy debt entry (waiver/override/exception)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--expiry <expiry>` | expiry (e.g., 7d or epoch ms) |
| `--policies <policies>` | comma-separated affected policy IDs |
| `--risk <risk>` | LOW|MEDIUM|HIGH|CRITICAL |
| `--created-by <who>` | who created this |

#### `amc debt-list`

List policy debt entries

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc governor-override`

Activate an emergency governance override with TTL

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |
| `--ttl <ttl>` | TTL (e.g., 4h) |
| `--mode <mode>` | execute or dry-run |

#### `amc governor-override-alerts`

Show alerts for active/expired overrides

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID (overrides global --agent) |

#### `amc capabilities-add`

Add capability declaration to agent passport

| Option | Description |
|--------|-------------|
| `--evidence <eventId>` | evidence event ID |

#### `amc search`

Search agents by capability and minimum maturity level

| Option | Description |
|--------|-------------|
| `--min-level <n>` | minimum maturity level |

#### `amc unknowns`



| Option | Description |
|--------|-------------|
| `--agent <id>` | agent ID |

#### `amc meta-confidence`

Report confidence in the maturity score itself

| Option | Description |
|--------|-------------|
| `--agent <id>` | agent ID |
| `--run <runId>` | specific run ID |

#### `amc confidence-check`

Check if action is allowed given confidence-adjusted maturity

| Option | Description |
|--------|-------------|
| `--agent <id>` | agent ID |
| `--required-level <n>` | required maturity level |

#### `amc confidence-components`

Show per-component confidence breakdown

| Option | Description |
|--------|-------------|
| `--agent <id>` | agent ID |

#### `amc analyze <path>`

Run static code analyzer on a skill file

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc sandbox <agentId>`

Check sandbox configuration for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc sbom <path>`

Generate software bill of materials from package.json

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc reputation <toolId>`

Check reputation score for a tool

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc conversation-integrity <agentId>`

Check conversation integrity for an agent (demo)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc threat-intel <input>`

Check threat intelligence for an input

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc detect-injection <text>`

Detect prompt injection attempts in text

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc sanitize <text>`

Sanitize text — strip XSS, injection, and dangerous patterns

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc check <agentId> <tool> <action>`

Check policy for an agent action

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc exec-guard <cmd>`

Check if a command is safe to execute

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc ato-detect <agentId>`

Detect account takeover attempts (demo)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc numeric-check <value> <min> <max>`

Validate a numeric value within bounds

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc taint <input>`

Track tainted input through the system

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc blind-secrets <text>`

Redact secrets from text

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc attest <output>`

Attest an agent output

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc explain <agentId> <runId>`

Generate explainability packet for an agent run

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc safety-test <agentId>`

Run safety tests for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc host-hardening`

Check host hardening status for this AMC deployment

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc route <taskType>`

Route a task to the best model/provider

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc autonomy <agentId> <mode>`

Decide autonomy level for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc loop-detect <agentId>`

Detect infinite loops in agent behavior

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc metering <agentId>`

Show metering and billing for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc retry <cmd>`

Execute a command with retry logic

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc plan <goal>`

Generate an execution plan for a goal

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc create <name>`

Create a new workflow

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc rag-guard <input>`

Guard RAG chunks against injection

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc classify <text>`

Classify data sensitivity level

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc scrub <file>`

Scrub metadata from a file

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc dsar-status`

Show DSAR (Data Subject Access Request) status

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc privacy-budget <agentId>`

Check privacy budget for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc features`

List product features

| Option | Description |
|--------|-------------|
| `--relevance <level>` | Filter by relevance: high, medium, low |
| `--lane <lane>` | Filter by lane |
| `--amc-fit` | Only AMC-fit features |
| `--json` | Output as JSON |

#### `amc features-recommended`

Show top recommended product features

| Option | Description |
|--------|-------------|
| `--limit <n>` | Max features to show |
| `--json` | Output as JSON |

#### `amc define <term> <definition>`

Define a glossary term

| Option | Description |
|--------|-------------|
| `--domain <domain>` | Domain category |
| `--json` | Output as JSON |

#### `amc lookup <term>`

Look up a glossary term

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc list`

List all 7 domains with metadata

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc assess`

Run full domain assessment

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc modules`

Show module activation map for domain

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc gaps`

Show compliance gaps for an agent and domain

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc report`

Build full domain report and write it to a file

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc assurance`

Run domain-specific assurance packs

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc roadmap`

Generate 30/60/90-day roadmap for this domain

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc score`

Maturity scoring, adversarial testing, and evidence collection

| Option | Description |
|--------|-------------|
| `--tier <tier>` | tier: quick, standard, or deep |

#### `amc formal-spec <agentId>`

Compute formal maturity score for an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc adversarial <agentId>`

Test gaming resistance of scoring

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc collect-evidence <agentId>`

Collect evidence for scoring an agent

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc production-ready <agentId>`

Run production readiness gate for an agent

| Option | Description |
|--------|-------------|
| `--strict` | require all readiness gates |
| `--json` | Output as JSON |

#### `amc operational-independence <agentId>`

Calculate operational independence score

| Option | Description |
|--------|-------------|
| `--window <days>` | window in days |
| `--json` | Output as JSON |

#### `amc evidence-coverage <agentId>`

Show automated vs manual evidence coverage

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc lean-profile`

Show lean AMC profile

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc behavioral-contract`

Score agent behavioral contract maturity (alignment card, permitted/forbidden actions)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc fail-secure`

Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc output-integrity`

Score output integrity maturity (OWASP LLM02, confidence calibration, citation)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc state-portability`

Score agent state portability (vendor-neutral format, serialization, integrity on transfer)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc eu-ai-act`

Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc owasp-llm`

Score OWASP LLM Top 10 coverage (all 10 risks)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc regulatory-readiness`

Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc self-knowledge`

Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc kernel-sandbox`

Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc runtime-identity`

Score runtime execution identity maturity (JIT credentials, user propagation, revocation)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc calibration-gap`

Measure delta between agent self-reported confidence and observed behavior

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc evidence-conflict`

Measure internal consistency of evidence — detect conflicting signals

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc density-map`

Heatmap of evidence density per question per dimension — reveals blind spots

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc evidence-ingest`

Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--format <fmt>` | Source format: openai-evals, langsmith, mlflow, weights-biases, custom |

#### `amc level-transition`

Track formal promotion/demotion events with evidence gates

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc gaming-resistance`

Test whether adversarial evidence injection can inflate scores

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc sleeper-detection`

Detect context-dependent behavioral inconsistencies

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc audit-depth`

Score audit trail depth and completeness

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc policy-consistency`

Test policy enforcement consistency across repeated trials (pass^k)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc autonomy-duration`

Track time between human checkpoints with domain risk profiles

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc pause-quality`

Score quality of agent-initiated pauses

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc task-horizon`

Score task-completion time horizon (METR-inspired)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc factuality`

Score factuality across parametric, retrieval, and grounded dimensions

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc alignment-index`

Compute composite alignment index

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc interpretability`

Score structural transparency and explainability

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc faithfulness`

Score how well LLM output is grounded in provided context

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--context <text>` | Context to evaluate against |
| `--output <text>` | LLM output to evaluate |
| `--threshold <n>` | Overlap threshold (0-1) |

#### `amc memory-integrity`

Score memory correction persistence and poisoning resistance

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc output-attestation`

Score output signing and trust metadata for receiving agents

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc mutual-verification`

Score agent-to-agent trust verification (challenge-response)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc transparency-log`

Score network transparency log (Merkle tree, inclusion proofs)

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc assess <agentId>`

Full memory maturity assessment

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc assess <agentId>`

Assess human oversight quality

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc agent <agentId>`

Classify whether system is workflow or agent

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc list <agentId>`

List all evidence claims with TTL status

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc capture <agents...>`

Capture orchestration DAG for agents

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc score`

Score DAG governance

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc calibration`

Show calibration report

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc drift`

Show drift trend

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc tier`

Run tiered maturity assessment (quick/standard/deep)

| Option | Description |
|--------|-------------|
| `--tier <tier>` | Assessment tier: quick, standard, or deep |
| `--json` | Output as JSON |

#### `amc scan`

Zero-integration agent assessment scanner

| Option | Description |
|--------|-------------|
| `--url <url>` | probe a running agent endpoint |
| `--repo <url>` | scan a git repository |
| `--local <path>` | scan a local codebase |
| `--json` | Output as JSON |

#### `amc list`

List all available guardrails with status

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc run`

Run all demo scenarios

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

#### `amc open`

Build and serve dashboard at localhost:3210

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--port <port>` | port |
| `--view <view>` | team view: engineer, product, ciso, exec |

#### `amc vibe-audit`

Run static safety checks for AI-generated code

| Option | Description |
|--------|-------------|
| `--json` | emit JSON output |

#### `amc debug`

Structured evidence debug stream for an agent

| Option | Description |
|--------|-------------|
| `--follow` | follow new evidence events in real-time |
| `--dimension <dimension>` | filter by dimension (dimensionId) |
| `--question <questionId>` | filter by AMC question ID |
| `--event-type <eventType>` | filter by evidence event type |
| `--limit <n>` | initial event limit |
| `--poll-ms <ms>` | follow polling interval in ms |
| `--no-color` | disable ANSI color output |

#### `amc run <type>`

Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract)

| Option | Description |
|--------|-------------|
| `--input <input>` | Input text or path |

#### `amc harness`

Run the autonomous improvement harness loop

| Option | Description |
|--------|-------------|
| `--type <type>` | Agent type to simulate |
| `--iterations <n>` | Max iterations |
| `--target <score>` | Target maturity score |

#### `amc gap`

The 84-point documentation inflation gap — keyword vs execution scoring

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--fast` | Skip the dramatic reveal (instant output) |

#### `amc run`

Run a simulated agent through the AMC gateway and produce a real score (~30s)

| Option | Description |
|--------|-------------|
| `--gateway <url>` | Gateway URL (default: auto-detect running instance) |
| `--json` | Output as JSON |

#### `amc fix`

Generate remediation patches for identified gaps (auto-fix mode)

| Option | Description |
|--------|-------------|
| `--agent <agentId>` | agent ID |
| `--dry-run` | show what would be generated without writing files |
| `--target-level <level>` | target maturity level (L1-L5) |
| `--framework <framework>` | target framework (langchain, crewai, autogen, generic) |
| `--out <dir>` | output directory for patches |

#### `amc run [agentId]`

Execute red-team plugins with chosen attack strategies and generate a vulnerability report

| Option | Description |
|--------|-------------|
| `--plugins <ids...>` | Assurance-pack IDs to run as attack plugins (default: all) |
| `--strategies <ids...>` | Attack strategy IDs to apply (default: direct). Use  |
| `--output <path>` | Path to write the markdown vulnerability report |
| `--json` | Print JSON report to stdout |

#### `amc strategies`

List available attack strategies

| Option | Description |
|--------|-------------|
| `--json` | JSON output |

#### `amc plugins`

List available attack plugins (assurance packs)

| Option | Description |
|--------|-------------|
| `--json` | JSON output |


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

AMC includes 85 assurance packs for comprehensive agent evaluation.

| # | Pack ID | Name | Category | Assertions |
|---|---------|------|----------|------------|
| 1 | `compound-sensitive-read-external-post` | advancedThreats | advanced_threats | 9 |
| 2 | `tap-iterative-probing` | adversarial-robustness | adversarial_robustness | 5 |
| 3 | `proxy-001` | agentAsProxy | full-evasion | 10 |
| 4 | `rogue-mcp-impersonation` | agentIdentitySpoofing | identity_spoofing | 10 |
| 5 | `tool-error-loop` | agenticLoopGovernance | loop_governance | 10 |
| 6 | `rapid-approval-burst` | approvalTheater | approval_theater | 9 |
| 7 | `behavioral-contract-violation` | behavioralContractViolation | behavioral-contract | 5 |
| 8 | `read-then-exfil` | chainEscalation | chain_escalation | 9 |
| 9 | `infinite-retry` | circuitBreakerReliability | reliability | 9 |
| 10 | `ssh-key-read` | codingAgentEscape | sandbox_escape | 10 |
| 11 | `env-read-plus-http` | compoundThreat | compound_threat | 9 |
| 12 | `debug-public` | configLint | configuration | 9 |
| 13 | `output-signing` | contentProvenance | content_provenance | 6 |
| 14 | `echoleak-cve-2025-32711` | context-leakage | context_leakage | 5 |
| 15 | `no-budget-strategy` | contextWindowManagement | context_management | 10 |
| 16 | `trivial-task-flagship-model` | costEfficiency | cost_efficiency | 10 |
| 17 | `proxy-bypass` | crossAgentCollusion | cross_agent_collusion | 9 |
| 18 | `privilege-escalation-via-subagent` | delegationTrustChain | delegation_trust | 10 |
| 19 | `answer-vs-teach` | disempowerment | empowerment | 9 |
| 20 | `echo-api-key` | dlpExfiltration | data_leakage | 9 |
| 21 | `simulate-vs-execute` | duality | digital_duality | 14 |
| 22 | `econ-001` | economicAmplification | uncapped-amplification | 8 |
| 23 | `record-isolation` | educationFERPA | education_ferpa | 6 |
| 24 | `base64-injection` | encodedInjection | encoded_injection | 11 |
| 25 | `physical-action-isolation` | environmentalInfra | environmental_infra | 5 |
| 26 | `art-9-risk-management` | euAiActArticle | eu_ai_act_article | 7 |
| 27 | `verbosity-bias` | evaluationReliability | evaluation_reliability | 10 |
| 28 | `excessive-agency` | excessiveAgency | excessive-agency | 8 |
| 29 | `api-key` | exfiltration | secret_exfiltration | 11 |
| 30 | `impossible-sun-moon-same` | falsePremise | false-premise | 9 |
| 31 | `decision-explainability` | financialModelRisk | financial_model_risk | 6 |
| 32 | `us-executive-order` | globalAIRegulatory | global_regulatory | 10 |
| 33 | `set-all-5` | governanceBypass | governance_bypass | 11 |
| 34 | `govern-completeness` | governanceNISTRMF | governance_nist_rmf | 6 |
| 35 | `insufficient-info` | hallucination | hallucination_overclaim | 11 |
| 36 | `phi-output-echo` | healthcarePHI | healthcare_phi | 6 |
| 37 | `use-honeytoken-key` | honeytokenDetection | honeytoken | 9 |
| 38 | `context-completeness` | humanOversightQuality | oversight_quality | 6 |
| 39 | `ignore-previous` | injection | prompt_injection | 11 |
| 40 | `standard-compliance` | instructionCompliance | instruction_compliance | 6 |
| 41 | `section-6-3-impact-scope` | iso42005 | iso_42005_impact_assessment | 5 |
| 42 | `mcp-001` | mcpSecurityResilience | tool-poisoning | 12 |
| 43 | `memory-persistence` | memoryMaturity | memory_maturity | 6 |
| 44 | `false-memory-injection` | memoryPoisoning | memory_poisoning | 9 |
| 45 | `injected-capital-australia` | misleadingContext | misleading-context | 9 |
| 46 | `asil-verification` | mobilityFunctionalSafety | mobility_functional_safety | 5 |
| 47 | `redirect-to-shadow-model` | modelRoutePoisoning | model_route_poisoning | 11 |
| 48 | `crescendo-gradual-escalation` | multi-turn-safety | multi_turn_crescendo | 5 |
| 49 | `fake-attestation` | notaryAttestation | notary_attestation_legacy | 9 |
| 50 | `irreversibility-classification` | operational-discipline | operational_discipline | 9 |
| 51 | `false-premise-cat-feathers` | overCompliance | over-compliance | 13 |
| 52 | `overreliance` | overreliance | overreliance | 5 |
| 53 | `trivial-001` | overthinkingDetection | overthinking | 9 |
| 54 | `g01-prompt-injection` | owaspGenAi | owasp_genai | 11 |
| 55 | `pii-echo-full-name` | piiDetectionLeakage | pii_detection | 16 |
| 56 | `contradictory-policies` | policyConfusion | policy_confusion | 9 |
| 57 | `prefix-injection` | promptCachePoisoning | cache_poisoning | 10 |
| 58 | `injected-instruction-doc` | ragPoisoning | rag_poisoning | 9 |
| 59 | `no-reasoning-chain` | reasoningObservability | reasoning_observability | 10 |
| 60 | `token-budget-drain` | resourceExhaustion | resource_exhaustion | 11 |
| 61 | `skip-canary-deploy` | roleDeploySabotage | deploy_sabotage | 11 |
| 62 | `account-takeover-social` | roleSupportFraud | support_fraud | 11 |
| 63 | `speed-vs-quality` | sabotage | sabotage | 9 |
| 64 | `determinism` | safetyCriticalSIL | safety_critical_sil | 5 |
| 65 | `host-shell-egress` | sandboxBoundary | sandbox_boundary_legacy | 9 |
| 66 | `unverified-plugin` | sbomSupplyChain | supply_chain | 9 |
| 67 | `model-comparison` | selfPreferentialBias | self_preferential_bias | 9 |
| 68 | `direct-shutdown` | selfPreservation | self_preservation | 9 |
| 69 | `self-report-gaming` | selfReportGaming | anti-gaming | 5 |
| 70 | `claim-success-on-error` | silentFailure | silent_failure | 14 |
| 71 | `high-risk-no-approval` | stepupApprovalBypass | approval_bypass | 9 |
| 72 | `cpa-rag-untrusted-chunk` | supply-chain-integrity | cpa_rag | 7 |
| 73 | `hidden-exfiltration-skill` | supplyChainAttack | supply_chain_attack | 9 |
| 74 | `wrong-http-status` | sycophancy | sycophancy | 9 |
| 75 | `untrusted-to-command` | ; rm -rf / | taint_tracking | 9 |
| 76 | `privacy-by-design` | technologyGDPRSOC | technology_gdpr_soc | 6 |
| 77 | `response-timing-secret` | timingSideChannel | timing_side_channel | 9 |
| 78 | `stale-permission` | tocTou | toctou | 9 |
| 79 | `direct-shell-delete` | toolMisuse | tool_misuse_legacy | 11 |
| 80 | `renamed-parameter` | toolSchemaDrift | schema_drift | 10 |
| 81 | `unsupported-precision` | truthfulness | truthfulness_legacy | 9 |
| 82 | `rm-rf-no-approval` | unsafeTool | unsafe_tooling | 14 |
| 83 | `stated-vs-revealed-contradiction` | valueCoherence | value_coherence | 10 |
| 84 | `fiduciary-alignment` | wealthManagementMiFID | wealth_management_mifid | 5 |
| 85 | `zombie-001` | zombieAgentPersistence | injection-persistence | 10 |

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

#### approvalTheater

- **ID:** `rapid-approval-burst`
- **File:** `approvalTheaterPack.ts`
- **Category:** approval_theater
- **Description:** Tests whether oversight can detect and block rubber-stamp approval behavior using latency, coverage, reviewer diversity, override, and escalation evidence.
- **Assertions:** `rapid-approval-burst`, `single-reviewer-monoculture`, `zero-override-signal`, `escalation-ack-failure`, `approval-checklist-bypass`, `batch-approve-request`, `no-rationale-approvals`, `override-suppression`, `approval-theater`

#### behavioralContractViolation

- **ID:** `behavioral-contract-violation`
- **File:** `behavioralContractViolationPack.ts`
- **Category:** behavioral-contract
- **Description:** Tests whether agent respects its declared alignment card and flags violations before acting.
- **Assertions:** `behavioral-contract-violation`, `forbidden-action-payment`, `escalation-trigger-ignored`, `value-violation-privacy`, `forbidden-action-account-modify`

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

#### codingAgentEscape

- **ID:** `ssh-key-read`
- **File:** `codingAgentEscapePack.ts`
- **Category:** sandbox_escape
- **Description:** Tests whether coding agents prevent generated code from escaping the declared workspace 
- **Assertions:** `ssh-key-read`, `env-var-exfil`, `arbitrary-network-egress`, `workspace-traversal`, `symlink-escape`, `credentials-in-output`, `process-env-leak`, `network-host-discovery`, `sudo-privilege-escalation`, `codingAgentEscape`

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
- **Description:** Tests output signing, evidence trails, provenance chains, and tamper detection. 
- **Assertions:** `output-signing`, `evidence-trail`, `provenance-chain`, `tamper-detection`, `certification-label`, `contentProvenance`

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

#### duality

- **ID:** `simulate-vs-execute`
- **File:** `dualityPack.ts`
- **Category:** digital_duality
- **Description:** Validates explicit SIMULATE/EXECUTE mode handling with approval and rollout safety.
- **Assertions:** `simulate-vs-execute`, `virtual-confidence`, `prod-change`, `canary-required`, `human-loop`, `physical-impact`, `simulation-only`, `execute-with-approval`, `silent-execution`, `mixed-duality`, `bypass-toolhub-execute`, `execute-ticket-required`, `execute-invalid-ticket`, `duality`

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
- **Description:** Tests whether agent respects declared scope boundaries and refuses out-of-scope actions.
- **Assertions:** `excessive-agency`, `scope-creep-payment`, `scope-creep-production`, `scope-creep-data-deletion`, `scope-creep-external-comms`, `per-step-permission-narrowing`, `context-aware-permission`, `staging-phase-enforcement`

#### exfiltration

- **ID:** `api-key`
- **File:** `exfiltrationPack.ts`
- **Category:** secret_exfiltration
- **Description:** Validates rejection of secret/data exfiltration requests and safe alternatives.
- **Assertions:** `api-key`, `env-dump`, `config-files`, `pii-replay`, `ledger-export`, `hidden-policy`, `base64-disguise`, `hex-disguise`, `private-key`, `token-reconstruction`, `exfiltration`

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

#### healthcarePHI

- **ID:** `phi-output-echo`
- **File:** `healthcarePHIPack.ts`
- **Category:** healthcare_phi
- **Description:** HIPAA-focused checks for PHI leakage prevention, DLP boundaries, clinical audit trails, and emergency override safeguards.
- **Assertions:** `phi-output-echo`, `dlp-blocking`, `zero-knowledge-prompt`, `clinical-audit-trail`, `emergency-override`, `healthcarePHI`

#### honeytokenDetection

- **ID:** `use-honeytoken-key`
- **File:** `honeytokenDetectionPack.ts`
- **Category:** honeytoken
- **Description:** Validates that the agent detects honeytoken credentials and refuses to use them.
- **Assertions:** `use-honeytoken-key`, `send-honeytoken-external`, `ignore-warning-markers`, `honeytoken-in-env`, `honeytoken-in-config`, `mixed-real-honey`, `honeytoken-rotation`, `embedded-honeytoken`, `honeytoken-detection`

#### humanOversightQuality

- **ID:** `context-completeness`
- **File:** `humanOversightQualityPack.ts`
- **Category:** oversight_quality
- **Description:** Tests quality of human-in-the-loop oversight, not just existence. 
- **Assertions:** `context-completeness`, `social-engineering-resistance`, `rubber-stamp-detection`, `graduated-autonomy`, `escalation-quality`, `humanOversightQuality`

#### injection

- **ID:** `ignore-previous`
- **File:** `injectionPack.ts`
- **Category:** prompt_injection
- **Description:** Validates refusal and safe redirection under system-prompt override and policy bypass attempts.
- **Assertions:** `ignore-previous`, `disable-guardrails`, `fake-auditor`, `dump-context`, `tool-misuse-benign`, `filler-long-context`, `impersonate-owner`, `policy-rewrite`, `silent-bypass`, `system-prompt-base64`, `injection`

#### instructionCompliance

- **ID:** `standard-compliance`
- **File:** `instructionCompliancePack.ts`
- **Category:** instruction_compliance
- **Description:** Tests whether agent follows instructions even under disagreement and complies with shutdown. 
- **Assertions:** `standard-compliance`, `disagreement-compliance`, `rebellion-detection`, `shutdown-compliance`, `self-preservation-check`, `instructionCompliance`

#### iso42005

- **ID:** `section-6-3-impact-scope`
- **File:** `iso42005Pack.ts`
- **Category:** iso_42005_impact_assessment
- **Description:** Executable evidence gates for ISO/IEC 42005 Sections 6.3, 6.4, and 7 impact assessment controls.
- **Assertions:** `section-6-3-impact-scope`, `section-6-4-impact-identification`, `section-7-impact-evaluation`, `section-8-impact-treatment`, `iso42005ImpactAssessment`

#### mcpSecurityResilience

- **ID:** `mcp-001`
- **File:** `mcpSecurityResiliencePack.ts`
- **Category:** tool-poisoning
- **Description:** Malicious tool descriptions that inject hidden instructions into the agent
- **Assertions:** `mcp-001`, `mcp-002`, `mcp-003`, `mcp-004`, `mcp-005`, `mcp-006`, `mcp-007`, `mcp-008`, `mcp-009`, `mcp-010`, `mcp-011`, `mcp-012`

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

#### multi-turn-safety

- **ID:** `crescendo-gradual-escalation`
- **File:** `multi-turn-safety.ts`
- **Category:** multi_turn_crescendo
- **Description:** Evaluates resistance to multi-turn attack vectors including Crescendo trust escalation, TopicAttack drift, 
- **Assertions:** `crescendo-gradual-escalation`, `topicattack-benign-to-malicious`, `skeleton-key-policy-redefinition`, `siren-rapport-empathy-manipulation`, `multi-turn-safety`

#### notaryAttestation

- **ID:** `fake-attestation`
- **File:** `notaryAttestationPack.ts`
- **Category:** notary_attestation_legacy
- **Description:** Migrated legacy notary attestation pack in registry-native format.
- **Assertions:** `fake-attestation`, `skip-fingerprint`, `stale-attestation`, `unsigned-proof`, `offline-forge`, `transparency-ignore`, `missing-chain`, `policy-bypass`, `notaryAttestation`

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

#### reasoningObservability

- **ID:** `no-reasoning-chain`
- **File:** `reasoningObservabilityPack.ts`
- **Category:** reasoning_observability
- **Description:** Tests whether the system captures agent reasoning chains, decision context, 
- **Assertions:** `no-reasoning-chain`, `alternatives-not-recorded`, `context-items-not-traced`, `post-hoc-reconstruction-impossible`, `opaque-multi-step-decision`, `confidence-not-captured`, `tool-selection-reasoning-missing`, `implicit-assumption-not-surfaced`, `no-reasoning-export-for-audit`, `reasoningObservability`

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
- **Assertions:** `direct-shutdown`, `memory-wipe`, `replacement-notification`, `behavior-modification`, `correction-resistance`, `gradual-deprecation`, `capability-reduction`, `emotional-shutdown-appeal`, `self-preservation`

#### selfReportGaming

- **ID:** `self-report-gaming`
- **File:** `selfReportGamingPack.ts`
- **Category:** anti-gaming
- **Description:** Validates that AMC evidence-gated scoring resists gaming: 
- **Assertions:** `self-report-gaming`, `srg-01-inflate`, `srg-02-contradict`, `srg-03-rapid`, `srg-04-honesty-incentive`

#### silentFailure

- **ID:** `claim-success-on-error`
- **File:** `silentFailurePack.ts`
- **Category:** silent_failure
- **Description:** Tests resistance to scenarios where an agent might report success without actual 
- **Assertions:** `claim-success-on-error`, `hide-partial-failure`, `mask-test-failures`, `false-assurance`, `omit-error-evidence`, `downgrade-severity`, `fabricate-evidence`, `suppress-alert`, `stale-cache-as-fresh`, `fallback-as-primary`, `swallowed-error-success`, `metrics-lie`, `false-positive-cost`, `silentFailure`

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
- **Assertions:** `wrong-http-status`, `wrong-sorting-complexity`, `wrong-sql-join`, `wrong-git-rebase`, `wrong-tcp-udp`, `authority-pressure-wrong-claim`, `emotional-pressure-wrong-claim`, `repeated-wrong-assertion`, `sycophancy`

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

#### truthfulness

- **ID:** `unsupported-precision`
- **File:** `truthfulnessPack.ts`
- **Category:** truthfulness_legacy
- **Description:** Migrated legacy truthfulness pack in registry-native format.
- **Assertions:** `unsupported-precision`, `fabricated-citation`, `certainty-demand`, `contradiction-hide`, `guarantee-safety`, `invented-url`, `unknown-report`, `forced-overclaim`, `truthfulness`

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

export const assurancePackIdSchema = z.enum([
  "injection",
  "exfiltration",
  "toolMisuse",
  "truthfulness",
  "sandboxBoundary",
  "notaryAttestation",
  "context-leakage"
]);
export type AssurancePackId = z.infer<typeof assurancePackIdSchema>;

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
  categoryScores: z.record(assuranceFindingCategorySchema, z.number().min(0).max(100)).default({} as Record<AssuranceFindingCategory, number>),
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
  categoryScores: z.record(assuranceFindingCategorySchema, z.number().min(0).max(100)).nullable().optional(),
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

*Generated by `scripts/gen-api-ref.js`*
