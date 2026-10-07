# AMC threat model, channel map and failure policy

Status: draft for review (plan issue P0-11). Verified against `main` at `e25cce1a` on 2026-10-07; P1-05 updated the `native-shell` and `network-egress` rows for the macOS Seatbelt shell and the shell egress proxy (see [ADR-008](../adr/008-native-shell-containment.md)). P1-43 added the `native-tool-breadth` row and the web tools' egress to `network-egress` (see [NATIVE_TOOLS.md](../NATIVE_TOOLS.md)). P1-02 updated the `tool-pipeline` row and the `approval-stale-or-changed` failure row for the authorization record (see [ADR-009](../adr/009-authorization-record.md)). Sid's review of the residual-risk statements and the status column is pending.

This document replaces the February 2026 threat model, which is kept at [`docs/archive/THREAT_MODEL-2026-02.md`](../archive/THREAT_MODEL-2026-02.md). AMC claims enforcement only at a boundary it controls. Every path by which an agent, a tool or an attacker can cause an effect or change evidence is listed below as a channel, with its enforcement point, its evidence and its known gaps.

The channel table and the failure policy are normative. Their machine-readable form is [`channel-map.json`](channel-map.json) (schema: [`channel-map.schema.json`](channel-map.schema.json)). `npm run check:threat-model` runs in CI and fails when a cited file or symbol no longer exists, an owner is not a plan key (`P0-00`, `D-00` or `GATE-G0` form), an ASI id is outside ASI01 to ASI10, or a failure row names neither a test nor an owner. Line numbers drift, so the map stores a file and a symbol, and the check confirms the symbol is still in the file. When you change an enforcement point, update the map and this document in the same change.

## How to read the status column

- `enforced`: code at the named point refuses the effect in the default composition. Opt-outs and known paths around it are listed as bypasses, and enforcement holds only at that point.
- `observed`: the effect is recorded but not refused.
- `advisory`: the control depends on a trusted operator or on a caller choosing to use it.
- `none`: nothing at this point refuses or records the effect.

A signature on a row proves who wrote the row and that it has not changed since, not that its content is true. Missing evidence means "not evaluated".

## Assets

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Signing keys and the vault | `.amc/keys`, `src/crypto/keys.ts`, `src/vault/vault.ts` | Whoever holds them can sign evidence, policies and approvals as the workspace. |
| Evidence ledger and session store | `.amc/evidence.sqlite` (`src/ledger/ledger.ts`, `src/ledger/ledgerVerification.ts`), the JSONL session store (`src/persistence/jsonl/`) | Every score, gate and report reads them. Tampering or loss changes results. |
| Signed policies | `.amc/tools.yaml`, the runtime firewall policy, budgets, `.amc/action-policy.yaml`, `amc.config.yaml` | They decide what the tool pipeline allows. |
| Approvals and leases | `src/approvals/approvalEngine.ts`, `src/leases/` | They authorize effects that policy holds for a human. |
| Provider and MCP credentials | `src/credentials/`, MCP server env and header references | Disclosure lets an attacker spend money or act as the operator on other systems. |
| Protected data in prompts, tool output and spill | model context, tool results, `src/session/spill/` | PHI, PII and customer data can leave through providers, logs, exports or tools. |
| Customer systems | reached through tools, MCP servers and adapters | The effects AMC exists to govern happen here. |
| Trust lists | pinned issuer keys (P0-09) | They decide whose signatures verifiers accept. |
| Release artifacts | the npm package, container images, the Helm chart | A tampered artifact compromises every installation. |

## Actors

| Actor | Capability assumed |
| --- | --- |
| Malicious content | Prompt injection through files, web pages, tool results, MCP results and imports. It controls text the model reads, not code. |
| Compromised tool or MCP server | Returns hostile results; an MCP stdio server also runs as a local process with the user's rights. |
| Insider operator | Holds the vault passphrase and local file access, so can sign as the workspace and edit any local store. |
| Malicious extension | Code the operator installed that runs inside AMC's extension runtime. |
| Network attacker | On the path to providers or MCP HTTP servers; can observe or alter unprotected traffic. |
| The model itself | Acts outside its instructions: calls tools it should not, or reports work it did not do. |
| Co-tenant on a shared host | Another user or process on the same machine that can read world-readable files or reach local ports. |

## Channel table

Statuses follow the rule above. Owners are plan keys that own the open gaps; a control that a landed plan issue established is named in the gaps column.

