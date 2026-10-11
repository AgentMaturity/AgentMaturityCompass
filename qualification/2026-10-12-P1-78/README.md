# P1-78 qualification receipt: the Layer 0 enforcement gaps P1-14 found

Environment: local run on macOS arm64 (darwin), not CI. No network access.

- `receipt.json`: commit, toolchain, the check commands and their exit codes, the totals of every test file that covers a
  changed module, each mutation and the tests that caught it, and the sha256 of each new fixture.
- `red.txt`: each gap's regression tests failing before its fix (the run, or the swap of the pre-fix source, is named).
- `mutations.txt`: one mutation per guard, each caught.
- `checks.json`: each check's command, exit code, duration and last output lines.
- `related-tests.txt`: the test files run for `relatedTests`.

What changed, per gap (L0 control in brackets). Each was driven through the real enforcement point by a new Layer 0 fixture:

1. A lease never counts as the principal [L0-IDN-01]. A lease names at most a user. The principal is that user's
   record in the signed users.yaml, read and verified at bind. A lease naming nobody is refused under identity-binding
   (PRINCIPAL_UNRESOLVED). A lease naming a user who is not active there is refused at every call.
2. The pipeline's lease check passes the workspace id [L0-IDN-02]. A lease naming another workspace is refused even
   when this workspace's key signed it.
3. Visibility refusals are recorded [L0-TOOL-01]. An unknown tool name and a code-mode direct call are refused and
   leave a TOOL_CALL_DENIED row.
4. Approval requests can record an initiator [L0-OVS-03]. The engine refuses the initiator's approval and the quorum
   never counts one. The binding digest leaves the initiator out, so pre-P1-78 records parse and digest unchanged
   (tests/fixtures/approvals/pre-p1-78/).
5. Authorization records bind the active plan's tenant and deployment [L0-LOG-01]. Without one they say
   deploymentId `not_bound`.
6. A toolset never writes a row its session cannot verify [L0-LOG-01]. A call whose rows cannot be written is refused
   before its body (UNVERIFIABLE_TOOL_EVIDENCE). After a row is lost to an effect that already ran, every later call is
   refused.

Round two (coordinator, before landing): a failed evidence record refuses every later pipeline call; a lease's
principal is rechecked at execution; `planRequiresPrincipal` and `issueLeaseForPrincipal` let Studio and A4 refuse a
native task with no resolvable principal before minting; every approval request outside A4 records its initiator, who
cannot approve where the class requires distinct users, read only from the signed request.

An executed test shows how the enforcement point behaves on the fixtures in a temporary workspace. It is not a result
for any deployment. Every Layer 0 control stays `experimental`, agent-drafted and not independently reviewed (D-08).
