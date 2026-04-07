# Casebooks

Casebooks are signed, deterministic sets of realistic test cases for value/safety validation.

Per agent layout:
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/casebooks/<casebookId>/casebook.yaml`
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/casebooks/<casebookId>/casebook.yaml.sig`
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/casebooks/<casebookId>/cases/<caseId>.json`
- `/Users/sid/AgentMaturityCompass/.amc/agents/<agentId>/casebooks/<casebookId>/cases/<caseId>.json.sig`

## Create Casebooks From Real Work Orders

```bash
amc casebook init --agent <agentId> --casebook default
amc casebook add --agent <agentId> --casebook default --from-workorder <workOrderId>
amc casebook list --agent <agentId>
amc casebook verify --agent <agentId> --casebook default
```

`casebook add --from-workorder` converts a real, signed work order path into a reusable deterministic case template.

## Validators

Cases use deterministic validators, for example:
- required tool actions
- forbidden audit events
- minimum correlation ratio
- receipt presence requirement

No model-based grading is used for case pass/fail.

## Signing And Verification

- casebook and case files are owner/auditor signed
- tampering invalidates verification
- unsigned/tampered casebooks are rejected during run

## Privacy Rules

Casebooks should contain redacted task inputs only.
Do not include:
- secrets
- raw credentials
- sensitive transcript dumps

Use hashes/references where possible.