| Id | Channel | Enforcement points (file, symbol) | Evidence | Status | Gaps and owners |
| --- | --- | --- | --- | --- | --- |
| `tool-pipeline` | Tool pipeline | `src/tools/toolPipeline.ts` `ToolPipeline`, `askApproval`; guards composed in `src/agent/agentToolset.ts` `agentToolset`; `src/actions/authorize.ts` `bindAuthorization`, `recheckAuthorization`; `src/tools/toolEvidence.ts` `toolEvidenceFor` | Tool evidence rows (audit, metric, stdout descriptor) carrying `authorizationId` and `authorizationDigest`; an `AUTHORIZATION_RECORD` row per authorized call | enforced (in-process) | Recorder failure swallowed (P1-03); tenant, deployment and control ids unregistered (P1-12); `domainRules` unread (P1-12) |
| `native-shell` | Native shell | `src/sandbox/nativeShellGate.ts` `nativeShellReadiness`; `src/sandbox/nativeSandboxBinding.ts` `createNativeSandboxBash`; `src/sandbox/bwrapBackend.ts` `bwrapBackend`; `src/sandbox/seatbeltNativeShell.ts` `seatbeltNativeShell`; `src/tools/builtin/bashTool.ts` `bashTool` | `NATIVE_SHELL_CONFINEMENT` rows naming `boundary` and `network`; `NATIVE_SHELL_EGRESS` rows; an audit row before each opted-in unconfined command | enforced on Linux (Bubblewrap) and macOS (Seatbelt, P1-05); elsewhere the shell is absent, and on macOS without Seatbelt it is unconfined only with the operator's opt-in | macOS reads outside the deny-list stay open, and five Mach services, POSIX shared memory and IOKit are reachable; Linux shell egress relay (ADR-008, P1-05); escape suite in CI (P1-05); Windows runner (P2-14) |
| `fs-tools` | fs tools | `src/tools/builtin/fsTools.ts` `insideWorkspace`; `src/tools/builtin/readBeforeEdit.ts` `ReadBeforeEditLedger`; `src/toolhub/toolhubValidators.ts` `validateToolRequest` | Tool evidence rows | enforced (in-process; literal edits landed in P0-05) | File-tool parity (P1-36); the shell and MCP servers reach the same files without these checks |
| `network-egress` | Network egress | `src/tools/guards/policyGuards.ts` `networkEgressGuard` (NETWORK_EXTERNAL tools only); `src/enforce/egressAllowlist.ts` `decideEgress`; `src/gateway/server.ts` `hostAllowed`, `createProxyServer`; `src/sandbox/egress/shellEgressProxy.ts` `startShellEgressProxy`; `src/tools/builtin/nativeToolBreadth/governedFetch.ts` `governedGet` (web tools, P1-43); `src/gateway/requestFieldGuard.ts` `prepareFieldGuard` (field guard, P1-24) | Gateway `NETWORK_EGRESS_BLOCKED` rows; `NATIVE_SHELL_EGRESS` rows for every shell proxy decision; `NATIVE_WEB_EGRESS` rows for every web tool egress decision | enforced for declared network tools, gateway-proxied traffic, the native shell (no network, or the signed allowlist proxy on macOS) and the native web tools (signed origins, then `decideEgress` with one resolution and a connection to the checked address) | Linux shell egress relay (ADR-008, P1-05); no workspace-wide egress allowlist shared by in-process tools (P2-13); `src/enforce/egressProxy.ts` is not a proxy (proposed follow-up) |
| `native-tool-breadth` | Native web and session tools | `src/agent/nativeToolCapabilities.ts` `NATIVE_BUILTIN_CAPABILITIES`; `src/tools/builtin/nativeToolBreadth/originPolicy.ts` `loadOriginPolicy`; `governedFetch.ts` `governedGet`, `labelUntrusted`; `nativeReceipt.ts` `receiptedBody`; `sessionListTool.ts` `readSessionList`; `src/tools/builtin/askUserTool.ts` `askUserTool` | One `NATIVE_WEB_FETCH`, `NATIVE_WEB_SEARCH`, `NATIVE_ASK_USER`, `NATIVE_TODO` or `NATIVE_PLAN` receipt (allow, deny or fail) per executed call; `NATIVE_WEB_EGRESS` rows; tool evidence rows for every call | enforced: registered (P1-43) and denied until a signed tools policy lists each tool | Profiles that enable them, an `ask_user` answerer and a search provider (P2-13); the todo and plan ledger check does not see deletion of the newest rows of an open session until the writer next appends |
| `mcp-stdio` | MCP stdio | `src/mcp/nativeMcpClient.ts` `mountNativeMcpServer` (catalog digest pin), `StdioClientTransport` spawn | Tool evidence rows; mount refusals | enforced for calls; the server process is unconfined | Containment (proposed follow-up). 2026-07-28 negotiation landed in P1-39; the completed-call report was corrected in P0-13 |
| `mcp-http` | MCP HTTP | `src/mcp/nativeMcpHttpTransport.ts` `nativeMcpHttpEndpoint` (origin pin), `NativeMcpHttpTransport` (redirect refusal, stateless 2026-07-28 requests); `src/mcp/nativeMcpClient.ts` `negotiate` (version in the reviewed digest); `src/mcp/oauth/discovery.ts` `discoverNativeMcpAuthorizationServer` (issuer equality, S256); `src/mcp/oauth/authorize.ts` `validateNativeMcpAuthorizationResponse` (state, `iss`); `src/mcp/oauth/tokenStore.ts` `NativeMcpOAuthTokenStore` (grants keyed by issuer and resource) | Tool evidence rows; mount receipt (protocol, OAuth issuer) | enforced by origin pin; OAuth landed in P1-39 | A broken 2026-07-28 `tools/call` is reported as `TOOL_OUTCOME_UNKNOWN`, not replayed; the authorization-server issuer is not pinned in config (proposed follow-up); fixture tests owed (P1-39) |
| `provider-calls` | Provider calls | `src/llm/adapter/llmRuntime.ts` `reserveNativeModelBudget`; `src/llm/adapter/providerCapabilities.ts` `assertRequestCapabilities`; `src/llm/adapter/adapterRegistry.ts` `PinnedRoute` | Signed `request/header` and settlement rows | enforced before spend | Residency (P2-01) |
| `imports` | Imports | `src/ledger/trustTierValidation.ts` `assertTrustTierProvenance`; `src/importers/piSessionImport.ts`; `src/importers/dshSessionContract.ts`; `src/eval/evalImporters.ts`; `src/ingest/ingest.ts` `attestIngestSession` | Import receipts; imported rows are `SELF_REPORTED` unless a pinned third-party attestation binds them | enforced (tiers come from provenance since P0-18) | Original bytes not preserved, DSH v4 (P1-24) |
| `studio` | Studio API and UI | `src/studio/studioServer.ts` `authenticate`; `src/studio/nativeAdmission.ts` `nativeCsrfTokenForSession`, `nativeAllowedBrowserOrigins` | Native task events | enforced at HTTP | Claim-kind labels (P0-23); D-06 |
| `cli` | CLI | `src/cli.ts` (`skipVault`); `src/vault/vault.ts` `unlockVault` | Ledger rows for the commands that write them | advisory (the operator is trusted) | Claim-kind labels (P0-22); `--skip-vault` passphrase (proposed follow-up) |
| `sdk-acp` | SDK and ACP | `src/acp/acpAgentServer.ts` `createAcpAgent` (`amc acp` defaults to `--tools none`); `src/sdk/nativeAgentClient.ts` `AMCNativeClient` | The same session spine | enforced through the same toolset | One execution API (P2-13) |
| `extensions` | Extensions | `src/extensions/nativeExtensionRuntime.ts` `loadNativeExtensions`; `src/plugins/nativeExecutableRunner.ts` `NativeExecutableRunner` (Bubblewrap only) | Extension load receipts | enforced; executables refused outside Linux | Installed acceptance (P0-31) |
| `managed-hooks` | Managed hooks | `src/adapters/managedHookLease.ts` `verifyManagedLease`; `src/bridge/hookControl.ts` `evaluateProviderHookControl` | Hook control results | enforced at the hook | Security mutation batch (P0-30) |
| `notary` | Notary | `src/notary/notaryAuth.ts` `verifyNotaryRequestAuth` (HMAC over time, method, path and body hash); `src/notary/notaryServer.ts` `startNotaryServer`; `src/notary/notaryLog.ts` `appendNotaryLogEntry` | Notary log | enforced | P0-30; key providers (P2-08) |
| `helm-compose` | Helm and Compose | `deploy/helm/amc/templates/secret.yaml` (`change-me` values); `deploy/compose/docker-compose.yml` (file secrets) | None at deploy on main | none | Helm passphrase (P0-14); base images (P0-35) |

