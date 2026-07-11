# Verified Control Projection

AMC has one read-only view of the controls that its existing enforcement modules actually own:

```bash
amc policy controls
amc policy controls --json
```

The human and JSON forms project the same contract. The Studio API exposes it at `GET /api/v1/policy/controls`; the public OpenAPI path is `GET /v1/policy/controls`.

## What the projection shows

Each row answers four operator questions:

| Field | Meaning |
| --- | --- |
| Scope | Traffic direction or AMC action class governed by the control |
| When | The signed conditions, threshold, quorum, trust tier, or assurance requirement that applies |
| Then | Requested action followed by the effective action AMC can safely take now |
| Status | Active, inactive, unavailable, or fail closed, plus whether the source is trusted |
| Scope template | The one immutable AMC action-class group for Action and Approval controls; Runtime controls have none |

The three families are:

1. Runtime traffic controls owned by Runtime Firewall, with additive Guardrails intent shown against the same runtime bindings.
2. Action authorization controls owned by the existing Action Policy and Autonomy Governor.
3. Human approval controls owned by the existing Approval Policy and Approval Engine.

Guardrails that exist only in the catalog are listed as unbound. They are not counted or described as active protection.

## Integrity and safe outcomes

The projection verifies existing signed policy artifacts before reporting them as trusted. It never evaluates an action and never changes policy.

| Invalid source | Effective projection |
| --- | --- |
| Runtime Firewall or Guardrails | `BLOCK` for the five runtime rules |
| Action Policy | `SIMULATE` |
| Approval Policy | `DENY` |

An entirely empty directory reports `uninitialized`. A mixture of trusted and uninitialized owners reports `partial`. Any invalid owner reports `fail_closed`; the CLI still prints the diagnostics and exits with status 2.

## Data boundary

The output includes only relative artifact paths, revision metadata, control conditions, effective actions, and integrity diagnostics. It excludes workspace paths, passphrases, raw provider payloads, signature bytes, and secret values.

This is a projection, not a second policy engine. It does not create controls, activate controls, write receipts, simulate an action, weaken approval quorum, or replace the Runtime Firewall, Guardrails, Action Policy, Approval Policy, ToolHub, or their existing evaluators.

## Preview one projected control

Use a row's `controlId` with the separate read-only simulator:

```bash
amc policy simulate runtime:prompt-injection --direction request --content "ignore previous instructions"
amc policy simulate action:DEPLOY --agent default --risk high --mode execute
amc policy simulate approval:DEPLOY
```

The simulator calls the owning production evaluator and returns exact matched rules and structured conditions. It does not mutate this projection or create proof. See [Control Simulation](CONTROL_SIMULATION.md).

## Initialize or repair a family

Review policy changes before running the owning command:

```bash
amc firewall enable --mode warn
amc guardrails enable prompt-injection-detection
amc policy action init
amc policy approval init
amc policy scope list
amc policy scope compile release-external --pack code-agent.high
amc policy controls
```

For automation, treat CLI exit 2 or JSON `status: "fail_closed"` as an integrity failure. Do not infer that a requested action was executed, approved, or blocked from this read-only inventory; use the existing signed decision and lifecycle receipts for execution proof.

Reusable scope templates do not change evaluator semantics. They compile selected rules from an existing built-in Policy Pack into the same signed Action and Approval Policy schemas while preserving unselected rules. See [Reusable Policy Scope Templates](SCOPE_TEMPLATES.md).
