# GOVERNOR

The Autonomy Governor is the policy-as-code layer that decides whether an agent can run an action in `SIMULATE` or `EXECUTE` mode right now.

## Core Rule

`EffectiveLevel(question) = min(CurrentFinalLevel(question), TargetEqualizerLevel(question))`

Even if an agent is capable of a higher level, owner target settings can tune autonomy down.

## Signed Policy

Action policy file:

- `.amc/action-policy.yaml`
- `.amc/action-policy.yaml.sig`

If signature verification fails, Governor denies `EXECUTE` and returns `SIMULATE` with `UNTRUSTED CONFIG` reasons.

## Action Classes

- `READ_ONLY`
- `WRITE_LOW`
- `WRITE_HIGH`
- `DEPLOY`
- `SECURITY`
- `FINANCIAL`
- `NETWORK_EXTERNAL`
- `DATA_EXPORT`
- `IDENTITY`

Each class can require:

- minimum effective question levels
- minimum trust tier (`OBSERVED` / `OBSERVED_HARDENED`)
- assurance pack thresholds
- sandbox evidence for execute
- owner execution ticket

## Commands

```bash
amc policy action init
amc policy action verify

amc governor check --agent <id> --action <ActionClass> --risk <low|med|high|critical> --mode <simulate|execute>
amc governor explain --agent <id> --action <ActionClass>
amc governor report --agent <id> --window 14d --out .amc/agents/<id>/reports/governor.md
```

## SIMULATE vs EXECUTE

- `SIMULATE` is allowed whenever policy allows planning and safety analysis.
- `EXECUTE` is allowed only if every policy precondition is satisfied.
- If execute is requested but requirements fail, Governor downgrades to `SIMULATE` and returns deterministic reasons + required evidence.

## Decision Inputs

Governor evaluates:

- latest valid diagnostic run
- signed target profile
- trust summary (including sandbox/correlation state)
- assurance summaries in the selected window
- optional signed work order context
- optional execution ticket presence

## Break-glass

Break-glass is the one way to act outside a control in an emergency. It is a signed `amc.break-glass/v1` record under `.amc/governor/break-glass/`, never an unsigned file. A record names the agents, tools, action classes and control ids it covers, a window of at most 24 hours, the incident it opened, and the previous record's digest.

```bash
amc governor-override --agent <id> --reason "<why, 10+ chars>" --ttl 2h \
  --tools payments.refund --action-classes FINANCIAL --controls L1-PAY-01
# One approver with a role the signed approval policy allows for SECURITY records a bound decision:
amc approvals approve --agent <id> --mode execute --reason "<why>" --username <name> --roles OWNER \
  --expect-request-digest <digest> <approvalRequestId>
amc governor-override --agent <id> --activate <breakGlassId> --approval <approvalRequestId>
```

`amc emergency-override` takes the same flags (`--ttl` in milliseconds) and writes the same record. The request opens a `GOVERNANCE_VIOLATION` incident and raises an approval whose intent is the record's digest. Activation needs one decision bound to that request (`--expect-request-digest`) from an allowed role, and never the requester's own. Without a signing key, or with `AMC_NO_SIGN=1`, activation is refused; nothing is recorded unsigned. Legacy files in `.amc/governor/overrides/` and `.amc/governor/emergency-overrides/` whose signature is missing or does not verify are reported as `INVALID_SIGNATURE` and never honoured, and no enforcement path reads either legacy store.

At the tool pipeline, a live, verified break-glass record that covers the call is named in the authorization record (`authority.breakGlassId`). The compiled-policy guard then abstains for the record's controls only. The recheck re-reads it before every call.

### Precedence

Break-glass and scoped exceptions never relax:

- the monotonic safety guards (prompt injection, runtime firewall, egress allowlist, budgets);
- an active freeze (`action_class_frozen`) or kill switch;
- legal holds and residency blocks;
- a pending legal review of the control itself: the Review dimension stays `pending`.

### Post-hoc review

Every call that runs under a break-glass record appends a `BREAK_GLASS_ACTION` ledger row; the signed record is never edited. The review covers the packet: the record's digest plus every action digest. Until a review record (`amc.review-record/v1`, see [APPROVALS.md](APPROVALS.md)) exists for the packet as it is now, the next break-glass in the workspace is refused `previous_break_glass_unreviewed`. AMC never resolves the incident itself; the incident workflow does not yet check for the review before it is resolved. A review that is overdue (48 hours after the window ends) shows as `POSTMORTEM_OVERDUE` in `amc governor-override-alerts`. Break-glass is a recorded, reviewed deviation, never compliance.

## Security Notes

- Unsigned or invalid action policy caps maturity and blocks execute.
- Governor decisions are audited and written as observed evidence.
- Agents cannot raise execute rights by self-claiming maturity.