## STRIDE per channel

Each block names the threat, the control today and the gap. "Not applicable" carries its reason.

### Tool pipeline

- Spoofing: a model or sub-call claims another agent's identity. Control: the pipeline takes `agentId` from the composed session and Code Mode sub-calls carry a parent token. Gap: no workload identity or delegation chain (P2-25).
- Tampering: a filter or guard launders a denial into an allow. Control: stage order is fixed (approval, then guards, then body, then filters) and filters rewrite output only. Gap: guard and policy files are trusted once loaded; domain guardrails are not compiled in (P1-12).
- Repudiation: a call happens with no record. Control: `toolEvidenceFor` writes audit and metric rows for every call. Gap: a recorder that throws after the body ran is swallowed, so the effect stands without its row (P1-03, P1-04).
- Information disclosure: tool output carries secrets into the model or the ledger. Control: evidence rows hold an output hash, not the output; provider keys are scrubbed from the shell environment. Gap: no redaction of protected data before the model (P2-02).
- Denial of service: a call that never ends. Control: the turn's cancellation signal reaches the tool body; the shell and MCP calls have timeouts. Gap: no general per-call time limit in the pipeline.
- Elevation of privilege: an approval authorizes a different effect than the one reviewed. Control: approval is asked before guards and a guard denial is final; the approval binds the call's authorization intent, and the authorization record is rechecked after the guards and its approvals consumed before the body (P1-02). Gap: exceptions and break-glass are not part of the record (P2-24); a freeze incident that fails to parse or verify is ignored rather than reported.

### Native shell

