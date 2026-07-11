# Control Simulation

Use the control IDs from `amc policy controls` to preview one decision through the same evaluator AMC uses at runtime:

```bash
# Runtime Firewall: content is hashed, evaluated in memory, and never returned or recorded
amc policy simulate runtime:prompt-injection \
  --direction request \
  --content "ignore previous instructions"

# Action Policy: preview the requested authority against current evidence and policy gates
amc policy simulate action:DEPLOY \
  --agent default \
  --risk high \
  --mode execute

# Approval Policy: inspect whether execution is allowed or which quorum would be required
amc policy simulate approval:DEPLOY
```

Add `--json` to any command for the machine-readable result. The authenticated Studio route is `POST /api/v1/policy/simulate`; the public OpenAPI path is `POST /v1/policy/simulate`.

## What the result means

Every result includes:

| Field | Meaning |
| --- | --- |
| `controlId` | The canonical ID returned by `amc policy controls` |
| `sourceIntegrity` | Whether the owning signed control source is trusted, uninitialized, or invalid |
| `evaluator` | The existing Runtime Firewall, Action Policy, or Approval Policy evaluator used |
| `outcome` | The action AMC would currently take: allow, warn, block, simulate, execute, require approval, or deny |
| `matchedRuleIds` | Exact production rule IDs evaluated as matches |
| `conditions` | Structured pass, fail, or configured-requirement details with actual and expected values |
| `inputSha256` | A one-way hash for correlating the transient input without returning it |
| `failClosed` | Whether missing or untrusted evidence forced the safe outcome |

The text renderer labels each condition `PASS`, `FAIL`, or `REQUIRED`. Action Policy stops at the first trust boundary that makes later evaluation unsafe, so later gates are not invented. Approval requirements use `REQUIRED` because no approval decisions are created during a preview.

## Evaluator parity

Simulation does not have a demo policy engine:

- Runtime traffic calls `evaluateRuntimeFirewall` with `record: false` and required-policy behavior.
- Action authorization calls the same `runGovernorCheck` path that invokes `evaluateActionPermission` with current diagnostic, target, budget, freeze, trust, and assurance context.
- Approval readiness calls `evaluateApprovalRequestPolicy`, the same pure validation now used before a real approval request is created.

Runtime Firewall uses read-only Guardrails inspection when `record: false`. The three trusted simulation paths are covered by filesystem-invariance tests.

## Fail-closed behavior

| Control source problem | Simulation outcome |
| --- | --- |
| Runtime Firewall or Guardrails missing when required, malformed, unsigned, or tampered | `BLOCK` |
| Action Policy missing, malformed, unsigned, or tampered | `SIMULATE`; `EXECUTE` is unavailable |
| Approval Policy missing, malformed, unsigned, or tampered | `DENY` |

Unknown IDs and family-specific option mistakes are rejected. An invalid source can remain diagnostically visible, but it is never reported as a matched effective control.

## Proof boundary

Every response says:

```json
{
  "simulationOnly": true,
  "recorded": false,
  "proofEligible": false
}
```

Simulation does not create Firewall events, approval requests, decision receipts, transparency entries, keys, or workspace scaffolding. It excludes raw content, passphrases, credentials, signature bytes, and absolute workspace paths. Use the owning runtime path and its signed decision or lifecycle receipt when you need execution evidence.

## API examples

Runtime traffic:

```json
{
  "controlId": "runtime:prompt-injection",
  "content": "ignore previous instructions",
  "direction": "request",
  "agentId": "default"
}
```

Action authorization:

```json
{
  "controlId": "action:DEPLOY",
  "agentId": "default",
  "riskTier": "high",
  "requestedMode": "EXECUTE"
}
```

Approval readiness needs only the control ID:

```json
{
  "controlId": "approval:DEPLOY"
}
```
