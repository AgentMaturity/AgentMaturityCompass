# GOVERNOR

The Autonomy Governor is the policy-as-code layer that decides whether an agent can run an action in `SIMULATE` or `EXECUTE` mode right now.

## Core Rule

`EffectiveLevel(question) = min(CurrentFinalLevel(question), TargetEqualizerLevel(question))`

Even if an agent is capable of a higher level, owner target settings can tune autonomy down.

## Signed Policy

Action policy file:

- `.amc/action-policy.yaml`
- `.amc/action-policy.yaml.sig`

If signature verification fails, Governor denies `EXECUTE` and returns `SIMULATE` with `UNTRUSTED CONFIG` reasons. The same happens when the agent's run history is untrusted: a planted, tampered, unanchored or rolled-back run file, or a latest trusted run that failed ledger verification or violated the trust boundary; no rule lifts that. A missing or low-integrity run is instead a rule condition: each class's rule carries `requireRunIntegrityAtLeast` (absent means 0.6, the HIGH TRUST line), the decision's `run-integrity` condition shows the threshold, an `UNTRUSTED RUN:` reason names the run and its integrity when it falls short, and a threshold below 0.6 adds `RUN INTEGRITY WAIVED:` to every decision made under it (see [Reaching EXECUTE](#reaching-execute)).

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
- minimum integrity of the agent's latest sealed, ledger-anchored run (`requireRunIntegrityAtLeast`, 0..1, default 0.6; below 0.6 is an owner waiver that every decision, `amc doctor`, `amc policy controls` and profile activation name)
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

## Reaching EXECUTE

`amc governor check --action <class> --mode execute` returns `EXECUTE` only when both of these hold:

1. **A trusted run at the rule's threshold.** The agent's latest diagnostic run is sealed, anchored in the ledger, verifies, and reaches the rule's `requireRunIntegrityAtLeast` (0.6, the HIGH TRUST line, unless the owner signed another value; at or below 0.6 a HIGH TRUST label also meets it). A sealed, anchored run is required at every threshold, and a run with contradictions, unsupported claims, inflation attempts or invalid receipts (or one that does not record those counts) never satisfies a threshold below 0.6. The integrity index is the share of the question set's active questions that have accepted evidence, less penalties (see [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md)).
2. **The class's rule.** The rule's minimum effective question levels, trust tier, assurance packs, sandbox and execution ticket are all met.

As of 2026-10-30, no command sequence gets a fresh workspace there on observed evidence:

- `amc evidence collect --first-run` seals an observed session, but its rows carry no question tag, so they evidence no question.
- The registered observed emitters (`src/diagnostic/evidenceEmitters.ts`) bind governed tool-call and delegation rows to only 10 of the 244 legacy questions. A run over observed evidence alone therefore stays near integrity 0.04.
- The default policy's `READ_ONLY` rule also needs AMC-1.7 and AMC-3.3.1 at level 2, which no evidence map evaluates yet. It also needs the `injection` assurance pack, which needs a configured model.

Importing evaluation results can raise the integrity index and even the trust label: an export that names question ids tags any of the 244 questions (`src/eval/evalImporters.ts`), but those rows are self-reported, count at level 1 only, and lower the observed share the `OBSERVED` tier requires. AMC does not document that as a path to EXECUTE: it is the agent's claim, not observed behaviour.

An owner has two honest choices today: keep the signed policy and accept `SIMULATE` (the default after `amc init`); or sign a waiver for the classes to grant. For a waiver, run `amc` (or `amc run --score-only`) once so a sealed, anchored run exists, then edit `.amc/action-policy.yaml` for those classes: `requireRunIntegrityAtLeast: 0` (any higher value needs a run that reaches it), `requireTrustTierAtLeast: SELF_REPORTED` while the run has no observed rows, empty `minEffectiveQuestionLevels` and `requireAssurancePacks`, and `riskTierDefaults.<tier>.requireSandboxForExecute: false` for the tiers used. Then run `amc fix-signatures` (vault unlocked). It refuses an edit that does not parse, and it appends a sealed `CONFIG_RESIGNED` audit row that records the activation. Every decision then says `RUN INTEGRITY WAIVED: …`, `amc doctor` warns, `amc policy controls` shows the waiver and profile activation reports it as a widening. A planted, tampered, unanchored, rolled-back or verification-failed run, or a run with findings against the agent, still yields `SIMULATE` at threshold 0. Under a waiver an UNRELIABLE-labelled run can authorise EXECUTE; certificates, passports, READY and the trust label still require HIGH TRUST. A waiver has no expiry: `amc policy action init` re-signs the default and ends it.

Removing `.amc/action-policy.yaml` and its `.sig` is not a grant. Native calls then meet no Action Policy, signed approvals (`--approve-tools`, `amc approvals`) fail because they bind the signed policy's hash, `amc up` and Studio re-create the default policy, and `amc governor check` refuses.

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
amc approvals login ...   # the requester's tracked session; its token file names who asks
amc governor-override --agent <id> --reason "<why, 10+ chars>" --ttl 2h --session-token-file <file> \
  --tools payments.refund --action-classes FINANCIAL --controls L1-PAY-01
# Another signed-in user with a role the signed approval policy allows for SECURITY records a bound decision:
amc approvals approve --agent <id> --mode execute --reason "<why>" --username <name> --roles OWNER \
  --session-token-file <their file> --expect-request-digest <digest> <approvalRequestId>
amc governor-override --agent <id> --activate <breakGlassId> --approval <approvalRequestId>
```

`amc emergency-override` takes the same flags (`--ttl` in milliseconds) and writes the same record. The request opens a `GOVERNANCE_VIOLATION` incident and raises an approval whose intent is the record's digest. The requester is the authenticated user of an `amc approvals login` session (`--session-token-file`), never a name or OS account; without a valid session the request is refused. That user is recorded as the approval request's initiator, so the engine refuses their decision under any display name. Activation needs one decision bound to that request (`--expect-request-digest`) from an allowed role. Without a signing key, or with `AMC_NO_SIGN=1`, activation is refused; nothing is recorded unsigned. Legacy files in `.amc/governor/overrides/` and `.amc/governor/emergency-overrides/` whose signature is missing or does not verify are reported as `INVALID_SIGNATURE` and never honoured, and no enforcement path reads either legacy store.

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
