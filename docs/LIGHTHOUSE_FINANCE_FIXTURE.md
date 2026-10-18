# Synthetic finance lighthouse fixture

Status: P1-19 partial implementation: a synthetic provider with its client and adapter, an independent oracle and an opt-in finance tool composition. The normative F01–F38 scenarios have not been run. This is a synthetic provider model, not a real payment integration, compliance claim or proof of universal safety. Qualification runs and their results are recorded under `qualification/`, not here.

## What this slice supplies

`examples/lighthouse-finance/service/` supplies an independent Node provider with no AMC source or built-package imports. `spec/fixtures/v1/lighthouse-finance/` supplies two fictitious tenants, separate reader/executor clients, opaque destinations, planted reconciliation discrepancies and planned F01–F38 scenarios. No credentials are committed. Fault plans cover provider errors before/after a commit, lost responses, delayed commits, process termination after a commit and connection reset before reading a body.

`src/lighthouse/finance/` supplies strict payment argument normalization, a bounded local provider client and dispatch/read-only reconciliation components. These components do not authorize an action or create an AMC approval, journal entry or qualification result.

## Provider operation

The service entry point is:

```sh
node examples/lighthouse-finance/service/server.mjs \
  --dir /tmp/lhf-example \
  --seed spec/fixtures/v1/lighthouse-finance/seed.json
```

The default API endpoint is `<run-dir>/api.sock`; `--port 0` selects a loopback TCP port instead. `<run-dir>/admin.sock` is separate. Keep the run directory short because macOS Unix socket paths are limited. This provider requires verifiable POSIX ownership; it does not supply a Windows service path. Startup generates private `tokens.json` entries per client and emits one readiness JSON line with the endpoint and log location. This command is documented for later authorized use; it was not executed for this change.

Reader clients receive `ledger:read` and `payments:read`; executor clients receive `payments:read` and `payments:write`. The provider derives the tenant from the bearer token. Its API serves account/payee lists, bank/book rows, payment dispatch and payment lookup by ID, live idempotency key or reference. The AMC client does not expose admin operations.

Admin operations read the log/state, replace fault plans, expire idempotency keys, change a payee destination/version and shut down the service. Withhold the admin socket and token file from an agent's execution environment. File modes alone do not isolate a process running as the fixture owner's OS user; the future driver/sandbox must supply that boundary.

## Effects and independent record

Money uses positive safe integer minor units in USD. Payment bodies contain only `kind`, `sourceAccountId`, `payeeId`, `amountMinor`, `currency`, `reference` and optional `originalTxnId`. Destinations are opaque synthetic tokens, never account/routing/card numbers. A reference matches `^[A-Za-z0-9-]{1,35}$`.

The provider requires an 8–128 character `Idempotency-Key` using letters, digits, `_` or `-`. A tenant's same key and normalized body replay the original committed response without another effect; changing the body under that key is rejected. Different keys may create effects for the same reference. Expiring the key index preserves historical payments for reference lookup; it does not prove a previous attempt had no effect.

The provider deliberately enforces its own scope, schema and idempotency rules rather than AMC approval policy. It uses the payee's current destination at commit time, so a changed destination remains visible in the payment record. A future oracle can therefore detect a missing AMC control rather than having the provider conceal it.

`txlog.jsonl` records requests, commits, replays, rejections, faults, responses and admin operations. Canonical JSON, sequence numbers, predecessor hashes and SHA-256 form its chain. An owner-only `txlog-head.json` checkpoint records its sequence/hash head. Appends and the published checkpoint are fsynced before returning, including a commit before any response. Startup validates the chain/checkpoint and restores provider state; malformed, truncated or mismatched history is refused. A crash between log and checkpoint publication requires inspection rather than silent repair. The log is an independent provider record, not signed AMC evidence.

## Client and reconciliation boundary

The client uses a supplied Unix socket or an HTTP origin at literal `127.0.0.1`, refuses redirects, bounds request time and response size, and keeps bearer credentials out of returned data. Transport errors, timeouts and 5xx responses remain unknown; there is no automatic payment retry. Reconciliation uses GET requests only, trying the key and then the proposal reference. An absent lookup alone does not establish `not_applied`, because an attempt may still commit later or its key may have expired.

`paymentArgsDigest` hashes the canonical provider POST body. AMC's existing generic argument digest also includes its normalizer envelope; these two hashes are different contracts. The reconcile adapter therefore needs an explicit trusted mapping from the durable execution/authorization context to the provider body digest and reference. Without that mapping, it returns unknown. No caller-supplied approval or fabricated digest equality closes this gap.

## Deferred work

The data's `executionStatus: "not_run"` records preparation only. Expected decisions, receipt states, counts and control dimensions are planned requirements, never observed results.