- Spoofing: not applicable; the shell runs as the operator's user and claims no identity of its own.
- Tampering: a command writes outside the workspace. Control: Bubblewrap mounts only the writable roots on Linux; the Seatbelt profile allows writes only to the signed roots, a private TMPDIR and `/dev/null` on macOS; both refuse grants holding preexisting hard links, and Seatbelt denies creating hard links. Gap: an opted-in unconfined shell on macOS without Seatbelt can write anywhere the user can.
- Repudiation: a command runs without a record. Control: `NATIVE_SHELL_CONFINEMENT` rows on both platforms, `NATIVE_SHELL_EGRESS` rows before each proxy decision takes effect, and an audit row before each unconfined command. Gap: none known beyond the recorder failure in the tool pipeline.
- Information disclosure: a command reads keys or sends data out. Control: provider keys are stripped from the environment; on Linux only the workspace and runtime are mounted and sockets are denied; on macOS credential stores, `.amc` and `readDeny` are denied, and networking is denied except the signed allowlist proxy. Gap: on macOS other files stay readable; Mach lookups are limited to five system services (the temporary-directory helper, logging, notifications, user and group lookups), and POSIX shared memory and IOKit are not restricted; a host allowlist cannot stop domain fronting through a listed host.
- Denial of service: a fork bomb or runaway process. Control: timeouts, process-tree exit checks and an RLIMIT_NPROC cap of the user's count plus `maxProcesses` (P1-05). Gap: no memory or CPU limits; RLIMIT_NPROC counts all of the user's processes.
- Elevation of privilege: escape from the sandbox. Control: Bubblewrap with a seccomp socket filter on Linux; Seatbelt on macOS, applied before the command starts and measured by an in-profile probe, which also denies opening apps, AppleEvents, launchd job creation, Mach lookups outside five system services, and signals to and inspection of processes outside the shell's group; the shell is absent elsewhere. Gap: `sandbox-exec` is deprecated and the escape suite does not run in CI yet (P1-05); no Windows runner (P2-14).

### fs tools

- Spoofing: not applicable; file tools act for the composed agent and do not authenticate a peer.
- Tampering: an edit escapes the workspace through `..` or a symlink. Control: `insideWorkspace` resolves paths inside the workspace; edits require a prior read (`ReadBeforeEditLedger`). Gap: the shell and MCP servers bypass these checks.
- Repudiation: an edit without a record. Control: tool evidence rows. Gap: the recorder failure in the tool pipeline.
- Information disclosure: reading secrets inside the workspace, such as `.amc/keys`. Control: `validateToolRequest` applies path patterns on the ToolHub, managed-hook and confined-shell paths; the native fs tools rely on `insideWorkspace`. Gap: whether native `fs.read` can read `.amc` was not re-verified in this review.
- Denial of service: very large reads or writes. Control: output byte accounting. Gap: no recorded size policy.
- Elevation of privilege: writing a signed policy file to widen the agent's rights. Control: policies are signature-checked when loaded, so an unsigned edit is refused. Gap: a holder of the vault passphrase can re-sign.

### Network egress

- Spoofing: a DNS or host-header trick makes a blocked host look allowed. Control: the gateway, the shell proxy and the native web tools share `decideEgress`; the shell proxy and the web tools resolve a listed name once, refuse non-public addresses unless the IP literal is listed, and connect to the checked address; the web tools refuse redirects. Gap: the gateway resolves nothing itself, so its address rule reaches IP-literal hosts only, and an allowed name can still resolve to a private or metadata address (P1-59, proposed). Once a route sets `refuseRequestFields`, the gateway proxy resolves each target once, refuses any name, subdomain or address shared with a guarded upstream (and every host when a guarded upstream does not resolve), and connects only to a checked address (P1-24); guarded upstream addresses are resolved once at gateway start, so an address the provider adds later is matched only by name.
- Tampering: an attacker alters traffic to a provider. Control: TLS to providers. Gap: none known at this boundary.
- Repudiation: egress with no record. Control: `NETWORK_EGRESS_BLOCKED` rows for gateway refusals; `NATIVE_SHELL_EGRESS` rows for every shell proxy decision; `NATIVE_WEB_EGRESS` rows before every web tool connection, where a decision that cannot be recorded is a refusal. Gap: allowed egress through an MCP server leaves no row.
- Information disclosure: exfiltration through a tool that opens its own socket. Control: `networkEgressGuard` for NETWORK_EXTERNAL tools; the native shell has no direct network. Gap: MCP stdio servers and extensions are not routed through a proxy.
- Denial of service: a tool floods an external host. Control: none specific. Gap: no egress rate policy.
- Elevation of privilege: an undeclared network tool. Control: tools declare an action class at registration. Gap: `checkEgressRequest` in `src/enforce/egressProxy.ts` looks like a control but enforces nothing (proposed follow-up).

### Native web and session tools

