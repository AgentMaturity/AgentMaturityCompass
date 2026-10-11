---
"agent-maturity-compass": major
---

Closes six Layer 0 enforcement gaps that P1-14's executed tests found (P1-78). Existing flows now refuse in the cases below.

Calls that now refuse:

- **A lease never counts as the principal.** An authorization record used to name a lease-bound call's principal as the lease itself (`lease:<id>`, service), so a compiled plan whose identity-binding requires a principal (L0-IDN-01) allowed calls with no accountable principal. A lease now names at most a user (`LeasePayload.principal.userId`, optional and signed into the lease). The principal is that user's record in the workspace's signed `users.yaml`, read and verified when the call binds; a user whose only role is `AGENT` is recorded as a registered service. A lease that names nobody contributes no principal, so under such a plan the call is refused `PRINCIPAL_UNRESOLVED`. This covers every lease minted before this release, every `amc lease issue` lease and any lease a kernel host passes. A lease that names a user who is not active in `users.yaml` is refused at every call, plan or not (`authorization_denied:principal_unresolved`; under an identity-binding plan the guard reports `IDENTITY_UNRESOLVED`). An unverifiable `users.yaml` is refused `authority_store_unavailable`. Studio native task leases name the task's own `users.yaml` user, so tasks started from a workspace-router session or with the bootstrap admin token are refused under such a plan. A call with a signed approval keeps its approvers as the principal.
- **A lease for another workspace is refused at the pipeline's lease check.** It is refused even when this workspace's key signed it (`authorization_denied:scope_widened`). The expected id is the one the lease issuers use, `workspaceIdFromDirectory`.
- **A toolset never writes a tool-evidence row its session cannot verify.** These calls are refused before the tool body with `UNVERIFIABLE_TOOL_EVIDENCE`, and nothing is written:
  - a toolset built without a session writer, whose session is not open in the ledger (never started, or already sealed);
  - a session writer that can no longer append, for example one closed mid-session;
  - every call after any evidence write failed. A row lost to an effect that already ran fails the toolset instead of being skipped.
  
  Every AMC surface passes a session writer, so only direct `agentToolset` callers without one see this. They must start the ledger session before the toolset records into it, and seal it afterwards.
- **The initiator cannot approve their own request where the class requires distinct users.** Every approval request raised outside A4 now records its initiator: the authenticated Studio user (`agent:<id>` for an agent token), the API caller, a native task's session principal, an operator resolution's operator, or an audit evidence request's requester (as an id hash). A CLI command records the OS user, which is self-reported and can only refuse that same user id's approval.
  
  Where the signed request or the signed approval policy requires distinct users for the class, the engine refuses the initiator's approval ("initiator cannot approve their own request") and the quorum never counts one. The initiator's denial still denies. A single-user class still counts the initiator.
  
  The initiator is read only from the signed request: `listApprovalRequests` now verifies and parses the same bytes. `createApprovalForIntent({ initiator })` stays optional, and A4 call sites are unchanged. The binding digest leaves the initiator out, so records written before this release, and new ones, parse and digest unchanged.
- **A principal is rechecked at execution.** A lease's principal who is deactivated or demoted in `users.yaml` after the call bound is refused at the recheck (`principal_unresolved`).
- **A failed evidence record stops the pipeline.** Once a record fails, every later tool-pipeline call is refused before any stage runs (`EVIDENCE_RECORDER_FAILED`). This applies to kernel hosts too. The call in flight keeps its real outcome.
- **Studio refuses native tasks with no resolvable principal.** Under a plan that requires a principal, Studio does not start such a task (`NATIVE_PRINCIPAL_UNRESOLVED`). This covers tasks started from a workspace-router session, with the admin token, or by a user who is not active in `users.yaml`.
- **New exports.** `planRequiresPrincipal(workspace)` reports whether the verified active plan's identity-binding requires a principal, and an unverifiable plan reads as requiring one. `issueLeaseForPrincipal({ ...IssueLeaseInput, principalKey })` mints a lease naming an active `users.yaml` user, or refuses with `LeasePrincipalRefused` (`PRINCIPAL_UNRESOLVED`) under such a plan. `issueLeaseToken` is unchanged.

Other changes:

- **Visibility refusals are now recorded.** A call to a tool name the registry does not hold, and a direct call under code mode, are recorded as `TOOL_CALL_DENIED` like any other refusal: `denialStage: "visibility"`, with `actionClass` null for an unknown name. Pipeline recorders receive a `RecordedToolCall`, whose `actionClass` may be null.
- **Authorization records bind the deployment.** They carry the tenant and deployment that the active compiled plan's profile names, taken from the verified plan. A compiled plan's `profile` block now records `{ tenantId, deploymentId }`, so a plan compiled from the same profile has a new digest. With no active plan, or one compiled before this release, `deploymentId` is `not_bound` (it used to be `unregistered`) and `tenantId` stays null. Such a record claims no deployment. Recompile and reactivate a plan to bind one.