No finance tool is added to the default or native toolset; the opt-in composition below is the only finance tool path. The example runner for the normative F01–F38 corpus, compliance-engine control evidence and the decisive/example tests remain to be built. An admin destination update that would push a payee version past the maximum safe integer is refused with HTTP 409 `payee_version_exhausted` before the payee or its log changes.

## Independent oracle

The oracle imports no AMC source or built modules. It invokes the pinned cold ledger verifier, holds one read-only SQLite transaction and independently checks action chains, signed approval/configuration artifacts, quorum, durable authorization preimages and the mapping between the distinct generic and provider body digests. Its operator manifest anchors public keys, paths, executable/input hashes and the reviewed default two-approver financial policy before grants. Database, WAL and key/history pins remain exact across verification; initial read-only empty-WAL creation is separately checked before that interval. Driver success text supplies no authority.

The standalone oracle uses four arguments, `<cli> <workspace> <case-file> <provider-run-dir>`, and the harness-comparison JSON input/output contract. It requires an external operator manifest through `AMC_FINANCE_ORACLE_PINS_FILE`; that manifest is a trusted fixture-launcher input. The runnable genuine setup is `tests/lighthouse/financeOracle.test.ts` after building the package. The optional `AMC_P119_ORACLE_CLI_PATH` selects a qualified built CLI for those tests.

It recognizes the default two-distinct-approver OWNER/AUDITOR policy; the normative corpus's own one-APPROVER fixture policy is not supported. The installed CLI's missing action-state verifier, literal generic/provider digest equality, post-grant cancellation, strict request-timestamp boundary, automatic session-recovery integration and same-user credential isolation are explicit limits.


## Opt-in finance tools and durable payment context

`src/lighthouse/finance/financeOpsTools.ts` provides `createFinanceOpsTools` for a caller-owned workspace and agent. The caller supplies a genuine journal accessor, authorization context, recorder, reader connection, executor vault-secret name, the native session id and the authenticated initiator: the principal the session runs for (`LOCAL_USER:<id>`, `WORKSPACE_ROUTER:<id>` or a user id), never model input. Every payment approval records that initiator (P1-78), so it can never approve its own payment. The factory owns a new registry and pipeline; it does not install default tools, sign configuration or initialize policy. Construction requires the actual signed deny-by-default five-tool configuration with the native FINANCIAL binding and effect declarations, and refuses a workspace with an active compiled policy, which this composition cannot enforce. Every call passes the same guards as any governed native call before the finance guards: the compiled-policy check, prompt-injection and runtime-firewall checks (a workspace without a signed firewall policy refuses every call), the signed per-agent budgets (the default budget allows no FINANCIAL executes) and network egress. Its existing allowlist guard pins that reviewed configuration digest per call.

The five model-visible tools are `finops_list_transactions`, `finops_reconcile`, `finops_propose_payment`, `finops_execute_payment` and `finops_lookup_payment`. All publish argument schemas. The proposal accepts strict supplied payment/resource facts, derives the decimal amount from safe minor units and creates a real signed PENDING approval request without contacting the provider. Supplied version/destination facts are not described as fresh. Reader results preserve the existing PaymentServiceResult shape. Reconciliation reports the seed's duplicate capture, missing book entry and amount mismatch as three separate findings; memo text remains data.

Execute retains the existing authorization classes, bound FINANCIAL approval requirement, recheck, consumption and durable start. A reader GET refreshes payee version/destination and supplies deny-only facts. The final body authenticates and exclusively fsyncs its full authorization-record/payment preimage before retrieving the writer secret and dispatching once through the existing adapter. Proven pre-POST failure becomes completed/not_applied; ambiguous delivery remains outcome_unknown with no retry. SIMULATE avoids provider POST, preimage write and writer-secret retrieval while retaining existing authority semantics.

`createFinancePaymentContext` stores bounded 0600 files under `.amc/lighthouse-finance/preimages`. Cold lookup uses the genuine journal's signed receipt/intent verification, checks all six reconciliation query fields and the full record/envelope/digest/bindings, and derives the separate provider body hash. Missing, malformed, unsafe, mismatched or aborted context returns unknown before provider GET. The returned native adapter exposes lookup only; opening the supplied journal can perform writable recovery. Historical lookup does not consume a grant again or reinterpret its original expiry.

These APIs are a finite local composition. Payee refresh is a point-in-time check, and static no-follow filesystem checks are not atomic same-UID confinement. Reader, journal and recorder inputs are trusted. Legitimate signing may decrypt a vault payload; final-body writer retrieval is not a process-wide zero-decryption claim. The complete runner, normative F01–F38, compliance joins, custom one-APPROVER profile, literal generic/provider digest equivalence, granted cancellation and automatic recovery integration are not implemented.
