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

The released wiring covers LLM runtime dispatch (including a supplied transport), native MCP HTTP requests and termination, the bridge's gateway hop, asynchronous callbacks, and the network-tool pipeline guard after the host allowlist. Automatic redirects are refused or returned without following them. Both final gateway HTTP routes recheck their trusted workspace before every attempt; a residency refusal is terminal, returns HTTP 403 with `AMC_RESIDENCY_EGRESS_BLOCKED`, and does not charge the upstream circuit breaker. Direct ToolHub HTTP dispatch and the shared native HTTP executor also check before creating a socket, using workspace values supplied by their callers. These preflight refusals use the existing definite-failure contract; a subsequent network failure retains its existing uncertainty.

Gateway CONNECT validates authority form, preserving the host-only default of port 443 and accepting bracketed IPv6. Malformed authorities, user information, paths and query carriers are refused. After lease and DNS/allowlist admission, the final synchronous residency check uses the captured workspace and verified agent before opening a socket. A typed refusal returns fixed HTTP 403 and `AMC_RESIDENCY_EGRESS_BLOCKED`. The opaque payload has unknown classes; its canonical authority/root locator matches only host-wide or root-path registry declarations. It proves no TLS, HTTP path, payload classification or physical region. Header lease carriers remain supported.

Storage admission runs before `SessionService.open` starts a regulated session. The storage URL names an operator-declared destination and does not prove where a local disk, injected store, or remote backend actually resides.

A blocked request emits `RESIDENCY_ROUTE_BLOCKED`, carries a typed `EgressBlocked` decision, and records the affected control result as `not_evaluated`. A route decision never produces a legal approval or maturity pass. Experimental legal-rule content, named expert review, processor contracts, and validation of actual deployment regions remain separate work. This slice adds no approved legal rules.

## Workspace-scoped guard evidence

`emitGuardEvent` accepts `workspace`; otherwise it uses the workspace held by `withWorkspaceScope(workspace, fn)` through `AsyncLocalStorage`. Explicit and scoped calls select that workspace's `.amc/guard_events.sqlite` (or its existing CUTOVER evidence store), irrespective of a process-global database override. Receipts propagate their signing workspace to the event writer. Read and chain-verification APIs also accept a workspace. Retention passes its own workspace to `pruneGuardEvents(workspace, beforeIso)`.

The unscoped compatibility path is available only outside a regulated profile and labels event metadata with `workspaceResolution: "cwd-fallback"`. It preserves the legacy database environment override there. An unscoped regulated or unverifiable profile cannot write or prune another workspace through this fallback. The emitter's existing best-effort, never-throw contract remains: a missing scope can therefore lose an event rather than misfile it. Hosts must provide explicit workspace values or install the asynchronous scope at their entrypoints.

The DUAL_WRITE and CUTOVER stages keep their existing behavior; this change selects the workspace, not the rollout stage. The complete asynchronous tool pipeline carries its trusted workspace through approvals, guards, bodies, recording and nested Code Mode calls. Native session composition and every later prompt install the session's captured workspace scope; its lifetime callbacks also use that scope. Native HTTP MCP discovery and mounting pass their trusted workspace directly to the transport.

CLI `score collect-evidence` and `score operational-independence` scope their guard reads to the current workspace. Their command paths and output contracts are unchanged. Other CLI assessment paths, legacy Studio entrypoints, and external callers of the scoring APIs still need explicit workspace/scope integration before complete multi-workspace coverage can be claimed.

## Remaining P2-01 work

`scripts/egress-call-sites.json` records gated sites, justified exemptions, and explicitly deferred routes. It is a source inventory, not executed coverage evidence. Native DNS-awaiting final-hop transports, shell proxy traffic, telemetry/webhook exporters, and other out-of-slice callers must be reviewed before claiming complete egress enforcement.

Tests, architecture acceptance, qualification and legal approval were not performed for these source slices. P2-01 remains partial and unqualified.

## Legal-hold registry and deletion admission

