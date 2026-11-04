# Three RED authorization cases held out of the root suite — 18 October 2026

Integration note, added on `rtd/codex-full-integration`; no other file in this receipt was changed.

`tests/actions/authorizationRecheck.test.ts` (8ec5851e5) carried three cases that fail by design on current source; `broad-failure-classification.json` in this folder records them as the retained P1-02 RED set. The root suite cannot carry a failing or skipped test, so they leave it and are kept here, exactly as committed, until their product change lands. The rest of the file (22 cases) stays in the suite and passes on the integrated tip.

Recorded results on the integrated tip (18 October 2026, before removal):

- **06b** fails its first assertion: `cancelApprovalRequestForIntent` throws `approval request is not pending` on a QUORUM_MET grant (src/approvals/approvalChainStore.ts), so the cancellation reports an error and the granted call still runs (`allowed: true`, one effect).
- **09** is refused, as required, with no effect, but its diagnosis is `authority_store_unavailable` rather than one of the two the case allows (`approval_intent_mismatch` or `approval_not_granted`).
- **12b** is refused before the effect, but as `action_class_frozen`, not `authority_store_unavailable`.

## Open items

1. **Governance item (06b): withdraw a granted approval before it is consumed.** A QUORUM_MET grant cannot be withdrawn today: `approvalChainStore.cancelApprovalRequest` and `approvalEngine` accept cancellation only while a request is PENDING. Withdrawal of granted but unconsumed authority needs a signed withdrawal record, and the verify and consume paths must then refuse a withdrawn grant. This changes approval semantics, so it is filed as its own item, not fixed in the integration.
2. **Diagnostic precision (09, 12b), low priority.** Both calls are already refused with zero effects; only the reported reason differs from the specification's wording. Decide whether the diagnosis must match before restoring the cases.

## The cases, verbatim

```ts
  test("06b: cancelling an already granted approval through the public API must revoke its authority", async () => {
    const f = fixture();
    const grant = approve(f);
    let cancellationError: string | null = null;
    transition(f, () => {
      try { cancelApprovalRequestForIntent({ workspace: f.workspace, agentId: AGENT, approvalId: grant.id }); }
      catch (error) { cancellationError = error instanceof Error ? error.message : String(error); }
    });
    const outcome = await execute(f, { authority: grant.authority });
    // Preserve the real API response AND the subsequent execution. Pending-only
    // cancellation would not prove that a reviewed grant can be withdrawn.
    expect({ cancellationError, allowed: outcome.ok, effects: f.bodies.length }).toEqual({ cancellationError: null, allowed: false, effects: 0 });
    refused(f, outcome, "approval_not_granted");
  });

  test("09: copying actual approval files to another workspace does not transfer authority", async () => {
    const a = fixture();
    const grant = approve(a);
    const b = fixture();
    expect(b.auditorPem).not.toBe(a.auditorPem);
    cpSync(join(getAgentPaths(a.workspace, AGENT).rootDir, "approvals"), join(getAgentPaths(b.workspace, AGENT).rootDir, "approvals"), { recursive: true });
    const outcome = await execute(b, { authority: grant.authority });
    expect(b.bodies).toHaveLength(0);
    expect(existsSync(b.effectPath)).toBe(false);
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.stage).toBe("authorization");
    // These are the specification's two allowed cross-workspace diagnoses.
    expect(outcome.denied?.reason).toMatch(/approval_intent_mismatch|approval_not_granted/);
  });

  test("12b: a malformed retained freeze is diagnosed as authority_store_unavailable", async () => {
    const f = fixture();
    const grant = approve(f);
    transition(f, () => {
      const incident = createFreezeIncident({ workspace: f.workspace, agentId: AGENT, ruleId: "p102-damaged-freeze", previousRunId: "owned-before",
        currentRunId: "owned-after", deltas: { overallDrop: 1, integrityDrop: 1, correlationDrop: 0, maxLayerDrop: 0 },
        actionClasses: ["FINANCIAL"], reason: "Genuine freeze before malformed-file fault" });
      expect(verifyIncidentSignature(f.workspace, incident)).toBe(true);
      writeFileSync(join(getAgentPaths(f.workspace, AGENT).rootDir, "incidents", `${incident.incidentId}.json`), "{invalid-json\n");
    });
    refused(f, await execute(f, { authority: grant.authority }), "authority_store_unavailable");
  });
```