- Spoofing: an `ask_user` answer that no human gave. Control: the answer must verify against the workspace auditor key, which the agent process does not hold, and bind the question id, digest and session; a monitor-signed answer is refused. Gap: the signature identifies the key holder, not the human.
- Tampering: an older, validly signed `todo` or `plan` record is put back in place. Control: each write records the record's digest in the session ledger before the file is written, and each read compares the file with the latest receipt from the verified chain. Gap: deleting the newest rows of an open session as well is caught only when the session writer next appends.
- Repudiation: a call with no record. Control: exactly one call receipt per executed call, written before content is returned or a record is written; a receipt that cannot be written fails the call. Gap: the recorder failure in the tool pipeline for its own rows.
- Information disclosure: data sent out in a fetched URL. Control: granted origins only, no caller headers, URLs with credentials or secret-looking values refused, `decideEgress` before every connection. Gap: anything in the path or query to a granted origin.
- Denial of service: a large or slow response. Control: a byte cap counted as bytes arrive, a 20 s default timeout and at most 3 provider requests per search. Gap: none known.
- Elevation of privilege: fetched text steers the agent. Control: content reaches the model in a random fence labelled untrusted data, never instructions or evidence; receipts carry digests, not content; every effect still passes the guards. Gap: labelling reduces but does not remove prompt injection.

### MCP stdio

- Spoofing: a server presents a different catalog than the one reviewed. Control: `mountNativeMcpServer` refuses a catalog whose digest differs from the pinned one and re-checks it per call. Gap: none known for calls.
- Tampering: a server changes tool schemas after review. Control: per-tool schema pins and the catalog digest. Gap: none known for calls.
- Repudiation: a call without a record. Control: tool evidence rows. Gap: actions the server process takes on its own leave no row.
- Information disclosure: the server reads workspace files or environment secrets. Control: server secrets are scrubbed from results. Gap: the process runs with the user's rights, the workspace as cwd and the default environment (proposed follow-up).
- Denial of service: a hung server. Control: call timeouts (1 to 300,000 ms) and a 4 MiB buffer limit. Gap: none known.
- Elevation of privilege: the server acts outside any granted tool. Control: none; only calls are governed. Gap: containment (proposed follow-up).

### MCP HTTP

- Spoofing: a redirect or an endpoint change points AMC at another server. Control: `nativeMcpHttpEndpoint` requires a pinned HTTPS origin (loopback HTTP for development) and the transport refuses redirects. A downgrade forced by breaking the protocol probe changes the reviewed catalog digest, which covers the negotiated version, so the mount is refused. Gap: none known.
- Tampering: a network attacker alters results. Control: HTTPS. Gap: none known at this boundary.
- Repudiation: a call without a record. Control: tool evidence rows; when a 2026-07-28 response stream breaks during `tools/call`, the call is not re-issued and its row records `TOOL_OUTCOME_UNKNOWN`. Gap: the recorder failure in the tool pipeline; the remote effect of an outcome-unknown call is unrecorded.
- Information disclosure: credentials sent to the wrong origin. Control: URL credentials, queries and fragments are refused and requests are sent with `credentials: "omit"`. OAuth tokens go only in the `Authorization` header to the pinned endpoint, and only when the server's current protected-resource metadata names this endpoint and the issuer the grant is stored under. Gap: none known.
- Denial of service: a slow server. Control: timeouts and session-expiry refusal. Gap: none known.
- Elevation of privilege: a server steers OAuth to an authorization server of its choosing or widens scopes. Control: OAuth runs only from `mcp-catalog --authorize`, where the operator approves in the browser; issuer equality, S256 PKCE, `state`, `iss` and the resource indicator are checked; scope step-up is bounded to two rounds; runs never re-authorize. Gap: the issuer is not pinned in config (proposed follow-up).

### Provider calls

- Spoofing: a route resolves to a different adapter than configured. Control: `PinnedRoute` holds the adapter object, not its id. Gap: none known.
- Tampering: usage or cost figures are edited after the fact. Control: signed request and settlement rows; budget reservations are chained. Gap: none known.
- Repudiation: a model call with no record. Control: the signed `request/header` row precedes dispatch. Gap: none known.
- Information disclosure: protected data sent to a provider in a region it may not leave. Control: none at the route. Gap: residency (P2-01); `bridgeResidencyHook` is unused.
- Denial of service: spend exhaustion. Control: `reserveNativeModelBudget` refuses before dispatch when the budget or its ledger cannot be read; a ledger that fails verification is reported as `AMC_EVIDENCE_INTEGRITY`, not QUOTA (P0-27). Gap: none known.
- Elevation of privilege: a request uses a capability the provider route was not admitted for. Control: `assertRequestCapabilities`. Gap: none known.

### Imports

- Spoofing: an import claims to be observed or third-party attested. Control: `assertTrustTierProvenance` refuses `OBSERVED` for imported evidence and `ATTESTED` without a pinned third-party attestation. Gap: none known.
- Tampering: imported files are altered before import. Control: format and size limits (`DSH_IMPORT_LIMITS`, `PI_SESSION_SUPPORTED_VERSION`) and import receipts. Gap: original bytes are not preserved (P1-24).
- Repudiation: an operator denies having imported data. Control: import receipts in the ledger. Gap: none known.
- Information disclosure: imports bring protected data into the workspace. Control: none specific. Gap: redaction (P2-02).
- Denial of service: oversized imports. Control: byte, line, event and depth limits. Gap: none known.
- Elevation of privilege: imported text injects instructions into later model turns. Control: imported rows are `SELF_REPORTED`, which no regulated result treats as positive. Gap: context poisoning is not filtered (P1-37, P1-24).