Holds live under `.amc/residency/legal-holds/`. Each record and `HEAD.json` carries a domain-separated `legal-hold` artifact signature through the existing BUNDLE signing policy. HEAD binds the workspace path, verified tenant/workspace identity, total record count and digest of every modern and legacy record. The loader verifies bounded snapshots before parsing, and never skips an unreadable, malformed or unsigned hold. Tenant mapping comes from the active plan's pinned deployment profile, or a strictly verified legacy tenant boundary. Active holds with missing or mismatched mapping are unknown.

The register has three outcomes: `clear`, `held`, and `unknown`. A missing HEAD is unknown in a regulated workspace. Outside regulated profiles, a headless register can be considered only after strict legacy verification and emits a warning when clear. Modern records without HEAD, invalid signatures, count/digest mismatches and incomplete publication always refuse admission. Owner-only `initLegalHoldRegistry(workspace)` signs a HEAD over the actual verified register; it invents no hold, preserves a valid HEAD, and refuses repair of invalid state. There is no new CLI command.

Owner-only issue/release operations are synchronous and share a file lock with deletion effects. Records publish before HEAD, so an interrupted publication denies deletion. Releasing a verifiable legacy hold writes a signed inactive override bound to its original bytes, preserving that legacy record. Existing corrupt, unsigned or unreconstructible legacy envelopes require operator review; this slice neither discards nor reseals them. Explicit-workspace compatibility APIs use the verified register, while unscoped in-memory compatibility remains separate. The existing repair adapter also propagates the three outcomes.

`withDeletionGate` keeps the shared writer lock through the actual synchronous effect and rechecks nested scopes. It acknowledges `DELETION_ALLOWED` before invoking a delete. Held and unknown state produce `DELETION_DENIED_HELD` or `DELETION_DENIED_HOLD_UNKNOWN`; audit failure never permits an effect. Native async callbacks and PromiseLike results are refused, and callers must supply genuinely synchronous effects. These rows record AMC enforcement bookkeeping, not legal approval or maturity success.

The released hooks cover retention payload groups by session, blob unlinking with all current reference sessions, guard-event pruning, cache/log unlinking, scoped spill erasure, and direct spill-store purge/removal. A hold denial retains the data while other eligible groups or steps continue. Spill erasure reports `held` or `hold_unknown` as incomplete outcomes; they never count as successful removal. Guard pruning preserves its best-effort zero-return contract, so zero does not prove that hold evaluation succeeded.

Doctor's stale-cache cleanup also gates each `.amc/cache` unlink using its trusted workspace. A denial reaches the existing `FAILED` action report instead of being swallowed as an empty cache. Dry-run still skips the fix, and ordinary filesystem errors keep their previous best-effort handling. A denial on a later file can follow earlier admitted removals. Broken-symlink cleanup remains deferred.

Direct spill APIs cannot establish every signed reference from an object's owning session alone. They therefore check workspace-wide spill holds, even when a lifecycle caller also checked its authenticated session list. This can retain additional unrelated spill objects. Other destructive routes are explicitly deferred in `scripts/deletion-executors.json`; an inventory row is not an executed acceptance result.

For retention blobs, admission is acknowledged before the evidence database's immediate transaction. Inside that transaction, the executor rereads the complete ordered reference snapshot and retains the blob if it differs from the admitted snapshot or is no longer eligible. Only a matching snapshot proceeds to unlink while both the hold lock and database write lock remain held. A skipped transaction writes `RETENTION_BLOB_DELETE_SKIPPED` afterward, with `removed: false` and its reason; the admission row does not establish deletion. This avoids calling the audit's separate database connection while holding the write transaction. Filesystem publication outside that transaction, uncoordinated imports, rollback after unlink and concurrent-reference qualification remain open; SQLite rollback cannot restore deleted bytes.

The current register allows 1,024 total modern/legacy rows, with 64 KiB records and 16 KiB signature snapshots. Writers require POSIX ownership. Workspace-path binding and local signatures do not establish portable legal trust or a rollback checkpoint. Retention minimums, physical-region validation, a legal reviewer, migration/recovery tools and executable qualification remain separate work.
