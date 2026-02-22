# Policy Packs

Policy packs are deterministic golden governance bundles keyed by archetype/risk.

## Included Pack Material
- `action-policy.yaml`
- `tools.yaml`
- `budgets.yaml`
- `alerts.yaml`
- `approval-policy.yaml`
- recommended `gatePolicy.json`
- recommended 67-question equalizer adjustments

All applied files are signed and auditable.

## Commands
- `amc policy pack list`
- `amc policy pack describe <packId>`
- `amc policy pack diff --agent <id> <packId>`
- `amc policy pack apply --agent <id> <packId>`

## Built-in Coverage
- `code-agent.low|medium|high`
- `research-agent.low|medium|high`
- `support-agent.low|medium|high`
- `devops-agent.medium|high`
- `security-agent.high|critical`

## Apply Workflow
1. Inspect deterministic diff.
2. Confirm apply in owner context.
3. AMC writes configs + signatures.
4. Transparency entry is appended.
5. Dashboard/snapshot refreshes.
