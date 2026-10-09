# Ops Hardening

AMC ships a signed operations policy that controls retention, encryption-at-rest, backups, and maintenance.

## Policy
- File: `.amc/ops-policy.yaml`
- Signature: `.amc/ops-policy.yaml.sig`
- Commands:
  - `amc ops init`
  - `amc ops verify`
  - `amc ops print`

If the ops policy signature is invalid, retention/backup/maintenance flows fail closed and Studio `/readyz` returns `503`.

## Retention Model
- Commands:
  - `amc retention status`
  - `amc retention run --dry-run`
  - `amc retention run`
  - `amc retention verify`
- AMC never deletes ledger rows. It archives event payload history into signed segments and prunes payload fields with tombstones.
- Hash-chain integrity remains verifiable after archival/prune.

## Archive Segments
- Path: `.amc/archive/ledger/`
- Each segment has:
  - `segment_*.jsonl.gz`
  - `segment_*.manifest.json`
  - `segment_*.manifest.sig`
- `amc retention verify` checks segment signatures, segment hashes, and chain continuity.

## Why Rows Aren’t Deleted
- Evidence rows are hash-chained and signed.
- Deleting rows would break deterministic continuity and invalidate anti-tamper guarantees.
- AMC prunes payload columns only, while preserving event hashes and verification metadata.

## Residency routing (P2-01 source slice)

The residency gate is implemented in `src/residency/checkEgress.ts`. Its destination declarations live in `.amc/residency/destinations.yaml`, with an auditor signature in `destinations.yaml.sig`. The verifier parses the same bounded byte snapshot whose SHA-256 and signature it verifies. A registry edit requires a new signature. No registry is created automatically and no jurisdiction is inferred from DNS, IP addresses, a URL, or a filesystem path.

An active, verified compiled control plan makes a workspace regulated. The signed registry identifies the deployment profile used to compile that plan. AMC parses and normalizes the profile, then compares its canonical digest with the profile digest inside the verified plan. Data classes and source jurisdictions come from that profile's facts; network tools can additionally carry trusted authorization-record resource classes. Missing or unknown facts are evaluated conservatively. Model arguments and webhook payloads cannot choose their own data classification or policy workspace.

For protected traffic, an unavailable or invalid registry/profile, an ambiguous or unregistered destination, an unknown destination region, or a disallowed region blocks the request. Every applicable rule must be satisfied. A declared transfer basis can satisfy only rules that explicitly accept it; this metadata records an operator declaration, not a legal opinion or proof of the processor's physical location. A regulated registry without rules is refused. An unregulated workspace without a registry preserves the legacy path and returns `no_rule`; that is not a successful residency assessment.

The released wiring covers LLM runtime dispatch (including a supplied transport), native MCP HTTP requests and termination, the bridge's gateway hop, asynchronous callbacks, and the network-tool pipeline guard after the host allowlist. Automatic redirects are refused or returned without following them. The bridge check covers its immediate gateway destination; the gateway's final provider hop remains a separate integration requirement. Storage admission runs before `SessionService.open` starts a regulated session. The storage URL names an operator-declared destination and does not prove where a local disk, injected store, or remote backend actually resides.

A blocked request emits `RESIDENCY_ROUTE_BLOCKED`, carries a typed `EgressBlocked` decision, and records the affected control result as `not_evaluated`. A route decision never produces a legal approval or maturity pass. Experimental legal-rule content, named expert review, processor contracts, and validation of actual deployment regions remain separate work. This slice adds no approved legal rules.

## Workspace-scoped guard evidence

`emitGuardEvent` accepts `workspace`; otherwise it uses the workspace held by `withWorkspaceScope(workspace, fn)` through `AsyncLocalStorage`. Explicit and scoped calls select that workspace's `.amc/guard_events.sqlite` (or its existing CUTOVER evidence store), irrespective of a process-global database override. Receipts propagate their signing workspace to the event writer. Read and chain-verification APIs also accept a workspace. Retention passes its own workspace to `pruneGuardEvents(workspace, beforeIso)`.

The unscoped compatibility path is available only outside a regulated profile and labels event metadata with `workspaceResolution: "cwd-fallback"`. It preserves the legacy database environment override there. An unscoped regulated or unverifiable profile cannot write or prune another workspace through this fallback. The emitter's existing best-effort, never-throw contract remains: a missing scope can therefore lose an event rather than misfile it. Hosts must provide explicit workspace values or install the asynchronous scope at their entrypoints.

The DUAL_WRITE and CUTOVER stages keep their existing behavior; this change selects the workspace, not the rollout stage. Wiring all CLI, Studio and native-toolset entrypoints and assessment readers remains an integrator task because those files are owned by parallel work.

## Remaining P2-01 work

`scripts/egress-call-sites.json` records gated sites, justified exemptions, and explicitly deferred routes. It is a source inventory, not executed coverage evidence. In particular, direct ToolHub dispatch, the gateway's final upstream hop, shell proxy traffic, telemetry/webhook exporters, and other out-of-slice callers must be reviewed before claiming complete egress enforcement.

Legal-hold registry and deletion-executor gates remain deferred until the signing spine is available. Tests, architecture acceptance, qualification and legal approval were not performed for this source slice. P2-01 remains partial and unqualified.