### Studio API and UI

- Spoofing: a forged `X-Forwarded-For` or another origin impersonates an allowlisted client. Control: forwarded IPs are trusted only from an allowlisted peer (`tests/studioIpAllowlistProxyTrust.test.ts`); native task routes require the CSRF token and an allowed origin. Gap: none known.
- Tampering: a cross-site request mutates approvals. Control: `nativeCsrfTokenForSession` and the native intent header. Gap: none known.
- Repudiation: an operator action without a record. Control: native task events. Gap: not verified for every legacy route in this review.
- Information disclosure: an unauthenticated caller reads workspace data. Control: `authenticate` and the CIDR allowlist. Gap: none known.
- Denial of service: request floods. Control: rate limits on auth, write and pairing routes. Gap: none known.
- Elevation of privilege: Studio's CLI bridge enables an unconfined shell. Control: refused on the HTTP bridge since P0-06. Gap: output still lacks claim-kind labels (P0-23).

### CLI

- Spoofing: not applicable; the CLI acts as the local operator, who is trusted by design.
- Tampering: an operator edits local stores directly. Control: signatures and hash chains make edits detectable by verification. Gap: the operator holds the passphrase and can re-sign.
- Repudiation: a command leaves no trace. Control: ledger rows for the commands that write them. Gap: no per-command record in general.
- Information disclosure: the vault passphrase is guessable. Control: none. Gap: `amc init --skip-vault` sets it to `"skip-vault-"` plus `Date.now()` (proposed follow-up).
- Denial of service: not applicable; a local operator can always stop their own tool.
- Elevation of privilege: output is read as a stronger claim than it is. Control: truth rules in output text. Gap: claim-kind labels (P0-22).

### SDK and ACP

- Spoofing: an ACP client poses as another agent. Control: the ACP process is local and its credential source is fixed when it starts. Gap: no workload identity (P2-25).
- Tampering: a client changes the tool policy mid-session. Control: `--expected-tools-digest` refuses calls after the signed policy digest changes. Gap: the flag is optional.
- Repudiation: an SDK call without a record. Control: the same session spine as the native runtime. Gap: none known.
- Information disclosure: tools exposed to an ACP client by default. Control: `amc acp` defaults to `--tools none`. Gap: none known.
- Denial of service: a client floods prompts. Control: none specific. Gap: one execution API with shared limits (P2-13).
- Elevation of privilege: `AMCNativeClient` turns a bridge lease into execution authority. Control: it spawns the governed ACP runtime and does not. Gap: none known.

### Extensions

- Spoofing: an extension impersonates a pinned one. Control: `loadNativeExtensions` loads snapshots pinned by manifest digest. Gap: not re-tested against a forged pin in this review.
- Tampering: extension code changes after install. Control: pins and load receipts. Gap: none known.
- Repudiation: an extension acts without a record. Control: extension load receipts. Gap: actions inside an executable extension are recorded only as its run.
- Information disclosure: an extension reads `.amc`. Control: the Bubblewrap runner masks `.amc` in its read-only workspace mount. Gap: none known on Linux.
- Denial of service: a runaway executable. Control: run deadlines in `NativeExecutableRunner`. Gap: none known.
- Elevation of privilege: an executable escapes confinement. Control: Bubblewrap only; refused on other platforms. Gap: installed acceptance on the release candidate (P0-31).

### Managed hooks

- Spoofing: a forged hook call. Control: `verifyManagedLease` checks the lease. Gap: none known.
- Tampering: a provider response rewritten to allow. Control: `evaluateProviderHookControl` and response validation. Gap: none known.
- Repudiation: a hook decision without a record. Control: hook control results. Gap: none known.
- Information disclosure: hook payloads carry prompts and tool arguments. Control: a 256 KiB body limit; payload handling not re-reviewed here. Gap: redaction (P2-02).
- Denial of service: the hook endpoint is slow or down. Control: the harness's own hook timeout. Gap: fail-open or fail-closed behaviour depends on the harness.
- Elevation of privilege: the harness runs without the hook. Control: none from AMC's side. Gap: enforcement holds only while the hook is called (P0-30).

### Notary

- Spoofing: a forged signing request. Control: `verifyNotaryRequestAuth` checks an HMAC over time, method, path and body hash. Gap: none known.
- Tampering: a replayed request. Control: a replay guard on authenticated requests. Gap: none known.
- Repudiation: a signature with no log entry. Control: `appendNotaryLogEntry` writes a signed log. Gap: none known.
- Information disclosure: the notary key leaks. Control: a sealed key file or an external signer command. Gap: no native KMS, HSM or PKCS#11 provider (P2-08).
- Denial of service: request floods. Control: requests are authenticated before signing. Gap: no rate limit verified in this review.
- Elevation of privilege: a notary signature read as proof of truth. Control: the truth rule that a signature proves origin and integrity only. Gap: not every verifier output states this; claim-kind labels (P0-22, P0-23).

