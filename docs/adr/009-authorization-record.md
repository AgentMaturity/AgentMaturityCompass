# ADR 009: Authorization record and recheck at execution

Status: proposed. Implemented for the native tool pipeline and the ToolHub consume. Owner: P1-02. Date: 2026-10-08.

## Context

An approval named the agent, an intent id, the tool and the action class. Nothing bound it to the amount,
recipient, resource, deployment or policy revision that actually ran, or recorded who authorized which effect.
ToolHub consumed an approval after the effect, and the native gate never consumed one, so one grant could
authorize two effects. Code Mode sub-calls went straight to the pipeline and skipped the native gate. The native
gate asked under the `--approve-tools` class instead of the tool's signed class and hashed the raw arguments.
The P0-11 threat model lists this as failure row `approval-stale-or-changed` and as a bypass of the
`tool-pipeline` channel.

## Decision

Every call in an authorized class (by default every class except `READ_ONLY` and `WRITE_LOW`) carries an
`amc.authorization-record/v1` (the P1-01 contract, `src/contracts/v1/authorizationRecord.ts`), built in
`src/actions/` and rechecked as the last step before the body.

- **Binding facts.** The signed tool definition names which argument carries `amount`, `currency`, `recipient`,
  `destination`, `resourceId` and `resourceVersion` (`bindingFields` in `.amc/tools.yaml`). A `FINANCIAL` tool must
  name amount, currency and recipient and a `DATA_EXPORT` tool destination, or every call is denied
  `binding_fields_missing`. The normalizer (`amc.args/v1`) NFC-normalizes strings, writes amounts as decimal strings
  without trailing fractional zeros and refuses a JSON number as an amount. A URL destination binds by origin.
- **Digest.** `sha256("AMC_AUTHZ_V1\0" + canonicalize(record))`.
- **What an approval binds.** The gate asks under the tool's own signed class, about the intent
  `{ schema: "amc.authorization-intent/v1", toolName, adapterId, actionClass, argumentsDigest, bindings,
  deploymentDigest, workspaceId }`. The approvals engine hashes it into `intentHash` and keeps it with the signed
  request, so approvers see the protected facts and a recheck can name the one that changed.
- **Trusted authority channel.** `ToolCallRequest.authority` and `ToolCallInput.authority` carry approval request
  ids. Only the approval gate sets them, after a grant. Argument keys such as `approvalId`, `approved`, `consent` or
  `_amc*` grant nothing; they are kept in the record's `agentSuppliedMetadata`, which no rule reads.
- **Bind, then recheck.** The pipeline binds the record when the call enters, from the signed tools config, the
  workspace's policy files, AMC's clock and the named approvals. After the guards it recomputes every fact and
  compares field by field; re-verifies each approval with `expectedIntentHash`, its action class and its policy
  hashes; checks the lease and its revocations, the signed freeze for the class, the record's expiry and the
  delegation scope; and then consumes the approvals with the record's `executionId`. All of it is synchronous, so
  nothing runs between the recheck and the body. Any failure denies at stage `authorization` with the failure codes
  (`binding_changed:amount`, `approval_consumed`, `authority_store_unavailable` and the rest of `RecheckFailure`).
- **Bound approvals.** A composed gate binds itself to the pipeline. A call it gates in an authorized class then
  needs a signed engine approval through `authority`, whatever path it took (`approval_missing` otherwise), and a
  Code Mode sub-call is asked on its own. `boundApprovalRequiredFor` does the same for compositions without a gate.
- **Atomic consume.** `markApprovalConsumed` publishes the consumed file by exclusive create (`linkSync`); a second
  consumer is a replay. ToolHub consumes before running the tool and denies a replay before any effect.
- **Per-class lease scope.** A lease may name `executeActionClasses`; `toolhub:execute` then covers only those
  classes (AMC-1546), for agent tokens minted from the lease and for the recheck.
- **Evidence.** Every tool evidence row of the call carries `authorizationId` and `authorizationDigest`, and one
  `AUTHORIZATION_RECORD` audit row carries the full record.

## Consequences

- An answerer's `allow`, including an ADR-5 exception, names no signed approval, so it no longer authorizes a call in
  an authorized class through a gated pipeline. Exceptions join the record's `authority` in P2-24.
- Code Mode under a gate asks once per gated sub-call.
- A failed ToolHub tool run now spends its approval: consumption happens before the effect.
- The deployment digest covers the approval policy. In a workspace with no approval policy, the engine creates the
  default one while raising the first approval, so that first call is denied `deployment_changed`. Run
  `amc policy approval init` (or `amc bootstrap`) before the first gated run.
- The normalizer is versioned. Records and approvals made under different normalizers never match, so changing it
  needs a migration note.
- The record is AMC's own statement about the call. Its signatures are checked against the workspace's own keys, so
  it is a local audit trail, not a portable verdict (that needs P0-09 pinned trust).

## Not done here

- Tenant, deployment id, compiled policy digest and control ids stay null or `unregistered` until P1-12 compiles
  a policy that names them. The record's expiry is not clamped to a parent record (P2-25 brings workload identity).
- A freeze incident that fails to parse or verify is ignored by `activeFreezeStatus` rather than reported as an
  unreadable store; that engine is unchanged.
- Intent journal and receipt states (P1-03), idempotency keys (P1-04) and hooks (P1-22, P1-23) build on this record.