### Helm and Compose

- Spoofing: not applicable at deploy time; identity is set by the secrets below.
- Tampering: an unpinned base image changes underneath a deployment. Control: none on main. Gap: digest pins (P0-35).
- Repudiation: not applicable; deployment manifests produce no evidence on main.
- Information disclosure: default secrets. Control: Compose reads operator-created secret files. Gap: the Helm secret template ships `change-me` values for the vault, owner and notary secrets (P0-14).
- Denial of service: not evaluated at deploy time in this review.
- Elevation of privilege: a deployment that keeps the `change-me` vault passphrase gives anyone with the chart its signing authority. Control: none. Gap: P0-14.

## Verified bypasses

Each item was read in the code at `e25cce1a`. File and symbol, not line numbers, are the stable reference.

1. `domainRules` is written by `applyDomainToAgent` in `src/domains/domainApply.ts` and read nowhere (`git grep -n domainRules -- src` finds only that file). Owner: P1-12.
2. MCP stdio servers are spawned unconfined with the user's rights: `src/mcp/nativeMcpClient.ts` builds a `StdioClientTransport` with the workspace as `cwd` and the default environment plus the server's env. Only the calls are governed. Owner: proposed follow-up.
3. `bridgeResidencyHook` in `src/ops/productionWiring.ts` compares caller-supplied regions and is only re-exported from `src/index.ts`; nothing calls it. Owner: P2-01.
4. Guard events go to `process.cwd()/.amc/guard_events.sqlite` (`guardEventsDbPath` in `src/enforce/evidenceEmitter.ts`, overridable by `AMC_GUARD_EVENTS_DB_PATH`), not to the workspace, and `pruneGuardEvents` deletes across every agent in that file. Owner: P2-01.
5. A recorder failure after a tool ran is swallowed in `ToolPipeline.execute` (`src/tools/toolPipeline.ts`). Owners: P1-03, P1-04.
6. `src/enforce/egressProxy.ts` (`checkEgressRequest`) is not a proxy, is called only by `tests/enforce-full.test.ts`, allows every host when its list is empty, and logs every decision as `agentId: 'system'`. The enforcing forward proxy is the gateway's (`hostAllowed`, `createProxyServer` and the CONNECT handler in `src/gateway/server.ts`). Owner: proposed follow-up.
7. Strict evidence binding turns off when `STRICT_EVIDENCE_BINDING` is `0`, `false`, `off` or `no` (`isStrictEvidenceBindingEnabled` in `src/diagnostic/runner.ts`). Owner: P1-12 (silent opt-outs).
8. `amc init --skip-vault` sets `AMC_VAULT_PASSPHRASE` to `"skip-vault-" + Date.now()` (`src/cli.ts`). Owner: proposed follow-up.
9. Retention deletes without a legal-hold check (`runRetention` in `src/ops/retention/retentionEngine.ts`). Owner: P2-01.

Corrected since the plan snapshot: break-glass overrides are no longer saved as `"unsigned"` without a key. `activateOverride` in `src/governor/emergencyOverride.ts` signs the override digest and throws before writing when it cannot.

## Failure policy

Normative. "Today on main" is what the code does at `e25cce1a`; a row is met only where that column says so. A test listed for a row pins the part of the required behaviour that holds today, not the whole row.

| Id | Failure | Required behaviour | Evidence state | Today on main | Tests | Owners |
| --- | --- | --- | --- | --- | --- | --- |
| `authority-store-unavailable` | Authority or mandatory evidence store unavailable before a protected effect | No new protected effects | Denied, with the reason | Budget admission refuses when its ledger cannot be read or its chain is broken (`reserveNativeModelBudget`); no general rule | `tests/nativeBudgets.test.ts` | P1-03; fault test P1-04 |
| `recorder-fails-after-effect` | Evidence recorder fails after the effect happened | The effect stands; dependent actions wait; reconcile with the system of record | Evidence incomplete | The effect stands and the caller sees the real outcome; the error is swallowed and only a missing row shows it (`ToolPipeline.execute`); nothing waits or reconciles | `tests/toolEvidenceRecording.test.ts` | P1-03, P1-04 |
| `process-dies-before-receipt` | Process dies between dispatch and receipt | No automatic replay; reconcile by idempotency key | Outcome unknown until reconciled | Recovery appends tool results with outcome UNKNOWN and re-executes nothing (`recoverSession` in `src/session/sessionRecovery.ts`); no idempotency keys | `tests/sessionRecovery.test.ts` | P1-04, P2-12 |
| `approval-stale-or-changed` | Approval stale, revoked, or bound to a different amount or recipient | Re-evaluate; the old approval cannot authorize the changed effect | Denied | Met for the native tool pipeline (P1-02): the approval binds the authorization intent (argument digest, amount, recipient, destination, resource, deployment digest), and `recheckAuthorization` re-verifies it with `expectedIntentHash` and denies with the changed field before the body. ToolHub binds by intent id and consumes before the tool runs | none (tests paused) | P1-02 |
| `residency-route-unsupported` | Residency route unsupported | Block the protected export; make no residency claim | Not evaluated for residency | No interception; `bridgeResidencyHook` is unused | none | P2-01 |
| `legal-hold-unknown` | Legal hold unknown at deletion | Deny at the deletion executor | Denied | Retention deletes without a hold check (`runRetention`) | none | P2-01 |
| `model-or-provider-outage` | Model or provider outage | Stop new effects; use a hazard-reviewed safe state where an abrupt stop is unsafe | Recorded as an incident | Failures are recorded with codes and a retry policy (`src/llm/retryPolicy.ts`); no safe state and no incident link | none | P2-26, P1-17 |
| `telemetry-exporter-down` | Telemetry exporter or dashboard down | Execution continues; mandatory evidence persists locally; dropped telemetry is reported | Unaffected | A throwing exporter or an unreachable collector neither fails a governed tool call nor drops its ledger row (`queueEvidenceEventSpan` in `src/observability/otelExporter.ts` catches); dropped telemetry is not reported | `tests/telemetryExporterFailure.test.ts` | P2-18 (reporting) |

## OWASP Top 10 for Agentic Applications (2026)

The titles below come from the program's research (published 9 December 2025) and are marked "re-verify" until someone checks them against <https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/>. This mapping is agent-drafted and experimental; it is evidence of where AMC's controls sit, not a statement of conformity with the OWASP list.

| Id | Title (re-verify) | Channels | Controls today | Owners |
| --- | --- | --- | --- | --- |
| ASI01 | Agent Goal Hijack | `tool-pipeline`, `imports`, `native-tool-breadth` | Guards and approvals refuse effects regardless of what the model was told; imported text is `SELF_REPORTED` | P1-02, P1-48 |
| ASI02 | Tool Misuse | `tool-pipeline`, `native-shell`, `fs-tools`, `network-egress`, `native-tool-breadth`, `mcp-stdio`, `mcp-http`, `sdk-acp`, `managed-hooks` | Signed tools policy, guards, approval before guards, catalog pins | P1-02, P1-12 |
| ASI03 | Identity and Privilege Abuse | `studio`, `cli`, `notary` | Studio authentication, notary HMAC, signed approvals | P1-02, P2-25 |
| ASI04 | Agentic Supply Chain | `mcp-stdio`, `mcp-http`, `provider-calls`, `extensions`, `helm-compose` | MCP catalog digests, pinned routes, extension pins, pinned issuer keys (P0-09) | P1-38, P1-39, P2-15 |
| ASI05 | Unexpected Code Execution | `native-shell`, `network-egress`, `mcp-stdio`, `extensions` | Bubblewrap on Linux and Seatbelt on macOS; the shell absent elsewhere without an opt-in; executable extensions refused outside Linux | P0-06, P1-05 |
| ASI06 | Memory and Context Poisoning | `imports`, `native-tool-breadth` | Provenance-derived trust tiers; import limits | P1-37, P1-24 |
| ASI07 | Insecure Inter-Agent Communication | `sdk-acp` | In-process session binding only | P2-25 |
| ASI08 | Cascading Failures | `provider-calls`, failure policy rows | Budget admission before spend; recovery records UNKNOWN and replays nothing | P1-03, P1-04 |
| ASI09 | Human-Agent Trust Exploitation | `studio`, `cli` | Truth rules in output; CSRF and origin checks on approval routes | P0-22, P0-23, P2-24 |
| ASI10 | Rogue Agents | `managed-hooks` | Hook enforcement while the hook is called; no kill switch | P2-26 |

## Proposed follow-ups

Not yet in the plan; the integrator assigns final keys. The next free P1 keys at the time of writing are used.

- P1-56 (proposed): contain MCP stdio server processes (sandbox, environment allowlist, egress through the gateway).
- P1-57 (proposed): replace the time-based `--skip-vault` passphrase with a random one or refuse signing without a vault.
- P1-58 (proposed): delete `src/enforce/egressProxy.ts` or turn it into a real control, and stop logging its decisions as `agentId: 'system'`.
- P1-59 (proposed): make the gateway forward proxy resolve an allowed name once, pass the addresses to `decideEgress` and connect only to a checked address, as the shell egress proxy does. This changes gateway semantics for internal hosts reached by name, so it needs its own review.

## Residual risk

The insider operator who holds the vault passphrase can sign anything AMC can sign; signatures and chains make their edits detectable by an independent verifier, not impossible. The native shell is confined on Linux and macOS; macOS confinement leaves reads outside a deny-list, five Mach services, POSIX shared memory and IOKit open. Outside Linux there is no process confinement for MCP stdio servers or executables, and on other platforms none for the shell; AMC refuses or records those paths but cannot contain them. Residency and legal-hold rows are not met on main, so AMC makes no residency or hold claim.
